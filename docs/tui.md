Of course. Here is your final, comprehensive `TUI.README.MD`.

This specification consolidates all our advanced designs and incorporates your latest feature requests, including force hotkeys and an interactive choice during initialization. This is the complete blueprint for your stateful terminal UI.

***

# Relaycode TUI - Final Design Specification

## Core Philosophy

1.  **The Persistent Frame:** The application lives within a consistent frame composed of a Header, Body, and Status/Action Bar. Content updates in-place, creating a stable, app-like experience.
2.  **Borderless with Intentional Lines:** The UI avoids heavy, boxed-in layouts. Structure is created with whitespace and fine, single-character horizontal lines (`─`). This creates an elegant, modern feel.
3.  **Stateful & Contextual:** The entire UI is a reflection of the application's current state. The information displayed and actions available change dynamically, guiding the user intuitively.
4.  **Keyboard-First Interaction:** Every action is accessible via the keyboard. Hotkeys are clearly displayed, and navigation is designed to be fast and efficient for power users.

---

## Screen 1: The Initialization Screen (`relay init`)

A dynamic, multi-stage bootstrap sequence that guides the user through setup, provides context, and handles advanced configuration choices.

### State 1.1: Phase 1 - Analyze

The process begins by intelligently scanning the project environment.

```
 ▲ relaycode bootstrap
 ──────────────────────────────────────────────────────────────────────────────
 PHASE 1: ANALYZE

 (●) Scanning project structure...
     └─ Finding package.json
 ( ) Determining Project ID
 ( ) Checking for existing .gitignore

 ──────────────────────────────────────────────────────────────────────────────
 This utility will configure relaycode for your project.
```

### State 1.2: Phase 2 - Configure

Results from the analysis are displayed in a persistent `CONTEXT` panel, and the UI moves to the configuration phase.

```
 ▲ relaycode bootstrap
 ──────────────────────────────────────────────────────────────────────────────
 CONTEXT
   ✓ Project ID: 'relaycode' (from package.json)
   ✓ Gitignore:  Found at ./

 PHASE 2: CONFIGURE

 (●) Creating relay.config.json...
     └─ Writing default configuration with Project ID
 ( ) Initializing .relay state directory
 ( ) Generating system prompt template

 ──────────────────────────────────────────────────────────────────────────────
 Applying configuration based on project analysis...
```

### State 1.3: Interactive Choice (Advanced)

The process pauses to ask the user a critical configuration question, presenting a clear choice with a default action.

```
 ▲ relaycode bootstrap
 ──────────────────────────────────────────────────────────────────────────────
 CONTEXT
   ✓ Project ID: 'relaycode'
   ✓ Gitignore:  Found at ./

 PHASE 2: CONFIGURE

 [✓] Created relay.config.json
 [✓] Initialized .relay state directory
 > The .relay/ directory is usually ignored by git.
   Do you want to share its state with your team by committing it?

 ──────────────────────────────────────────────────────────────────────────────
 (Enter) No, ignore it (default)      (S) Yes, share it
```

### State 1.4: Finalization & Hand-off

The screen transforms into a final summary report. The content of the report dynamically reflects the choice made in the previous step.

```
 ▲ relaycode bootstrap complete
 ──────────────────────────────────────────────────────────────────────────────
  SYSTEM READY

  ✓ Config:   relay.config.json created.
              › Edit this file to tune linters, git integration, etc.

  ✓ State:    .relay/ directory initialized and added to .gitignore.
              › Local transaction history will be stored here.

  ✓ Prompt:   System prompt generated at .relay/prompts/system-prompt.md.
              › Copied to clipboard. Paste into your AI's custom instructions.

 ──────────────────────────────────────────────────────────────────────────────
 (W)atch for Patches · (L)View Logs · (Q)uit
```
**Note:** If the user pressed `(S)` to share the state, the `State` line would read:
`✓ State:    .relay/ directory initialized. It will be committed to git.`

---

## Screen 2: The Dashboard Screen (`relay watch`)

The central command center. A high-density, live-updating HUD and event stream for managing transactions.

### State 2.1: Active & Populated

The primary state, showing a live feed of system events and key status indicators.

