import { cipherTypes } from './CipherTypes.js';
import GraphemeSplitter from 'grapheme-splitter';

let splitter;
function getSplitter() {
  if (!splitter) splitter = new GraphemeSplitter();
  return splitter;
}

export const ENGLISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const SPANISH_ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/** Returns true if character is a valid letter in the specified alphabet. */
export function isLetter(character, isSpanish = false) {
  const alphabet = isSpanish ? SPANISH_ALPHABET : ENGLISH_ALPHABET;
  return (
    alphabet.includes(character ? character.toUpperCase() : character) &&
    character !== '' &&
    character !== ' '
  );
}

/** Converts a letter to its 0-based index in the alphabet. Returns -1 if invalid. */
export function letterToNumber(char, isSpanish = false) {
  if (typeof char !== 'string' || char.length !== 1) return -1;
  const alphabet = isSpanish ? SPANISH_ALPHABET : ENGLISH_ALPHABET;

  const index = alphabet.indexOf(char.toUpperCase());
  return index !== -1 ? index : -1;
}

/** Converts a 0-based index to its corresponding letter. Returns empty string if out of range. */
export function numberToLetter(num, isSpanish = false) {
  const alphabet = isSpanish ? SPANISH_ALPHABET : ENGLISH_ALPHABET;
  return num >= 0 && num < alphabet.length ? alphabet[num] : '';
}

function shiftArray(arr, shiftAmount) {
  const length = arr.length;
  shiftAmount = ((shiftAmount % length) + length) % length;

  if (shiftAmount === 0) return arr.slice();

  return arr.slice(-shiftAmount).concat(arr.slice(0, -shiftAmount));
}

function checkSelfDecode(arr, isSpanish = false) {
  for (let i = 0; i < arr.length; i++) {
    if (letterToNumber(arr[i], isSpanish) === i) return true;
  }
  return false;
}

/** Encodes plaintext using the specified cipher algorithm. Routes to appropriate encoder based on type. */
export function encodeQuote(plaintext, cipherType, keys, params) {
  const encoders = {
    Aristocrat: () =>
      encodeAristocrat(plaintext, params['K'] === '-1' ? '0' : params['K'], keys[0]),
    Porta: () => encodePorta(plaintext, keys[0]),
    Caesar: () => encodeCaesar(plaintext),
    Atbash: () => encodeAtbash(plaintext),
    Baconian: () => encodeBaconian(plaintext),
    Nihilist: () => encodeNihilist(plaintext, keys[0], keys[1]),
    Xenocrypt: () => encodeXenocrypt(plaintext, params['K'] === '-1' ? '0' : params['K'], keys[0]),
    Checkerboard: () => encodeCheckerboard(plaintext, keys[0], keys[1], keys[2]),
    Hill: () => encodeHill(plaintext, keys[0]),
    Affine: () => encodeAffine(plaintext, keys[0], keys[1]),
    'Fractionated Morse': () => encodeFractionatedMorse(plaintext, keys[0]),
    Homophonic: () => encodeHomophonic(plaintext, keys[0]),
  };

  return (encoders[cipherType] || (() => encodeAristocrat(plaintext, '0')))();
}

/** Calculates the determinant of a 2x2 matrix from a 4-letter key (mod 26). */
export function findDeterminant(word) {
  if (word.length !== 4) return -1;

  const a = letterToNumber(word[0]);
  const b = letterToNumber(word[1]);
  const c = letterToNumber(word[2]);
  const d = letterToNumber(word[3]);

  if (a === -1 || b === -1 || c === -1 || d === -1) return -1;

  return (a * d - b * c + 26) % 26;
}

