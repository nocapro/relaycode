import { describe, it, expect } from 'bun:test';
import { normalizeGitCommitMsg } from 'relaycode-core';

describe('gitCommitMsg normalization', () => {
  it('should handle single line gitCommitMsg', () => {
    const result = normalizeGitCommitMsg('feat: add new feature');
    expect(result).toBe('feat: add new feature');
  });

  it('should handle multiline gitCommitMsg array', () => {
    const result = normalizeGitCommitMsg([
      'feat: add new feature',
      'This is a detailed description',
      'of the new feature'
    ]);
    expect(result).toBe('feat: add new feature This is a detailed description of the new feature');
  });

  it('should handle empty gitCommitMsg', () => {
    const result = normalizeGitCommitMsg(undefined);
    expect(result).toBeUndefined();
  });

  it('should handle empty array gitCommitMsg', () => {
    const result = normalizeGitCommitMsg([]);
    expect(result).toBe('');
  });

  it('should handle single element array gitCommitMsg', () => {
    const result = normalizeGitCommitMsg(['fix: resolve issue']);
    expect(result).toBe('fix: resolve issue');
  });
});