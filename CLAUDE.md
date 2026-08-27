# Cipher Arena

Real-time multiplayer web app where players race to solve cryptograms (Aristocrat, Caesar,
Affine, Porta, Baconian, Nihilist, Hill, Checkerboard, Xenocrypt, Fractionated Morse, etc).
See [README.md](README.md) for the player-facing feature list.

## Tech stack

- **Frontend**: SvelteKit (Svelte 5), Sveltestrap, Chart.js
- **Backend**: Node.js, Express, Socket.IO
- **Data**: MongoDB via Mongoose, Redis (rate limiting / ephemeral state)
- **Auth/Storage**: JWT + Argon2/bcrypt, AWS S3 (profile pictures)
- **Deploy**: Fly.io, via `Dockerfile` / `buildServer.js`
- **Misc**: a Python subprocess (`python-shell`) generates/checks math practice problems for
  math-heavy ciphers (Affine, Hill) — see "Python bot" below.

## Commands

- `npm run dev` — start SvelteKit dev server
- `npm run build` — `vite build` then `buildServer.js` bundles the Node server
- `npm start` — run the built server (`dist/server.js`)
- `npm run format` / `format:check` — Prettier
- **No test suite exists in this repo** (no `*.test.*`/`*.spec.*` files, no `test` script). Don't
  assume `npm test` works, and don't invent tests unless asked — correctness for cipher logic is
  currently verified manually/by inspection only.
- Formatting is auto-applied on commit via Husky (`.husky/pre-commit` → `lint-staged` →
  Prettier). Don't hand-wrap/format diffs — the hook will reformat on commit anyway.

## Repo structure

- `src/` — SvelteKit app (routes, Svelte components, browser-side utils in `src/lib/util`).
- `src/lib/server/` — SvelteKit-only server code (e.g. rate limiter) used inside `+server.js`/
  `+page.server.js` endpoints.
- `shared-server/` — Node code shared between the SvelteKit server process **and** the standalone
  Socket.IO server (`server/index.js`). Cipher logic, game/DB models, auth, and the Python bot
  bridge all live here specifically because both processes need them. Import aliases: `$shared`,
  `$game`, `$utils` (see `jsconfig.json`) map into this directory.
- `server/index.js` — standalone Express + Socket.IO process (real-time game/lobby traffic).
- `ws/wsUtil.js` — websocket helpers.
- `shared-server/bots/codebusters/` — Python package for generating/checking math practice
  problems, invoked over stdio by `shared-server/bots/botService.js`.

When adding backend logic, ask "does SvelteKit need this AND does the socket server need this?" —
if yes, it belongs in `shared-server/`, not `src/lib/server/`.

## The cipher subsystem — adding a new cipher

The **single source of truth** is `shared-server/shared/CipherTypes.js` — a `cipherTypes` map
keyed by display name. Everything else (Mongoose enum, quote generation, frontend routing/addon
UI, solvability checks) derives from this object's keys, so most of the wiring is automatic once
an entry exists. Fields per cipher:

