import { ENGLISH_ALPHABET, SPANISH_ALPHABET, isSolvableChunk } from '$shared/CipherUtil';
import { cipherTypes } from '$shared/CipherTypes';

/**
 * Returns the set of symbols the letter-input bank (`letterInputs`/`letterFocus`, and FreqTable's
 * rows) should cover for this cipher. Defaults to the fixed alphabet (shows every letter even if
 * unused in this quote); ciphers configured with `symbolSource: 'ciphertext'` (e.g. homophonic
 * substitution, where the symbol set is larger than 26 and quote-specific) instead get the
 * distinct solvable symbols actually present in `cipherTextTrim`. See CipherTypes.js for details.
 */
function getSymbolBank(cipherType, cipherTextTrim, isSpanish) {
  if (cipherTypes[cipherType]?.symbolSource === 'ciphertext') {
    return [...new Set(cipherTextTrim)].filter((chunk) => isSolvableChunk(chunk, cipherType));
  }
  const alphabet = isSpanish ? SPANISH_ALPHABET : ENGLISH_ALPHABET;
  return alphabet.split('');
}

/** Initializes the cipher quote array with proper spacing based on cipher type. */
export function initQuote(quoteArr, spacing, cipherType) {
  if (spacing === -1) return quoteArr;

  const spaced = [];
  let count = 0;

  for (const chunk of quoteArr) {
    if (!isSolvableChunk(chunk, cipherType)) continue;

    spaced.push(chunk);
    if (isSolvableChunk(chunk, cipherType)) {
      count++;
      if (spacing !== 0 && count % spacing === 0) {
        spaced.push(' ');
      }
    }
  }

  return spaced;
}

/** Creates an empty symbol-to-input mapping, sized per the cipher's `symbolSource` (see above). */
export function initLetterInputs(cipherType, cipherTextTrim, isSpanish = false) {
  const letterInputs = {};
  getSymbolBank(cipherType, cipherTextTrim, isSpanish).forEach((symbol) => {
    letterInputs[symbol] = '';
  });
  return letterInputs;
}

/** Creates an empty symbol-to-focus-state mapping, sized per the cipher's `symbolSource`. */
export function initLetterFocus(cipherType, cipherTextTrim, isSpanish = false) {
  const letterFocus = {};
  getSymbolBank(cipherType, cipherTextTrim, isSpanish).forEach((symbol) => {
    letterFocus[symbol] = false;
  });
  return letterFocus;
}

/** Checks if cipher type uses direct letter mapping. */
export function getDirectMap(cipherType) {
  return cipherTypes[cipherType]?.directMap ?? true;
}

/** Builds array of letters with their indices and optional keyword overlay. */
export function initLettersWithIndices(cipherText, cipherType, keys = []) {
  const res = [];
  let index = 0;
  let currentWord = [];
  const keyword = keys[0] || '';
  const addKey = cipherTypes[cipherType]?.stackKey ?? false;
  let keywordIndex = 0;

  for (const char of cipherText) {
    if (char === ' ') {
      if (currentWord.length) res.push(currentWord);
      currentWord = [];
      continue;
    }

    let keywordChar = '';
    if (addKey && isSolvableChunk(char, cipherType) && keyword) {
      keywordChar = keyword[keywordIndex].toUpperCase();
      keywordIndex = (keywordIndex + 1) % keyword.length;
    }

    currentWord.push({ letter: char, index, keyLetter: keywordChar });
    index++;
  }

  if (currentWord.length) res.push(currentWord);
  return res;
}

/** Converts K parameter to display string. */
export function paramToString(obj) {
  let val = obj.K;
  let res = 'K' + val;
  if (res == 'K0') {
    return 'Random ';
  } else if (res == 'K1' || res == 'K2' || res == 'K3') {
    return res + ' ';
  } else {
    return '';
  }
}

/** Gets the next input index when navigating with arrow keys. */
export function getNextInputIndex(
  key,
  currentIndex,
  inputs,
  cipherTextTrim,
  cipherType,
  directMap
) {
  const inc = key === 'ArrowRight' || key === ' ' || key === 'Tab' ? 1 : -1;
  const len = inputs.length;
  let currIndex = currentIndex;
  let triedAll = false;

  while (!triedAll) {
    const nextIndex = (currIndex + inc + len) % len;
    const prevChar = cipherTextTrim[currIndex];
    const nextChar = cipherTextTrim[nextIndex];

    if (isSolvableChunk(nextChar, cipherType) && (nextChar !== prevChar || !directMap)) {
      return nextIndex;
    }

    currIndex = nextIndex;
    if (currIndex === currentIndex) {
      return (currentIndex + inc + len) % len;
    }
  }

  return currIndex;
}

/** Gets the next empty input index for auto-focus behavior. */
export function getNextEmptyInputIndex(
  currentIndex,
  inputs,
  cipherTextTrim,
  cipherType,
  directMap,
  letterInputs,
  currentLetter
) {
  const len = inputs.length;
  let currIndex = currentIndex;

  for (let i = 0; i < len; i++) {
    currIndex = (currIndex + 1) % len;

    if (directMap) {
      const normalizedLetter = cipherTextTrim[currIndex]?.toUpperCase();
      if (
        isSolvableChunk(normalizedLetter, cipherType) &&
        normalizedLetter !== currentLetter &&
        letterInputs[normalizedLetter] === ''
      ) {
        return currIndex;
      }
    } else {
      if (
        isSolvableChunk(cipherTextTrim[currIndex], cipherType) &&
        inputs[currIndex]?.value === ''
      ) {
        return currIndex;
      }
    }

    if (currIndex === currentIndex) break;
  }

  return currIndex;
}

/** Extracts input text from all cipher inputs. */
export function getInputText(inputs) {
  let text = '';
  for (const input of inputs) {
    if (input != null) {
      text += input.value !== '' ? input.value : ' ';
    }
  }
  return text;
}

/** Calculates completion percentage for progress tracking. */
export function calculateProgress(inputs, cipherText, cipherType) {
  const filled = getInputText(inputs).replace(/[^A-Za-z]/g, '').length;
  const total = cipherText.filter((chunk) => isSolvableChunk(chunk, cipherType)).length;
  return total > 0 ? Math.floor((filled / total) * 100) : 0;
}
