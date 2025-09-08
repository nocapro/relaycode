import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { setupE2ETest, createTestFile } from '../test.util';
import type { E2ETestContext } from '../test.util';
import { getTypeScriptErrorCount } from '../../src/utils/typescript';

describe('utils/typescript', () => {
    let context: E2ETestContext;

    beforeEach(async () => {
        // We reuse the E2E test setup as it provides a clean temporary directory.
        context = await setupE2ETest({ withTsconfig: false });
    });

    afterEach(async () => {
        if (context) await context.cleanup();
    });

    const createTsConfig = async (compilerOptions: any = {}, fileName: string = 'tsconfig.json') => {
        const defaultConfig = {
            compilerOptions: {
                strict: true,
                noEmit: true,
                isolatedModules: true,
                noUnusedLocals: false, // Disable for tests to focus on type errors.
                skipLibCheck: true, // Skip type checking of declaration files
                target: "ES2020",
                lib: ["ES2020"],
                moduleResolution: "node",
                ...compilerOptions,
            },
            include: ["src/**/*.ts"],
        };
        await createTestFile(context.testDir.path, fileName, JSON.stringify(defaultConfig, null, 2));
    };

    it('should return 0 for a valid TypeScript file', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: number = 1;');
        const errorCount = getTypeScriptErrorCount('tsc', context.testDir.path);
        expect(errorCount).toBe(0);
    });

    it('should return 1 for a file with a single type error', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should return multiple errors for a file with multiple type errors', async () => {
        await createTsConfig();
        const content = `
            const x: string = 123;
            let y: number;
            y = "hello";
            export {};
        `;
        await createTestFile(context.testDir.path, 'src/index.ts', content);
        const errorCount = getTypeScriptErrorCount('tsc', context.testDir.path);
        expect(errorCount).toBe(2);
    });
    
    it('should correctly count errors in build mode (tsc -b)', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc -b', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should handle -p flag pointing to a specific tsconfig file', async () => {
        await createTsConfig({}, 'tsconfig.custom.json');
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc -p tsconfig.custom.json', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should handle --project flag pointing to a specific tsconfig file', async () => {
        await createTsConfig({}, 'tsconfig.custom.json');
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc --project tsconfig.custom.json', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should handle --project flag pointing to a directory with tsconfig.json', async () => {
        await fs.mkdir(path.join(context.testDir.path, 'config'));
        await createTsConfig({ rootDir: '..', baseUrl: '..'}, 'config/tsconfig.json');
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc --project config', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should return -1 if tsconfig.json is not found', async () => {
        await createTestFile(context.testDir.path, 'src/index.ts', 'const x: number = 1;');
        const errorCount = getTypeScriptErrorCount('tsc', context.testDir.path);
        expect(errorCount).toBe(-1); // Sentinel for fallback
    });

    it('should count syntax errors', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: = 1;');
        const errorCount = getTypeScriptErrorCount('tsc', context.testDir.path);
        expect(errorCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle linter command with extra arguments', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x: string = 123;');
        const errorCount = getTypeScriptErrorCount('tsc --noEmit --pretty false', context.testDir.path);
        expect(errorCount).toBe(1);
    });

    it('should return 0 for a valid project when using tsc -b with a specific path', async () => {
        await createTsConfig();
        await createTestFile(context.testDir.path, 'src/index.ts', 'export const x = 1;');
        const errorCount = getTypeScriptErrorCount('tsc -b tsconfig.json', context.testDir.path);
        expect(errorCount).toBe(0);
    });
});