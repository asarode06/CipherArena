import mongoose from 'mongoose';

/**
 * Denormalized per-user singleplayer insights (docs/singleplayer-stats-plan.md §8). MUST NOT live
 * on UserGame: UserGame is rewritten constantly by multiplayer socket/game events
 * (ws/connectionHandler.js, joinGame.js), and this data is unrelated to that traffic. `_id` is the
 * user's id, so every read is a point-read by primary key — never a query or scan. Written by
 * shared-server/utils/quoteStatsUtil.js.
 */
const UserQuoteInsightsSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAuth',
      required: true,
    },

    // Total records currently held. Incremented/decremented only at hand-off time — never
    // recomputed by scanning.
    recordCount: { type: Number, default: 0 },

    // Capped list (last 10 — see quoteStatsUtil.js's RECORDS_CAP) for display. author/snippet are
    // denormalized here so rendering needs no additional queries.
    records: {
      type: [
        {
          quoteId: { type: mongoose.Schema.Types.ObjectId, required: true },
          cipherType: { type: String, required: true },
          solveMode: { type: String, required: true },
          time: { type: Number, required: true },
          author: { type: String, default: '' },
          snippet: { type: String, default: '' },
          setAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // Speed Profile: z-score of each solve vs. that quote's population at solve time, bucketed.
    // Excludes a quote's first few solves — see quoteStatsUtil.js's MIN_POPULATION_FOR_BUCKETING.
    speedBuckets: {
      veryFast: { type: Number, default: 0 },
      fast: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      slow: { type: Number, default: 0 },
      verySlow: { type: Number, default: 0 },
    },
    zScoreSum: { type: Number, default: 0 },
    zScoreCount: { type: Number, default: 0 },
  },
  { collection: 'user_quote_insights' }
);

// No index on `records.*`: nothing queries into that array; every access is by `_id`.

export const UserQuoteInsights =
  mongoose.models.UserQuoteInsights || mongoose.model('UserQuoteInsights', UserQuoteInsightsSchema);
