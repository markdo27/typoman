# TYPOMAN Band Score (TBS)

A band-score rubric for benchmarking TYPOMAN as a **kinetic-typography studio people use
for real projects**: make animated type, adjust its motion path, then embed it on the web
or download an MP4.

It works like IELTS banding. Each criterion gets a band from **0 to 9** (half bands
allowed). The **overall band** is the mean of the eight criteria, rounded to the nearest
0.5.

Judges score from evidence: running the app, screenshots, exported files, console
output and code. They don't score from claims in the README or commit messages.

---

## Global band descriptors

| Band | Label | Meaning |
|---|---|---|
| 9 | Expert | World-class for its scope. Matches or beats leading pro tools (After Effects + type plugins, Cavalry, Jitter, Rive) on this criterion. No meaningful flaws. |
| 8 | Very good | Polished and distinctive. Only rare, minor flaws. |
| 7 | Good | Solid and reliable; a professional would use it for real work. Some noticeable gaps. |
| 6 | Competent | Works for common cases. Several rough edges or limitations. |
| 5 | Modest | Partly meets the need. Frequent limitations; feels like a demo. |
| 4 | Limited | Basic functionality only, with significant problems. |
| 3 | Extremely limited | Barely serves the purpose. |
| 2 | Intermittent | Mostly fails or is mostly absent. |
| 1 | Non-user | Present in name only. |
| 0 | Absent | Not attempted. |

---

## The eight criteria

### 1. Motion Craft (MC)
Easing, timing, stagger and overlap, secondary motion, loop seamlessness, smoothness.
- **9**: Every preset feels hand-animated by a senior motion designer: anticipation, overshoot and settle where they belong, perfect loops, no jitter. Timing is controllable (curves, stagger, direction).
- **7**: Most presets feel professional. Easing and stagger are controllable. Loops are seamless, with an odd weak preset.
- **5**: Motion is mechanical (linear or sine everywhere) with limited control. Some visible loop pops.
- **3**: Motion is crude or jittery; little timing control.
- **1**: Barely animates.

### 2. Typographic Quality (TQ)
Font choice and rendering, kerning and tracking, legibility, line handling, respect for the letterforms.
- **9**: Curated, high-quality type library including variable fonts with animated axes. Kerning is preserved. Multi-line, alignment, tracking and case are all handled. Distortion only when intended. Custom fonts are supported.
- **7**: Good font set and controls (weight, tracking, line height, case). Kerning is mostly preserved. Clean rendering.
- **5**: A few fonts, basic size and colour. Letters are drawn individually without kerning, or awkward overlaps.
- **3**: Text is incidental to the graphics; one fixed font.
- **1**: Text is barely present.

### 3. Path Control (PC)
Can users adjust the motion path, and how well?
- **9**: Direct-manipulation bézier editor (anchors, handles, add and delete points, open or closed), freehand drawing, a rich path library, path animation or morphing, precise numeric control, undo. Path-aware motion looks great.
- **7**: Editable bézier path with anchors and handles plus presets. Text follows it cleanly. Good affordances.
- **5**: The path can be chosen from presets but not edited directly, or editing is clumsy.
- **3**: The path is fixed, with only parameter tweaks.
- **1**: No notion of a user-adjustable path.

### 4. Creative Range & Originality (CR)
Breadth and distinctiveness of looks, and the "out of the box" factor.
- **9**: Many distinct, surprising looks a motion designer hasn't seen in every template pack. Combinable effects. A strong signature identity. Easy to stumble into something great (remix, templates).
- **7**: A broad set of good-looking presets with a few genuinely fresh ideas. Effects combine.
- **5**: A handful of looks, mostly familiar, with limited combination.
- **3**: One or two looks.
- **1**: Generic or nothing.

### 5. Export & Embed (EE)
MP4 and other downloads, embedding on the web, fidelity, options, reliability.
- **9**: Frame-accurate offline-rendered MP4 (H.264, with negotiation and fallbacks), plus WebM, GIF, PNG and transparent options. Resolution, fps and loop choices. A working iframe embed, a web component and a self-contained HTML download. Exports match the preview exactly. Clear progress and cancel.
- **7**: Reliable MP4 export with resolution and fps options, and at least one working embed method. Output matches the preview.
- **5**: Real-time screen-capture style export (WebM), or the embed works but is fragile.
- **3**: Still image only.
- **1**: Nothing.

### 6. Studio UX & Visual Design (UX)
Clarity, discoverability, layout, feedback, responsiveness, accessibility, and how the tool itself looks.
- **9**: Feels like a premium pro tool: instantly understandable, beautiful, keyboard-friendly, responsive down to mobile, accessible (labels, focus, contrast), with undo/redo and helpful empty, loading and error states.
- **7**: Clean, organised and attractive. Most controls are discoverable. Works on laptop and tablet. Undo is present.
- **5**: Usable but cluttered or inconsistent, or hidden features.
- **3**: Confusing; controls are scattered.
- **1**: Unusable.

### 7. Performance & Robustness (PR)
Frame rate, errors, determinism, edge cases, fallbacks.
- **9**: Holds 60 fps at 1080p preview on a mid laptop. Zero console errors. Deterministic frame rendering. Graceful with long text, emoji, empty input, tiny and huge sizes, and odd aspect ratios. Feature-detects and falls back everywhere.
- **7**: Smooth in typical use. No errors in normal flows. Most edge cases handled.
- **5**: Occasional stutter or errors. Some edge cases break the layout.
- **3**: Frequent errors or slowdowns.
- **1**: Crashes.

### 8. Engineering Quality (EQ)
Architecture, separation of concerns, readability, extensibility, safety.
- **9**: A clean engine/UI split with a pure, deterministic render API and a documented preset/plugin contract. Input is sanitised (URL-loaded scenes, fonts). No dead code. Consistent style. Easy to add a preset.
- **7**: Sensible modules and a clear preset contract. Minor duplication.
- **5**: Works, but tangled: one big file, globals, copy-paste between presets.
- **3**: Hard to change without breaking things; dead or orphaned files.
- **1**: Unmaintainable.

---

## Jury protocol

Each round is scored by three independent judges with different lenses:

1. **Kinetic Type Art Director**: weights MC, TQ, CR.
2. **Working Motion Designer (end user)**: tries to make a real deliverable, such as a title for a YouTube intro, a website hero, or an Instagram story. Weights PC, EE, UX.
3. **Creative Technologist**: weights PR, EQ, EE, and verifies exports with `ffprobe` and frame extraction.

All judges score all eight criteria. Lenses only decide where they dig deepest. For
each criterion, a judge gives a band, evidence, and *"what would move this up one
band"*. The round's score for a criterion is the **median** of the three judges, and the
overall band is the mean of those medians, rounded to the nearest 0.5.

Results are recorded in [`docs/benchmark/`](benchmark/).
