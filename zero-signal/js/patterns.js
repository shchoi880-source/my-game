(() => {
  'use strict';
  const G = (window.G = window.G || {});
  // grades: per mode, the minimum score for B / A / S on a CLEARED run (see G.gradeRun). Calibrated from
  // tools/balance.js: a careful no-graze clear lands on B/C, A needs real grazing, S is graze-seeking expert play.
  // densMul: per-mission density trim per mode (on top of G.MODES[mode].dens).
  // bossHp: boss HP on Normal (Hard multiplies by MODES.hard.hp). Calibrated with tools/balance.js.
  const M = [
    {
      id: 'echo',
      name: '잔향 구역',
      sub: '입문 임무',
      duration: 90,
      difficulty: 1,
      color: '#4deeea',
      seed: 1138,
      desc: '넓은 틈과 느린 탄막. 스치기와 대시를 익혀보세요.',
      bossHp: 45,
      densMul: { normal: 1, hard: 1.35 },
      grades: { normal: { B: 10000, A: 18000, S: 28000 }, hard: { B: 12000, A: 25000, S: 45000 } },
    },
    {
      id: 'fracture',
      name: '균열 심장',
      sub: '표준 임무',
      duration: 150,
      difficulty: 2,
      color: '#a66cff',
      seed: 2049,
      desc: '교차 탄막과 움직이는 벽. 집중 모드가 필요합니다.',
      bossHp: 80,
      densMul: { normal: 1, hard: 1 },
      grades: { normal: { B: 12000, A: 28000, S: 55000 }, hard: { B: 12000, A: 35000, S: 75000 } },
    },
    {
      id: 'zero',
      name: '영점 폭풍',
      sub: '최종 임무 · 4분',
      duration: 240,
      difficulty: 3,
      color: '#ff5c8a',
      seed: 4093,
      desc: '모든 패턴이 겹쳐지는 5단계 생존전입니다.',
      bossHp: 135,
      densMul: { normal: 0.75, hard: 0.62 },
      grades: { normal: { B: 14000, A: 40000, S: 90000 }, hard: { B: 15000, A: 50000, S: 110000 } },
    },
  ];
  G.MISSIONS = M;

  // Mode tuning. Hard = denser + faster + shorter telegraphs + fewer repairs + slower dash regen.
  // The hitbox and graze radius are identical in both modes.
  G.MODES = {
    normal: {
      id: 'normal',
      label: 'NORMAL',
      dens: 1, // event-rate multiplier
      speed: 1, // bullet speed multiplier
      tele: 0.65, // core telegraph before feature volleys (s)
      laserTele: 0.8, // laser lane warning (s)
      dashRegen: 2.8,
      repairs: [2, 4], // section indices that repair one shield
      hp: 1, // boss HP multiplier
      bonus: 1, // bonus score multiplier
    },
    hard: {
      id: 'hard',
      label: 'HARD',
      dens: 1.5,
      speed: 1.12,
      tele: 0.45,
      laserTele: 0.6,
      dashRegen: 3.6,
      repairs: [4], // only at boss start
      hp: 1.15,
      bonus: 1.5,
    },
  };
  G.modeOf = (mode) => G.MODES[mode] || G.MODES.normal;

  const P = {};
  const aim = (e, x, y, ox = e.cx, oy = e.cy) => Math.atan2(y - oy, x - ox);
  // Every pattern tags its bullets with `kind` (renderer colours by kind).
  P.ring = (e, p, o = {}) => {
    const n = o.n || 14,
      a0 = (o.angle || 0) + e.patternClock * (o.spin || 0),
      s = o.speed || 150;
    for (let i = 0; i < n; i++) e.spawn(e.cx, e.cy, a0 + (i * G.TAU) / n, s, { kind: 'ring', ...o });
  };
  // Aimed fan. n is always odd so the centre bullet sits on the aimed angle (no resting safe spot).
  P.fan = (e, p, o = {}) => {
    const n = (o.n || 7) | 1,
      spread = o.spread || 1.1,
      a = aim(e, p.x, p.y),
      s = o.speed || 220;
    for (let i = 0; i < n; i++)
      e.spawn(e.cx, e.cy, a + ((i - (n - 1) / 2) * spread) / Math.max(1, n - 1), s, {
        shape: 'diamond',
        kind: 'fan',
        ...o,
      });
  };
  P.spiral = (e, p, o = {}) => {
    const arms = o.arms || 3,
      a = e.patternClock * (o.spin || 1.7);
    for (let i = 0; i < arms; i++)
      e.spawn(e.cx, e.cy, a + (i * G.TAU) / arms, o.speed || 170, {
        kind: 'spiral',
        ...o,
        curve: (i % 2 ? 1 : -1) * (o.curve || 0.3),
      });
  };
  P.cross = (e, p, o = {}) => {
    const a = e.patternClock * (o.spin || 0.35);
    for (let i = 0; i < 4; i++)
      for (let j = -2; j <= 2; j++)
        e.spawn(e.cx, e.cy, a + (i * Math.PI) / 2 + j * 0.07, o.speed || 185, { kind: 'cross', ...o });
  };
  // Rain: a volley of needles from one side on spaced lanes (never two adjacent lanes).
  P.rain = (e, p, o = {}) => {
    const side = o.side ?? (e.rng() < 0.5 ? 0 : 1),
      x = side ? e.right : e.left,
      a = side ? Math.PI : 0,
      laneH = 52,
      lanes = Math.floor((e.bottom - e.top) / laneH),
      want = o.volley || 5,
      free = [];
    for (let k = 0; k < lanes; k++) free.push(k);
    const used = [];
    while (used.length < want && free.length) {
      const k = free.splice(Math.floor(e.rng() * free.length), 1)[0];
      if (used.some((u) => Math.abs(u - k) < 2)) continue;
      used.push(k);
    }
    const s = o.speed || 250;
    for (const k of used)
      e.spawn(x, e.top + (k + 0.5) * laneH, a + (e.rng() - 0.5) * 0.12, s * (0.85 + e.rng() * 0.3), {
        shape: 'needle',
        kind: 'rain',
        ...o,
      });
  };
  // Wall: orientation alternates in pairs; vertical walls come from the left/right, horizontal walls only from the top (never spawn on the player).
  // The gap centre is 60..230px away from the player (70% toward the arena centre), so the player must move.
  P.wall = (e, p, o = {}) => {
    e.wallN = (e.wallN || 0) + 1;
    const vertical = Math.floor(e.wallN / 2) % 2 === 0,
      step = o.step || 54,
      half = o.gap || 85,
      lo = (vertical ? e.top : e.left) + half,
      hi = (vertical ? e.bottom : e.right) - half,
      pc = vertical ? p.y : p.x;
    let gap = pc;
    for (let tries = 0; tries < 12; tries++) {
      const mid = vertical ? (e.top + e.bottom) / 2 : (e.left + e.right) / 2,
        toward = pc < mid ? 1 : -1,
        off = (60 + e.rng() * 170) * (e.rng() < 0.7 ? toward : -toward),
        g = pc + off;
      if (g >= lo && g <= hi) {
        gap = g;
        break;
      }
      gap = G.clamp(pc - off, lo, hi);
    }
    const opt = { shape: 'block', kind: 'wall', ...o, r: 11 },
      s = o.speed || 170;
    if (vertical) {
      const side = e.rng() < 0.5 ? 0 : 1;
      for (let y = e.top + 6; y < e.bottom; y += step)
        if (Math.abs(y - gap) > half) e.spawn(side ? e.right : e.left, y, side ? Math.PI : 0, s, opt);
    } else {
      for (let x = e.left + 6; x < e.right; x += step)
        if (Math.abs(x - gap) > half) e.spawn(x, e.top, Math.PI / 2, s, opt);
    }
  };
  P.orbit = (e, p, o = {}) => {
    const n = o.n || 10,
      rad = o.radius || 165,
      rot = e.patternClock * 0.55;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * G.TAU) / n,
        x = e.cx + Math.cos(a) * rad,
        y = e.cy + Math.sin(a) * rad;
      e.spawn(x, y, a + ((i % 2 ? 1 : -1) * Math.PI) / 2, o.speed || 115, {
        kind: 'orbit',
        ...o,
        curve: (i % 2 ? 1 : -1) * 0.55,
      });
    }
  };
  // Petal: two interleaved rings curving in opposite directions (a flower that turns both ways).
  P.petal = (e, p, o = {}) => {
    const n = o.n || 12,
      a0 = e.patternClock * (o.spin || 0.6),
      s = o.speed || 140,
      c = o.curve || 0.45;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * G.TAU) / n;
      e.spawn(e.cx, e.cy, a, s, { kind: 'petal', ...o, curve: c });
      e.spawn(e.cx, e.cy, a + Math.PI / n, s, { kind: 'petal', ...o, curve: -c });
    }
  };
  // Converge: bullets spawn on the arena edges and fly toward the core. Spawn points near the player are skipped.
  P.converge = (e, p, o = {}) => {
    const n = o.n || 16,
      W = e.right - e.left,
      H = e.bottom - e.top,
      per = 2 * (W + H),
      off = e.rng() * (per / n),
      s = o.speed || 120;
    for (let i = 0; i < n; i++) {
      let d = (off + (i * per) / n) % per,
        x,
        y;
      if (d < W) (x = e.left + d), (y = e.top + 1);
      else if ((d -= W) < H) (x = e.right - 1), (y = e.top + d);
      else if ((d -= H) < W) (x = e.right - d), (y = e.bottom - 1);
      else (d -= W), (x = e.left + 1), (y = e.bottom - d);
      if (Math.hypot(x - p.x, y - p.y) < (o.safe || 170)) continue;
      e.spawn(x, y, aim(e, e.cx, e.cy, x, y), s, { kind: 'converge', ...o });
    }
  };
  // Laser: a telegraphed lane (engine.warnings, kind 'laser'), then a streak of needles down that lane.
  P.laser = (e, p, o = {}) => {
    const count = o.count || 1,
      base = aim(e, p.x, p.y),
      spread = o.spread || 0.5,
      x = e.cx,
      y = e.cy,
      life = o.tele || 0.8;
    for (let k = 0; k < count; k++) {
      const angle = base + (k - (count - 1) / 2) * spread;
      e.warn({
        kind: 'laser',
        x,
        y,
        w: 26,
        h: 1500,
        angle,
        t: life,
        life,
        color: o.color,
        fire: (en) => {
          const n = o.needles || 9;
          for (let j = 0; j < n; j++)
            en.spawn(x, y, angle, (o.speed || 300) + j * 38, { shape: 'needle', kind: 'laser', ...o });
        },
      });
    }
  };
  G.Patterns = P;

  // Layered timeline: base layer (whole run, low rate) + section feature layer + pressure layer from section 3.
  // Inside a section the feature rate ramps 0.7x -> 1.3x, then drops to 0.4x for the last 2s (breather).
  // The boss (last section) is data: spell cards whose emitters the engine runs (HP-driven, see engine.js).
  G.makeTimeline = (m, mode = 'normal') => {
    const md0 = G.modeOf(mode),
      md = { ...md0, dens: md0.dens * ((m.densMul && m.densMul[md0.id]) || 1) },
      d = m.difficulty,
      D = m.duration,
      bossStart = +(D * 0.75).toFixed(3),
      secT = [0, 0.19, 0.38, 0.57].map((f) => +(f * D).toFixed(3)).concat(bossStart),
      events = [];
    let idx = 0;
    const sp = (s) => +(s * md.speed).toFixed(1);
    const layer = (t0, t1, every, type, opt, cfg = {}) => {
      const ramp = cfg.ramp !== false;
      let t = t0 + (cfg.start || 0);
      while (t < t1 - 0.05) {
        const f = (t - t0) / (t1 - t0);
        let r = ramp ? 0.7 + 0.6 * f : 1;
        if (ramp && t1 - t < 2) r = 0.4;
        const o = typeof opt === 'function' ? opt(f) : opt;
        events.push({ t: +t.toFixed(3), type, opt: { ...o, index: idx++, warn: !!cfg.warn } });
        t += every / (r * md.dens);
      }
    };
    const [s0, s1, s2, s3] = secT;
    // base ambient ring for the whole pre-boss run
    layer(2.5, bossStart, 3.4 - d * 0.4, 'ring', { n: 6 + 2 * d, speed: sp(95 + d * 8), spin: 0.37, color: '#5a6b9c' }, { ramp: false });
    // section 1: aimed fans
    layer(s0 + 1.2, s1, 1.5 - d * 0.12, 'fan', { n: 3 + d + (d > 1 ? 1 : 0), speed: sp(125 + d * 12), spread: 0.45 + d * 0.18, color: '#4deeea' }, { warn: true });
    // section 2: spirals (+ slow fan pressure)
    layer(s1, s2, 0.62 - d * 0.06, 'spiral', { arms: 2 + d, speed: sp(125 + d * 12), color: '#a66cff', curve: 0.16, spin: 1.5 });
    layer(s1 + 1, s2, 3.2 - d * 0.3, 'fan', { n: 3 + d, speed: sp(120 + d * 10), spread: 0.35 + d * 0.15, color: '#4deeea' }, { warn: true });
    // section 3: walls + pressure fans
    layer(s2, s3, 3.0 - d * 0.15, 'wall', { speed: sp(130 + d * 14), color: '#4b8cff', step: 66 - d * 4 }, { warn: true });
    layer(s2 + 0.8, s3, 2.4 - d * 0.15, 'fan', { n: 3 + d, speed: sp(125 + d * 10), spread: 0.35 + d * 0.15, color: '#4deeea' }, { warn: true });
    // section 4: rain volleys + spiral pressure
    layer(s3, bossStart, 1.25 - d * 0.1, 'rain', { volley: 3 + d, speed: sp(175 + d * 15), color: '#ff5c8a' });
    layer(s3 + 1, bossStart, 1.1 - d * 0.1, 'spiral', { arms: 1 + d, speed: sp(115 + d * 10), color: '#a66cff', curve: 0.12, spin: 1.1 });
    events.sort((a, b) => a.t - b.t || a.opt.index - b.opt.index);

    // Boss spell cards. `every` is already divided by mode density.
    const ev = (every) => +(every / md.dens).toFixed(3);
    const petal = {
      name: '공명 꽃잎',
      emit: [
        { type: 'petal', every: ev(1.3 - d * 0.1), opt: { n: 7 + d * 2, speed: sp(110 + d * 10), spin: 0.6, curve: 0.4, color: '#ffd166' } },
        { type: 'fan', every: ev(2.4 - d * 0.2), opt: { n: 3, speed: sp(150 + d * 10), spread: 0.4, color: '#4deeea' } },
      ],
    };
    const grid = {
      name: '격자 붕괴',
      emit: [
        { type: 'laser', every: ev(1.7 - d * 0.15), opt: { count: d >= 2 ? 3 : 2, spread: 0.55, speed: sp(320), tele: md.laserTele, color: '#ff5c8a' } },
        { type: 'ring', every: ev(2.0 - d * 0.2), opt: { n: 8 + d * 2, speed: sp(105 + d * 10), spin: 0.5, color: '#4b8cff' } },
      ],
    };
    const conv = {
      name: '영점 수렴',
      emit: [
        { type: 'converge', every: ev(2.0 - d * 0.2), opt: { n: 14 + d * 4, speed: sp(105 + d * 8), color: '#a66cff' } },
        { type: 'spiral', every: ev(0.75 - d * 0.08), opt: { arms: 2 + d, speed: sp(115 + d * 8), curve: 0.14, spin: 1.3, color: '#ffd166' } },
      ],
    };
    const cards = d === 1 ? [petal, grid] : [petal, grid, conv];
    const finalLen = d === 1 ? 6 : 8,
      cardLen = +((D - bossStart - finalLen) / cards.length).toFixed(3);
    const spells = cards.map((c) => ({ ...c, dur: cardLen }));
    spells.push({
      name: '제로 시그널',
      final: true,
      emit: [
        { type: 'petal', every: ev(1.5 - d * 0.1), opt: { n: 6 + d * 2, speed: sp(120 + d * 10), spin: 0.8, curve: 0.35, color: '#ff5c8a' } },
        { type: 'fan', every: ev(1.8 - d * 0.2), opt: { n: 3 + d * 2, speed: sp(160 + d * 10), spread: 0.7, color: '#4deeea' } },
        { type: 'converge', every: ev(3.4 - d * 0.3), opt: { n: 10 + d * 4, speed: sp(110), color: '#a66cff' } },
      ],
    });
    return {
      mode: md.id,
      events,
      bossStart,
      bossHp: Math.round((m.bossHp || 100) * md.hp),
      spells,
      afterglow: { type: 'ring', every: 1.8, opt: { n: 8, speed: sp(100), spin: 0.4, color: '#5a6b9c' } },
      sections: [
        { t: s0, name: '접속' },
        { t: s1, name: '나선 간섭' },
        { t: s2, name: '차단벽' },
        { t: s3, name: '적색 폭우' },
        { t: bossStart, name: '코어 개방' },
      ],
    };
  };

  // ---- grading (pure data helpers, used by screens.js) ----
  const ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'];
  G.GRADE_ORDER = ORDER;
  // D = not cleared. C/B/A/S by score thresholds (per mission/mode). A needs <=1 hit, S needs 0 hits.
  // SS = S + no dash used.
  G.gradeRun = (s, m, mode = 'normal') => {
    if (!s.clear) return 'D';
    const th = (m.grades && (m.grades[mode] || m.grades.normal)) || { B: 0, A: 0, S: 0 };
    if (s.hits === 0 && s.score >= th.S) return s.dashes === 0 ? 'SS' : 'S';
    if (s.hits <= 1 && s.score >= th.A) return 'A';
    if (s.score >= th.B) return 'B';
    return 'C';
  };
  // Medals (pure data, for the select card): ids that this run earned.
  G.runMedals = (s) => {
    const out = [];
    if (s.clear) out.push('clear');
    if (s.clear && s.hits === 0) out.push('nohit');
    if (s.grazes >= 150) out.push('graze150');
    if (s.clear && s.dashes === 0) out.push('nodash');
    if (s.bossBroken) out.push('boss');
    return out;
  };
  const fmt = (n) => Math.max(0, Math.ceil(n)).toLocaleString('ko-KR');
  // One short Korean hint for the results screen.
  G.nextGoal = (s, m, mode = 'normal') => {
    const th = (m.grades && (m.grades[mode] || m.grades.normal)) || { B: 0, A: 0, S: 0 },
      g = s.grade || G.gradeRun(s, m, mode);
    if (!s.clear) return `${fmt(m.duration - s.time)}초 더 버티면 클리어`;
    if (g === 'C') return `B까지 ${fmt(th.B - s.score)}점`;
    if (g === 'B') return s.hits > 1 ? '피격 1회 이하로 A 도전' : `A까지 ${fmt(th.A - s.score)}점`;
    if (g === 'A') return s.hits > 0 ? '무피격으로 S 도전' : `S까지 ${fmt(th.S - s.score)}점`;
    if (g === 'S') return '대시 없이 무피격이면 SS';
    if (!s.bossBroken) return '코어 HP를 모두 깎아 격파하기';
    return mode === 'hard' ? '완벽한 신호. 점수 갱신에 도전' : 'HARD 모드에 도전';
  };
})();