function encodeHill(plaintext, key) {
  const matrix = [];
  const res = [];
  for (let letter of key) {
    matrix.push(letterToNumber(letter));
  }
  const stripped = stripQuote(plaintext, false);

  for (let i = 0; i < stripped.length; i += 2) {
    const a = letterToNumber(stripped[i]);
    const b = i + 1 >= plaintext.length ? 25 : letterToNumber(stripped[i + 1]);

    const c = (matrix[0] * a + matrix[1] * b) % 26;
    const d = (matrix[2] * a + matrix[3] * b) % 26;

    res.push(numberToLetter(c));
    if (i + 1 < stripped.length) {
      res.push(numberToLetter(d));
    }
  }
  return res;
}

/** Encodes plaintext using a random shift for the Caesar cipher. */
function encodeCaesar(plaintext) {
  const shift = Math.floor(Math.random() * 25) + 1;
  const res = [];

  for (let letter of plaintext) {
    const num = letterToNumber(letter);
    if (num === -1) {
      res.push(letter);
    } else {
      res.push(numberToLetter((num + shift) % 26));
    }
  }
  return res;
}

/** Encodes plaintext using the atbash cipher. */
function encodeAtbash(plaintext) {
  const res = [];

  for (let letter of plaintext) {
    const num = letterToNumber(letter);
    if (num === -1) {
      res.push(letter);
    } else {
      res.push(numberToLetter(25 - num));
    }
  }
  return res;
}

/** Encodes aristocrat using a generated frequency table. */
function encodeAristocrat(plaintext, k, key) {
  const freqTable = freqTableInit(k || '0', key, false);
  const useInverseMapping = k === '1' || k === '3';
  const ciphertext = [];

  for (let letter of plaintext) {
    if (!isLetter(letter)) {
      ciphertext.push(letter);
    } else {
      ciphertext.push(
        useInverseMapping
          ? numberToLetter(freqTable.indexOf(letter.toUpperCase()))
          : freqTable[letterToNumber(letter)]
      );
    }
  }

  return ciphertext;
}

/** Encodes xenocrypt using a generated frequency table. */
function encodeXenocrypt(plaintext, k, key) {
  const freqTable = freqTableInit(k || '0', key, true);
  const useInverseMapping = k === '1' || k === '3';
  const ciphertext = [];

  for (let letter of getSplitter().splitGraphemes(plaintext)) {
    const upper = letter.toUpperCase();

    if (!isLetter(letter, true)) {
      ciphertext.push(letter);
    } else if (useInverseMapping) {
      const index = freqTable.indexOf(upper);
      ciphertext.push(numberToLetter(index, true));
    } else {
      const num = letterToNumber(upper, true);
      ciphertext.push(freqTable[num]);
    }
  }

  return ciphertext;
}

/** Encodes plaintext using the porta cipher. */
function encodePorta(plaintext, key) {
  const ciphertext = [];
  let count = 0;
  const length = key.length;

  for (let letter of plaintext) {
    const num = letterToNumber(letter);
    if (num !== -1) {
      const k = letterToNumber(key[count % length]);
      const res = numberToLetter(
        num < 13 ? ((num + Math.floor(k / 2)) % 13) + 13 : (num - Math.floor(k / 2) + 13) % 13
      );
      ciphertext.push(res);
      count++;
    }
  }
  return ciphertext;
}

/** Generates the array used for the frequency table. */
function setArray(key, alphabet) {
  let freqTable = [];
  let count = 0;
  for (let i = 0; i < key.length; i++) {
    if (freqTable.includes(key[i])) continue;
    else {
      freqTable[count] = key[i];
      count++;
    }
  }
  for (let letter of alphabet) {
    if (freqTable.includes(letter)) continue;
    else {
      freqTable[count] = letter;
      count++;
    }
  }
  return freqTable;
}

