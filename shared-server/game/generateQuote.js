import { findRandomEntry } from '../utils/dbUtil.js';
import { getQuoteModel } from './getQuoteModel.js';
import { Word } from '../models/Word.js';
import { cipherTypes } from '../shared/CipherTypes.js';
import { encodeQuote, findDeterminant } from '../shared/CipherUtil.js';
import { encryptText } from '../utils/textEncode.js';
import { generateHomophonicCrib } from './homophonicKeywords.js';

export async function generateQuote(p) {
  const randomQuote = await findRandomEntry(getQuoteModel(p['cipherType']), {
    length: {
      $gte: cipherTypes[p['cipherType']]['length'][0],
      $lte: cipherTypes[p['cipherType']]['length'][1],
    },
  });

  const keyCount = cipherTypes[p['cipherType']]['keys'];
  let keys = [];
  if (p['cipherType'] == 'Affine') {
    const aVals = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
    keys.push(aVals[Math.floor(Math.random() * aVals.length)] * (Math.random() < 0.5 ? -1 : 1));
    keys.push(
      Math.random() < 0.5 ? Math.floor(Math.random() * 26) - 26 : Math.floor(Math.random() * 25) + 1
    );
  } else if (p['cipherType'] == 'Homophonic') {
    const { keyword, cribDisplay } = generateHomophonicCrib();
    keys.push(keyword);
    keys.push(cribDisplay);
  } else {
    for (let keyName of keyCount) {
      let randomWord = '';
      do {
        if (keyName != 'polybius key' && p['cipherType'] == 'Checkerboard') {
          randomWord = await findRandomEntry(Word, { length: 5 });
          continue;
        }
        if (p['cipherType'] == 'Hill') {
          let determinant = -1;
          do {
            randomWord = await findRandomEntry(Word, { length: 4 });
            determinant = findDeterminant(randomWord['text'].toUpperCase());
          } while (determinant == -1 || determinant % 2 == 0 || determinant % 13 == 0);
          continue;
        }
        randomWord = await findRandomEntry(Word, {
          length: { $gte: 5, $lte: 9 },
        });
      } while (keys.includes(randomWord));
      keys.push(randomWord['text'].toUpperCase());
    }
  }

  let encodedQuote;
  let crib = null;

  if (
    p['Solve'] == 'Decode' ||
    p['cipherType'] == 'Fractionated Morse' ||
    p['cipherType'] == 'Homophonic'
  ) {
    const result = encodeQuote(
      randomQuote['text'],
      p['cipherType'] == 'Patristocrat' ? 'Aristocrat' : p['cipherType'],
      keys,
      p
    );

    // Fractionated Morse returns {ciphertext, cribPlaintext, letterToTrigram}
    if (p['cipherType'] === 'Fractionated Morse' && result.ciphertext) {
      encodedQuote = result.ciphertext;
      keys[1] = result.cribPlaintext;
    } else {
      encodedQuote = result;
    }
  } else {
    encodedQuote = randomQuote['text'].split('').map((c) => c.toUpperCase());
  }

  const encryptedId = encryptText(randomQuote['_id'].toString());

  const keysDef = cipherTypes[p['cipherType']].keys;
  for (let i = 0; i < keys.length; i++) {
    if (keysDef[i] && keysDef[i].startsWith('!')) {
      keys[i] = '';
    }
  }

  const response = { id: encryptedId, quote: encodedQuote, keys: keys };
  return response;
}
