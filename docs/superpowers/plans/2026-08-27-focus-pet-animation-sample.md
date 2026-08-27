# Focus Pet Animation Sample Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one reviewable, natural 4–5 second focus-state GIF from six AI-generated keyframes without replacing the current application asset.

**Architecture:** Generate a 2x3 transparent expression sheet from the existing focus dog reference, then use a small deterministic Pillow CLI to crop, anchor, time, and validate the frames. Save the result as a versioned preview asset and expose it through the existing internal HTTP preview server for visual approval.

**Tech Stack:** Built-in image generation, Python 3 with Pillow, Vitest, HTML, existing tmux HTTP server

---

## File Map

- Create `scripts/make-expression-gif.py`: reusable 2x3 expression-sheet to GIF converter and verifier.
- Create `tests/pet-animation-assets.test.js`: observable contract for focus sample dimensions, frame count, timing, and transparency.
- Create `src/ui/source/momo-focus-expression-sheet-v2.png`: AI-generated six-frame master sheet.
- Create `src/ui/public/assets/pet/momo-focus-v2.gif`: review-only focus sample; does not replace `momo-focus.gif`.
- Create `/tmp/pomopet-download/focus-preview/index.html`: side-by-side old/new browser preview.

### Task 1: Define The Preview Asset Contract

**Files:**
- Create: `tests/pet-animation-assets.test.js`

- [ ] **Step 1: Write the failing asset test**

```js
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('natural pet animation samples', () => {
  it('contains a loopable transparent focus sample', () => {
    const output = execFileSync('python3', [
      'scripts/make-expression-gif.py',
      'verify',
      'src/ui/public/assets/pet/momo-focus-v2.gif'
    ], { encoding: 'utf8' });
    expect(JSON.parse(output)).toMatchObject({
      format: 'GIF',
      size: [365, 405],
      frames: 7,
      loopMs: 4190,
      durationsMs: [900, 500, 240, 500, 450, 700, 900],
      disposal: [2, 2, 2, 2, 2, 2, 2],
      transparent: true
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --run tests/pet-animation-assets.test.js`

Expected: FAIL because `scripts/make-expression-gif.py` or `momo-focus-v2.gif` does not exist.

- [ ] **Step 3: Commit the contract only**

```bash
git add tests/pet-animation-assets.test.js
git commit -m "test: define natural focus animation contract"
```

### Task 2: Generate And Approve The Six Keyframes

**Files:**
- Reference: `src/ui/public/assets/pet/momo-focus.png`
- Create: `src/ui/source/momo-focus-expression-sheet-v2.png`

- [ ] **Step 1: Generate one 2x3 expression sheet with the built-in image tool**

Use `momo-focus.png` as an identity and style reference. Generate six isolated full-body frames on a genuinely transparent background:

1. Sitting still and reading, tail relaxed.
2. Same pose with a tiny inhale; eyes remain on the book.
3. Same pose with one complete gentle blink and slight ear-tip motion.
4. Briefly looks toward the user; tail tip taps once.
5. Looks back at the book with a subtle smile; tail settling.
6. Returns to almost exactly frame one.

Constraints: same dog identity, red scarf, red book, camera, body proportions, lighting, paw-to-book relationship, and foot anchor in every cell; no text, borders, sparkles, motion lines, duplicated limbs, or cropped ears/tail.

- [ ] **Step 2: Inspect the generated sheet at original resolution**

Reject and regenerate if any cell changes the face shape, book, scarf knot, paw count, body size, camera, or tail attachment. Do not repair a failed sheet by cross-fading.

- [ ] **Step 3: Copy the accepted generated image into the project**

Save as `src/ui/source/momo-focus-expression-sheet-v2.png`. Preserve the original generated output and do not overwrite `momo-focus.png`.

### Task 3: Build A Deterministic GIF Converter

**Files:**
- Create: `scripts/make-expression-gif.py`
- Create: `src/ui/public/assets/pet/momo-focus-v2.gif`
- Test: `tests/pet-animation-assets.test.js`

- [ ] **Step 1: Implement the minimal CLI**

The CLI exposes two commands:

```bash
python3 scripts/make-expression-gif.py build \
  --sheet src/ui/source/momo-focus-expression-sheet-v2.png \
  --grid 2x3 \
  --timeline 0:900,1:500,2:240,3:500,4:450,5:700,0:900 \
  --size 365x405 \
  --output src/ui/public/assets/pet/momo-focus-v2.gif

python3 scripts/make-expression-gif.py verify \
  src/ui/public/assets/pet/momo-focus-v2.gif
```

Implementation requirements:

- Crop six equal cells in row-major order. Treat the complete cell rectangle as the shared coordinate system; never crop or center individual frames from their alpha bounds.
- Preserve generated alpha; if the source lacks alpha, flood only edge-connected near-white pixels.
- Apply one identical scale and offset derived from the cell dimensions to all six frames. Fit the complete cell into the 365x405 canvas, bottom-center it once, and reuse that transform unchanged so ears and tail cannot affect alignment.
- Resize using premultiplied alpha to prevent white fringes.
- Save seven displayed frames with disposal mode 2, infinite loop, and exact durations `900/500/240/500/450/700/900` milliseconds.
- `verify` prints JSON with `format`, `size`, `frames`, `loopMs`, `durationsMs`, `disposal`, and `transparent`; exit nonzero unless size is 365x405, frame count is 7, timing is exact, every frame uses disposal 2, and at least one transparent pixel exists in every displayed frame.

- [ ] **Step 2: Build the focus sample**

Run the `build` command above.

Expected: `momo-focus-v2.gif` exists, is 365x405, contains seven displayed frames, and loops in 4190 ms.

- [ ] **Step 3: Run the targeted test and confirm GREEN**

Run: `npm test -- --run tests/pet-animation-assets.test.js`

Expected: 1 test passes.

- [ ] **Step 4: Inspect every frame on light and dark backgrounds**

Reject if there is a rectangular background, visible white fringe, face drift, book morphing, foot drift over 5%, tail teleporting, or a noticeable last-to-first jump.

- [ ] **Step 5: Commit the converter and accepted sample**

```bash
git add scripts/make-expression-gif.py src/ui/source/momo-focus-expression-sheet-v2.png src/ui/public/assets/pet/momo-focus-v2.gif
git commit -m "feat: add natural focus pet animation sample"
```

### Task 4: Publish A Side-By-Side Preview

**Files:**
- Create: `/tmp/pomopet-download/focus-preview/index.html`
- Copy: `momo-focus.gif` and `momo-focus-v2.gif` into `/tmp/pomopet-download/focus-preview/`

- [ ] **Step 1: Create a quiet comparison page**

Show the current animation and new sample at identical 365x405 dimensions on both a light and dark desktop-like background. Do not add decorative motion or effects that could hide animation defects.

```bash
mkdir -p /tmp/pomopet-download/focus-preview
cp src/ui/public/assets/pet/momo-focus.gif /tmp/pomopet-download/focus-preview/momo-focus-current.gif
cp src/ui/public/assets/pet/momo-focus-v2.gif /tmp/pomopet-download/focus-preview/momo-focus-v2.gif
```

Create `/tmp/pomopet-download/focus-preview/index.html` with the two assets side by side. Before starting another server, run `tmux has-session -t pomopet-download` and `tmux capture-pane -p -t pomopet-download -S -20`. If the session is absent, confirm the private devbox address with `hostname -I`, then start:

```bash
tmux new-session -d -s pomopet-download "cd /tmp/pomopet-download && python3 -m http.server 4180 --bind 10.37.8.117"
```

Use the confirmed private address in the final URL; `10.37.8.117` is the current known address, not an assumed constant.

- [ ] **Step 2: Verify in a real browser**

First require HTTP 200 for the HTML and GIF:

```bash
curl --noproxy '*' -I http://10.37.8.117:4180/focus-preview/index.html
curl --noproxy '*' -I http://10.37.8.117:4180/focus-preview/momo-focus-v2.gif
```

Then open the confirmed URL, wait through at least two loops, capture a screenshot, and confirm zero console or network errors.

- [ ] **Step 3: Run non-visual regression checks**

Run: `npm run lint && npm test -- --run tests/pet-animation-assets.test.js && npm run build`

Expected: all commands exit 0. Do not rebuild or replace the macOS installer until the user accepts the sample.

- [ ] **Step 4: Present the GIF and browser URL for user approval**

Include the versioned GIF inline and the browser preview URL. Explicitly state that the current in-app `momo-focus.gif` remains unchanged.
