# Homophonic Cipher — Implementation Plan

Status: **plan only, no code written yet.** Written for review before implementation starts on
`cipher/homophonic`.

## 1. What this cipher is

A 4-letter keyword (distinct letters, drawn from a curated word list) generates a table mapping
every letter of the alphabet to **4 possible 2-digit numeric codes** (its "homophones"). Encoding
picks a random homophone per occurrence, which flattens ciphertext frequency and defeats simple
frequency analysis. The player is **not given the keyword** — only 2–3 of its 4 letters, either
with their position revealed or without — and must recover the rest via pattern/frequency
deduction against the ciphertext, same as the reference site's rules describe.

## 2. Encoding algorithm

Confirmed with you: this is the ACA/Codebusters construction.

1. Build the **merged alphabet**: A B C D E F G H **IJ** K L M N O P Q R S T U V W X Y Z — 25
   units, with I and J sharing one unit.
2. The keyword has 4 letters, `k0 k1 k2 k3` (distinct; if the keyword contains I or J, treat it as
   the merged `IJ` unit). Each letter seeds one **block**:
   - block 0 → numbers `01`–`25`
   - block 1 → numbers `26`–`50`
   - block 2 → numbers `51`–`75`
   - block 3 → numbers `76`–`99`, then `00` for the 100th
3. For block _b_, rotate the 25-unit merged alphabet so it **starts at `k_b`**, then assign that
   block's 25 numbers to the rotated sequence in order.
4. After all 4 blocks are built, every one of the 25 merged units (so every letter, with I/J
   sharing) has accumulated **exactly 4 numbers**, one from each block.
5. To encode a plaintext letter: look up its merged unit's 4 numbers, pick one **uniformly at
   random** per occurrence, output as a zero-padded 2-digit string.

### Worked example — keyword `SWAY`

Merged alphabet: `A B C D E F G H IJ K L M N O P Q R S T U V W X Y Z`

- Block 0 (`01–25`), starts at **S**: `S T U V W X Y Z A B C D E F G H IJ K L M N O P Q R`
  → S=01, T=02, U=03, V=04, W=05, X=06, Y=07, Z=08, A=09, B=10, C=11, D=12, E=13, F=14, G=15,
  H=16, IJ=17, K=18, L=19, M=20, N=21, O=22, P=23, Q=24, R=25
- Block 1 (`26–50`), starts at **W**: W=26, X=27, Y=28, Z=29, A=30, B=31, C=32, D=33, E=34, F=35,
  G=36, H=37, IJ=38, K=39, L=40, M=41, N=42, O=43, P=44, Q=45, R=46, S=47, T=48, U=49, V=50
- Block 2 (`51–75`), starts at **A**: A=51, B=52, C=53, D=54, E=55, F=56, G=57, H=58, IJ=59,
  K=60, L=61, M=62, N=63, O=64, P=65, Q=66, R=67, S=68, T=69, U=70, V=71, W=72, X=73, Y=74, Z=75
- Block 3 (`76–00`), starts at **Y**: Y=76, Z=77, A=78, B=79, C=80, D=81, E=82, F=83, G=84, H=85,
  IJ=86, K=87, L=88, M=89, N=90, O=91, P=92, Q=93, R=94, S=95, T=96, U=97, V=98, W=99, X=00

So e.g. **E** → homophones `{13, 34, 55, 82}`, and every occurrence of E in the plaintext gets a
random one of those four. **I** and **J** share `{17, 38, 59, 86}` — the ciphertext genuinely
cannot distinguish I from J; the solver resolves that the same way real cryptogram solvers do, via
spelling/context (e.g. only "JOB" is a word, not "IOB"). This is expected behavior, not a bug —
worth calling out in code comments so it isn't "fixed" later by mistake.

## 3. The crib (keyword-letter reveal) system

