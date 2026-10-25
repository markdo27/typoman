# TYPOMAN Round 7: Art Director (Kinetic Type)

**Snapshot:** HEAD `9c89f08` plus the uncommitted working tree —
41 registered presets, 16 templates, with Round 6 (safety full-rate
analysis, Path Flow fit, Draw On shrink) and the Round 7 hardening in
`js/engine/safety.js`, `js/studio/export-dialog.js` and
`js/presets/glitch.js`, plus the Round 7 notes in
`docs/benchmark/round-7/`. This judge is read-only except for this
file: no code was edited, committed or pushed. Other dirty files in
the tree (boot, renderer, cylinder, studio, templates, path presets,
and the untracked presets) are cumulative work from earlier rounds,
not Round 7 scope, and are not credited to Round 7 here. The diffs
against HEAD also contain Round 6 hunks; only the Round 7 hunks are
credited here.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.5 | 8.5 | 8.5 (prov.) | 8.5 | 8.5 | 8.5 (prov.) | 8.5 | 8.5 | **8.5** |

Mean of the eight bands = 68.0 / 8 = 8.5.
Round 6 median was 8.4 (MC 8.5, TQ 8.0, PC 8.5, CR 8.5, EE 8.5,
UX 8.5, PR 8.5, EQ 8.5); this judge's own Round 6 scores were
8.5 across the board (mean 8.5). Round 7 therefore holds this
lens's score exactly: it is a genuine hardening round that closes
two named safety holes without a regression, but it moves no
creative, typographic or path band, and it does **not** reach 9.
No band reaches 9, for the reasons below.

**Lens:** Motion Craft, Typographic Quality and Creative Range
are weighted most; all eight criteria are scored from evidence.

## Method and environment limits — read before trusting any band

- **Code read:** the Round 7 hunks in the diffs for `safety.js`
  (bounds guard before any allocation), `export-dialog.js`
  (unknown-measurement gate, Retry button, confirmation switch
  hidden for unknown scenes) and `glitch.js` (the `flashes()`
  step model only — `clock()`, `clockFor()`, params, looks and
  render are untouched), plus both Round 7 notes.
- **Syntax:** `node --check` passes on all three changed files.
- **Independent re-measurement (this judge), safety:**
  `node tests/flash-long-loop.mjs` — **passed, exit 0.**
  60 s @ 60 fps, 15 Hz strobe: 3600 frames at 60 fps,
  **15/s, ok: false**; 4 Hz control 4/s, fail; 60 s
  saturated-red strobe 15/s general and 15/s red, fail;
  4 s seam pulse 1/s, pass; 4 s 15 Hz anchor 15/s, fail.
  Normalised readings are therefore unchanged by Round 7,
  as claimed. The unnormalised guard itself was audited in
  the diff (finite duration 0.5–60 s, fps in 24/25/30/50/60,
  thrown before any allocation, error names the bounds and
  points at `TM.Scene.normalize()`); it was not re-run
  in-browser here, but its code path is short, total, and
  the Round 7 agent's in-browser guard probes are reported
  in its notes.
- **Timing, re-measured and still not the claimed figure:**
  the three 60 s cases in my long-loop run took
  **41.6 s, 37.9 s and 16.8 s in-page** (total test wall
  ~111 s). This matches my Round 6 measurement (20.6–28.7 s)
  and contradicts the "~5 s" figure in the safety notes for
  a second round. Correctness is unaffected — the readings
  are exact — but the cost caveat from Round 6 stands and
  is now stronger: a 60 s check costs tens of seconds in
  this sandbox, and Round 7 adds no debounce or cache to
  soften it (see §7).
