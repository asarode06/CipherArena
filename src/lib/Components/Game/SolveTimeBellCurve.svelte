<script>
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  Chart.register(...registerables);

  /**
   * Analytic bell curve (normal approximation) of solve times for this cryptogram, built from
   * (mean, std) alone — no raw samples are stored or plotted. Zone boundaries MUST match
   * classifyPerformance()'s thresholds (±0.5σ, ±1.5σ) in quoteStatsUtil.js, or this chart and the
   * "Performance" badge will disagree about what counts as "Fast".
   */
  // `formatValue` MUST match the unit `mean`/`std`/`yourTime` are actually in — this component is
  // reused for two different quantities: whole-puzzle solve time in seconds (singleplayer results,
  // where mm:ss reads naturally), and seconds-per-character (the profile page's cross-quote rate,
  // typically << 1). Hardcoding mm:ss formatting broke the profile usage: values like 0.02–1.68
  // all round to "0:00"/"0:01", collapsing several zone boundaries onto the same label.
  let {
    mean,
    std,
    yourTime,
    solves = 0,
    emptyMessage = 'Not enough solves yet to show a distribution. Check back soon!',
    formatValue = formatTime,
    // Optional: { veryFast, fast, average, slow, verySlow } sample counts per zone, keyed the same
    // as classifyPerformance()'s bucket names. Only the profile page passes this (it has the raw
    // per-user samples on hand to bucket); the singleplayer results page doesn't, since QuoteStats
    // deliberately stores no raw samples — see docs/singleplayer-stats-plan.md §3.
    zoneCounts = null,
    // Optional: the true max of the raw samples. The axis's own scale/range stays exactly
    // mean + SPAN_SIGMA*std regardless (letting one outlier stretch it would squash "Very Fast"
    // through "Slow" into a sliver to make room) — this only drives the "outlier" badge below,
    // shown when real data exists past what the chart's scale actually covers.
    actualMax = null,
  } = $props();

  const MIN_SAMPLES = 3;
  const POINTS = 80;
  const SPAN_SIGMA = 3.2;
  const MIN_ZONE_LABEL_WIDTH_PX = 22; // skip drawing a count if its band is too narrow to hold it

  // Lifted out of renderChart() so the "outlier beyond the chart" badge (plain Svelte markup, not
  // canvas-drawn) can compare actualMax against the same xMax the chart itself uses, without
  // duplicating the formula and risking the two drifting apart.
  let xMax = $derived(mean + SPAN_SIGMA * std);
  let hasOutlierBeyondScale = $derived(actualMax != null && actualMax > xMax);

  const ZONES = [
    { key: 'veryFast', label: 'Very Fast', fill: 'rgba(54, 214, 125, 0.35)', dot: '#36d67d' },
    { key: 'fast', label: 'Fast', fill: 'rgba(74, 222, 222, 0.3)', dot: '#4adede' },
    { key: 'average', label: 'Average', fill: 'rgba(170, 170, 170, 0.22)', dot: '#aaaaaa' },
    { key: 'slow', label: 'Slow', fill: 'rgba(255, 249, 78, 0.28)', dot: '#fff94e' },
    { key: 'verySlow', label: 'Very Slow', fill: 'rgba(255, 77, 79, 0.32)', dot: '#ff4d4f' },
  ];

  let chart;
  let canvasEl = $state();
  let renderable = $derived(solves >= MIN_SAMPLES && std > 0 && Number.isFinite(mean));

  // Default formatter: mm:ss, correct for the singleplayer (raw-seconds) usage.
  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function normalPdf(x, m, s) {
    const z = (x - m) / s;
    return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
  }

  function renderChart() {
    if (chart) chart.destroy();
    if (!renderable) return;

    const xMin = Math.max(0, mean - SPAN_SIGMA * std);
    // xMax itself is the component-level $derived above — reused here rather than
    // recomputed, so the chart's own geometry and the outlier badge's comparison can never drift.
    const step = (xMax - xMin) / (POINTS - 1);
    const points = Array.from({ length: POINTS }, (_, i) => {
      const x = xMin + i * step;
      return { x, y: normalPdf(x, mean, std) };
    });

    const bounds = [
      xMin,
      mean - 1.5 * std,
      mean - 0.5 * std,
      mean + 0.5 * std,
      mean + 1.5 * std,
      xMax,
    ].map((v) => Math.min(Math.max(v, xMin), xMax));

    const zonesPlugin = {
      id: 'speedZones',
      beforeDatasetsDraw(c) {
        const { ctx, chartArea, scales } = c;
        ctx.save();
        for (let i = 0; i < ZONES.length; i++) {
          const xStart = scales.x.getPixelForValue(bounds[i]);
          const xEnd = scales.x.getPixelForValue(bounds[i + 1]);
          ctx.fillStyle = ZONES[i].fill;
          ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
        }
        ctx.restore();
      },
      // Drawn after the curve, not in beforeDatasetsDraw with the band fills, so a count near the
      // curve's peak never ends up hidden underneath its fill.
      afterDatasetsDraw(c) {
        if (!zoneCounts) return;
        const { ctx, chartArea, scales } = c;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const midY = chartArea.top + (chartArea.bottom - chartArea.top) * 0.68;
        for (let i = 0; i < ZONES.length; i++) {
          const count = zoneCounts[ZONES[i].key] ?? 0;
          const xStart = scales.x.getPixelForValue(bounds[i]);
          const xEnd = scales.x.getPixelForValue(bounds[i + 1]);
          if (xEnd - xStart < MIN_ZONE_LABEL_WIDTH_PX) continue;
          ctx.fillText(String(count), (xStart + xEnd) / 2, midY);
        }
        ctx.restore();
      },
    };

    const yourTimePlugin = {
      id: 'yourTime',
      afterDatasetsDraw(c) {
        if (yourTime == null) return;
        const { ctx, chartArea, scales } = c;
        const x = scales.x.getPixelForValue(Math.min(Math.max(yourTime, xMin), xMax));
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('You', x, chartArea.top - 6);
        ctx.restore();
      },
    };

    chart = new Chart(canvasEl, {
      type: 'line',
      data: {
        datasets: [
          {
            data: points,
            borderColor: 'rgba(188, 174, 255, 1)',
            backgroundColor: 'rgba(188, 174, 255, 0.15)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'linear',
            min: xMin,
            max: xMax,
            afterBuildTicks: (scale) => {
              // One tick per zone boundary instead of Chart.js's auto-spaced ticks, so the labels
              // line up with the colored bands rather than arbitrary round numbers. A boundary MAY
              // clamp to xMin/xMax (e.g. mean - 1.5σ going negative for a wide, low-mean
              // distribution) and land close enough to its neighbor to overlap into an unreadable
              // jumble — skip any tick too close to one already kept. This MUST use value-space
              // distance against the already-known xMin/xMax, not scale.getPixelForValue(): at the
              // afterBuildTicks stage Chart.js hasn't finished computing the axis's real pixel
              // geometry yet, so pixel positions read here aren't reliable.
              const MIN_TICK_GAP = (xMax - xMin) * 0.08;
              let lastKept = -Infinity;
              scale.ticks = bounds
                .filter((value) => {
                  if (value - lastKept < MIN_TICK_GAP) return false;
                  lastKept = value;
                  return true;
                })
                .map((value) => ({ value }));
            },
            ticks: {
              color: '#d0d0ff',
              font: { family: 'Rubik', size: 11 },
              callback: (v) => formatValue(v),
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: { display: false },
        },
      },
      plugins: [zonesPlugin, yourTimePlugin],
    });
  }

  $effect(() => {
    if (canvasEl) renderChart();
  });

  onMount(() => {
    if (canvasEl) renderChart();
  });
</script>

{#if renderable}
  <div class="bell-curve-container">
    <canvas bind:this={canvasEl}></canvas>
    {#if hasOutlierBeyondScale}
      <span class="outlier-badge" title="At least one solve falls beyond this chart's scale">
        → up to {formatValue(actualMax)}
      </span>
    {/if}
  </div>
  <div class="zone-legend">
    {#each ZONES as zone}
      <span class="legend-item">
        <span class="legend-dot" style="background: {zone.dot}"></span>
        {zone.label}
      </span>
    {/each}
  </div>
{:else}
  <p class="not-enough-data">{emptyMessage}</p>
{/if}

<style>
  .bell-curve-container {
    max-width: 600px;
    height: 220px;
    margin: 0.5rem auto 0;
    padding: 1rem;
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 16px;
    box-shadow: 0 0 25px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    position: relative;
  }

  /* Flags real data beyond the chart's own scale (see hasOutlierBeyondScale) without stretching
     the axis to fit it — stretching would squash every other zone into a sliver just to make room
     for one outlier. */
  .outlier-badge {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  canvas {
    width: 100% !important;
    height: 100% !important;
    font-family: 'Rubik', sans-serif !important;
  }

  .zone-legend {
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

  .not-enough-data {
    text-align: center;
    color: var(--text-tertiary);
    font-style: italic;
    font-size: 0.9rem;
    margin: 0.5rem 0 0;
  }
</style>
