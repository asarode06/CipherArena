<script>
  import Letter from './Letter.svelte';
  import Timer from './Timer.svelte';
  import BaconianLetter from './BaconianLetter.svelte';
  import FreqTable from './FreqTable.svelte';
  import Container from '../General/Container.svelte';
  import { isSolvableChunk } from '$shared/CipherUtil';
  import { cipherTypes } from '$shared/CipherTypes';
  import LoadingOverlay from '../General/LoadingOverlay.svelte';
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import AtbashTable from './AtbashTable.svelte';
  import BaconianTable from './BaconianTable.svelte';
  import PortaTable from './PortaTable.svelte';
  import CaesarTable from './CaesarTable.svelte';
  import PolybiusSquare from './PolybiusSquare.svelte';
  import CheckerboardTable from './CheckerboardTable.svelte';
  import DeterminantTable from './DeterminantTable.svelte';
  import MatrixInput from './MatrixInput.svelte';
  import AffineInput from './AffineInput.svelte';
  import Calculator from './Calculator.svelte';
  import MorseTable from './MorseTable.svelte';
  import MorseLetter from './MorseLetter.svelte';
  import HomophonicTable from './HomophonicTable.svelte';
  import { debounce } from '$lib/util/helpers.js';
  import { MATH_INTENSIVE_CIPHERS, GAME_MODES } from '$lib/util/constants.js';
  import {
    initQuote,
    initLetterInputs,
    initLetterFocus,
    initLettersWithIndices,
    getDirectMap,
    paramToString,
    getNextInputIndex,
    getNextEmptyInputIndex,
    getInputText,
    calculateProgress,
  } from '$lib/util/cipherUtils.js';

  /**
   * Maps `cipherTypes[cipherType]['letterComponent']` to the widget that renders each ciphertext
   * position. Most ciphers use the generic `Letter`; a cipher whose ciphertext units aren't
   * single typed letters (Baconian's A/B toggles, Fractionated Morse's multi-slot trigram inputs)
   * registers its own key here instead of Cipher.svelte hardcoding a per-cipherType branch.
   */
  const LETTER_COMPONENTS = {
    default: Letter,
    baconian: BaconianLetter,
    morse: MorseLetter,
  };

  let {
    quote,
    hash,
    cipherType,
    autoFocus,
    params,
    keys,
    onSolved,
    mode,
    fetchAnswerStatus,
    onProgressUpdate,
    crib = {},
  } = $props();
  let spanish = cipherType == 'Xenocrypt';
  let startTime = Date.now() / 1000;
  let solved = $state(false);
  let isChecking = $state(false);
  let submissionError = $state(false);
  let clearPolybius = $state(false);
  let finalTime = $state(null);
  let debouncedProgressUpdate;
  let initialQuote = initQuote(quote, cipherTypes[cipherType]['spacing'], cipherType);
  let initialTrim = initialQuote.filter((c) => c !== ' ');

  let info = $state({
    cipherText: initialQuote,
    cipherTextTrim: initialTrim,
    letterInputs: initLetterInputs(cipherType, initialTrim, spanish),
    letterFocus: initLetterFocus(cipherType, initialTrim, spanish),
    inputs: [],
  });

  let lettersWithIndices = initLettersWithIndices(initialQuote, cipherType, keys);
  let directMap = getDirectMap(cipherType);
  let paramString = paramToString(params);
  let LetterComponent = $derived(
    LETTER_COMPONENTS[cipherTypes[cipherType]['letterComponent']] ?? Letter
  );

  const showCalculatorButton = MATH_INTENSIVE_CIPHERS.includes(cipherType);
  let calculatorVisible = $state(false);
  let calculatorPosition = $state({ x: 50, y: 50 });
  let mainInputElement;
  let cipherFocused = $state(false);
  let calculatorFocused = $state(false);
  let lastFocusedInputIndex = $state(-1);

  function clearQuote() {
    info.letterInputs = initLetterInputs(cipherType, info.cipherTextTrim, spanish);
    for (let input of info.inputs) {
      if (input != undefined) {
        input.value = '';
      }
    }

    if (mode === GAME_MODES.MULTIPLAYER) {
      debouncedProgressUpdate();
    }

    if (cipherType == 'Nihilist' || cipherType == 'Checkerboard' || cipherType == 'Homophonic') {
      clearPolybius = true;
    }

    if (cipherType === 'Fractionated Morse') {
      info.trigramInputs = {};
    }
  }

  function onArrow(key, index) {
    const nextIndex = getNextInputIndex(
      key,
      index,
      info.inputs,
      info.cipherTextTrim,
      cipherType,
      directMap
    );
    info.inputs[nextIndex]?.focus();
  }

  function onFocus(letter, focus) {
    if (!directMap) return;
    info.letterFocus[letter] = focus;
  }

  let cipherToTrigram = $derived(
    Object.entries(info.trigramInputs || {}).reduce((acc, [t, c]) => {
      acc[c] = t;
      return acc;
    }, {})
  );

  let slotDistribution = $derived.by(() => {
    if (cipherType !== 'Fractionated Morse') return {};

    const stream = info.cipherText
      .map((c) =>
        cipherToTrigram[c]
          ? cipherToTrigram[c].replace(/\./g, '●').replace(/-/g, '–').replace(/x/g, '×')
          : '   '
      )
      .join('');

    const slots = [];
    const validCharRegex = /([●–]+)|(×(?:\s*×)+)/g;
    let match;

    while ((match = validCharRegex.exec(stream)) !== null) {
      if (match[1]) {
        slots.push({
          id: slots.length,
          start: match.index,
          end: match.index + match[0].length,
          content: match[0],
          type: 'input',
        });
      } else if (match[2]) {
        const content = match[0];
        const xCount = content.replace(/\s/g, '').length;
        slots.push({
          id: slots.length,
          start: match.index,
          end: match.index + content.length,
          content: content,
          type: 'separator',
          isError: xCount >= 3,
        });
      }
    }

    const dist = {};
    slots.forEach((slot) => {
      const ownerIndex = Math.floor(slot.start / 3);
      if (!dist[ownerIndex]) dist[ownerIndex] = [];
      dist[ownerIndex].push({
        ...slot,
        localOffset: slot.start % 3,
      });
    });

    return dist;
  });

  function onChange(letter, newValue, index) {
    if (
      debouncedProgressUpdate &&
      mode === GAME_MODES.MULTIPLAYER &&
      info.inputs[index].value != newValue &&
      (newValue === '' || info.inputs[index].value === '')
    ) {
      debouncedProgressUpdate();
    }

    if (!directMap) {
      info.inputs[index].value = newValue;
    } else {
      info.letterInputs[letter] = newValue;
    }

    if (autoFocus && newValue !== '') {
      const nextIndex = getNextEmptyInputIndex(
        index,
        info.inputs,
        info.cipherTextTrim,
        cipherType,
        directMap,
        info.letterInputs,
        letter
      );
      info.inputs[nextIndex]?.focus();
    }
  }

  async function checkQuote() {
    const inputText = getInputText(info.inputs);
    isChecking = true;

    const answer = await fetchAnswerStatus(
      inputText,
      hash,
      cipherType,
      keys,
      params.Solve,
      startTime
    );
    solved = answer.solved;
    isChecking = false;

    if (solved && mode === GAME_MODES.SINGLEPLAYER) {
      finalTime = answer.time;
      onSolved(answer);
    } else if (!solved) {
      triggerFailUI();
    }
  }

  function triggerFailUI() {
    submissionError = true;
    setTimeout(() => {
      submissionError = false;
    }, 2000);
  }

  function resetClear() {
    clearPolybius = false;
  }

  function toggleCalculator() {
    if (!showCalculatorButton) return;
    calculatorVisible = !calculatorVisible;
  }

  function closeCalculator() {
    calculatorVisible = false;
  }

  function handleGlobalKeydown(e) {
    if (e.altKey && e.key.toLowerCase() === 'k' && showCalculatorButton && !calculatorFocused) {
      e.preventDefault();
      e.stopPropagation();
      toggleCalculator();
      return;
    }

    if (e.altKey && e.key.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  function focusFirstAvailableInput() {
    if (info.inputs && info.inputs.length > 0) {
      for (let i = 0; i < info.inputs.length; i++) {
        const input = info.inputs[i];
        if (input && typeof input.focus === 'function') {
          input.focus();
          cipherFocused = true;
          lastFocusedInputIndex = i;
          break;
        }
      }
    }
  }

  function focusLastOrFirstAvailableInput() {
    if (info.inputs && info.inputs.length > 0) {
      if (lastFocusedInputIndex >= 0 && lastFocusedInputIndex < info.inputs.length) {
        const lastInput = info.inputs[lastFocusedInputIndex];
        if (lastInput && typeof lastInput.focus === 'function') {
          lastInput.focus();
          cipherFocused = true;
          return;
        }
      }

      focusFirstAvailableInput();
    }
  }

  function handleCipherFocus() {
    cipherFocused = true;
  }

  function handleCipherBlur() {
    cipherFocused = false;
  }

  onMount(() => {
    if (mode == 'multiplayer') {
      debouncedProgressUpdate = debounce(() => {
        const filled = getInputText(info.inputs).replace(/[^A-Za-z]/g, '').length;
        const total = info.cipherText.filter((chunk) => isSolvableChunk(chunk, cipherType)).length;
        const percent = Math.floor((filled / total) * 100);
        onProgressUpdate(percent);
      }, 250);

      debouncedProgressUpdate();
    }

    document.addEventListener('keydown', handleGlobalKeydown);

    document.addEventListener('focusin', handleGlobalFocusIn);
    document.addEventListener('focusout', handleGlobalFocusOut);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleGlobalKeydown);
    document.removeEventListener('focusin', handleGlobalFocusIn);
    document.removeEventListener('focusout', handleGlobalFocusOut);
  });

  function handleGlobalFocusIn(e) {
    if (e.target && e.target.closest && e.target.closest('.cipher')) {
      cipherFocused = true;

      if (info.inputs && info.inputs.length > 0) {
        const inputIndex = info.inputs.indexOf(e.target);
        if (inputIndex !== -1) {
          lastFocusedInputIndex = inputIndex;
        }
      }
    }
  }

  function handleGlobalFocusOut(e) {
    if (e.target && e.target.closest && e.target.closest('.cipher')) {
      setTimeout(() => {
        const activeElement = document.activeElement;
        if (!activeElement || !activeElement.closest || !activeElement.closest('.cipher')) {
          cipherFocused = false;
        }
      }, 10);
    }
  }
</script>

{#if isChecking}
  <LoadingOverlay />
{/if}

<Container>
  <!-- Timer Component -->
  <Timer {startTime} {solved} {finalTime} />

  <div class="info">
    <h3>
      {params['Solve']} this
      <span class="highlight" style="border-radius: 3px; padding: 3px;"
        >{paramString + cipherType}</span
      > cipher.
    </h3>
    {#each keys as key, index}
      {#if cipherTypes[cipherType]['keys'][index][0] != '!'}
        <h4>
          The {cipherTypes[cipherType]['keys'][index]} is
          <span class="highlight" style="border-radius: 3px; padding: 3px;">{key}</span>.
        </h4>
      {/if}
    {/each}
    {#if cipherType == 'Xenocrypt'}
      <h4>Type "," to get "Ñ".</h4>
    {/if}
  </div>
  <div class="cipher">
    {#each lettersWithIndices as word}
      <div class="word">
        {#each word as { letter, index, keyLetter }}
          <LetterComponent
            bind:inputs={info.inputs}
            letterInputs={info.letterInputs}
            cipherLetter={letter}
            {index}
            inputValue={info.letterInputs[letter]}
            selected={info.letterFocus[letter]}
            {directMap}
            {autoFocus}
            {onArrow}
            {onFocus}
            {onChange}
            {solved}
            {cipherType}
            {keyLetter}
            {checkQuote}
            {spanish}
            trigramInputs={info.trigramInputs || {}}
            slots={slotDistribution[index] || []}
          />
        {/each}
      </div>
    {/each}
  </div>
  {#if cipherTypes[cipherType]['addOn'] == 'freqTable'}
    <FreqTable bind:info {solved} {autoFocus} k={params['K']} {spanish} />
  {:else if cipherTypes[cipherType]['addOn'] == 'atbashTable'}
    <AtbashTable />
  {:else if cipherTypes[cipherType]['addOn'] == 'baconTable'}
    <BaconianTable />
  {:else if cipherTypes[cipherType]['addOn'] == 'portaTable'}
    <PortaTable />
  {:else if cipherTypes[cipherType]['addOn'] == 'caesarTable'}
    <CaesarTable />
  {:else if cipherTypes[cipherType]['addOn'] == 'polybiusSquare'}
    <PolybiusSquare {autoFocus} {clearPolybius} {resetClear} />
  {:else if cipherTypes[cipherType]['addOn'] == 'checkerboardTable'}
    <CheckerboardTable {autoFocus} {clearPolybius} {resetClear} />
  {:else if cipherTypes[cipherType]['addOn'] == 'mathAddOn'}
    <CaesarTable />

    {#if cipherType == 'Hill'}
      <MatrixInput encode={params['Solve'] == 'Encode'} keyword={keys[0]} />
    {:else}
      <AffineInput encode={params['Solve'] == 'Encode'} {keys} />
    {/if}

    {#if params['Solve'] == 'Decode'}
      <DeterminantTable />
    {/if}
  {:else if cipherTypes[cipherType]['addOn'] == 'morseTable'}
    <MorseTable bind:info {solved} {autoFocus} {crib} />
  {:else if cipherTypes[cipherType]['addOn'] == 'homophonicTable'}
    <HomophonicTable {autoFocus} {clearPolybius} {resetClear} />
  {/if}

  <div class="buttons">
    {#if !solved}
      <button class="button" onclick={clearQuote}>Clear</button>
      <button class="button" onclick={checkQuote}>Submit</button>
    {/if}
  </div>
  {#if submissionError}
    <div class="cipher-error" transition:fade>❌ Incorrect submission. Try again!</div>
  {/if}

  <!-- Calculator Button -->
  {#if showCalculatorButton}
    <div class="calculator-toggle-container">
      <button
        class="calculator-toggle-btn"
        class:cipher-focused={cipherFocused}
        onclick={toggleCalculator}
        title="Calculator (Alt+K to toggle, Alt+L to focus)"
      >
        🧮
      </button>
      {#if !calculatorVisible}
        <div class="calculator-hint-container">
          <span class="calculator-hint">Alt+K</span>
          <span class="calculator-hint-label">Toggle</span>
        </div>
      {:else}
        <div class="calculator-hint-container">
          <span class="calculator-hint">Alt+L</span>
          <span class="calculator-hint-label">Focus</span>
        </div>
      {/if}
    </div>
  {/if}
</Container>

<!-- Calculator Component -->
{#if showCalculatorButton}
  <Calculator
    visible={calculatorVisible}
    onClose={closeCalculator}
    bind:position={calculatorPosition}
    onFocusSwitch={focusLastOrFirstAvailableInput}
    bind:calculatorFocused
    {toggleCalculator}
  />
{/if}

<style>
  .info {
    text-align: left;
    align-self: flex-start;
    font-size: 1.2rem;
    font-weight: bold;
    margin: 10px 10px 30px 10px;
    width: 100%;
  }

  .info h3 {
    padding-bottom: 5px;
  }

  .highlight {
    background: var(--glass-bg-active);
  }

  .cipher {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
    max-width: 100%;
    width: 100%;
    justify-content: flex-start;
    align-self: flex-start;
    text-align: left;
    box-sizing: border-box;
  }

  .word {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    justify-content: flex-start;
    align-items: flex-start;
    flex-wrap: wrap;
    margin: 0 10px 30px 10px;
    max-width: 100%;
    row-gap: 30px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    margin-top: 1rem;
  }

  .buttons .button {
    flex: 1 1 auto;
    max-width: 200px;
    min-width: 120px;
    padding: 0.75rem 1.25rem;
    font-size: clamp(0.9rem, 1.5vw, 1.1rem);
  }

  .cipher-error {
    margin-top: 1rem;
    color: var(--color-error-dark);
    background-color: rgba(42, 0, 0, 1);
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--color-error-dark);
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    text-align: center;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-6px);
    }
    40% {
      transform: translateX(6px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
    100% {
      transform: translateX(0);
    }
  }

  .cipher-error {
    animation: shake 0.4s ease;
  }

  .calculator-toggle-container {
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 999;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: all 0.25s ease-in-out;
  }

  .calculator-toggle-btn {
    background: linear-gradient(145deg, var(--color-primary), var(--color-primary-dark));
    border: 2px solid var(--color-gray-border);
    border-radius: 50%;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
  }

  .calculator-toggle-btn:hover {
    background: linear-gradient(145deg, var(--color-primary-dark), var(--color-primary));
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  }

  .calculator-toggle-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .calculator-toggle-btn.cipher-focused {
    background: var(--gradient-btn-success);
    border-color: var(--color-accent);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.3),
      0 0 0 2px var(--color-accent-muted);
  }

  .calculator-toggle-btn.cipher-focused:hover {
    background: linear-gradient(145deg, var(--color-success-darker), var(--color-success-dark));
  }

  .calculator-hint {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 500;
    background: var(--glass-overlay);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    text-align: center;
    backdrop-filter: blur(5px);
    transition: opacity 0.2s ease-in-out;
  }

  .calculator-hint-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .calculator-hint-label {
    font-size: 9px;
    color: var(--text-secondary);
    font-weight: 400;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (max-width: 768px) {
    .calculator-toggle-container {
      top: 80px;
      right: 16px;
    }

    .calculator-toggle-btn {
      width: 48px;
      height: 48px;
      font-size: 20px;
    }

    .calculator-hint {
      font-size: 10px;
      padding: 1px 4px;
    }
  }

  @media (max-width: 480px) {
    .calculator-toggle-container {
      top: 70px;
      right: 12px;
    }

    .calculator-toggle-btn {
      width: 44px;
      height: 44px;
      font-size: 18px;
    }
  }
</style>