- **Glitch estimate, audited not re-run:** the new
  `flashes()` is a real model, not a fudge — it replays the
  render's own seeded intensity per glitch step (constant
  mode's `rnd(901)` draw, bursts envelope, in/out flicker
  windows), scales by Safety-cell size (`amp = min(1,
  0.1 × sizePx × 24 / W)`), and counts Safety-style turns
  (≥ 0.1 delta, worst 1.06 s window, halved). The diagnosis
  it fixes is sound: the old gate demanded ink ≥ 12% of the
  *whole frame*, while Safety counts in a 10° field, and
  glitch-drop's ink covers 96% of a field at only 6.56% of
  the frame. The reported numbers (rate 8: estimate 3 vs
  measured 3.5/s; shipped rate 6: 2 vs 1/s; safe looks
  ≤ 2.5/s) are plausible from the code and consistent with
  the notes' before/after table, but they were **not**
  re-measured in-browser by this judge — the long-loop run
  above is the independent measurement in this round.
- **Google Fonts do NOT load in this sandbox**
  (`ERR_TUNNEL_CONNECTION_FAILED`; 0/60 catalogue fonts in
  Round 5 smoke, same limit cited by both Round 7 notes).
  Every browser measurement in this round ran on fallback
  fonts. This is an environment limit, **not a product bug**,
  and it is not scored against the product. It caps the
  evidence exactly as in Round 6: type geometry, ink
  fractions, field shares and font-dependent flash rates
  remain **unverified on real fonts, not disproven**.
- **Not hand-tested:** the studio editor by mouse/keyboard,
  and no keyboard/accessibility audit was run. PC and UX are
  therefore marked provisional, as in Rounds 4–6.
- **Not re-run in full:** the sweep, flashes-a, smoke and
  studio suites. Their Round 6 rows are adopted only where
  the Round 7 notes report them (studio export section
  passing; full studio 74 passed / 3 failed on font console
  errors only), which is consistent with the unchanged
  render and the scoped diffs.

## What Round 7 actually fixed — verified, not assumed

### 1. `flashes()` caller trust: the unnormalised hole is closed

Round 6 left this open by design (the bound lived in
`Scene.normalize`, not in the safety function). Round 7
closes it the right way: **rejection, not normalisation**.
Silently truncating a 600 s scene to 60 s, or re-rating a
120 fps scene to 60 fps, would measure a different loop and
claim the result for the original — a safety function must
not do that. Throwing before any allocation, with the bounds
and the remedy in the message, is fail-closed and honest,
and it introduces no `TM.Scene` load-order dependency.
In-bounds scenes pass through untouched, so normalised
readings are identical by construction — and my long-loop
re-run confirms they are identical in fact. The remaining
caveat is narrow: validation covers duration/fps only, so a
malformed size still fails later in the renderer — but that
failure now surfaces in the export dialog as a blocked,
retryable unknown measurement, which is fail-closed.

### 2. Export unknown measurement: the warn-and-proceed hole is closed

This was the more consequential of the two holes. Before,
a failed check fell back to preset estimates, and if those
were silent the export proceeded with only a "Couldn't
check" warning — an unmeasured scene could ship. Now a
failed check (or a null result with a checker available)
is its own gate state: "Export blocked: flashes could not
be checked", Export stays disabled, the "Export anyway"
switch is **hidden** for unknown scenes, and the only way
out is a successful re-check (Retry button, or reopening
the dialog). The stale-confirmation hole is closed too:
`gateBlocked()` blocks on an unknown gate even if the scene
was previously confirmed, since that confirmation was for a
measured rate, not for "no measurement". Deliberately
unchanged, and correctly so: measured ≤ 3/s still exports;
measured over-limit still uses explicit confirmation with
the measured rate; and the no-checker branch (checker never
loaded) still uses the estimate gate, because that is
absence of a checker, not a failed check — changing it
would be the separate hard-block product decision, not a
bug fix. The shared flash note's wording is also rightly
left alone, since the share dialog shares it.

### 3. Glitch estimate: from a lie to a calibrated proxy

