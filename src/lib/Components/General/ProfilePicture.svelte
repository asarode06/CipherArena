<script>
  import { onMount } from 'svelte';
  import ColorThief from 'colorthief';

  let {
    profilePicture,
    size = 40,
    useColorRing = false,
    preserveSize = false,
    onColorExtract = null,
  } = $props();
  let loading = $state(true);
  let src = $state('');
  let ringColor = $state('var(--color-ring-default, #bcaeff)');
  let imgRef = $state(null);
  let lastFetchedProfileId = $state('');

  $effect(() => {
    if (!profilePicture || profilePicture === 'default') {
      src = '/default-avatar.webp';
      lastFetchedProfileId = 'default';
      loading = false;
      return;
    }

    if (lastFetchedProfileId === profilePicture) return;

    (async () => {
      loading = true;
      try {
        const res = await fetch(`/api/profile/retrieve/${profilePicture}`);
        const data = await res.json();
        if (data.success) {
          src = data.url;
          lastFetchedProfileId = profilePicture;
        } else {
          src = '/default-avatar.webp';
        }
      } catch (err) {
        src = '/default-avatar.webp';
      }
    })();
  });

  function extractColor() {
    try {
      const colorThief = new ColorThief();
      const [r, g, b] = colorThief.getColor(imgRef);
      ringColor = `rgb(${r}, ${g}, ${b})`;
      if (onColorExtract) onColorExtract(ringColor);
    } catch (_) {}
  }

  function handleLoad() {
    loading = false;
    if (useColorRing) extractColor();
  }

  function handleError() {
    // MUST also clear `loading` here, not just re-point `src` — the render guard below is
    // `!loading || src !== '/default-avatar.webp'`, so leaving `loading` true while `src` is
    // already the default avatar makes both sides false and permanently hides the <img>, even
    // once it points at a URL (the local default asset) that will actually load fine. Without
    // this, any failed fetch — CORS-blocked, deleted S3 object, network blip — gets stuck in an
    // infinite spinner instead of falling back to the default avatar.
    src = '/default-avatar.webp';
    loading = false;
  }
</script>

<div
  class="avatar-wrapper {useColorRing || preserveSize ? 'ring-wrapper' : ''} {preserveSize &&
  !useColorRing
    ? 'no-ring'
    : ''}"
  style="
    width: {size}px;
    height: {size}px;
    --ring-color: {ringColor};
    --size: {size}px;
    --ring-thickness: 2px;
  "
>
  {#if loading}
    <div class="spinner"></div>
  {/if}
  {#if src !== '' && (!loading || src !== '/default-avatar.webp')}
    <img
      bind:this={imgRef}
      {src}
      alt=""
      class="avatar"
      crossorigin={useColorRing ? 'anonymous' : undefined}
      onload={handleLoad}
      onerror={handleError}
      style="display: block"
    />
  {/if}
</div>

<style>
  .avatar-wrapper {
    display: inline-block;
    border-radius: 50%;
    padding: 4px;
    box-sizing: content-box;
    background-color: transparent;
    position: relative;
  }

  .ring-wrapper::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 50%;
    border: var(--ring-thickness) solid var(--ring-color);
    box-sizing: border-box;
    opacity: 0.6;
    animation: soft-ring 3s ease-in-out infinite;
    pointer-events: none;
  }

  .ring-wrapper.no-ring::after {
    border-color: transparent;
    animation: none;
    opacity: 0;
  }

  .avatar {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 70%;
    height: 70%;
    transform: translate(-50%, -50%);
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--color-neutral-800);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  @keyframes soft-ring {
    0%,
    100% {
      transform: scale(0.95);
      opacity: 0.5;
    }
    50% {
      transform: scale(1);
      opacity: 0.3;
    }
  }
</style>
