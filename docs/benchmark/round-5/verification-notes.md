# TYPOMAN Round 5 — Verification Notes

**Agent:** Round 5 verification (not a product agent). **Scope kept, no exceptions:**
edited only `.github/workflows/test.yml`, added `tests/flash-long-loop.mjs` and
`tests/frame-budget.mjs`, and wrote this file. No preset, engine, studio,
template, boot or export code was edited; no file was committed or pushed.
`pages.yml` was read and left untouched — it deploys the static site and no
test step belongs there. Product bugs found below are **reported, not fixed**.

**Baseline for every measurement here:** headless Chromium 141.0.7390.37 via
Playwright 1.56.1, Node (sandbox), software raster. Google Fonts fail in this
sandbox (`ERR_TUNNEL_CONNECTION_FAILED`, 0/60 catalogue fonts in smoke), so
every browser measurement below ran on fallback fonts, exactly as in the
Round 4 creative-technologist judging. Font-dependent claims (true italics,
width axis, Axis Drift weight breathing, and whether the cylinder Neon Drum
flash failure below reproduces on real fonts) are **unverified here, not
disproven and not confirmed**.

**Pre-existing tree state (not mine):** when this verification started, the
tree was already dirty (`js/boot.js`, `js/engine/path.js`,
`js/engine/renderer.js`, `js/templates/templates.js` modified; `docs/benchmark/round-4/`
and 8 new presets untracked). Further files changed during this session from
parallel Round 5 work; none of them were touched by this agent. The scoped
diff for this agent is therefore: `test.yml` modified, `tests/flash-long-loop.mjs`
and `tests/frame-budget.mjs` added, this file added — nothing else.

## 1. flashes-a is now in CI (Round 4 gap: "flashes-a is still not in CI")

**Change — `.github/workflows/test.yml`, new `flash` job, matching the five
existing jobs step for step** (checkout, Node 22, `npm install`, Playwright
Chromium install, 15-minute timeout, parallel with the other jobs):

```yaml
- run: npm run test:flash        # = node tests/flashes-a.mjs all
- run: node tests/flash-long-loop.mjs
```

No existing job was changed and no existing test was weakened or deleted.

**Sandbox run — `node tests/flashes-a.mjs all`, 2 m 22 s wall (mostly font
timeouts; ~5 s user CPU), exit 1:**

| | |
|---|---|
| Configurations | 176 (41 presets × defaults + looks) |
| Passing | 175 |
| Genuine flash failure | **cylinder · Neon Drum · 16:9: 4/s general, 0/s red** (worst second starts 1.38 s) |
| Font-tunnel console errors | 54 (all `ERR_TUNNEL_CONNECTION_FAILED`, as in smoke/sweep) |

**CI implication, stated plainly:** adding this job does *not* make CI green.
In GitHub Actions, where Google Fonts load, the 54 console errors should
clear — but cylinder Neon Drum at 4/s is a product failure on fallback fonts
that a product agent must confirm on real fonts and then retime or gate; it
is out of this agent's scope to fix. Until then the new `flash` job is
expected to be red on the current tree for that one look. The job timeout
(15 min) is ample against the 2 m 22 s sandbox run, but that sandbox time
is dominated by font-failure waits and is not a CI runtime prediction.

## 2. Long-loop flash aliasing is now pinned in CI (Round 4 gap: 900-frame cap)

**Verified in code — `js/engine/safety.js`, `TM.Safety.flashes()`:**

```js
const n = Math.max(2, Math.min(opts.maxFrames || 900, Math.round(scene.duration * (scene.fps || 30))));
const fps = n / scene.duration; // analysis rate (below the scene's when a long loop is capped)
```

A 60 s loop at 60 fps is therefore analysed at 900 / 60 = **15 fps**, whose
Nyquist limit is 7.5 Hz. Content flashing faster than that aliases instead of
being measured. `safety.js` was **not changed**.

