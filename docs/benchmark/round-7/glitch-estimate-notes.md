# Round 7 — Glitch `flashes()` estimate notes

Scope: `js/presets/glitch.js` — the `flashes()` method only — and this file.
No commit, no push. `clock()`, `clockFor()`, the preset's params, looks, and
render behaviour are unchanged, so the render still runs at the full glitch
rate in the regime below; this estimate models that render, it does not make
the render match the estimate.

## 1. The Round 5 discrepancy, diagnosed (not taken on trust)

Round 5 (`docs/benchmark/round-5/safety-sharing-notes.md` §1, §6) found the
glitch preset's `flashes()` returning **0** for the glitch-drop layer while
`TM.Safety` measured **3.5/s** at rate 8 (template, whole scene) — and 1/s at
the shipped rate 6. Re-measured before this change, headless Chromium,
`TM.Safety.flashes` on the template scene:

| case | old estimate | TM.Safety |
|---|---|---|
| glitch-drop, rate 8, constant, VHS | 0 | 3.5/s, `ok: false` |
| glitch-drop, rate 6 (shipped) | 0 | 1/s, `ok: true` |
| glitch-drop, rate 4 | 0 | 1/s, `ok: true` |
| default scene, preset defaults (bursts, rate 15) | 0 | 0/s |
| default scene, VHS (constant, rate 12) | 0 | 0/s |
| default scene, Signal Lost (bursts, rate 18) | 0 | 0/s |
| default scene, Acid Print (bursts, rate 15) | 0 | 2/s |
| VHS look alone, 9:16, size 0.3, rate 8 / 6 | 0 / 0 | 3/s / 1/s |

