<script>
  import Container from '$lib/Components/General/Container.svelte';
  import Cipher from '$lib/Components/Game/Cipher.svelte';
  import Options from '$lib/Components/Game/Options.svelte';
  import SingleplayerResult from '$lib/Components/Game/SingleplayerResult.svelte';
  import LoadingOverlay from '$lib/Components/General/LoadingOverlay.svelte';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { generateSeo } from '$lib/util/generateSEO.js';

  let { data } = $props();
  let mounted = $state(false);
  let options = $state({ AutoFocus: false, AutoSwitch: false });
  let quoteData = $state(null);
  let loading = $state(true);
  let error = $state(null);

  // Post-solve results view state, replacing the old success Popup — same URL/route, a different
  // block below. See docs/singleplayer-stats-plan.md §7.
  let solved = $state(false);
  let result = $state(null); // { plaintext, author, stats }

  let params = {
    K: '-1',
    Solve: 'Decode',
    cipherType: data.props.cipherType,
  };

  async function checkQuote(i, hash, cipherType, keys, solve, startTime) {
    let answerSolved = false;
    let plaintext = null;
    let author = null;
    let stats = null;
    try {
      const time = Number((Date.now() / 1000 - startTime).toFixed(3));
      const response = await fetch('/api/validate-quote', {
        method: 'POST',
        body: JSON.stringify({
          input: i,
          id: hash,
          cipherType: cipherType,
          keys: keys,
          solveTime: time,
          solve: params.Solve,
        }),
        headers: {
          'content-type': 'application/json',
        },
      });
      const answer = await response.json();
      if (answer && answer.solved) {
        answerSolved = true;
        plaintext = answer.plaintext;
        author = answer.author;
        // `stats.yourTime` echoes back this exact `time` value — use that as the single source of
        // truth for display (see SingleplayerResult.svelte) instead of a separately-rounded local
        // copy, so "Your Time" can never mismatch "Average Time" after a single solve.
        stats = answer.stats;
      }
    } catch (error) {
      answerSolved = false;
    }
    return { solved: answerSolved, plaintext, author, stats };
  }

  async function fetchQuote() {
    try {
      const res = await fetch('/api/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      quoteData = result;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function onSolved(answer) {
    // AutoSwitch MUST skip the results view and jump straight to a new puzzle.
    if (options.AutoSwitch) {
      newProblem();
      return;
    }
    result = answer;
    solved = true;
  }

  function newProblem() {
    window.location.reload();
  }

  function onOptionChange(option) {
    options[option] = !options[option];
    sessionStorage.setItem('options', JSON.stringify(options));
  }

  onMount(async () => {
    options = sessionStorage.getItem('options')
      ? JSON.parse(sessionStorage.getItem('options'))
      : { AutoFocus: true, AutoSwitch: false };

    const searchParams = new URLSearchParams(window.location.search);
    params.K = searchParams.get('K') || '-1';
    params.Solve = searchParams.get('Solve') || 'Decode';
    params.cipherType = data.props.cipherType;

    await fetchQuote();
    mounted = true;
  });

  const seo = generateSeo({
    title: `Singleplayer ${params.cipherType}: Cipher Arena`,
    description: `Practice solving ${params.cipherType} cryptograms solo to sharpen your skills before entering multiplayer battles.`,
    url: `https://cipherarena.com/singleplayer/${params.cipherType}`,
    image: 'https://cipherarena.com/landing-page/cipher-solved.webp',
  });
</script>

<svelte:head>{@html seo}</svelte:head>

{#if !mounted || loading}
  <LoadingOverlay />
{:else if error}
  <p style="color: red; padding: 1rem;">Error: {error}</p>
{:else if solved}
  <div transition:fade>
    <SingleplayerResult
      plaintext={result.plaintext}
      author={result.author}
      stats={result.stats}
      cipherType={params.cipherType}
      solveMode={params.Solve}
      hash={quoteData.id}
      {newProblem}
    />
  </div>
{:else}
  <div transition:fade>
    <Container --flexDir="row" style="gap: 3vw;">
      <Options {options} {onOptionChange} cipherType={params.cipherType} />
    </Container>

    <Cipher
      quote={quoteData.quote}
      hash={quoteData.id}
      cipherType={params.cipherType}
      autoFocus={options.AutoFocus}
      {params}
      keys={quoteData.keys}
      {onSolved}
      mode="singleplayer"
      fetchAnswerStatus={checkQuote}
    />
  </div>
{/if}
