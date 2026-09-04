# Pomopet Time Companion Review Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable focus/break history, compact synchronized timer controls, work boundaries, reminder/off-work history, and a seven-day review to the existing Pomopet app.

**Architecture:** Keep one atomic `pomopet-state.json`. A pure `ActivityLedger` owns date-partitioned details and a pure projector derives review totals. Timer commands, ticks, recovery, and presentation expiry run through one serial runtime queue; successful persistence precedes state emission and external presentation effects.

**Tech Stack:** JavaScript ES modules, Electron 35, Vite 6, Vitest 3, Playwright 1.55, CSS.

---

### Task 0: Preserve the Current Worktree

**Files:**
- Modify: `package.json`

- [ ] Record `git status --short` and scoped diffs before editing; do not checkout, reset, or replace any dirty file from `HEAD`.
- [ ] Reconstruct only the missing `scripts`, `devDependencies`, and `build` keys in `package.json` from the matching lockfile/current project configuration; preserve current metadata and version `0.1.22`.
- [ ] Run `npm run lint -- --version`, `npm run test -- --version`, and `npm run build -- --version` to prove the commands resolve.
- [ ] Inspect `git diff -- package.json`; confirm no current key was removed.

### Task 1: Define the Activity Schema and Daily Lifecycle

**Files:**
- Create: `src/core/activity-ledger.js`
- Create: `tests/activity-ledger.test.js`

Public API: `createActivityState()`, `ActivityLedger.openInterval()`, `pauseInterval()`, `resumeInterval()`, `finishInterval()`, `recordReminder()`, `respondReminder()`, `recordWorkdayEvent()`, `snapshot()`.

- [ ] Write one failing test for default analytics/day creation only after the first event; run `npx vitest run tests/activity-ledger.test.js -t "creates a day"`; implement the minimum.
- [ ] Write one failing test for open/pause/resume/finish segments and actual duration; run the named test; implement and rerun.
- [ ] Write one failing test for stopped focus terminal facts and `unplacedActiveMs`; implement and rerun.
- [ ] Write one failing test for local-midnight fragments (`split`, final fragment, shared cycleId); implement and rerun.
- [ ] Write one failing test for merging overlapping exclusions, first-event `rangeStartAt`, future-only midday edits, and no empty-day materialization; implement one rule at a time and rerun each named test.
- [ ] Inspect only the new ledger diff and run the whole ledger test file.

### Task 2: Add Reminder and Workday Detail Lifecycles

**Files:**
- Modify: `src/core/activity-ledger.js`
- Modify: `tests/activity-ledger.test.js`
- Modify: `src/core/alarms.js`
- Modify: `tests/alarms.test.js`
- Modify: `src/core/presentation.js`
- Create: `tests/presentation.test.js`

- [ ] Test and implement exact configured-text snapshots and `firedAt` at runtime claim.
- [ ] Test and implement explicit snooze ancestry with `parentOccurrenceId`.
- [ ] Test and implement first-response-wins for dismissed, snoozed, timed_out, and expired; duplicate/conflicting responses must no-op.
- [ ] Test and implement queued-presentation expiry reporting instead of silent pruning.
- [ ] Test and implement occurrence-bound `offwork_snoozed`, `offwork_finished`, and `latest_offwork_limit` events with duplicate-click protection.
- [ ] Run the three focused test files and inspect their scoped diffs.

### Task 3: Build the Pure Seven-Day Projector

**Files:**
- Create: `src/core/time-review.js`
- Create: `tests/time-review.test.js`

Public API: `reviewRecentDays({ analytics, now, days: 7, currentTimer })` and `reviewDay(day, options)`.

- [ ] Test exact inclusion of today plus six previous local dates, long-term source retention, empty days, local midnight, and DST; implement incrementally.
- [ ] Test open-segment preview to `now` without persisted synthetic endpoints; implement.
- [ ] Test timeline boundaries from `rangeStartAt` to final off-work, or to `now` for an unfinished current day; implement.
- [ ] Test mutually exclusive precedence `excluded > focus > break > unrecorded`, pause duration, and “休息时段工作”; prove effective focus equals closed segments minus timed exclusion overlap plus unclipped `unplacedActiveMs`.
- [ ] Test task totals for current, renamed, deleted, unassociated, stopped, plan-outside, and separate legacy unplaced time; implement.
- [ ] Test natural/early/stopped counts deduplicated by cycleId across days; implement.
- [ ] Test reminder grouping by exact text, half-hour buckets, response counts, actual off-work time, and extension count; implement.
- [ ] Run the whole projector test and inspect only its scoped diff.

### Task 4: Complete Timer Transition Facts

**Files:**
- Modify: `src/core/timer.js`
- Modify: `tests/timer.test.js`
- Modify: `src/core/todos.js`
- Modify: `tests/todos.test.js`

- [ ] Test/implement phase start, active segments, and elapsed progress for custom durations.
- [ ] Test/implement pause closure and resume segment creation.
- [ ] Test/implement natural and early focus completion with terminal event IDs.
- [ ] Test/implement `endBreak` from running/paused into pending choice, distinct from stopping a break.
- [ ] Test/implement stopping running/paused focus and break, duplicate terminal command no-ops, and pending-choice dismissal.
- [ ] Split Todo actual-time accumulation from completed-pomodoro accumulation; test stopped time, deleted/no Todo, and applied-event idempotency.
- [ ] Run timer and Todo tests and inspect scoped diffs.

