# 🚀 relaycode – turn your clipboard into a surgical code-editing laser

> “I don’t always let an LLM touch my repo, but when I do, I want it to feel like `git rebase -i` on steroids and look like I typed every line myself.”
> – arman

---

## WTF is this?

relaycode is a zero-friction, AI-native patch engine that sits between your favourite LLM and your source tree.
You copy the LLM’s response, we parse the code blocks, apply multi-diffs / search-replace patches, run your linter, optionally commit, and even open a new branch – all while you grab another coffee.

No GitHub Apps, no webhook tunnels, no “please paste your diff into this textarea”.
Just `relay watch`, copy, paste, boom – production-ready patch landed in milliseconds.

---

## Repomix companion
Use Repomix to pack your entire repo into one AI-friendly file, then let Relaycode apply the edits exactly where they belong. No manual file juggling, no merge hell.

---

[![Demo Video](https://raw.githubusercontent.com/nocapro/relaycode/refs/heads/main/yt.png)](https://www.youtube.com/watch?v=Io9HT3D5wgU "Demo Video")

---

## FAQ

Why not an agentic AI loop?

"Agent loops are great until they decide to restructure your project at 2 a.m. Relaycode keeps the AI on a short leash: it can only change what you explicitly paste, nothing more. One clipboard copy, one atomic transaction, zero surprises."

Does it abuse free LLM tiers?

"No. The tool is built to help solo devs work faster, not to exploit anyone’s free tier. Use Google AI Studio (or any other LLM) within the limits they publish—Relaycode doesn’t batch, loop, or automate extra calls behind your back. One clipboard copy equals one human-triggered request, nothing more."

---

## TL;DR demo

```bash
npm i -g relaycode          # 3 s
relay init                  # 2 s
relay watch                 # ∞ s – prints a system prompt
# ⌘+C the prompt → drop it into Claude / ChatGPT / whatever
# ⌘+C the answer → we auto-apply, lint, commit, branch.
```

---

## Want the web version?

If you love this workflow, head to https://www.noca.pro for the full web app: same atomic safety, plus repo-wide visual Drag-and-Drop context, history, and rollback from any browser.

---

## Directory layout

```
src/
├─ commands/                # CLI verbs (init, watch, apply, revert, log, git-commit)
├─ core/                    # Clipboard watcher, state DB, config, transactions
├─ utils/                   # Shell glue, TS compiler API, notifications, formatters
└─ cli.ts                   # Commander entry point
```

---

## Feature drop – the stuff you will ask about

| Thing | How we do it | Why it slaps |
|-------|--------------|--------------|
| **Patch strategies** | `standard-diff`, `search-replace`, `replace` (full file) | LLM picks whichever hurts less; fuzzy matching so whitespace trolls don’t kill the build |
| **Atomic transactions** | Write pending → lint → user approve → commit | Rollback on any failure; your repo never sees half-a-refactor |
| **State storage** | Konro JSON-on-demand DB inside `.relay/` | Git-ignored, portable, no SQLite binary hell |
| **Clipboard watcher** | 2 s polling, works headless, ships Win32 exe fallback | Works in WSL, Docker, CI, your grandma’s Vista box |
| **Approval modes** | `auto` (≤ N linter errs) or `manual` + native toast buttons | Stay in flow or stay in control – pick one |
| **Git integration** | Auto-branch (`relay/feat-uuid`) or reuse message | Squash-ready commits without typing `git checkout -b` ever again |
| **TypeScript API** | Import `applyOperations`, `parseLLMResponse`, `restoreSnapshot` | Embed inside your own codemod bot |
| **Zero external services** | 100 % local, MIT licence, no API keys | Can’t be acqui-killed, can’t leak your code |

---

## Install

```bash
npm i -g relaycode        # or pnpm / bun / yarn
relay init                # scaffolds relay.config.json + .gitignore
```

---

## Quick start

1. `relay watch`
   Prints a tailored system prompt – copy it.

2. Paste into your LLM’s custom instructions.

3. Ask for a change:
   “Add dark-mode toggle to the settings page”

4. Copy the response → relaycode detects clipboard, parses, applies, lints, optionally commits.

5. `relay log` shows a human-readable ledger.
   `relay revert 1` undoes the last transaction (yes, even the commit).

---

## Configuration (`relay.config.json`)

```jsonc
{
  "projectId": "my-cool-app",
  "core": {
    "logLevel": "info",           // silent | error | warn | info | debug
    "enableNotifications": true,  // native toasts
    "watchConfig": true           // hot-reload config
  },
  "watcher": {
    "clipboardPollInterval": 2000,// ms
    "preferredStrategy": "auto"   // auto | replace | standard-diff | search-replace
  },
  "patch": {
    "approvalMode": "auto",       // auto | manual
    "approvalOnErrorCount": 0,    // allow N linter errors before asking
    "linter": "bun tsc --noEmit",
    "preCommand": "",             // e.g. "npm run test:unit"
    "postCommand": "",            // e.g. "npm run format"
    "minFileChanges": 0,
    "maxFileChanges": null
  },
  "git": {
    "autoGitBranch": false,
    "gitBranchPrefix": "relay/",
    "gitBranchTemplate": "gitCommitMsg" // or "uuid"
  }
}
```

---

## CLI cheat-sheet

| Command | Alias | Does |
|---------|-------|------|
| `relay init` | `i` | Creates config + `.relay/` + `.gitignore` entry |
| `relay watch` | `w` | Start clipboard listener (prints system prompt) |
| `relay apply patch.txt` | `a` | One-shot apply from file |
| `relay log` | `l` | Pretty-print transaction history |
| `relay revert [uuid\|index]` | `u` | Undo a transaction (reverse patch + optional git revert) |
| `relay git commit` | `c` | Commit everything since last git commit using LLM-generated messages |
| `relay -y …` | | Skip confirmation prompts (CI friendly) |

---

## Patch format the LLM should spit out

````
Here’s the plan:
1. Add dark-mode toggle state to Redux
2. Persist choice in localStorage
3. Render sun/moon icon in header

```typescript // src/store/uiSlice.ts standard-diff
--- src/store/uiSlice.ts
+++ src/store/uiSlice.ts
@@ ... @@
 interface UIState {
   sidebarOpen: boolean;
+  darkMode: boolean;
 }
@@ ... @@
 const initialState: UIState = {
   sidebarOpen: true,
+  darkMode: localStorage.getItem('dark') === 'true',
 };
@@ ... @@
 export const uiSlice = createSlice({
   reducers: {
+    toggleDarkMode: (state) => {
+      state.darkMode = !state.darkMode;
+      localStorage.setItem('dark', String(state.darkMode));
+    },
   }
 })
```
```yaml
projectId: my-cool-app
uuid: 8f03e278-59dc-4ecc-9a77-ed8a3a3376b2
changeSummary:
  - edit: src/store/uiSlice.ts
gitCommitMsg: "feat: add dark-mode toggle with localStorage persistence"
promptSummary: "User asked for dark-mode toggle"
```
````

---

## Rollback / immutability porn

Every transaction stores an atomic snapshot of affected files.
If anything blows up (linter barfs, you panic, LLM hallucinates a dependency), `relay revert 1` restores the exact bytes that existed before – including timestamps, empty dirs, moved files. Think of it as `git refline` but tuned for AI-generated chaos.

---

## Embedding in your own tooling

```typescript
import { parseLLMResponse, applyOperations, createSnapshot } from 'relaycode';

const parsed = parseLLMResponse(llmOutput);
if (!parsed) throw new Error('Invalid patch');

const affected = new Set<string>();
parsed.operations.forEach(op => op.type === 'rename' ? (affected.add(op.from), affected.add(op.to)) : affected.add(op.path));

const snapshot = await createSnapshot([...affected], process.cwd());
const newStates = await applyOperations(parsed.operations, snapshot);
// newStates is a Map<filePath, newContent | null>
```

---

## Platform support

| OS | Clipboard | Native toasts | Notes |
|----|-----------|---------------|-------|
| macOS | ✅ | ✅ | No deps |
| Linux | ✅ (xsel/xclip) | ✅ | `apt install xsel` once |
| Windows | ✅ (ships exe) | ✅ | Falls back to bundled `clipboard_x86_64.exe` |
| WSL | ✅ | ✅ | Auto-detects and uses Windows exe |
| Docker / headless | ✅ | ❌ | Set `enableNotifications: false` |

---

## Security posture

- Runs locally, zero network calls after install
- Executes only the linter / pre-post commands you configure
- Sandboxed file ops: will not escape project root (uses `path.resolve`)
- Open-source – audit the parser, build your own plugins

---

## Roadmap (PRs welcome)

- [ ] Web UI dashboard (`relay web`)
- [ ] Multi-project monorepo mode
- [ ] GitHub Actions helper (apply PR comments automatically)

---

## Licence

MIT – do whatever, blame no-one, ship faster.

---

## Star / rant / meme

If this saved you from copy-pasting diffs at 3 am, smash the ⭐ button and tell HN how you *“finally fixed legacy jQuery with Claude in 47 seconds”*.
We’ll be in the comments arguing about whether AI patches count as technical debt.