```
 ▲ relaycode dashboard
 ──────────────────────────────────────────────────────────────────────────────
 STATUS: ● LISTENING · APPROVALS: 01 · COMMITS: 03

  EVENT STREAM (Last 15 minutes)

  > -15s   ? PENDING   e4a7c112 · fix: add missing error handling
    -2m    ✓ APPLIED   4b9d8f03 · refactor: simplify clipboard logic
    -5m    → COMMITTED 8a3f21b8 · feat: implement new dashboard UI
    -8m    ↩ REVERTED  b2c9e04d · Reverting transaction 9c2e1a05
    -9m    ✗ FAILED    9c2e1a05 · style: update button component (Linter errors: 5)
    -12m   → COMMITTED c7d6b5e0 · docs: update readme with TUI spec

 ──────────────────────────────────────────────────────────────────────────────
 (↑↓) Nav · (Enter) Review · (A)pprove All · (C)ommit All · (P)ause · (Q)uit
```

**Interactions:**
*   `(A)`: Open the **Confirmation Overlay** to approve all pending transactions.
*   `(Shift+A)`: **Force Approve All**. Immediately approve all pending transactions, skipping confirmation.
*   `(C)`: Open the **Confirmation Overlay** to mark all applied transactions for git commit.
*   `(Shift+C)`: **Force Commit All**. Immediately mark all applied transactions for commit, skipping confirmation.
*   `(P)`: Pause the watcher, transitioning to the `PAUSED` state.
*   `(Enter)`: Open a detailed review screen for the selected `>` transaction.

### State 2.2: Confirmation Overlay

A modal-like overlay that appears to prevent accidental bulk actions, providing a final chance to review.

**Trigger:** User presses `(A)` or `(C)`.

```
 ▲ relaycode dashboard
 ──────────────────────────────────────────────────────────────────────────────
 STATUS: ● LISTENING · APPROVALS: ┌ 01 ┐ · COMMITS: 03
                                 └────┘
  APPROVE ALL PENDING TRANSACTIONS?

  The following transaction will be approved:
  - e4a7c112: fix: add missing error handling

 ──────────────────────────────────────────────────────────────────────────────
 (Enter) Confirm      (Esc) Cancel
 ──────────────────────────────────────────────────────────────────────────────
  EVENT STREAM ... (pushed down)
```

### State 2.3: In-Progress Operation

Provides visual feedback while a bulk action (like Force Commit) is processing.

**Trigger:** User confirms an overlay or uses a `Shift+` hotkey.

```
 ▲ relaycode dashboard
 ──────────────────────────────────────────────────────────────────────────────
 STATUS: ● COMMITTING... · APPROVALS: 01 · COMMITS: (●)

  EVENT STREAM (Last 15 minutes)

   -15s   ● Applying...   e4a7c112 · fix: missing try catch block
  > -15s   ? PENDING   e4a7c112 · fix: add missing error handling
    -2m    → Committing... 4b9d8f03 · refactor: simplify clipboard logic
    -5m    → Committing... 8a3f21b8 · feat: implement new dashboard UI
    -9m    ✗ FAILED    9c2e1a05 · style: update button component (Linter errors: 5)

 ──────────────────────────────────────────────────────────────────────────────
 Processing... This may take a moment.
```

### State 2.4: Paused

A clear, intentional state indicating that the clipboard watcher is inactive.

**Trigger:** User presses `(P)`.

```
 ▲ relaycode dashboard
 ──────────────────────────────────────────────────────────────────────────────
 STATUS: || PAUSED · APPROVALS: 01 · COMMITS: 03

  EVENT STREAM ...

 ──────────────────────────────────────────────────────────────────────────────
 (↑↓) Nav · (Enter) Review · (R)esume · (A)pprove All · (C)ommit All · (Q)uit
```

---

### UI Symbol Legend

*   `(●)`: Process is active / running.
*   `( )` / `[ ]`: Task is pending.
*   `[✓]` / `✓`: Task completed successfully.
*   `||`: Process is paused.
*   `>`: Currently selected/focused item.
*   `?`: Status is Pending Approval.
*   `✓`: Transaction applied successfully.
*   `→`: Transaction marked for git commit.
*   `✗`: Transaction failed or was rolled back.
*   `↩`: Transaction is a revert of a previous transaction.