**New test — `tests/flash-long-loop.mjs`** (run by the new `flash` CI job,
after `test:flash`). It registers a full-frame strobe preset (same shape as
smoke's photosensitivity strobe) and reports, for the same strobe, the true
rate, the analysed rate and the reported rate. It exits 0 when the documented
behaviour holds, and exits 1 if the behaviour changes — if a product agent
later analyses long loops in full-rate slices, this test must be updated to
the new behaviour, not weakened.

**Measured (sandbox, 22 s, exit 0):**

| Case | Loop | Analysed frames | Analysis rate | True rate | Reported | Safety verdict |
|---|---|---|---|---|---|---|
| 15 Hz strobe, long loop | 60 s @ 60 fps | 900 (cap hit) | 15 fps | 15/s | **0/s** | **ok = true — ALIASED** |
| 15 Hz strobe, short control | 2 s @ 60 fps | 120 (no cap) | 60 fps | 15/s | 15/s | ok = false |
| 4 Hz strobe, long loop | 60 s @ 60 fps | 900 (cap hit) | 15 fps | 4/s | 4/s | ok = false |

Reading: the aliasing is cap-caused, not detector-caused (the short control
reports 15 Hz correctly), and sub-Nyquist content is unaffected (4 Hz is still
caught at 15 fps analysis). The dangerous case is the first row: a strobe
**five times the WCAG 3/s limit passes the safety check** because it is
sampled at exactly its own rate and every analysed frame sees the same phase.
The test's `ok=true` for that row is the finding, not a clean bill of health
— the output prints it on an `ALIASED` line for exactly that reason.

**Product bug reported, not fixed:** long-loop flash analysis must be done in
full-rate slices (or the cap raised with a documented cost) before PR/EE can
reach 9. Until then, any export or template whose loop exceeds ~15 s at
60 fps (900 frames) has unverified flash safety above 7.5 Hz. Note the
compounding gap: the stock glitch-drop template already measures 3.5/s in
smoke (see §5), and exports are still not stopped above 3/s — safety is
warned, not enforced, and long loops are additionally aliased.

## 3. Per-preset / per-template 1080p frame-cost budget (Round 4 gap: no budget in CI)

**New test — `tests/frame-budget.mjs`** (new `budget` CI job, same job shape
as the others, 15-minute timeout; sandbox runtime ~52 s). Method, chosen
after two measurement mistakes that are documented here so they are not
repeated:

- **Pixel-normalised 1080p:** every scene is scaled, at its own aspect, to
  the same pixel count as smoke's 1920×1080 (2,073,600 px) — 16:9 → 1920×1080,
  9:16 → 1080×1920, square → 1440×1440, 4:5 → ~1288×1610. The first draft
  scaled by long side (1920 px) instead, giving square scenes 1920×1920
  (3.69 Mpx, 78% more pixels) and failing logo-sting (115/124 ms) for pixel
  count alone; that draft was corrected, not shipped.
- **Median, not mean:** each item gets 3 warm-up renders, then the median of
  20 timed frames (smoke's frame count). A 10-frame mean proved unusable in
  this sandbox: one preset moved from 17 ms to 60 ms between runs on a single
  GC/JIT spike. The median is stable across runs (see variance note below).
- **Re-measure on over-budget:** an item over budget is measured a second
  time and fails only if both passes exceed the budget. Render warnings
  (`r._warned`) fail, as in smoke.

**Threshold — 200 ms/frame (median, both passes), overridable via
`TYPOMAN_FRAME_BUDGET_MS`.** Calibration, in order:

1. A 100 ms draft failed current code on glitch-drop alone (median
   108.8 ms, re-measure 122.15 ms). Per the Round 5 brief, a guardrail must
   not fail on the tree it protects, so the threshold was raised.
2. 200 ms is ~5× the worst preset mean ever observed on a software raster
   (smoke this run: 6.35–30.86 ms, worst strobe-cut; Round 4 judge:
   7.66–41.06 ms, worst tunnel) and ~1.5× the worst template median observed
   (glitch-drop 132.35 ms in the passing run; see variance note). It fails
   only at < 5 fps — an egregious regression, not a 60 fps claim. 200 ms is
   **not** "fast": even the fastest preset here (~5.5 ms median) is only
   ~3× inside a 16.7 ms 60 fps frame on this raster, and a real 60 fps claim
   still needs a hardware measurement.

**Measured — passing run, exit 0, 57 items (41 presets + 16 templates):**

| Kind | Median range (this run) | Worst |
|---|---|---|
| Presets | 5.55–23.65 ms | zoom-through 23.65 ms; melt 21.00 ms; spiral 20.30 ms |
| Templates | 17.85–132.35 ms | **glitch-drop 132.35 ms**; youtube-intro 91.80 ms; hero-sequence 77.35 ms; story-pop 73.05 ms; logo-sting 71.10 ms; kaleido-window 69.05 ms |

**Variance warning (why the threshold is loose):** template medians move
materially between runs in this sandbox — glitch-drop medians of 108.8 ms
and 132.35 ms, means up to ~156 ms; preset worst medians of 16.55 ms and
23.65 ms across runs. A tighter budget, or separate preset/template budgets,
needs a hardware baseline and a variance study on CI runners first; that is
a remaining gap, not something this round's data supports. Costs are also
fallback-font costs: a real-font run may cost more.

## 4. The sweep "22 problems" confusion — resolved, no code change

**What the sweep counts — read from `tests/sweep.mjs` (and
`tests/lib/harness.mjs`), not from its verdict line:**

- `problems[]` gains an entry for, per configuration: a scene-build or render
  throw, a determinism failure (`detReuse`/`detFresh` max channel difference
  > 0), or a **dense** seam failure.
- **Separately, and this is the part that is misread:** after each preset or
  template, the sweep pushes *one* problem entry per item that produced
  ≥ 1 console error during its slice (`log.mark()` / `log.since(mark)` in
  the harness), phrased as "`<id>: N console error(s): <first 3>`" — one
  entry no matter how many errors that slice produced.
- **Seam failures are narrow by design.** The screen samples 8 ordinary steps
  plus the two steps either side of the seam; dense re-measurement (every
  frame of the loop) runs only if the item is not exempt, the seam exceeds
  `SEAM_MIN` = 0.3% of full scale, and the screen ratio exceeds 1.5×. A
  failure needs the *dense* ratio above `SEAM_RATIO` = 2× **and** the seam
  above 0.3%. Screen flags that clear on dense re-measurement are printed
  as notes ("Re-measured against every step (not failures)"), never as
  problems. Exempt items (16 in this run: every preset whose timing is
  `in` — "In → Hold" — because they pop at the loop by design) never fail
  the seam check at all. The table's "worst seam×" column is a screen ratio
  unless a dense value exists; on its own it is **not** a failure.

**Reproduction — full sweep this round, `node tests/sweep.mjs`, 23.9 s,
exit 1:**

- 602 configurations (41 presets, 16 templates), 16 exempt, 0 render errors,
  0 determinism failures, **0 seam failures**.
- `problems[]` = **22 entries**: 21 presets + template logo-sting, every one
  a console-error entry, every error a Google Fonts tunnel failure
  (`ERR_TUNNEL_CONNECTION_FAILED`). The 22 entries collapse **53 console
  error events** (e.g. path-flow 6, axis-wave 12, rise 4, stack 4, flip 3;
  full per-item counts are in the sweep log). The count is slice-attributed,
  not a count of distinct errors or of fonts: which fonts first fail in
  which slice depends on fetch order and caching, so 22 is not a stable
  product metric — in a real-font run it should be 0 if nothing else fails.
- The verdict then prints **24 FAIL lines**: the 22 problem checks, plus the
  summary check ("every configuration …: 22 problem(s)") and the separate
  "no console errors" check. The summary line "0 passed, 24 failed" counts
  check calls, not problems.

**That resolves the 22-vs-24 discrepancy:** "22 problems" = `problems[]`
entries; "24" = FAIL lines including the two summary checks. The Round 4
creative-technologist file's "24 problems" is the FAIL-line count, not a
different run. **There were no seam problems in this run, and "22 seam
problems" must not be carried forward:** the only dense-cleared notes are
glitch-drop as built (screen 2.96× → dense 0.83× over 239 steps) and
glitch-drop with your text (screen 3.48× → dense 0.77×).

**Axis-wave 4.24×, specifically:** in both the full run and a single-preset
run (`node tests/sweep.mjs axis-wave`), axis-wave's table worst is 4.24× at
"loop length 2.7 s" with **no** dense note and **no** problem entry. Under
the code above, a dense run always produces a note (cleared) or a problem
(failed); its absence proves dense never ran for that configuration, which
given a 4.24× screen ratio leaves only the seam floor: the absolute seam
must be ≤ 0.3% (invisible whatever the ratio), so it is neither a failure
nor a dense-cleared case in this run. The Round 4 description of this case
being "cleared by dense re-measurement" could not be reproduced here —
fallback rendering may move the seam across the 0.3% line between runs —
but on either reading it is not a seam failure.

**Decision:** `tests/sweep.mjs` pass/fail logic was **not changed**. Its
counting is not demonstrably wrong; it is misreadable, and the fix is this
documentation. If a future round wants the verdict to be less misreadable,
the candidate change (not made here) is to report console-error problems
separately from render/determinism/seam problems in the verdict, not to
alter the thresholds.

## 5. Verification runs (this environment only)

| Suite | Command | Result |
|---|---|---|
| Smoke (baseline, pre-existing) | `node tests/smoke.mjs` | Exit 1 — starter templates FAIL glitch-drop 3.5/s; italics/width FAIL as font artefacts (0/60 fonts); 85 console errors (font tunnel). All 41 presets deterministic, edge cases ok, safety detector ok. Preset 1080p means 6.35–30.86 ms. |
| Sweep (full) | `node tests/sweep.mjs` | Exit 1 — 602 configs, 22 console-error problems, 0 seam / 0 determinism / 0 render problems (see §4). |
| Sweep (axis-wave only) | `node tests/sweep.mjs axis-wave` | Exit 1 — 22 configs, 1 problem (17 console-error events), no seam note or problem. |
| Flash (all) | `node tests/flashes-a.mjs all` | Exit 1 — 175/176 ok; cylinder Neon Drum 4/s; 54 font console errors (see §1). |
| Flash long-loop (new) | `node tests/flash-long-loop.mjs` | **Exit 0** — aliasing pinned as documented in §2. |
| Frame budget (new, 200 ms) | `node tests/frame-budget.mjs` | **Exit 0** — 57/57 within budget, worst glitch-drop 132.35 ms (see §3). |
| Frame budget (100 ms draft) | `node tests/frame-budget.mjs` (draft) | Exit 1 — glitch-drop only, both passes over budget; threshold raised per §3. |
| Syntax / workflow | `node --check` on both new tests; YAML parse of `test.yml` | Pass. |

**Not run here, and not claimed:** GitHub Actions itself (cannot run in this
sandbox — the new jobs are syntax-checked and their local runtimes are
2 m 22 s + 22 s for `flash` and ~52 s for `budget`, both well inside the
15-minute timeouts, but CI runner hardware and font loading differ); the
export, embed and studio suites (untouched by this round's scope, held from
Round 4); the mutation suite (Round 3 catch 8/23, unchanged).

## 6. Product bugs found, reported — not fixed (out of scope)

1. **Cylinder · Neon Drum look flashes 4/s** (flashes-a, fallback fonts) —
   needs real-font confirmation, then retiming or gating.
2. **Glitch-drop template flashes 3.5/s** (smoke, pre-existing) and is the
   most expensive template at 1080p (median up to 132 ms) — a stock starting
   point that is both non-compliant and the heaviest.
3. **Long-loop flash aliasing (§2):** a 15 Hz strobe passes at 0/s on a
   60 s loop; any > 7.5 Hz content in a > 900-frame loop is unverified.
4. **Exports are still not stopped above 3/s** (Round 3 bug 9, unchanged) —
   combined with (1) and (2), a user can export a non-compliant file from
   stock content. No export code was touched here.

## 7. Remaining verification gaps (for the next round)

- **Real-font CI run:** italics, width axis, Axis Drift weight breathing,
  and the cylinder Neon Drum failure all need fonts that actually load.
  Until then, font-dependent claims have no passing evidence anywhere.
- **CI itself:** the `flash` and `budget` jobs have never run on GitHub
  Actions; the first CI run should be watched for font behaviour and for
  template-cost variance on runner hardware.
- **Per-kind budget tightening:** once CI hardware variance is measured,
  split the single 200 ms guardrail into preset and template budgets (and
  revisit whether the median is the right statistic on faster hardware).
- **Sweep verdict readability:** report console-error problems separately
  from render/determinism/seam problems (candidate change, §4).
- **Unchanged Round 3/4 gaps this round did not cover:** mutation catch
  8/23; no guard for the renderer's no-mutation contract; Gravity
  main-thread re-simulation and slider cost; Deep Space `_adapt` timing;
  path residual overlaps and the Path Flow Star pile-up; dead studio
  controls; keyboard/accessibility audit.
