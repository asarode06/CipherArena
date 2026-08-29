import { QuoteStats } from '../models/QuoteStats.js';
import { UserQuoteInsights } from '../models/UserQuoteInsights.js';
import { UserGame } from '../game/UserGame.js';

const RECORDS_CAP = 10;
// A population of 1 has zero variance by construction (meanAndStd falls back to zScore 0), so the
// 2nd-ever solver of a quote would always land in "average" regardless of their actual time — not
// a real comparison, just a degenerate one. Requiring a few prior solves first means every z-score
// that actually gets computed reflects genuine spread, not this artifact.
const MIN_POPULATION_FOR_BUCKETING = 3;

/**
 * Buckets a z-score into one of 5 performance labels. Used by both the results page and the
 * profile's speed-profile tally — callers MUST NOT duplicate these thresholds elsewhere. See
 * docs/singleplayer-stats-plan.md §5.
 */
export function classifyPerformance(zScore) {
  if (zScore < -1.5) return 'veryFast';
  if (zScore < -0.5) return 'fast';
  if (zScore <= 0.5) return 'average';
  if (zScore <= 1.5) return 'slow';
  return 'verySlow';
}

function meanAndStd(sum, sumSq, count) {
  if (!count) return { mean: null, std: null };
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return { mean, std: Math.sqrt(Math.max(variance, 0)) };
}

/**
 * Records that a puzzle was generated, regardless of whether it's ever solved. MUST only be
 * called from the singleplayer generate-quote route, never from a multiplayer call site — see
 * docs/singleplayer-stats-plan.md §5.
 */
