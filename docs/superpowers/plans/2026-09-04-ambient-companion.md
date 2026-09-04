# Ambient Companion Chatter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spontaneous pet chatter context-aware, action-matched, non-repetitive, and easy to configure without changing formal reminders.

**Architecture:** Extend the existing ambient event context and AI copy boundary rather than creating a second AI pipeline. Keep a bounded recent-line list in the existing companion state, and isolate similarity checks in `ai-copy.mjs` so runtime orchestration stays small.

**Tech Stack:** Electron, vanilla JavaScript, Vitest, Playwright, Vite.

---

### Task 1: Context-aware ambient copy

**Files:**
- Modify: `src/platform/electron/ai-copy.mjs`
- Modify: `src/platform/electron/runtime.mjs`
- Test: `tests/ai-copy.test.js`
- Test: `tests/companion.test.js`

- [x] Add failing tests for selected action, timer context, recent lines, and ambient-only prompt rules.
- [x] Pass the selected action and real timer values into the AI request.
- [x] Keep alarm/focus/off-work request payloads unchanged.
- [x] Run `npx vitest run --root . tests/ai-copy.test.js tests/companion.test.js`.

### Task 2: Bounded duplicate protection

**Files:**
- Modify: `src/platform/electron/ai-copy.mjs`
- Modify: `src/platform/electron/runtime.mjs`
- Test: `tests/ai-copy.test.js`
- Test: `tests/companion.test.js`

- [x] Add tests for exact and highly similar Chinese lines.
- [x] Implement normalized character n-gram similarity.
- [x] Retry ambient AI generation at most once.
- [x] Store at most eight accepted ambient lines and fall back to built-in copy after a second duplicate.
- [x] Verify migrated state defaults to an empty history.

### Task 3: Companion settings layout

**Files:**
- Modify: `src/ui/index.html`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Test: `tests/ui/control.spec.js`

- [x] Add UI tests for the colocated switch and frequency control.
- [x] Move the switch from Sound and Startup into Pet Personality beside frequency.
- [x] Save `companionEnabled` and `chatFrequency` through their existing commands without duplicating state ownership.
- [x] Verify desktop and narrow viewport layout.

### Task 4: Regression and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Run `npm run verify` and require all core tests to pass.
- [x] Run `npm run test:ui` and inspect companion/settings screenshots.
- [x] Build the next Apple Silicon ZIP with `npm run package:mac:zip`.
- [x] Verify ZIP integrity, Mach-O arm64 architecture, and SHA-256 checksum.
