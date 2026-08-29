# Singleplayer Post-Solve Results Page & Per-Cryptogram Stats — Implementation Plan

Status: **plan only, updated after review feedback, about to move to implementation on a new
branch** (`singleplayer-quote-stats`, branched from `main`).

## 1. What's changing (player-facing)

Today, solving a cryptogram in singleplayer pops a modal (`Popup.svelte`) over the still-visible,
blurred puzzle: "Congratulations! ... [OK]". This plan replaces that with a **full in-place results
view** — same route, same URL (`/singleplayer/[cipherType]`) — that swaps out the `Options` +
`Cipher` UI entirely for one large stats card: decoded quote + author, this cryptogram's stats
(success rate, average time, record time + holder, your time, performance, a difficulty rating
anyone can submit once per solve), styled in the site's existing glass/purple dark theme.

It also adds a lightweight **per-user "speed profile"** to the profile page, built from the same
new data, computed incrementally (see §8) rather than queried live.

## 2. Core design decision: what identifies "a cryptogram" for stats purposes

Every quote generation (`generateQuote.js`) picks a **fresh random key** for keyed ciphers, so two
plays of "the same" source quote essentially never produce identical ciphertext — unlike a site
where a puzzle has one fixed ID many solvers attempt against the same string. Keying stats off the
literal generated ciphertext would give nearly every "cryptogram" exactly one attempt ever.

**Decision:** key stats by **`(quoteId, cipherType, solveMode)`** — the underlying source quote's
Mongo `_id`, the cipher type applied to it, and `Decode` vs `Encode`. "This cryptogram" means
_"solving this quote's text with this cipher, in this mode"_, comparable across independent plays
even though the substitution key differs each time. `quoteId` is already what `validate-quote`
decrypts out of the `hash` token today, so no new identifier scheme is needed.

## 3. Data model — new collection

`shared-server/models/QuoteStats.js`, collection `quote_stats`:

```js
{
  quoteId: ObjectId,        // Quote._id or SpanishQuote._id, per getQuoteModel(cipherType)
  cipherType: String,
  solveMode: String,        // 'Decode' | 'Encode'

  attempts: Number,         // times served by /api/generate-quote — every generation counts,
                             // regardless of whether the player ever submits anything (see §7)
  solves: Number,           // times solved successfully via /api/validate-quote — ONLY successful
                             // submissions; a wrong guess never touches this document at all

  solveTimeSum: Number,     // running sum of solveTime — exact mean without storing every value
  solveTimeSumSq: Number,   // running sum of solveTime^2 — stdev, for the bell curve/perf bucket
  bestSolveTime: Number | null,
  bestSolveUserId: ObjectId | null,   // null => anonymous solver holds the record
  bestSolveUsername: String | null,   // denormalized snapshot; null => "Anonymous User"

  difficultySum: Number,    // sum of 1-5 star ratings, see §4
  difficultyCount: Number,
}
```

Unique compound index: `{ quoteId: 1, cipherType: 1, solveMode: 1 }`.

Kept as its own collection (not embedded on `Quote`/`SpanishQuote`) so the hot "pick a random
quote" collection stays untouched and unaffected by solve/attempt write volume.

No raw per-solve sample is stored anywhere (an earlier draft kept a capped `recentSolveTimes`
array for a bar-chart histogram — removed once the results page switched to an analytic bell
curve, §7, which only needs `solveTimeSum`/`solveTimeSumSq`/`solves`). Every solve aggregated into
one `(quoteId, cipherType, solveMode)` bucket is the same plaintext, so raw `solveTime` in seconds
is already comparable across solvers — no per-character length normalization applies here, unlike
the profile page's cross-quote histogram.

## 4. Difficulty rating — simplified per feedback, in scope for v1

Not tied to a user account at all — **anyone who just solved a cryptogram (logged in or not) can
submit one rating for it**, no per-user dedupe needed. This drops the separate votes collection
from the earlier draft entirely: `difficultySum`/`difficultyCount` live directly on `QuoteStats`
and are updated with a single atomic `$inc` — no read-modify-write, no aggregation query.