The old estimate returned 0 for a layer Safety measures at
3.5/s — not a rounding error but a wrong denominator, and
the fix names it. The new estimate is directionally right
(3 > 2 > 1 across rates 8/6/4 for glitch-drop), exact for
the glitch layer alone at rate 8 (3/s), low by 1 for Acid
Print (1 vs 2), and it overestimates only at an extreme
(huge size, rate 15: 5 vs 3). Safe looks do not suddenly
flag: every default-scene look stays ≤ 2.5/s, and the
shipped template stays low (2/s). Render is untouched —
measured values are identical before/after — so this is a
measurement-model fix, not a render change smuggled in.
But it is a proxy, and it must not be quoted as a
measurement: it models plate intensity only, not the
per-step slice/block/swap re-rolls, which is most of the
residual error, and its 0.1-em stroke factor is nominal,
not fitted per face.

### 4. What Round 7 pointedly did NOT close

- **The rate-8 estimate is 3, not > 3.** `Studio.flashRisks`
  flags only rates *above* 3/s, so a surface trusting the
  estimate alone (the export/share fallback when Safety is
  unavailable) still would not flag glitch-drop at rate 8.
  Safety remains the source of truth, and the estimate
  alone still cannot be the gate. This is stated in the
  notes, not hidden — but it means the Round 5 glitch gap
  is narrowed, not closed.
- **The render guard is still broken in this regime.**
  `clock()`'s 12% whole-frame gate fails for fitted
  headlines, so `clockFor()` runs glitch-drop at full rate
  even with `fastFlash` off; the template stays safe only
  because its rate was lowered to 6. Repairing that gate
  (field share, not whole-frame ink) changes render
  behaviour and was out of scope — correctly recorded for a
  later round, not smuggled in.
- **Long-loop cost is unchanged.** No debounce, no cache,
  no streaming pass; my re-measurement (up to 41.6 s for a
  60 s check) is worse than the notes' ~5 s claim, not
  better. A cached safe measurement is still honoured
  after a later transient failure.
- **No-checker exports still confirm away on estimates.**
  That is the pending hard-block decision, not a Round 7
  bug, but it is now the last unmeasured-export path.

## 1. Motion Craft — 8.5 (was 8.5)

**Evidence.** Nothing in Round 7 touches motion: no preset,
template, timing or easing change. The Round 6 motion state
stands — closed-lane travel without piling, clean Draw On
corners except Loop, motion identity preserved where fixes
fire.

**Against (and why not 9).** Unchanged from Round 6: no
value-graph/timing editor, springs still over-normalised,
Ink Pen still reveals rather than writes, Floor Plane still
nearly vanishes on a single line, Phrase Morph mid-transition
overlaps unmeasured. Round 7 adds trust, not motion.

**What would move this up one point:** a timing editor
(curves you can see and shape), springs whose stiffness
reads as frequency, and Ink Pen that actually writes along
a stroke.

## 2. Typographic Quality — 8.5 (was 8.5)

**Evidence.** No typographic change in Round 7: no preset
pads, truncates or replaces user text, and the glitch
estimate models render without changing it. The Round 6
typographic state stands — Star pile, Fill seam pile and
Draw On grazes gone or sub-pixel, proportions preserved by
the fits.

**Against (and why not 9).** Unchanged from Round 6: Loop's
two real overlaps (N–M 16.82 px is not a graze), Draw On
smoothing cutting corners (lane deviation up to ~2.9 × capH
at a sharp point), Spiral shrinking without a floor, the
Stack descender dispute unresolved, OpenType thin
(tnum/pnum/lnum only), emoji grey squares in Particles —
and, decisively, every type judgement here is still on
fallback fonts. The glitch estimate's own numbers will
shift with real faces (its stroke factor is nominal, not
per-face), which is one more reason a 9 cannot rest on
this round's evidence.

**What would move this up one point:** a font-true visual
pass once fonts load, a Loop lane/size decision, a Spiral
minimum-size/overflow policy, and real OpenType coverage.

