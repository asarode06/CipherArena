import mongoose from 'mongoose';

/**
 * Cross-user singleplayer stats for one cryptogram, keyed by (quoteId, cipherType, solveMode)
 * rather than literal ciphertext — keyed ciphers randomize their key per generation, so two plays
 * of the same quote rarely share ciphertext. See docs/singleplayer-stats-plan.md §2. Kept separate
 * from Quote/SpanishQuote so solve/attempt writes never touch the hot quote-selection collection.
 */
const QuoteStatsSchema = new mongoose.Schema(
  {
    quoteId: { type: mongoose.Schema.Types.ObjectId, required: true },
    cipherType: { type: String, required: true },
    solveMode: { type: String, required: true, enum: ['Decode', 'Encode'] },

    // Incremented on every /api/generate-quote call for this triple, regardless of outcome.
    attempts: { type: Number, default: 0 },
    // Incremented only on a correct /api/validate-quote submission.
    solves: { type: Number, default: 0 },

    // Only stored distribution data. The results page's bell curve is the normal-approximation
    // PDF of their derived mean/stdev — not a plot of raw samples.
    solveTimeSum: { type: Number, default: 0 },
    solveTimeSumSq: { type: Number, default: 0 },
    bestSolveTime: { type: Number, default: null },
    bestSolveUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserAuth', default: null },
    bestSolveUsername: { type: String, default: null },
    // Denormalized alongside bestSolveUsername (same UserGame lookup, no extra query) — a
    // snapshot as of record time, same staleness tradeoff already accepted for the username.
    bestSolveProfilePicture: { type: String, default: null },

    difficultySum: { type: Number, default: 0 },
    difficultyCount: { type: Number, default: 0 },
  },
  { collection: 'quote_stats' }
);

QuoteStatsSchema.index({ quoteId: 1, cipherType: 1, solveMode: 1 }, { unique: true });

export const QuoteStats =
  mongoose.models.QuoteStats || mongoose.model('QuoteStats', QuoteStatsSchema);