/** Generates the frequency table for aristocrats and xenocrypts. */
function freqTableInit(k, key, isSpanish = false) {
  const baseAlphabet = isSpanish
    ? 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')
    : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  if (k === '1' || k === '2') {
    let freqTable = setArray(key, baseAlphabet);
    let selfDecode = false;
    do {
      const shift = Math.floor(Math.random() * baseAlphabet.length);
      freqTable = shiftArray(freqTable, shift);
      selfDecode = checkSelfDecode(freqTable, isSpanish);
    } while (selfDecode);
    return freqTable;
  }

  if (k === '3') {
    let freqTable = setArray(key, baseAlphabet);
    let freqTable2 = [...freqTable];
    let finalTable = [];
    let selfDecode = false;

    do {
      finalTable = [];
      const shift1 = Math.floor(Math.random() * baseAlphabet.length);
      const shift2 = Math.floor(Math.random() * baseAlphabet.length);
      freqTable = shiftArray(freqTable, shift1);
      freqTable2 = shiftArray(freqTable2, shift2);

      for (let n = 0; n < baseAlphabet.length; n++) {
        finalTable[n] = freqTable2[freqTable.indexOf(numberToLetter(n, isSpanish))];
      }

      selfDecode = checkSelfDecode(finalTable, isSpanish);
    } while (selfDecode);

    return finalTable;
  }

  let shuffled;
  do {
    shuffled = [...baseAlphabet];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } while (checkSelfDecode(shuffled, isSpanish));
  return shuffled;
}

export const baconianMap = {
  A: 'AAAAA',
  B: 'AAAAB',
  C: 'AAABA',
  D: 'AAABB',
  E: 'AABAA',
  F: 'AABAB',
  G: 'AABBA',
  H: 'AABBB',
  I: 'ABAAA',
  J: 'ABAAA',
  K: 'ABAAB',
  L: 'ABABA',
  M: 'ABABB',
  N: 'ABBAA',
  O: 'ABBAB',
  P: 'ABBBA',
  Q: 'ABBBB',
  R: 'BAAAA',
  S: 'BAAAB',
  T: 'BAABA',
  U: 'BAABB',
  V: 'BAABB',
  W: 'BABAA',
  X: 'BABAB',
  Y: 'BABBA',
  Z: 'BABBB',
};

export const morseCodeMap = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
};

export const reverseMorseMap = Object.fromEntries(
  Object.entries(morseCodeMap).map(([k, v]) => [v, k])
);

export const TRIGRAMS = [
  '...',
  '..-',
  '..x',
  '.-.',
  '.--',
  '.-x',
  '.x.',
  '.x-',
  '.xx',
  '-..',
  '-.-',
  '-.x',
  '--.',
  '---',
  '--x',
  '-x.',
  '-x-',
  '-xx',
  'x..',
  'x.-',
  'x.x',
  'x-.',
  'x--',
  'x-x',
  'xx.',
  'xx-',
];

