<script>
  /**
   * Speed Records + Speed Profile, built from a single already-fetched UserQuoteInsights document
   * (docs/singleplayer-stats-plan.md §8). This component MUST NOT query — it only formats what
   * the server already loaded.
   */
  let { quoteInsights } = $props();

  const SPEED_LABELS = [
    { key: 'veryFast', label: 'Very Fast', className: 'bucket-great' },
    { key: 'fast', label: 'Fast', className: 'bucket-good' },
    { key: 'average', label: 'Average', className: 'bucket-average' },
    { key: 'slow', label: 'Slow', className: 'bucket-slow' },
    { key: 'verySlow', label: 'Very Slow', className: 'bucket-bad' },
  ];

  const MIN_SAMPLES_FOR_PROFILE = 5;

  function speedTitle(avgZ) {
    if (avgZ < -1) return 'Speed Demon';
    if (avgZ < -0.3) return 'Quick Solver';
    if (avgZ <= 0.3) return 'Steady Solver';
    if (avgZ <= 1) return 'Careful Solver';
    return 'Methodical Solver';
  }

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  let recordCount = $derived(quoteInsights?.recordCount ?? 0);
  let records = $derived(quoteInsights?.records ?? []);
  let zScoreCount = $derived(quoteInsights?.zScoreCount ?? 0);
  let avgZ = $derived(zScoreCount > 0 ? quoteInsights.zScoreSum / zScoreCount : 0);
  let bucketTotal = $derived(
    SPEED_LABELS.reduce((sum, { key }) => sum + (quoteInsights?.speedBuckets?.[key] ?? 0), 0)
  );
</script>

<div class="quote-insights">
  <section class="insight-section">
    <h3>Speed Records</h3>
    {#if recordCount > 0}
      <p class="section-note">
        Holds the record on {recordCount} cryptogram{recordCount === 1 ? '' : 's'}.
        {#if records.length < recordCount}
          Showing the {records.length} most recent.
        {/if}
      </p>
      <ul class="records-list">
        {#each records.slice().reverse() as record}
          <li class="record-row">
            <a class="cipher-badge" href="/singleplayer/{record.cipherType}">{record.cipherType}</a>
            <span class="record-snippet"
              >“{record.snippet}{record.snippet?.length >= 60 ? '…' : ''}”
              {#if record.author}<span class="record-author">— {record.author}</span>{/if}</span
            >
            <span class="record-time">{formatTime(record.time)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="section-note empty">No speed records yet. Solve some cryptograms to claim one!</p>
    {/if}
  </section>

  <section class="insight-section">
    <h3>Speed Profile</h3>
    {#if zScoreCount >= MIN_SAMPLES_FOR_PROFILE}
      <p class="speed-title">{speedTitle(avgZ)}</p>
      <p class="section-note">
        Solves this fast relative to everyone else who's played the same cryptograms.
      </p>
      {#if bucketTotal > 0}
        <div
          class="speed-bar"
          role="img"
          aria-label="Distribution of solve speed vs. other players"
        >
          {#each SPEED_LABELS as { key, className }}
            {@const count = quoteInsights?.speedBuckets?.[key] ?? 0}
            {#if count > 0}
              <span
                class="speed-segment {className}"
                style="width: {(count / bucketTotal) * 100}%"
                title="{SPEED_LABELS.find((s) => s.key === key)?.label}: {count}"
              ></span>
            {/if}
          {/each}
        </div>
        <div class="speed-legend">
          {#each SPEED_LABELS as { key, label, className }}
            <span class="legend-item">
              <span class="legend-dot {className}"></span>
              {label} ({quoteInsights?.speedBuckets?.[key] ?? 0})
            </span>
          {/each}
        </div>
      {/if}
    {:else}
      <p class="section-note empty">Solve a few more cryptograms to unlock your speed profile.</p>
    {/if}
  </section>
</div>

<style>
  .quote-insights {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
  }

  .insight-section h3 {
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin: 0 0 0.75rem 0;
  }

  .section-note {
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.9rem;
    margin: 0 0 1rem 0;
  }

  .section-note.empty {
    font-style: italic;
  }

  /* Capped at 10 server-side (see quoteStatsUtil.js's RECORDS_CAP) — this keeps the section
     itself a fixed size regardless of record count, scrolling internally instead of pushing
     everything below it down the page. */
  .records-list {
    list-style: none;
    margin: 0;
    padding: 0 0.25rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-height: 20rem;
    overflow-y: auto;
  }

  .record-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.9rem;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 10px;
  }

  .cipher-badge {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: var(--color-primary-muted);
    border: 1px solid var(--color-primary-border);
    color: var(--text-primary);
    font-size: 0.75rem;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }

  .record-snippet {
    flex: 1 1 auto;
    font-size: 0.9rem;
    color: var(--text-secondary);
    min-width: 0;
  }

  .record-author {
    color: var(--text-muted);
  }

  .record-time {
    font-weight: 700;
    white-space: nowrap;
  }

  .speed-title {
    text-align: center;
    font-size: 1.4rem;
    font-weight: 700;
    margin: 0 0 0.25rem 0;
    color: var(--color-purple-soft);
  }

  .speed-bar {
    display: flex;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    height: 14px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
  }

  .speed-segment {
    height: 100%;
  }

  .speed-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem 1.25rem;
    margin-top: 0.75rem;
    font-size: 0.8rem;
    color: var(--text-tertiary);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  /* Same hex values as SolveTimeBellCurve.svelte's ZONES dots, so the two speed-bucket visuals
     (this bar and that chart) read as the same color language rather than coincidentally similar. */
  .bucket-great {
    background: #36d67d;
  }

  .bucket-good {
    background: #4adede;
  }

  .bucket-average {
    background: #aaaaaa;
  }

  .bucket-slow {
    background: #fff94e;
  }

  .bucket-bad {
    background: #ff4d4f;
  }
</style>
