# TYPOMAN — improvement summary (Rounds 4–8)

TYPOMAN: Kinetic Type Studio, a browser kinetic-typography studio
(static files, no build step, GitHub Pages). Baseline: HEAD `9c89f08`,
33 registered presets, 8 templates, Round 3 benchmark 8.0 (old 0–9
rubric). Work below is scored 1–10 by a three-judge jury (Art
Director, Working Motion Designer, Creative Technologist); the
round score per criterion is the median of the three judges.

## Scorecard

| Round | MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 8.0 | 8.0 | 8.0 | 8.5 | 8.5 | 8.0 | 7.5 | 8.0 | **8.1** |
| 5 | 8.0 | 8.0 | 8.0 | 8.5 | 8.5 | 8.5 | 8.0 | 8.0 | **8.2** |
| 6 | 8.5 | 8.0 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | **8.4** |
| 7 | 8.5 | 8.0 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | **8.4** |

MC = Motion Craft, TQ = Typographic Quality, PC = Path Control,
CR = Creative Range & Originality, EE = Export & Embed,
UX = Studio UX, PR = Performance & Robustness, EQ = Engineering
Quality. **Target 9/10 has not been reached.** Round 8 added no
score change: it verified that studio flash debounce/cache
already exists (see below).

## What changed, by round

- **Round 4** — 8 new presets (Ticker, Blob Reveal, Floor Plane,
  Ink Pen, Odometer, Axis Drift, Anaglyph, Spiral): 33 → 41
  registered presets, looks 110 → 135. 8 new templates: 8 → 16.
  Renderer: supersampled buffers for enlarging transform keys
  (capped ×2, ≤16 Mpx), per-frame memoisation, path `offset()`
  fold trimming.
- **Round 5** — Path Flow on Star fixed in Fill mode; Draw On
  overlaps 13 → 5; Spiral centre crowding fixed (119-char case,
  90 → 0 crowded pairs). `glitch-drop` flash 3.5/s → 1/s;
  `title-window` matte no longer leaks "CINEMA". Share dialog
  surfaces hover, scroll scrub, per-layer text. Over-limit
  exports blocked behind explicit confirmation naming the
  measured rate. Flash suite and 1080p frame-cost budget in CI.
  Cylinder Neon Drum 4/s → 1/s; Paper Column fixed to ≤2/s on
  all aspects.
- **Round 6** — Long-loop flash analysis fixed: the 900-frame
  cap removed, full-rate sliced analysis (60 s 15 Hz strobe now
  reads 15/s and fails, was 0/s passing). Path Flow Travel/Still
  on closed lanes fitted to lane capacity (Star long close
  pairs 5/3/6/8 → 0); Fill seam bug fixed (Circle short
  2.8 px → 26.4 px). Draw On residuals cleared except Loop
  (I–N 1.31 px, N–M 16.82 px).
- **Round 7** — `flashes()` rejects unnormalised scenes
  (600 s raw throws in ~1 ms instead of ~166 MB). Export blocks
  on a failed flash check with Retry; the confirmation switch
  is hidden for unmeasured scenes. Glitch `flashes()` estimate
  0 → 3 for glitch-drop rate 8 (measured 3.5/s); render
  untouched. Jury held every band at 8.4.
- **Round 8** — Investigation only, no code change: studio
  flash debounce (1.5 s), scene-JSON cache (32-entry LRU),
  abort/supersede and a "Checking for flashes…" state already
  exist in `js/studio/inspector.js` and work (5 rapid edits →
  1 check). The remaining cost is the single-check render
  itself (up to 3600 frames for a 60 s loop).

## How to run

```text
npm start     # serves the repo at http://localhost:8080
npm test      # headless suites (smoke, sweep, studio, flashes)
```

## Verification limits (read before quoting a score)

- Google Fonts do not load in the sandbox used for this work
  (`ERR_TUNNEL_CONNECTION_FAILED`, 0/60 catalogue fonts), so all
  type geometry and font-dependent flash readings are on
  fallback fonts. A real-font run (GitHub Actions CI with fonts
  loading, or a local machine) is still needed before a 9/10
  typography claim can be fully proven.
- 60 s flash checks measured 14–43 s in-page in the sandbox,
  not the ~5 s in the Round 6 safety notes.

## Still blocking 9/10

- Product decisions (not yet made): Loop lane/size, Frame
  horizontal clamp, Spiral minimum-size policy, export
  hard-block vs confirm-to-export.
- Real-font verification and the uploaded-font
  iframe/web-component embed route.
- Shaping tools: bézier editor and timing/curve editor;
  path-key times are still fixed equal shares.

## Push status

At the time of writing, all Round 4–8 work is uncommitted in
the working tree and unpushed to `markdo27/typoman` (branch
`main`), pending a GitHub connection. See the round notes in
`docs/benchmark/round-4/` through `docs/benchmark/round-8/`
for judge files and measurements.
