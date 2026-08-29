import { json } from '@sveltejs/kit';
import { QuoteStats } from '$models/QuoteStats';
import { decryptToken } from '$utils/textEncode.js';

/**
 * Difficulty rating for a just-solved cryptogram (docs/singleplayer-stats-plan.md §4). Not tied
 * to any account — logged in or not, anyone can submit a rating. "Once" is enforced client-side
 * only; ratings are not attributed to a user, so there is nothing to dedupe server-side.
 */
export async function POST({ request }) {
  try {
    const req = await request.json();

    const rating = Number(req['rating']);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: 'Invalid rating' }, { status: 400 });
    }

    const quoteId = decryptToken(req['id']);
    if (!quoteId) return json({ error: 'Invalid id' }, { status: 400 });

    const cipherType = req['cipherType'];
    const solveMode = req['solveMode'];
    if (!cipherType || !solveMode) {
      return json({ error: 'Invalid query' }, { status: 400 });
    }

    // A document for this triple should already exist (rating only happens post-solve); upsert
    // is defensive. setDefaultsOnInsert keeps an unexpected insert fully-shaped.
    const stats = await QuoteStats.findOneAndUpdate(
      { quoteId, cipherType, solveMode },
      { $inc: { difficultySum: rating, difficultyCount: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return json({
      avgDifficulty: stats.difficultyCount > 0 ? stats.difficultySum / stats.difficultyCount : null,
      difficultyCount: stats.difficultyCount,
    });
  } catch (error) {
    console.error('Error rating quote:', error);
    return json({ error: 'error' }, { status: 500 });
  }
}
