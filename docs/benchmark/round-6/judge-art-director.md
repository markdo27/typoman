# TYPOMAN Round 6: Art Director (Kinetic Type)

**Snapshot:** HEAD `9c89f08` plus the uncommitted working tree —
41 registered presets, 16 templates, with the Round 6 changes in
`js/engine/safety.js`, `js/presets/path-flow.js`,
`js/presets/path-draw.js` and `tests/flash-long-loop.mjs`, plus the
Round 6 notes in `docs/benchmark/round-6/`. This judge is read-only
except for this file: no code was edited, committed or pushed.
Other dirty files in the tree (boot, renderer, cylinder, studio,
templates, and the untracked presets) are cumulative work from
earlier rounds, not Round 6 scope, and are not credited to Round 6
here.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.5 | 8.5 | 8.5 (prov.) | 8.5 | 8.5 | 8.5 (prov.) | 8.5 | 8.5 | **8.5** |

Mean of the eight bands = 68.0 / 8 = 8.5.
Round 5 median was 8.2 (MC 8.0, TQ 8.0, PC 8.0, CR 8.5, EE 8.5,
UX 8.5, PR 8.0, EQ 8.0); this judge's own Round 5 scores were
8.5 / 8.5 / 8.0 / 8.5 / 8.5 / 8.5 / 8.0 / 8.0 (mean 8.3).
Round 6 therefore moves the needle by about +0.2 over Round 5,
lifting exactly the three lagging bands (Path Control,
Performance & Robustness, Engineering Quality) to the level of
the rest — and it does **not** reach 9. No band reaches 9, because
every band still carries a named structural gap (see "To reach
9/10"). Nothing below is taken on trust from the Round 6 notes:
the three headline claims were re-measured independently.

**Lens:** Motion Craft, Typographic Quality and Creative Range
are weighted most; all eight criteria are scored from evidence.

## Method and environment limits — read before trusting any band

- **Code read:** the diffs for `safety.js`, `path-flow.js` and
  `path-draw.js` against HEAD (which also contains Round 5
  changes, since the tree is uncommitted — only the Round 6
  hunks are credited here), plus both Round 6 notes and the
  rewritten `tests/flash-long-loop.mjs`.
- **Syntax:** `node --check` passes on all three changed files.
- **Independent re-measurement (this judge), safety:**
  `node tests/flash-long-loop.mjs` — **passed, exit 0.**
  60 s @ 60 fps, 15 Hz strobe: 3600 frames analysed at 60 fps,
  **15/s, ok: false** (was 0/s, ok: true under the 900-frame cap).
  Controls all correct: 2 s 15 Hz strobe 15/s, fail; 60 s 4 Hz
  strobe 4/s, fail; 60 s saturated-red strobe 15/s general and
  15/s red, fail; 4 s seam pulse 1/s, pass; 4 s 15 Hz anchor 15/s,
  fail. Short loops are unchanged by construction: the transition
  and worst-field counting are untouched, and a 4 s @ 60 fps loop
  still analyses exactly 240 frames.
- **Independent re-measurement (this judge), path:**
  the Round 6 agent's own Chromium harnesses in `/tmp`
  (`r6-flow.mjs`, `r6-draw3.mjs`), re-run on the current tree
  at 960×540, 65 px type, "TYPE IN MOTION". Every headline
  number reproduced exactly — see §1–§3 below.
- **One timing discrepancy, stated plainly:** the safety notes
  claim a 60 s check at "right around the 5 s mark" (4.5–5.2 s
  in-page). This judge measured **20.6–28.7 s in-page** for the
  three 60 s cases (total test wall ~80 s, vs 18–22 s claimed).
  Correctness is unaffected — the readings are exact — but the
  wall-time claim does **not** reproduce in this sandbox run
  (software raster, possibly under parallel load). The 60 s
  check's cost is therefore reported here as "~5 s claimed,
  ~21–29 s measured here", and it is a PR caveat, not a safety
  failure. It should be re-timed on a quiet machine with fonts
  before anyone quotes 5 s.
- **Google Fonts do NOT load in this sandbox**
  (`ERR_TUNNEL_CONNECTION_FAILED`; 0/60 catalogue fonts in
  Round 5 smoke, same limit cited by both Round 6 notes).
  Every browser measurement in this round ran on fallback
  fonts. This is an environment limit, **not a product bug**,
  and it is not scored against the product. It does cap the
  evidence: all type geometry below (glyph widths, shrink
  depths, seam distances) is fallback-font geometry, and
  variable-axis behaviour, true italics and every
  font-dependent flash rate remain **unverified on real fonts,
  not disproven and not confirmed**. No font-true contact
  sheet is claimed. The solid-fill long-loop readings are
  unaffected by fonts, which is why the safety claim is the
  firmest in this round.
- **Not hand-tested:** the studio editor by mouse/keyboard,
  and no keyboard/accessibility audit was run. PC and UX are
  therefore marked provisional, as in Rounds 4–5.
- **Not re-run in full:** the sweep (602 configurations),
  flashes-a (176 configurations) and smoke suites. Their
  Round 5 rows are adopted only where the Round 6 notes
  report identical rows for the two path presets (0 render
  errors, deterministic, worst seam 1.00× / 0.00×, failures
  only font console errors) — consistent with this judge's
  re-runs, which show no render throw on these presets.

## What Round 6 actually fixed — verified, not assumed

### 1. Long-loop flash analysis: the Round 5 safety hole is closed

`flashes()` no longer caps at 900 frames: `n` is now the full
`round(duration × fps)`, rendered in 240-frame slices with a
yield at every slice boundary (as well as the existing
`yieldMs` yield inside a slice). The transition and worst-field
analysis runs once over the complete series, so cyclic seam
handling is the same code path — and the seam-pulse control
(1/s, pass) proves it survived. Memory is bounded for
normalised scenes only: at most 3600 frames, ≈16.6 MB of
series plus ≈2.1 MB per hit array, because
`Scene.normalize` clamps duration to 0.5–60 s and fps to
24/25/30/50/60. `opts.maxFrames` is now deliberately ignored
rather than honoured at a higher value — the right call for a
safety function (any downsampling reintroduces aliasing above
its new Nyquist limit), though it is a silent API change for
any caller that expected a cap; the only in-tree caller passed
240 for 4 s @ 60 fps loops, which are exactly 240 frames at
full rate, so it is unaffected. This judge's re-run confirms
the fix end to end: a strobe five times the WCAG 3/s limit
can no longer pass by aliasing.

### 2. Path Flow Travel/Still on closed lanes: the pile is gone

The Round 5 Fill fit is extended, in the Travel/Still branch
only, as `fit = min(1, lane.length / line.width)` applied to
both advances and glyph scale about an untouched `s0`, so
travel start, still offset, ease and cycle keep their meaning
and open paths keep fit = 1. Re-measured here (this judge,
`r6-flow.mjs`, current tree):

| case | scale | close pairs (<15 px) | min pair distance |
|---|---|---|---|
| Travel Star long, p 0 / .25 / .5 / .75 | 0.437 | 0 / 0 / 0 / 0 | 17.5 / 17.8 / 17.6 / 19.1 px |
| Still Star long | 0.437 | 0 | 17.5 px |
| Travel Circle long | 0.932 | 0 | 30.8 px |
| Travel Star short (deliberate) | 0.887 | 0 | 53.5 px (was 24.9 px) |
| Still Circle short, Frame long | 1 | 0 | unchanged |

Every figure matches the path notes exactly, including the
deliberate non-identity: Star short already exceeded its lane
by ~13% (first and last glyphs nearly meeting at closure), so
the fit correctly fires there too, while genuinely fitting
lanes are byte-identical.

### 3. Path Flow Fill seam bug: found while verifying §2, fixed

Choosing the repeat count from the *fitted* unit rounded
Circle short's lane/unit ≈ 1.7 up to 2 repeats, then compressed
the unit while glyphs stayed full size, landing a separator
2.8 px from the next repeat's first glyph. The fix chooses
`reps` from the *unfitted* unit and caps the fit by the whole
tiled run (`fit = min(1, lane / (reps × unit0))`). Re-measured
here: Fill Circle short, 26 calls, scale 1 → **0.796**,
close pairs 2 → 0, minimum distance **2.8 px → 26.4 px**.
Fill Frame long moves 1 → 0.97 with no pile either way; Fill
Star, Wave and Circle long are unchanged. This is a real
second bug fixed in the same round, not a restatement of §2.

### 4. Draw On: residuals cleared to the honest floor

The adopted fix is vertex-local pop-shrink, not per-pair
spacing — and the notes document why, with numbers: spacing
along the lane *worsened* Loop's worst pair (18.79 px →
21.37 px) because a self-crossing lane folds back on itself,
while shrinking can only reduce overlaps and moves no glyph
along the lane, so pen timing, lead and lane positions are
untouched. The implementation (`boxDepth()` SAT helper;
shrink in ≤20% steps, capped at 20% total, ≤3 iterations,
applied only against the predecessor's box, using the lane
angle and lane point) is in the diff and matches its comment.
Re-measured here (this judge, `r6-draw3.mjs`, 22-shape table,
"TYPE IN MOTION", p = 0.55):

