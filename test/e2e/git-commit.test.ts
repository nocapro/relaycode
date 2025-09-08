import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { runProcessPatch, setupE2ETest } from '../test.util';
import type { E2ETestContext } from '../test.util';
import { gitCommitCommand } from '../../src/commands/git-commit';
import { executeShellCommand } from '../../src/utils/shell';
import { logger } from '../../src/utils/logger';

describe('e2e/git-commit', () => {
    let context: E2ETestContext;

    beforeEach(async () => {
        context = await setupE2ETest();
        await executeShellCommand('git init', context.testDir.path);
        await executeShellCommand('git config user.email "test@example.com"', context.testDir.path);
        await executeShellCommand('git config user.name "Test User"', context.testDir.path);
    });

    afterEach(async () => {
        if (context) await context.cleanup();
    });

    const prompter = async () => true; // Always approve prompts

    it('should do nothing if there are no new transactions since last commit', async () => {
        // Create one transaction
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: 'feat: first commit' } }
        );

        // Commit it
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);
        
        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try to commit again
        // Capture output to check for "No new transactions..." message
        const output: string[] = [];
        const originalInfo = (logger as any).info;
        const originalLog = (logger as any).log;
        const originalWarn = (logger as any).warn;
        const originalError = (logger as any).error;
        const originalSuccess = (logger as any).success;
        
        (logger as any).info = (msg: string) => output.push(msg);
        (logger as any).log = (msg: string) => output.push(msg);
        (logger as any).warn = (msg: string) => output.push(msg);
        (logger as any).error = (msg: string) => output.push(msg);
        (logger as any).success = (msg: string) => output.push(msg);
        
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);
        
        (logger as any).info = originalInfo;
        (logger as any).log = originalLog;
        (logger as any).warn = originalWarn;
        (logger as any).error = originalError;
        (logger as any).success = originalSuccess;
        
        const logOutput = output.join('\n');
        expect(logOutput).toContain('No new transactions to commit since the last git commit.');

        const { stdout } = await executeShellCommand('git rev-list --count HEAD', context.testDir.path);
        expect(stdout.trim()).toBe('1');
    });

    it('should combine multiple transaction messages into one commit', async () => {
        // Transaction 1
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: 'feat: add file1' } }
        );
        // Wait a bit to ensure different timestamps
        await new Promise(r => setTimeout(r, 10));

        // Transaction 2
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file2.ts', content: 'content2' }],
            { responseOverrides: { gitCommitMsg: 'fix: add file2' } }
        );
        await new Promise(r => setTimeout(r, 10));
        
        // Transaction 3
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file3.ts', content: 'content3' }],
            { responseOverrides: { gitCommitMsg: 'refactor: add file3' } }
        );

        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);

        const { stdout } = await executeShellCommand('git log -1 --pretty=%B', context.testDir.path);
        const commitMessage = stdout.trim();

        const expectedMessage = `feat: add file1\n\nfix: add file2\n\nrefactor: add file3`;
        expect(commitMessage).toBe(expectedMessage);
    });
    
    it('should commit all transactions in a new repository', async () => {
        // Transaction 1
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: 'feat: add file1' } }
        );
        await new Promise(r => setTimeout(r, 10));
        
        // Transaction 2
        await runProcessPatch(
            context,
            {},
            [{ type: 'new', path: 'file2.ts', content: 'content2' }],
            { responseOverrides: { gitCommitMsg: 'fix: add file2' } }
        );
        
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);

        const { stdout } = await executeShellCommand('git log -1 --pretty=%B', context.testDir.path);
        const commitMessage = stdout.trim();

        const expectedMessage = `feat: add file1\n\nfix: add file2`;
        expect(commitMessage).toBe(expectedMessage);
        
        const { stdout: commitCount } = await executeShellCommand('git rev-list --count HEAD', context.testDir.path);
        expect(commitCount.trim()).toBe('1');
    });

    it('should only commit transactions newer than the last git commit', async () => {
        // Transaction 1 & 2
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: 'feat: add file1' } }
        );
        await new Promise(r => setTimeout(r, 10));
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file2.ts', content: 'content2' }],
            { responseOverrides: { gitCommitMsg: 'fix: add file2' } }
        );

        // Commit them
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);

        const { stdout: firstCommitMsg } = await executeShellCommand('git log -1 --pretty=%B', context.testDir.path);
        expect(firstCommitMsg.trim()).toBe('feat: add file1\n\nfix: add file2');

        // Allow some time to pass to ensure the next transaction is definitely newer.
        // Filesystem timestamps can have low resolution.
        await new Promise(r => setTimeout(r, 1000));

        // Transaction 3
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file3.ts', content: 'content3' }],
            { responseOverrides: { gitCommitMsg: 'refactor: add file3' } }
        );

        // Commit again
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);

        const { stdout: secondCommitMsg } = await executeShellCommand('git log -1 --pretty=%B', context.testDir.path);
        expect(secondCommitMsg.trim()).toBe('refactor: add file3');

        const { stdout: commitCount } = await executeShellCommand('git rev-list --count HEAD', context.testDir.path);
        expect(commitCount.trim()).toBe('2');
    });
    
    it('should ignore transactions without commit messages', async () => {
        // Transaction 1 with message
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: 'feat: add file1' } }
        );
        await new Promise(r => setTimeout(r, 10));
        
        // Transaction 2 without message
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file2.ts', content: 'content2' }],
            { responseOverrides: { gitCommitMsg: undefined } }
        );
        
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);

        const { stdout } = await executeShellCommand('git log -1 --pretty=%B', context.testDir.path);
        const commitMessage = stdout.trim();

        expect(commitMessage).toBe('feat: add file1');
    });

    it('should abort if there are new transactions but none have commit messages', async () => {
        // All transactions have no message
        await runProcessPatch(
            context, {}, [{ type: 'new', path: 'file1.ts', content: 'content1' }],
            { responseOverrides: { gitCommitMsg: undefined } }
        );
        
        const output: string[] = [];
        const originalWarn = (logger as any).warn;
        (logger as any).warn = (msg: string) => output.push(msg);
        
        await gitCommitCommand({ yes: true }, context.testDir.path, prompter);
        
        (logger as any).warn = originalWarn;

        const logOutput = output.join('\n');
        expect(logOutput).toContain('No new transactions with git commit messages found');
        
        // No commit should have been made
        const { exitCode } = await executeShellCommand('git rev-parse HEAD', context.testDir.path);
        expect(exitCode).not.toBe(0);
    });
});