## 3. Path Control — 8.5, provisional (was 8.5)

**Evidence.** No path change in Round 7. The Round 6 state
stands: fit complete across all three Path Flow modes on
closed lanes, Draw On at its honest floor on 20 of 22
shapes.

**Against (and why not higher).** Unchanged from Round 6:
still no direct-manipulation bézier editor (anchors,
handles, add/delete points), no freehand drawing, no path
morphing with numeric control, no editable path-key times
(fixed equal shares), and it was not hand-tested here,
hence provisional. Loop overlaps, the Frame horizontal
clamp decision and untrimmed seam folds in `offset()`
remain open.

**What would move this up one point:** a real bézier
editor with undo, a decided Frame horizontal clamp, and a
Loop lane/size fix — plus editable path-key timing.

## 4. Creative Range & Originality — 8.5 (was 8.5)

**Evidence.** Library unchanged in count (41 presets /
16 templates); Round 7 adds no preset, template, remix
path or combinable-effects system, and this band is not
credited for work it did not do.

**Against (and why not 9).** Unchanged from Round 6:
long-text fragility at the edges (Spiral's no-floor shrink,
orbit-badge core crowding, kaleido-window densifying), no
signature identity beyond the catalogue, no remix/discover
path, no combinable effects.

**What would move this up one point:** a remix/discover
path (one-click surprising recombinations), combinable
effects, and fit-sizing for the long-text edge cases.

## 5. Export & Embed — 8.5 (was 8.5)

**Evidence.** Round 7 genuinely improves this band: the
export gate can no longer be bypassed by a failed check,
and the unknown gate's Retry path is a real user-facing
improvement over a warning. The measured over-limit
confirmation path survives (studio export section passing),
and the glitch estimate is no longer a flat lie.

**Against (and why not 9).** The gate is still
confirm-to-export for measured over-limit scenes: one
click still exports an 8/s scene. The estimate-alone
fallback still misses rate-8 glitch-drop (3 is not > 3),
the no-checker branch still confirms away on estimates,
and there is still no iframe/web-component route for
uploaded fonts. No new export format, resolution or
frame-accurate offline render path arrived. One real gate
fix does not outweigh three remaining gate holes plus a
missing embed route.

**What would move this up one point:** a hard block (or a
justified, logged override) for over-limit exports, an
estimate that actually flags rate-8 glitch, an
uploaded-font embed route, and a frame-accurate offline
render verified against preview.

## 6. Studio UX & Visual Design — 8.5, provisional (was 8.5)

**Evidence.** The unknown gate is a UX improvement in its
own right: "flashes could not be checked" with a Retry
button says what is wrong and what to do, where the old
warning said only that something could not be checked
while letting the export proceed. The gate box is now the
authoritative blocker in the export dialog, which is
clearer than a note doing that job.

**Against (and why not 9).** Unchanged from Round 6
otherwise: Spring-tab commit-at-once with no Esc revert,
blank track matte with no hint, no per-preset degradation
guidance (Spiral at extreme length, Paper Column's
flattened depth, single-line Floor Plane, Loop's overlap,
Frame at large size), gate uncheck-reblocks and
close/reopen-clear paths still not in `tests/studio.mjs`,
hover + scrub together not spelled out. No
keyboard/focus/contrast audit was run, hence provisional.

**What would move this up one point:** fix the Spring-tab
commit and blank-matte hint, add degradation guidance per
preset (including Loop and Frame-at-large-size), and
complete a keyboard/focus/contrast audit.

## 7. Performance & Robustness — 8.5 (was 8.5)

**Evidence.** Round 7 closes the one robustness hole I
named in Round 6 as still open in `flashes()` itself: an
unnormalised scene can no longer allocate ~166 MB or take
~10× longer, because the guard throws before allocation.
Normalised scenes are bounded (3600 frames, ≈16.6 MB
series) and now that bound is enforced, not assumed.
The unknown gate also makes the export path robust to
transient check failures instead of silently proceeding.