- Mean-half-width model: **42 → 9** adjacent overlaps.
- Per-glyph model (the true geometry): **33 → 2**.
- Depth > 0.5 px: **2 → 2**, both on Loop.
- Round 5 residuals zigzag / lissajous / frame: **0** on both
  models (non-Loop shrinks are 1–2%, e.g. lissajous 0.989 —
  invisible).
- The 7 remaining mean-model counts (arc, wave, scurve,
  ribbon, double-loop, blob, infinity, 1 each) are all 0 on
  the per-glyph model: mean-model artefacts for asymmetric
  pairs (narrow I against wide N/O), correctly *not* shrunk
  for. Matching the mean model in the preset would be gaming
  the harness, not fixing geometry, and the agent rightly
  refused to.

Loop is deliberately left: I–N 1.31 px and N–M 16.82 px after
the 20% cap (from 3.51 px and 18.79 px). The lane itself
crosses there, so clearing N–M would need a >50% shrink or a
>20 px move along a folding lane — both shown to be worse
than the overlap. This is a shape/text-size property, not a
vertex-spacing defect, and leaving it (with the cap as the
guard against invisible glyphs) is the correct judgement.

### 5. Frame horizontal clipping: correctly NOT fixed by fiat

The notes measure instead of guessing: at the default 65 px
type there is no horizontal clipping to fix (spread/above box
x 1.4–955.6 px on a 960 px frame; the Round 5 vertical clamp
already covers the side-edge extent), and at 108 px it is
≤ 5.4 px on corner glyphs only. Neither guard form is
look-neutral (a scalar `up` guard shrinks the designed gap
for every glyph; a per-glyph x-clamp detaches intentionally
cropped glyphs from their lane and cannot tell Frame's inset
border from a custom off-frame path), so the agent lists
three design decisions for the parent instead of inventing a
clamp. That restraint is credited, not penalised — but the
gap itself remains open, and it caps PC below 9.