function generateKeyedAlphabet(keyword) {
  const seen = new Set();
  const result = [];
  for (const c of keyword.toUpperCase().replace(/[^A-Z]/g, '')) {
    if (!seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
  }
  for (const c of ENGLISH_ALPHABET) {
    if (!seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
  }
  return result;
}

function encodeFractionatedMorse(plaintext, keyword) {
  const keyedAlphabet = generateKeyedAlphabet(keyword);

  const words = plaintext
    .toUpperCase()
    .split(/[^A-Z]+/g)
    .filter((w) => w.length > 0);
  const stripped = words.join('');

  let morseStream = '';
  for (let i = 0; i < words.length; i++) {
    if (i > 0) morseStream += 'xx'; // Word separator
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      if (j > 0) morseStream += 'x'; // Letter separator
      morseStream += morseCodeMap[word[j]] || '';
    }
  }

  while (morseStream.length % 3 !== 0) {
    morseStream += 'x';
  }

  const ciphertext = [];
  const trigramList = [];
  for (let i = 0; i < morseStream.length; i += 3) {
    const trigram = morseStream.substring(i, i + 3);
    trigramList.push(trigram);
    const idx = TRIGRAMS.indexOf(trigram);
    ciphertext.push(idx >= 0 ? keyedAlphabet[idx] : '?');
  }

  const letterToTrigram = {};
  for (let i = 0; i < ciphertext.length; i++) {
    if (!letterToTrigram[ciphertext[i]]) {
      letterToTrigram[ciphertext[i]] = trigramList[i];
    }
  }

  let uniqueMappings = new Set();
  let cribPlaintext = '';
  let morseIndex = 0;

  let globalCharIndex = 0;
  for (let i = 0; i < words.length; i++) {
    if (i > 0) morseIndex += 2;
    const word = words[i];

    for (let j = 0; j < word.length; j++) {
      if (j > 0) morseIndex += 1;

      const char = word[j];
      cribPlaintext += char;
      const letterMorse = morseCodeMap[char] || '';
      const morseEnd = morseIndex + letterMorse.length;

      // Find which trigrams cover this letter
      const startTrigram = Math.floor(morseIndex / 3);
      const endTrigram = Math.ceil(morseEnd / 3);

      for (let t = startTrigram; t < endTrigram && t < ciphertext.length; t++) {
        uniqueMappings.add(ciphertext[t]);
      }
      morseIndex = morseEnd;

      globalCharIndex++;
      if (uniqueMappings.size >= 8 && globalCharIndex >= 4) break;
    }
    if (uniqueMappings.size >= 8 && globalCharIndex >= 4) break;
  }

  return {
    ciphertext,
    cribPlaintext,
    letterToTrigram,
  };
}

const baconianSymbolSets = [
  { aSet: new Set(['.', '·']), bSet: new Set(['-', '—']) },
  { aSet: new Set(['0']), bSet: new Set(['1']) },

  // Number-based sets
  {
    aSet: new Set(['1', '3', '5', '7', '9']),
    bSet: new Set(['2', '4', '6', '8', '0']),
  },
  {
    aSet: new Set(['2', '3', '5', '7']),
    bSet: new Set(['1', '4', '6', '8', '9', '0']),
  },

  // Symbol sets
  {
    aSet: new Set(['@', '$', '^', '*', ')']),
    bSet: new Set(['!', '#', '%', '&', '(']),
  },

  // Alphabet position sets (0-based indexing: A=0, B=1, ...)
  {
    aSet: new Set(['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']),
    bSet: new Set(['B', 'D', 'F', 'H', 'J', 'L', 'N', 'P', 'R', 'T', 'V', 'X', 'Z']),
  },
  {
    aSet: new Set(['A', 'B', 'E', 'F', 'I', 'J', 'M', 'N', 'Q', 'R', 'U', 'V', 'Y', 'Z']),
    bSet: new Set(['C', 'D', 'G', 'H', 'K', 'L', 'O', 'P', 'S', 'T', 'W', 'X']),
  },
  {
    aSet: new Set(['A', 'B', 'C', 'G', 'H', 'I', 'M', 'N', 'O', 'S', 'T', 'U', 'Y', 'Z']),
    bSet: new Set(['D', 'E', 'F', 'J', 'K', 'L', 'P', 'Q', 'R', 'V', 'W', 'X']),
  },

  // emojis
  {
    aSet: new Set(['😄', '😊', '😂', '😎', '😁']),
    bSet: new Set(['😢', '😞', '😭', '😔', '😩']),
  },
  {
    aSet: new Set(['🔵', '🌀', '💎', '🐳', '🧊']),
    bSet: new Set(['🔴', '🍓', '🌹', '🔥', '🧨']),
  },
  {
    aSet: new Set(['🪐', '🌌', '🚀', '👽', '🌠']),
    bSet: new Set(['🧬', '🦠', '🧫', '🧪', '🧠']),
  },
  {
    aSet: new Set(['🏀', '⚽', '🏈', '🎾', '🏅']),
    bSet: new Set(['🎨', '🎭', '🎼', '🖌️', '🎬']),
  },

  {
    aSet: new Set(['A', 'E', 'I', 'O', 'U']),
    bSet: new Set([
      'B',
      'C',
      'D',
      'F',
      'G',
      'H',
      'J',
      'K',
      'L',
      'M',
      'N',
      'P',
      'Q',
      'R',
      'S',
      'T',
      'V',
      'W',
      'X',
      'Y',
      'Z',
    ]),
  },

  // Prime vs composite alphabet indices
  {
    aSet: new Set(['C', 'D', 'F', 'H', 'L', 'N', 'R', 'T', 'X']),
    bSet: new Set([
      'A',
      'B',
      'E',
      'G',
      'I',
      'J',
      'K',
      'M',
      'O',
      'P',
      'Q',
      'S',
      'U',
      'V',
      'W',
      'Y',
      'Z',
    ]),
  },
];

/** Encodes plaintext using the baconian cipher (various types of baconians were hard coded). */
function encodeBaconian(plaintext) {
  const encodingType = Math.random();

  let aGroup, bGroup, baseWord;
  let useDecoratedWordMode = false;

  if (encodingType < 0.3) {
    const { aSet, bSet } =
      baconianSymbolSets[Math.floor(Math.random() * baconianSymbolSets.length)];
    if (Math.random() < 0.5) {
      aGroup = aSet;
      bGroup = bSet;
    } else {
      aGroup = bSet;
      bGroup = aSet;
    }
  } else if (encodingType < 0.6) {
    const symbols =
      'qwertyuiopasdfghjklzxcvbnm!@#$%^&*()_+[]{}|;:,.<>?1234567890QWERTYUIOPASDFGHJKLZXCVBNM'.split(
        ''
      );
    const aChar = symbols.splice(Math.floor(Math.random() * symbols.length), 1)[0];
    const bChar = symbols.splice(Math.floor(Math.random() * symbols.length), 1)[0];
    aGroup = new Set([aChar]);
    bGroup = new Set([bChar]);
  } else if (encodingType < 0.85) {
    const symbols = '!@#$%^&*()_+[]{}|;:,.<>?'.split('');
    const picked = [];
    while (picked.length < 4) {
      const idx = Math.floor(Math.random() * symbols.length);
      const symbol = symbols.splice(idx, 1)[0];
      if (!picked.includes(symbol)) picked.push(symbol);
    }
    const shuffled = picked.sort(() => Math.random() - 0.5);
    aGroup = new Set(shuffled.slice(0, 2));
    bGroup = new Set(shuffled.slice(2, 4));
  } else {
    useDecoratedWordMode = true;

    const fiveLetterWords = [
      'Globe',
      'Funky',
      'Crazy',
      'Sharp',
      'Waves',
      'Trick',
      'Jelly',
      'Flame',
      'Dream',
      'Bliss',
      'Magic',
      'Quest',
      'Vivid',
      'Zesty',
      'Frost',
      'Grove',
      'Haven',
      'Jolly',
      'Kooky',
      'Lunar',
      'Pizza',
    ];
    baseWord = fiveLetterWords[Math.floor(Math.random() * fiveLetterWords.length)];
    const { aSet, bSet } = generateDecoratedWordSet(baseWord);

    aGroup = aSet;
    bGroup = bSet;
  }

  const ciphertext = [];

  for (let letter of plaintext) {
    if (isLetter(letter)) {
      const code = baconianMap[letter.toUpperCase()] || 'AAAAA';

      if (useDecoratedWordMode) {
        let decoratedWord = '';
        for (let i = 0; i < 5; i++) {
          const accent = code[i] === 'A' ? aGroup[i] : bGroup[i];
          decoratedWord += accent;
        }
        ciphertext.push(decoratedWord);
      } else {
        ciphertext.push(baconianMapToSymbols(code, aGroup, bGroup));
      }
    }
  }

  return ciphertext;
}

/** Encodes plaintext using the checkerboard cipher. */
function encodeCheckerboard(plaintext, rowKey, colKey, polybiusKey) {
  const square = generateCheckerboardSquare(rowKey, colKey, polybiusKey);
  const stripped = stripQuote(plaintext, false);

  const coords = [];
  for (let char of stripped) {
    if (isLetter(char)) {
      coords.push(square[char == 'J' ? 'I' : char]);
    }
  }

  return coords;
}

/** Generates the polybius square for the checkerboard cipher given a row and column key. */
function generateCheckerboardSquare(rowKey, colKey, key) {
  const alphabet = 'ABCDEFGHIKLMNOPQRSTUVWXYZ'; // I/J combined
  key = key
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/J/g, 'I');
  const seen = new Set();
  const square = [];
  const coordsMap = {};

  const fullKey = key + alphabet;

  for (let char of fullKey) {
    if (!seen.has(char) && alphabet.includes(char)) {
      seen.add(char);
      square.push(char);
    }
  }

  for (let i = 0; i < square.length; i++) {
    const row = rowKey[Math.floor(i / 5)];
    const col = colKey[i % 5];
    coordsMap[square[i]] = row + col;
  }

  return coordsMap;
}

