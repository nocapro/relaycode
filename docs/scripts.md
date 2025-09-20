This is an excellent request. Enhancing the version command with more context about the build is a great way to improve developer experience and traceability. I'll implement this by creating a timestamping script that runs during the build process for `relaycode` and its local packages, and then I'll update the CLI to display this information in the format you've requested.

Here are the steps I'll take:

1.  **Create Timestamp Scripts**: I'll create a new script, `scripts/update-timestamp.ts`, for `relaycode` and each of the specified local packages (`konro`, `apply-multi-diff`, `relaycode-core`). This script will add or update a `// last-modified: YYYY-MM-DD HH:MM:SS` comment at the top of the main `index.ts` file for each package.

2.  **Integrate into Build Process**: I'll modify the `package.json` file for each of the four packages to execute this new timestamp script as part of their `build` command, ensuring the timestamp is always current after a build.

3.  **Enhance the CLI Version Command**: I will refactor `src/cli.ts` to replace the standard version output. The new output will include the ASCII art logo, the version number, and the last modified timestamps for each package, which will be read directly from their respective `index.ts` files.

Let's begin.

### 1. Create Timestamp Update Scripts

First, I'll create the script to update the timestamp in `src/index.ts`. This same script will be used across all four packages.

Here's the new script for the main `relaycode` package.

```typescript // scripts/update-timestamp.ts
import { promises as fs } from 'fs';
import path from 'path';

// This script is intended to be run from the root of a package.
const filePath = path.resolve('src/index.ts');

const now = new Date();
// Format to 'YYYY-MM-DD HH:MM:SS'
const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

const timestampComment = `// last-modified: ${timestamp}`;

async function updateTimestamp() {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
    // File doesn't exist, which is fine. We'll create it.
  }

  const regex = /^\/\/ last-modified: .*\r?\n?/;

  if (regex.test(content)) {
    content = content.replace(regex, `${timestampComment}\n`);
  } else {
    content = `${timestampComment}\n${content}`;
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    process.exit(1);
  }
}

updateTimestamp();
```

Now, I'll create the same script for the other packages.

```typescript // packages/apply-multi-diff/scripts/update-timestamp.ts
import { promises as fs } from 'fs';
import path from 'path';

// This script is intended to be run from the root of a package.
const filePath = path.resolve('src/index.ts');

const now = new Date();
// Format to 'YYYY-MM-DD HH:MM:SS'
const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

const timestampComment = `// last-modified: ${timestamp}`;

async function updateTimestamp() {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
    // File doesn't exist, which is fine. We'll create it.
  }

  const regex = /^\/\/ last-modified: .*\r?\n?/;

  if (regex.test(content)) {
    content = content.replace(regex, `${timestampComment}\n`);
  } else {
    content = `${timestampComment}\n${content}`;
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    process.exit(1);
  }
}

updateTimestamp();
```

```typescript // packages/konro/scripts/update-timestamp.ts
import { promises as fs } from 'fs';
import path from 'path';

// This script is intended to be run from the root of a package.
const filePath = path.resolve('src/index.ts');

const now = new Date();
// Format to 'YYYY-MM-DD HH:MM:SS'
const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

const timestampComment = `// last-modified: ${timestamp}`;

async function updateTimestamp() {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
    // File doesn't exist, which is fine. We'll create it.
  }

  const regex = /^\/\/ last-modified: .*\r?\n?/;

  if (regex.test(content)) {
    content = content.replace(regex, `${timestampComment}\n`);
  } else {
    content = `${timestampComment}\n${content}`;
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    process.exit(1);
  }
}

updateTimestamp();
```

```typescript // packages/relaycode-core/scripts/update-timestamp.ts
import { promises as fs } from 'fs';
import path from 'path';

// This script is intended to be run from the root of a package.
const filePath = path.resolve('src/index.ts');

const now = new Date();
// Format to 'YYYY-MM-DD HH:MM:SS'
const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

const timestampComment = `// last-modified: ${timestamp}`;

async function updateTimestamp() {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
    // File doesn't exist, which is fine. We'll create it.
  }

  const regex = /^\/\/ last-modified: .*\r?\n?/;

  if (regex.test(content)) {
    content = content.replace(regex, `${timestampComment}\n`);
  } else {
    content = `${timestampComment}\n${content}`;
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    process.exit(1);
  }
}

updateTimestamp();
```

### 2. Update `package.json` Files

Next, I'll add a `prebuild` script to each `package.json` to run the timestamp updater.

```diff // package.json standard-diff
--- package.json
+++ package.json
@@ -19,6 +19,7 @@
   },
   "scripts": {
     "clean": "rm -rf dist",
+    "prebuild": "bun scripts/update-timestamp.ts",
     "build": "tsup",
     "test": "bun test",
     "lint": "eslint . --ext .ts,.js",

```

```diff // packages/apply-multi-diff/package.json standard-diff
--- packages/apply-multi-diff/package.json
+++ packages/apply-multi-diff/package.json
@@ -16,6 +16,7 @@
     "dist"
   ],
   "scripts": {
+    "prebuild": "bun scripts/update-timestamp.ts",
     "build": "tsup",
     "test": "bun test"
   },