## 1. Motion Craft — 8.5 (was 8.5)

**Evidence.** The three path-motion fixes above are the
round's motion work, and they are complete in their scope:
a long run on a closed lane now travels the full loop without
piling, Fill tiles without a seam pile, and Draw On corners
no longer touch except where the lane itself crosses. Travel
and still keep their exact old meanings (untouched `s0`),
and the shrink reads as a slightly smaller pop for exactly
the glyphs that would otherwise touch — motion identity is
preserved everywhere the fix fires.

**Against (and why not 9).** The old ceilings are untouched:
no value-graph/timing editor, springs still over-normalised,
Ink Pen still reveals rather than writes, Floor Plane still
nearly vanishes on a single line, Phrase Morph mid-transition
overlaps unmeasured. Round 6 perfects motion you can pick;
a 9 needs motion you can shape.

**What would move this up one point:** a timing editor
(curves you can see and shape), springs whose stiffness reads
as frequency, and Ink Pen that actually writes along a stroke.

## 2. Typographic Quality — 8.5 (was 8.5)

**Evidence.** Four visible typographic defects are gone or
reduced to sub-pixel honesty: the Travel/Still Star pile, the
Fill Circle seam pile (2.8 px → 26.4 px), and the Draw On
corner grazes (per-glyph 33 → 2, non-Loop shrinks ≤ 2%).
No preset pads, truncates or replaces user text in these
fixes, and the fit preserves proportions (glyphs shrink with
their advances, not just their spacing).

