<script>
  import EditableProfilePicture from '$lib/Components/General/EditableProfilePicture.svelte';
  import ProfileStats from '$lib/Components/General/ProfileStats.svelte';
  import QuoteInsights from '$lib/Components/General/QuoteInsights.svelte';
  import BadgeDisplay from '$lib/Components/Game/BadgeDisplay.svelte';
  import { getUnlockedBadges } from '$lib/util/badgeConfig.js';
  import '$lib/css/Button.css';
  import { cipherTypes } from '$shared/CipherTypes.js';
  import SolveTimeBellCurve from '$lib/Components/Game/SolveTimeBellCurve.svelte';
  import ConfirmDeleteModal from '$lib/Components/General/ConfirmDeleteModal.svelte';

  let { data } = $props();
  let { username, profilePicture, stats, singleplayerStats, quoteInsights, isOwnProfile, email } =
    data;

  let profileStats = stats ? JSON.parse(stats) : {};
  let singleStats = singleplayerStats ? JSON.parse(singleplayerStats) : {};
  let insights = quoteInsights ? JSON.parse(quoteInsights) : null;
  let uploadError = $state('');
  let updatingEmail = $state(false);
  let unlockedBadgeIds = $derived(getUnlockedBadges(profileStats, singleStats).map((b) => b.id));

  // No "All" option: the bell curve is a single-mode normal approximation, and pooling solve
  // times across every cipher type would blend genuinely different distributions (Caesar vs.
  // Fractionated Morse solve times, say) into one misleading pseudo-bell-curve.
  let cipherOptions = Object.keys(cipherTypes);
  let selectedCipher = $state(cipherOptions[0]);
  let showDeleteModal = $state(false);
  // Speed Records/Speed Profile are singleplayer-only data — gated on ProfileStats' own
  // multiplayer/singleplayer toggle rather than duplicating a second selector.
  let statMode = $state('multiplayer');

  function onUploadError(error) {
    uploadError = error;
  }

  function getSolveTimes(cipher) {
    const multi = profileStats?.[cipher]?.solveTimes ?? [];
    const single = singleStats?.[cipher]?.solveTimes ?? [];

    const normalized = (arr) =>
      arr.map((entry) => (entry.length > 0 ? entry.time / entry.length : 0));

    return [...normalized(multi), ...normalized(single)];
  }

  // The distribution chart is an analytic bell curve (see SolveTimeBellCurve.svelte, also used on
  // the singleplayer results page), not a plot of these raw samples — mean/std are computed from
  // them here since, unlike QuoteStats, this per-user data was never stored as running sums.
  function meanAndStd(values) {
    if (!values.length) return { mean: 0, std: 0 };
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return { mean, std: Math.sqrt(variance) };
  }

  // Solve time here is raw wall-clock elapsed time with no idle/pause detection (see
  // Cipher.svelte/+page.svelte's startTime) — a puzzle left open and finished much later is a
  // genuine, real data point, not a measurement error, but it says nothing about actual solving
  // speed. More samples make a normal distribution's mean/std estimate more PRECISE; they do NOT
  // make it more robust to outliers — variance is driven by squared deviation from the mean, so a
  // handful of extreme values dominate it regardless of how much well-behaved data surrounds them.
  // Tukey's fences (exclude values beyond Q3 + 1.5×IQR, a standard outlier rule) split the samples
  // into a `kept` set — used for a curve shape representative of *typical* solves instead of one
  // dragged around by a few distracted sessions — and the excluded `outliers` themselves, which
  // SolveTimeBellCurve can reveal as real points on demand rather than silently discarding.
  function splitOutliers(values) {
    if (values.length < 4) return { kept: values, outliers: [] };
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const upperFence = q3 + 1.5 * (q3 - q1);
    return {
      kept: values.filter((v) => v <= upperFence),
      outliers: values.filter((v) => v > upperFence),
    };
  }

  // MUST match shared-server/utils/quoteStatsUtil.js's classifyPerformance() thresholds (±0.5σ,
  // ±1.5σ) — duplicated here rather than imported since that file pulls in server-only (mongoose)
  // dependencies that can't ship to the client. Only pure math, so it's cheap to keep in sync.
  function classifyPerformance(zScore) {
    if (zScore < -1.5) return 'veryFast';
    if (zScore < -0.5) return 'fast';
    if (zScore <= 0.5) return 'average';
    if (zScore <= 1.5) return 'slow';
    return 'verySlow';
  }

  // How many of this cipher's raw samples fall in each SolveTimeBellCurve zone — the bell curve
  // itself only ever sees (mean, std), so this is computed here where the raw samples still exist.
  function getZoneCounts(values, mean, std) {
    const counts = { veryFast: 0, fast: 0, average: 0, slow: 0, verySlow: 0 };
    if (!std) return counts;
    for (const value of values) {
      counts[classifyPerformance((value - mean) / std)]++;
    }
    return counts;
  }

  // These values are seconds-PER-CHARACTER, not a solve duration — SolveTimeBellCurve's default
  // mm:ss formatter assumes raw seconds (right for the singleplayer results page, where it's
  // reused from) and would render this rate as an unreadable "0:00"/"0:01" clock time instead.
  function formatSecondsPerChar(value) {
    if (value == null || isNaN(value)) return '—';
    return `${value.toFixed(2)}s/char`;
  }
