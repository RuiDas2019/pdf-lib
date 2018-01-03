/* @flow */
import { PDFDictionary, PDFName } from '../pdf-objects';
import { PDFCatalog, PDFPageTree, PDFPage } from '../pdf-structures';
import { error, arrayToString, trimArray } from '../../utils';
import { validate, isIdentity } from '../../utils/validate';

import parseNull from './parseNull';
import parseIndirectRef from './parseIndirectRef';
import parseString from './parseString';
import parseHexString from './parseHexString';
import parseName from './parseName';
import parseBool from './parseBool';
import parseNumber from './parseNumber';
import parseArray from './parseArray';

import type { ParseHandlers } from './PDFParser';

/* eslint-disable prettier/prettier */
const typeDict = (dict: PDFDictionary) => {
  switch (dict.get('Type')) {
    case PDFName.from('Catalog'): return PDFCatalog.from(dict);
    case PDFName.from('Pages'):   return PDFPageTree.from(dict);
    case PDFName.from('Page'):    return PDFPage.from(dict);
    default:                      return dict;
  }
};
/* eslint-enable prettier/prettier */

/**
Accepts an array of bytes as input. Checks to see if the first characters in the
trimmed input make up a PDF Dictionary.

If so, returns a tuple containing (1) an object representing the parsed
PDFDictionary and (2) a subarray of the input with the characters making up the
parsed header removed. The "onParseDict" parse handler will also be called with
the PDFDictionary object.

If not, null is returned.

Note that the entries of the PDF Dictionary are recursively parsed, so the
appropriate parse handlers will be called when each entry of the dictionary is
parsed. The returned PDFDictionary's keys will be PDFName objects, and its
values will be PDFObjects.
*/
const parseDict = (
  input: Uint8Array,
  parseHandlers: ParseHandlers = {},
): ?[PDFDictionary, Uint8Array] => {
  const trimmed = trimArray(input);
  if (arrayToString(trimmed, 0, 2) !== '<<') return null;
  const pdfDict = PDFDictionary.from();

  // Recursively parse each entry in the dictionary
  let remainder = trimArray(trimmed.subarray(2));
  while (arrayToString(trimArray(remainder), 0, 2) !== '>>') {
    // Parse the key for this entry
    const [key, r1] =
      parseName(remainder) || error('Failed to parse dictionary key');

    remainder = r1;

    // Parse the value for this entry
    const [pdfObject, r2] =
      parseNull(remainder, parseHandlers) ||
      parseIndirectRef(remainder, parseHandlers) ||
      parseString(remainder, parseHandlers) ||
      parseHexString(remainder, parseHandlers) ||
      parseName(remainder, parseHandlers) ||
      parseBool(remainder, parseHandlers) ||
      parseNumber(remainder, parseHandlers) ||
      parseArray(remainder, parseHandlers) ||
      parseDict(remainder, parseHandlers) ||
      error('Failed to parse dictionary value');

    pdfDict.set(key, pdfObject);
    remainder = r2;
  }
  const remainderTrim = trimArray(remainder);

  // Make sure the brackets are paired
  validate(
    arrayToString(remainderTrim, 0, 2),
    isIdentity('>>'),
    'Mismatched brackets!',
  );

  remainder = trimArray(remainderTrim.subarray(2)); // Remove ending '>>' pair

  const typedDict = typeDict(pdfDict);
  if (parseHandlers.onParseDict) parseHandlers.onParseDict(typedDict);
  return [typedDict, remainder];
};

export default parseDict;