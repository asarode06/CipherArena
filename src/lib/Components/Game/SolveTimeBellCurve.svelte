<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  Chart.register(...registerables);

  /**
   * Analytic bell curve (normal approximation) of solve times for this cryptogram, built from
   * (mean, std) alone — no raw samples are stored or plotted, EXCEPT the outliers Tukey's fences
   * excluded from that estimate (see the profile page's splitOutliers), which are hidden by
   * default and revealed as real points via the expand toggle rather than folded into the curve's
   * shape. Zone boundaries MUST match classifyPerformance()'s thresholds (±0.5σ, ±1.5σ) in
   * quoteStatsUtil.js, or this chart and the "Performance" badge will disagree about what counts
   * as "Fast".
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
    // Optional: raw values Tukey's fences excluded from the (mean, std) estimate — real solves,
    // just not folded into the curve's shape. The expand toggle below reveals them as points on a
    // widened axis instead of only naming the max.
    outliers = [],
  } = $props();

  const MIN_SAMPLES = 3;
  const POINTS = 80;
  const SPAN_SIGMA = 3.2;
  const MIN_ZONE_LABEL_WIDTH_PX = 22; // skip drawing a count if its band is too narrow to hold it

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

  // Expand/collapse the axis to reveal outliers as real points instead of leaving them folded out
  // of the curve. `expanded` is the target state (drives the HTML button's own CSS transitions);
  // `animProgress` is what the chart geometry below actually reads, tweened smoothly between 0
  // and 1 by a manual rAF loop (see toggleExpanded). Chart.js does NOT natively animate axis
  // range changes — only dataset values, and only when it can correlate old/new elements — so
  // relying on chart.update()'s own animation here just snaps instantly; driving xMax ourselves,
  // frame by frame, is what makes the bands/curve/points actually animate.
  let expanded = $state(false);
  let animProgress = $state(0);
  let hasOutliers = $derived(outliers.length > 0);
  let outlierMax = $derived(hasOutliers ? Math.max(...outliers) : null);

  // Pixel `top` for the HTML toggle button, read from Chart.js's own computed chartArea after
  // each render rather than approximated as a CSS percentage of the container. chartArea is
  // SMALLER than the canvas itself — Chart.js auto-reserves extra space at the bottom for the
  // x-axis tick labels, an amount that isn't exposed as a simple constant — so a hand-picked CSS
  // percentage of container height reliably lands at the wrong spot relative to the zone-count
  // numbers, which are drawn at 0.68 of chartArea, not of the container.
  let buttonTopPx = $state(0);

  let xMin = $derived(Math.max(0, mean - SPAN_SIGMA * std));
  let collapsedXMax = $derived(mean + SPAN_SIGMA * std);
  // +8% headroom past the outlier max so its point doesn't land flush against the canvas edge.
  let expandedXMax = $derived(hasOutliers ? outlierMax * 1.08 : collapsedXMax);
  // The interpolated value everything else (bounds, curve sampling, ticks) actually reads.
  let xMax = $derived(
    hasOutliers ? collapsedXMax + (expandedXMax - collapsedXMax) * animProgress : collapsedXMax
  );

  // The curve's peak height depends only on (mean, std) — normalPdf's own maximum, at x=mean —
  // never on xMax/animProgress. Without an explicit y-scale range, Chart.js auto-scales the
  // y-axis from whatever the 80 CURRENTLY SAMPLED points produce; since the sampling grid shifts
  // slightly every frame as xMax grows, the auto-computed "nice" max can drift frame to frame,
  // remapping the same true peak to a different pixel height each time — perceived as the curve
  // "rising." Fixing the range once here removes that source of jitter entirely.
  let peakY = $derived(std > 0 ? 1 / (std * Math.sqrt(2 * Math.PI)) : 0);

  let bounds = $derived(
    [xMin, mean - 1.5 * std, mean - 0.5 * std, mean + 0.5 * std, mean + 1.5 * std, xMax].map((v) =>
      Math.min(Math.max(v, xMin), xMax)
    )
  );

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

  function buildCurvePoints() {
    const step = (xMax - xMin) / (POINTS - 1);
    return Array.from({ length: POINTS }, (_, i) => {
      const x = xMin + i * step;
      return { x, y: normalPdf(x, mean, std) };
    });
  }

  function buildConfig() {
    const datasets = [
      {
        data: buildCurvePoints(),
        borderColor: 'rgba(188, 174, 255, 1)',
        backgroundColor: 'rgba(188, 174, 255, 0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      },
    ];

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
        const { ctx, chartArea, scales } = c;
        const midY = chartArea.top + (chartArea.bottom - chartArea.top) * 0.68;

        // Collapsed + has outliers: fade the right edge to transparent (band and curve both) —
        // the same way a torn-off photo edge implies "there's more, just not shown." The HTML
        // toggle button (outside the canvas) carries the actual max and the click affordance.
        // Alpha tied to (1 - animProgress) rather than a plain on/off — fades out in step with
        // the rest of the expand animation instead of snapping away on the first frame.
        if (hasOutliers && animProgress < 1) {
          const fadeStrength = 1 - animProgress;
          const fadeWidth = (chartArea.right - chartArea.left) * 0.15;
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          const fade = ctx.createLinearGradient(chartArea.right - fadeWidth, 0, chartArea.right, 0);
          fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
          fade.addColorStop(1, `rgba(0, 0, 0, ${fadeStrength})`);
          ctx.fillStyle = fade;
          ctx.fillRect(
            chartArea.right - fadeWidth,
            chartArea.top,
            fadeWidth,
            chartArea.bottom - chartArea.top
          );
          ctx.restore();
        }

        if (!zoneCounts) return;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
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

    // Each excluded outlier drawn as a small pin (stem + head) rising from the baseline, rather
    // than a plain point — Chart.js's native point styles don't offer a compound shape like this,
    // so it's hand-drawn here instead of as a dataset. Growing/fading in with animProgress reads
    // as the pins rising up out of the axis as the chart expands.
    const outlierPinsPlugin = {
      id: 'outlierPins',
      afterDatasetsDraw(c) {
        if (!hasOutliers || animProgress <= 0) return;
        const { ctx, chartArea, scales } = c;
        const STEM_HEIGHT = 16;
        const HEAD_RADIUS = 5;
        const stemHeight = STEM_HEIGHT * animProgress;
        const headRadius = HEAD_RADIUS * animProgress;
        const baseY = chartArea.bottom;
        const headY = baseY - stemHeight;

        ctx.save();
        for (const v of outliers) {
          const x = scales.x.getPixelForValue(Math.min(Math.max(v, xMin), xMax));

          ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * animProgress})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.lineTo(x, headY);
          ctx.stroke();

          ctx.shadowColor = `rgba(255, 99, 102, ${0.7 * animProgress})`;
          ctx.shadowBlur = 7;
          ctx.beginPath();
          ctx.arc(x, headY, headRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 99, 102, ${0.95 * animProgress})`;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${animProgress})`;
          ctx.stroke();
        }
        ctx.restore();
      },
    };

    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Off deliberately — the expand/collapse transition is driven manually frame-by-frame
        // (see toggleExpanded), and letting Chart.js's own animation run at the same time would
        // just fight it (each renderChart() call already represents one already-interpolated
        // frame, not a target state to animate toward). The top-level `animation: false` alone
        // doesn't reliably suppress Chart.js's own "reveal" animation for elements it treats as
        // newly-appearing (which every point here technically is each frame, since buildConfig()
        // constructs fresh dataset arrays) — explicitly zeroing the initial-load transition too.
        animation: false,
        animations: { initial: { duration: 0 } },
        // Reserved right padding for the outlier toggle button — sized for the full "▸ up to
        // 0.78s/char" label when collapsed, shrunk to just enough for the arrow once expanded (no
        // label left to make room for). This value itself SNAPS rather than smoothly animating —
        // Chart.js doesn't tween layout/padding the way it tweens scale range and dataset points —
        // but the curve/axis widening within that instantly-resized area still animates normally,
        // and the HTML button's own CSS transition (max-width/opacity) covers the rest visually.
        layout: { padding: { top: 18, right: hasOutliers ? (expanded ? 10 : 148) : 0 } },
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
              // 0.08 was tuned for a roughly evenly-spread set of ticks; the expanded axis breaks
              // that assumption (4 sigma-bounds clustered near the left, one outlier tick far to
              // the right), so the same fraction of the (now much larger) range no longer reserves
              // enough actual pixels near the cluster — bumped to give real text-width headroom.
              const MIN_TICK_GAP = (xMax - xMin) * 0.13;
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
          // Fixed, not auto-scaled — see the comment on peakY above.
          y: { display: false, min: 0, max: peakY * 1.05 },
        },
      },
      plugins: [zonesPlugin, yourTimePlugin, outlierPinsPlugin],
    };
  }

  // Update-in-place (chart.data/options mutated, then chart.update('none')) rather than destroy +
  // recreate — recreating always snaps instantly regardless. 'none' skips Chart.js's own
  // animation system entirely: every call here already represents one frame of an
  // already-computed state (either the plain end state for a genuine data change, or one step of
  // the manual rAF interpolation below), never something Chart.js itself should animate toward.
  function renderChart() {
    if (!renderable) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      return;
    }
    const config = buildConfig();
    if (!chart) {
      chart = new Chart(canvasEl, config);
    } else {
      chart.data = config.data;
      chart.options = config.options;
      chart.update('none');
    }
    // chart.chartArea is populated synchronously by the layout pass inside new Chart()/update()
    // above (only the animation itself is deferred), so it's already current here. 16 = the
    // container's own CSS padding (1rem) — the canvas sits inset by that from the container's
    // edge, and the button is positioned relative to the container, not the canvas.
    const { top, bottom } = chart.chartArea;
    buttonTopPx = 16 + top + (bottom - top) * 0.68;
  }

  let rafId = null;

  // Manually tweens animProgress from its current value to `target` (0 or 1) over `durationMs`,
  // re-rendering the chart at every intermediate step — this is what actually makes the bands,
  // curve, and outlier points animate (see the comment on `animProgress` above for why Chart.js's
  // own animation system doesn't do this for an axis-range change on its own).
  function animateProgressTo(target, durationMs = 500) {
    if (rafId != null) cancelAnimationFrame(rafId);
    const start = animProgress;
    const startTime = performance.now();
    function tick(now) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      animProgress = start + (target - start) * eased;
      renderChart();
      rafId = t < 1 ? requestAnimationFrame(tick) : null;
    }
    rafId = requestAnimationFrame(tick);
  }

  function toggleExpanded() {
    expanded = !expanded;
    animateProgressTo(expanded ? 1 : 0);
  }

  $effect(() => {
    if (canvasEl) renderChart();
  });

  onMount(() => {
    if (canvasEl) renderChart();
  });

  onDestroy(() => {
    if (rafId != null) cancelAnimationFrame(rafId);
  });
</script>

{#if renderable}
  <div class="bell-curve-container">
    <canvas bind:this={canvasEl}></canvas>
    {#if hasOutliers}
      <button
        type="button"
        class="outlier-toggle"
        class:expanded
        style="top: {buttonTopPx}px"
        onclick={toggleExpanded}
        title={expanded
          ? 'Hide outliers'
          : `Show ${outliers.length} more, up to ${formatValue(outlierMax)}`}
      >
        <svg class="outlier-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="outlier-label">up to {formatValue(outlierMax)}</span>
      </button>
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

  canvas {
    width: 100% !important;
    height: 100% !important;
    font-family: 'Rubik', sans-serif !important;
  }

  /* `top` is set inline from buttonTopPx (computed from Chart.js's actual chartArea — see
     renderChart), not here, so it stays pixel-accurate to where the zone-count numbers are
     actually drawn rather than an approximated percentage of the container. Anchored by `right`,
     with its own max-width constrained to the canvas's reserved padding (see layout.padding.right
     in buildConfig) so it can never grow past that zone and get clipped by an ancestor's
     overflow:hidden — collapsing the label (below) then visually contracts the whole control
     toward the canvas edge instead of just fading in place. */
  .outlier-toggle {
    position: absolute;
    right: 0.6rem;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 9rem;
    overflow: hidden;
    background: none;
    border: none;
    padding: 0.2rem;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition:
      color 0.2s ease,
      max-width 0.4s ease;
  }

  .outlier-toggle.expanded {
    max-width: 1.5rem;
  }

  .outlier-toggle:hover {
    color: #ffffff;
  }

  .outlier-arrow {
    flex-shrink: 0;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .outlier-toggle.expanded .outlier-arrow {
    transform: rotate(180deg);
  }

  .outlier-label {
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
    max-width: 7rem;
    overflow: hidden;
    opacity: 1;
    transition:
      max-width 0.4s ease,
      opacity 0.25s ease,
      margin 0.4s ease;
  }

  .outlier-toggle.expanded .outlier-label {
    max-width: 0;
    opacity: 0;
    margin: 0;
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
