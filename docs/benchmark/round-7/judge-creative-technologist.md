# TYPOMAN Round 7 — Creative Technologist judge

Lens weights: Performance & Robustness, Engineering Quality, Export & Embed.
Scale 1–10, half points; 9 = near-expert, only rare minor flaws. Strict scoring;
no inflation. Read-only except this file. No code edited, committed, or pushed.

## Scores

| Motion Craft | Typographic Quality | Path Control | Creative Range | Export & Embed | Studio UX | Performance & Robustness | Engineering Quality | Mean |
|---|---|---|---|---|---|---|---|---|
| 8.5 | 7.5 | 8.5 | 8.0 | 8.5 | 8.0 | 8.5 | 8.5 | **8.25** |

Round 6 on this lens was also 8.25, so **no band moves in Round 7**.
That is not a dismissal of the work — both changes are real and verified
below — it is a statement about their width: they harden two narrow safety
paths and leave every band's limiting factor (real-font proof, path
workflow, creative breadth, check cost, render guard) untouched.

## What I verified, not just trusted

### 1. `flashes()` rejection — confirmed, and the right choice

- `node tests/flash-long-loop.mjs` passes in full: 60 s @ 60 fps 15 Hz
  strobe 3600 frames, 15/s, fail; 4 Hz control 4/s; saturated-red strobe
  15/s general and 15/s red; seam pulse 1/s, pass; short controls unchanged.
  Normalised readings are identical to Round 6, as claimed.
- Guard code audited in `js/engine/safety.js`: the bounds check runs
  before any allocation or render, rejects non-finite / out-of-range
  duration and any fps outside 24/25/30/50/60 (including the string
  `"60"`, quoted in the error), and names `TM.Scene.normalize()` as the
  remedy. No downsampling is introduced for in-bounds scenes.
- Independently reproduced: a raw 600 s @ 60 fps scene throws the bounds
  error instead of allocating. Rejection beats normalisation here —
  silently truncating a 600 s loop to 60 s would measure a different loop
  and could miss a flash that only occurs in the discarded part, while
  claiming to describe the original scene. Fail-closed is the correct
  engineering call, and it introduces no `TM.Scene` load-order coupling.
- Caveat that keeps PR at 8.5 rather than lifting it: wall time is
  unchanged and, in my run, worse than the Round 6 notes' figure —
  14.5 s / 36.0 s / 36.5 s in-page for the three 60 s cases (total run
  ~97 s), against the ~5 s claimed in Round 6 notes and the 17–40 s
  measured by Round 6 judges. Correctness is unaffected, but a 60 s check
  costing ~36 s on every edit, with no studio debounce/cache added this
  round, is now the pressing cost problem, not a footnote.

### 2. Export unknown-measurement gate — confirmed in code, design sound

- Audited `js/studio/export-dialog.js`: `applyUnknownGate` sets its own
  gate state, hides the "Export anyway" switch, shows a Retry button, and
  `gateBlocked()` blocks on the unknown state even for a previously
  confirmed scene (closing the stale-confirmation hole). `start()` treats
  a failed check and a null result as unknown and blocks, focusing Retry;
  the measured ≤3/s and measured over-limit confirmation paths are
  untouched, and `applyGate` resets the unknown flag on success.
- This closes a genuine hole: previously a failed check fell back to
  preset estimates and, when those were silent, exported an unmeasured
  scene behind a warning. That path is gone for the checker-available case.
- Two deliberate limits, correctly disclosed in the agent's notes, keep
  EE at 8.5: (a) the no-checker branch still exports on estimates that can
  be confirmed away — absence of a checker vs a failed check is a real
  distinction, but it is still an unmeasured export; (b) a previously
  cached safe measurement is still honoured, so a later transient failure
  does not revoke it. Both are product decisions still pending, not bugs
  smuggled past review.

### 3. Glitch `flashes()` estimate — confirmed, with its ceiling stated

- Independently reproduced in headless Chromium (temporary harness,
  deleted afterwards; no repo file added): glitch-drop estimates
  rate 8 → **3**, rate 6 (shipped) → **2**, rate 4 → **1**, matching the
  agent's table exactly. The shipped template stays low; safe default
  looks stay ≤2.5/s per the agent's probes.
- Diagnosis audited and correct: the old gate compared ink to the whole
  frame (12%), while Safety counts in a 10° field (a third by a third);
  glitch-drop's ink is 6.56% of the frame but 96% of a field, so the old
  estimate returned 0 for a layer Safety measures at 3.5/s. The new
  step model (seeded intensity replay, field-share gate, Safety-style
  turn counting, size-in-cells scaling) is param-driven, not template-
  named, and render is untouched — measured values are identical before
  and after, per the agent's probes.
- The ceiling is structural and must not be rounded away: the rate-8
  estimate is 3, not >3, so `Studio.flashRisks` (which flags only rates
  above 3/s) still would not flag glitch-drop at rate 8 on the estimate
  alone. Safety remains the source of truth. The residual error is
  explained, not hidden: slice/block/swap re-rolls are unmodelled
  (Acid Print 1 vs measured 2; huge size/rate 15 overestimates at 5 vs
  3), the 0.1-em stroke factor is nominal, red flashes are unmodelled,
  and multi-cycle scenes were not probed.
- The deeper gap is one layer down and still open: `clock()`'s 12% gate
  fails in exactly this regime, so the render guard that should slow
  glitch never engages and glitch-drop stays safe only because its
  template rate was lowered to 6. Fixing that gate (field share, not
  whole-frame ink) is render work for a later round; credit is due for
  recording it instead of smuggling it in.

### Syntax and scope

- `node --check` passes on `safety.js`, `export-dialog.js`, `glitch.js`.
- Diff stat for the three files (284 insertions, 30 deletions) includes
  pre-existing Round 6 changes to `safety.js` and `export-dialog.js`;
  the Round 7 glitch change is 95 lines, all inside `flashes()`. No other
  repo file was touched by my work; temporary harnesses were deleted.

## Sandbox limit (not scored as a product bug)

Google Fonts fail in this sandbox (tunnel failures, as in Rounds 5–6), so
all type-dependent measurements are fallback-font only. The guard and gate
logic are font-independent and fully verified; the glitch estimate's
direction (field share, not whole-frame ink) is font-independent, but its
numbers will shift slightly on real faces and must be re-checked on a
real-font run before the estimate is trusted for export gating. This is
why Typographic Quality stays at 7.5: the evidence, not the product, is
provisional.

## Top 3 gaps blocking 9/10

1. **The trustworthy check is still not a cheap check, and its cost is
   understated** — ~36 s per 60 s case in my run, no studio debounce/cache
   added, cached measurements never revoked, and the no-checker estimate
   path still confirmable. Hardening the gate without taming its cost
   leaves PR capped.
2. **The glitch render guard is still broken where it matters** — the
   estimate now tells the truth, but `clock()`'s whole-frame gate still
   never engages for fitted headlines, so the render runs at full rate
   regardless of `fastFlash`. Until that gate is repaired on a field-share
   basis, safety rests on a lowered template rate, not on the guard.
3. **No breadth in this round, by design** — no new preset, template,
   editor, or embed route; path workflow is still display-only (fixed
   equal-share path-key times, Loop overlaps, Frame clamp and Spiral floor
   undecided); real-font verification is still outstanding. A 9 needs
   those, not just harder gates.
