# TYPOMAN Round 6 — Long-loop flash safety fix

**Agent:** Round 6 safety agent. **Scope kept, no exceptions:** only
`js/engine/safety.js`, `tests/flash-long-loop.mjs`, and this note were touched.
No preset, studio, template, other test, or workflow file was edited. Nothing
was committed or pushed.

## The blocker (Round 5 jury median 8.2/10)

All three Round 5 judges named the same blocker: long-loop flash safety.
`TM.Safety.flashes()` capped analysis at 900 frames, so a 60 s loop at 60 fps
was sampled at 900 / 60 = 15 fps (Nyquist 7.5 Hz). A 15 Hz full-frame strobe was
sampled at exactly its own rate, every analysed frame saw the same phase, and
the detector reported 0 flashes/s, `ok: true` — a strobe five times the WCAG
2.3.1 limit of 3/s passed. Reproduced before any change (baseline run of the
old `tests/flash-long-loop.mjs`, 6.6 s total):

| Case | Before (capped) | After (full rate) |
|---|---|---|
| 60 s @ 60 fps, 15 Hz strobe | 900 frames, 15 fps analysis, **0/s, ok: true** | 3600 frames, 60 fps analysis, **15/s, ok: false** |
| 60 s @ 60 fps, 4 Hz strobe (control) | 900 frames, 4/s, ok: false | 3600 frames, 4/s, ok: false |
| 2 s @ 60 fps, 15 Hz strobe (control) | 120 frames, 15/s, ok: false | 120 frames, 15/s, ok: false |
| 60 s @ 60 fps, 15 Hz saturated-red strobe | (not previously tested) | 3600 frames, 15/s general, **15/s red**, ok: false |
| 4 s @ 60 fps, seam pulse (white on frame 0 only) | (not previously tested) | 240 frames, **1/s, ok: true** — the seam rise counts |
| 4 s @ 60 fps, 15 Hz strobe (timing anchor) | 240 frames, 15/s, ok: false | 240 frames, 15/s, ok: false |

Short loops are unchanged by construction: the transition counting
(`transitions`) and worst-field counting (`worstField`) are untouched, and for
any loop of ≤ 900 frames the frame count `n` is exactly what it was before.
Only loops that previously hit the cap change, and they change from aliased to
true-rate readings.

## Slicing design (js/engine/safety.js)

- **No cap, ever.** `n = round(duration × fps)` — the scene's full frame
  rate. The old `opts.maxFrames` is deliberately *ignored*, not honoured with a
  higher default: any downsampling below the scene rate reintroduces aliasing
  above the new Nyquist limit, and a safety function must not offer a caller
  the option to alias. The only in-tree caller that passed it,
  `tests/smoke.mjs` templates with `maxFrames: 240`, is unaffected: those are
  4 s loops at 60 fps, i.e. exactly 240 frames at full rate (verified: smoke
  "starter templates: ok").
- **Render in time slices.** The loop renders in slices of 240 frames (4 s at
  60 fps). Each slice's per-cell luminance/red values are accumulated into the
  preallocated series (one row of `n` frames per cell, same layout as before);
  the analysis (transitions, worst field) runs once over the complete series,
  so cyclic seam handling and red-flash counting are the same code paths as
  before — only the frame count grew.
- **Yielding, kept and strengthened.** The existing `yieldMs` yield (default
  4 ms of work) still fires inside a slice, and the page now also yields at
  every slice boundary even if a caller passed a large `yieldMs`, so a 60 s
  loop cannot hold the studio's event loop for a whole slice's work.
- **Memory is bounded, not unbounded.** A normalised scene is at most 60 s at
  60 fps (`Scene.normalize` clamps duration to 0.5–60 s and fps to
  24/25/30/50/60), so at most 3600 frames: 576 cells × 3600 × 4 bytes × 2
  series ≈ 16.6 MB, plus two Int8 hit arrays of ≈ 2.1 MB each. No array grows
  with anything other than the (known, capped) frame count. See "Remaining
  gaps" for the unnormalised-scene caveat.

## Timing (measured in Chromium in this sandbox, small 24×24-cell analysis)