/** Generates a word with accented letters for a specific type of baconian cipher. */
function generateDecoratedWordSet(baseWord) {
  const combiningMarks = [
    '\u0300', // grave `
    '\u0301', // acute ´
    '\u0302', // circumflex ^
    '\u0303', // tilde ~
    '\u0304', // macron ¯
    '\u0307', // dot above
    '\u0308', // diaeresis ¨
    '\u030C', // caron ˇ
    '\u0323', // dot below
    '\u0332', // low line (underline)
  ];

  function getRandomMarks(count, excludeSet = new Set()) {
    const available = combiningMarks.filter((mark) => !excludeSet.has(mark));
    return Array.from(
      { length: count },
      () => available[Math.floor(Math.random() * available.length)]
    );
  }

  const aSet = [];
  const bSet = [];

  let aWord = '';
  let bWord = '';
  const usedPairs = new Set();

  for (let i = 0; i < 5; i++) {
    const exclude = new Set();
    const aMark = getRandomMarks(1)[0];
    exclude.add(aMark);
    const bMark = getRandomMarks(1, exclude)[0];

    const aChar = baseWord[i] + aMark;
    const bChar = baseWord[i] + bMark;

    aSet.push(aChar);
    bSet.push(bChar);
  }

  return { aSet: aSet, bSet: bSet };
}

