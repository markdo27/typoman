# TYPOMAN Round 7 — Safety hardening

**Agent:** Round 7 safety-hardening agent. **Scope kept, no exceptions:** only
`js/engine/safety.js`, `js/studio/export-dialog.js` (only the
unknown-measurement fallback path), and this note were touched. No preset,
template, other studio file, test, or workflow file was edited. Nothing was
committed or pushed. (Other dirty files in the tree belong to other Round 7
agents and were not touched.)

**Context:** Round 6 median 8.4/10; judges flagged safety hardening as a
remaining gap. Round 6's safety note ("Remaining safety gaps", item 1) named
exactly the first gap below: `flashes()` did not clamp duration/fps itself,
so the 3600-frame bound held only for normalised scenes.

## 1. flashes() caller trust (js/engine/safety.js)

### Before

`flashes()` computed `n = round(duration × fps)` from whatever scene a caller
passed and allocated two `Float32Array` series of `576 × n` plus two `Int8`
hit arrays before rendering anything. The 3600-frame / ~21 MB bound held only
because the studio/export callers happened to pass normalised scenes. A raw
unnormalised scene — e.g. 600 s @ 60 fps — would allocate ~166 MB of series
(576 cells × 36,000 frames × 4 bytes × 2 series, plus hit arrays) and take
~10× longer, before any flash was counted.

### After — rejection, not normalisation

`flashes()` now validates, before rendering a frame or allocating anything:

- duration is finite and within 0.5–60 s, and
- fps is one of 24/25/30/50/60 (the `Scene.normalize` set),

and otherwise throws a plain `Error` naming the bounds and telling the caller
to normalise with `TM.Scene.normalize()` first, e.g.
`TM.Safety.flashes: scene is outside the normalised bounds — duration must be
0.5–60 s and fps one of 24/25/30/50/60; normalise it with
TM.Scene.normalize() first (got duration=600, fps=60)`.

Rejection was chosen over normalising inside `flashes()` deliberately, and
this is the main design decision of this round:

- Normalising would silently measure a *different* loop. A 600 s scene
  truncated to 60 s, or a 120 fps scene re-rated to the 60 fps default, is not
  the scene the caller asked about — a flash that only occurs in the
  discarded part (or at the original rate) would be missed, and the result
  would claim to describe a scene it never analysed.
- Rejection is fail-closed and honest: no allocation, no misleading result,
  and the export gate (below) treats the rejection as an unknown measurement
  and blocks.
- It also avoids a new dependency: `safety.js` previously never referenced
  `TM.Scene`, so no load-order coupling is introduced.
- No frame downsampling or aliasing is involved anywhere: in-bounds scenes
  are analysed at their full scene rate exactly as in Round 6, and the
  transition / worst-field counting code is untouched. A scene that is already
  normalised passes the guard untouched, so it reads identically.

In-tree callers are all safe under the guard, verified by inspection, not by
assumption: the studio store holds a normalised scene, the long-loop test and
the smoke/flash suites normalise before calling, and template scenes assert
normalised equality. A caller passing a non-numeric fps (e.g. the string
`"60"`) is also rejected — normalised scenes carry numeric fps, and the error
message quotes the value (`fps="60"`) so the type mismatch is visible.

### Before / after, unnormalised scenes

| Scene passed to `flashes()` | Before | After |
|---|---|---|
| 600 s @ 60 fps (raw) | ~166 MB allocated, ~10× render time, then a result | Throws in ~1 ms, before any allocation or render |
| 4 s @ 120 fps (raw) | Analysed at 120 fps (480 frames) | Throws: fps not in 24/25/30/50/60 |
| 0.4 s @ 60 fps (raw) | Analysed (24 frames) | Throws: duration below 0.5 s |
| 4 s @ 7 fps (raw) | Analysed at 7 fps | Throws: fps not in 24/25/30/50/60 |
| 4 s @ 60 fps, normalised | 240 frames, measured | Identical: 240 frames, measured |
| 60 s @ 60 fps, normalised | 3600 frames, 15 Hz strobe 15/s, fail | Identical (see Verification) |

## 2. Export gate, unknown measurement (js/studio/export-dialog.js)

### Before

When the flash check failed outright, the export path fell back to the
presets' own estimates (`Studio.flashRisks`): if those were silent, export
proceeded, with only the flash note's "Couldn't check for flashes" warning
standing between the user and an unmeasured export. A scene whose check
failed for a technical reason could therefore be exported with no measured
flash rate at all. (The note itself is shared with the share dialog, so its
wording was deliberately left alone — see below.)

### After

A failed check (or a null result despite a checker being available) is now an
**unknown measurement**, with its own gate state, distinct from the measured
over-limit gate:

- `applyUnknownGate(scene)` shows "Export blocked: flashes could not be
  checked", explains that the scene has no measured rate and could flash
  above the 3/s WCAG 2.3.1 limit, and keeps Export disabled.
- The "Export anyway" switch is **hidden** for unknown measurements, so an
  unknown scene cannot be confirmed away. The only way out is a successful
  re-check: the new **"Retry flash check"** button (which re-runs
  `updateGate` for the current scene), or closing and reopening the dialog
  (which re-checks on open).
- `gateBlocked()` now also blocks when the gate is in the unknown state even
  if this scene was previously confirmed — a stale confirmation was for a
  measured rate, not for "no measurement".