**Against (and why not 9).** The cost side moved not at
all: my re-measurement puts a 60 s check at 16.8–41.6 s
in-page, and Round 7 adds no debounced/cached studio
check, no streaming transition-state pass, and no split
preset/template frame budget calibrated on real hardware.
A cached safe measurement is still honoured after a later
transient failure. The 200 ms frame-cost budget is still a
guardrail, not a performance claim (glitch-drop at ~132 ms
is ~7.5 fps at 1080p), and mutation catch (8/23) is
unchanged.

**What would move this up one point:** a debounced/cached
studio flash check, a streaming transition-state pass or
in-function normalisation for the remaining malformed
inputs, a split preset/template frame budget on real
hardware, and a glitch-drop cost pass.

## 8. Engineering Quality — 8.5 (was 8.5)

**Evidence.** Round 7's engineering is principled and
well-documented: rejection over silent normalisation is
the right call for a safety function and is argued, not
just implemented; the unknown gate is a distinct state
rather than a flag bolted onto the over-limit gate; the
glitch notes name every residual error (intensity-only
model, nominal stroke factor, unmodelled red flashes,
unprobed multi-cycle scenes) instead of burying them; and
no detector or threshold was weakened to make a test pass.
Scopes were honoured — only the claimed files changed in
this round's own diffs.

**Against (and why not 9).** The codebase-wide hygiene gaps
are untouched: `SEPARATORS` still copied across presets,
`stack.js` still reaches the private `f._font`, the
no-mutation contract behind the renderer token optimisation
is still unenforced, and mutation catch is still 8/23. The
tree is still uncommitted and dirty across agents, so a
reviewer cannot cleanly attribute this round from
`git diff` alone (Round 6 hunks sit in the same diffs).
Minor, carried from Round 6: `maxFrames` is still silently
ignored rather than deprecated with a warning.

**What would move this up one point:** deduplicate the
shared preset helpers, remove the private-field reach,
enforce the no-mutation contract (or test it), deprecate
`maxFrames` loudly, and land the round in clean,
attributable commits.

## Round 6 blockers re-checked (current tree)

| Round 6 blocker | Status now |
|---|---|
| Long-loop 900-frame cap / 15 Hz strobe passes at 0/s | **Fixed (Round 6), unchanged by Round 7** — 3600 frames, 15/s, fails (re-measured) |
| `flashes()` unbounded for unnormalised scenes | **Fixed** — rejects before allocation, bounds enforced (diff-audited) |
| Export proceeds on a failed flash check | **Fixed** — unknown gate blocks with Retry, switch hidden (diff-audited) |
| Glitch `flashes()` estimate returns 0 | **Narrowed, not closed** — 3 vs measured 3.5/s at rate 8; still not > 3, so estimate-alone fallback still misses it |
| Glitch render guard (`clock()` 12% gate) | **Still broken in this regime** — recorded, out of scope, needs a render fix |
| Long-loop wall time (~21–29 s measured) | **Unchanged, worse here** — 16.8–41.6 s in my re-run; no debounce/cache added |
| Export hard-block vs confirm-to-export | **Still undecided** — measured over-limit and no-checker paths still confirm away |
| Draw On Loop overlaps | **Unchanged** — per-glyph 2, N–M 16.82 px; needs lane/size decision |
| Frame horizontal clamp | **Open by decision** — 0 at 65 px, ≤ 5.4 px at 108 px; guard form undecided |
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
   fix the glitch estimate to actually flag rate 8 (or
   repair the `clock()` guard so the render itself slows),
   add the uploaded-font embed route, and debounce/cache
   the studio flash check so a 60 s loop does not cost
   tens of seconds on every edit. Until then EE, UX and PR
   cannot credibly reach 9.