| field             | meaning                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `directMap`       | true = one ciphertext letter always maps to one plaintext letter (classic substitution); drives input-linking behavior in the UI                                                                             |
| `keys`            | ordered list of key names the cipher needs (e.g. `['keyword', 'polybius key']`); `'!'` = internal key, hidden from the player; `[]` = no key                                                                 |
| `addOn`           | which helper table/UI component `Cipher.svelte` renders below the puzzle (see below)                                                                                                                         |
| `spacing`         | how ciphertext is chunked into "words" for display (`-1` = use original spacing)                                                                                                                             |
| `length`          | `[min, max]` plaintext character-length range used to pick a quote from Mongo                                                                                                                                |
| `options`         | game-setup dropdown choices (e.g. `Solve`/`Encode`/`Decode`); `!` prefix hides an option from the frontend                                                                                                   |
| `letterGap`       | whether solved chunks need extra visual gap (used by non-letter-mapped ciphers like Baconian)                                                                                                                |
| `bypassCheck`     | true = don't require single-letter chunks for "solvable" (multi-char ciphertext units, e.g. Baconian symbols, Nihilist coordinate pairs)                                                                     |
| `stackKey`        | true = overlay a repeating keyword above each ciphertext letter (Porta, Nihilist)                                                                                                                            |
| `symbolSource`    | `'alphabet'` (default) or `'ciphertext'` — where the shared letter-input bank (`letterInputs`/`letterFocus`, FreqTable's rows) draws its symbols from. Only matters for `directMap: true` ciphers; see below |
| `letterComponent` | `'default'` or a key registered in `Cipher.svelte`'s `LETTER_COMPONENTS` map — which widget renders each ciphertext position; see below                                                                      |

### How solving is validated — no decoder needed

There's no `decodeQuote` function. `src/routes/api/validate-quote/+server.js` checks a Decode-mode
answer by comparing the player's input directly to `stripQuote(originalPlaintext)` — the stored
plaintext, uppercased and stripped of spaces/punctuation. For Encode mode, it re-runs
`encodeQuote` on the plaintext and compares against the player's input. **This means a new cipher
only needs an _encoder_, never a decoder.** This holds even for the most complex cipher
(Fractionated Morse) — the UI collects per-letter guesses into one flat string via the same
generic `getInputText(info.inputs)` regardless of how exotic the input widget is, so the
validation endpoint never needs to know a cipher's internals.

### The letter-input bank (`symbolSource`) and per-position widget (`letterComponent`)

Two `cipherTypes` fields exist specifically so a new cipher's frontend needs can be expressed as
config instead of another hardcoded `cipherType === 'X'` branch (see "Escape hatches" for what's
still hardcoded):

- **`symbolSource`**. For `directMap: true` ciphers, a guess typed for one occurrence of a
  ciphertext symbol is shared across every other occurrence of that symbol — that shared state
  lives in `info.letterInputs`/`info.letterFocus` (built by `initLetterInputs`/`initLetterFocus`
  in `cipherUtils.js`), and it's what `FreqTable.svelte` renders rows from. `symbolSource:
'alphabet'` (the default) builds that bank from the fixed 26/27-letter alphabet, so every letter
  shows even if unused — right for classic substitution (Aristocrat/Xenocrypt/Patristocrat).
  `symbolSource: 'ciphertext'` instead builds it from the distinct solvable symbols actually
  present in that quote's `cipherTextTrim` — use this when a direct-map cipher's symbol set isn't
  the 26-letter alphabet (e.g. homophonic substitution, where a plaintext letter may have several
  possible numeric codes and the bank needs one entry per _code_, not per letter). This only
  matters for `directMap: true` ciphers — non-direct ciphers store each position's answer directly
  on its DOM input element instead (`onChange` in `Cipher.svelte`) and never read this bank.
- **`letterComponent`**. `Cipher.svelte` resolves `LETTER_COMPONENTS[cipherTypes[cipherType]
['letterComponent']]` to decide what renders each ciphertext position — `'default'` → the
  generic `Letter.svelte` (a single text input); any other key must be added to the
  `LETTER_COMPONENTS` map (currently `'baconian'` → `BaconianLetter.svelte`, `'morse'` →
  `MorseLetter.svelte`) and points at a bespoke widget for ciphers whose ciphertext units aren't
  single typed letters. Registering a new one is a two-step: add the `letterComponent` value in
  `CipherTypes.js`, and add the matching entry to `LETTER_COMPONENTS` in `Cipher.svelte`.

### Cipher archetypes — find the closest one to copy, don't start from scratch

Having read all ~12 implementations, they cluster into a handful of patterns. Identify which your
new cipher resembles and copy _that_ one's plumbing — most of the "adding a cipher" work is
picking the right template, not inventing new mechanics.

1. **Plain substitution with a frequency table** — Aristocrat, Xenocrypt, Patristocrat.
   `directMap: true`, `addOn: 'freqTable'`, hidden key (`'!'`), and an `options: ['K', '!Random',
'1','2','3']` param controlling _which_ substitution alphabet is generated
   (`freqTableInit` in `CipherUtil.js`: `0`=fully random, `1`/`2`=keyword+shift variants,
   `3`=double-shifted). **Patristocrat has no encoder of its own** — `generateQuote.js` literally
   maps `cipherType: 'Patristocrat' → 'Aristocrat'` before calling `encodeQuote`, so the entire
   distinction between Aristocrat and Patristocrat is _display spacing_ (`spacing: -1` keeps
   natural word breaks vs `spacing: 5` regroups into fixed-width blocks) plus a longer `length`
   range — not cipher logic. Xenocrypt is the same as Aristocrat but Spanish
   (`SPANISH_ALPHABET`, grapheme-aware iteration via `GraphemeSplitter` since `Ñ` etc. need it,
   and `getQuoteModel.js` routes it to the `SpanishQuote` Mongo collection instead of `Quote`).
2. **Simple fixed-table substitution, no key** — Atbash, Caesar. `keys: []`, `addOn` is a purely
   _static, read-only_ reference table component (`AtbashTable.svelte`, `CaesarTable.svelte` —
   just a rendered lookup table, no inputs, no props). The encoder is a few lines of modular
   arithmetic. If your new cipher has no key and a fixed transform, this is the template.
3. **Math-based, `mathAddOn`** — Affine, Hill. Share `addOn: 'mathAddOn'`, which always renders
   `CaesarTable` (a 0–25 reference) plus a _scratchpad_ calculator input
   (`AffineInput.svelte`/`MatrixInput.svelte` — these are UI-only work-shown widgets; their values
   are **never read or validated**, they don't feed `checkQuote` at all) and, if solving in Decode
   mode, `DeterminantTable.svelte`. Which scratchpad renders is **hardcoded in `Cipher.svelte`**
   by `cipherType == 'Hill'`, not by config. Both are also in `MATH_INTENSIVE_CIPHERS`
   (`src/lib/util/constants.js`), which just toggles visibility of the in-game `Calculator.svelte`
   popup — unrelated to the math-work scratchpad. `generateQuote.js` has bespoke key-generation
   branches for both (`Affine` picks a coprime-with-26 `a` and any `b`; `Hill` rejects keys whose
   determinant is even/divisible-by-13/non-invertible mod 26 via `findDeterminant`).
4. **Keyword overlay (`stackKey: true`)** — Porta, Nihilist. The repeating keyword is drawn above
   each ciphertext letter (`initLettersWithIndices` in `cipherUtils.js` computes `keyLetter` per
   char). Porta's `addOn` is a static reference table; Nihilist's (`polybiusSquare`) is an
   **interactive fill-in grid** the player builds themselves (`PolybiusSquare.svelte` — 5×5 text
   inputs with arrow-key navigation) — nothing in `cipherTypes` distinguishes "static reference
   table" from "interactive input grid"; that's just which component the `addOn` name happens to
   point to.
5. **Coordinate/Polybius ciphers, `bypassCheck: true`** — Nihilist, Checkerboard. Ciphertext units
   are multi-digit/multi-char (e.g. `"34"` or a row+col letter pair), so `isSolvableChunk` can't
   require length-1 chunks — `bypassCheck: true` turns that check into "non-empty" instead.
   Checkerboard's `keys` is `['!', '!', 'polybius key']` — two _hidden_ internal keys (the
   row/column header letters) plus one visible one; its square-builder
   (`CheckerboardTable.svelte`) is PolybiusSquare's layout with extra `-1`-indexed header inputs
   for the player to fill in their own row/col labels. Both also need
   `clearQuote()` in `Cipher.svelte` to reset their grid — that reset is **hardcoded**
   (`if (cipherType == 'Nihilist' || cipherType == 'Checkerboard') clearPolybius = true`), not
   config-driven; a new interactive-grid cipher needs the same kind of explicit hook.
6. **Custom per-letter input widget** — Baconian. This is the biggest divergence from the norm:
   it sets `letterComponent: 'baconian'` so `Cipher.svelte` renders `BaconianLetter.svelte`
   instead of the generic `Letter.svelte`, parallel to (not driven by) `addOn`. Baconian
   ciphertext isn't fixed-alphabet substitution: `encodeBaconian` in `CipherUtil.js` randomly
   picks one of several _symbol-set families_ per quote (dots/dashes, digits, emoji, accented
   letters via combining Unicode marks, punctuation) and encodes each plaintext letter as a
   5-symbol A/B pattern from `baconianMap`. `BaconianLetter` renders that as 5 clickable A/B
   toggle buttons the player flips, not a text input.
7. **Most divergent — Fractionated Morse.** Also uses a custom widget
   (`letterComponent: 'morse'` → `MorseLetter.svelte`) instead of `Letter.svelte`. Its `keys` field is
   repurposed: index 0 (`'!'`) is the hidden keyed-alphabet seed, but index 1
   (`'quote starts with'`) is **not a key at all** — it's a crib string
   (`cribPlaintext`) computed _by the encoder_ and injected back into `keys[1]` by
   `generateQuote.js` after encoding. `encodeFractionatedMorse` is the only encoder that doesn't
   return a flat `string[]` — it returns `{ ciphertext, cribPlaintext, letterToTrigram }`, and
   `generateQuote.js` has a dedicated branch to unpack that shape (every other cipher's result is
   used as-is). `generateQuote.js` also force-runs the encoder for this cipher even when
   `Solve !== 'Decode'`, since Fractionated Morse never offers an Encode mode. On the frontend, a
   `slotDistribution` value (`$derived.by` in `Cipher.svelte`) maps the trigram/morse stream to
   input-slot positions per letter, because one plaintext letter's input can span a
   variable-width run of trigram slots plus word-separator slots — nothing else in the app has
   this many-ciphertext-slots-per-plaintext-letter relationship.

### Step-by-step checklist

1. **Pick an archetype above** that matches your cipher's shape and keep its files open as a
   reference while you work.
2. **Register the cipher** in `cipherTypes` (`shared-server/shared/CipherTypes.js`) with the
   fields from the table above. This alone makes it a valid `cipherType` everywhere (Mongoose enum
   in `shared-server/game/Game.js`, the `/singleplayer/[cipherType]` route guard, etc. — all
   derive from `Object.keys(cipherTypes)`).
3. **Write the encoder** in `shared-server/shared/CipherUtil.js`: add a function (follow the
   existing `encodeXxx(plaintext, ...keys)` pattern — iterate letters via `isLetter`/
   `letterToNumber`/`numberToLetter`, or `getSplitter().splitGraphemes()` if Spanish/multi-char
   support is needed), then register it in the `encoders` map inside `encodeQuote()`. It must
   return a flat array/string of ciphertext chunks unless you're deliberately doing something as
   unusual as Fractionated Morse (in which case `generateQuote.js` needs a matching unpack branch).
4. **Key generation**: if the cipher needs a random keyword/value, add a branch in
   `shared-server/game/generateQuote.js` (see the `Affine`/`Hill`/`Checkerboard` special cases —
   most ciphers just pull a random `Word` from Mongo, but math ciphers need numeric constraints).
5. **Frontend addon UI**: reuse an existing `addOn` value if one fits, or add a new one: create the
   Svelte component (pattern: `src/lib/Components/Game/*Table.svelte` for static reference tables
   or interactive grids, `*Input.svelte` for scratchpad-only work-shown widgets), then add an
   `{:else if}` branch in `src/lib/Components/Game/Cipher.svelte` keyed on
   `cipherTypes[cipherType]['addOn']`.
6. **Custom letter-input widget?** Only needed if ciphertext units aren't single alphabet
   characters the player types directly (see Baconian/Fractionated Morse above). If so, build a
   `*Letter.svelte` component, add it to the `LETTER_COMPONENTS` map in `Cipher.svelte`, and set
   `letterComponent` to that key in `CipherTypes.js`.
7. **More than 26 possible ciphertext symbols for a `directMap: true` cipher?** Set
   `symbolSource: 'ciphertext'` so the shared letter-input bank is built from the symbols actually
   present in the quote instead of the fixed alphabet (see "The letter-input bank" above).
8. **Interactive grid that needs clearing?** If your addon is a fill-in grid (like
   Nihilist/Checkerboard's Polybius squares), add your cipher to the hardcoded
   `clearQuote()` check in `Cipher.svelte` so "Clear" resets it.
9. **Spanish support**: only needed if the cipher should support Xenocrypt-style Spanish quotes —
   otherwise skip (`getQuoteModel.js` already special-cases `Xenocrypt` → `SpanishQuote` model;
   a new Spanish cipher would need the same branch).
10. **Math practice bot** (optional): only relevant if the cipher is math-based like Affine/Hill.
    `MATH_INTENSIVE_CIPHERS` in `src/lib/util/constants.js` and the Python generators in
    `shared-server/bots/codebusters/` (`GENERATORS` dict in `__main__.py`) provide practice-problem
    generation, separate from the actual cipher encode/decode flow.
11. **Add to README's cipher table** for player-facing docs (not required for the app to work, but
    keep it in sync).
12. **No automated tests exist** — manually verify by playing the cipher in singleplayer mode
    (`/singleplayer/<CipherName>`) in both Decode and Encode (if enabled), including edge cases
    around punctuation/spacing/case.

### Escape hatches — logic that is NOT driven by `CipherTypes.js`

The config object covers most wiring, but these are hardcoded per-`cipherType` checks scattered
in the code that a new cipher may need to be added to explicitly:

- `Cipher.svelte`'s `slotDistribution` `$derived.by`: Fractionated-Morse-only trigram/slot layout
  math.
- `Cipher.svelte`'s `clearQuote()`: `cipherType == 'Nihilist' || cipherType == 'Checkerboard'`
  resets their interactive Polybius grids. (Candidate for the same treatment as
  `letterComponent` below if a third interactive-grid cipher shows up — not done yet since only
  two ciphers need it today.)
- `Cipher.svelte`'s addon block: `cipherType == 'Hill'` picks `MatrixInput` vs `AffineInput` even
  though both share `addOn: 'mathAddOn'`.
- `generateQuote.js`: `cipherType === 'Patristocrat' → 'Aristocrat'` remap before encoding;
  `cipherType === 'Fractionated Morse'` forces encoding regardless of `Solve`; a dedicated branch
  unpacks Fractionated Morse's non-array encoder return shape into `encodedQuote`/`keys[1]`; the
  `Affine`/`Hill`/`Checkerboard` key-generation special cases.
- `getQuoteModel.js`: `cipherType === 'Xenocrypt'` routes to the Spanish quote collection.
- `src/lib/util/constants.js`: `MATH_INTENSIVE_CIPHERS` array gates the in-game calculator popup.

**Already generalized (no longer hardcoded):** which per-position input widget renders
(`Cipher.svelte` used to branch on `cipherType === 'Baconian'`/`'Fractionated Morse'` directly in
the template; now it resolves `letterComponent` through the `LETTER_COMPONENTS` map — see "The
letter-input bank" above), and the letter-input bank's symbol set (`initLetterInputs`/
`initLetterFocus` used to always build from the fixed alphabet; now driven by `symbolSource`).

### Python bot process

`shared-server/bots/botService.js` spawns `shared-server/bots/codebusters_bot_server.py` once
(pooled worker processes) and talks to it over stdio as line-delimited JSON. It only handles math
practice-problem generation/checking (`generate`/`check`/`ping`/`stats` actions) — it does **not**
solve or decode ciphers for game opponents. Auto-shuts-down after 30 min idle.

## Conventions

- Formatting/linting is enforced by Husky + lint-staged + Prettier on every commit — don't spend
  effort hand-formatting.
- Cipher-specific letter/number helpers (`isLetter`, `letterToNumber`, `numberToLetter`,
  `stripQuote`) live in `CipherUtil.js` and are alphabet-aware (`ENGLISH_ALPHABET` vs
  `SPANISH_ALPHABET`) — reuse them rather than hand-rolling char math in a new encoder.