Root cause is the gate in `clock()`, which `flashes()` used to return
verbatim: it returns rate 0 unless the type's ink is at least **12 % of the
whole frame** and high-contrast. Glitch-drop's ink is **6.56 %** of the frame,
so the gate fails — for every case above, including the safe defaults (2.36–
3.44 %). But `TM.Safety` does not count over the whole frame: it counts in a
10° field, a third of the frame by a third. Glitch-drop's ink, concentrated
in its 936 × 536 box on a 1080 × 1920 frame, covers **96 % of a field**
(`K.fieldShare`), so a glitch frame can be a large field transition even
though the ink is only 6.6 % of the frame. The 12 % whole-frame gate is
simply the wrong denominator for this preset. (The same gate also fails in
`clockFor()`, which is why the render is *not* slowed in this regime — the
guard that would cap the rate at ~2.5/s never engages. Fixing the guard in
render is out of this round's scope; see §5.)

## 2. The new estimate (formula)

`flashes()` now has two branches, both inside the method:

1. **Old-gate branch, preserved.** If ink ≥ 12 % of the frame *and*
   `K.swing(1, …)` passes, it returns `clock(...).rate` exactly as before.
   There the render's clock really is slowed, so the guarded rate is the
   right estimate. In practice this branch did not trigger in any probe
   below — fitted layouts cap the measured ink fraction around 7 % even at
   type size 0.6 — but it is kept so behaviour in that regime is unchanged
   rather than re-derived.
2. **Step-model branch (the fix).** Otherwise, if `K.swing(fieldShare, …)`
   fails — low-contrast type, whatever its size — return 0. If it passes:
   - Replay the render's own seeded intensity, one value per glitch step
     (`steps = round(rate × dur)`), exactly as `render()` computes it:
     constant mode `0.3 + 0.7 × rnd(901, step)^2.2`; bursts mode the burst
     envelope (`srand(b, 902)`, `rand(b, 903)`, `rnd(904+b)`); plus the in/out
     flicker windows when timing is not `loop`; all multiplied by
     `intensity`. No template name, text, or look is consulted — only the
     layer's own params, layout, and frame, via `K.frameOf()`, the same
     entry other presets' `flashes()` methods use.
   - Scale each step value by `amp = min(1, 0.1 × sizePx × 24 / W)`.
     A `TM.Safety` cell is a frame/24 wide, so a nominal 0.1-em stroke
     covers that fraction of a cell. Glitch-drop is 7.2 cells/em → amp
     ≈ 0.72 (capped by the same formula's shape, effectively near-full
     strength); the default scene is 2.2 cells/em → amp ≈ 0.22. This is
     the term that separates the default VHS look (rate 12, constant,
     measured 0/s) from glitch-drop at rate 8 (measured 3.5/s): same mode,
     very different size in Safety cells.
   - Count Safety-style turns on the scaled sequence: a move of at least
     **0.1** (Safety's luminance delta) from the last extreme followed by
     a reversal, walked twice so the loop seam counts, in the worst
     **1.06 s** window (as `K.flashRate` does), halved. The result is in
     0.5/s steps, like the other presets' rates.

## 3. After: estimate vs measured

Same harness as §1, after the change. Measured values are unchanged in
every case — render was not touched, so this is a check that the estimate
moved and the picture did not:

| case | new estimate | TM.Safety | verdict |
|---|---|---|---|
| glitch-drop, rate 8, constant, VHS | **3** (was 0) | 3.5/s, `ok: false` | non-zero, close, but see §5: 3 is not > 3 |
| glitch-drop, rate 6 (shipped) | 2 (was 0) | 1/s, `ok: true` | low, conservative by 1 |
| glitch-drop, rate 4 | 1 (was 0) | 1/s, `ok: true` | exact |
| default scene, defaults | 1 (was 0) | 0/s | low |
| default scene, VHS | 0 (was 0) | 0/s | exact |
| default scene, Signal Lost | 2.5 (was 0) | 0/s | low, but the closest safe case to the limit |
| default scene, Acid Print | 1 (was 0) | 2/s | low, under by 1 |
| VHS alone, 9:16, size 0.3, rate 8 / 6 | 3 / 2 (was 0 / 0) | 3/s / 1/s | rate-8 exact for the glitch layer alone; the whole-template 3.5/s includes the caption/grain |
| extra probe: big bursts, rate 18, intensity 0.95, size 0.3 | 3 | 2.5/s | low, close |
| extra probe: glitch-drop text, size 0.16, rate 8 | 1 | 0/s | low |
| extra probe: huge, size 0.6, rate 15, constant | 5 | 3/s, `ok: true` | **overestimates** — false over-limit flag at this extreme, see §5 |
| edge probes (no Safety run needed) | low-contrast rate 8 → 0; intensity 0 → 0; empty text → 0; fastFlash on, rate 8 → 3 (unchanged, correct: the render's guard never engaged here anyway) | — | no crashes, no new flags |

Safe glitch looks do not suddenly report over-limit estimates: every
default-scene look is ≤ 2.5/s. The shipped template stays low (2/s).

## 4. Verification

- `node --check js/presets/glitch.js` passes.
- The harness above is a temporary Playwright script in `/tmp` (not a repo
  test file): it serves the repo over local HTTP, loads `index.html`, and
  calls the preset's `flashes()` and `TM.Safety.flashes` on the same
  normalised scenes. It was run before and after the change; measured
  values match Round 5's probes (3.5/s at rate 8, 1/s at rate 6) and are
  identical before/after, confirming render is untouched.
- Sandbox limit, stated honestly: Google Fonts do not load in this sandbox
  (tunnel failures, as in Round 5), so all measurements here are with
  fallback fonts. Type metrics — and therefore ink fraction, field share,
  and the step model's size scaling — will shift slightly with the real
  Space Grotesk / Rubik Mono One / Archivo Black faces. The direction of
  the fix (field share, not whole-frame ink) does not depend on the font,
  but the numbers above should be re-checked in a real-font run before
  the estimate is trusted for export gating.
- `git diff --stat` for this round's own change is `js/presets/glitch.js`
  (94 insertions, 1 deletion, all inside `flashes()`) plus this notes file.
  The working tree already contained unrelated dirty files from other
  agents when this round started (boot, engine, other presets, studio,
  templates, tests, workflows — the same situation Round 5 recorded), and
  none of those were touched here; a bare `git status` therefore shows
  more than this round's files. Nothing was committed or pushed.

## 5. Remaining estimate gaps (not hidden)

1. **The rate-8 estimate is 3, not > 3.** `Studio.flashRisks` flags only
   rates above the 3/s limit, so a surface that trusts the estimate alone
   (the export/share dialogs' fallback when `TM.Safety` is unavailable)
   would still not flag glitch-drop at rate 8, even though the estimate is
   no longer 0 and is directionally right (3 > 2 > 1 across rates 8/6/4).
   `TM.Safety` remains the source of truth; closing this last 0.5/s would
   need a model of the per-step slice/block/swap re-rolls (see §5.2), not
   a rounding tweak, and none was invented here.
2. **Only plate intensity is modelled.** Each glitch step also re-rolls
   slice positions, block dropouts, RGB-split direction, and glyph swaps,
   all of which move field luminance independently of plate intensity.
   That is most of the residual error: it explains the 3 vs 3.5 gap at
   rate 8, the 1 vs 2 gap for Acid Print, and the 5 vs 3 overestimate at
   huge size/rate 15, where the step count (60) lets the intensity-only
   turn count run past what rendered damage actually produces. The
   estimate is a calibrated proxy, not a pixel simulation, and must not
   be quoted as a measurement.
3. **The 0.1-em stroke factor is nominal.** It is a mid-weight value, not
   fitted to the 3.5/s reading and not measured per face: heavy faces
   (Archivo Black, Rubik Mono One) will read a little low, light faces a
   little high. The field-share gate, not this factor, is what keeps
   low-contrast and tiny type at 0.
4. **Render guard still broken in this regime (out of scope).** Because
   `clock()`'s 12 % gate fails for fitted headlines, `clockFor()` runs
   glitch-drop at the full rate even with `fastFlash` off, and the
   template stays safe only because its rate was lowered to 6. The honest
   long-term fix is to repair that gate in `clock()` (field share, not
   whole-frame ink) so the guard actually slows the render — but that
   changes render behaviour and was explicitly out of this round's scope,
   so it is recorded here for a later round instead of smuggled in.
5. **Red flashes are not modelled.** The estimate counts general
   luminance turns only; a saturated-red glitch (palette split on a red
   face, for example) would need the red series `TM.Safety` counts
   separately. All probes above measured red 0/s.
6. **Multi-cycle scenes** use `fr.dur` for the step count and `fr.pass`
   for turn times, following `clock()`'s convention; this was not probed
   with cycles > 1 and should be checked if a cycling glitch layer is
   ever gated on the estimate.
