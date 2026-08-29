<script>
  import { goto } from '$app/navigation';
  import { badgeCriteria } from '$lib/util/badgeConfig.js';
  import { portal } from '$lib/util/portal.js';
  import { cubicOut } from 'svelte/easing';

  let { unlockedBadgeIds = [], stats, singleStats, isOwnProfile } = $props();

  let selectedBadge = $state(null);

  function selectBadge(badge) {
    selectedBadge = badge;
  }

  function selectBadgeFromId(badgeId) {
    selectedBadge = badgeCriteria.find((badge) => badge.id === badgeId);
  }

  function returnToGrid() {
    selectedBadge = null;
  }

  function zoom(node, { duration = 300 }) {
    return {
      duration,
      css: (t) => {
        const eased = cubicOut(t);
        return `
                  transform: scale(${eased});
              `;
      },
    };
  }

  function fade(node, { duration = 400 }) {
    return {
      duration,
      css: (t) => {
        const eased = cubicOut(t);
        return `
                  opacity: ${eased};
              `;
      },
    };
  }

  let showModal = $state(false);
  const unlockedSet = new Set(unlockedBadgeIds);

  function toggleModal() {
    showModal = !showModal;
  }
</script>

<!-- Compact Badge Stack -->
<div
  class="badge-display-wrapper"
  onclick={() => {
    toggleModal();
    returnToGrid();
  }}
  role="button"
  tabindex="0"
  onkeydown={() => {}}