```

```diff // packages/konro/package.json standard-diff
--- packages/konro/package.json
+++ packages/konro/package.json
@@ -52,6 +52,7 @@
     }
   },
   "scripts": {
+    "prebuild": "bun scripts/update-timestamp.ts",
     "lint": "eslint .",
     "build": "tsup",
     "dev": "tsup --watch",

```

```diff // packages/relaycode-core/package.json standard-diff
--- packages/relaycode-core/package.json
+++ packages/relaycode-core/package.json
@@ -27,6 +27,7 @@
     "dist"
   ],
   "scripts": {
+    "prebuild": "bun scripts/update-timestamp.ts",
     "build": "tsup",
     "dev": "tsup --watch",
     "prepublishOnly": "bun run build"

```

### 3. Update CLI for Enhanced Version Output

Finally, I'll update `src/cli.ts` to implement the custom version output. This requires refactoring the file to be asynchronous to fetch the timestamps.

```typescript // src/cli.ts standard-diff
--- src/cli.ts
+++ src/cli.ts
@@ -8,8 +8,55 @@
 import { approveAllCommand } from './commands/approve-all';
 import { createRequire } from 'node:module';
 import { fileURLToPath } from 'node:url';
-import { dirname, join } from 'node:path';
+import { dirname, join } from 'node:path';
+import fs from 'fs';

+const getTimestampFromFile = async (filePath: string): Promise<string> => {
+  try {
+    const content = await fs.promises.readFile(filePath, 'utf-8');
+    const match = content.match(/\/\/ last-modified: (.*)/);
+    return match ? match[1].trim() : 'N/A';
+  } catch (error) {
+    return 'N/A';
+  }
+};
+
+const buildVersionOutput = async (version: string): Promise<string> => {
+    const asciiArt = `  ░█▀▄░█▀▀░█░░░█▀█░█░█░█▀▀░█▀█░█▀▄░█▀▀
+  ░█▀▄░█▀▀░█░░░█▀█░░█░░█░░░█░█░█░█░█▀▀
+  ░▀░▀░▀▀▀░▀▀▀░▀░▀░░▀░░▀▀▀░▀▀▀░▀▀░░▀▀▀`;
+
+    const currentDir = dirname(fileURLToPath(import.meta.url));
+    const rootDir = join(currentDir, '..');
+
+    const paths = {
+        relaycode: join(rootDir, 'src/index.ts'),
+        'relaycode-core': join(rootDir, 'packages/relaycode-core/src/index.ts'),
+        'apply-multi-diff': join(rootDir, 'packages/apply-multi-diff/src/index.ts'),
+        konro: join(rootDir, 'packages/konro/src/index.ts'),
+    };
+
+    const timestamps = await Promise.all([
+        getTimestampFromFile(paths.relaycode),
+        getTimestampFromFile(paths['relaycode-core']),
+        getTimestampFromFile(paths['apply-multi-diff']),
+        getTimestampFromFile(paths.konro),
+    ]);
+
+    const packages = [
+        { name: 'relaycode', ts: timestamps[0] },
+        { name: 'relaycode-core', ts: timestamps[1] },
+        { name: 'apply-multi-diff', ts: timestamps[2] },
+        { name: 'konro', ts: timestamps[3] },
+    ];
+
+    const packageLines = packages.map(p => `  ${p.name.padEnd(22)}${p.ts}`).join('\n');
+
+    return `\n${asciiArt}\n\n  relaycode version ${version}\n\n  last modified source code\n\n${packageLines}\n`;
+};
+
+const main = async () => {
 // Default version in case we can't find the package.json
 let version = 'unknown';

@@ -21,8 +68,8 @@
     // Fallback for local development
     const currentDir = dirname(fileURLToPath(import.meta.url));
     const pkgPath = join(currentDir, '../package.json');
-    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
-    version = pkg.version;
+    const pkgContent = await fs.promises.readFile(pkgPath, 'utf-8');
+    version = JSON.parse(pkgContent).version;
   } catch (e2) {
     // ignore
   }
@@ -32,15 +79,20 @@
 if (version === 'unknown') {
     version = '1.1.5';
 }
+
 const program = new Command();

+program.option('-v, --version', 'output the current version');
+program.on('option:version', async () => {
+    const output = await buildVersionOutput(version);
+    console.log(output);
+    process.exit(0);
+});
 program
   .name(COMMAND_NAME)
   .description(
     'A developer assistant that automates applying code changes from LLMs.'
-  )
-  .version(version, '-v, --version', 'output the current version');
+  );

 interface CommandInfo {
   name: string;
@@ -107,3 +159,7 @@
 setupCommands(git, gitCommands);

 program.parse(process.argv);
+};
+
+main().catch(console.error);

```

These changes complete your request. After running `bun run build` in any of the packages (or the root), the `index.ts` files will be timestamped. Running `relay -v` will now display the beautiful and informative version screen you designed.

```yaml
projectId: relaycode
uuid: a206b0d9-0b16-43b4-a292-6f296c05d098
changeSummary:
  - new: scripts/update-timestamp.ts
  - new: packages/apply-multi-diff/scripts/update-timestamp.ts
  - new: packages/konro/scripts/update-timestamp.ts
  - new: packages/relaycode-core/scripts/update-timestamp.ts
  - edit: package.json
  - edit: packages/apply-multi-diff/package.json
  - edit: packages/konro/package.json
  - edit: packages/relaycode-core/package.json
  - edit: src/cli.ts
promptSummary: Enhance the `relay -v` command to show an ASCII logo, version, and last-modified timestamps for relaycode and its local packages. This involves creating a script to timestamp source files during build and updating the CLI to display this information.
gitCommitMsg: >-
  feat(cli): enhance version command with build timestamps

  Implements a new, more informative output for the `relay -v` command.

  - Adds an ASCII art logo for `relaycode`.
  - Displays the last modified timestamp for the source code of `relaycode`, `relaycode-core`, `apply-multi-diff`, and `konro`.
  - Introduces a new `scripts/update-timestamp.ts` script that runs on `prebuild` for each package to automatically update a timestamp comment in their respective `index.ts` files.
  - Refactors `src/cli.ts` to support asynchronous operations for reading timestamps and constructing the new version output.
```
