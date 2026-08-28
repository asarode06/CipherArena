/**
 * Registry of cipher configs — the single source of truth for `cipherType`. Every place that
 * needs to know what cipher types exist (the Mongoose enum in shared-server/game/Game.js, the
 * /singleplayer/[cipherType] route guard, CipherUtil's encoder dispatch, Cipher.svelte's UI)
 * derives from `Object.keys(cipherTypes)` or reads a field below — adding an entry here is what
 * makes a new cipher type valid everywhere else.
 *
 * `symbolSource` and `letterComponent` exist specifically to let the frontend generalize past
 * "classic 26-letter substitution" without hardcoding per-cipher checks in Cipher.svelte:
 *   - symbolSource: 'alphabet' (the default) builds the shared letter-input bank
 *     (`letterInputs`/`letterFocus` in cipherUtils.js, and FreqTable's rows) from the fixed
 *     26/27-letter alphabet, so every letter shows even if unused in a given quote. Only matters
 *     for `directMap: true` ciphers — that bank is where a guess typed for one occurrence of a
 *     ciphertext symbol gets shared across every other occurrence of that same symbol; non-direct
 *     ciphers store answers per-position instead (see `onChange` in Cipher.svelte) and never read
 *     this bank. Use 'ciphertext' when a direct-map cipher's symbol set isn't the fixed alphabet
 *     (e.g. homophonic substitution, where one plaintext letter can have several possible numeric
 *     codes) — the bank is then built from the distinct symbols actually present in that quote's
 *     ciphertext instead.
 *   - letterComponent: 'default' renders the generic per-position `Letter.svelte` input.
 *     Any other key must be registered in `LETTER_COMPONENTS` in Cipher.svelte and points at a
 *     bespoke widget for ciphers whose ciphertext units aren't single typed letters (see
 *     Baconian's A/B toggle buttons, Fractionated Morse's multi-slot trigram inputs).
 */
export const cipherTypes = {
  Aristocrat: {
    directMap: true,
    keys: ['!'],
    addOn: 'freqTable',
    spacing: -1,
    length: [70, 130],
    options: ['K', '!Random', '1', '2', '3'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  }, //! means no frontend visibility
  Xenocrypt: {
    directMap: true,
    keys: ['!'],
    addOn: 'freqTable',
    spacing: -1,
    length: [70, 130],
    options: ['K', '!Random', '1', '2', '3'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Patristocrat: {
    directMap: true,
    keys: ['!'],
    addOn: 'freqTable',
    spacing: 5,
    length: [100, 140],
    options: ['K', '!Random', '1', '2', '3'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Porta: {
    directMap: false,
    keys: ['key'],
    addOn: 'portaTable',
    spacing: 5,
    length: [30, 80],
    options: ['Solve', '!Decode', '!Encode'],
    letterGap: false,
    bypassCheck: false,
    stackKey: true,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Atbash: {
    directMap: false,
    keys: [],
    addOn: 'atbashTable',
    spacing: -1,
    length: [60, 100],
    options: ['Solve', '!Decode', '!Encode'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Caesar: {
    directMap: false,
    keys: [],
    addOn: 'caesarTable',
    spacing: -1,
    length: [60, 100],
    options: [],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Affine: {
    directMap: false,
    keys: ['value of a', 'value of b'],
    addOn: 'mathAddOn',
    spacing: 5,
    length: [60, 100],
    options: ['Solve', '!Decode', '!Encode'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Baconian: {
    directMap: false,
    keys: [],
    addOn: 'baconTable',
    spacing: 0,
    length: [70, 110],
    options: [],
    letterGap: true,
    bypassCheck: true,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'baconian',
  },
  Nihilist: {
    directMap: false,
    keys: ['keyword', 'polybius key'],
    addOn: 'polybiusSquare',
    spacing: 5,
    length: [80, 120],
    options: [],
    letterGap: true,
    bypassCheck: true,
    stackKey: true,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Checkerboard: {
    directMap: false,
    keys: ['!', '!', 'polybius key'],
    addOn: 'checkerboardTable',
    spacing: 5,
    length: [80, 120],
    options: [],
    letterGap: true,
    bypassCheck: true,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  Hill: {
    directMap: false,
    keys: ['key'],
    addOn: 'mathAddOn',
    spacing: 0,
    length: [0, 30],
    options: ['Solve', '!Decode', '!Encode'],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'default',
  },
  'Fractionated Morse': {
    directMap: false,
    keys: ['!', 'quote starts with'],
    addOn: 'morseTable',
    spacing: 0,
    length: [40, 80],
    options: [],
    letterGap: false,
    bypassCheck: false,
    stackKey: false,
    symbolSource: 'alphabet',
    letterComponent: 'morse',
  },
  Homophonic: {
    directMap: true,
    keys: ['!', 'keyword'],
    addOn: 'homophonicTable',
    spacing: 5,
    length: [90, 130],
    options: [],
    letterGap: true,
    bypassCheck: true,
    stackKey: false,
    symbolSource: 'ciphertext',
    letterComponent: 'default',
  },
};