- `start()` (the Export button's own re-check) applies the unknown gate and
  refuses the export on a failed check, instead of falling back to preset
  estimates; a blocked attempt focuses the Retry button, not the
  confirmation switch. The `updateGate` background path does the same on
  failure (ignoring aborts and stale scenes, as before).
- What is unchanged, deliberately:
  - **Measured ≤ 3/s** still exports normally.
  - **Measured over-limit** still uses the existing explicit-confirmation
    path: gate title "Export blocked: flashes above the limit", the measured
    rate in the confirmation text, and Export enabled only after the switch
    is checked (verified by the studio test, below).
  - **No checker at all** (`Studio.safety` unavailable) still uses the
    preset-estimate gate — that is not a failed check, it is the absence of a
    checker, and there is no measurement to retry. Changing that branch would
    have blocked exports in environments where the checker was never loaded,
    which is a different product decision (see "Remaining safety gaps").
  - The flash note's "Couldn't check for flashes" text is unchanged: the
    note is shared with the share dialog (`share-dialog.js`), where an
    export-gate message would be wrong. The gate box is now the authoritative
    blocker in the export dialog; the note is informational only.

### Before / after, unknown measurements

| Situation | Before | After |
|---|---|---|
| Check fails, preset estimates silent | Export proceeds, "Couldn't check" warning only | Export blocked, "flashes could not be checked", Retry button, no confirmation bypass |
| Check fails, preset estimates risky | Blocked until "Export anyway" confirmed (an estimate, not a measurement, could be confirmed away) | Blocked until a check succeeds; confirmation switch hidden |
| Check succeeds, ≤ 3/s | Export allowed | Export allowed (unchanged) |
| Check succeeds, > 3/s | Blocked until explicitly confirmed, with measured rate | Blocked until explicitly confirmed, with measured rate (unchanged) |
| Check fails, then Retry succeeds (safe scene) | n/a (no retry in the gate) | Gate clears, Export enabled |

## Verification

- `node --check js/engine/safety.js` and `node --check
  js/studio/export-dialog.js`: pass.
- `node tests/flash-long-loop.mjs`: **pass** — 60 s @ 60 fps 15 Hz strobe
  still 3600 frames at 60 fps, 15/s, `ok: false`; 4 Hz control 4/s, fail;
  saturated-red 15/s general and red, fail; seam pulse 1/s, pass; short
  controls unchanged. Short and 60 s normalised scenes read identically to
  Round 6, as required.
- Guard behaviour, verified in-browser with a temporary script (run from the
  repo root, deleted afterwards; no test file was added or edited): 600 s @
  60 fps throws in 1 ms with the bounds error; 120 fps, 0.4 s, 7 fps, and
  string `"60"` fps all throw; a normalised 4 s @ 60 fps scene measures
  normally (240 frames, 0/s for the default scene).
- Unknown-gate behaviour, verified in-browser with a temporary script
  (same arrangement): with `TM.Safety.flashes` stubbed to throw, opening
  Export shows "Export blocked: flashes could not be checked", the Export
  button stays disabled, the Retry button is visible and the "Export anyway"
  switch is hidden; Retry while still failing keeps Export disabled (6 s
  trace, primary button, scene unchanged, no cached result); restoring the
  real checker and pressing Retry clears the gate and enables Export.
- `npm run test:studio` (full suite, 45.9 s): **export section all pass** —
  the Export dialog opens; size estimate shown; the over-limit scene shows
  the flash gate and blocks Export until confirmed (measured ~8/s); checking
  the gate confirmation enables Export; the draft WebM downloads non-empty
  (67 KB); the dialog reports it; Esc closes the dialog. This confirms the
  measured over-limit confirmation path survived the unknown-gate change.
- Full studio suite overall: 74 passed, 3 failed, and all 3 failures are the
  known sandbox Google Fonts limit — "no console errors" (boot, desktop,
  phone) failing only on `net::ERR_TUNNEL_CONNECTION_FAILED` for
  fonts.googleapis.com loads. `safety.js` and `export-dialog.js` load no
  fonts, and no other check failed. On a machine with font access these
  should be re-checked; they are not safety regressions. (Same sandbox limit
  as documented in Round 6.)
- `git status` / `git diff --stat` for the scoped paths show only
  `M js/engine/safety.js`, `M js/studio/export-dialog.js`, and the new
  `docs/benchmark/round-7/safety-hardening-notes.md`. Temporary verification
  scripts were deleted and no test, preset, template, or workflow file was
  modified. Nothing was committed or pushed.

## Remaining safety gaps (reported, not patched)

1. **No checker at all still exports on estimates.** When `Studio.safety`
   is unavailable, the estimate gate is the only signal and can still be
   confirmed away. Whether that should also hard-block is a product decision
   (the task for this round covered the failed-check path only); it is the
   same open question as the "export hard-block vs confirm-to-export"
   decision already pending for the round.
2. **Validation covers duration/fps only.** `flashes()` does not validate
   scene size or layer content; a malformed size would fail later in the
   renderer rather than at the guard. That failure now surfaces in the
   export dialog as an unknown measurement (blocked, retryable), which is
   fail-closed, but the error the user sees is the gate message, not the
   underlying renderer error (still logged to the console).
3. **Wall time for very long loops is unchanged** (~5 s for a 60 s check in
   this sandbox; Round 6 judges measured 17–40 s in-page, which this round
   did not re-measure). The fix still belongs in studio debouncing/caching,
   not in downsampling the detector.
4. **Font-dependent readings in this sandbox use fallback fonts** (Google
   Fonts unreachable here), so text-preset flash rates measured here are
   provisional until a real-font verification run. Solid-fill readings are
   unaffected.
5. **A previously cached safe measurement is still honoured.** `updateGate`
   and `start()` both return a cached result for the same scene without
   re-running the check, by design (shared with the Motion panel). A later
   transient check failure therefore does not revoke an earlier valid
   measurement for an unchanged scene; revoking cached results on failure
   would be a further hardening step, and would need to distinguish a
   genuinely changed scene from a transient failure.
