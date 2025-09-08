import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { createClipboardWatcher } from '../../src/core/clipboard';
import { parseLLMResponse } from 'relaycode-core';
import { processPatch } from '../../src/core/transaction';
import { findConfig } from '../../src/core/config';
import { setupE2ETest, createTestConfig, createTestFile, createLLMResponseString } from '../test.util';
import type { E2ETestContext } from '../test.util';

describe('e2e/watch', () => {
  let context: E2ETestContext;
  let watcher: { stop: () => void } | null = null;

  beforeEach(async () => {
    context = await setupE2ETest();
  });

  afterEach(async () => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    if (context) {
      await context.cleanup();
    }
  });

  it('should ignore invalid patch and process subsequent valid patch', async () => {
    const pollInterval = 50;
    await createTestConfig(context.testDir.path, { clipboardPollInterval: pollInterval });
    const testFile = 'src/index.ts';
    const originalContent = 'console.log("original");';
    await createTestFile(context.testDir.path, testFile, originalContent);

    let fakeClipboardContent = 'this is not a valid patch, just some random text.';
    const clipboardReader = async () => fakeClipboardContent;

    const onClipboardChange = async (content: string) => {
      const currentConfig = await findConfig(context.testDir.path);
      const parsedResponse = parseLLMResponse(content);
      if (!currentConfig || !parsedResponse) {
        return;
      }
      await processPatch(currentConfig, parsedResponse, { cwd: context.testDir.path });
    };

    watcher = createClipboardWatcher(pollInterval, onClipboardChange, clipboardReader);

    // Wait for a couple of poll cycles to ensure the invalid patch is read and ignored
    await new Promise(resolve => setTimeout(resolve, pollInterval * 3));

    // The file should not have changed yet
    const contentAfterInvalid = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(contentAfterInvalid).toBe(originalContent);

    // Stop the watcher to prevent a race condition in the test where the poller
    // and the manual trigger run at the same time.
    if (watcher) watcher.stop();

    // Now, provide a valid patch
    const newContent = 'console.log("new content");';
    const { response: validPatch } = createLLMResponseString([
      { type: 'edit', path: testFile, content: newContent }
    ]);
    fakeClipboardContent = validPatch;

    // Manually trigger the callback with the valid patch, which is now safe from race conditions
    await onClipboardChange(validPatch);

    const contentAfterValid = await fs.readFile(path.join(context.testDir.path, testFile), 'utf-8');
    expect(contentAfterValid).toBe(newContent);
  });
});
