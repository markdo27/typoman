# TYPOMAN Round 5 — Cylinder · Neon Drum flash fix

**Agent:** Round 5 flash-fix (not a verification agent). **Scope kept, no exceptions:**
edited only `js/presets/cylinder.js` (one param on one look) and wrote this file.
No other preset, engine, studio, template, test, or workflow file was edited.
Nothing was committed or pushed.

## Problem

Round 5 verification (`docs/benchmark/round-5/verification-notes.md` §1, §6.1)
reported, from `node tests/flashes-a.mjs all` (176 configurations, 175 passing):

| Configuration | Before |
|---|---|
| cylinder · Neon Drum · 16:9 | **4 flashes/s general, 0/s red — FAIL** (worst second starts 1.38 s) |

The WCAG 2.3.1 limit in `TM.Safety.flashes` is 3/s, general and red.

## Cause, as far as the look's own params explain it

Neon Drum previously set no `spin`, so it inherited the preset default
`spin: 'present'` ("Linger at front"): the drum lingers while the text faces
the camera, then whips round the back. That whip is the fast part of the
motion, and it is where the worst second (1.38 s) sits. The sibling look
Gold Ring, which already sets `spin: 'smooth'` (constant rotation), measured
1/s on the same run — the same drum, the same loop, without the whip.

No change was made to the flash detector, the preset mechanism, the preset
API, or any other look. No global weakening: the fix is one param on this
one look.

## Change

`js/presets/cylinder.js`, Neon Drum look only — added `spin: 'smooth'`:

```diff
- params: { repeat: true, separator: 'dot', back: 'full', shade: 0.75 }
+ params: { repeat: true, separator: 'dot', back: 'full', shade: 0.75, spin: 'smooth' }
```

Everything else about the look is unchanged, so its identity is preserved:
Monoton 400, palette `#ff00e5` / `#00f0ff` / `#faff00`, glow 0.55 in
`#ff00e5`, solid `#07000f` background, `repeat: true` with dot separators,
`back: 'full'`, `shade: 0.75`, and the default 1 turn per loop, radius, tilt
and perspective. What changes is only the spin profile: constant rotation
instead of linger-then-whip. The drum still rotates a full turn per loop;
it no longer accelerates through the back half of the turn.

No intermediate param was needed: the first candidate tried (`spin: 'smooth'`)
already brought the look to 1/s, so no other param (turns, tilt, shade,
back, glow, palette) was touched, and no per-param sweep table exists to
report — there was nothing left to tune.

## Verification (this sandbox)

Baseline reproduced before the change with the same tool:

```
node tests/flashes-a.mjs cylinder
  cylinder  default      16:9  0    0  ok
  cylinder  Gold Ring    16:9  1    0  ok
  cylinder  Neon Drum    16:9  4    0  FAIL (worst second starts 1.38 s)
  cylinder  Paper Column 16:9  2.5  0  ok
```

After the change:

```
node --check js/presets/cylinder.js   # pass (no output)
node tests/flashes-a.mjs cylinder
  cylinder  default      16:9  0    0  ok
  cylinder  Gold Ring    16:9  1    0  ok
  cylinder  Neon Drum    16:9  1    0  ok
  cylinder  Paper Column 16:9  2.5  0  ok
```

So Neon Drum went **4/s → 1/s general, 0/s red**, inside the 3/s limit with
2/s of headroom on the failing configuration. The command still exits 1,
but only because of 8 Google Fonts console errors in this sandbox (see
below) — no cylinder configuration fails the flash limit at 16:9.

Extra aspects, same tool (not the CI configuration, which is 16:9 only):

```
ASPECTS=9:16,1:1 node tests/flashes-a.mjs cylinder
  Neon Drum  9:16  0  0  ok
  Neon Drum  1:1   0  0  ok
```

Sweep row for cylinder:

```
node tests/sweep.mjs cylinder
  17 configurations, 3 looks, deterministic: yes, worst seam 0.99× (Gold Ring)
  No render, determinism, or seam failure.
  Only failures are 5 Google Fonts tunnel console errors (below).
```

## Sandbox font limit, stated honestly

As in the Round 5 verification notes, Google Fonts fail in this sandbox
(`ERR_TUNNEL_CONNECTION_FAILED`, 0/60 catalogue fonts in smoke), so every
measurement above ran on fallback fonts, not on Monoton. The 4/s → 1/s
improvement is therefore confirmed on fallback fonts with the same tool
that reported the failure, exactly as the brief asked — but whether it
reproduces at the same rates on real Monoton glyphs is **unverified here,
not disproven and not confirmed**. The first real-font CI run of the
`flash` job should be watched for this look specifically; the margin
(1/s against a 3/s limit) leaves room, but it is not a real-font proof.

## Remaining flash risk for this look

- **Real fonts:** see above. Monoton is a wide, decorative display face;
  its real glyph widths and the drum radius they force (the drum grows if
  a line would wrap too far round it) could move the rate. Re-measure on
  real fonts before treating this as closed.
- **Other aspects / other text:** the 16:9 CI configuration and the 9:16
  and 1:1 checks above all pass for Neon Drum, but user text, longer
  phrases, and multi-line scenes were not re-measured here; the sweep row
  covers the stock configurations only.
- **Out of scope, deliberately not fixed:** on the extra-aspect run,
  Paper Column at 1:1 measured 3.5/s general, 0/s red (FAIL). That is a
  different look, and this agent's scope forbids touching it. It is
  reported here so it is not mistaken for a Neon Drum regression — Neon
  Drum itself was 0/s at 1:1 — and so a follow-up agent can take it up
  under its own scope. At the CI default aspect (16:9) Paper Column is
  2.5/s and passes.
- **No detector change:** `TM.Safety.flashes` and the 900-frame long-loop
  cap are untouched, so the separate long-loop aliasing finding in the
  verification notes still stands for loops over ~15 s at 60 fps.