/** Converts baconian "A" and "B" to custom mapping. */
function baconianMapToSymbols(baconianText, aGroup, bGroup) {
  const aChars = Array.from(aGroup);
  const bChars = Array.from(bGroup);
  let ciphertext = '';

  for (let letter of baconianText) {
    if (letter === 'A') {
      ciphertext += aChars[Math.floor(Math.random() * aChars.length)];
    } else if (letter === 'B') {
      ciphertext += bChars[Math.floor(Math.random() * bChars.length)];
    }
  }
  return ciphertext;
}

/** Encodes plaintext using the nihilist cipher, generating the correspending polybius table given keys. */
function encodeNihilist(plaintext, keyword, polybiusKey) {
  const square = generatePolybiusSquare(polybiusKey);
  const stripped = stripQuote(plaintext, false); // remove spaces, punctuation, lowercase
  const keywordCoords = getCoordsFromKeyword(keyword, square);

  const coords = [];
  for (let char of stripped) {
    if (isLetter(char)) {
      coords.push(square[char == 'J' ? 'I' : char]);
    }
  }

  const ciphertext = [];
  for (let i = 0; i < coords.length; i++) {
    const value = coords[i] + keywordCoords[i % keywordCoords.length];
    ciphertext.push(value);
  }

  return ciphertext.map((n) => n.toString().padStart(2, '0'));
}

/** Encodes plaintext using the affine cipher. */
function encodeAffine(plaintext, a, b) {
  const ciphertext = [];

  for (let letter of plaintext) {
    const num = letterToNumber(letter);
    if (num != -1) {
      const encodedNum = (((a * num + b) % 26) + 26) % 26;
      ciphertext.push(numberToLetter(encodedNum));
    }
  }

  return ciphertext;
}

