(() => {
  'use strict';
  const G = (window.G = window.G || {});
  // ---- color language -------------------------------------------------------
  // cyan = player / shields, gold = reward / overdrive, hot family = hostile.
  const KEY = '#050711',
    CYAN = '#4deeea',
    MINT = '#3cffc8',
    GOLD = '#ffd166',
    RED = '#ff3b6b',
    ORANGE = '#ff8a3d',
    MAGENTA = '#ff4fd8',
    VIOLET = '#b45cff';
  const KIND_COLOR = {
    fan: ORANGE,
    converge: ORANGE,
    rain: RED,
    laser: RED,
    boss: RED,
    ring: RED,
    wall: VIOLET,
    orbit: VIOLET,
    spiral: MAGENTA,
    petal: MAGENTA,
    cross: MAGENTA,
  };
  const HOT = new Set([RED, ORANGE, MAGENTA, VIOLET, '#ff5c8a', '#ff4d6d']);
  // older timelines used cyan / gold / blue bullets: remap them into the hostile family
  const LEGACY = {
    '#4deeea': ORANGE,
    '#3cffc8': ORANGE,
    '#a66cff': MAGENTA,
    '#4b8cff': VIOLET,
    '#ffd166': ORANGE,
    '#ff5c8a': RED,
    '#ff4d6d': RED,
  };
  const enemyColor = (b) => {
    if (b.kind && KIND_COLOR[b.kind]) return KIND_COLOR[b.kind];
    const col = (b.color || '').toLowerCase();
    if (LEGACY[col]) return LEGACY[col];
    return HOT.has(col) ? col : RED;
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const reduced = () => !!(G.save && G.save.data && G.save.data.reduced);
  const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  // visible logical span (wide screens): arena coords stay 0..1280, gutters extend it
  const span = () => {
    const ax = Math.max(0, +G.AX || 0);
    return { x0: -ax, x1: G.W + ax, w: G.W + ax * 2 };
  };

  // ---- background -----------------------------------------------------------
  let stars = null,
    cracks = null,
    streaks = null;
  function initStars() {
    if (stars) return;
    const r = G.mulberry(721);
    // generated across the widest supported view (1600) so gutters get stars too
    stars = Array.from({ length: 112 }, () => ({
      x: -160 + r() * 1600,
      y: r() * G.H,
      z: 0.3 + r() * 0.7,
      s: 0.5 + r() * 1.6,
    }));
    const rc = G.mulberry(4093);
    cracks = Array.from({ length: 3 }, (_, k) => {
      let x = 120 + k * 480 + rc() * 120,
        y = 120 + rc() * 120,
        a = 1.1 + rc() * 0.9;
      const pts = [[x, y]];
      for (let i = 0; i < 9; i++) {
        a += (rc() - 0.5) * 0.9;
        x += Math.cos(a) * (40 + rc() * 40);
        y += Math.sin(a) * (40 + rc() * 40);
        pts.push([x, y]);
      }
      return pts;
    });
    const rs = G.mulberry(2049);
    streaks = Array.from({ length: 26 }, () => ({
      x: rs() * 1900 - 160,
      y: rs() * G.H,
      l: 60 + rs() * 140,
      v: 40 + rs() * 50,
    }));
  }
  const missionOf = (m) =>
    !m ? null : typeof m === 'string' ? (G.MISSIONS || []).find((q) => q.id === m) || null : m;
  function motif(c, t, intensity, m) {
    if (!m) return;
    const still = reduced(),
      tt = still ? 0 : t,
      lift = Math.min(4, Math.max(0, intensity | 0)) * 0.01,
      col = m.color || CYAN,
      { x0, x1 } = span();
    c.save();
    if (m.id === 'echo') {
      // slow sonar rings from the horizon
      c.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const r = (tt * 22 + i * 150) % 750,
          a = (0.06 + lift) * (1 - r / 750);
        c.strokeStyle = rgba(col, a);
        c.beginPath();
        c.arc(640, 345, r + 20, 0, G.TAU);
        c.stroke();
      }
    } else if (m.id === 'fracture') {
      c.strokeStyle = rgba(col, 0.07 + lift);
      c.lineWidth = 2;
      c.lineJoin = 'round';
      for (const pts of cracks) {
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      }
    } else if (m.id === 'zero') {
      c.strokeStyle = rgba(col, 0.05 + lift);
      c.lineWidth = 2;
      const W = x1 - x0 + 400;
      c.beginPath();
      for (const s of streaks) {
        const x = x0 - 200 + ((((s.x - tt * s.v * 0.7) % W) + W) % W),
          y = (s.y + tt * s.v) % G.H;
        c.moveTo(x, y);
        c.lineTo(x - s.l * 0.55, y - s.l);
      }
      c.stroke();
    }
    c.restore();
  }
  function bg(c, t = 0, intensity = 0, mission = null) {
    initStars();
    const m = missionOf(mission),
      { x0, x1, w } = span();
    const g = c.createRadialGradient(640, 180, 40, 640, 360, 760 + (x1 - G.W));
    g.addColorStop(0, !m && intensity > 3 ? '#17102c' : '#0d1630');
    g.addColorStop(0.5, '#080c1c');
    g.addColorStop(1, '#03050b');
    c.fillStyle = g;
    c.fillRect(x0, 0, w, G.H);
    if (m) {
      // mission horizon tint, at most 8%
      const h = c.createRadialGradient(640, 345, 10, 640, 345, 620);
      h.addColorStop(0, rgba(m.color, 0.08));
      h.addColorStop(1, rgba(m.color, 0));
      c.fillStyle = h;
      c.fillRect(x0, 0, w, G.H);
    }
    c.save();
    c.globalAlpha = reduced() ? 0.18 : 0.38;
    for (const s of stars) {
      if (s.x < x0 || s.x > x1) continue;
      const y = (s.y + t * 4 * s.z) % G.H;
      c.fillStyle = s.z > 0.72 ? '#a7d7ff' : '#52627d';
      c.fillRect(s.x, y, s.s, s.s);
    }
    c.restore();
    motif(c, t, intensity, m);
    c.save();
    c.strokeStyle = m ? rgba(m.color, 0.07) : 'rgba(77,238,234,.07)';
    c.lineWidth = 1;
    const off = ((reduced() ? 0 : t) * 18) % 48;
    c.beginPath();
    for (let y = G.H * 0.55 + off; y < G.H; y += 48) {
      c.moveTo(x0, y);
      c.lineTo(x1, y);
    }
    for (let x = -G.W * 1.5; x < G.W * 2.5; x += 90) {
      c.moveTo(640, 345);
      c.lineTo(x, 720);
    }
    c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.012)';
    for (let y = 0; y < G.H; y += 4) c.fillRect(x0, y, w, 1);
  }

  // ---- arena / core ---------------------------------------------------------
  function arena(c, e) {
    const od = e.overdrive > 0;
    c.save();
    c.strokeStyle = 'rgba(128,160,220,.22)';
    c.lineWidth = 1;
    c.strokeRect(e.left, e.top, e.right - e.left, e.bottom - e.top);
    c.strokeStyle = od ? 'rgba(255,209,102,.18)' : 'rgba(77,238,234,.2)';
    c.setLineDash([12, 14]);
    c.strokeRect(e.left + 8, e.top + 8, e.right - e.left - 16, e.bottom - e.top - 16);
    c.setLineDash([]);
    for (const [x, y, sx, sy] of [
      [e.left, e.top, 1, 1],
      [e.right, e.top, -1, 1],
      [e.left, e.bottom, 1, -1],
      [e.right, e.bottom, -1, -1],
    ]) {
      c.strokeStyle = od ? 'rgba(255,209,102,.8)' : 'rgba(77,238,234,.65)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x, y + sy * (od ? 36 : 25));
      c.lineTo(x, y);
      c.lineTo(x + sx * (od ? 36 : 25), y);
      c.stroke();
    }
    c.restore();
  }
  function core(c, e) {
    const boss = (e.boss && e.boss.active) || e.time >= e.timeline.bossStart,
      p = 1 + 0.05 * Math.sin(e.time * 3);
    c.save();
    c.translate(e.cx, e.cy);
    c.globalCompositeOperation = 'lighter';
    for (let i = 3; i > 0; i--) {
      c.strokeStyle = rgba(boss ? '#ff5c8a' : '#a66cff', 0.05 * i);
      c.lineWidth = i * 7;
      c.beginPath();
      c.arc(0, 0, (32 + i * 7) * p, 0, G.TAU);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.rotate(e.time * 0.35);
    c.strokeStyle = boss ? '#ff8eaa' : '#b999ff';
    c.lineWidth = 2;
    c.setLineDash([20, 14]);
    c.beginPath();
    c.arc(0, 0, 44, 0, G.TAU);
    c.stroke();
    c.setLineDash([]);
    c.rotate(-e.time * 0.9);
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * G.TAU) / 6,
        r = i % 2 ? 19 : 31;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.stroke();
    c.fillStyle = boss ? '#ff5c8a' : '#a66cff';
    c.beginPath();
    c.arc(0, 0, 8, 0, G.TAU);
    c.fill();
    c.restore();
  }

  // ---- bullets --------------------------------------------------------------
  function shapePath(c, shape, r) {
    c.beginPath();
    if (shape === 'diamond') {
      c.moveTo(r + 3, 0);
      c.lineTo(0, r * 0.72);
      c.lineTo(-r - 3, 0);
      c.lineTo(0, -r * 0.72);
      c.closePath();
    } else if (shape === 'needle') {
      if (c.roundRect) c.roundRect(-r * 1.7, -r * 0.45, r * 3.4, r * 0.9, r * 0.4);
      else c.rect(-r * 1.7, -r * 0.45, r * 3.4, r * 0.9);
    } else if (shape === 'block') {
      c.rect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
    } else c.arc(0, 0, r, 0, G.TAU);
  }
  // draws one hostile bullet: dark keyline, color body, white hot core
  function bullet(c, b, opt = {}) {
    const col = opt.color || enemyColor(b),
      a = Math.atan2(b.vy || 0, b.vx || 1),
      r = b.r || 8;
    if (opt.smear && (b.vx || b.vy)) {
      // overdrive slow-motion smear: thin tail behind the bullet
      const sp = Math.hypot(b.vx, b.vy) * 0.09;
      c.strokeStyle = rgba(col, 0.32);
      c.lineWidth = r * 1.1;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - Math.cos(a) * sp, b.y - Math.sin(a) * sp);
      c.stroke();
    }
    c.save();
    c.translate(b.x, b.y);
    c.rotate(a);
    c.lineJoin = 'round';
    shapePath(c, b.shape, r);
    c.lineWidth = 4;
    c.strokeStyle = KEY;
    c.stroke();
    c.fillStyle = col;
    c.fill();
    if (opt.grazed) {
      c.lineWidth = 1.5;
      c.strokeStyle = '#ffffff';
      c.stroke();
    }
    c.scale(0.45, 0.45);
    shapePath(c, b.shape, r);
    c.fillStyle = '#fff';
    c.fill();
    c.restore();
  }

  // ---- fx state (derived from engine state, no event plumbing needed) --------
  const S = { eng: null, last: 0, fx: [], ghosts: [], trail: [], grazeT: new WeakMap(), shake: 0, vig: 0 };
  function resetFx(e) {
    S.eng = e;
    S.fx.length = 0;
    S.ghosts.length = 0;
    S.trail.length = 0;
    S.grazeT = new WeakMap();
    S.shake = 0;
    S.vig = 0;
    S.hits = e ? e.hits || 0 : 0;
    S.dashT = e ? e.player.dashT : 0;
    S.od = e ? e.overdrive > 0 : false;
    S.ghostClock = 0;
    S.ghostLeft = 0;
    S.bossHp = null;
  }
  // public hook: screens may forward engine events; render also detects hit/dash/overdrive itself
  function fxEvent(ev) {
    if (!ev) return;
    const p = S.eng && S.eng.player;
    if (ev.type === 'hit') {
      S.fx.push({ k: 'ring', x: ev.x, y: ev.y, r0: 20, r1: 190, t: 0, life: 0.4, col: RED });
      S.vig = 0.45;
      if (!reduced()) S.shake = 0.25;
    } else if (ev.type === 'dash' && p) {
      S.fx.push({ k: 'streak', x: ev.x, y: ev.y, t: 0, life: 0.3 });
      S.ghostClock = 0;
      S.ghostLeft = 4;
    } else if (ev.type === 'overdrive' && p) {
      S.fx.push({ k: 'ring', x: p.x, y: p.y, r0: 18, r1: 120, t: 0, life: 0.6, col: GOLD, follow: true });
    }
  }
  function detect(e, dt) {
    const p = e.player;
    if ((e.hits || 0) > S.hits) fxEvent({ type: 'hit', x: p.x, y: p.y });
    S.hits = e.hits || 0;
    if (p.dashT > S.dashT + 0.05) fxEvent({ type: 'dash', x: p.x, y: p.y });
    S.dashT = p.dashT;
    const od = e.overdrive > 0;
    if (od && !S.od) fxEvent({ type: 'overdrive' });
    S.od = od;
    if (p.dashT > 0 && S.ghostLeft > 0) {
      S.ghostClock -= dt;
      if (S.ghostClock <= 0) {
        S.ghosts.push({ x: p.x, y: p.y, t: 0, life: 0.26 });
        S.ghostLeft--;
        S.ghostClock = 0.04;
      }
    }
    for (const list of [S.fx, S.ghosts])
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
    S.shake = Math.max(0, S.shake - dt);
    S.vig = Math.max(0, S.vig - dt);
  }
  function drawFx(c, e) {
    const p = e.player;
    c.save();
    for (const f of S.fx) {
      const k = f.t / f.life;
      if (f.k === 'ring') {
        const x = f.follow ? p.x : f.x,
          y = f.follow ? p.y : f.y;
        c.globalAlpha = 0.85 * (1 - k);
        c.strokeStyle = f.col;
        c.lineWidth = 3 + 3 * (1 - k);
        c.beginPath();
        c.arc(x, y, G.lerp(f.r0, f.r1, G.easeOut(k)), 0, G.TAU);
        c.stroke();
      } else if (f.k === 'spark') {
        c.globalAlpha = 0.9 * (1 - k);
        c.strokeStyle = CYAN;
        c.lineWidth = 3;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(p.x, p.y, p.graze, f.a - 0.32, f.a + 0.32);
        c.stroke();
      } else if (f.k === 'streak') {
        c.globalAlpha = 0.5 * (1 - k);
        c.strokeStyle = MINT;
        c.lineWidth = p.r * 0.9 * (1 - k) + 1;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(f.x, f.y);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
    }
    for (const g of S.ghosts) {
      c.globalAlpha = 0.35 * (1 - g.t / g.life);
      c.save();
      c.translate(g.x, g.y);
      star(c, p.r);
      c.fillStyle = MINT;
      c.fill();
      c.restore();
    }
    c.restore();
  }
  // red edge vignette on hit: transparent centre, max .3 alpha at the edges, fades out
  function vignette(c) {
    if (S.vig <= 0) return;
    const k = S.vig / 0.45,
      { x0, w } = span(),
      v = c.createRadialGradient(640, 360, 300, 640, 360, 760);
    v.addColorStop(0, 'rgba(255,59,107,0)');
    v.addColorStop(1, `rgba(255,59,107,${(0.3 * k).toFixed(3)})`);
    c.fillStyle = v;
    c.fillRect(x0, 0, w, G.H);
  }

  // ---- player ---------------------------------------------------------------
  function star(c, r) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * G.TAU) / 8,
        rr = i % 2 ? r * 0.72 : r;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
  }
  // tapered ribbon trail (replaces overlapping discs)
  function ribbon(c, p) {
    const T = S.trail;
    if (reduced()) {
      T.length = 0;
      return;
    }
    T.unshift({ x: p.x, y: p.y, d: p.dashT > 0 });
    if (T.length > 12) T.length = 12;
    if (T.length < 3) return;
    let len = 0;
    for (let i = 1; i < T.length; i++) len += Math.hypot(T[i].x - T[i - 1].x, T[i].y - T[i - 1].y);
    if (len < 6) return;
    const L = [],
      R = [];
    for (let i = 0; i < T.length; i++) {
      const a = T[Math.max(0, i - 1)],
        b = T[Math.min(T.length - 1, i + 1)];
      let nx = -(b.y - a.y),
        ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1,
        w = p.r * 0.85 * (1 - i / T.length);
      nx /= nl;
      ny /= nl;
      L.push([T[i].x + nx * w, T[i].y + ny * w]);
      R.push([T[i].x - nx * w, T[i].y - ny * w]);
    }
    c.beginPath();
    L.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
    c.fillStyle = T[0].d ? 'rgba(60,255,200,.32)' : 'rgba(60,255,200,.16)';
    c.fill();
  }
  function player(c, e) {
    const p = e.player,
      focus = !!(e.input && e.input.focus),
      inv = p.invuln > 0;
    ribbon(c, p);
    c.save();
    c.translate(p.x, p.y);
    if (e.overdrive > 0) {
      c.strokeStyle = 'rgba(255,209,102,.55)';
      c.lineWidth = 2;
      c.setLineDash([10, 8]);
      c.lineDashOffset = reduced() ? 0 : -e.time * 30;
      c.beginPath();
      c.arc(0, 0, p.r + 18, 0, G.TAU);
      c.stroke();
      c.setLineDash([]);
    }
    if (inv && p.dashT <= 0) {
      // steady shield ring whose length shows remaining invulnerability (no blink)
      const f = G.clamp(p.invuln / 1.4, 0, 1),
        a0 = reduced() ? -Math.PI / 2 : e.time * 2.2;
      c.strokeStyle = 'rgba(77,238,234,.75)';
      c.lineWidth = 2.5;
      c.setLineDash([7, 6]);
      c.beginPath();
      c.arc(0, 0, p.r + 11, a0, a0 + G.TAU * f);
      c.stroke();
      c.setLineDash([]);
    }
    c.globalAlpha = focus ? 0.55 : inv && p.dashT <= 0 ? 0.6 : 1;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(77,255,210,.16)';
    c.beginPath();
    c.arc(0, 0, p.r + 9, 0, G.TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.lineJoin = 'round';
    star(c, p.r);
    c.lineWidth = 5;
    c.strokeStyle = KEY;
    c.stroke();
    c.fillStyle = MINT;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#fff';
    c.stroke();
    c.globalAlpha = 1;
    // hitbox: always a white dot; red ring in focus so the exact point reads
    c.beginPath();
    c.arc(0, 0, p.hit, 0, G.TAU);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = focus ? 2 : 1.5;
    c.strokeStyle = focus ? RED : KEY;
    c.stroke();
    if (focus) {
      c.strokeStyle = 'rgba(77,238,234,.5)';
      c.lineWidth = 1.5;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.arc(0, 0, p.graze, 0, G.TAU);
      c.stroke();
      c.setLineDash([]);
    }
    // dash charge pips (fill while regenerating)
    for (let i = 0; i < 2; i++) {
      const f = i < p.dashes ? 1 : i === p.dashes ? G.clamp((p.dashRegen || 0) / 2.8, 0, 1) : 0,
        x = -13 + i * 15,
        y = p.r + 9;
      c.fillStyle = 'rgba(5,7,17,.85)';
      c.fillRect(x - 1, y - 1, 13, 6);
      c.fillStyle = f >= 1 ? CYAN : 'rgba(77,238,234,.45)';
      c.fillRect(x, y, 11 * f, 4);
    }
    c.restore();
  }

  // ---- telegraphs / warnings ------------------------------------------------
  function telegraphs(c, e) {
    const p = e.player,
      hasWarn = Array.isArray(e.warnings) && e.warnings.length > 0;
    for (const q of e.telegraphs || []) {
      const k = G.clamp(1 - q.t / 0.65, 0, 1),
        col = KIND_COLOR[q.kind || q.type] || enemyColor({ color: q.color });
      c.save();
      // follows the moving core and contracts onto it; alpha ramps, never blinks
      c.globalAlpha = 0.15 + 0.4 * k;
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.setLineDash([8, 8]);
      c.beginPath();
      c.arc(e.cx, e.cy, G.lerp(96, 46, G.easeOut(k)), 0, G.TAU);
      c.stroke();
      c.setLineDash([]);
      if (q.type === 'fan' && !hasWarn) {
        const a = Math.atan2(p.y - e.cy, p.x - e.cx);
        c.globalAlpha = 0.1 + 0.25 * k;
        c.lineWidth = 1.5;
        for (const d of [-0.28, 0, 0.28]) {
          c.beginPath();
          c.moveTo(e.cx + Math.cos(a + d) * 50, e.cy + Math.sin(a + d) * 50);
          c.lineTo(e.cx + Math.cos(a + d) * 260, e.cy + Math.sin(a + d) * 260);
          c.stroke();
        }
      }
      c.restore();
    }
  }
  function chevron(c, x, y, a, s, col) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.beginPath();
    c.moveTo(-s * 0.4, -s);
    c.lineTo(s * 0.6, 0);
    c.lineTo(-s * 0.4, s);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = KEY;
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = col;
    c.stroke();
    c.restore();
  }
  // engine.warnings = [{kind,x,y,w,h,angle,t,life, gap?,gapW?,len?}]; t = seconds remaining
  function warnings(c, e) {
    const W = e.warnings;
    if (!Array.isArray(W) || !W.length) return;
    c.save();
    c.beginPath();
    c.rect(e.left - 12, e.top - 12, e.right - e.left + 24, e.bottom - e.top + 24);
    c.clip();
    for (const q of W) {
      if (!q) continue;
      const life = q.life || 0.65,
        k = G.clamp(1 - (q.t ?? life * 0.5) / life, 0, 1),
        col = KIND_COLOR[q.kind] || RED;
      c.save();
      c.globalAlpha = 0.15 + 0.4 * k;
      c.fillStyle = col;
      c.strokeStyle = col;
      if (q.w > 0 && q.h > 0 && q.kind !== 'laser' && q.angle == null) {
        // edge strip; the safe gap stays visibly empty with cyan bracket marks
        const horiz = q.w >= q.h;
        c.fillRect(q.x, q.y, q.w, q.h);
        if (q.gap != null && q.gapW) {
          const g0 = q.gap - q.gapW / 2;
          c.globalAlpha = 1;
          c.fillStyle = KEY;
          if (horiz) c.fillRect(g0, q.y, q.gapW, q.h);
          else c.fillRect(q.x, g0, q.w, q.gapW);
          c.globalAlpha = 0.4 + 0.5 * k;
          c.strokeStyle = CYAN;
          c.lineWidth = 2;
          c.beginPath();
          if (horiz) {
            c.moveTo(g0, q.y - 4);
            c.lineTo(g0, q.y + q.h + 4);
            c.moveTo(g0 + q.gapW, q.y - 4);
            c.lineTo(g0 + q.gapW, q.y + q.h + 4);
          } else {
            c.moveTo(q.x - 4, g0);
            c.lineTo(q.x + q.w + 4, g0);
            c.moveTo(q.x - 4, g0 + q.gapW);
            c.lineTo(q.x + q.w + 4, g0 + q.gapW);
          }
          c.stroke();
        }
      } else if (q.kind === 'rain' || q.kind === 'tick' || q.kind === 'entry') {
        let a = q.angle;
        if (a == null) {
          const dl = q.x - e.left,
            dr = e.right - q.x,
            dt = q.y - e.top,
            db = e.bottom - q.y,
            m = Math.min(dl, dr, dt, db);
          a = m === dl ? 0 : m === dr ? Math.PI : m === dt ? Math.PI / 2 : -Math.PI / 2;
        }
        c.globalAlpha = 0.3 + 0.5 * k;
        chevron(c, q.x + Math.cos(a) * 10, q.y + Math.sin(a) * 10, a, 9, col);
      } else if (q.angle != null) {
        // aim / laser line from its origin
        const laser = q.kind === 'laser',
          len = q.len || (laser ? 1600 : q.w || 300);
        c.lineWidth = laser ? Math.max(2, Math.min(q.h || 4, 12) * k) : 1.5;
        if (!laser) c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(q.x, q.y);
        c.lineTo(q.x + Math.cos(q.angle) * len, q.y + Math.sin(q.angle) * len);
        c.stroke();
        c.setLineDash([]);
      } else {
        c.lineWidth = 2;
        c.setLineDash([8, 8]);
        c.beginPath();
        c.arc(q.x, q.y, G.lerp(q.w || 90, 30, G.easeOut(k)), 0, G.TAU);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();
    }
    c.restore();
  }

  // ---- particles / hud ------------------------------------------------------
  function particles(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of G.particles) {
      c.globalAlpha = G.clamp(p.life / 0.5, 0, 1);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, G.TAU);
      c.fill();
    }
    c.restore();
  }
  function measure(c, s, size, weight) {
    c.save();
    c.font = `${weight} ${size}px ${G.FONT}`;
    const w = c.measureText(String(s)).width;
    c.restore();
    return w;
  }
  // pill grows to fit label + value so they never collide; align 'right' anchors x as the right edge
  function pill(c, x, y, w, h, label, value, color, align = 'left') {
    const need = 16 + measure(c, label, 13, 700) + 14 + measure(c, value, 18, 900) + 16;
    w = Math.max(w, Math.ceil(need));
    if (align === 'right') x -= w;
    G.rr(c, x, y, w, h, h / 2);
    c.fillStyle = 'rgba(7,11,24,.82)';
    c.fill();
    c.strokeStyle = 'rgba(140,165,210,.22)';
    c.lineWidth = 1;
    c.stroke();
    G.text(c, label, x + 16, y + h / 2, 13, '#8291ad', { weight: 700 });
    G.text(c, value, x + w - 16, y + h / 2, 18, color, { weight: 900, align: 'right' });
    return { x, y, w, h };
  }
  const mult = (n) => (n >= 100 ? 5 : n >= 50 ? 4 : n >= 25 ? 3 : n >= 10 ? 2 : 1);
  // engine.boss = {hp,max,phase,name,active}
  function bossBar(c, e) {
    const B = e.boss;
    if (!B || B.active === false || !(B.max > 0)) return false;
    const f = G.clamp(B.hp / B.max, 0, 1);
    if (S.bossHp == null || S.bossHp < f) S.bossHp = f;
    S.bossHp = Math.max(f, S.bossHp - 0.006);
    const w = 440,
      x = 640 - w / 2,
      y = 106;
    G.text(c, B.name || 'CORE', x, y - 12, 13, '#ffd0dc', { weight: 900, stroke: 4 });
    if (B.phase != null)
      G.text(c, `PHASE ${B.phase + 1}`, x + w, y - 12, 11, '#ff8eaa', { weight: 800, align: 'right', stroke: 4 });
    G.rr(c, x - 3, y - 3, w + 6, 14, 7);
    c.fillStyle = 'rgba(5,7,17,.9)';
    c.fill();
    c.fillStyle = 'rgba(255,142,170,.35)';
    c.fillRect(x, y, w * S.bossHp, 8);
    c.fillStyle = RED;
    c.fillRect(x, y, w * f, 8);
    return true;
  }
  function hud(c, e) {
    const s = e.stats(),
      p = e.player,
      remain = Math.max(0, e.mission.duration - e.time),
      mm = Math.floor(remain / 60),
      ss = Math.floor(remain % 60)
        .toString()
        .padStart(2, '0');
    pill(c, 82, 24, 176, 42, 'SIGNAL', `${mm}:${ss}`, e.mission.color);
    const sp = pill(c, 1202, 24, 150, 42, 'SCORE', String(s.score).padStart(6, '0'), '#eef7ff', 'right');
    const m = mult(e.combo || 0) * (e.overdrive > 0 ? 3 : 1);
    let chipX = sp.x;
    if (m > 1) {
      // gold multiplier chip beside the score
      const label = `×${m}`,
        cw = Math.ceil(measure(c, label, 16, 900)) + 22;
      chipX = sp.x - 10 - cw;
      G.rr(c, chipX, 31, cw, 28, 14);
      c.fillStyle = GOLD;
      c.fill();
      G.text(c, label, chipX + cw / 2, 45, 16, '#241a00', { weight: 900, align: 'center' });
    }
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = 'rgba(255,255,255,.28)';
      c.lineWidth = 1;
      c.fillStyle = i < p.shields ? CYAN : 'rgba(255,255,255,.08)';
      c.beginPath();
      c.moveTo(292 + i * 28, 45);
      c.lineTo(302 + i * 28, 34);
      c.lineTo(312 + i * 28, 45);
      c.lineTo(302 + i * 28, 56);
      c.closePath();
      c.fill();
      c.stroke();
    }
    const mx = 420,
      mw = Math.max(200, Math.min(400, chipX - 24 - mx));
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.fillRect(mx, 38, mw, 8);
    c.fillStyle = e.overdrive > 0 ? GOLD : CYAN;
    c.fillRect(mx, 38, mw * G.clamp(e.overdrive > 0 ? e.overdrive / 5 : e.energy / 100, 0, 1), 8);
    G.text(c, e.overdrive > 0 ? 'OVERDRIVE  ×3' : 'GRAZE ENERGY', mx, 58, 11, e.overdrive > 0 ? GOLD : '#8291ad', {
      weight: 800,
    });
    const boss = bossBar(c, e);
    if (e.combo > 0) {
      const mm2 = mult(e.combo);
      G.text(c, `FLOW ${e.combo}  ×${mm2}`, 640, boss ? 140 : 92, 20, mm2 > 1 ? GOLD : '#eef7ff', {
        align: 'center',
        weight: 900,
        stroke: 4,
      });
    }
  }

  // ---- world ----------------------------------------------------------------
  function world(c, e) {
    if (S.eng !== e) resetFx(e);
    const t = nowS(),
      dt = S.last ? G.clamp(t - S.last, 0, 0.05) : 0;
    S.last = t;
    detect(e, dt);
    bg(c, e.time, e.sectionIndex, e.mission);
    c.save();
    if (S.shake > 0 && !reduced()) {
      const a = 5 * (S.shake / 0.25);
      c.translate((Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a);
    }
    arena(c, e);
    core(c, e);
    warnings(c, e);
    telegraphs(c, e);
    const smear = e.overdrive > 0 && !reduced(),
      p = e.player;
    let sparks = 0;
    for (const f of S.fx) if (f.k === 'spark') sparks++;
    for (const b of e.bullets) {
      let gz = false;
      if (b.grazed) {
        let gt = S.grazeT.get(b);
        if (gt == null) {
          S.grazeT.set(b, (gt = e.time));
          if (sparks < 6) {
            S.fx.push({ k: 'spark', a: Math.atan2(b.y - p.y, b.x - p.x), t: 0, life: 0.22 });
            sparks++;
          }
        }
        gz = e.time - gt < 0.2;
      }
      bullet(c, b, { smear, grazed: gz });
    }
    drawFx(c, e);
    player(c, e);
    particles(c);
    c.restore();
    vignette(c);
    hud(c, e);
  }

  // ---- small reusable pieces for menu screens --------------------------------
  // mini preview of a pattern's signature bullet (select cards, title demo)
  function bulletIcon(c, x, y, kind = 'fan', r = 9, angle = 0) {
    const shape = { fan: 'diamond', converge: 'diamond', rain: 'needle', laser: 'needle', wall: 'block' }[kind] || 'orb';
    bullet(c, { x, y, vx: Math.cos(angle), vy: Math.sin(angle), r, shape, kind });
  }
  function lock(c, x, y, s = 16, color = '#8291ad') {
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = Math.max(2, s * 0.16);
    c.beginPath();
    c.arc(x, y - s * 0.25, s * 0.38, Math.PI, 0);
    c.stroke();
    G.rr(c, x - s * 0.55, y - s * 0.25, s * 1.1, s * 0.85, s * 0.18);
    c.fill();
    c.restore();
  }
  // slow hostile bullets orbiting a point: title screen teaches "warm = danger"
  function demoBullets(c, t, cx = 640, cy = 270, rad = 190) {
    const kinds = ['fan', 'spiral', 'wall', 'rain', 'petal'],
      tt = reduced() ? 0 : t;
    kinds.forEach((k, i) => {
      const a = tt * 0.25 + (i * G.TAU) / kinds.length,
        r = rad + (i % 2) * 34;
      bulletIcon(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62, k, 8, a + Math.PI / 2);
    });
  }
  // one gold ring burst behind a grade letter; k = 0..1 progress (play once, do not loop)
  function gradeRing(c, x, y, k, color = GOLD) {
    k = G.clamp(k, 0, 1);
    if (k >= 1) return;
    c.save();
    c.globalAlpha = 0.6 * (1 - k);
    c.strokeStyle = color;
    c.lineWidth = 4 * (1 - k) + 1;
    c.beginPath();
    c.arc(x, y, 50 + 150 * G.easeOut(k), 0, G.TAU);
    c.stroke();
    c.restore();
  }

  G.render = {
    bg,
    world,
    bullet,
    bulletIcon,
    enemyColor,
    lock,
    demoBullets,
    gradeRing,
    fx: fxEvent,
    span,
    pill,
    COLORS: { key: KEY, cyan: CYAN, mint: MINT, gold: GOLD, red: RED, orange: ORANGE, magenta: MAGENTA, violet: VIOLET },
    KIND_COLOR,
    panel(c, x, y, w, h, a = 0.86) {
      G.rr(c, x, y, w, h, 18);
      c.fillStyle = `rgba(7,11,24,${a})`;
      c.fill();
      c.strokeStyle = 'rgba(135,160,220,.24)';
      c.lineWidth = 1;
      c.stroke();
    },
    button(c, b, label, accent = false, small = '') {
      G.rr(c, b.x, b.y, b.w, b.h, 14);
      c.fillStyle = accent ? '#4deeea' : 'rgba(19,27,52,.94)';
      c.fill();
      c.strokeStyle = accent ? '#aafff2' : 'rgba(145,170,220,.28)';
      c.stroke();
      G.text(
        c,
        label,
        b.x + b.w / 2,
        b.y + b.h / 2 - (small ? 7 : 0),
        accent ? 18 : 17,
        accent ? '#041018' : '#eef7ff',
        { align: 'center', weight: 900 },
      );
      if (small)
        G.text(c, small, b.x + b.w / 2, b.y + b.h / 2 + 14, 11, accent ? '#16413e' : '#8291ad', {
          align: 'center',
          weight: 700,
        });
    },
    hit(b, x, y) {
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    },
  };
})();
