# Pomopet 专注时间账本 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Todo on Pomopet's home timer surface while adding per-task focus duration, optional planned starts, manual focus backfill, and a scrollable vertical daily review.

**Architecture:** Extend existing `TodoLedger`, `AppRuntime`, `ActivityLedger`, and `reviewDay` instead of adding a parallel data model. Keep all durable state in the existing atomically written `pomopet-state.json`; the renderer receives projected view state and sends commands through the existing IPC allowlist.

**Tech Stack:** Electron, Vite, vanilla JavaScript, Vitest, Playwright.

---

### Task 1: Freeze the product contract

**Files:**
- Create: `docs/superpowers/specs/2026-09-18-focus-time-ledger-design.md`
- Create: `docs/superpowers/plans/2026-09-18-focus-time-ledger.md`

- [x] **Step 1: Define user-facing behavior and data invariants**
- [x] **Step 2: Define release gates and per-feature commit boundaries**
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-18-focus-time-ledger-design.md docs/superpowers/plans/2026-09-18-focus-time-ledger.md
git commit -m "docs: define focus time ledger"
```

### Task 2: Add Todo focus duration and inline run controls

**Files:**
- Modify: `src/core/todos.js`
- Modify: `src/core/migrate.js`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Test: `tests/todos.test.js`
- Test: `tests/runtime.test.js`
- Test: `tests/ui/control.spec.js`

- [ ] **Step 1: Write failing model tests**

```js
it('persists a Todo focus duration and defaults it safely', () => {
  const todo = ledger.add({ title: '写方案', focusMinutes: 50 });
  expect(todo.focusMinutes).toBe(50);
});
```

- [ ] **Step 2: Run the focused model test and confirm it fails**

```bash
npx vitest run --root . tests/todos.test.js
```

- [ ] **Step 3: Implement Todo field normalization and migration**
- [ ] **Step 4: Add renderer `▶ / ⏸ / ▶` behavior for the active Todo**
- [ ] **Step 5: Write and run UI regression tests**
- [ ] **Step 6: Commit**

```bash
git add src/core/todos.js src/core/migrate.js src/platform/electron/runtime.mjs src/ui/control.js src/ui/styles.css tests/todos.test.js tests/runtime.test.js tests/ui/control.spec.js
git commit -m "feat: add todo focus duration controls"
```

### Task 3: Add optional planned starts and conflict resolution

**Files:**
- Modify: `src/core/todos.js`
- Modify: `src/core/migrate.js`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `src/platform/electron/ipc-security.mjs`
- Modify: `src/ui/control.js`
- Modify: `src/ui/index.html`
- Modify: `src/ui/styles.css`
- Test: `tests/runtime.test.js`
- Test: `tests/ui/control.spec.js`

- [ ] **Step 1: Write failing runtime tests for idle auto-start, conflict, continue, switch, and missed plans**
- [ ] **Step 2: Run the focused runtime tests and confirm they fail**
- [ ] **Step 3: Add one-shot scheduling state and commands**
- [ ] **Step 4: Add Todo edit controls and conflict prompt**
- [ ] **Step 5: Run focused model and UI tests**
- [ ] **Step 6: Commit**

```bash
git add src/core/todos.js src/core/migrate.js src/platform/electron/runtime.mjs src/platform/electron/ipc-security.mjs src/ui/control.js src/ui/index.html src/ui/styles.css tests/runtime.test.js tests/ui/control.spec.js
git commit -m "feat: start planned todo focus safely"
```

### Task 4: Add manual focus backfill

**Files:**
- Modify: `src/core/activity-ledger.js`
- Modify: `src/core/time-review.js`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `src/platform/electron/ipc-security.mjs`
- Modify: `src/ui/index.html`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Test: `tests/activity-ledger.test.js`
- Test: `tests/time-review.test.js`
- Test: `tests/runtime.test.js`
- Test: `tests/ui/control.spec.js`

- [ ] **Step 1: Write failing ledger tests for a manual interval and overlap clipping**
- [ ] **Step 2: Run the focused tests and confirm they fail**
- [ ] **Step 3: Record manual focus with source metadata and atomically update linked Todo time**
- [ ] **Step 4: Add the `补记时间` Tab immediately after `提醒计划`**
- [ ] **Step 5: Add renderer validation and explicit overlap decision**
- [ ] **Step 6: Run focused model and UI tests**
- [ ] **Step 7: Commit**

```bash
git add src/core/activity-ledger.js src/core/time-review.js src/platform/electron/runtime.mjs src/platform/electron/ipc-security.mjs src/ui/index.html src/ui/control.js src/ui/styles.css tests/activity-ledger.test.js tests/time-review.test.js tests/runtime.test.js tests/ui/control.spec.js
git commit -m "feat: record manual focus time"
```

### Task 5: Render a scrollable vertical daily timeline

**Files:**
- Modify: `src/core/time-review.js`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Test: `tests/time-review.test.js`
- Test: `tests/ui/control.spec.js`

- [ ] **Step 1: Write failing review projection tests for item detail/source**
- [ ] **Step 2: Run the focused test and confirm it fails**
- [ ] **Step 3: Project detailed vertical blocks without changing mutual-exclusion totals**
- [ ] **Step 4: Render a fixed-height scroll container, proportional vertical blocks, and hover/focus detail**
- [ ] **Step 5: Exercise date switching, scrolling, hover, keyboard focus, overlap, and narrow viewport in Playwright**
- [ ] **Step 6: Commit**

```bash
git add src/core/time-review.js src/ui/control.js src/ui/styles.css tests/time-review.test.js tests/ui/control.spec.js
git commit -m "feat: render vertical time review"
```

### Task 6: Release verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run the full non-UI verification**

```bash
npm run verify
```

- [ ] **Step 2: Run all renderer tests**

```bash
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run test:ui
```

- [ ] **Step 3: Package the arm64 macOS zip**

```bash
npm run package:mac:zip
```

- [ ] **Step 4: Inspect artifact and checksum**

```bash
ls -lh dist/release/Pomopet-0.1.30-arm64-mac.zip
sha256sum dist/release/Pomopet-0.1.30-arm64-mac.zip
```

- [ ] **Step 5: Commit the version bump**

```bash
git add package.json package-lock.json
git commit -m "release: Pomopet 0.1.30"
```