export async function bumpQuoteAttempt(quoteId, cipherType, solveMode) {
  await QuoteStats.updateOne(
    { quoteId, cipherType, solveMode },
    { $inc: { attempts: 1 } },
    // setDefaultsOnInsert: an insert-only $inc would otherwise leave every other field unset.
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Records a correct solve. Callers MUST only invoke this after the answer is confirmed correct —
 * a wrong guess MUST NOT reach this function. Updates QuoteStats and, for logged-in users,
 * UserQuoteInsights, via targeted single-document writes only (no scans/aggregations). Returns
 * the stats payload the results page needs.
 */
export async function bumpQuoteSolve({
  quoteId,
  cipherType,
  solveMode,
  solveTime,
  userId = null,
  author,
  plaintext,
}) {
  // Pre-solve snapshot: the population baseline for the z-score, and the source of the previous
  // record holder for the handoff below. Fields default defensively — a document MAY be missing
  // fields it wasn't written with.
  const pre = await QuoteStats.findOne({ quoteId, cipherType, solveMode }).lean();
  const previousSolves = pre?.solves ?? 0;
  const previousSum = pre?.solveTimeSum ?? 0;
  const previousSumSq = pre?.solveTimeSumSq ?? 0;
  const previousBest = pre?.bestSolveTime ?? null;
  const previousBestUserId = pre?.bestSolveUserId ?? null;

  await QuoteStats.updateOne(
    { quoteId, cipherType, solveMode },
    { $inc: { solves: 1, solveTimeSum: solveTime, solveTimeSumSq: solveTime * solveTime } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  let becameRecord = false;
  let username = null;
  let profilePicture = null;
  if (previousBest === null || solveTime < previousBest) {
    if (userId) {
      const u = await UserGame.findById(userId).select('username profilePicture').lean();
      username = u?.username ?? null;
      profilePicture = u?.profilePicture ?? null;
    }
    const result = await QuoteStats.updateOne(
      {
        quoteId,
        cipherType,
        solveMode,
        $or: [{ bestSolveTime: null }, { bestSolveTime: { $gt: solveTime } }],
      },
      {
        $set: {
          bestSolveTime: solveTime,
          bestSolveUserId: userId,
          bestSolveUsername: username,
          bestSolveProfilePicture: profilePicture,
        },
      }
    );
    becameRecord = result.modifiedCount > 0;
  }

  if (becameRecord) {
    await handleRecordHandoff({
      quoteId,
      cipherType,
      solveMode,
      solveTime,
      author,
      plaintext,
      newHolderId: userId,
      oldHolderId: previousBestUserId,
    });
  }

  // Below MIN_POPULATION_FOR_BUCKETING prior solves, there isn't a real population to compare
  // against yet — skip bucketing entirely (no performanceBucket shown on the results page for
  // this solve, no contribution to UserQuoteInsights) rather than compute a low-confidence one.
  // This gate covers both together deliberately: showing a "Very Fast!" badge that then silently
  // doesn't count toward the solver's Speed Profile would be a confusing mismatch.
  let performanceBucket = null;
  if (previousSolves >= MIN_POPULATION_FOR_BUCKETING) {
    const { mean, std } = meanAndStd(previousSum, previousSumSq, previousSolves);
    const zScore = std > 0 ? (solveTime - mean) / std : 0;
    performanceBucket = classifyPerformance(zScore);

    if (userId) {
      await UserQuoteInsights.updateOne(
        { _id: userId },
        { $inc: { [`speedBuckets.${performanceBucket}`]: 1, zScoreSum: zScore, zScoreCount: 1 } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
  }

  const solves = previousSolves + 1;
  const attempts = pre?.attempts ?? 0;
  const bestSolveTime = becameRecord ? solveTime : previousBest;
  const bestSolveUsername = becameRecord ? username : (pre?.bestSolveUsername ?? null);
  const bestSolveProfilePicture = becameRecord
    ? profilePicture
    : (pre?.bestSolveProfilePicture ?? null);
  // One bucket = one plaintext, so raw solveTime is already comparable across solvers — no
  // per-character length normalization, unlike the profile's cross-quote histogram. Post-solve
  // population (includes this solve): the results page bell curve is the normal approximation of
  // this mean/std, not a plot of raw samples.
  const { mean: averageSolveTime, std: stdSolveTime } = meanAndStd(
    previousSum + solveTime,
    previousSumSq + solveTime * solveTime,
    solves
  );

  return {
    attempts,
    solves,
    successRate: attempts > 0 ? Math.min(1, solves / attempts) : 0,
    averageSolveTime,
    stdSolveTime,
    bestSolveTime,
    bestSolveUsername,
    bestSolveProfilePicture,
    // Explicit flag: the client floors its own copy of the time for display, so
    // `bestSolveTime === yourTime` would not reliably match.
    isNewRecord: becameRecord,
    yourTime: solveTime,
    performanceBucket,
    avgDifficulty: pre?.difficultyCount > 0 ? pre.difficultySum / pre.difficultyCount : null,
    difficultyCount: pre?.difficultyCount ?? 0,
  };
}

async function handleRecordHandoff({
  quoteId,
  cipherType,
  solveMode,
  solveTime,
  author,
  plaintext,
  newHolderId,
  oldHolderId,
}) {
  const sameUser = newHolderId && oldHolderId && String(newHolderId) === String(oldHolderId);

  if (newHolderId) {
    // $pull then $push: MongoDB rejects two operators on the same array path in one update.
    // Pulling first avoids a duplicate entry when a user beats their own record.
    await UserQuoteInsights.updateOne(
      { _id: newHolderId },
      { $pull: { records: { quoteId, cipherType, solveMode } } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await UserQuoteInsights.updateOne(
      { _id: newHolderId },
      {
        $push: {
          records: {
            $each: [
              {
                quoteId,
                cipherType,
                solveMode,
                time: solveTime,
                author: author ?? '',
                snippet: (plaintext ?? '').slice(0, 60),
                setAt: new Date(),
              },
            ],
            $slice: -RECORDS_CAP,
          },
        },
        ...(sameUser ? {} : { $inc: { recordCount: 1 } }),
      },
      // upsert is defensive only — the prior call already ensures this document exists.
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  if (oldHolderId && !sameUser) {
    // No upsert: a non-null oldHolderId MUST already have a document, set by the `if
    // (newHolderId)` branch on their own record-setting solve. If that invariant ever breaks,
    // this just no-ops.
    await UserQuoteInsights.updateOne(
      { _id: oldHolderId },
      { $pull: { records: { quoteId, cipherType, solveMode } }, $inc: { recordCount: -1 } }
    );
  }
}
