# Random Companion Chatter Design

## Scope

Improve only spontaneous `ambientCompanion` chatter. Alarm, hydration, movement,
off-work, focus completion, and their existing presentation routing remain unchanged.

## Behavior

- The companion chooses its visual action before requesting copy.
- AI receives only real context: time of day, timer phase/status, task title,
  elapsed/remaining minutes, and the selected pet action.
- The prompt treats the pet as a warm, observant companion rather than a coach.
  It must not invent progress, mood, or events that are absent from context.
- The last eight generated ambient lines are stored locally and sent as avoidance
  context. Exact or highly similar output is retried once; another duplicate falls
  back to an unused built-in ambient line.
- Ambient chatter remains silent and never asks for an immediate response.

## Settings

Place `主动陪伴` and `出现频率` together in the Pet Personality panel:

- Off: no spontaneous chatter; formal reminders are unaffected.
- Quiet: random delay of 45-70 minutes.
- Occasional: random delay of 20-35 minutes (default).
- Lively: random delay of 10-20 minutes.

Remove the duplicate companion switch from Sound and Startup settings.

## Regression Boundaries

- Do not change alarm prompts or reminder schedules.
- Do not change off-work copy or blocking behavior.
- Do not add ambient speech.
- Preserve existing settings and migrate missing recent-line state to an empty list.

## Verification

- Unit tests cover context serialization, action matching, bounded history, duplicate
  retry/fallback, disabled chatter, and all three random frequency windows.
- UI tests cover the relocated toggle/frequency controls and persistence.
- Existing core and Playwright suites must remain green.