/**
 * Builds the {letter: [4 two-digit code strings]} homophone table for a 4-letter keyword. Each of
 * the keyword's 4 letters seeds one 25-number block (01-25, 26-50, 51-75, 76-00) by rotating a
 * 25-letter alphabet (I/J combined, same convention as generatePolybiusSquare/
 * generateCheckerboardSquare above) to start at that letter — see
 * docs/homophonic-cipher-plan.md §2 for the worked example this was verified against.
 */
export function buildHomophonicTable(keyword) {
  const alphabet = 'ABCDEFGHIKLMNOPQRSTUVWXYZ'; // I/J combined
  const upperKeyword = keyword.toUpperCase().replace(/J/g, 'I');
  const table = {};

  for (let block = 0; block < 4; block++) {
    const startIdx = alphabet.indexOf(upperKeyword[block]);
    for (let i = 0; i < 25; i++) {
      const letter = alphabet[(startIdx + i) % 25];
      const number = block * 25 + i + 1;
      const code = number === 100 ? '00' : String(number).padStart(2, '0');
      (table[letter] ??= []).push(code);
    }
  }

  table['J'] = table['I']; // J shares I's homophones, same convention as Nihilist/Checkerboard
  return table;
}

/**
 * Encodes plaintext using the homophonic cipher: each letter gets a random one of its 4 codes per
 * occurrence. Non-letters are stripped entirely (not passed through as their own chunk) — same
 * convention as Nihilist/Checkerboard, and required by it: this cipher is `bypassCheck: true`, so
 * `isSolvableChunk` treats *any* non-empty chunk as solvable puzzle data. A pass-through
 * punctuation chunk (the convention Caesar/Atbash/Affine use, all `bypassCheck: false`) would get
 * miscounted into the spacing groups and get its own (unanswerable) input box.
 */
function encodeHomophonic(plaintext, keyword) {
  const table = buildHomophonicTable(keyword);
  const stripped = stripQuote(plaintext, false);
  const ciphertext = [];

  for (let letter of stripped) {
    const codes = table[letter];
    ciphertext.push(codes[Math.floor(Math.random() * codes.length)]);
  }

  return ciphertext;
}

/** Generates a polybius square for the nihilist cipher. */
function generatePolybiusSquare(key) {
  const alphabet = 'ABCDEFGHIKLMNOPQRSTUVWXYZ'; // I/J combined
  key = key
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/J/g, 'I');
  const seen = new Set();
  const square = [];
  const coordsMap = {};

  const fullKey = key + alphabet;

  for (let char of fullKey) {
    if (!seen.has(char) && alphabet.includes(char)) {
      seen.add(char);
      square.push(char);
    }
  }

  for (let i = 0; i < square.length; i++) {
    const row = Math.floor(i / 5) + 1;
    const col = (i % 5) + 1;
    coordsMap[square[i]] = row * 10 + col;
  }

  return coordsMap;
}

/** Returns coordinates for each character in the keyword for the nihilist cipher. */
function getCoordsFromKeyword(keyword, square) {
  const stripped = keyword.toUpperCase().replace(/J/g, 'I');
  const coords = [];

  for (let char of stripped) {
    if (isLetter(char)) {
      coords.push(square[char == 'J' ? 'I' : char]);
    }
  }

  return coords;
}

/** Strips non-alpha characters from the plaintext of a quote. */
export function stripQuote(text, isSpanish) {
  const graphemes = getSplitter().splitGraphemes(text);
  let stripped = '';
  for (let letter of graphemes) {
    if (isLetter(letter, isSpanish)) {
      stripped += letter.toUpperCase();
    }
  }
  return stripped;
}

/** Determines if a given string is a single alpha character. */
export function isSolvableChunk(chunk, cipherType) {
  if (!cipherTypes[cipherType].bypassCheck) {
    if (chunk && chunk.length == 1 && isLetter(chunk[0], cipherType == 'Xenocrypt')) {
      return true;
    } else {
      return false;
    }
  } else {
    return chunk !== '';
  }
}