Two runs of `node tests/flash-long-loop.mjs` (per-case time is measured inside
the page with `performance.now()` and printed by the test):

| Loop | Time |
|---|---|
| 4 s @ 60 fps (240 frames) | 303–372 ms |
| 60 s @ 60 fps, 15 Hz strobe (3600 frames) | 5044–5205 ms |
| 60 s @ 60 fps, 4 Hz strobe (3600 frames) | 4506–4816 ms |
| 60 s @ 60 fps, 15 Hz red strobe (3600 frames) | 4362 ms on the second run (8661 ms on the first, cold run — treated as an outlier, not the headline number) |

So a 60 s check sits right around the 5 s mark in this sandbox: sometimes
just under, sometimes over. Slicing + yielding keeps the page responsive
during it, but does not shorten the wall time — that is inherent to rendering
3600 frames. No downsampling was reintroduced to buy speed back.

## Verification

- `node --check js/engine/safety.js` and `node --check tests/flash-long-loop.mjs`: pass.
- `node tests/flash-long-loop.mjs`: **pass, twice** (22.8 s and 18.1 s total
  including browser startup and all six cases). The old test pinned the
  aliasing and therefore had to be rewritten, not weakened: the 60 s strobe
  case now expects `ok: false` at ~15/s, and the controls, red case, and seam
  case are asserted as in the table above.
- `node tests/flashes-a.mjs glitch strobe-cut`: **all 8 flash readings pass**
  (all ≤ 3/s), but the harness exits non-zero because of 8 console errors,
  all `Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED`. Those are
  sandbox Google Fonts loads failing (see below), not flash failures and not
  caused by this change — `safety.js` loads no fonts.
- `npm run test:smoke` (full): photosensitivity section **ok** (2 Hz strobe
  2/s · 4 Hz 4/s · fast bar 5/s · per-frame 60 fps 30/s) and starter templates
  **ok**. The smoke run as a whole fails in this sandbox only on font
  grounds: "fonts that never load" (the full catalogue, via the same tunnel
  failure), "italic instances or slnt slant broken", and "width axis does not
  change the letterforms" — all downstream of fonts not loading, plus 85
  console errors of the same kind. Google Fonts failing in this sandbox is a
  known, documented sandbox limit (see `tests/frame-budget.mjs`), and the
  long-loop test itself uses solid fills, so its readings are unaffected by
  it. On a machine with font access these failures should be re-checked;
  they are not safety regressions.
- `git status` / `git diff --stat` for the scoped paths show only
  `M js/engine/safety.js`, the rewritten (previously untracked)
  `tests/flash-long-loop.mjs`, and this new note. Other dirty files in the
  tree belong to other Round 6 agents and were not touched. Nothing was
  committed or pushed.

## Remaining safety gaps (reported, not patched — studio/export changes are out of scope)

1. **Unnormalised scenes.** `flashes()` itself does not clamp duration/fps;
  the 3600-frame bound holds only for normalised scenes. A caller passing a
  raw 600 s @ 60 fps scene would allocate ~166 MB of series and take ~10×
  longer. The studio/export callers pass normalised scenes, but a future
  hardening step could either normalise inside `flashes()` or switch to a
  streaming transition-state pass (two deterministic render passes, no series
  storage — rendering is deterministic by design, see `js/engine/core.js`).
  That was considered for this round and deferred: it doubles render cost
  and any state-machine rewrite risks the exact short-loop readings this fix
  deliberately preserved.
2. **Wall time for very long loops.** ~5 s for a 60 s check is acceptable for
  an export gate but noticeable if the studio re-runs it on every edit; if
  that becomes a complaint, the fix belongs in the studio (debounce/cache),
  not in downsampling the detector.
3. **Spatial resolution is unchanged.** Analysis stays at 24×24 cells with
  the 10° field stepped every 2 cells, per WCAG: a flash covering less than
  25% of any 10° field still passes by design. That is the WCAG definition,
  not a hole introduced here.
4. **Font-dependent readings in this sandbox use fallback fonts** (Google
  Fonts unreachable), so text-preset flash rates measured here are
  provisional until re-run with fonts available. The solid-fill long-loop
  readings are not affected.