**Against (and why not 9).** Loop's two real overlaps remain
(16.82 px on N–M is not a graze); Draw On smoothing still
buys its result by cutting corners (lane deviation up to
~2.9 × capH at a sharp point, so type no longer sits on the
line it appears to follow); Spiral at extreme length still
shrinks without a floor; the Stack descender dispute is
still unresolved; OpenType is still thin (tnum/pnum/lnum
only); emoji still render as grey squares in Particles; and
— decisively for a 9 — every type judgement here is on
fallback fonts.

**What would move this up one point:** a font-true visual
pass once fonts load, a Loop lane/size decision, a Spiral
minimum-size/overflow policy, and real OpenType coverage.

## 3. Path Control — 8.5, provisional (was 8.0)

**Evidence.** The fit is now complete across all three Path
Flow modes on closed lanes (Fill in Round 5, Travel/Still and
the Fill seam fix in Round 6), Draw On is at its honest
floor on 20 of 22 shapes, and the sweep rows for both presets
show no render/determinism/seam failure.

**Against (and why not higher).** The editor itself — the
thing a 9-band path tool needs — is unchanged: still no
direct-manipulation bézier editor (anchors, handles,
add/delete points), no freehand drawing, no path morphing
with numeric control, and it was not hand-tested here, hence
provisional. Loop overlaps and the Frame horizontal clamp
remain open (the latter awaiting the three design decisions
in §5 above), and folds straddling a closed path's seam are
still untrimmed in `offset()` (engine scope).

**What would move this up one point:** a real bézier editor
with undo, a decided Frame horizontal clamp (scalar vs
per-glyph, all closed paths vs Frame only), and a Loop
lane/size fix.

## 4. Creative Range & Originality — 8.5 (was 8.5)

**Evidence.** The library is unchanged in count (41 presets /
16 templates) and Round 6 adds no preset, template, remix
path or combinable-effects system — but its fixes unlock
existing looks: long text on closed lanes in Travel/Still
mode was previously unusable (it piled on itself) and is now
a working creative option, and Draw On's 22 shapes are now
clean at default size except Loop.

**Against (and why not 9).** The brief's "more presets / more
creative" is not what this round delivered, and this band is
not credited for work it did not do. Long-text fragility
persists at the edges (Spiral's no-floor shrink,
orbit-badge core crowding, kaleido-window densifying), and
there is still no signature identity beyond the catalogue
itself, no remix/discover path, and no combinable effects.

**What would move this up one point:** a remix/discover path
(one-click surprising recombinations), combinable effects,
and fit-sizing for the long-text edge cases.

## 5. Export & Embed — 8.5 (was 8.5)

**Evidence.** The long-loop fix is this band's most important
change since Round 3: the export gate's measurement is now
trustworthy for loops of any length, where before any loop
over ~15 s at 60 fps had unverified flash safety above
7.5 Hz. The gate itself (over-limit exports blocked behind
an explicit confirmation naming the measured rate,
re-checked in `start()`) is unchanged and still sound, as is
the share dialog's surfaced hover/scrub/per-page text.