>
  <h3>Achievements</h3>
  <div class="badge-stack">
    {#if unlockedBadgeIds.length > 0}
      {#each unlockedBadgeIds as badgeId}
        <div
          class="badge-wrapper"
          role="button"
          tabindex="0"
          onclick={(e) => {
            e.stopPropagation();
            selectBadgeFromId(badgeId);
            toggleModal();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectBadgeFromId(badgeId);
              toggleModal();
            }
          }}
        >
          <img class="badge-preview" src={`/badges/${badgeId}.webp`} alt={badgeId} />
        </div>
      {/each}
    {:else}
      <div class="no-badges">
        <div class="badge-placeholder">
          <img src="/locked-badge-icon.png" alt="No Badges Yet" />
        </div>
        <h4>No badges… yet.</h4>
        <p>
          Solve cryptograms, rank up, and uncover secrets to earn your first badge! Stats count only
          in public ranked matches with multiple users.
        </p>
        <button
          class="start-btn"
          onclick={(e) => {
            e.stopPropagation();
            goto('/public-lobby');
          }}>Get Started</button
        >
      </div>
    {/if}
  </div>
</div>

<!-- Modal with Portal -->
{#if showModal}
  <div
    use:portal
    class="modal"
    onclick={toggleModal}
    onkeydown={() => {}}
    role="button"
    tabindex="0"
    in:fade
    out:fade
  >
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      role="button"
      tabindex="0"
      in:zoom
      out:zoom
    >
      <i
        class="close-btn fa-solid fa-xmark"
        onclick={toggleModal}
        onkeydown={() => {}}
        role="button"
        tabindex="0"
      ></i>
      {#if selectedBadge}
        <i
          class="fa-solid fa-arrow-left back-icon"
          onclick={returnToGrid}
          onkeydown={() => {}}
          role="button"
          tabindex="0"
        ></i>
        <div class="badge-detail">
          <img
            class="badge-large {unlockedSet.has(selectedBadge.id) ? '' : 'locked'}"
            src={`/badges/${selectedBadge.id}.webp`}
            alt={selectedBadge.label}
          />
          <div class="badge-info">
            <h3>{selectedBadge.label}</h3>
            <p>{selectedBadge.description}</p>
            {#if !unlockedSet.has(selectedBadge.id)}
              {#if selectedBadge.progress(stats, singleStats)}
                <p class="badge-progress">Progress: {selectedBadge.progress(stats, singleStats)}</p>
              {/if}
            {/if}
          </div>
        </div>
      {:else}
        <h2 class="badge-title">{isOwnProfile ? 'Your ' : ' '}Badges</h2>
        <div class="badge-grid">
          {#each badgeCriteria as badge}
            <div
              class="badge-grid-item"
              onclick={() => selectBadge(badge)}
              onkeydown={() => {}}
              role="button"
              tabindex="0"
            >
              <div class="tooltip-wrapper">
                <img
                  src={`/badges/${badge.id}.webp`}
                  alt={badge.label}
                  class={unlockedSet.has(badge.id) ? '' : 'locked'}
                />
                <span class="tooltip">{badge.description}</span>
              </div>
              <div class="badge-label">{badge.label}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .badge-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .badge-large {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 25px rgba(255, 255, 255, 0.2);
  }

  .badge-info {
    max-width: 400px;
    color: white;
  }

  .badge-info h3 {
    margin-bottom: 0.5rem;
    font-size: 1.5rem;
  }

  .badge-info p {
    font-size: 1rem;
    color: var(--color-neutral-300);
  }

  .back-icon {
    position: absolute;
    top: 1rem;
    left: 1rem;
    font-size: 1.2rem;
    margin-bottom: 0.75rem;
    display: inline-block;
    cursor: pointer;
    color: var(--color-neutral-400);
  }

  .back-icon:hover {
    color: var(--color-hero-light);
  }

  .badge-display-wrapper {
    text-align: center;
    margin: 1.5rem auto;
  }

  /* Same "section eyebrow" treatment as the profile page's other section headers (Speed
     Records/Speed Profile/Account Settings) — this component also renders on the landing page, so
     keep this scoped to the label only, not a wider redesign. */
  .badge-display-wrapper h3 {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 0.8rem;
  }

  .badge-stack {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
    cursor: pointer;
  }

  .badge-preview {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .badge-preview:hover {
    transform: scale(1.1);
  }

  .badge-wrapper {
    display: inline-block;
    cursor: pointer;
    outline: none;
  }

  .modal {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .modal-content {
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.08),
      rgba(255, 255, 255, 0.04),
      rgba(255, 255, 255, 0.08)
    );
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 25px 45px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(20px);
    padding: 2rem;
    border-radius: 1rem;
    color: white;
    width: 90%;
    max-width: 800px;
    height: max-content;
    max-height: 90vh;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: 1.5rem;
    cursor: pointer;
    color: white;
  }

  .close-btn:hover {
    color: var(--color-hero-light);
  }

  .badge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 1.25rem;
    margin-top: 1.5rem;
    margin-left: 2rem;
    margin-right: 2rem;
  }

  .badge-grid-item {
    text-align: center;
    position: relative;
  }

  .badge-grid-item img {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    transition: transform 0.2s ease;
  }

  .badge-grid-item img:hover {
    transform: scale(1.1);
  }

  .badge-label {
    font-size: 0.85rem;
    margin-top: 0.4rem;
    font-weight: 500;
  }

  .locked {
    filter: grayscale(1) brightness(0.6);
    opacity: 0.6;
  }

  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    visibility: hidden;
    width: 180px;
    background-color: var(--glass-overlay);
    backdrop-filter: blur(10px);
    color: var(--text-primary);
    text-align: center;
    border-radius: 6px;
    padding: 0.5rem;
    position: absolute;
    z-index: 10;
    bottom: 110%;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .tooltip-wrapper:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }

  .no-badges {
    text-align: center;
    padding: 2rem;
    color: var(--color-neutral-200);
    max-width: 400px;
    margin: 0 auto;
    animation: fadeInScale 0.5s ease-out;
  }

  .badge-placeholder {
    width: 100px;
    height: 100px;
    margin: 0 auto 1rem;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
  }

  .badge-placeholder img {
    width: 90%;
    height: 90%;
    object-fit: contain;
  }

  .badge-placeholder:hover {
    transform: scale(1.1);
  }

  /* Matches the "hero" text scale QuoteInsights.svelte's .speed-title uses (1.4rem/700) for the
     one other emphasized headline on this page — this one is informational rather than a
     personalized result, so it stays a neutral color instead of that one's purple. */
  .no-badges h4 {
    font-size: 1.4rem;
    font-weight: 700;
    margin-top: 1rem;
    color: var(--text-primary);
  }

  /* Same 0.9rem/text-tertiary body-copy scale used under every other section eyebrow on this
     page. */
  .no-badges p {
    font-size: 0.9rem;
    color: var(--text-tertiary);
    margin: 0.5rem 0 1rem;
  }

  .start-btn {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 700;
    backdrop-filter: blur(10px);
    transition: background 0.3s ease;
    cursor: pointer;
  }

  .start-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  @keyframes fadeInScale {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .badge-progress {
    margin-top: 0.5rem;
    font-size: 0.95rem;
    color: var(--color-neutral-500);
    font-style: italic;
  }
</style>
