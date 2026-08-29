import { json } from '@sveltejs/kit';
import { generateQuote } from '$game/generateQuote';
import { authenticate } from '$utils/authenticate';
import { incrementTotal } from '$utils/statsUtil.js';
import { bumpQuoteAttempt } from '$utils/quoteStatsUtil.js';
import { decryptToken } from '$utils/textEncode.js';
import { cipherTypes } from '$shared/CipherTypes';
import { start_mongo } from '$services/mongo.js';

export async function POST({ request, cookies }) {
  try {
    await start_mongo();

    const params = await request.json();
    const quoteData = await generateQuote(params);

    const auth = authenticate(cookies.get('auth-token'));

    if (auth?.id) {
      await incrementTotal(auth.id, params.cipherType);
    }

    // Attempt tracking is singleplayer-only (docs/singleplayer-stats-plan.md §5); generateQuote()
    // MUST stay untouched since multiplayer call sites share it, so quoteId is recovered from the
    // already-encrypted response token instead. The guard mirrors validate-quote's — an invalid
    // cipherType would already have thrown above, but this avoids depending on that as an implicit
    // invariant.
    const quoteId = decryptToken(quoteData.id);
    if (
      quoteId &&
      cipherTypes[params.cipherType] &&
      (params.Solve === 'Decode' || params.Solve === 'Encode')
    ) {
      await bumpQuoteAttempt(quoteId, params.cipherType, params.Solve);
    }

    return json(quoteData);
  } catch (err) {
    console.error('Error generating quote:', err);
    return json({ error: 'Failed to generate quote' }, { status: 500 });
  }
}
