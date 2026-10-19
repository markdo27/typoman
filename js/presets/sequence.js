/* Preset: Sequence — a phrase sequencer. The text plays as shots, one line (or word) each, framed
 * big like a lyric video and cut together with camera moves: push, zoom-through, roll and whip.
 *
 * Craft notes
 *  - Each transition is one camera move shared by the outgoing and incoming shot (the same
 *    eased curve drives both), so it reads as a cut on motion rather than two separate fades.
 *  - Zoom-through dives into a letter near the centre of the outgoing shot; whip pans carry a
 *    velocity-scaled box blur; every shot drifts slowly while it holds, so the frame breathes.
 *  - Letters keep a light stagger inside each move (per-shot in/out). Shots cycle with the loop
 *    and the last shot moves into the first at the seam, so it always loops.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { clamp, smoothstep, TAU } = TM.math;
  const MOVES = ['push', 'zoom', 'roll', 'whip'];
  const ZOOM = 24; // zoom-through scale ratio between shots
  const COUNTERS = /[ABDOPQRabdegopq0469@]/;

  TM.registerPreset({
    id: 'sequence',
    name: 'Sequence',
    category: 'Reveal',
    description: 'Your lines play as big lyric-video shots, cut together with camera moves: push, zoom-through, roll and whip pan.',
    params: [
      TM.P.select('split', 'Shots from', [['auto', 'Auto'], ['lines', 'Each line'], ['words', 'Each word']], 'auto', { group: 'Shots', hint: 'Auto: lines when there are several, otherwise words' }),
      TM.P.select('move', 'Camera move', [['mix', 'Mix'], ['push', 'Push'], ['zoom', 'Zoom through'], ['roll', 'Roll'], ['whip', 'Whip pan']], 'mix', { group: 'Shots' }),
      TM.P.range('trans', 'Move length', 0.1, 0.9, 0.01, 0.45, { group: 'Shots', hint: 'Share of each shot spent moving' }),
      TM.P.ease('ease', 'Move curve', 'snap', { group: 'Shots' }),
      TM.P.range('stagger', 'Letter stagger', 0, 0.9, 0.01, 0.25, { group: 'Shots' }),
      TM.P.select('order', 'Letter order', TM.ORDERS.filter((o) => o[0] !== 'words' && o[0] !== 'lines'), 'start', { group: 'Shots' }),
      TM.P.range('fill', 'Fill the frame', 0, 1, 0.01, 0.75, { group: 'Framing' }),
      TM.P.range('drift', 'Camera drift', 0, 1, 0.01, 0.5, { group: 'Framing' }),
      TM.P.toggle('blur', 'Whip blur', true, { group: 'Framing' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const by = P.split === 'auto' ? (L.lines.filter((l) => l.glyphs.length).length > 1 ? 'lines' : 'words') : P.split;
      const shots = K.units(L, by).map((u) => {
        // Framing: grow each shot toward filling the frame (capped so one-letter shots stay sane).
        const fit = Math.min((f.W * 0.84) / Math.max(1, u.w), (f.H * 0.58) / Math.max(1, L.capH), 4.5);
        // Portal for zoom-through: a letter with a counter near the middle, else the middle letter.
        let best = null, bestD = Infinity;
        for (const gi of u.glyphs) {
          const g = L.glyphs[gi];
          const d = Math.abs(g.cx - u.cx) / Math.max(1, u.w) - (COUNTERS.test(g.ch) ? 0.25 : 0);
          if (d < bestD) { bestD = d; best = g; }
        }
        // Letter ranks inside the shot.
        const n = u.glyphs.length;
        const ranks = u.glyphs.map((gi, j) => K.rankOf(f, j, n, P.order));
        return Object.assign(u, { scale: Math.max(1, 1 + (fit - 1) * P.fill), portal: { x: best.cx, y: best.cy }, ranks });
      });
      return { shots };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.shots.length) return;
      const shots = C.shots, N = shots.length;
      const slot = 1 / N, T = P.trans * slot;
      const ease = TM.ease(P.ease, 'snap');
      const st = P.stagger;
      const cx = f.cx, cy = f.cy;
      const moveAt = (b) => (P.move === 'mix' ? MOVES[((b % N) + N) % N % MOVES.length] : P.move);

      // Each shot, plus its neighbours from the previous/next loop, so the seam is continuous.
      for (let c = -1; c <= 1; c++) {
        for (let k = 0; k < N; k++) {
          const tau = f.p + c - k * slot;
          if (tau < -T / 2 || tau > slot + T / 2) continue;
          const shot = shots[k];
          const uIn = clamp((tau + T / 2) / T), uOut = clamp((tau - slot + T / 2) / T);
          const role = uOut > 0 ? 'out' : uIn < 1 ? 'in' : 'hold';
          const move = role === 'out' ? moveAt(k + 1) : moveAt(k);
          const life = (tau + T / 2) / (slot + T);
          const drift = 1 + P.drift * 0.09 * (life - 0.5);
          const u = role === 'out' ? uOut : uIn;
          for (let j = 0; j < shot.glyphs.length; j++) {
            const g = L.glyphs[shot.glyphs[j]];
            const r = shot.ranks[j];
            const ug = role === 'hold' ? 1 : clamp((u - r * st) / Math.max(1e-4, 1 - st));
            const e = role === 'hold' ? 1 : ease(ug);
            const m = cam(move, role, e, f.W);
            if (m.alpha <= 0.002) continue;
            const S = shot.scale * drift * m.scale;
            // Zoom-through: the outgoing shot scales about its portal letter, which slides to the centre.
            let ox = g.cx - shot.cx, oy = g.cy - shot.cy, px = 0, py = 0;
            if (m.portal) {
              const pull = 1 - smoothstep(1, 4, m.scale);
              ox = g.cx - shot.portal.x; oy = g.cy - shot.portal.y;
              px = (shot.portal.x - shot.cx) * shot.scale * drift * pull;
              py = (shot.portal.y - shot.cy) * shot.scale * drift * pull;
            }
            const cs = Math.cos(m.rot), sn = Math.sin(m.rot);
            const x = cx + px + m.dx + (ox * cs - oy * sn) * S;
            const y = cy + py + (ox * sn + oy * cs) * S;
            const o = { x, y, rot: m.rot, scale: S, alpha: m.alpha };
            if (move === 'whip' && P.blur && role !== 'hold') {
              // Speed smear: the glyph stretched along the pan under a softened copy (two draws,
              // no stroboscopic ghosts), scaled by the move's speed.
              const v = clamp(K.slope(ease, ug) / 3);
              if (v > 0.12) {
                const len = f.W * 0.16 * v;
                const stretch = 1 + len / Math.max(1, g.w * S);
                f.drawGlyph(g, Object.assign({}, o, { sx: S * stretch, sy: S * (1 - 0.06 * v), alpha: m.alpha * (0.2 + 0.25 * v) }));
                o.alpha = m.alpha * (1 - 0.55 * v);
              }
            }
            f.drawGlyph(g, o);
          }
        }
      }
    },
  });

  /** Camera move for one shot: role 'in' (e 0 → 1 arriving), 'out' (e 0 → 1 leaving) or 'hold'. */
  function cam(move, role, e, W) {
    const m = { scale: 1, rot: 0, dx: 0, alpha: 1, portal: false };
    if (role === 'hold') return m;
    if (move === 'push') {
      if (role === 'in') { m.scale = 0.42 + 0.58 * e; m.alpha = smoothstep(0, 0.4, e); }
      else { m.scale = 1 + 1.6 * e * e; m.alpha = 1 - smoothstep(0.35, 0.9, e); }
    } else if (move === 'zoom') {
      if (role === 'in') { m.scale = Math.pow(ZOOM, e - 1); m.alpha = smoothstep(0, 0.2, e); }
      else { m.scale = Math.pow(ZOOM, e); m.alpha = 1 - smoothstep(0.8, 1, e); m.portal = true; }
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
