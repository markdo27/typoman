# Round 8 — studio flash-check cost: investigation, no code change

## Finding: debounce, cache, supersede, and a checking state already exist

The Round 7 jury's premise — "no studio debounce/cache" — does not
match the code. All four mechanisms live in `Studio.safety`
(`js/studio/inspector.js`, lines 48–174) and were verified
in-browser in the real studio UI (Chromium, counting stub for
`TM.Safety.flashes`, scheduling logic only; readings and
thresholds untouched):

| Mechanism | Code evidence | In-browser result |
|---|---|---|
| Cache by scene JSON | `keyOf()` (JSON of scene, name blanked), `_cache` Map capped at 32 with LRU eviction, `cached()` | Two `check()` calls for the same scene → **1** underlying `flashes()` call |
| Single shared run, stale superseded | `check()`: a run for a different key aborts the previous run's controller; per-caller abort stops a run nobody waits for | `check(B)` then `check(C)` → B rejected `AbortError`, C fulfilled; only **1** `flashes()` call (B was aborted during `TM.prepare`, before any frame was rendered) |
| Debounce after edits | `watch()`: `store.on('change', () => schedule(1500))`; `schedule()` stops the pending timer and aborts the in-flight check; `requestIdleCallback` (1 s timeout), tab-hidden pause, resume on `visibilitychange` | Five rapid `store.update()` edits → **1** check for the final scene; `pending` false afterwards |
| Checking state | `Studio.flashNote` (`js/studio/export-dialog.js` ~line 705): "Checking for flashes…" with spinner, then the result; Motion panel shows a stale/guess state until the exact result lands | Flash note showed "Checking for flashes…" while in flight, then "Flash check passed" |
| Export re-check | Export dialog's `updateGate`/`start()` call `S.check()`, which returns the cached result instantly for an unchanged scene | Unchanged by this round; gate behaviour untouched |

`watch()` was already registered at boot (`safety._watched` true);
the initial background check had settled before counting began.

## What this means for the cost complaint

Scheduling is not the cost problem, and no scheduling change can
fix it: a single 60 s check still renders up to 3600 frames
(14–43 s in-page in this sandbox; the Round 6 long-loop run
here took 3.9–4.9 s per 60 s case for solid-fill strobes).
Debounce/cache already prevent that cost from multiplying per
keystroke or per dialog open. The remaining cost lever is the
per-check render cost itself (engine scope — e.g. analysis
resolution or incremental re-checks), which would trade against
the safety correctness Round 6 just fixed and was deliberately
not attempted here.

## Verification (no code changed, so these confirm the status quo)

- `node tests/flash-long-loop.mjs`: pass (60 s 15 Hz strobe
  3600 frames, 15/s, fail; controls correct).
- `npm run test:studio`: 74 passed, 3 failed — all 3 failures
  are the known sandbox Google Fonts tunnel errors
  (`ERR_TUNNEL_CONNECTION_FAILED` on boot/desktop/phone);
  no other check failed, including the export section.
- `git status`: no file changed by this round. The dirty tree
  is prior rounds' uncommitted work; `js/studio/inspector.js`
  is unmodified.

## Remaining cost gaps (for a future engine-scope round, not studio)

1. One full check is still 14–43 s in-page for a 60 s loop here.
2. Any scene edit invalidates the whole-scene cache key, even
   an edit to a non-visual parameter — a finer cache key could
   reuse results, but only if it provably cannot hide a flash.
3. A cached safe measurement is still honoured after a later
   transient failure (already noted in Round 7).
