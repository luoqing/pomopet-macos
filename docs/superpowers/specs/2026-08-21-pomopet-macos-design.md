# Pomopet macOS Product Design

Date: 2026-08-21

## Summary

Pomopet is a lightweight macOS work companion. A cute animated pet lives on the desktop, stays with the user during focus sessions, celebrates completed work, and delivers Pomodoro, alarm, break, and off-work reminders with warm humor.

The first release has two core jobs: reliable Pomodoro and alarm reminders, and emotional companionship delivered through one high-quality pet, humorous built-in copy, simple animation, and one consistent cute voice. It is a local-only MVP and does not depend on AI or a runtime TTS service.

The first release ships Chinese-only UI and reminder copy.

## Goals

- Help users start and complete small focus sessions.
- Deliver reliable one-off and repeating alarm reminders.
- Make focus, rest, and off-work moments feel accompanied rather than managed by a utility.
- Give the pet a recognizable personality through a consistent image, voice, motion, and writing style.
- Keep the first macOS version small, private, and stable enough to run locally all day.
- Keep voice costs predictable by bundling a small set of pre-generated audio clips.

## Non-Goals

- No account system or cloud sync in the first release.
- No paid store, pet marketplace, multiplayer, or leaderboard.
- No AI dependency in the first release.
- No runtime cloud TTS, voice cloning, or user API key in the first release.
- No punitive pet mechanics: the pet never becomes sick, dies, or loses relationship progress because the user was away.
- No visible bond score, leveling tree, item inventory, shop, economy, or long mini-game loop in the first release.
- No strict productivity surveillance, website blocking, or app usage tracking in the first release.
- No Windows support in the first release, though the architecture should avoid unnecessary macOS-only business logic outside the shell layer.

## Target User

The target user works at a computer for long stretches, may forget breaks, and wants a warmer alternative to plain timer notifications. They like cute desktop companions and are comfortable with light humor, but they need control over how intrusive reminders become.

## Product Shape

The app has two surfaces:

- A floating pet window that can sit above the desktop and other apps.
- A compact control/settings window for Pomodoro, alarms, voice, and off-work rules.

The floating pet is the emotional center of the app. The control window is utilitarian and should not compete with normal work.

Product principle: timer and alarm events trigger companionship. They do not exist as separate features beside the pet. Every important event should resolve to a coordinated pet action, line of copy, and optional voice clip.

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

- Timer is calculated from a stored target time rather than accumulated one-second ticks.
- Timer remains accurate across app window focus changes and device sleep/wake.
- Pause/resume never loses the remaining time.
- Completing a focus session triggers one reward event exactly once.
- Stopping a session does not grant a completion reward.
- Break timer start, pause, resume, skip, and end are distinct from focus completion rewards.

Timer persistence and recovery:

- Persist `sessionID`, phase, start time, target end time, paused remaining duration, and completion-event status.
- While the process runs, use a monotonic clock for elapsed time so a manual wall-clock edit does not jump the timer.
- After relaunch, crash recovery, or device wake, compare the persisted target end time with the current wall clock.
- If focus expired while unavailable, record its completion exactly once. Show the celebration only when recovery occurs within 15 minutes; otherwise update history quietly.
- Do not auto-start a break for a focus session recovered after its deadline. Sleep or time away already counts as interruption, so recovery returns to Idle.
- Attribute a recovered completion to the local calendar day containing its target end time, including cross-midnight sessions.

### Alarm Reminders

The first release supports:

- One-off alarms at a selected local date and time.
- Repeating alarms on selected weekdays.
- A short visible label.
- Enable, disable, edit, delete, snooze, and dismiss.
- A system local notification fallback when the app is not frontmost.

When the app process is running, an alarm triggers a pet animation, a built-in reminder line, and optional voice. User-written alarm labels are shown as text but are not synthesized, which keeps all first-release voice audio local and predictable.

If the user fully quits the app, previously scheduled system notifications may still appear, but the pet cannot animate until the app is running again. Launch at login is offered to keep normal reminders active.

Alarm delivery contract:

| Runtime state | Delivery |
| --- | --- |
| App running, pet visible | Pet animation, copy, and configured voice; suppress the duplicate system banner. |
| App running, pet hidden | System notification; voice follows the user's voice setting; do not reveal the pet. |
| App not frontmost but running | Same as pet-visible behavior; the non-activating pet panel does not steal keyboard focus. |
| App fully quit | Previously scheduled system notification only. |
| Device asleep at alarm time | On wake, deliver once if no more than 15 minutes late; otherwise mark the occurrence missed without pet or voice. |

The app keeps a durable occurrence ledger. Both the pet scheduler and system notification handler claim the same occurrence ID, so only one visible in-app presentation is produced. If notification permission is denied, alarms still work while the app runs, and settings show that quit-state delivery is unavailable. macOS Focus mode may suppress system banners; Pomopet does not attempt to bypass that system policy.

Schedule rules:

- One-off alarms store an absolute instant plus the creation timezone; after travel, the UI shows the converted local time without changing the instant.
- Repeating weekday alarms follow the current local timezone and recalculate after timezone changes.
- For a nonexistent local time during a daylight-saving jump, fire at the first valid time after the gap.
- For a repeated local time during a daylight-saving fallback, fire only at the first occurrence.
- Alarm snooze defaults to 10 minutes and is configured separately from off-work snooze.
- Snoozing one occurrence never changes the repeating alarm's base schedule.
- Notification actions can snooze or dismiss the current occurrence even when they launch the app from a quit state.

Acceptance criteria:

- Each alarm fires no more than once for one scheduled occurrence.
- Repeating alarms calculate the correct next local occurrence across weekends and daylight-saving changes.
- Snooze creates one replacement occurrence and does not duplicate the original.
- Disabling or deleting an alarm removes its pending system notifications.
- Every runtime-state row and schedule rule above has an automated scheduler test where platform APIs permit it, plus a manual notification-delivery check on macOS.

### Desktop Pet

The first release ships one high-quality hand-drawn 2D pet. It is an animated work companion, not a decorative mascot. Pixel and 3D pet packs are deferred until the core character is strong enough to validate the product.

The pet has these required states:

- Idle: pet is present but quiet.
- Focus: pet rests, reads, naps, or watches calmly.
- Reward: pet celebrates a completed focus session.
- Break invite: pet brings a toy and asks the user to leave the computer for a moment.
- Break ignored once: pet looks disappointed and asks gently again.
- Break ignored repeatedly: pet puts its paws on its hips, taps the desk, or puffs its cheeks.
- Alarm: pet gets the user's attention without covering unrelated work.
- Off-work soft: pet asks the user to stop and rest.
- Off-work annoyed: after being ignored, pet becomes visibly grumpy or lies down dramatically.
- Play: pet reacts to petting, direct feeding, or a short ball toss.
- Speaking: a lightweight mouth-open state plays over the current emotion while voice audio is active.

The floating pet should be draggable and should remember its last position.

Acceptance criteria:

- Pet state changes match timer and reminder events.
- Pet can be moved without opening the settings window.
- Pet can be temporarily hidden and restored from the menu bar.
- Clicking the pet offers pet, feed, and ball interactions. Each interaction completes in 10 to 20 seconds and has no score or failure state.
- Pet never blocks the entire screen by default.

### Intimate Interactions

First-release pet interaction is intentionally lightweight and emotional rather than numerical:

- Pet: the user strokes the pet and receives a pleased animation and short response.
- Feed: the user gives the pet a snack directly; there is no treat inventory or hunger meter.
- Ball: the user performs one short toss-and-return animation; there is no physics game or score.
- Ask for comfort: the user can trigger one gentle response without the app attempting to infer mental state.

Interactions temporarily change animation and mood, then return to the state derived from the timer or reminder. They never delay an alarm, focus completion, or off-work reminder. No absence, missed interaction, or closed-app time creates a negative mood.

Acceptance criteria:

- Each interaction starts with one click or menu choice and finishes or can be dismissed within 20 seconds.
- A higher-priority reminder interrupts the interaction and is presented exactly once.
- Closing and reopening the app does not create unfinished interaction state.
- Disabling pet interactions leaves all timer, alarm, and reminder behavior intact.

### Voice

The first release has one voice identity: a soft, playful work companion who can sound cheerful, caring, teasing, sleepy, or mildly annoyed without becoming a different character.

Voice is intentionally simple:

- Key reminder lines are generated during production and bundled as local audio files.
- There is no runtime TTS request, streaming speech, precise viseme lip sync, or per-user voice generation.
- While a clip plays, the pet uses a simple speaking animation with closed, slightly open, and open mouth states driven by audio level.
- Generic voice lines are paired with event categories; task titles and user-written alarm labels remain visible text only.
- Voice defaults to key moments: focus completion, break start, alarm, and the first off-work reminder.
- Users can choose voice off, key moments, or every shipped copy event, and can set voice volume.
- A speech queue prevents clips from overlapping. A newer high-priority reminder may replace a low-priority idle line.

Example voice direction:

- Identity: soft and slightly mischievous, not artificially high-pitched.
- Pace: conversational and concise.
- Cheerful: brighter delivery for task completion.
- Caring: gentler delivery for breaks.
- Teasing: dry timing for humorous reminders.
- Annoyed: energetic but never hostile for ignored off-work reminders.

Emotional delivery IDs use the same voice identity:

- `happy`: excited praise after task completion.
- `cute`: playful invitation to rest or play.
- `comfort`: gentle encouragement and the manual comfort interaction.
- `sarcastic`: light humorous teasing.
- `angry`: playful frustration after repeated ignored reminders.
- `sleepy`: tired companionship during late work and off-work reminders.

Acceptance criteria:

- The same character voice is recognizable across all emotional deliveries.
- Core reminders still work visually when audio is muted or unavailable.
- No two voice clips play at the same time.
- Every bundled audio reference is validated at build time.

Core companion asset inventory:

- At least one reviewed animation for every required pet state and interaction listed above.
- At least three reviewed Chinese lines for focus start, focus completion, break invite, alarm, off-work soft, and off-work annoyed.
- At least one bundled voice clip for each default voice moment: focus completion, break start, alarm, and first off-work reminder.
- Product review must approve the character silhouette, motion, writing, and voice together before the companion is considered release-ready.

### Humor And Reminder Copy

The first release uses built-in copy instead of AI generation.

The writing uses one coherent personality with several event-appropriate deliveries: cheerful encouragement, caring reminders, light teasing, mild absurdity, and playful annoyance.

Copy categories:

- Focus start.
- Focus completion reward.
- Alarm reminder.
- Short break.
- Off-work reminder.
- Off-work escalation.

Example copy:

- "站起来走两步吧，你的脖子已经在提交离职申请了。"
- "本宠检测到你已经坐成了一个办公摆件。"
- "番茄完成！奖励你一枚看不见但很有分量的小勋章。"
- "下班啦。再不走，我就躺在屏幕上碰瓷。"
- "你可以加班，但我已经下班了。我先倒。"

Acceptance criteria:

- Every reminder event can resolve to a copy line and emotional delivery.
- The same line does not repeat twice in a row for the same event.
- Copy is local, editable in future versions, and not fetched from network.

### Rewards

The first release has lightweight rewards:

- A pet celebration animation or state.
- A praise line.
- A local daily completion count.

Acceptance criteria:

- Rewards only trigger on completed focus sessions.
- Rewards do not create a complex economy in the first release.
- Daily counts reset by local calendar day.

### Off-Work Reminder

Users can configure:

- Work days.
- Off-work time.
- Escalation interval.
- Snooze duration.
- Whether the pet may become mildly annoyed after reminders are ignored.

Default rule:

- Work days: Monday to Friday.
- Off-work time: 18:30.
- Snooze: 15 minutes.
- First action: pet asks the user to stop and rest.
- Escalation: after 15 minutes, the pet may become grumpy, lie down, or play dead near its current position.
- The first release never changes system brightness, sleeps the display, or blocks the entire screen.
- Snooze clears the visible reminder and schedules the next reminder at the selected interval without making the pet more annoyed.
- Dismiss for the day sets reminder state to DismissedForDay and stops escalation until the next configured work day.

Acceptance criteria:

- Off-work reminders respect configured days and time.
- Snooze delays the next reminder by the chosen interval.
- The user can dismiss reminders for the day.
- Ignored reminders may change the pet's emotion without preventing computer use.

## User Flow