**Against (and why not 9).** The gate is still
confirm-to-export, not a hard block: one click still exports
an 8/s scene. Two holes sit underneath it and are untouched
by Round 6: the glitch preset's own `flashes()` estimate
still returns 0 for a layer `TM.Safety` measures above the
limit, so any surface trusting the estimate still misses
this class; and there is still no iframe/web-component route
for uploaded fonts (the dialog correctly warns, but the gap
is unchanged). No new export format, resolution or
frame-accurate offline render path arrived.

**What would move this up one point:** a hard block (or a
justified, logged override) for over-limit exports, a fixed
glitch estimate, an uploaded-font embed route, and a
frame-accurate offline render verified against preview.

## 6. Studio UX & Visual Design — 8.5, provisional (was 8.5)

**Evidence.** No studio change is in Round 6 scope, so this
band rests on Round 5: the share dialog offers what the
player already supported, and the export gate explains
itself in plain language. The long-loop fix indirectly helps
UX trust: the gate's rate is now a true rate, not an aliased
one, so users are no longer told a dangerous loop is safe.

**Against (and why not 9).** The known blemishes are
untouched: Spring-tab commit-at-once with no Esc revert,
blank track matte with no hint, no per-preset guidance when
a look degrades (Spiral at extreme length, Paper Column's
flattened depth, single-line Floor Plane, and now Loop's
overlap at this size and the Frame 108 px corner clip, both
of which deserve a surfaced note rather than silence). The
gate's uncheck-reblocks and close/reopen-clear paths are
still not in `tests/studio.mjs`; hover + scrub together are
not spelled out. No keyboard/focus/contrast audit was run,
hence provisional.

**What would move this up one point:** fix the Spring-tab
commit and blank-matte hint, add degradation guidance per
preset (including Loop and Frame-at-large-size), and
complete a keyboard/focus/contrast audit.

## 7. Performance & Robustness — 8.5 (was 8.0)

**Evidence.** The round's headline robustness bug is fixed
and independently re-verified: long-loop flash analysis is
now full-rate, sliced (240-frame slices, yields at every
slice boundary), and bounded for normalised scenes
(≈16.6 MB series + ≈2.1 MB per hit array at 3600 frames).
Short-loop readings are provably unchanged, and the sweep
rows for the two path presets are clean on render,
determinism and seam. CI already carries the flash and
long-loop jobs (Round 5), so this fix is now pinned by a
test that fails if aliasing returns.

**Against (and why not 9).** The 60 s check's wall time did
not reproduce at the claimed ~5 s in this sandbox
(20.6–28.7 s in-page here — see Method). If that timing is
real rather than sandbox load, re-running the check on every
studio edit is untenable without debounce/caching, and the
fix belongs in the studio, not in downsampling the detector.
Unnormalised scenes are still unbounded in `flashes()`:
a raw 600 s @ 60 fps scene would allocate ~166 MB and take
~10× longer, because the clamp lives in `Scene.normalize`,
not in the safety function. The 200 ms frame-cost budget is
still a guardrail, not a performance claim (it fails only
below 5 fps; glitch-drop at ~132 ms is ~7.5 fps at 1080p),
and mutation catch (8/23) and the other Round 3/4
robustness gaps are unchanged.

**What would move this up one point:** a streaming
transition-state pass or an in-function normalisation for
unnormalised scenes, a debounced/cached studio flash check,
a split preset/template frame budget calibrated on real
hardware, and a glitch-drop cost pass.

## 8. Engineering Quality — 8.5 (was 8.0)

