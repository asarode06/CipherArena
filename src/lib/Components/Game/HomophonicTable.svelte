<script>
  import { isLetter } from '$shared/CipherUtil';

  // Deliberately NOT wired to the shared info.letterInputs/letterFocus dict that the inline
  // ciphertext positions use — this is a personal scratchpad for working out candidate letters,
  // same as PolybiusSquare/CheckerboardTable, not a shortcut that auto-fills the puzzle. Filling
  // in a cell here has no effect on the actual answer; the player still has to type each letter
  // into the real per-position inputs under the ciphertext to submit.
  let { autoFocus, clearPolybius, resetClear } = $props();

  let inputs = $state([]);
  let cellValues = $state({});
  let cellFocus = $state({});

  const codes = Array.from({ length: 100 }, (_, i) => {
    const number = i + 1;
    return number === 100 ? '00' : String(number).padStart(2, '0');
  });

  function onChange(code, value, index) {
    cellValues[code] = value;

    if (autoFocus && value !== '') {
      let currIndex = index;
      while (currIndex + 1 < inputs.length) {
        currIndex++;
        if (!inputs[currIndex]?.value) break;
      }
      inputs[currIndex]?.focus();
    }
  }

  function onFocus(code, focus) {
    cellFocus[code] = focus;
  }

  const GRID_COLUMNS = 25;

  // No wrap-around here (unlike autoFocus's advance-to-next-empty search below, which is fine to
  // run off the end) — arrow keys clamp at the grid edges instead of jumping to the other side.
  function onArrow(key, index) {
    let nextIndex = index;
    if (key === 'ArrowRight' || key === ' ' || key === 'Tab') {
      nextIndex = index + 1;
    } else if (key === 'ArrowLeft') {
      nextIndex = index - 1;
    } else if (key === 'ArrowUp') {
      nextIndex = index - GRID_COLUMNS;
    } else if (key === 'ArrowDown') {
      nextIndex = index + GRID_COLUMNS;
    }

    if (nextIndex < 0 || nextIndex >= codes.length) return;
    inputs[nextIndex]?.focus();
  }

  function handleKeyDown(event, code, index) {
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === ' ' ||
      event.key === 'Tab'
    ) {
      onArrow(event.key, index);
      event.preventDefault();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange(code, '', index);
      return;
    }

    if (!isLetter(event.key)) {
      event.preventDefault();
      return;
    }

    if (event.key.length === 1) {
      onChange(code, event.key.toUpperCase(), index);
      event.preventDefault();
    }
  }

  function handleInput(event, code, index) {
    let character = event.data;
    if (character != null && isLetter(character)) character = character.toUpperCase();
    onChange(code, character, index);
  }

  function handleFocus(code) {
    onFocus(code, true);
  }

  function handleBlur(code) {
    onFocus(code, false);
  }

  function handleCellClick(index) {
    inputs[index]?.focus();
  }

  $effect(() => {
    if (clearPolybius) {
      cellValues = {};
      resetClear();
    }
  });
</script>

<div class="referenceTable">
  <div class="grid">
    {#each codes as code, index}
      <div
        class="cell"
        class:selected={cellFocus[code]}
        onclick={() => handleCellClick(index)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleCellClick(index);
        }}
        role="button"
        tabindex="-1"
      >
        <div class="code-label">{code}</div>
        <input
          bind:this={inputs[index]}
          type="text"
          placeholder="="
          maxlength="1"
          bind:value={cellValues[code]}
          oninput={(e) => handleInput(e, code, index)}
          onkeydown={(e) => handleKeyDown(e, code, index)}
          onfocus={() => handleFocus(code)}
          onblur={() => handleBlur(code)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .referenceTable {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    margin: 1rem auto;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(25, minmax(2.2rem, 1fr));
    min-width: 55rem;
    background-color: var(--table-header-bg);
    border-radius: 0.5rem;
    overflow: hidden;
    border-top: 1px solid var(--table-border-color);
    border-left: 1px solid var(--table-border-color);
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    border-bottom: 1px solid var(--table-border-color);
    border-right: 1px solid var(--table-border-color);
    padding: 0.4rem 0.15rem;
    cursor: pointer;
  }

  .cell.selected {
    background-color: var(--table-highlight-bg);
  }

  .cell:hover {
    background-color: var(--glass-bg);
  }

  .cell:nth-child(1) {
    border-top-left-radius: 0.5rem;
  }
  .cell:nth-child(25) {
    border-top-right-radius: 0.5rem;
  }
  .cell:nth-child(76) {
    border-bottom-left-radius: 0.5rem;
  }
  .cell:nth-child(100) {
    border-bottom-right-radius: 0.5rem;
  }

  .code-label {
    font-family: 'Source Code Pro', monospace;
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-bottom: 0.2rem;
  }

  .cell input {
    width: 100%;
    max-width: 1.4rem;
    text-align: center;
    background-color: transparent;
    border: none;
    outline: none;
    caret-color: transparent;
    color: var(--text-primary);
    font-family: 'Source Code Pro', monospace !important;
    font-size: 0.95rem;
  }

  .cell input::placeholder {
    color: var(--text-muted);
  }
</style>