1. User opens Pomopet.
2. A pet appears on the desktop in idle state.
3. User opens the control window from the pet or menu bar.
4. User enters a small task and starts a focus session.
5. Pet enters focus state.
6. Timer completes.
7. Pet celebrates and shows a reward line.
8. App prompts the user to rest.
9. A configured alarm can independently trigger the pet and a local notification.
10. At configured off-work time, the pet asks the user to stop; if ignored, it may become playfully annoyed.
11. Between work events, the user can pet, feed, play ball with, or ask the pet for comfort.
12. User can snooze, dismiss for the day, mute voice, or open settings.

## Settings

Required settings:

- Timer preset and custom durations.
- Alarm list and recurrence.
- Alarm snooze duration, defaulting to 10 minutes.
- Off-work snooze duration, defaulting to 15 minutes.
- Voice mode and volume.
- Optional companion copy categories enabled or disabled. User-created alarms are enabled per alarm and are not affected by this switch.
- Off-work days.
- Off-work time.
- Playful annoyance after ignored reminders.
- Pet interactions enabled or disabled.
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
- BreakInvite.
- BreakIgnoredSoft.
- BreakIgnoredAnnoyed.
- Alarm.
- OffWorkSoft.
- OffWorkAnnoyed.
- PlayPet.
- PlayFeed.
- PlayBall.
- Comfort.
- Speaking overlay.
- Hidden.

Alarm state:

- Scheduled.
- Fired.
- Snoozed.
- Dismissed.
- Disabled.

Reminder state:

- None.
- Pending.
- Visible.
- Snoozed.
- DismissedForDay.

State transitions should be event-driven. Timer events, reminder events, and user actions should each produce a clear state transition to avoid duplicate rewards or reminder loops.

Event presentation priority:

| Priority | Event |
| --- | --- |
| 1 | User-created alarm |
| 2 | Focus completion reward |
| 3 | Off-work reminder |
| 4 | Break start |
| 5 | Focus start and idle reactions |
| 6 | User-started intimate interaction |

Every event is durably recorded before presentation. A higher-priority event may interrupt pet animation and voice; interrupted durable events return to the presentation queue. After a one-shot event finishes, the pet restores the current timer-derived state. Stale optional idle reactions may be dropped, but alarms and completion rewards may never be dropped or duplicated.

## Implemented Technical Architecture

The core release uses Electron 35 and plain JavaScript modules. The Linux DevBox has Node 20 but no Swift or Rust toolchain; Electron was the only route that could be implemented, unit-tested, rendered on Linux, and packaged for Apple Silicon from the same source. Native SwiftUI/AppKit would have left the application unbuildable and untestable in the available environment. Tauri was rejected because Rust is unavailable and its transparent-window integration would still require macOS QA.

The trade-off is a larger installed size than a native application. Background work is deliberately limited to one 500 ms scheduler check, two small windows, no remote content, and no renderer framework. The business core imports no Electron APIs and can be reused by a future shell.

Implemented layers:

- `src/core/TimerEngine`: injectable clock, target-time calculation, pause/resume, focus/break state, cross-midnight counting, and restart recovery.
- `src/core/AlarmScheduler`: one-off and local weekday recurrence, independent snooze occurrences, grace window, and durable occurrence ledger.
- `src/core/OffworkScheduler`: workday matching, snooze, dismissal, and one non-blocking escalation.
- `src/core/PresentationQueue`: durable event deduplication and alarm > completion > off-work > break > interaction priority.
- `src/platform/electron/AppRuntime`: command boundary, copy selection, state persistence, timer/alarm polling, and presentation routing.
- `src/platform/electron/main.mjs`: transparent focus-free always-on-top pet window, control window, tray menu, notifications, login item adapter, drag clamping, and IPC.
- `src/platform/electron/JsonStore`: local atomic JSON replacement for timer, settings, alarms, ledger, and pet position.
- `src/ui`: framework-free paper-note control UI and eight consistent transparent PNG companion poses with state motion.
- `BrowserVoicePlayer`: bundled MP3 playback, one active clip, priority interruption, volume, and silent failure fallback.

The initial specification's quit-state notification contract is intentionally narrowed in the implemented core: Electron notifications are reliable while the process runs, including when the pet is hidden. A fully quit Electron process cannot schedule durable macOS notifications without a native helper. Launch at login is therefore the recommended fallback for this release. Native notification scheduling remains a macOS-only follow-up, not a claimed capability.

## Data

All first-release data is local:

- Settings.
- Current timer state.
- Daily completion count.
- Last pet position.
- Last used reminder copy per category.
- Alarm definitions and pending snooze state.

No personal productivity data leaves the machine in the first release.

## Error Handling

- If settings are missing or corrupt, fall back to defaults.
- If a pet asset fails to load, show a simple fallback pet shape and a recovery message.
- If a voice asset is missing or playback fails, continue the visual reminder silently.
- If off-work scheduling fails, keep manual timer behavior available.
- If the floating window cannot become always-on-top, show a clear settings-window warning.

## Prototype And Core Scope

The legacy `prototype/index.html` remains a historical concept artifact. The production renderer is now under `src/ui` and is wired to the tested runtime.

The next HTML prototype revision should show:

- A simulated macOS desktop surface.
- A floating pet preview with speech bubble.
- A Pomodoro control panel.
- Alarm setup and a voice mode control.
- Buttons to simulate focus complete, alarm, break reminder, and ignored off-work reminder.
- One coherent pet personality rather than selectable visual styles.
- A small preview of pet, direct-feed, and ball interactions, clearly secondary to the timer and alarm flow.

The prototype is not expected to implement real macOS floating-window behavior.

## Testing Strategy

The implementation plan should include:

- Unit tests for timer transitions.
- Unit tests for one-off and recurring alarms, snooze, deletion, daylight-saving changes, and sleep/wake recovery.
- Unit tests for copy selection and no-repeat behavior.
- Unit tests for voice priority, no-overlap behavior, and missing-asset fallback.
- Unit tests for off-work rule matching, snooze, and dismiss-for-day.
- Unit tests for event priority, interruption, state restoration, and occurrence-ledger deduplication.
- UI tests for core flows in the control window.
- Manual macOS QA for floating window behavior, drag persistence, launch at login, reminder visibility, voice playback, and all four intimate interactions.

Release should not be considered ready until these core checks pass:

- Start, pause, resume, complete, and stop timer.
- Completion reward fires exactly once.
- Break reminder appears after focus completion.
- Break timer can start, pause, resume, skip, and end without creating another reward.
- Off-work reminder appears at the configured time.
- One-off and repeating alarms fire once per occurrence and cancel correctly.
- Snooze and dismiss-for-day work.
- Pet can be dragged, hidden, and restored.
- A 24-hour soak run completes with scheduled alarms, at least one sleep/wake cycle, no duplicate presentation, and no timer drift beyond the defined recovery rules.

## Asset Provenance

- `src/ui/public/assets/pet/` was generated specifically for this repository with the built-in image generation tool, then locally chroma-keyed, split, trimmed, and visually checked. Eight transparent PNG poses retain one original character identity and do not load third-party or remote assets at runtime.
- `build/icon.png` is composed locally from the same generated companion artwork.
- The four Chinese voice clips were generated during development with Microsoft Edge neural TTS, voice `zh-CN-XiaoxiaoNeural`. They are bundled and the application makes no runtime TTS request.
- UI textures and motion are authored CSS. No remote fonts, image CDNs, analytics, or AI APIs are loaded at runtime.

## Resolved Product Decisions

- The MVP name is Pomopet and the first companion is named 末末.

Resolved first-release decisions:

- Product core: Pomodoro and alarm reminders plus emotional companionship.
- Visual scope: ship one high-quality hand-drawn animated pet.
- Voice scope: ship one consistent voice with several emotional deliveries, using bundled audio only.
- Interaction scope: ship pet, direct-feed, ball, and manual comfort interactions without progression systems.
- Off-work defaults: use non-intrusive speech, grumpy, lie-down, and play-dead actions only.
- Language scope: Chinese-only copy and UI for the first release. Bilingual support can be added later.

## Milestones

1. Product design and historical HTML prototype — complete.
2. Cross-platform business core and automated scheduler tests — complete.
3. Electron shell, control window, tray, persistent floating pet, and local settings — complete in source; macOS behavior requires Mac QA.
4. Companion direction, built-in copy, interactions, and bundled voice playback — complete.
5. Linux renderer checks, accelerated reliability tests, and packaging inputs — complete or recorded in the overnight report.
6. Apple Silicon signing, notarization, native quit-state notification scheduling, and Mac hardware QA — follow-up release work.
