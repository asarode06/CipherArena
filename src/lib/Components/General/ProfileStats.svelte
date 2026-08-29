<script>
  import { cipherTypes } from '$shared/CipherTypes.js';
  // `statMode` is bindable so a parent (e.g. the profile page, gating Speed Records/Speed Profile
  // to singleplayer only) can read which mode is currently selected here.
  let { stats, singleStats, simple = false, statMode = $bindable('multiplayer') } = $props();

  const orderedStatKeys = ['All', ...Object.keys(cipherTypes)];

  function winPercent(stat) {
    const info = stat ?? { wins: 0, losses: 0, total: 0 };
    let total = 0;
    if (statMode == 'multiplayer') {
      total = (info.wins ?? 0) + (info.losses ?? 0);
    } else {
      total = info.total;
    }

    const winPct = total === 0 ? 0 : (info.wins / total) * 100;
    return winPct.toFixed(2) + '%';
  }

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function getStat(cipher) {
    return statMode === 'multiplayer' ? stats?.[cipher] : singleStats?.[cipher];
  }
</script>

{#if !simple}
  <div class="note-wrapper">
    {#if statMode === 'singleplayer'}
      <p class="note-inline empty">* Singleplayer stats do not count towards leaderboard.</p>
    {/if}
  </div>

  <div class="stat-mode-selector">
    <button class:selected={statMode === 'multiplayer'} onclick={() => (statMode = 'multiplayer')}
      >Multiplayer</button
    >
    <button class:selected={statMode === 'singleplayer'} onclick={() => (statMode = 'singleplayer')}
      >Singleplayer</button
    >
  </div>
{/if}

<div class="table-wrapper">
  <table class="leaderboard-table">
    <thead>
      <tr>
        <th>Cipher</th>
        {#if statMode === 'multiplayer'}
          <th>Elo</th>
        {/if}
        <th>{statMode === 'singleplayer' ? 'Solves' : 'Wins'}</th>
        {#if statMode === 'multiplayer'}
          <th>Losses</th>
        {/if}
        <th>{statMode === 'singleplayer' ? 'Solve Rate' : 'Win %'}</th>
        <th>Avg Seconds Per Char</th>
        <th>Best Time</th>
      </tr>
    </thead>
    <tbody>
      {#each orderedStatKeys as cipher}
        <tr class="table-row">
          <td><strong>{cipher}</strong></td>
          {#if statMode === 'multiplayer'}
            <td>{getStat(cipher)?.elo ?? 1000}</td>
          {/if}
          <td
            >{getStat(cipher)?.wins ?? 0}{statMode == 'singleplayer' && getStat(cipher)?.total > 0
              ? ' / ' + getStat(cipher).total
              : ''}</td
          >
          {#if statMode === 'multiplayer'}
            <td>{getStat(cipher)?.losses ?? 0}</td>
          {/if}
          <td>{winPercent(getStat(cipher))}</td>
          <td
            >{getStat(cipher)?.averageSolveTime
              ? getStat(cipher).averageSolveTime.toFixed(2)
              : 'N/A'}</td
          >
          <td>{formatTime(getStat(cipher)?.bestSolveTime)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .note-wrapper {
    height: 1.25rem;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .note-inline {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
  }

  .stat-mode-selector {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .stat-mode-selector button {
    padding: 0.4rem 0.8rem;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .stat-mode-selector button.selected {
    background: var(--color-primary-muted);
    border-color: var(--color-primary-border);
  }

  .table-wrapper {
    overflow-x: auto;
    margin-top: 1rem;
  }

  .leaderboard-table {
    width: 100%;
    border-collapse: collapse;
  }

  .leaderboard-table th,
  .leaderboard-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--glass-bg-hover);
    vertical-align: middle;
    text-align: center;
  }

  .leaderboard-table th:first-child,
  .leaderboard-table td:first-child {
    text-align: left;
  }

  .table-row {
    transition: background-color 0.2s ease;
  }

  .table-row:hover {
    background-color: var(--glass-bg);
  }
</style>