- New endpoint `POST /api/rate-quote` — body `{ id: hash, cipherType, solveMode, rating }`
  (`rating` an integer 1–5). Decrypts `hash` → `quoteId` (same helper `validate-quote` already
  uses), validates `rating` is an integer in range, then:
  ```js
  QuoteStats.updateOne(
    { quoteId, cipherType, solveMode },
    { $inc: { difficultySum: rating, difficultyCount: 1 } }
  );
  ```
  Returns the updated `{ avgDifficulty, difficultyCount }` so the UI can reflect the new average
  immediately without a second fetch.
- "Once" is enforced client-side: `SingleplayerResult.svelte` disables the rating widget after one
  submission for that view (local `$state`, e.g. `hasRated`). No server-side identity check is
  needed since a rating isn't attributed to anyone — this matches what was asked for (a rating per
  solve, not per account).
- Only reachable from the results view, i.e. only after a real solve — no separate "rate a puzzle
  you haven't played" surface.

## 5. Backend wiring for attempts/solves — reuse existing call sites

`generateQuote()` (`shared-server/game/generateQuote.js`) is shared by singleplayer
(`api/generate-quote/+server.js`), multiplayer game creation (`api/create-game/+server.js`), and
next-round-in-game (`ws/connectionHandler.js`). This feature is singleplayer-only, so the attempt
counter is only added at the singleplayer route — `generateQuote()` itself is untouched, and its
return shape (relied on by the other two call sites) doesn't change.

`/api/validate-quote` is confirmed **singleplayer-only** (multiplayer answer-checking goes through
the `check-quote` websocket event, a separate path) — safe to extend unconditionally.

New util `shared-server/utils/quoteStatsUtil.js`:

- **`bumpQuoteAttempt(quoteId, cipherType, solveMode)`** — called from
  `api/generate-quote/+server.js` right after `generateQuote(params)` returns (decrypting
  `quoteData.id` locally to get `quoteId`, since `generateQuote()`'s return shape isn't changing).
  Unconditional `$inc: { attempts: 1 }`, `upsert: true`. Runs regardless of login state and
  regardless of whether the player ever types anything — **an attempt is "a puzzle was generated
  for someone," not "someone tried to solve it."** A player who generates a puzzle and never
  submits, or submits wrong answers and gives up, still counts here and only here — `solves`,
  `solveTimeSum`, `bestSolveTime` are untouched unless `validate-quote` confirms a **correct**
  answer. A wrong submission (`isCorrect === false`, the existing early
  `return json(false)` in `validate-quote`) never reaches any of the code below — no new document
  write happens for it at all, and repeated wrong guesses on the same puzzle instance don't inflate
  `attempts` either (that's a one-time thing from generation, not from submission count).

- **`bumpQuoteSolve(...)`** — called from `validate-quote/+server.js` only after `isCorrect` is
  confirmed `true` (same place `incrementWin` is already called), passing the solve time,
  `auth?.id ?? null`, and (only needed on a new record) a username lookup. This function does
  three things, in order, all via targeted single-document updates on unique-indexed keys — no
  scans, no aggregations:
  1. **Read the pre-solve state**: `QuoteStats.findOne({ quoteId, cipherType, solveMode })`. This
     read is what makes the z-score/performance-bucket calculation in step 3 fair — it reflects the
     population _before_ this solve is folded in, and it's also how the previous record holder (if
     any) is discovered for the hand-off bookkeeping in step 2.
  2. **Apply the numeric update** unconditionally (`$inc solves/solveTimeSum/solveTimeSumSq`,
     `upsert: true`), then a **conditional** record-holder update guarded by the query filter
     (`$or: [{bestSolveTime: null}, {bestSolveTime: {$gt: solveTime}}]`) — atomic compare-and-set,
     no race window.
  3. **If step 2's conditional update actually matched** (i.e. this solve _is_ the new record):
     update the two `UserGame` documents involved (see §8) — decrement/pull from the previous
     holder's denormalized record list (if any, and if a different user), increment/push onto the
     new holder's. Anonymous solves can set the record on `QuoteStats` (holder shown as "Anonymous
     User") but have no `UserGame` document to denormalize onto, so this step is skipped for them.
  4. **If the pre-solve doc from step 1 had `solves >= MIN_POPULATION_FOR_BUCKETING` (3)** (i.e.
     there's a real population to compare against — not just one prior time, which has zero
     variance by construction and would make every 2nd-ever solver land in "average" regardless of
     their actual time) **and the solver is logged in**: compute this solve's z-score from the
     pre-solve mean/stdev, classify into one of 5 buckets, and `$inc` the matching counter plus the
     running z-score sum on the solver's own `UserQuoteInsights` document (see §8). Below that
     threshold this is skipped entirely — both the per-solve `performanceBucket` shown on the
     results page and the `UserQuoteInsights` contribution, deliberately coupled so a solve is
     never shown a "Performance" badge that then silently doesn't count toward their Speed Profile.
     It still counts fully toward `solves`/`bestSolveTime` etc. in step 2 regardless — this only
     gates the speed-profile signal, not the core stats.

  Bucket thresholds (shared with §7's per-solve display, one exported classifier so the numbers
  can't drift between the two call sites): `z < -1.5` Very Fast, `z < -0.5` Fast, `-0.5 ≤ z ≤ 0.5`
  Average, `z ≤ 1.5` Slow, else Very Slow.

## 6. Returning stats to the client — fold into `validate-quote`'s response

Extend `validate-quote`'s success response (today a bare `json(true)`) to an object:

```js
{
  solved: true,
  plaintext: quote.text,      // safe here — only sent *after* the answer is confirmed correct
  author: quote.author,       // requires selecting `author` in the existing findOne query
  stats: {
    attempts, solves, successRate,          // successRate = solves / attempts
    averageSolveTime, stdSolveTime,         // post-solve mean/stdev — feeds the bell curve, §7
    bestSolveTime, bestSolveUsername, isNewRecord,
    yourTime, performanceBucket,
    avgDifficulty, difficultyCount,         // from QuoteStats, pre-this-visitor's-vote
  },
}
```

**Explicitly not** adding `plaintext`/`author` to `/api/generate-quote`'s response — that runs
_before_ the player has solved anything, and this app currently validates Decode mode entirely
server-side with nothing answer-shaped reaching the client until success. Keeping this addition
scoped to the already-authoritative "you got it right" response preserves that invariant.

## 7. Frontend — results view replaces the modal

`solved` is currently tracked in two disconnected places: a **non-reactive** `let solved = false;`
in `+page.svelte` (only read by `Popup`'s `onExit` autoswitch check) and a separate `$state`
`solved` inside `Cipher.svelte` driving its own confetti/button UI. This gets consolidated:

1. `+page.svelte`: `let solved = $state(false);` and `let solveStats = $state(null);`.
2. `onSolved(answer)`: if `options.AutoSwitch` is on, call `newProblem()` immediately (unchanged
   behavior — autoSwitch's whole point is skipping the congrats screen and jumping straight to a
   new puzzle, so it must never render the results page). Otherwise set
   `solved = true; solveStats = answer.stats; ...` — no `Popup`/`toggle()` involved anymore.
3. Render: `{#if solved}<SingleplayerResult .../>{:else}<Options/><Cipher/>{/if}` — same pattern
   this file already uses for `loading`/`error`, same URL throughout.

**New component** `src/lib/Components/Game/SingleplayerResult.svelte`:

- One large glass card, reusing the site's existing `.glass-container`/`.glass-card` tokens and the
  `profile-page` card styling already in `profile/[[username]]/+page.svelte`.
- Decoded quote (large, centered) + `— {author}`.
- Confetti burst on mount (moved here from `Cipher.svelte`, see §9 — this is now the only place
  singleplayer's "just solved it" moment is ever actually rendered).
- Stats: Success Rate, Average Time, Record Time + holder (linked via `.profile-link` to
  `/profile/{username}` when not anonymous, "Anonymous User" text otherwise), Your Time,
  Performance badge (colored via `--color-success`/`--color-warning`/`--color-error`).
- Distribution chart: `SolveTimeBellCurve.svelte` (new) — an analytic normal-distribution curve
  computed purely from `stats.averageSolveTime`/`stats.stdSolveTime`/`stats.solves`, no raw sample
  storage or fetch involved. Chart.js has no built-in bell-curve type, so this plots the normal PDF
  as a smoothed Line chart (`tension`), with a custom plugin drawing 5 colored zone bands (Very
  Fast…Very Slow) at the exact same `±0.5σ`/`±1.5σ` boundaries `classifyPerformance()` uses for the
  "Performance" badge, plus a dashed marker for "Your Time." Requires `solves` above a small
  minimum (and `std > 0`) to render at all; below that it shows a (customizable, via an
  `emptyMessage` prop) "not enough solves yet" placeholder instead. Later reused on the profile
  page too — computing mean/std client-side from that page's existing raw `solveTimes` samples,
  since that per-user data was never stored as running sums the way `QuoteStats` is — replacing the
  old `SolveTimeHistogram.svelte` (a raw-sample bar-chart histogram) entirely; that component is
  now deleted, not just superseded here.
- Difficulty rating widget (1–5 stars): shows the current average immediately; submitting posts to
  `/api/rate-quote`, updates the displayed average from the response, then disables itself
  (`hasRated = true`) — see §4.
- "New Problem" button — calls the existing `newProblem` prop (`window.location.reload()`).

## 8. Profile integration — denormalized, not queried live, and NOT stored on `UserGame`

Per feedback, this must **not** require a live query across `QuoteStats` at profile-load time. All
of it is precomputed at write time (inside `bumpQuoteSolve`, §5).

**Revised per further feedback: this does not live on `UserGame`.** `UserGame` is on the hot path
for every multiplayer socket/game event — `currentSocketId`/`currentGame` are rewritten constantly
by `ws/connectionHandler.js`/`joinGame.js` during matchmaking and live games. This feature is
singleplayer-only and has nothing to do with that traffic; adding a growing, denormalized array
(snippets, authors, per-record metadata) to that document would add weight and write-contention
risk to something unrelated. Instead: a **new dedicated collection**,
`shared-server/models/UserQuoteInsights.js` (`user_quote_insights`), one document per user, `_id`
= the user's id (same FK pattern as `UserGame`/`UserAuth`). A profile load does one extra
point-read by primary key alongside the existing `UserGame` fetch — still O(1), still no query/no
scan, just a second flat document instead of a bigger first one.

Shape (unchanged from the original design, just relocated out of `UserGame`):

```js
// UserQuoteInsights, _id = userId
{
  recordCount: Number,       // true total of (quoteId, cipherType, solveMode) triples this user
                              // currently holds the record for — incremented/decremented exactly
                              // at hand-off time, never recomputed by scanning anything
  records: [{                // capped list (most recent 10, via $push + $slice) for display —
    quoteId, cipherType, solveMode,
    time: Number,
    author: String,          // denormalized at write time so rendering needs zero extra queries
    snippet: String,         // first ~60 chars of plaintext, denormalized the same way
    setAt: Date,
  }],
  speedBuckets: { veryFast, fast, average, slow, verySlow },  // 5 counters, §5 step 4
  zScoreSum: Number,         // running sum of every bucketed solve's z-score
  zScoreCount: Number,       // count of solves that contributed a z-score (excludes a quote's
                              // first few solves, below MIN_POPULATION_FOR_BUCKETING — §5 step 4)
}
```

**Hand-off bookkeeping** (§5 step 3, only runs when a record actually changes hands): using the
pre-solve doc's `bestSolveUserId` (previous holder, may be null/anonymous) and the new solver's id:

- New holder (if logged in): `$pull` any existing entry for this `(quoteId, cipherType, solveMode)`
  from their own `records` (handles "you beat your own record" without duplicating), then `$push`
  the fresh entry with `$slice: -10`, and `$inc recordCount: 1` **only if they didn't already hold
  this record** (i.e. skip the count change on a self-beat, since they already held it).
- Previous holder (if logged in and different from the new holder): `$pull` the matching entry from
  their `records`, `$inc recordCount: -1`.
- Each of these is one targeted `UserQuoteInsights.updateOne({_id}, {...}, {upsert: true})` call
  — no collection scans.

**What this displays on the profile** (both derived from data already on the loaded
`UserQuoteInsights`
document, zero extra queries):

1. **Speed Records** — "Holds the record on N cryptograms" (`recordCount`) plus a list built
   straight from the capped `records` array (cipher type, quote snippet + author, the time, a link
   to `/singleplayer/{cipherType}` to play a fresh instance of that cipher type — replaying doesn't
   literally re-attempt the same ciphertext, same caveat as §2). Shown on any profile visited (own
   or not) — a public achievement, same visibility model `BadgeDisplay` already uses.
2. **Speed Profile** (the "something unique" from the feedback) — a small chart from
   `speedBuckets`, e.g. a horizontal stacked bar showing the % of this user's solves that landed in
   each of the 5 buckets, reusing Chart.js (already a dependency), plus a single headline number:
   average z-score = `zScoreSum / zScoreCount`, translated into a friendly label via simple
   thresholds (e.g. `< -1` "Speed Demon", `< -0.3` "Quick Solver", `-0.3..0.3` "Steady Solver",
   `0.3..1` "Careful Solver", `> 1` "Methodical Solver") — descriptive, not just a synonym for
   "slow." This is only meaningful once `zScoreCount` is nonzero; render nothing (or a "solve a
   few more puzzles to unlock this" placeholder) below some small threshold, e.g. `zScoreCount < 5`.

Both sections read as flat fields off the single `UserQuoteInsights` document, fetched by its
`_id` alongside
`profile/[[username]]/+page.server.js` today — no new query shape, no `$lookup`, no scan.

## 9. Cleanup — dead code this change makes obsolete

Per feedback, these get **deleted**, not left behind:

- `Cipher.svelte`'s confetti block (`{#if solved && mode == 'singleplayer' && !gaveUp}` and its
  `<Confetti>` markup) and the `gaveUp` state it reads — today this block is already unreachable
  for multiplayer (hard-gated to `mode == 'singleplayer'`), and after this change it becomes
  unreachable for singleplayer too: `+page.svelte` swaps `Cipher` out for `SingleplayerResult` the
  same tick `solved` flips, so `Cipher`'s own solved-visual state is never actually painted.
  Confetti moves to `SingleplayerResult.svelte` instead (§7), which is now the only place this
  moment is genuinely rendered.
- `Cipher.svelte`'s button ternary — `onclick={solved && mode === GAME_MODES.SINGLEPLAYER ? newProblem : checkQuote}`
  and its label flip — simplifies to always `checkQuote`/"Submit", since the "New Problem" singleplayer-solved
  state it handled is superseded by `SingleplayerResult`'s own button. The `newProblem` prop is
  removed from `Cipher.svelte` entirely (it becomes unused there) and from the `<Cipher>` call site
  in `+page.svelte` (kept only as a plain function passed to `<SingleplayerResult>`, and still used
  by the `AutoSwitch` branch of `onSolved`).
- `+page.svelte`'s `Popup` usage, `feedbackMessage` state, and `toggle()` function — all existed
  solely to drive the success modal being replaced here. `Popup.svelte` itself is a shared,
  general-purpose component used elsewhere (not deleted, just this page's use of it for the
  success path is removed). Double-check at implementation time whether `feedbackMessage` /
  `Popup` are still needed on this page for any _other_ path (e.g. an error message) before
  deleting the import outright.
- The now-unused `finalTime`/`Timer` plumbing in `Cipher.svelte` is **not** touched — that's still
  relevant for multiplayer (Cipher stays mounted after solving there, showing a frozen timer while
  waiting on the opponent).

## 10. Relationship to existing stats machinery (orientation, not a change)

- `UserGame.singleplayerStats[cipherType]` (`statsUtil.js`): **per-user**, aggregate across _all_
  quotes of a cipher type. Unchanged.
- Redis `leaderboard:{cipherType}:bestSolveTime`: **per-user**, multiplayer-oriented. Unchanged.
- New `QuoteStats`: **cross-user**, scoped to one `(quoteId, cipherType, solveMode)`.
- New `UserQuoteInsights` (own collection, §8): **per-user**, denormalized _derivative_ of
  `QuoteStats` events —
  new axis, but computed incrementally, never queried live.

## 11. Resolved / remaining open questions

Resolved by your feedback:

- Difficulty rating: no per-user dedupe, one rating per solve, in scope for v1 (§4).
- Profile data: denormalized on its own `UserQuoteInsights` collection (kept off `UserGame`,
  which is on the multiplayer hot path), no live query, plus a new "Speed Profile" panel using
  the mean/stdev data (§8).
- Attempts vs. solves: attempts = generated (regardless of outcome), solves = confirmed-correct
  only (§5) — explicitly the model already in place, restated for clarity.
- Cleanup of superseded logic/components is an explicit task, not an afterthought (§9).
- Implementation happens on a new branch, `singleplayer-quote-stats`, off `main`.

Still worth a quick confirm, low-stakes:

1. §7/§9 — double-check nothing else on the singleplayer page depends on `Popup`/`feedbackMessage`
   before deleting them (will verify directly at implementation time, not blocking).
2. §8 — Speed Profile's "solve a few more to unlock" threshold (`zScoreCount < 5`) is an arbitrary
   pick; fine to tune later, not blocking implementation.

## 12. Implementation task list

1. Branch: `git checkout -b singleplayer-quote-stats` off `main`.
2. `shared-server/models/QuoteStats.js` — new schema (§3).
3. `shared-server/models/UserQuoteInsights.js` — new schema, own collection (§8).
4. `shared-server/utils/quoteStatsUtil.js` — `bumpQuoteAttempt`, `bumpQuoteSolve` (with the
   read-then-write ordering, hand-off bookkeeping, and bucket classifier), exported bucket
   classifier shared with the response-building code in §6.
5. `src/routes/api/generate-quote/+server.js` — decrypt `quoteData.id` → `quoteId`, call
   `bumpQuoteAttempt`.
6. `src/routes/api/validate-quote/+server.js` — select `author` too, call `bumpQuoteSolve`, build
   the extended `{ solved, plaintext, author, stats }` response (§6).
7. `src/routes/api/rate-quote/+server.js` — new endpoint (§4).
8. `src/routes/singleplayer/[[cipherType]]/+page.svelte` — lift `solved`/`solveStats` to `$state`,
   branch rendering, adapt `onSolved`/AutoSwitch logic, remove `Popup`/`feedbackMessage`/`toggle()`
   for the success path (§7, §9).
9. `src/lib/Components/Game/SingleplayerResult.svelte` and
   `src/lib/Components/Game/SolveTimeBellCurve.svelte` — new components (§7).
10. `src/lib/Components/Game/Cipher.svelte` — delete the confetti block, `gaveUp`, the button
    ternary's solved-branch, and the now-unused `newProblem` prop (§9).
11. `src/routes/profile/[[username]]/+page.server.js` + `+page.svelte` — Speed Records + Speed
    Profile sections, reading straight off `UserQuoteInsights` (§8).
12. Manual verification: solve several cipher types (keyed and non-keyed, logged in and anonymous),
    confirm results page renders and matches theme, confirm record hand-off updates both the old
    and new holder's `UserQuoteInsights` correctly, confirm AutoSwitch still skips straight to
    a new puzzle without ever rendering the results page, confirm a wrong submission never creates
    or touches a `QuoteStats` document, confirm profile Speed Records/Speed Profile sections render
    with no extra network waterfall.
13. Update `CLAUDE.md` if this introduces a pattern worth documenting for future work (likely: the
    atomic compare-and-set record-holder pattern, and the "denormalize at write time, never query
    live" approach used for profile data).
14. No automated tests exist — manual verification only, per `CLAUDE.md`.