**Curated keyword list.** A new fixed array of common 4-letter English words with 4 distinct
letters (I'll seed this with ~100–150 words; easy to extend later). Every generated quote picks
its keyword from this list — never an arbitrary 4-letter string — because a real, recognizable
word is what makes the crib meaningful to a human at all, independent of anything below.

**Why the crib doesn't need a computed solvability guarantee.** Within one block, a single
correctly-identified letter↔number correspondence fully determines that _entire_ block — a block
is just the alphabet rotated to start at one keyword letter, so one confirmed mapping (found via
ordinary frequency/pattern analysis on the ciphertext, e.g. spotting a repeated 3-letter run that's
probably "THE") reveals the whole rotation, and therefore all 25 letters in that block at once.
That's the same mechanism that already makes Aristocrat solvable with _zero_ given key — the
ciphertext's own structure does the real work, not the crib. So, like every other cipher in this
app, Homophonic's solvability isn't a per-quote computed guarantee — it's an emergent property of
adequate ciphertext length (`length: [90, 130]`, already longer than Aristocrat's) and real English
text, the same trust model this codebase already uses everywhere else.

Given that, the two reveal modes aren't equally "safe" the way I first assumed, which is worth
knowing even though we're not verifying it computationally:

- **Ordered** (position given): revealing "1st letter is S" doesn't just hint at a letter — it
  hands over _the entire block 0_ immediately (25 of 100 codes), since position pins the block
  outright. A generous head start.
- **Unordered** (no position): the solver knows a letter belongs to _one of_ the remaining
  unrevealed blocks but not which — genuinely requires cross-referencing against the ciphertext to
  resolve, closer to the "hypothesis testing" the Codebusters guidance describes.

**Reveal generation, run once per quote at generation time — simplified, no verification step:**

1. Pick a random keyword `K` from the curated list.
2. Pick a reveal count `N` — randomly 2 or 3.
3. Pick ordered vs. unordered — randomly (50/50).
4. Pick `N` random distinct positions from `K`'s 4 letters and reveal them: with position
   (ordered) or without (unordered).

No uniqueness check, no escalation/fallback loop. This is simpler and more honest about what's
actually guaranteeing solvability — the ciphertext, not an abstract property of the crib alone.

**Display.** Reusing the existing `keys: ['!', 'label']` pattern (same shape as Fractionated
Morse's crib): `keys[0] = '!'` holds the real keyword (hidden, server-only, used by the encoder).
`keys[1]`'s label is `'keyword'`, value is a formatted crib string:

- Ordered: `"S _ _ Y"` (revealed letters in place, blanks for the rest).
- Unordered: `"contains S, W, Y (in some order)"`.

`Cipher.svelte`'s existing key-display block (`The {label} is {value}`) renders this without any
change — it already treats `keys[1]` as opaque text, same as it does for Fractionated Morse's crib
sentence today.

## 4. `CipherTypes.js` entry

```js
Homophonic: {
  directMap: true,
  keys: ['!', 'keyword'],
  addOn: 'homophonicTable',
  spacing: 5, // constant grouping, Patristocrat-style — matches the reference image's blocks
  length: [90, 130], // longer than Aristocrat: more ciphertext helps disambiguate keyword candidates
  options: [],
  letterGap: true, // 2-digit codes need breathing room, like Nihilist/Checkerboard
  bypassCheck: true, // codes are 2 chars, not 1 — same reason as Nihilist/Checkerboard
  stackKey: false,
  symbolSource: 'ciphertext', // >26 possible codes; bank built from codes actually in this quote
  letterComponent: 'default', // generic Letter.svelte already handles multi-char cipherLetter fine
},
```

Every field here reuses machinery we already built or that already exists — no new "escape
hatches" needed for the core puzzle mechanics themselves (the addon table is the one new piece,
see below).

## 5. Encoder (`shared-server/shared/CipherUtil.js`)

New `encodeHomophonic(plaintext, keyword)`:

- Build the merged-alphabet → 4-number-table mapping per the algorithm in §2 (pure function of
  `keyword`, so it's cheap to regenerate rather than cache).
- **Correction from the first pass**: non-letters must be stripped entirely via `stripQuote`
  first, _not_ passed through as their own chunk the way Caesar/Atbash/Affine do. Those three are
  all `bypassCheck: false`, where `isSolvableChunk` only counts real single-letter chunks, so a
  punctuation pass-through chunk is harmlessly ignored downstream. Homophonic is `bypassCheck:
true` like Nihilist/Checkerboard, where `isSolvableChunk` treats _any_ non-empty chunk as real
  puzzle data — a leftover punctuation chunk got miscounted into the `spacing` groups and got its
  own (unanswerable) input box, corrupting the submitted-answer alignment. Nihilist/Checkerboard
  avoid this by stripping non-letters up front; `encodeHomophonic` now does the same.
- Look up each remaining letter's 4 codes and push a random one (zero-padded 2-digit string).
- Register in the `encoders` map in `encodeQuote()` as `Homophonic: () => encodeHomophonic(plaintext, keys[0])`.

New pure helper `buildHomophonicTable(keyword)` (exported) so `generateQuote.js` can also use it
if needed for anything beyond encoding — keeping the block-rotation logic in one place. This stays
in `CipherUtil.js` deliberately: it's a pure function of one already-chosen keyword string, no
knowledge of the full candidate pool needed, consistent with every other encoder here.

**Keyword pool and crib-generation logic do NOT live in `shared-server/shared/`.** That directory
(`CipherTypes.js`, `CipherUtil.js`) is imported client-side too — `src/lib/util/cipherUtils.js`
pulls `isLetter`/`stripQuote`/etc. from `CipherUtil.js` for browser-side input handling, so
anything placed there ships to the browser bundle. The keyword _list_ and the _selection/crib_
logic are server-only concerns (see §6), so they belong under `shared-server/game/` instead,
alongside `generateQuote.js` — matching this repo's existing client-safe-vs-server-only split
(see `CLAUDE.md`'s repo structure notes).

## 6. Quote generation (`shared-server/game/generateQuote.js`)

New branch for `Homophonic`, following the existing per-cipher special-case pattern. Keyword pool
and crib-generation logic live in `shared-server/game/homophonicKeywords.js` (server-only, per the
placement rationale in §5) — a curated static array plus the reveal-generation function.

- Pick keyword `K` from the curated list.
- Run the crib-generation algorithm from §3 to get the reveal (`ordered` vs `unordered`, which
  letters).
- Set `keys = [K, formattedCribString]` (index 0 gets scrubbed to `''` on the response anyway,
  same as every other `'!'`-prefixed key — see the existing loop at the bottom of
  `generateQuote.js` that blanks out `!`-prefixed keys before responding).
- Call `encodeQuote(text, 'Homophonic', keys, p)`.

No changes needed to quote _selection_ (`Word`/`Quote` random-pick logic) — Homophonic uses the
regular `Quote` model like Aristocrat, not a special word-length constraint beyond `length`.

## 7. Frontend appearance

**Inline ciphertext display**: unchanged — reuses generic `Letter.svelte` per position, exactly
like every `directMap: true` cipher. With `spacing: 5`, this already renders in fixed-width
groups, visually close to the reference image's number blocks. No new component needed here.

**New addon component — `HomophonicTable.svelte`** (`addOn: 'homophonicTable'`): the big
number → letter lookup grid from the reference image, restyled to match the site's existing table
language (dark theme, `--table-header-bg`/`--table-border-color`/`--table-highlight-bg` variables,
rounded corners, hover highlight) — same visual family as `PolybiusSquare.svelte`/
`CheckerboardTable.svelte`, not the plain black-and-white exam-PDF look from the image.

- Always renders all 100 cells (`01`–`99`, `00`), regardless of how many actually appear in this
  quote's ciphertext — mirrors how `PolybiusSquare`/`CheckerboardTable` always show their full
  grid even if not every cell gets used. Laid out as a responsive grid (image uses 4 rows × 25
  columns; we'll do the same with `overflow-x: auto` fallback for narrow screens, matching
  `DeterminantTable`/`BaconianTable`'s responsive pattern).
- **Correction from the first pass**: this was originally built writing into the shared
  `info.letterInputs`/`info.letterFocus` dict, the same one the inline ciphertext positions use —
  modeled on `FreqTable`. That was wrong for this cipher: filling in one cell instantly propagated
  to every occurrence of that code across the _actual puzzle_, turning the reference table into an
  auto-solve shortcut rather than a scratchpad. Fixed to match `PolybiusSquare`/
  `CheckerboardTable` instead — **local-only state** (`cellValues`/`cellFocus`, not `info.*`), so
  filling in the table is purely the player's own working notes and has zero effect on the actual
  ciphertext inputs; the real answer still has to be typed into the per-position inputs to submit.
  Per that same precedent, `Cipher.svelte`'s hardcoded `clearPolybius` check (`clearQuote()`) now
  also includes `Homophonic`, since a locally-scoped scratchpad needs the same explicit reset hook
  Nihilist/Checkerboard already use — `info.letterInputs`'s automatic reset doesn't reach it
  anymore. `Replacement.svelte` is not reused (its markup hardcodes a `<td>` wrapper, incompatible
  with a non-table CSS grid) — `HomophonicTable.svelte` has its own small equivalent
  keydown/input-filtering logic instead, adapted from the same pattern.

This means the only genuinely new frontend code is `HomophonicTable.svelte`'s layout/styling —
the input-handling and state-wiring are 100% reused from existing components.

## 8. Validation

No changes needed to `src/routes/api/validate-quote/+server.js` — same "compare submitted string
to `stripQuote(plaintext)`" flow as every other cipher, since `getInputText(info.inputs)` already
collects answers from the inline positions regardless of how exotic the addon UI is (same
guarantee documented in `CLAUDE.md` for Fractionated Morse).

## 9. Open questions — resolved

1. **Curated keyword list vs. existing `Word` DB** — decided: a small **static, hand-curated
   list** (~100–150 common 4-letter, distinct-letter words), not the live `Word` Mongo collection,
   even though the latter is confirmed to be common-word-quality. Note: my original reasoning
   leaned partly on avoiding a full-pool DB fetch for the uniqueness check — since §3 dropped that
   check, that specific argument no longer applies (a single random pick via
   `findRandomEntry(Word, {length: 4})`, exactly like Hill already does, would be just as cheap).
   The reasoning that still holds: `Word` isn't guaranteed to have distinct-letter 4-letter
   entries, so filtering happens regardless of source; and this pool is user-facing puzzle content
   (the crib is literally shown to the player) that's worth curating intentionally, rather than
   incidentally inheriting whatever's in a collection shared with Hill's key generation. If you'd
   rather reuse `Word` directly given the weakened case, say so and I'll switch to
   `findRandomEntry(Word, {length: 4})` plus a distinct-letters filter instead.
2. **`spacing`** — confirmed `5` (Patristocrat-style constant grouping, matches the reference
   image).
3. **Reveal count / ordered-vs-unordered weighting** — confirmed: 50/50 on both, decided randomly
   per quote with no verification step (§3).

## 10. Implementation task list

1. `shared-server/game/homophonicKeywords.js` — curated keyword list **and** the crib-generation
   function (pick keyword, pick reveal count, pick ordered/unordered, pick positions — all simple
   randomization, no verification). Server-only, per the placement rationale in §5.
2. `shared-server/shared/CipherUtil.js` — `buildHomophonicTable(keyword)`, `encodeHomophonic`,
   register in the `encoders` map. Pure, client-safe — no pool/DB knowledge here.
3. `shared-server/shared/CipherTypes.js` — add the `Homophonic` entry (§4).
4. `shared-server/game/generateQuote.js` — call into `homophonicKeywords.js` for keyword + crib,
   set `keys`, call `encodeQuote` (§6).
5. `src/lib/Components/Game/HomophonicTable.svelte` — new addon component (§7).
6. `src/lib/Components/Game/Cipher.svelte` — one new `{:else if addOn == 'homophonicTable'}`
   branch, same pattern as the existing addon dispatch.
7. Manual verification: play `/singleplayer/Homophonic` end to end (no automated tests exist per
   `CLAUDE.md`).
8. Add `Homophonic` to README's cipher table.
9. Update `CLAUDE.md`'s cipher archetype list with Homophonic as a worked example of `symbolSource:
'ciphertext'` + a reused addon-input pattern (`Replacement.svelte` in a new grid layout) + the
   client-safe-vs-server-only placement split for keyword-pool data.
