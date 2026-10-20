/* Preset: Sequence — a phrase sequencer. The text plays as shots, one line (or word) each, framed
 * big like a lyric video and cut together with camera moves: push, zoom-through, roll and whip.
 *
 * Craft notes
 *  - Each transition is one camera move shared by the outgoing and incoming shot (the same
 *    eased curve drives both), so it reads as a cut on motion rather than two separate fades.
 *  - A camera moves a shot as one: letters never stagger inside a move, where they would slide
 *    over each other. The stagger only builds the letters in, by opacity, as a shot arrives.
 *  - Zoom-through dives through a real counter of the outgoing shot (the hole of an O, P, A…,
 *    found by rasterising the letter), else a gap between letters, and zooms just past where
 *    the hole swallows the frame. The next shot grows out of the hole, so the frame never fills
 *    with ink. Whip pans carry a velocity-scaled smear; every shot drifts slowly while it holds.
 *  - Shots cycle with the loop and the loop point falls mid-hold on the first shot, so it
 *    always loops cleanly.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { clamp, smoothstep, TAU } = TM.math;
  const MOVES = ['push', 'zoom', 'roll', 'whip'];

  TM.registerPreset({
    id: 'sequence',
    name: 'Sequence',
    category: 'Reveal',
    description: 'Your lines play as big lyric-video shots, cut together with camera moves: push, zoom-through, roll and whip pan.',
    looks: [
      { name: 'Lyric Video', bg: { type: 'solid', color: '#000000' }, post: { grain: 0.22, vignette: 0.3 },
        layer: { font: { family: 'Dela Gothic One', weight: 400 }, fill: { type: 'solid', color: '#ffffff' }, params: { move: 'mix' } } },
      { name: 'Sunset Drive', bg: { type: 'linear', color: '#ff5e5b', color2: '#1b0a2e', angle: 180 },
        layer: { font: { family: 'Tilt Warp', weight: 400 }, fill: { type: 'solid', color: '#ffe3a3' },
          fx: { shadow: { amount: 0.5, angle: 90, distance: 0.015, color: '#1b0a2e' } }, params: { move: 'zoom', drift: 0.8 } } },
      { name: 'Whip Promo', bg: { type: 'solid', color: '#faff00' },
        layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#07000f' }, params: { move: 'whip', stagger: 0.4 } } },
    ],
    params: [
      TM.P.select('split', 'Shots from', [['auto', 'Auto'], ['lines', 'Each line'], ['words', 'Each word']], 'auto', { group: 'Shots', hint: 'Auto: lines when there are several, otherwise words' }),
      TM.P.select('move', 'Camera move', [['mix', 'Mix'], ['push', 'Push'], ['zoom', 'Zoom through'], ['roll', 'Roll'], ['whip', 'Whip pan']], 'mix', { group: 'Shots' }),
      TM.P.range('trans', 'Move length', 0.1, 0.9, 0.01, 0.45, { group: 'Shots', hint: 'Share of each shot spent moving' }),
      TM.P.ease('ease', 'Move curve', 'snap', { group: 'Shots' }),
      TM.P.range('stagger', 'Letter stagger', 0, 0.9, 0.01, 0.25, { group: 'Shots', hint: 'Letters fade in one after another as a shot arrives; the camera always moves a shot as one' }),
      TM.P.select('order', 'Letter order', TM.ORDERS.filter((o) => o[0] !== 'words' && o[0] !== 'lines'), 'start', { group: 'Shots' }),
      TM.P.range('fill', 'Fill the frame', 0, 1, 0.01, 0.75, { group: 'Framing' }),
      TM.P.range('drift', 'Camera drift', 0, 1, 0.01, 0.5, { group: 'Framing' }),
      TM.P.toggle('blur', 'Whip blur', true, { group: 'Framing' }),
      TM.P.toggle('fastFlash', 'Allow fast flashing', false, { group: 'Safety', hint: 'Fast camera moves sweep big strokes across the frame. Off keeps it to 3 flashes per second or fewer (WCAG 2.3.1): letters fade to a safe ghost while they rush past (all but the one a zoom dives through), and zooms that come too fast become pushes' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const shots = K.units(L, splitOf(P, L)).map((u) => {
        // Framing: grow each shot toward filling the frame (capped so one-letter shots stay sane).
        const fit = Math.min((f.W * 0.84) / Math.max(1, u.w), (f.H * 0.58) / Math.max(1, L.capH), 4.5);
        const scale = Math.max(1, 1 + (fit - 1) * P.fill);
        // Portal for zoom-through: a counter near the middle, else a gap between letters.
        const portal = K.portal(f, L, u, true);
        // Zoom for the dive: past the point where the hole (an ellipse) contains the whole frame.
        const need = Math.hypot(f.W / (portal.cw * scale), portal.ch === Infinity ? 0 : f.H / (portal.ch * scale));
        // Letter ranks inside the shot (the build-in order).
        const n = u.glyphs.length;
        const ranks = u.glyphs.map((gi, j) => K.rankOf(f, j, n, P.order));
        return Object.assign(u, { scale, portal, ratio: clamp(need * 1.4, 8, 240), ranks });
      });
      return { shots, plans: new Map() };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.shots.length) return;
      const shots = C.shots, N = shots.length;
      const slot = 1 / N, T = P.trans * slot;
      const ease = TM.ease(P.ease, 'snap');
      const st = P.stagger;
      const cx = f.cx, cy = f.cy;
      const plan = planFor(C, f), moves = plan.moves; // moves[k]: the move into shot k
      const pass = K.passOf(f);
      const moveAt = (b) => moves[((b % N) + N) % N];
      // The build-in: letter windows of length w, spread so the last one ends with the move.
      const w = Math.max(0.12, (1 - st) * 0.5), spread = st > 0 ? Math.min(st, 1 - w) : 0;

      // Each shot, plus its neighbours from the previous/next loop, so the seam is continuous.
      // The schedule starts half a shot in: the loop point (and frame 0) sits in a hold, on a
      // readable shot, rather than in the middle of a fast camera move.
      const p = f.p + slot / 2;
      for (let c = -1; c <= 1; c++) {
        for (let k = 0; k < N; k++) {
          const tau = p + c - k * slot;
          if (tau < -T / 2 || tau > slot + T / 2) continue;
          const shot = shots[k];
          const uIn = clamp((tau + T / 2) / T), uOut = clamp((tau - slot + T / 2) / T);
          const role = uOut > 0 ? 'out' : uIn < 1 ? 'in' : 'hold';
          const move = role === 'out' ? moveAt(k + 1) : moveAt(k);
          // A zoom between two shots dives at the outgoing shot's ratio, for both of them.
          const ratio = role === 'out' ? shot.ratio : shots[(k + N - 1) % N].ratio;
          const life = (tau + T / 2) / (slot + T);
          const drift = 1 + P.drift * 0.09 * (life - 0.5);
          const u = role === 'out' ? uOut : uIn;
          // One camera move for the whole shot.
          const e = role === 'hold' ? 1 : ease(u);
          const m = cam(move, role, e, f.W, ratio);
          if (m.alpha <= 0.002) continue;
          const S = shot.scale * drift * m.scale;
          // Zoom-through: the outgoing shot scales about its portal, which slides to the centre.
          let ax = shot.cx, ay = shot.cy, px = 0, py = 0;
          if (m.portal) {
            const pull = 1 - smoothstep(1, 4, m.scale);
            ax = shot.portal.x; ay = shot.portal.y;
            px = (shot.portal.x - shot.cx) * shot.scale * drift * pull;
            py = (shot.portal.y - shot.cy) * shot.scale * drift * pull;
          }
          const cs = Math.cos(m.rot), sn = Math.sin(m.rot);
          // Whip pans: a speed smear scaled by the move's speed.
          const v = move === 'whip' && P.blur && role !== 'hold' ? clamp(K.slope(ease, u) / 3) : 0;
          // Flicker guard (fast flashing off): letters that would sweep stroke after stroke
          // across the frame fade to a ghost too faint to flash. In a zoom, all but the portal
          // letter once the dive starts, and the next shot until it nears its size; in a whip,
          // the shot while it pans faster than about two letters a second.
          let ghost = 0, keep = null;
          if (plan.ghost < 1 && role !== 'hold') {
            if (move === 'zoom') {
              if (role === 'out') { ghost = smoothstep(1, Math.pow(ratio, 0.08), m.scale); keep = shot.portal.glyphs; }
              else ghost = 1 - smoothstep(Math.pow(ratio, -0.2), Math.pow(ratio, -0.04), m.scale);
            } else if (move === 'whip') {
              const pitch = (shot.w * S) / Math.max(1, shot.glyphs.length);
              const speed = (f.W * 1.15 * K.slope(ease, u)) / Math.max(1e-3, P.trans * (pass / N)); // px/s
              ghost = smoothstep(1.5, 3, speed / Math.max(1, pitch));
            }
          }
          const dim = 1 + (plan.ghost - 1) * ghost;
          for (let j = 0; j < shot.glyphs.length; j++) {
            const g = L.glyphs[shot.glyphs[j]];
            const alpha = m.alpha * (role === 'in' && spread > 0 ? smoothstep(shot.ranks[j] * spread, shot.ranks[j] * spread + w, u) : 1) *
              (ghost > 0 && !(keep && keep.includes(shot.glyphs[j])) ? dim : 1);
            if (alpha <= 0.002) continue;
            const ox = g.cx - ax, oy = g.cy - ay;
            const x = cx + px + m.dx + (ox * cs - oy * sn) * S;
            const y = cy + py + (ox * sn + oy * cs) * S;
            const o = { x, y, rot: m.rot, scale: S, alpha };
            if (v > 0.12) {
              // The glyph stretched along the pan under a softened copy (two draws, no
              // stroboscopic ghosts).
              const len = f.W * 0.16 * v;
              const stretch = 1 + len / Math.max(1, g.w * S);
              f.drawGlyph(g, Object.assign({}, o, { sx: S * stretch, sy: S * (1 - 0.06 * v), alpha: alpha * (0.2 + 0.25 * v) }));
              o.alpha = alpha * (1 - 0.55 * v);
            }
            f.drawGlyph(g, o);
          }
        }
      }
    },

    /** Large-area luminance flashes per second this layer makes (0 when it cannot flash). */
    flashes(layer, scene) {
      const fr = K.frameOf(layer, scene, TM.getPreset('sequence'));
      const N = K.units(fr.layout, splitOf(layer.params, fr.layout)).length;
      return N ? movesPlan(layer.params, N, fr.pass, flashy(layer, scene.bg)).rate : 0;
    },
  });

  function splitOf(P, L) {
    return P.split === 'auto' ? (L.lines.filter((l) => l.glyphs.length).length > 1 ? 'lines' : 'words') : P.split;
  }

  // ── photosensitivity ──
  // Measured with TM.Safety (10° fields). With the flicker guard on, a zoom-through still sweeps
  // the portal letter's strokes across the frame (up to six large transitions in a field, bunched
  // early in the move); a whip, push or roll swaps one shot for the next, one transition.
  // Unguarded, a zoom sweeps its letters (up to eight) and a whip pans stroke after stroke past
  // (up to twelve). With fast flashing off, a zoom that would break three flashes a second
  // becomes a push. Low-contrast type cannot flash.
  const flashy = (layer, bg) => K.swing(1, K.inkColors(layer), K.backdrops(bg));
  const spots = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
  const MOVE_SAFE = { zoom: spots(6, 0.25, 0.5), whip: [0.5], push: [0.5], roll: [0.5] };
  const MOVE_FAST = { zoom: spots(8, 0.25, 0.5), whip: spots(12, 0.1, 0.9), push: [0.5], roll: [0.5] };
  /** The move into each shot, and the flash rate they make. */
  function movesPlan(P, N, pass, canFlash) {
    const slot = 1 / N, T = P.trans * slot, table = P.fastFlash ? MOVE_FAST : MOVE_SAFE;
    const moves = [];
    for (let k = 0; k < N; k++) moves.push(P.move === 'mix' ? MOVES[k % MOVES.length] : P.move);
    if (!canFlash || N < 2) return { moves, rate: 0 };
    const at = (k, us) => us.map((u) => ((k - 0.5) * slot - T / 2 + u * T) * pass);
    // Every move as it would be without zooms (a zoom counted as the push it can become), then
    // each zoom in order, kept where the loop still fits.
    const own = moves.map((mv, k) => at(k, table[mv === 'zoom' ? 'push' : mv]));
    for (let k = 0; k < N; k++) {
      if (moves[k] !== 'zoom') continue;
      const cand = own.slice();
      cand[k] = at(k, table.zoom);
      if (P.fastFlash || K.flashRate([].concat(...cand), pass) <= K.FLASH.perSec) own[k] = cand[k];
      else moves[k] = 'push';
    }
    return { moves, rate: K.flashRate([].concat(...own), pass) };
  }
  function planFor(C, f) {
    const key = JSON.stringify([f.layer.fill, f.bg, f.layer.time, f.dur]);
    let plan = C.plans.get(key);
    if (!plan) {
      const P = f.params;
      plan = {
        moves: movesPlan(P, C.shots.length, K.passOf(f), flashy(f.layer, f.bg)).moves,
        // How far flickering letters fade (to where they can no longer flash; 1 = no guard).
        ghost: P.fastFlash ? 1 : K.ghostAlpha(K.inkColors(f.layer), K.backdrops(f.bg)) * 0.8,
      };
      if (C.plans.size > 12) C.plans.clear();
      C.plans.set(key, plan);
    }
    return plan;
  }

  /**
   * Camera move for one shot: role 'in' (e 0 → 1 arriving), 'out' (e 0 → 1 leaving) or 'hold'.
   * ratio: the zoom between the two shots of a zoom-through.
   */
  function cam(move, role, e, W, ratio) {
    const m = { scale: 1, rot: 0, dx: 0, alpha: 1, portal: false };
    if (role === 'hold') return m;
    if (move === 'push') {
      if (role === 'in') { m.scale = 0.42 + 0.58 * e; m.alpha = smoothstep(0, 0.4, e); }
      else { m.scale = 1 + 1.6 * e * e; m.alpha = 1 - smoothstep(0.35, 0.9, e); }
    } else if (move === 'zoom') {
      if (role === 'in') { m.scale = Math.pow(ratio, e - 1); m.alpha = smoothstep(0, 0.2, e); }
      else {
        m.scale = Math.pow(ratio, e);
        m.portal = true;
        // A backstop only: by 0.75 × ratio the hole has swallowed the frame (ratio = 1.4 × that).
        m.alpha = 1 - smoothstep(ratio * 0.75, ratio, m.scale);
      }
    } else if (move === 'roll') {
      if (role === 'in') { m.rot = (1 - e) * TAU / 4; m.scale = 0.7 + 0.3 * e; m.alpha = smoothstep(0.1, 0.55, e); }
      else { m.rot = -e * TAU / 4; m.scale = 1 - 0.3 * e; m.alpha = 1 - smoothstep(0.45, 0.9, e); }
    } else if (move === 'whip') {
      if (role === 'in') m.dx = (1 - e) * W * 1.15;
      else m.dx = -e * W * 1.15;
    }
    return m;
  }
})(window.TM);
