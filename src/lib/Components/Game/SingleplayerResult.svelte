<script>
  import Container from '../General/Container.svelte';
  import ProfilePicture from '../General/ProfilePicture.svelte';
  import SolveTimeBellCurve from './SolveTimeBellCurve.svelte';
  import { Confetti } from 'svelte-confetti';

  /**
   * Replaces the old success Popup. Rendered in place of Options+Cipher once `solved` flips true
   * — same URL/route throughout. See docs/singleplayer-stats-plan.md §7.
   */
  let { plaintext, author, stats, cipherType, solveMode, hash, newProblem } = $props();

  const PERFORMANCE_LABELS = {
    veryFast: { label: 'Very Fast', className: 'perf-great' },
    fast: { label: 'Fast', className: 'perf-good' },
    average: { label: 'Average', className: 'perf-average' },
    slow: { label: 'Slow', className: 'perf-slow' },
    verySlow: { label: 'Very Slow', className: 'perf-bad' },
  };

  // Star click only sets a local selection — it does NOT submit. Submitting is a separate,
  // explicit step (see `submitRating`/the "Submit Rating" button below). Selecting-and-submitting
  // in one click previously left a window, between the click and the fetch resolving, where the
  // stars were still hoverable: moving the mouse during that window overwrote the display with a
  // stale `hoverRating` that never got cleared once `hasRated` flipped true. Splitting select from
  // submit removes that window entirely — the stars go inert the instant "Submit Rating" is
  // clicked, not only once the network round-trip finishes.
  let hoverRating = $state(0);
  let selectedRating = $state(0);
  let submitting = $state(false);
  let hasRated = $state(false);
  let ratingError = $state('');
  let avgDifficulty = $state(stats?.avgDifficulty ?? null);
  let difficultyCount = $state(stats?.difficultyCount ?? 0);

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Three distinct star colors, not one: a star that's both selected AND currently hovered MUST
  // look visibly different from a star that's only one or the other, so a hover preview reads as
  // "layered on top of" the locked-in selection rather than replacing it outright.
  const SELECTED_STAR_COLOR = 'var(--color-warning)'; // locked-in selection, solid
  const HOVER_ONLY_STAR_COLOR = 'rgba(255, 232, 163, 0.5)'; // preview beyond the selection — lighter, translucent
  const HOVER_OVER_SELECTED_COLOR = 'rgba(255, 249, 78, 0.75)'; // hover crossing an already-selected star

  function starColor(star) {
    const isSelected = star <= selectedRating;
    const isHovered = hoverRating > 0 && star <= hoverRating;
    if (isSelected && isHovered) return HOVER_OVER_SELECTED_COLOR;
    if (isHovered) return HOVER_ONLY_STAR_COLOR;
    return SELECTED_STAR_COLOR;
  }

  function selectStar(star) {
    if (hasRated || submitting) return;
    selectedRating = star;
  }

  async function submitRating() {
    if (hasRated || submitting || selectedRating === 0) return;
    submitting = true;
    ratingError = '';
    try {
      const res = await fetch('/api/rate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hash, cipherType, solveMode, rating: selectedRating }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      avgDifficulty = data.avgDifficulty;
      difficultyCount = data.difficultyCount;
      hasRated = true;
    } catch (err) {
      ratingError = 'Could not submit rating. Try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<div
  style="
  position: fixed;
  z-index: 25;
  top: -3vh;
  left: 0;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;"
>
  <Confetti
    duration="3000"
    x={[-5, 5]}
    delay={[0, 3000]}
    amount="200"
    fallDistance="100vh"
    colorRange={[75, 175]}
  />
</div>

<Container>
  <div class="result-card">
    <p class="eyebrow">Solved!</p>

    <blockquote class="quote-text">
      “{plaintext}”
      {#if author}
        <cite class="quote-author">— {author}</cite>
      {/if}
    </blockquote>

    {#if stats}
      <div class="stats-grid">
        <div class="stat-tile">
          <span class="stat-label">Your Time</span>
          <span class="stat-value">{formatTime(stats.yourTime)}</span>
        </div>

        {#if stats.performanceBucket}
          <div class="stat-tile">
            <span class="stat-label">Performance</span>
            <span
              class="stat-value perf-badge {PERFORMANCE_LABELS[stats.performanceBucket].className}"
            >
              {PERFORMANCE_LABELS[stats.performanceBucket].label}
            </span>
          </div>
        {/if}

        <div class="stat-tile">
          <span class="stat-label">Success Rate</span>
          <span class="stat-value">{Math.round(stats.successRate * 100)}%</span>
        </div>

        <div class="stat-tile">
          <span class="stat-label">Average Time</span>
          <span class="stat-value">{formatTime(stats.averageSolveTime)}</span>
        </div>
      </div>

      <div class="stat-tile record-tile">
        <span class="stat-label">Record Time</span>
        <span class="stat-value">
          {formatTime(stats.bestSolveTime)}
          {#if stats.isNewRecord}
            <span class="record-badge">🏆 New Record!</span>
          {/if}
        </span>
        <span class="stat-sub record-holder">
          <ProfilePicture profilePicture={stats.bestSolveProfilePicture} size={22} />
          {#if stats.bestSolveUsername}
            <a
              class="profile-link"
              href="/profile/{stats.bestSolveUsername}"
              target="_blank"
              rel="noopener noreferrer">{stats.bestSolveUsername}</a
            >
          {:else}
            Anonymous User
          {/if}
        </span>
      </div>

      <SolveTimeBellCurve
        mean={stats.averageSolveTime}
        std={stats.stdSolveTime}
        yourTime={stats.yourTime}
        solves={stats.solves}
      />

      <div class="difficulty-widget">
        <span class="stat-label">
          Difficulty{#if difficultyCount > 0}
            : {avgDifficulty.toFixed(1)} / 5 ({difficultyCount}
            {difficultyCount === 1 ? 'rating' : 'ratings'}){/if}
        </span>
        <div
          class="stars"
          class:disabled={hasRated || submitting}
          role="group"
          aria-label="Difficulty rating"
          onmouseleave={() => {
            if (!hasRated && !submitting) hoverRating = 0;
          }}
        >
          {#each [1, 2, 3, 4, 5] as star}
            <button
              type="button"
              class="star"
              style="color: {starColor(star)}"
              disabled={hasRated || submitting}
              onmouseenter={() => {
                if (!hasRated && !submitting) hoverRating = star;
              }}
              onclick={() => selectStar(star)}
              aria-label="Rate difficulty {star} out of 5"
            >
              {Math.max(hoverRating, selectedRating) >= star ? '★' : '☆'}
            </button>
          {/each}
        </div>
        {#if selectedRating > 0 && !hasRated}
          <button
            type="button"
            class="submit-rating-btn"
            disabled={submitting}
            onclick={submitRating}
          >
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </button>
        {/if}
        {#if hasRated}
          <span class="rating-thanks">Thanks for rating!</span>
        {/if}
        {#if ratingError}
          <span class="rating-error">{ratingError}</span>
        {/if}
      </div>
    {/if}

    <button class="button new-problem-button" onclick={newProblem}>New Problem</button>
  </div>
</Container>

<style>
  .result-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.85rem;
    color: var(--color-link-light);
    font-weight: 700;
    margin: 0;
  }

  .quote-text {
    font-size: clamp(1.1rem, 2.5vw, 1.6rem);
    font-weight: 600;
    text-align: center;
    max-width: 720px;
    margin: 0;
    line-height: 1.5;
  }

  .quote-author {
    display: block;
    margin-top: 0.75rem;
    font-size: 1rem;
    font-style: normal;
    color: var(--text-secondary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    align-items: start;
    gap: 1rem;
    width: 100%;
    max-width: 720px;
  }

  .record-tile {
    width: 100%;
    max-width: 260px;
  }

  .stat-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.75rem;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    text-align: center;
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.3rem;
    font-weight: 700;
  }

  .stat-sub {
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }

  .record-holder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .record-badge {
    display: block;
    font-size: 0.75rem;
    color: var(--color-warning);
    font-weight: 600;
  }

  .perf-badge {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 1rem;
  }

  .perf-great,
  .perf-good {
    color: var(--color-success);
  }

  .perf-average {
    color: var(--text-primary);
  }

  .perf-slow {
    color: var(--color-warning);
  }

  .perf-bad {
    color: var(--color-error);
  }

  .difficulty-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .stars {
    display: flex;
    gap: 0.25rem;
  }

  .star {
    background: none;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    color: var(--color-warning);
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }

  .stars.disabled .star {
    cursor: default;
    pointer-events: none;
  }

  .submit-rating-btn {
    padding: 0.35rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 999px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .submit-rating-btn:hover:not(:disabled) {
    background: var(--glass-bg-hover);
  }

  .submit-rating-btn:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .rating-thanks {
    font-size: 0.85rem;
    color: var(--color-link-light);
  }

  .rating-error {
    font-size: 0.85rem;
    color: var(--color-error);
  }

  .new-problem-button {
    margin-top: 0.5rem;
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
