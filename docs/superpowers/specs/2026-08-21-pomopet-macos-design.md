# Pomopet macOS Product Design

Date: 2026-08-21

## Summary

Pomopet is a lightweight macOS desktop Pomodoro app where a cute pet lives on the user's desktop, accompanies focus sessions, celebrates completed work, and uses humorous reminders to make breaks and end-of-day shutdown feel delightful instead of nagging.

The first release is a local-only MVP. It focuses on a reliable timer, a floating desktop pet, configurable reminder behavior, and a curated built-in copy library. It does not include accounts, cloud sync, AI-generated copy, pet stores, leaderboards, or complex achievement systems.

The first release ships Chinese-only UI and reminder copy.

## Goals

- Help users start and complete small focus sessions.
- Make rest reminders and off-work reminders feel cute, funny, and hard to ignore in a good way.
- Let users choose the pet's visual style, humor tone, and reminder intensity.
- Keep the first macOS version small, private, and stable enough to run locally all day.
- Provide a foundation that can later add AI-generated humor after the user supplies an API key.

## Non-Goals

- No account system or cloud sync in the first release.
- No paid store, pet marketplace, multiplayer, or leaderboard.
- No AI dependency in the first release.
- No strict productivity surveillance, website blocking, or app usage tracking in the first release.
- No Windows support in the first release, though the architecture should avoid unnecessary macOS-only business logic outside the shell layer.

## Target User

The target user works at a computer for long stretches, may forget breaks, and wants a warmer alternative to plain timer notifications. They like cute desktop companions and are comfortable with light humor, but they need control over how intrusive reminders become.

## Product Shape

The app has two surfaces:

- A floating pet window that can sit above the desktop and other apps.
- A compact control/settings window for timer setup, pet style, reminder tone, and off-work rules.

The floating pet is the emotional center of the app. The control window is utilitarian and should not compete with normal work.

## First Release Features

### Pomodoro Timer

The timer supports:

- Presets: 25/5, 50/10, and custom focus/break durations.
- A task title for the current focus session.
- Start, pause, resume, stop, and complete.
- Automatic transition from focus complete to break reminder.
- A real break timer after each completed focus session.
- Local session count for the current day.

Break behavior:

- When a focus session completes, the app shows the reward event, then starts the configured break timer automatically.
- During break, the pet enters Break state and shows break copy.
- The user can skip the break, pause/resume the break timer, or stop the cycle.
- When the break timer ends, the app returns to Idle and shows a gentle "ready for the next round" prompt.
- Break completion does not grant a reward.

Acceptance criteria:

- Timer remains accurate across normal app window focus changes.
- Pause/resume never loses the remaining time.
- Completing a focus session triggers one reward event exactly once.
- Stopping a session does not grant a completion reward.
- Break timer start, pause, resume, skip, and end are distinct from focus completion rewards.

### Desktop Pet

The pet has three selectable visual directions in the first release:

- Pixel style.
- Hand-drawn style.
- 3D chibi style.

First-release scope: ship three bundled lightweight pet style packs. Each pack must support the same required pet states. The first release does not include user-uploaded pets, a pet marketplace, or a general asset editor.

The pet has these required states:

- Idle: pet is present but quiet.
- Focus: pet rests, reads, naps, or watches calmly.
- Reward: pet celebrates a completed focus session.
- Break: pet nudges the user to stand, stretch, drink water, or look away.
- Off-work: pet performs the configured end-of-day action.

The floating pet should be draggable and should remember its last position.

Acceptance criteria:

- Pet state changes match timer and reminder events.
- Pet can be moved without opening the settings window.
- Pet can be temporarily hidden and restored from the menu bar.
- Pet never blocks the entire screen unless the user selected an intrusive off-work action.

### Humor And Reminder Copy

The first release uses built-in copy instead of AI generation.

Tone options:

- Cute encouragement.
- Witty roast.
- Mild absurd.
- Healing companion.
- Random.

Copy categories:

- Focus start.
- Mid-focus encouragement.
- Focus completion reward.
- Short break.
- Long break.
- Hydration.
- Stretch.
- Off-work reminder.
- Off-work escalation.

Example copy:

- "站起来走两步吧，你的脖子已经在提交离职申请了。"
- "本宠检测到你已经坐成了一个办公摆件。"
- "番茄完成！奖励你一枚看不见但很有分量的小勋章。"
- "下班啦。再不走，我就躺在屏幕上碰瓷。"
- "你可以加班，但我已经下班了。我先倒。"

Acceptance criteria:

- Every reminder event can resolve to a copy line for the selected tone.
- Random tone does not repeat the same line twice in a row for the same event.
- Copy is local, editable in future versions, and not fetched from network.

### Rewards

The first release has lightweight rewards:

- A pet celebration animation or state.
- A praise line.
- A local daily completion count.
- A simple badge label for milestones such as 1, 3, and 5 sessions in one day.

Acceptance criteria:

- Rewards only trigger on completed focus sessions.
- Rewards do not create a complex economy in the first release.
- Daily counts reset by local calendar day.

### Off-Work Reminder

Users can configure:

- Work days.
- Off-work time.
- First reminder action.
- Escalation interval.
- Snooze duration.
- Maximum escalation level.

Supported off-work actions:

- Lie down: pet lies on the desktop.
- Play dead: pet dramatically collapses with a humorous bubble.
- Block work: pet moves to a more central position with a stronger prompt.
- Lights out: screen overlay darkens the app's visible pet scene, without changing system brightness in the first release.
- Random action.

Default rule:

- Work days: Monday to Friday.
- Off-work time: 18:30.
- Snooze: 15 minutes.
- Default action: lie down.
- Escalation: every 15 minutes, but only within non-intrusive actions by default.
- Strong reminders: block work and lights out are opt-in. They are never enabled by default.
- Enabling strong reminders makes Level 3 actions selectable and allows Level 3 to appear in the default escalation sequence.

Escalation levels:

- Level 0, gentle: speech bubble only.
- Level 1, soft pet action: pet lies down near its current desktop position.
- Level 2, dramatic but non-blocking: pet plays dead or performs a larger animation near the edge of the screen.
- Level 3, strong reminder: pet moves toward the center or shows a lights-out overlay. This level is only available when the user enables strong reminders.

Default escalation sequence:

- If strong reminders are disabled: Level 0 -> Level 1 -> Level 2, then repeat Level 2 at the configured escalation interval.
- If strong reminders are enabled: Level 0 -> Level 1 -> Level 2 -> Level 3, then repeat Level 3 at the configured escalation interval.
- Snooze resets the visible reminder and schedules the next reminder at the selected snooze interval without increasing the level.
- Dismiss for the day sets reminder state to DismissedForDay and stops escalation until the next configured work day.

Acceptance criteria:

- Off-work reminders respect configured days and time.
- Snooze delays the next reminder by the chosen interval.
- The user can dismiss reminders for the day.
- Intrusive actions are opt-in and reversible.

## User Flow

1. User opens Pomopet.
2. A pet appears on the desktop in idle state.
3. User opens the control window from the pet or menu bar.
4. User enters a small task and starts a focus session.
5. Pet enters focus state.
6. Timer completes.
7. Pet celebrates and shows a reward line.
8. App prompts the user to rest.
9. At configured off-work time, pet performs the chosen off-work reminder action.
10. User can snooze, dismiss for the day, or open settings.

## Settings

Required settings:

- Timer preset and custom durations.
- Pet style.
- Humor tone.
- Reminder categories enabled or disabled.
- Off-work days.
- Off-work time.
- Off-work action.
- Snooze duration.
- Escalation level.
- Launch at login.
- Menu bar visibility.

Settings should be stored locally.

## State Model

Timer state:

- Idle.
- Focusing.
- Paused.
- FocusComplete.
- Break.
- Stopped.

Pet state:

- Idle.
- Focus.
- Reward.
- Break.
- OffWorkSoft.
- OffWorkEscalated.
- Hidden.

Reminder state:

- None.
- Pending.
- Visible.
- Snoozed.
- DismissedForDay.

State transitions should be event-driven. Timer events, reminder events, and user actions should each produce a clear state transition to avoid duplicate rewards or reminder loops.

## Technical Recommendation

Use Tauri for the first macOS implementation.

Reasons:

- Small app size.
- Good fit for a Rust shell plus web UI.
- Supports transparent and always-on-top windows.
- Can manage menu bar/tray style controls and local storage.

Suggested implementation layers:

- Desktop shell: Tauri window management, menu bar, launch-at-login integration, local file storage.
- App state: timer state, pet state, reminder rules, and settings.
- UI: control window and floating pet window.
- Copy engine: local copy library, tone selection, and no-repeat selection.
- Scheduler: local reminders for Pomodoro breaks and off-work rules.

## Data

All first-release data is local:

- Settings.
- Current timer state.
- Daily completion count.
- Last pet position.
- Last used reminder copy per category.

No personal productivity data leaves the machine in the first release.

## Error Handling

- If settings are missing or corrupt, fall back to defaults.
- If a pet asset fails to load, show a simple fallback pet shape and a recovery message.
- If off-work scheduling fails, keep manual timer behavior available.
- If the floating window cannot become always-on-top, show a clear settings-window warning.

## Prototype Scope

The HTML prototype is phase 1 of the design deliverables. It demonstrates product behavior and interaction shape. It is not production code and does not need to match the future Tauri implementation internals.

The HTML prototype should show:

- A simulated macOS desktop surface.
- A floating pet preview with speech bubble.
- A Pomodoro control panel.
- A settings panel for pet style, tone, off-work time, and off-work action.
- Buttons to simulate focus complete, break reminder, and off-work reminder.

The prototype is not expected to implement real macOS floating-window behavior.

## Testing Strategy

The implementation plan should include:

- Unit tests for timer transitions.
- Unit tests for copy selection and no-repeat behavior.
- Unit tests for off-work rule matching, snooze, and dismiss-for-day.
- UI tests for core flows in the control window.
- Manual macOS QA for floating window behavior, drag persistence, launch at login, and reminder visibility.

Release should not be considered ready until these core checks pass:

- Start, pause, resume, complete, and stop timer.
- Completion reward fires exactly once.
- Break reminder appears after focus completion.
- Break timer can start, pause, resume, skip, and end without creating another reward.
- Off-work reminder appears at the configured time.
- Snooze and dismiss-for-day work.
- Pet can be dragged, hidden, and restored.

## Open Product Decisions

- Whether the MVP app name should be Pomopet, 下班小宠, or another name.

Resolved first-release decisions:

- Visual styles: ship three bundled styles: pixel, hand-drawn, and 3D chibi.
- Off-work defaults: start with the non-intrusive lie-down action. Strong reminders are opt-in.
- Language scope: Chinese-only copy and UI for the first release. Bilingual support can be added later.

## Milestones

1. Product design and HTML prototype.
2. Tauri project scaffold and static pet window proof of concept.
3. Timer and local settings.
4. Reminder copy engine and reward events.
5. Off-work reminders and escalation.
6. macOS packaging and QA.