### Task 5: Serialize Runtime Transactions and Recovery

**Files:**
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `src/core/migrate.js`
- Modify: `src/platform/electron/store.mjs`
- Modify: `tests/runtime.test.js`
- Modify: `tests/migrate.test.js`
- Modify: `tests/store.test.js`

One queue owns commands, ticks, initialization recovery, and presentation expiry. A mutation stages domain events, applies timer/Todo/analytics with one event ID, attempts one atomic save, then emits state and flushes presentation/notification callbacks. Failed saves reject commands, emit no success state/effect, retain staged memory/effects, and retry persistence before the next queued mutation.

- [ ] Test a failed completion save followed by retry: exactly one Todo increment, one analytics interval, no premature onState/presentation, and eventual persistence with the same ID; implement the queue/commit boundary.
- [ ] Test two concurrent commands from pet/control are ordered and only one terminal command wins; implement.
- [ ] Runtime-test duplicate and concurrent continue/switch/idle choices, including invalid or newly completed Todo targets; only the first valid choice may start focus and later commands no-op.
- [ ] Runtime-test `muted` snapshots at firing, reminder text edits preserving old occurrences, unanswered restart expiry, and every reminder/off-work snooze creating one linked child occurrence.
- [ ] Test missing analytics migration and idempotent migration preserving Todo totals and alarm claim ledger; implement.
- [ ] Add explicit recovery tests for unexpired/expired running focus, running break, paused focus, paused break, and stale celebration.
- [ ] Add legacy paused tests for resume, direct early completion, and direct stop: no fabricated segment and correct `unplacedActiveMs`.
- [ ] Test corrupt JSON backup before defaults persist and missing file fallback; implement store recovery metadata.
- [ ] Run runtime, migrate, store, timer, Todo, alarm, and ledger tests; inspect scoped diffs.

### Task 6: Add Work Start, Latest Off-Work, and Exclusions

**Files:**
- Modify: `src/core/offwork.js`
- Modify: `src/platform/electron/runtime.mjs`
- Create: `tests/offwork.test.js`
- Modify: `tests/runtime.test.js`

- [ ] Test/implement defaults `workStart=10:00`, `latestTime=22:30`, and same-day exclusions.
- [ ] Test/implement validation `planned offwork < latestTime`, overlap normalization, and future-only materialization; work start may be later than planned off-work for unusual schedules.
- [ ] Test/implement snooze clamping to latestTime, no snooze at limit, ignored reminder behavior, and occurrence-bound first response.
- [ ] Test/implement restart after latestTime producing exactly one limit event.
- [ ] Run focused off-work/runtime tests and inspect scoped diffs.

### Task 7: Add Main-Window Progress and Review UI

**Files:**
- Modify: `src/ui/index.html`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Modify: `tests/ui/control.spec.js`

- [ ] Add Playwright RED assertions for elapsed progress, custom duration, paused freeze, focus/break labels, end-break, stop, and pending choices; implement in the existing timer card.
- [ ] Add Playwright RED assertions for the Time Review tab, seven-day selector, timeline, empty/legacy/open states, task totals, pause/early/stop metrics, “休息时段工作”, reminders, actual off-work, and extension count; implement one unframed drawer.
- [ ] Add Playwright RED assertions for workdays, work start, planned/latest time, multiple exclusions, normalization, and invalid ordering while preserving protected drafts; implement in the existing off-work panel.
- [ ] Run the selected and full control Playwright tests; inspect scoped HTML/JS/CSS diffs.

### Task 8: Add Compact Desktop-Pet Controls and Shared Broadcast Test

**Files:**
- Modify: `src/ui/pet.html`
- Modify: `src/ui/pet.js`
- Modify: `src/ui/styles.css`
- Create: `src/platform/electron/state-broadcast.mjs`
- Create: `tests/state-broadcast.test.js`
- Modify: `src/platform/electron/main.mjs`
- Modify: `tests/ui/control.spec.js`

- [ ] Add browser RED assertions for a two-row panel no wider than the existing pet, elapsed progress, pause/resume, early finish/end break, stop, long-title truncation, and hiding during bubbles; implement.
- [ ] Extract the main-process fan-out into a broadcaster and test that one authoritative snapshot reaches control and pet sinks in order.
- [ ] Test pet-originated and control-originated concurrent commands through the serialized runtime plus broadcaster; prove both renderers receive the same final snapshot.
- [ ] Verify drag hotspot and quick menu remain clickable and the pet window width is unchanged.
- [ ] Run pet/control UI and broadcaster tests; inspect scoped diffs.

### Task 9: Full Verification and Apple Silicon Package

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Run lint, all Vitest tests, full Playwright, build, and accelerated multi-day soak.
- [ ] Review the full diff against the spec and confirm unrelated dirty changes were preserved.
- [ ] Render main window and pet at desktop/constrained viewports; inspect overlap, clipping, assets, controls, bubbles, and progress.
- [ ] Bump only package versions to `0.1.23`, rerun full verification, then run `npm run package:mac:zip`.
- [ ] Report automatic evidence, arm64 artifact path, and macOS-only manual checks that Linux cannot prove.
