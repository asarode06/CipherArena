import { json } from '@sveltejs/kit';
import { getQuoteModel } from '$game/getQuoteModel';
import { ObjectId } from 'mongodb';
import { stripQuote, encodeQuote } from '$shared/CipherUtil';
import { authenticate } from '$utils/authenticate';
import { cipherTypes } from '$shared/CipherTypes';
import { incrementWin } from '$utils/statsUtil.js';
import { bumpQuoteSolve } from '$utils/quoteStatsUtil.js';
import { decryptToken } from '$utils/textEncode.js';

// Some Quote/SpanishQuote documents store a literal `""` (or blank/whitespace) in `author` rather
// than leaving it null — a source-data quirk, not a valid author. Normalized once here so no
// downstream consumer (the response, or the denormalized UserQuoteInsights.records) needs to
// special-case it.
function normalizeAuthor(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return null;
  return trimmed;
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, cookies }) {
  try {
    const req = await request.json();

    if (req['input'].includes(' ')) return json(false);

    const quoteId = decryptToken(req['id']);
    if (!quoteId) return json(false);

    const QuoteModel = getQuoteModel(req['cipherType']);
    const quote = await QuoteModel.findOne({ _id: new ObjectId(quoteId) }).select('text author');
    if (!quote) return json(false);

    let ansText = stripQuote(quote['text'], req['cipherType'] === 'Xenocrypt');

    if (req['solve'] === 'Encode') {
      ansText = encodeQuote(ansText, req['cipherType'], req['keys']).join('');
    }

    const isCorrect = req['input'] === ansText;
    if (!isCorrect) return json(false);

    const auth = authenticate(cookies.get('auth-token'));
    const solveTime = req['solveTime'];
    const length = ansText.length;
    const author = normalizeAuthor(quote['author']);

    if (auth?.id && cipherTypes[req['cipherType']] && typeof solveTime === 'number') {
      await incrementWin(auth.id, req['cipherType'], solveTime, length);
    }

    // Reached only once isCorrect is true — a wrong guess never touches QuoteStats. This route
    // MUST remain singleplayer-only (multiplayer uses the `check-quote` websocket event instead).
    // `cipherType`/`solve` are client-controlled and are not cross-checked against what this
    // `hash` was actually generated as — a pre-existing gap, not introduced here (see
    // docs/singleplayer-stats-plan.md). The guard below keeps QuoteStats from being written with
    // invalid values; it does not close that gap.
    let stats = null;
    const solveMode = req['solve'];
    if (
      typeof solveTime === 'number' &&
      cipherTypes[req['cipherType']] &&
      (solveMode === 'Decode' || solveMode === 'Encode')
    ) {
      stats = await bumpQuoteSolve({
        quoteId,
        cipherType: req['cipherType'],
        solveMode,
        solveTime,
        userId: auth?.id ?? null,
        author,
        plaintext: quote['text'],
      });
    }

    return json({
      solved: true,
      plaintext: quote['text'],
      author,
      stats,
    });
  } catch (error) {
    console.error('Error validating quote:', error);
    return json('error');
  }
}
