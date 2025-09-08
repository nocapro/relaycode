import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { setupE2ETest, createTestFile, runProcessPatch } from '../test.util';
import type { E2ETestContext } from '../test.util';
import { parseLLMResponse } from 'relaycode-core';
import { readStateFile } from '../../src';

interface FileState {
  path: string;
  content?: string;
  exists?: boolean;
}

interface E2ETestCase {
  name: string;
  description: string;
  markdown_content: string;
  initial_state: FileState[];
  expected_state?: FileState[];
  expected_outcome?: 'success' | 'failure';
}

interface TestFixtures {
  e2e_patch_tests: E2ETestCase[];
}

const loadFixturesFromDir = (dirPath: string): TestFixtures => {
  const allFixtures: TestFixtures = {
    e2e_patch_tests: [],
  };
  const files = fsSync.readdirSync(dirPath);
  for (const file of files) {
    if (path.extname(file) === '.yml' || path.extname(file) === '.yaml') {
      const filePath = path.join(dirPath, file);
      const fixture = yaml.load(
        fsSync.readFileSync(filePath, 'utf-8')
      ) as Partial<TestFixtures>;
      if (fixture.e2e_patch_tests) {
        allFixtures.e2e_patch_tests.push(...fixture.e2e_patch_tests);
      }
    }
  }
  return allFixtures;
};
const fixturePath = path.join(__dirname, '../fixtures/e2e');
const fixtures = loadFixturesFromDir(fixturePath);

describe('e2e/patcher (from fixtures)', () => {
  let context: E2ETestContext;

  beforeEach(async () => {
    context = await setupE2ETest();
  });

  afterEach(async () => {
    if (context) await context.cleanup();
  });

  fixtures.e2e_patch_tests.forEach(testCase => {
    it(testCase.description, async () => {
      // 1. Set up initial state
      for (const file of testCase.initial_state) {
        await createTestFile(context.testDir.path, file.path, file.content ?? '');
      }

      // 2. Parse the markdown to get operations
      // Dynamically add the required YAML control block to the test case markdown.
      // The parser now requires this block to be present.
      const projectId = path.basename(context.testDir.path);
      const markdownWithYaml = `${testCase.markdown_content}

projectId: ${projectId}
uuid: 00000000-0000-0000-0000-000000000000
`;
      const parsedResponse = parseLLMResponse(markdownWithYaml);

      if (testCase.expected_outcome === 'failure' && !parsedResponse) {
        // This is a valid failure case where the parser rejects the input.
        // For example, an invalid patch strategy.
        expect(parsedResponse).toBeNull();
        return; // Test passes.
      }

      expect(parsedResponse).not.toBeNull();
      if (!parsedResponse) throw new Error('Test case markdown failed to parse');

      // Map FileOperation from core to the TestOperation type expected by the test utility.
      // This is needed because the test utility has a different 'type' for write operations ('edit'/'new')
      // and uses 'strategy' instead of 'patchStrategy'.
      const initialFilePaths = new Set(testCase.initial_state.map(file => file.path));
      const operations = parsedResponse.operations.map(op => {
        if (op.type === 'write') {
          return {
            type: initialFilePaths.has(op.path) ? ('edit' as const) : ('new' as const),
            path: op.path,
            content: op.content,
            strategy: op.patchStrategy,
          };
        }
        return op;
      });

      // 3. Run the patch process
      // We can't destructure `success` as it's not returned. We determine success by checking the state file later.
      const { uuid } = await runProcessPatch(context, {}, operations, {
        responseOverrides: { reasoning: [] },
      });

      const expectedSuccess = testCase.expected_outcome !== 'failure';
      const committedState = await readStateFile(context.testDir.path, uuid);
      const success = !!committedState;
      expect(success).toBe(expectedSuccess);

      // 4. Verify the final state
      if (expectedSuccess) {
        const stateToVerify = testCase.expected_state ?? testCase.initial_state;

        for (const file of stateToVerify) {
          const filePath = path.join(context.testDir.path, file.path);
          const fileExists = await fs
            .access(filePath)
            .then(() => true)
            .catch(() => false);

          if (file.exists === false) {
            expect(fileExists).toBe(false);
          } else {
            expect(fileExists).toBe(true);
            const finalContent = await fs.readFile(filePath, 'utf-8');
            const normalize = (str: string) => str.replace(/\r\n/g, '\n');
            expect(normalize(finalContent)).toBe(normalize(file.content ?? ''));
          }
        }
      } else {
        // Expected failure

        // Verify that initial state is unchanged
        for (const file of testCase.initial_state) {
          const filePath = path.join(context.testDir.path, file.path);
          const finalContent = await fs.readFile(filePath, 'utf-8');
          const normalize = (str: string) => str.replace(/\r\n/g, '\n');
          expect(normalize(finalContent)).toBe(normalize(file.content ?? ''));
        }
      }
    });
  });
});