</script>

<section class="profile-page animate-glass-emerge">
  <div class="profile-header animate-content-rise">
    <EditableProfilePicture {profilePicture} size={120} {isOwnProfile} sendError={onUploadError} />
    <h1 class="username animate-text-glow">@{username}</h1>
    {#if uploadError}
      <p class="upload-error animate-error-slide">{uploadError}</p>
    {/if}
  </div>

  <div class="divider-section animate-divider-expand">
    <hr class="glass-divider" />
  </div>

  <div class="badges-wrapper animate-stats-float">
    <BadgeDisplay {unlockedBadgeIds} stats={profileStats} {singleStats} {isOwnProfile} />
  </div>

  <div class="divider-section animate-divider-expand">
    <hr class="glass-divider" />
  </div>

  <div class="stats-wrapper animate-stats-float">
    <ProfileStats stats={profileStats} {singleStats} bind:statMode />
  </div>

  {#if statMode === 'singleplayer'}
    <div class="stats-wrapper insights-wrapper animate-stats-float">
      <QuoteInsights quoteInsights={insights} />
    </div>
  {/if}

  <div class="divider-section animate-divider-expand">
    <hr class="glass-divider" />
  </div>

  <div class="solve-time-section">
    <div class="cipher-selector">
      {#each cipherOptions as option}
        <button
          class:selected={selectedCipher === option}
          onclick={() => (selectedCipher = option)}
        >
          {option}
        </button>
      {/each}
    </div>

    {#if getSolveTimes(selectedCipher).length}
      {@const times = getSolveTimes(selectedCipher)}
      {@const { kept, outliers } = splitOutliers(times)}
      {@const { mean, std } = meanAndStd(kept)}
      <SolveTimeBellCurve
        {mean}
        {std}
        solves={times.length}
        emptyMessage="Solve a few more {selectedCipher} cryptograms to see your distribution."
        formatValue={formatSecondsPerChar}
        zoneCounts={getZoneCounts(times, mean, std)}
        {outliers}
      />
    {:else}
      <p class="no-data">No solve time data available for {selectedCipher}.</p>
    {/if}
  </div>

  {#if isOwnProfile}
    <div class="divider-section animate-divider-expand">
      <hr class="glass-divider" />
    </div>

    <section>
      <div class="settings-header">
        <h2>Account settings</h2>
      </div>

      <div class="settings-cards">
        <form method="POST" action="?/updateEmail" class="settings-card email-card">
          <div class="card-header">
            <h3>Email address</h3>
          </div>
          <div class="field">
            <label for="email">New email</label>
            <div class="input-row">
              <input
                class={updatingEmail ? '' : 'disabled'}
                id="email"
                name="email"
                type="email"
                placeholder="Enter new email"
                disabled={!updatingEmail}
                value={email}
                autocomplete="email"
                required
              />
              <div class="button-group">
                {#if updatingEmail}
                  <button type="submit" class="button">Save</button>
                  <button
                    type="button"
                    onclick={() => {
                      updatingEmail = false;
                    }}
                    class="button secondary">Cancel</button
                  >
                {:else}
                  <button
                    type="button"
                    onclick={() => {
                      updatingEmail = true;
                    }}
                    class="button">Update</button
                  >
                {/if}
              </div>
            </div>
            <p class="hint">You'll need to verify this new email.</p>
          </div>
        </form>

        <div class="settings-card danger-card">
          <div class="card-header">
            <h3>Danger Zone</h3>
          </div>
          <p class="subtle more-info">
            Deleting your account will remove your profile, stats, badges, game history, and any
            associated data. This process is irreversible.
          </p>

          <button
            type="button"
            class="button danger-button"
            onclick={() => {
              showDeleteModal = true;
            }}
          >
            Delete account
          </button>
        </div>
      </div>
    </section>

    <ConfirmDeleteModal
      visible={showDeleteModal}
      {username}
      onClose={() => {
        showDeleteModal = false;
      }}
    />
  {/if}
</section>

<svelte:head>
  <title>{username}'s Profile</title>
</svelte:head>

<style>
  .profile-page {
    position: relative;
    padding: 2.5rem;
    max-width: 80vw;
    width: 100%;
    margin: 0.75rem auto;
    padding: 3rem 2.5rem;
    background: rgba(255, 255, 255, 0.06);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.3),
      inset 0 1px 1px rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(18px);
    border-radius: 2rem;
    color: white;
    overflow: hidden;
  }

  .profile-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
    position: relative;
    z-index: 2;
  }

  .username {
    font-size: 2rem;
    font-weight: bold;
    text-shadow:
      0 0 20px rgba(255, 255, 255, 0.3),
      0 2px 4px rgba(0, 0, 0, 0.3);
    position: relative;
  }

  .upload-error {
    color: var(--color-error);
    background: var(--color-error-bg);
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    font-size: 0.9rem;
    margin-top: -0.5rem;
    backdrop-filter: blur(10px);
    box-shadow:
      0 4px 15px rgba(239, 68, 68, 0.2),
      inset 0 1px 1px rgba(255, 255, 255, 0.1);
  }

  .divider-section {
    position: relative;
    margin: 2rem 0;
    height: 1px;
  }

  .glass-divider {
    width: 100%;
    height: 1px;
    border: none;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.3) 50%,
      transparent 100%
    );
    position: relative;
  }

  .stats-wrapper {
    position: relative;
    z-index: 2;
  }

  .insights-wrapper {
    padding-top: 2rem;
  }

  .animate-glass-emerge {
    animation: glassEmerge 1.2s cubic-bezier(0.23, 1, 0.32, 1) forwards;
  }

  .animate-content-rise {
    animation: contentRise 0.8s cubic-bezier(0.23, 1, 0.32, 1) 0.3s both;
  }

  .animate-text-glow {
    animation: textGlowIn 1s ease-out 0.6s both;
  }

  .animate-divider-expand {
    animation: dividerExpand 0.8s ease-out 0.8s both;
  }

  .animate-stats-float {
    animation: statsFloat 0.8s cubic-bezier(0.23, 1, 0.32, 1) 1s both;
  }

  .animate-error-slide {
    animation: errorSlide 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @keyframes glassEmerge {
    0% {
      opacity: 0;
      transform: scale(0.8) translateY(40px);
      backdrop-filter: blur(0px);
    }
    50% {
      backdrop-filter: blur(10px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
      backdrop-filter: blur(20px);
    }
  }

  @keyframes contentRise {
    0% {
      opacity: 0;
      transform: translateY(30px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes textGlowIn {
    0% {
      opacity: 0;
      text-shadow: 0 0 0 rgba(255, 255, 255, 0);
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      text-shadow:
        0 0 20px rgba(255, 255, 255, 0.3),
        0 2px 4px rgba(0, 0, 0, 0.3);
      transform: translateY(0);
    }
  }

  @keyframes dividerExpand {
    0% {
      opacity: 0;
      transform: scaleX(0);
    }
    100% {
      opacity: 1;
      transform: scaleX(1);
    }
  }

  @keyframes statsFloat {
    0% {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes errorSlide {
    0% {
      opacity: 0;
      transform: translateX(-20px) scale(0.9);
    }
    100% {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @keyframes profileBorderGlow {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.02);
    }
  }

  @keyframes highlightShift {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.15;
    }
    25% {
      transform: translate(5px, -3px) scale(1.1);
      opacity: 0.25;
    }
    50% {
      transform: translate(-2px, 8px) scale(0.9);
      opacity: 0.1;
    }
    75% {
      transform: translate(-8px, -5px) scale(1.05);
      opacity: 0.2;
    }
  }

  @media (max-width: 768px) {
    .profile-page {
      padding: 2rem 1.5rem;
    }

    .username {
      font-size: 1.75rem;
    }
  }

  .solve-time-section {
    margin-top: 1rem;
  }

  .cipher-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
    justify-content: center;
  }

  .cipher-selector button {
    padding: 0.4rem 0.8rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: white;
    cursor: pointer;
  }

  .cipher-selector button.selected {
    background: rgba(148, 131, 255, 0.25);
    border-color: rgba(148, 131, 255, 0.6);
  }

  .no-data {
    color: var(--color-neutral-600);
    font-style: italic;
    text-align: center;
  }

  .settings-header {
    margin-bottom: 1rem;
    text-align: center;
  }
  .settings-header h2 {
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin: 0 0 0.25rem 0;
  }
  .settings-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    align-items: stretch;
  }
  @media (min-width: 860px) {
    .settings-cards {
      grid-template-columns: 1fr 1fr;
    }
  }

  .settings-card {
    padding: 1rem 1.1rem;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.06) 0%,
      rgba(255, 255, 255, 0.03) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 14px;
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.25),
      inset 0 1px 1px rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .settings-card h3 {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin: 0 0 0.25rem 0;
  }
  .settings-card .subtle {
    margin: 0 0 0.75rem 0;
    color: var(--text-tertiary);
    opacity: 0.9;
    font-size: 0.9rem;
  }

  .card-header {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: grid;
    gap: 0.5rem;
  }
  .field label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
    align-items: center;
  }

  .input-row input[type='email'] {
    padding: 0.65rem 0.8rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.25);
    color: white;
    width: 100%;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;
  }
  .input-row input[type='email']:focus {
    outline: none;
    border-color: rgba(148, 131, 255, 0.7);
    background: rgba(0, 0, 0, 0.35);
  }

  .button-group {
    display: flex;
    gap: 0.6rem;
  }

  .button.secondary {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .button.secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .hint {
    font-size: 0.85rem;
    opacity: 0.85;
    margin: 0;
  }

  .settings-card .button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: auto;
    align-self: flex-start;
    flex: 0 0 auto;
    padding: 0.65rem 0.8rem;
    border-radius: 10px;
    box-shadow: none;
  }

  .danger-card {
    border: 1px solid rgba(255, 77, 109, 0.35);
    background: linear-gradient(135deg, rgba(255, 77, 109, 0.06), rgba(255, 255, 255, 0.02));
  }
  .danger-card .card-header {
    margin-bottom: 0.25rem;
  }
  .danger-card .more-info {
    margin: 0 0 0.75rem 0;
  }

  .danger-button {
    background-image: linear-gradient(
      45deg,
      var(--color-error-dark) 0%,
      var(--color-error-darker) 51%,
      var(--color-error-dark) 100%
    );
    box-shadow: 0px 0px 14px -7px var(--color-error-dark);
    margin: 0 auto;
  }

  .disabled {
    background: var(--color-neutral-950) !important;
    color: var(--color-neutral-600) !important;
    border-color: var(--color-gray-border) !important;
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
    transition: none;
  }
</style>
