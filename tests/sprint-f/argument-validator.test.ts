import { describe, it, expect } from 'vitest';
import { ArgumentValidator } from '../../packages/gateway/security/argument-validator.js';

describe('Sprint F — Argument Validator', () => {
  const validator = new ArgumentValidator();

  describe('rejects shell metacharacters', () => {
    const metacharacters = [
      { arg: 'hello; rm -rf /', reason: 'semicolon' },
      { arg: 'file & background', reason: 'ampersand' },
      { arg: 'cat | grep', reason: 'pipe' },
      { arg: 'echo `whoami`', reason: 'backtick' },
      { arg: '$(whoami)', reason: 'command substitution' },
      { arg: 'file > /etc/passwd', reason: 'redirect' },
      { arg: 'hello (world)', reason: 'parens' },
      { arg: '{a,b,c}', reason: 'braces' },
      { arg: 'test [1]', reason: 'brackets' },
      { arg: '$HOME/secret', reason: 'dollar sign' },
    ];

    for (const { arg, reason } of metacharacters) {
      it(`rejects ${reason}: "${arg}"`, () => {
        const result = validator.validate('ffmpeg', [arg]);
        expect(result).not.toBeNull();
      });
    }
  });

  describe('rejects dangerous patterns', () => {
    it('rejects --exec flag', () => {
      const result = validator.validate('find', ['/', '--exec', 'rm', '{}']);
      expect(result).toContain('rejected');
    });

    it('rejects path traversal (../)', () => {
      const result = validator.validate('cat', ['../../etc/passwd']);
      expect(result).toContain('path traversal');
    });

    it('rejects 2>&1 redirect', () => {
      const result = validator.validate('ffmpeg', ['-i', 'file.mp4', '2>&1']);
      expect(result).not.toBeNull(); // Contains shell metacharacters (& and >)
    });

    it('rejects null bytes', () => {
      const result = validator.validate('ffmpeg', ['file\0.mp4']);
      expect(result).toContain('null byte');
    });
  });

  describe('enforces limits', () => {
    it('rejects arguments exceeding 4096 characters', () => {
      const longArg = 'a'.repeat(5000);
      const result = validator.validate('ffmpeg', [longArg]);
      expect(result).toContain('too long');
    });

    it('rejects more than 32 arguments', () => {
      const args = Array.from({ length: 33 }, (_, i) => `arg${i}`);
      const result = validator.validate('ffmpeg', args);
      expect(result).toContain('too many');
    });
  });

  describe('allows valid arguments', () => {
    it('allows simple file names', () => {
      expect(validator.validate('ffmpeg', ['-i', 'input.mp4', '-o', 'output.mp3'])).toBeNull();
    });

    it('allows flags', () => {
      expect(validator.validate('ffmpeg', ['-codec:v', 'libx264', '-crf', '23'])).toBeNull();
    });

    it('allows numbers', () => {
      expect(validator.validate('ffmpeg', ['-ss', '00:01:30', '-t', '60'])).toBeNull();
    });

    it('allows empty argument array', () => {
      expect(validator.validate('git', [])).toBeNull();
    });
  });
});