**Evidence.** Round 6's own engineering is the round's
quiet strength: changes are scoped to the files each agent
claimed, commented with their reasoning *and* their limits,
and no detector or threshold was weakened to make a test
pass — the old long-loop test, which pinned the aliased
behaviour, was rewritten to pin the fixed behaviour instead
of being deleted or loosened. The path agent's documentation
is exemplary: it reports both box models and explains why
they differ, names the rejected spacing candidate with the
measurement that killed it (Loop N–M 18.79 px → 21.37 px),
and refuses to game the harness on the 7 mean-model
artefacts. The safety agent likewise documents the
unnormalised-scene caveat and the wall-time cost rather
than burying them.

**Against (and why not 9).** The codebase-wide hygiene gaps
are untouched: `SEPARATORS` still copied across presets,
`stack.js` still reaches the private `f._font`, the
no-mutation contract behind the renderer token optimisation
is still unenforced, and mutation catch is still 8/23. The
tree itself is still uncommitted and dirty across agents,
with Round 4 additions mixed into diffs, so a reviewer
cannot cleanly attribute this round from `git diff` alone.
Minor: `maxFrames` is now silently ignored rather than
deprecated with a warning, which could surprise a future
caller that passes it expecting a cap.

**What would move this up one point:** deduplicate the
shared preset helpers, remove the private-field reach,
enforce the no-mutation contract (or test it), deprecate
`maxFrames` loudly, and land the round in clean,
attributable commits.

## Round 5 blockers re-checked (current tree)

| Round 5 blocker | Status now |
|---|---|
| Path Flow Travel/Still pile on closed lanes | **Fixed** — fit extended, 0 close pairs at every phase (re-measured) |
| Fill Circle seam pile (found in Round 6) | **Fixed** — 2.8 px → 26.4 px, scale 0.796 (re-measured) |
| Draw On residuals (zigzag 2, lissajous 2, frame 1) | **Cleared** — 0 on both box models (re-measured) |
| Draw On Loop overlaps | **Left, deliberately** — per-glyph 2, N–M 16.82 px at cap; needs lane/size decision |
| Draw On Frame horizontal clipping | **Open by decision** — 0 at 65 px, ≤ 5.4 px at 108 px; guard form undecided |
| Long-loop 900-frame cap / 15 Hz strobe passes at 0/s | **Fixed** — 3600 frames, 15/s, fails (re-measured); wall time ~21–29 s here vs ~5 s claimed |
| Export warn-only above 3/s | **Unchanged** — still confirm-to-export, not a hard block |
| Glitch `flashes()` estimate returns 0 | **Unchanged** — not in Round 6 scope |
| Real-font verification | **Still outstanding** — all evidence fallback-font only (0/60 fonts in sandbox) |
| Uploaded-font embed route | **Still missing** (dialog warns) |
| Stack descender dispute | **Unresolved** — needs extrude/real-font re-render |
| Spiral no-floor shrink | **Unresolved** — product decision still unmade |
| Bézier / timing editor, remix, OpenType, emoji | **Untouched** |

## To reach 9/10 (ranked)

1. **Prove it on real fonts and give users shaping tools.**
   Run the flash + frame-budget jobs on GitHub Actions with
   fonts that actually load and re-measure the path geometry
   on real fonts; ship a bézier editor and a timing/curve
   editor. Until then every type claim carries a
   fallback-font asterisk and motion is picked, not shaped —
   which alone blocks MC, TQ and PC at 9.
2. **Finish path typography with decisions, not more
   shrink.** Decide the Loop lane/size (or surface its
   overlap honestly in the studio), decide the Frame
   horizontal clamp (scalar vs per-glyph, Frame-only vs all
   closed paths, with a minimum-gap floor), and decide
   Spiral's minimum-size/overflow policy. These are product
   decisions now, not measurement problems.
3. **Harden export and long-loop cost.** Make over-limit
   exports a hard block (or a justified, logged override),
   fix the glitch estimate, add the uploaded-font embed
   route, bound `flashes()` for unnormalised scenes, and
   debounce/cache the studio flash check so a 60 s loop
   does not cost ~20 s on every edit. Until then EE, UX and
   PR cannot credibly reach 9.
