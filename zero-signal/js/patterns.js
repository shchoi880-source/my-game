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
  //
  // G.makeTimeline(m, mode, o = {}) — with o = {} (every mission) the output is unchanged.
  // SIGNAL RUN sector options (see G.SECTORS / js/run.js):
  //   o.features ['fan'|'spiral'|'wall'|'rain', ...]  feature layers for the whole sector (no fixed sections)
  //   o.laser / o.pressure  extra laser lane layer / spiral pressure layer
  //   o.boss === false      no boss (bossStart = Infinity, spells = [])   (implied by o.features)
  //   o.bossOnly            boss fight from t = 2s (3 spell cards + final '제로 시그널')
  //   o.elite               sector ends with a 14s mini-boss card (Depth 7)
  //   o.densMul, o.speedMul, o.teleDelta, o.bossHpMul, o.hardSpells (depth rules), o.name (section name)
  const spellCards = (md, d, sp) => {
    const ev = (every) => +(every / md.dens).toFixed(3);
    return {
      petal: {
        name: '공명 꽃잎',
        emit: [
          { type: 'petal', every: ev(1.3 - d * 0.1), opt: { n: 7 + d * 2, speed: sp(110 + d * 10), spin: 0.6, curve: 0.4, color: '#ffd166' } },
          { type: 'fan', every: ev(2.4 - d * 0.2), opt: { n: 3, speed: sp(150 + d * 10), spread: 0.4, color: '#4deeea' } },
        ],
      },
      grid: {
        name: '격자 붕괴',
        emit: [
          { type: 'laser', every: ev(1.7 - d * 0.15), opt: { count: d >= 2 ? 3 : 2, spread: 0.55, speed: sp(320), tele: md.laserTele, color: '#ff5c8a' } },
          { type: 'ring', every: ev(2.0 - d * 0.2), opt: { n: 8 + d * 2, speed: sp(105 + d * 10), spin: 0.5, color: '#4b8cff' } },
        ],
      },
      conv: {
        name: '영점 수렴',
        emit: [
          { type: 'converge', every: ev(2.0 - d * 0.2), opt: { n: 14 + d * 4, speed: sp(105 + d * 8), color: '#a66cff' } },
          { type: 'spiral', every: ev(0.75 - d * 0.08), opt: { arms: 2 + d, speed: sp(115 + d * 8), curve: 0.14, spin: 1.3, color: '#ffd166' } },
        ],
      },
      final: {
        name: '제로 시그널',
        final: true,
        emit: [
          { type: 'petal', every: ev(1.5 - d * 0.1), opt: { n: 6 + d * 2, speed: sp(120 + d * 10), spin: 0.8, curve: 0.35, color: '#ff5c8a' } },
          { type: 'fan', every: ev(1.8 - d * 0.2), opt: { n: 3 + d * 2, speed: sp(160 + d * 10), spread: 0.7, color: '#4deeea' } },
          { type: 'converge', every: ev(3.4 - d * 0.3), opt: { n: 10 + d * 4, speed: sp(110), color: '#a66cff' } },
        ],
      },
    };
  };
  const makeLayer = (events, md) => {
    let idx = 0;
    return (t0, t1, every, type, opt, cfg = {}) => {
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
  };
  // Sector tuning knobs (tools/balance.js --run). fw = interval factor for each of the 2 overlapping features.
  G.SECTOR_TUNE = { fw: 1, fan: 1.7, spiral: 1.2, wall: 1.4, rain: 1.4, laserEvery: 3.6, pressureEvery: 2.4, eliteHp: 30 };
  const sectorTimeline = (m, mode, o) => {
    const md0 = G.modeOf(mode),
      md = { ...md0, dens: md0.dens * (o.densMul || 1), speed: md0.speed * (o.speedMul || 1) },
      d = m.difficulty,
      D = m.duration,
      T = G.SECTOR_TUNE,
      events = [],
      layer = makeLayer(events, md),
      sp = (s) => +(s * md.speed).toFixed(1),
      R = Math.round,
      fw = T.fw,
      laserTele = Math.max(0.3, md.laserTele + (o.teleDelta || 0));
    let bossStart = Infinity,
      spells = [],
      bossHp = 0;
    const end = o.bossOnly ? 0 : o.elite ? D - 14 : D;
    if (!o.bossOnly) {
      layer(2.5, end, (3.4 - d * 0.4) * 1.15, 'ring', { n: R(6 + 2 * d), speed: sp(95 + d * 8), spin: 0.37, color: '#5a6b9c' }, { ramp: false });
      const F = {
        fan: () => layer(1.2, end, (1.5 - d * 0.12) * fw * T.fan, 'fan', { n: R(3 + d) + (d > 1 ? 1 : 0), speed: sp(125 + d * 12), spread: 0.45 + d * 0.18, color: '#4deeea' }, { warn: true }),
        spiral: () => layer(1.5, end, (0.62 - d * 0.06) * fw * T.spiral, 'spiral', { arms: R(1.5 + d), speed: sp(125 + d * 12), color: '#a66cff', curve: 0.16, spin: 1.5 }),
        wall: () => layer(2, end, (3.0 - d * 0.15) * fw * T.wall, 'wall', { speed: sp(130 + d * 14), color: '#4b8cff', step: R(66 - d * 4) }, { warn: true }),
        rain: () => layer(1.5, end, (1.25 - d * 0.1) * fw * T.rain, 'rain', { volley: R(3 + d), speed: sp(175 + d * 15), color: '#ff5c8a' }),
      };
      for (const f of o.features || []) if (F[f]) F[f]();
      if (o.laser)
        layer(4, end, T.laserEvery - d * 0.3, 'laser', { count: d >= 2.5 ? 2 : 1, spread: 0.6, speed: sp(300), tele: laserTele, color: '#ff5c8a' });
      if (o.pressure)
        layer(3, end, T.pressureEvery - d * 0.2, 'spiral', { arms: R(d), speed: sp(110 + d * 8), color: '#a66cff', curve: 0.12, spin: 1.1 });
      events.sort((a, b) => a.t - b.t || a.opt.index - b.opt.index);
    }
    const mdS = o.hardSpells
        ? { ...md, dens: md.dens * G.MODES.hard.dens * 0.85, speed: md.speed * G.MODES.hard.speed, laserTele: G.MODES.hard.laserTele }
        : { ...md, laserTele },
      spS = (s) => +(s * mdS.speed).toFixed(1),
      di = R(d),
      C = spellCards(mdS, di, spS);
    if (o.bossOnly) {
      bossStart = 2;
      const cards = [C.petal, C.grid, C.conv],
        finalLen = 10,
        cardLen = +((D - bossStart - finalLen) / cards.length).toFixed(3);
      spells = cards.map((c) => ({ ...c, dur: cardLen }));
      spells.push(C.final);
      bossHp = Math.round((m.bossHp || 100) * md.hp * (o.bossHpMul || 1));
    } else if (o.elite) {
      bossStart = end;
      spells = [{ ...C.grid, name: '정예 격자', final: true }];
      bossHp = Math.round(T.eliteHp * (o.bossHpMul || 1));
    }
    const sections = [{ t: 0, name: o.name || m.name }];
    if (o.elite) sections.push({ t: bossStart, name: '정예 코어' });
    return {
      mode: md.id,
      events,
      bossStart,
      bossHp,
      spells,
      afterglow: { type: 'ring', every: 1.8, opt: { n: 8, speed: sp(100), spin: 0.4, color: '#5a6b9c' } },
      sections,
      sector: true,
    };
  };
  G.makeTimeline = (m, mode = 'normal', o = {}) => {
    if (o.features || o.bossOnly || o.boss === false) return sectorTimeline(m, mode, o);
    const md0 = G.modeOf(mode),
      md = { ...md0, dens: md0.dens * ((m.densMul && m.densMul[md0.id]) || 1) },
      d = m.difficulty,
      D = m.duration,
      bossStart = +(D * 0.75).toFixed(3),
      secT = [0, 0.19, 0.38, 0.57].map((f) => +(f * D).toFixed(3)).concat(bossStart),
      events = [],
      layer = makeLayer(events, md);
    const sp = (s) => +(s * md.speed).toFixed(1);
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
    const C = spellCards(md, d, sp);
    const cards = d === 1 ? [C.petal, C.grid] : [C.petal, C.grid, C.conv];
    const finalLen = d === 1 ? 6 : 8,
      cardLen = +((D - bossStart - finalLen) / cards.length).toFixed(3);
    const spells = cards.map((c) => ({ ...c, dur: cardLen }));
    spells.push(C.final);
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
  // ---- SIGNAL RUN data (pure; js/run.js drives it) --------------------------------
  // Sectors of one run. diff = makeTimeline difficulty; pick = how many features are drawn from `pool`
  // (`fixed` ones always included). densMul trims density (like mission densMul). After sectors 1-4 comes a draft; after sector 3 also the cache (shop).
  G.SECTORS = [
    { name: '수신', dur: 40, diff: 1.0, fixed: ['fan'], pool: ['spiral', 'wall'], pick: 1, color: '#4deeea' },
    { name: '간섭', dur: 45, diff: 1.5, fixed: [], pool: ['fan', 'spiral', 'wall', 'rain'], pick: 2, color: '#a66cff' },
    { name: '균열', dur: 50, diff: 2.0, fixed: [], pool: ['fan', 'spiral', 'wall', 'rain'], pick: 2, laser: true, color: '#4b8cff' },
    { name: '폭풍', dur: 55, diff: 2.5, fixed: [], pool: ['fan', 'spiral', 'wall', 'rain'], pick: 2, pressure: true, densMul: 0.85, color: '#ff5c8a' },
    { name: '코어', dur: 70, diff: 3.0, boss: true, bossHp: 140, densMul: 0.75, color: '#ffd166' },
  ];
  G.FEATURE_NAMES = { fan: '부채꼴', spiral: '나선', wall: '차단벽', rain: '폭우', laser: '레이저', pressure: '압박' };

  // Depth (ascension) rules — cumulative. Clearing Depth N unlocks N+1.
  G.DEPTHS = [
    { n: 0, name: '기본', desc: '규칙 없음' },
    { n: 1, name: '밀도 상승', desc: '탄막 밀도 +8%' },
    { n: 2, name: '희귀 신호 감소', desc: '희귀 이상 카드 확률 −5%p' },
    { n: 3, name: '수리 없음', desc: '2섹터 후 보호막 수리 없음' },
    { n: 4, name: '가속', desc: '탄속 +6%' },
    { n: 5, name: '짧은 경고', desc: '레이저 경고 −0.08초' },
    { n: 6, name: '강화 코어', desc: '코어 HP +20%' },
    { n: 7, name: '정예 섹터', desc: '3섹터 끝에 정예 코어' },
    { n: 8, name: '얇은 장갑', desc: '보호막 2개로 시작' },
    { n: 9, name: '비싼 캐시', desc: '캐시 가격 +50%' },
    { n: 10, name: '제로 시그널', desc: 'HARD 스펠 카드' },
  ];
  G.depthRules = (n) => {
    n = Math.max(0, Math.min(10, n | 0));
    return {
      depth: n,
      densMul: n >= 1 ? 1.08 : 1,
      rarityRPenalty: n >= 2 ? 5 : 0,
      repair: n < 3,
      speedMul: n >= 4 ? 1.06 : 1,
      teleDelta: n >= 5 ? -0.08 : 0,
      bossHpMul: n >= 6 ? 1.2 : 1,
      elite: n >= 7,
      shields0: n >= 8 ? 2 : 3,
      cacheMul: n >= 9 ? 1.5 : 1,
      hardSpells: n >= 10,
    };
  };

  // Perks. rar C/R/E/L/G(glitch). tag GRAZE/DASH/FLOW/CORE (3 of a tag = resonance). stack = max copies.
  // mod(k, n) edits the engine tunables (n = copies); hooks run inside the engine (see engine.js hook()).
  // NO perk touches the hitbox (player.hit) or deletes bullets except around the dash (nova) / a lethal hit (zero).
  // price = Archive cost in ◆ (0 = starter pool).
  const PK = [
    { id: 'wide', name: '넓은 수신', rar: 'C', tag: 'GRAZE', icon: 'radar', stack: 2, price: 0,
      desc: '스치기 범위 +4px (27→31, 2중첩 35)', mod: (k, n) => (k.grazeR += 4 * n) },
    { id: 'echo', name: '잔향 콤보', rar: 'C', tag: 'FLOW', icon: 'echo', stack: 2, price: 0,
      desc: '콤보 유지 시간 +0.8초 (2.5→3.3초)', mod: (k, n) => (k.comboT += 0.8 * n) },
    { id: 'cell', name: '예비 전지', rar: 'C', tag: 'DASH', icon: 'battery', stack: 2, price: 0,
      desc: '대시 충전 시간 −15% (중첩 가능)', mod: (k, n) => (k.dashRegenMul *= Math.pow(0.85, n)) },
    { id: 'amp', name: '증폭기', rar: 'C', tag: 'GRAZE', icon: 'amp', stack: 2, price: 0,
      desc: '스치기 점수 +30%', mod: (k, n) => (k.grazeMul += 0.3 * n) },
    { id: 'coil', name: '과열 코일', rar: 'C', tag: 'FLOW', icon: 'coil', stack: 2, price: 0,
      desc: '폭주 게이지: 스치기 3.5→4.5, 대시 관통 2.5→3.5', mod: (k, n) => ((k.eGraze += n), (k.ePhase += n)) },
    { id: 'long', name: '긴 폭주', rar: 'C', tag: 'FLOW', icon: 'flame', stack: 2, price: 60,
      desc: '폭주 지속 5→6.5초', mod: (k, n) => (k.odDur += 1.5 * n) },
    { id: 'third', name: '세 번째 충전', rar: 'R', tag: 'DASH', icon: 'dash3', stack: 1, price: 0,
      desc: '대시 최대 충전 2→3회', mod: (k) => (k.dashMax = 3) },
    { id: 'mend', name: '스침 수선', rar: 'R', tag: 'GRAZE', icon: 'needle', stack: 1, price: 60,
      desc: '한 섹터에서 무피격으로 60회 스치면 보호막 +1 (섹터당 1회)',
      hooks: {
        onGraze(e, q, st) {
          if (!st.done && e.hits === 0 && e.grazes >= 60) {
            st.done = true;
            if (e.repair()) e.proc('mend');
          }
        },
      } },
    { id: 'reso', name: '공명탄', rar: 'R', tag: 'CORE', icon: 'core', stack: 1, price: 0,
      desc: '코어 피해: 스치기 1→2, 대시 관통 3→4', mod: (k) => ((k.bossDmgGraze = 2), (k.bossDmgPhase = 4)) },
    { id: 'stasis', name: '정지장', rar: 'R', tag: 'FLOW', icon: 'snow', stack: 1, price: 80,
      desc: '폭주 중 탄속 감속 0.78→0.70', mod: (k) => (k.odSlow = 0.7) },
    { id: 'nova', name: '대시 충격파', rar: 'R', tag: 'DASH', icon: 'burst', stack: 1, price: 0,
      desc: '대시가 끝날 때 반경 70px 탄환 소거 (재사용 6초)',
      hooks: {
        onDashEnd(e, a, st) {
          if (e.time - (st.last ?? -99) < 6) return;
          st.last = e.time;
          e.clearAround(e.player.x, e.player.y, 70);
          e.proc('nova');
        },
      } },
    { id: 'hard', name: '하드라이트', rar: 'E', tag: 'CORE', icon: 'shield', stack: 1, price: 140,
      desc: '최대 보호막 3→4, 즉시 보호막 +1', mod: (k) => (k.shieldMax += 1), now: { shields: 1 } },
    { id: 'mirror', name: '거울 스침', rar: 'E', tag: 'GRAZE', icon: 'mirror', stack: 1, price: 100,
      desc: '스치기의 20%가 콤보 +2 추가',
      hooks: {
        onGraze(e) {
          if (e.prng() < 0.2) {
            e.combo += 2;
            e.maxCombo = Math.max(e.maxCombo, e.combo);
            e.proc('mirror');
          }
        },
      } },
    { id: 'crit', name: '임계 FLOW', rar: 'E', tag: 'FLOW', icon: 'crown', stack: 1, price: 160,
      desc: '콤보 80에 x5, 콤보 150에 새 등급 x6',
      mod: (k) => (k.tiers = [[150, 6], [80, 5], [50, 4], [25, 3], [10, 2]]) },
    { id: 'zero', name: '제로 포인트', rar: 'L', tag: 'CORE', icon: 'zero', stack: 1, price: 260,
      desc: '런당 1회, 치명타를 맞으면 보호막 1 + 2초 무적 + 주변 탄환 소거',
      hooks: {
        onLethal(e) {
          if (e.flags.zeroUsed) return false;
          e.flags.zeroUsed = true;
          e.player.shields = 1;
          e.player.invuln = 2;
          e.proc('zero');
          return true;
        },
      } },
    { id: 'prism', name: '프리즘 코어', rar: 'L', tag: 'GRAZE', icon: 'prism', stack: 1, price: 220,
      desc: '폭주 중 스치기 점수 x3, 스칠 때마다 폭주 +0.1초 (최대 +3초)',
      mod: (k) => (k.odGrazeMul = 3),
      hooks: {
        onOverdrive(e, a, st) {
          st.ext = 0;
        },
        onGraze(e, q, st) {
          if (e.overdrive > 0 && (st.ext || 0) < 3) {
            e.overdrive += 0.1;
            st.ext = (st.ext || 0) + 0.1;
          }
        },
      } },
    { id: 'g_over', name: '과부하', rar: 'G', tag: 'GLITCH', icon: 'glitch', stack: 1, price: 80, glitch: true,
      desc: '탄속 +8% · 점수 x1.35', mod: (k) => ((k.speedMul *= 1.08), (k.scoreMul *= 1.35)) },
    { id: 'g_glass', name: '유리 대포', rar: 'G', tag: 'GLITCH', icon: 'glass', stack: 1, price: 80, glitch: true,
      desc: '최대 보호막 −1 · 점수 x1.6',
      mod: (k) => ((k.shieldMax = Math.max(1, k.shieldMax - 1)), (k.scoreMul *= 1.6)) },
  ];
  G.PERKS = PK;
  G.STARTER_PERKS = PK.filter((p) => !p.price).map((p) => p.id);
  // Resonance: 3 perks of one tag. Pseudo-perks with id 'res:TAG' (engine hooks / mods like perks).
  G.RESONANCE = {
    GRAZE: { id: 'res:GRAZE', tag: 'GRAZE', name: '스침 공명', desc: '콤보가 끊겨도 절반이 아닌 25%만 감소',
      mod: (k) => (k.comboKeep = 0.75) },
    DASH: { id: 'res:DASH', tag: 'DASH', name: '대시 공명', desc: '스치기 40회마다 대시 1회 충전',
      hooks: {
        onGraze(e) {
          const p = e.player;
          if (e.grazes % 40 === 0 && p.dashes < e.k.dashMax) {
            p.dashes++;
            e.events.push({ type: 'dashReady' });
            e.proc('res:DASH');
          }
        },
      } },
    FLOW: { id: 'res:FLOW', tag: 'FLOW', name: '흐름 공명', desc: '폭주 시작마다 파편 +2',
      hooks: {
        onOverdrive(e) {
          e.shard(2, 'flow');
          e.proc('res:FLOW');
        },
      } },
    CORE: { id: 'res:CORE', tag: 'CORE', name: '코어 공명', desc: '스펠 카드 격파 시 피격 1회 이하면 보호막 수리',
      mod: (k) => (k.capRepairHits = 1) },
  };
  const BY = {};
  for (const p of PK) BY[p.id] = p;
  for (const t in G.RESONANCE) BY[G.RESONANCE[t].id] = G.RESONANCE[t];
  G.perkDef = (id) => BY[id] || null;
  G.RARITY = {
    C: { name: '일반', color: '#9aa7bd', rank: 0 },
    R: { name: '희귀', color: '#4deeea', rank: 1 },
    E: { name: '영웅', color: '#a66cff', rank: 2 },
    L: { name: '전설', color: '#ffd166', rank: 3 },
    G: { name: '글리치', color: '#ff3b6b', rank: -1 },
  };
})();
