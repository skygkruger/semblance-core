// TTS Preprocessor Tests — Pure function tests for text preprocessing.

import { describe, it, expect } from 'vitest';
import { splitIntoSentences, expandNumbers, stripMarkdown } from '../../../packages/core/voice/tts-preprocessor';

describe('TTS Preprocessor', () => {
  it('splitIntoSentences splits on sentence boundaries', () => {
    const result = splitIntoSentences('Hello. How are you?');
    expect(result).toEqual(['Hello.', 'How are you?']);
  });

  it('expandNumbers: "$14.99" becomes "14 dollars and 99 cents"', () => {
    const result = expandNumbers('The total is $14.99 plus tax.');
    expect(result).toContain('14 dollars and 99 cents');
  });

  it('stripMarkdown: "**bold** text" becomes "bold text"', () => {
    const result = stripMarkdown('**bold** text');
    expect(result).toBe('bold text');
  });
});
