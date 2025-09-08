import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { setupE2ETest, createTestFile, runProcessPatch } from '../test.util';
import type { E2ETestContext } from '../test.util';
import { logCommand } from '../../src/commands/log';
import { initCommand } from '../../src/commands/init';

describe('e2e/log', () => {
    let context: E2ETestContext;
    let logs: string[];

    beforeEach(async () => {
        context = await setupE2ETest();
        logs = [];
    });

    afterEach(async () => {
        if (context) await context.cleanup();
    });

    it('should display a warning when the state directory does not exist', async () => {
        await logCommand(context.testDir.path, logs);
        const output = logs.join('\n');
        expect(output).toContain("State directory '.relay' not found. No logs to display.");
        expect(output).toContain("Run 'relay init' to initialize the project.");
    });

    it('should display a message when no transactions are found in an initialized project', async () => {
        // Initialize the project to create the config and state directory
        await initCommand(context.testDir.path);

        await logCommand(context.testDir.path, logs);
        const output = logs.join('\n');
        expect(output).toContain('info: No committed transactions found.');
    });

    it('should correctly display a single transaction', async () => {
        const testFile = 'src/index.ts';
        const newContent = 'console.log("hello");';
        const reasoning = 'This is the reason for the change.';
        await createTestFile(context.testDir.path, testFile, 'original');

        const { uuid } = await runProcessPatch(
            context,
            {},
            [{ type: 'edit', path: testFile, content: newContent }],
            { responseOverrides: { reasoning: [reasoning] } }
        );

        await logCommand(context.testDir.path, logs);
        const output = logs.join('\n');

        expect(output).toContain('Committed Transactions (most recent first):');
        expect(output).toContain(`- UUID: ${uuid}`);
        expect(output).toContain('Date:');
        // Reasoning is no longer shown by default in log output
        expect(output).toContain('Changes:');
        expect(output).toContain(`- write:  ${testFile}`);
    });

    it('should display multiple transactions in reverse chronological order', async () => {
        // Transaction 1
        const { uuid: uuid1 } = await runProcessPatch(
            context, {},
            [{ type: 'new', path: 'src/first.ts', content: '' }]
        );
        // Wait a bit to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 50));

        // Transaction 2
        const { uuid: uuid2 } = await runProcessPatch(
            context, {},
            [{ type: 'edit', path: 'src/first.ts', content: 'v2' }]
        );

        await logCommand(context.testDir.path, logs);
        const output = logs.join('\n');

        const indexOfUuid1 = output.indexOf(uuid1);
        const indexOfUuid2 = output.indexOf(uuid2);

        expect(indexOfUuid1).toBeGreaterThan(-1);
        expect(indexOfUuid2).toBeGreaterThan(-1);
        // uuid2 is more recent, so it should appear first (lower index)
        expect(indexOfUuid2).toBeLessThan(indexOfUuid1);
        expect(output).toContain(`- write:  src/first.ts`);
    });

    it('should correctly display a transaction with multiple operations', async () => {
        await createTestFile(context.testDir.path, 'src/to-delete.ts', 'content');
        await createTestFile(context.testDir.path, 'src/main.ts', 'original content');

        const { uuid } = await runProcessPatch(
            context, {},
            [
                { type: 'edit', path: 'src/main.ts', content: 'main' },
                { type: 'new', path: 'src/new.ts', content: 'new' },
                { type: 'delete', path: 'src/to-delete.ts' }
            ]
        );

        await logCommand(context.testDir.path, logs);
        const output = logs.join('\n');

        expect(output).toContain(`- UUID: ${uuid}`);
        const changesSection = output.slice(output.indexOf('Changes:'));
        expect(changesSection).toContain('- write:  src/main.ts');
        expect(changesSection).toContain('- write:  src/new.ts');
        expect(changesSection).toContain('- delete: src/to-delete.ts');
    });
});