'use strict';
(() => {
  // =====================================================================
  //  곱셈 디펜스 v2
  // =====================================================================
  const W = 420, H = 760;          // 논리 해상도 (세로)
  const SQUAD_Y = 678;             // 분대 위치
  const DEFENSE_Y = 612;           // 방어선
  const GATE_H = 62;
  const SCROLL = 95;               // 게이트/상자 이동 속도
  const STAGE_LEN = 40;            // 보스 등장까지 시간(초)
  const MAX_N = 1e12;
  const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    canvas.width = Math.floor(W * scale * dpr);
    canvas.height = Math.floor(H * scale * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ===== 유틸 =====
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

  function text(str, x, y, size, color, o) {
    o = o || {};
    ctx.font = `${o.weight || 900} ${size}px ${FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.stroke;
      ctx.strokeStyle = o.strokeColor || 'rgba(0,0,0,0.65)';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function hpPill(x, y, str, size) {
    size = size || 13;
    ctx.font = `900 ${size}px ${FONT}`;
    const w = ctx.measureText(str).width + 12;
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    rr(x - w / 2, y - size * 0.7, w, size * 1.4, size * 0.7);
    ctx.fill();
    text(str, x, y + 1, size, '#fff');
  }

  // ===== 저장 데이터 =====
  const DEFAULT_SAVE = { best: 0, bestStage: 0, coins: 0, muted: false, up: { troops: 0, power: 0, bonus: 0 } };
  let SAVE = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    const raw = JSON.parse(localStorage.getItem('mdef-save') || 'null');
    if (raw && typeof raw === 'object') {
      SAVE = Object.assign(SAVE, raw);
      SAVE.up = Object.assign({ troops: 0, power: 0, bonus: 0 }, raw.up || {});
    }
  } catch (e) { /* 저장 불가 환경 */ }
  function persist() { try { localStorage.setItem('mdef-save', JSON.stringify(SAVE)); } catch (e) { /* 무시 */ } }

  const UPGRADES = [
    { key: 'troops', name: '시작 병력', max: 25, eff: l => `${5 + l * 3}명`, cost: l => Math.round(25 * Math.pow(1.55, l)) },
    { key: 'power', name: '기본 화력', max: 25, eff: l => `+${l * 20}%`, cost: l => Math.round(35 * Math.pow(1.6, l)) },
    { key: 'bonus', name: '코인 보너스', max: 15, eff: l => `+${l * 15}%`, cost: l => Math.round(50 * Math.pow(1.75, l)) },
  ];
  const startN = () => 5 + SAVE.up.troops * 3;
  const powerMul = () => 1 + SAVE.up.power * 0.2;
  const coinMul = () => 1 + SAVE.up.bonus * 0.15;

  // ===== 사운드 (WebAudio 합성, 파일 없음) =====
  const Sound = (() => {
    let ac = null, master = null, noiseBuf = null;
    const last = {};
    function init() {
      if (ac) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.32;
        master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.8), ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    }
    const ok = () => ac && !SAVE.muted;
    function throttle(key, ms) {
      const now = performance.now();
      if (last[key] && now - last[key] < ms) return false;
      last[key] = now;
      return true;
    }
    function tone(freq, dur, type, vol, slide, delay) {
      if (!ok()) return;
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(vol || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, freq) {
      if (!ok()) return;
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq || 1500, t);
      f.frequency.exponentialRampToValueAtTime(60, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur);
    }
    return {
      init,
      resume() { if (ac && ac.state === 'suspended') ac.resume(); },
      shoot() { if (throttle('shoot', 110)) tone(900, 0.035, 'square', 0.025, 0.5); },
      hit() { if (throttle('hit', 60)) tone(240, 0.05, 'triangle', 0.05, 0.6); },
      kill() { if (throttle('kill', 45)) { tone(520, 0.09, 'square', 0.06, 1.9); noise(0.08, 0.08, 3000); } },
      coin() { if (throttle('coin', 70)) { tone(1320, 0.05, 'square', 0.035); tone(1760, 0.08, 'square', 0.035, 1, 0.05); } },
      good() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.07, 1, i * 0.05)); },
      bad() { [392, 311, 233].forEach((f, i) => tone(f, 0.16, 'sawtooth', 0.07, 1, i * 0.07)); },
      hurt() { if (throttle('hurt', 120)) { noise(0.25, 0.3, 900); tone(110, 0.25, 'sawtooth', 0.1, 0.5); } },
      warn() { for (let i = 0; i < 4; i++) { tone(440, 0.22, 'sawtooth', 0.09, 1.6, i * 0.4); tone(330, 0.18, 'square', 0.05, 1, i * 0.4 + 0.2); } },
      boom() { noise(0.9, 0.55, 1200); tone(80, 0.8, 'sine', 0.35, 0.3); },
      slam() { noise(0.45, 0.45, 600); tone(60, 0.4, 'sine', 0.3, 0.5); },
      fire() { if (throttle('fire', 100)) { noise(0.25, 0.12, 2500); tone(260, 0.2, 'sawtooth', 0.05, 0.5); } },
      power() { [440, 554, 659, 880, 1108].forEach((f, i) => tone(f, 0.1, 'triangle', 0.1, 1, i * 0.05)); },
      click() { tone(660, 0.05, 'square', 0.05); },
      lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 1, i * 0.18)); },
      win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.08, 1, i * 0.09)); },
    };
  })();

  // ===== 몬스터 / 보스 정의 =====
  const ENEMY = {
    slime: { hp: 1.0, sp: 44, r: 18, coin: 1, leak: 0.08, color: '#5fd35f', light: '#a8f59a', dark: '#2a7d35' },
    bat: { hp: 0.45, sp: 80, r: 14, coin: 1, leak: 0.05, color: '#9c6bff', light: '#cdb2ff', dark: '#4b2a9c' },
    golem: { hp: 3.2, sp: 25, r: 26, coin: 3, leak: 0.2, color: '#97a0b4', light: '#c9d0de', dark: '#4d5468' },
    splitter: { hp: 1.4, sp: 38, r: 21, coin: 2, leak: 0.12, color: '#ff9a3c', light: '#ffd09a', dark: '#a8520c' },
  };
  const BOSSES = [
    { kind: 'king', name: '킹 슬라임', color: '#4ccf5a', light: '#b4f7a6', dark: '#1f7a2c', r: 58 },
    { kind: 'demon', name: '화염 악마', color: '#e2433f', light: '#ff9a7a', dark: '#6e1210', r: 50 },
    { kind: 'titan', name: '바위 거인', color: '#8d96a8', light: '#c5ccd9', dark: '#454c5e', r: 58 },
  ];
  const CRATES = {
    rate: { label: '연사', color: '#4fc3ff', max: 5 },
    dmg: { label: '화력', color: '#ff7a45', max: 10 },
    spread: { label: '확산', color: '#b48cff', max: 4 },
    pierce: { label: '관통', color: '#7dff8a', max: 3 },
  };

  // ===== 게임 상태 =====
  let S;

  function makeDeco() {
    const arr = [];
    for (let i = 0; i < 28; i++) arr.push({ x: rand(22, W - 22), y: rand(0, H), k: randi(0, 2), s: rand(0.6, 1.3) });
    return arr;
  }

  function setBanner(textStr, sub, color, dur, blink) {
    S.banner = { text: textStr, sub: sub || '', color: color || '#fff', t: dur || 2, dur: dur || 2, blink: !!blink };
  }

  function newRun(mode) {
    S = {
      mode: mode || 'play', t: 0, n: startN(), px: W / 2, tx: W / 2,
      stage: 1, stageT: 0, phase: 'wave', phaseT: 0, boss: null,
      bullets: [], enemies: [], gates: [], crates: [], shots: [], hazards: [],
      parts: [], texts: [], coinFx: [],
      wl: { rate: 0, dmg: 0, spread: 0, pierce: 0 },
      fireT: 0, spawnT: 2.2, gateT: 0.8, crateT: 8,
      coins: 0, score: 0, kills: 0, earned: 0, newBest: false,
      shake: 0, hurt: 0, white: 0, hitStop: 0, scroll: 0, id: 0, overT: 0,
      banner: null, deco: makeDeco(),
    };
    if (S.mode === 'play') setBanner('STAGE 1', '몬스터를 막아라!', '#fff', 2.2);
  }

  function startRun() { newRun('play'); }
  function toTitle() { newRun('title'); }

  // 난이도: 스테이지와 진행도에 따라 상승
  const diff = () => 1.0 * Math.pow(1.7, S.stage - 1) * (1 + (S.phase === 'wave' ? S.stageT / STAGE_LEN : 1) * 0.6);
  // 몬스터 기준 체력: 병력이 많을수록 강해지지만 병력보다는 덜 가파르게 (병력을 불릴수록 유리)
  const stageBase = () => Math.pow(Math.max(1, S.n), 0.9) * diff() + S.stage * 2;
  const squadR = () => 8 + 6 * Math.sqrt(Math.min(S.n, 60));

  // ===== 이펙트 =====
  function burst(x, y, color, n, speed, size) {
    for (let i = 0; i < n && S.parts.length < 600; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1) * (speed || 240);
      const life = rand(0.35, 0.8);
      S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size || rand(3, 6) });
    }
  }
  function addText(x, y, str, color, size) {
    S.texts.push({ x, y, text: str, color, size, t: 1 });
  }
  function coinFx(x, y, n) {
    for (let i = 0; i < n && S.coinFx.length < 40; i++) {
      S.coinFx.push({ sx: x + rand(-10, 10), sy: y + rand(-10, 10), t: -i * 0.04, d: rand(0.45, 0.7) });
    }
  }

  // ===== 게이트 =====
  const isGood = o => o.op === '+' || o.op === '×';
  const opText = o => o.op + fmt(o.v);

  function goodOp() {
    const s = S.stage, r = Math.random();
    if (r < 0.5) return { op: '+', v: randi(3 + s * 3, 8 + s * 7), pulse: 0 };
    if (r < 0.85) return { op: '×', v: Math.random() < 0.65 ? 2 : 3, pulse: 0 };
    if (r < 0.97) return { op: '×', v: 5, pulse: 0 };
    return { op: '×', v: 10, pulse: 0 };
  }
  function minusOp() { const s = S.stage; return { op: '−', v: randi(3 + s * 3, 6 + s * 6), pulse: 0 }; }
  function badOp() { return Math.random() < 0.6 ? minusOp() : { op: '÷', v: pick([2, 2, 3]), pulse: 0 }; }

  function spawnGate() {
    if (S.crates.some(c => c.y < 100)) { S.gateT = 1.2; return; }
    let a, b;
    const r = Math.random();
    if (r < 0.55) { a = goodOp(); b = badOp(); }
    else if (r < 0.88) { a = goodOp(); b = goodOp(); }
    else { a = minusOp(); b = minusOp(); }
    if (Math.random() < 0.5) [a, b] = [b, a];
    S.gates.push({ id: ++S.id, y: -GATE_H, sides: [a, b], used: false, chosen: -1, fade: 1 });
  }

  function bumpGate(g, side) {
    const o = g.sides[side];
    // 총으로 키울 수 있는 한도: 처음 숫자의 2배까지 (마이너스는 플러스로 뒤집을 수 있음)
    if (o.cap == null) o.cap = o.op === '−' ? o.v : o.v * 2;
    if (o.op === '+') { if (o.v >= o.cap) return; o.v += 1; }
    else if (o.op === '−') { o.v -= 1; if (o.v <= 0) { o.op = '+'; o.v = 0; } }
    else return;
    o.pulse = 1;
  }

  function applyOp(n, o) {
    switch (o.op) {
      case '+': return n + o.v;
      case '−': return n - o.v;
      case '×': return n * o.v;
      case '÷': return Math.max(1, Math.floor(n / o.v));
    }
    return n;
  }

  // ===== 무기 상자 =====
  function spawnCrate() {
    if (S.gates.some(g => g.y < 100)) { S.crateT = 1.5; return; }
    const types = Object.keys(CRATES).filter(k => S.wl[k] < CRATES[k].max);
    if (!types.length) return; // 무기 최대 강화
    const type = pick(types);
    const hp = Math.max(6, Math.round(stageBase() * 2.5));
    S.crates.push({ id: ++S.id, type, x: rand(60, W - 60), y: -40, w: 64, h: 52, hp, max: hp, flash: 0 });
  }

  function openCrate(c) {
    c.dead = true;
    S.wl[c.type]++;
    const def = CRATES[c.type];
    burst(c.x, c.y, '#c88a4a', 18, 260);
    burst(c.x, c.y, def.color, 18, 200);
    addText(c.x, c.y - 10, def.label + ' UP!', def.color, 30);
    Sound.power();
  }

  // ===== 몬스터 =====
  function pickType() {
    const pool = ['slime', 'slime', 'slime'];
    if (S.stage >= 2 || S.stageT > 12) pool.push('bat', 'bat');
    if (S.stage >= 2) pool.push('golem');
    if (S.stage >= 3) pool.push('splitter', 'splitter');
    if (S.stage >= 4) pool.push('golem', 'bat');
    return pick(pool);
  }

  function spawnEnemy(type, x, y, hpOverride, child) {
    const def = ENEMY[type];
    const hp = hpOverride || Math.max(1, Math.round(stageBase() * def.hp * rand(0.8, 1.2)));
    const r = def.r * (1 + Math.min(0.45, Math.log10(hp) / 14)) * (child ? 0.8 : 1);
    S.enemies.push({
      id: ++S.id, type, def, hp, max: hp, r,
      x: x != null ? clamp(x, r + 16, W - r - 16) : rand(r + 18, W - r - 18),
      y: y != null ? y : -r - 10,
      sp: def.sp * rand(0.9, 1.15) + Math.min(30, S.stage * 2.5),
      wob: rand(0, TAU), flash: 0, child: !!child, ph: rand(0, TAU),
    });
  }

  function killEnemy(e) {
    e.dead = true;
    S.kills++;
    S.score += e.max;
    S.coins += e.def.coin * coinMul();
    coinFx(e.x, e.y, 1);
    burst(e.x, e.y, e.def.color, 12, 230);
    burst(e.x, e.y, e.def.light, 5, 120);
    Sound.kill();
    if (e.type === 'splitter' && !e.child) {
      for (const s of [-1, 1]) spawnEnemy('slime', e.x + s * 16, e.y, Math.max(1, Math.round(e.max * 0.35)), true);
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 1;
    Sound.hit();
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }

  // ===== 보스 =====
  function spawnBoss() {
    const def = BOSSES[(S.stage - 1) % BOSSES.length];
    const tier = Math.floor((S.stage - 1) / BOSSES.length);
    const hp = Math.round(stageBase() * 30);
    S.boss = {
      ...def, name: def.name + (tier > 0 ? ' ' + 'Ⅱ Ⅲ Ⅳ Ⅴ'.split(' ')[Math.min(3, tier - 1)] : ''),
      x: W / 2, y: -90, ty: 175, hp, max: hp, vx: 55 + S.stage * 5, t: 0,
      atkT: 2.2, enter: true, flash: 0, squash: 0, slams: 0, enraged: false,
    };
  }

  function damageBoss(dmg) {
    const b = S.boss;
    if (!b || b.enter) return;
    b.hp -= dmg;
    b.flash = 1;
    Sound.hit();
    if (b.hp <= 0) killBoss();
  }

  function clearStage(reward) {
    for (const e of S.enemies) {
      if (!e.dead) { e.dead = true; burst(e.x, e.y, e.def.color, 8, 200); }
    }
    S.shots = [];
    S.hazards = [];
    S.phase = 'clear';
    S.phaseT = 0;
    setBanner('STAGE CLEAR!', reward ? `보너스 +${reward} 코인` : '', '#7dff8a', 2.6);
    SAVE.bestStage = Math.max(SAVE.bestStage, S.stage);
  }

  function killBoss() {
    const b = S.boss;
    S.boss = null;
    S.hitStop = 0.2;
    S.shake = 24;
    S.white = 0.7;
    Sound.boom();
    setTimeout(() => Sound.win(), 350);
    burst(b.x, b.y, b.color, 70, 420, 7);
    burst(b.x, b.y, '#ffd34d', 50, 320);
    burst(b.x, b.y, '#ffffff', 25, 200);
    const reward = Math.round((15 + S.stage * 10) * coinMul());
    S.coins += reward;
    S.score += b.max;
    coinFx(b.x, b.y, 18);
    clearStage(reward);
  }

  function updateBoss(dt) {
    const b = S.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt * 6);
    b.squash = Math.max(0, b.squash - dt * 2.5);
    if (b.enter) {
      b.y += (b.ty - b.y) * Math.min(1, dt * 2.2);
      if (Math.abs(b.y - b.ty) < 3) b.enter = false;
      return;
    }
    b.x += b.vx * dt;
    if (b.x < b.r + 18) { b.x = b.r + 18; b.vx = Math.abs(b.vx); }
    if (b.x > W - b.r - 18) { b.x = W - b.r - 18; b.vx = -Math.abs(b.vx); }

    if (b.t > 32) {
      if (!b.enraged) { b.enraged = true; setBanner('보스 분노!', '빨리 처치하세요!', '#ff4d5e', 1.6, true); Sound.warn(); }
      b.ty += 9 * dt;
    }
    b.y += (b.ty - b.y) * Math.min(1, dt * 2);

    if (b.y + b.r >= DEFENSE_Y) {
      S.boss = null;
      S.shake = 24;
      loseTroops(S.n * 0.7 + S.stage * 10);
      if (S.mode !== 'play') return;
      clearStage(0);
      return;
    }

    b.atkT -= dt * (b.enraged ? 1.6 : 1);
    if (b.atkT > 0) return;
    if (b.kind === 'king') {
      b.atkT = 3;
      b.squash = 1;
      for (const k of [-1, 0, 1]) spawnEnemy('slime', b.x + k * 44, b.y + b.r * 0.5);
      Sound.slam();
    } else if (b.kind === 'demon') {
      b.atkT = 1.5;
      const cnt = 1 + Math.min(2, Math.floor((S.stage - 1) / 3));
      const base = Math.atan2(SQUAD_Y - b.y, S.px - b.x);
      const shp = Math.max(3, Math.round(stageBase() * 0.3));
      for (let i = 0; i < cnt; i++) {
        const a = base + (i - (cnt - 1) / 2) * 0.28;
        S.shots.push({ x: b.x, y: b.y + b.r * 0.4, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: 13, hp: shp, max: shp, t: 0 });
      }
      Sound.fire();
    } else if (b.kind === 'titan') {
      b.atkT = 3.2;
      b.squash = 1;
      S.hazards.push({ x: clamp(S.px, 75, W - 75), w: 140, t: 0, dur: 1.15, done: false });
      if (b.slams++ % 2 === 1) spawnEnemy('golem', b.x, b.y + b.r);
      Sound.slam();
    }
  }

  // ===== 분대 / 발사 =====
  function fire() {
    const wl = S.wl;
    const k = Math.min(S.n, 6 + wl.spread * 2);
    if (k <= 0) return;
    const rateMul = 1 + wl.rate * 0.25;
    S.fireT = 0.2 / rateMul;
    const per = S.n * 2.2 * powerMul() * (1 + wl.dmg * 0.3) * 0.2 / k;
    const R = squadR();
    for (let i = 0; i < k; i++) {
      const f = k === 1 ? 0 : i / (k - 1) - 0.5;
      const a = f * wl.spread * 0.2 + rand(-0.02, 0.02);
      const x = S.px + f * R * 1.3;
      const y = SQUAD_Y - R * 0.5;
      S.bullets.push({ x, y, vx: Math.sin(a) * 760, vy: -Math.cos(a) * 760, dmg: per, pierce: wl.pierce, hits: [], gate: 0 });
    }
    if (S.parts.length < 560) {
      S.parts.push({ x: S.px, y: SQUAD_Y - R * 0.6, vx: 0, vy: -40, life: 0.06, max: 0.06, color: '#fff3b0', size: 10 });
    }
    Sound.shoot();
  }

  function loseTroops(amount, x) {
    const loss = Math.max(1, Math.ceil(amount));
    S.n -= loss;
    S.hurt = Math.min(1, S.hurt + 0.6);
    S.shake = Math.max(S.shake, 10);
    addText(x != null ? x : S.px, SQUAD_Y - 90, '−' + fmt(loss), '#ff5a5a', 30);
    Sound.hurt();
    if (S.n <= 0) gameOver();
  }

  function gameOver() {
    if (S.mode !== 'play') return;
    S.n = 0;
    S.mode = 'over';
    S.overT = 0;
    S.shake = 18;
    burst(S.px, SQUAD_Y, '#4fc3ff', 50, 300);
    S.earned = Math.floor(S.coins);
    SAVE.coins += S.earned;
    SAVE.bestStage = Math.max(SAVE.bestStage, S.stage);
    if (S.score > SAVE.best) { SAVE.best = S.score; S.newBest = true; }
    persist();
    Sound.lose();
  }

  // ===== 업데이트 =====
  function updateFx(dt) {
    for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0);
    for (const t of S.texts) { t.y -= 45 * dt; t.t -= dt * 0.85; }
    S.texts = S.texts.filter(t => t.t > 0);
    for (const c of S.coinFx) {
      c.t += dt;
      if (c.t >= c.d && !c.done) { c.done = true; Sound.coin(); }
    }
    S.coinFx = S.coinFx.filter(c => !c.done);
    for (const g of S.gates) for (const o of g.sides) o.pulse = Math.max(0, o.pulse - dt * 6);
    S.shake = Math.max(0, S.shake - dt * 45);
    S.hurt = Math.max(0, S.hurt - dt * 1.8);
    S.white = Math.max(0, S.white - dt * 2);
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    const sp = S.mode === 'play' ? SCROLL : S.mode === 'title' ? 40 : 0;
    S.scroll += sp * dt;
    for (const d of S.deco) { d.y += sp * dt; if (d.y > H + 20) { d.y = -20; d.x = rand(22, W - 22); } }
  }

  function update(dt) {
    updateFx(dt);
    if (S.mode === 'over') { S.overT += dt; return; }
    if (S.mode !== 'play') return;
    if (S.hitStop > 0) { S.hitStop -= dt; return; }

    S.t += dt;

    // 이동
    if (keys.left) S.tx -= 480 * dt;
    if (keys.right) S.tx += 480 * dt;
    const R = squadR();
    S.tx = clamp(S.tx, R + 6, W - R - 6);
    S.px += (S.tx - S.px) * Math.min(1, dt * 14);

    // 진행 단계
    S.phaseT += dt;
    if (S.phase === 'wave') {
      S.stageT += dt;
      if (S.stageT >= STAGE_LEN) {
        S.phase = 'warn';
        S.phaseT = 0;
        Sound.warn();
        setBanner('WARNING', BOSSES[(S.stage - 1) % BOSSES.length].name + ' 등장!', '#ff4d5e', 2.3, true);
      }
    } else if (S.phase === 'warn') {
      if (S.phaseT >= 2.3) { spawnBoss(); S.phase = 'boss'; S.phaseT = 0; }
    } else if (S.phase === 'clear') {
      if (S.phaseT >= 3) {
        S.stage++;
        S.stageT = 0;
        S.phase = 'wave';
        S.phaseT = 0;
        S.spawnT = 1.5;
        const tips = ['', '', '박쥐는 빠르니 조심!', '분열체는 죽으면 둘로 갈라져요', '무기 상자를 노려보세요', '보스가 점점 강해져요'];
        setBanner('STAGE ' + S.stage, tips[S.stage] || '끝까지 버텨라!', '#fff', 2.2);
      }
    }

    // 스폰
    if (S.phase === 'wave' || S.phase === 'boss') {
      S.spawnT -= dt;
      if (S.spawnT <= 0) {
        const iv = Math.max(0.5, 1.2 - S.stage * 0.08 - (S.phase === 'wave' ? S.stageT / STAGE_LEN : 1) * 0.3);
        S.spawnT = S.phase === 'boss' ? iv * 2.4 : iv;
        spawnEnemy(pickType());
        if (S.stage >= 2 && Math.random() < 0.15 + S.stage * 0.03) spawnEnemy(pickType());
      }
    }
    if (S.phase !== 'clear') {
      S.gateT -= dt;
      if (S.gateT <= 0) { S.gateT = S.phase === 'boss' ? rand(5.5, 7.5) : rand(4, 5.2); spawnGate(); }
      S.crateT -= dt;
      if (S.crateT <= 0) { S.crateT = rand(14, 19); spawnCrate(); }
    }

    // 발사
    S.fireT -= dt;
    if (S.fireT <= 0) fire();

    // 총알
    const boss = S.boss;
    for (const b of S.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
      for (const c of S.crates) {
        if (c.dead) continue;
        if (Math.abs(b.x - c.x) < c.w / 2 && Math.abs(b.y - c.y) < c.h / 2) {
          c.hp -= b.dmg; c.flash = 1; b.dead = true;
          if (c.hp <= 0) openCrate(c);
          break;
        }
      }
      if (b.dead) continue;
      for (const s of S.shots) {
        if (s.dead) continue;
        const dx = b.x - s.x, dy = b.y - s.y;
        if (dx * dx + dy * dy < (s.r + 4) * (s.r + 4)) {
          s.hp -= b.dmg; b.dead = true;
          if (s.hp <= 0) { s.dead = true; burst(s.x, s.y, '#ff9a3c', 10, 180); }
          break;
        }
      }
      if (b.dead) continue;
      for (const e of S.enemies) {
        if (e.dead || b.hits.includes(e.id)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.r + 4) * (e.r + 4)) {
          damageEnemy(e, b.dmg);
          b.hits.push(e.id);
          if (b.pierce-- <= 0) { b.dead = true; break; }
        }
      }
      if (b.dead) continue;
      if (boss && !boss.enter) {
        const dx = b.x - boss.x, dy = b.y - boss.y;
        if (dx * dx + dy * dy < boss.r * boss.r) { damageBoss(b.dmg); b.dead = true; continue; }
      }
      for (const g of S.gates) {
        if (g.used || b.gate === g.id) continue;
        if (Math.abs(b.y - g.y) < GATE_H / 2) { b.gate = g.id; bumpGate(g, b.x < W / 2 ? 0 : 1); }
      }
    }
    S.bullets = S.bullets.filter(b => !b.dead);
    if (S.mode !== 'play') return;

    // 몬스터
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.y += e.sp * dt;
      e.wob += dt * (e.type === 'bat' ? 14 : 6);
      e.flash = Math.max(0, e.flash - dt * 7);
      if (e.type === 'bat') e.x = clamp(e.x + Math.sin(S.t * 3 + e.ph) * 70 * dt, e.r + 16, W - e.r - 16);
      if (e.y + e.r * 0.6 >= DEFENSE_Y) {
        e.dead = true;
        burst(e.x, DEFENSE_Y, '#ff5a5a', 14, 200);
        loseTroops(S.n * (e.child ? 0.04 : e.def.leak) + S.stage, e.x);
        if (S.mode !== 'play') return;
      }
    }
    S.enemies = S.enemies.filter(e => !e.dead);

    // 보스
    updateBoss(dt);
    if (S.mode !== 'play') return;

    // 보스 공격: 불덩이
    const R2 = squadR();
    for (const s of S.shots) {
      if (s.dead) continue;
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (S.parts.length < 560 && Math.random() < 0.6) {
        S.parts.push({ x: s.x + rand(-4, 4), y: s.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-60, -20), life: 0.3, max: 0.3, color: pick(['#ffb347', '#ff6a3d', '#ffd34d']), size: rand(3, 6) });
      }
      if (s.y > SQUAD_Y - R2 * 0.6 && Math.abs(s.x - S.px) < R2 + s.r) {
        s.dead = true;
        burst(s.x, s.y, '#ff6a3d', 20, 260);
        loseTroops(S.n * 0.1 + S.stage * 4, s.x);
        if (S.mode !== 'play') return;
      } else if (s.y > H + 30 || s.x < -30 || s.x > W + 30) s.dead = true;
    }
    S.shots = S.shots.filter(s => !s.dead);

    // 보스 공격: 바위 낙하
    for (const z of S.hazards) {
      z.t += dt;
      if (!z.done && z.t >= z.dur) {
        z.done = true;
        S.shake = Math.max(S.shake, 14);
        Sound.slam();
        for (let i = 0; i < 16; i++) S.parts.push({ x: z.x + rand(-z.w / 2, z.w / 2), y: rand(DEFENSE_Y, H), vx: rand(-80, 80), vy: rand(-260, -80), life: 0.6, max: 0.6, color: pick(['#8d96a8', '#5b6275', '#c5ccd9']), size: rand(4, 9) });
        if (Math.abs(S.px - z.x) < z.w / 2 + R2 * 0.4) {
          loseTroops(S.n * 0.25 + S.stage * 5, S.px);
          if (S.mode !== 'play') return;
        }
      }
    }
    S.hazards = S.hazards.filter(z => z.t < z.dur + 0.45);

    // 게이트
    for (const g of S.gates) {
      g.y += SCROLL * dt;
      if (!g.used && g.y >= SQUAD_Y - 10) {
        g.used = true;
        const side = S.px < W / 2 ? 0 : 1;
        g.chosen = side;
        const o = g.sides[side];
        S.n = clamp(applyOp(S.n, o), 0, MAX_N);
        const good = isGood(o);
        addText(S.px, SQUAD_Y - 95, opText(o), good ? '#6ff0ff' : '#ff6a6a', 40);
        burst(S.px, SQUAD_Y - 20, good ? '#6ff0ff' : '#ff6a6a', 22, 260);
        if (good) Sound.good(); else Sound.bad();
        if (S.n <= 0) { gameOver(); return; }
      } else if (g.used) {
        g.fade -= dt * 3;
      }
    }
    S.gates = S.gates.filter(g => g.fade > 0 && g.y < H + GATE_H);

    // 상자
    for (const c of S.crates) {
      c.y += SCROLL * dt;
      c.flash = Math.max(0, c.flash - dt * 8);
      if (c.y > DEFENSE_Y + 20) { c.dead = true; burst(c.x, c.y, '#c88a4a', 10, 160); }
    }
    S.crates = S.crates.filter(c => !c.dead);
  }

  // ===== 그리기: 배경 =====
  function drawBg() {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#16213b');
    grd.addColorStop(0.75, '#1d2f45');
    grd.addColorStop(1, '#1a2a3d');
    ctx.fillStyle = grd;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // 바닥 타일
    const tile = 64, off = S.scroll % (tile * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = -tile * 2 + off; y < H; y += tile * 2) ctx.fillRect(16, y, W - 32, tile);

    // 장식 (풀, 돌)
    for (const d of S.deco) {
      ctx.globalAlpha = 0.22;
      if (d.k === 0) {
        ctx.strokeStyle = '#7fd38a'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + a * 8 * d.s, d.y - 9 * d.s); }
        ctx.stroke();
      } else if (d.k === 1) {
        ctx.fillStyle = '#9aa6c0';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 6 * d.s, 4 * d.s, 0, 0, TAU); ctx.fill();
      } else {
        ctx.strokeStyle = '#0c1424'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(d.x - 8 * d.s, d.y); ctx.lineTo(d.x, d.y + 4 * d.s); ctx.lineTo(d.x + 9 * d.s, d.y - 2 * d.s); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 양쪽 벽
    for (const x0 of [0, W - 16]) {
      ctx.fillStyle = '#26324d';
      ctx.fillRect(x0, -10, 16, H + 20);
      ctx.fillStyle = '#323f5f';
      const bo = S.scroll % 40;
      for (let y = -40 + bo; y < H; y += 40) { rr(x0 + 2, y + 2, 12, 36, 3); ctx.fill(); }
    }

    // 중앙선
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -S.scroll;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, DEFENSE_Y); ctx.stroke();
    ctx.setLineDash([]);

    // 위험 구역 붉은 빛
    const dg = ctx.createLinearGradient(0, DEFENSE_Y - 70, 0, DEFENSE_Y);
    dg.addColorStop(0, 'rgba(255,60,80,0)');
    dg.addColorStop(1, 'rgba(255,60,80,0.18)');
    ctx.fillStyle = dg;
    ctx.fillRect(16, DEFENSE_Y - 70, W - 32, 70);

    // 기지 구역
    ctx.fillStyle = 'rgba(70,150,255,0.07)';
    ctx.fillRect(16, DEFENSE_Y, W - 32, H - DEFENSE_Y);

    // 모래주머니 방어선
    for (let x = 14, i = 0; x < W - 14; x += 26, i++) {
      ctx.fillStyle = i % 2 ? '#8a7650' : '#9a8559';
      rr(x, DEFENSE_Y - 7, 25, 14, 6); ctx.fill();
      ctx.strokeStyle = '#5e4f33'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // ===== 그리기: 게이트 =====
  function drawGates() {
    for (const g of S.gates) {
      for (let s = 0; s < 2; s++) {
        const o = g.sides[s];
        const good = isGood(o);
        ctx.globalAlpha = g.used ? Math.max(0, g.fade) * (g.chosen === s ? 1 : 0.35) : 1;
        const x0 = s === 0 ? 18 : W / 2 + 2, w = W / 2 - 20;
        const top = g.y - GATE_H / 2;
        const edge = good ? '#38d1ff' : '#ff4d5e';
        const pg = ctx.createLinearGradient(0, top, 0, top + GATE_H);
        pg.addColorStop(0, good ? 'rgba(56,209,255,0.45)' : 'rgba(255,77,94,0.45)');
        pg.addColorStop(1, good ? 'rgba(56,209,255,0.12)' : 'rgba(255,77,94,0.12)');
        ctx.fillStyle = pg;
        rr(x0 + 6, top, w - 12, GATE_H, 6);
        ctx.fill();
        // 반짝임
        ctx.save();
        rr(x0 + 6, top, w - 12, GATE_H, 6);
        ctx.clip();
        const sx = x0 + ((S.t * 140 + g.id * 70) % (w + 120)) - 60;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(sx, top); ctx.lineTo(sx + 22, top); ctx.lineTo(sx - 8, top + GATE_H); ctx.lineTo(sx - 30, top + GATE_H);
        ctx.fill();
        ctx.restore();
        // 기둥과 윗보
        ctx.fillStyle = edge;
        rr(x0, top - 8, 10, GATE_H + 14, 4); ctx.fill();
        rr(x0 + w - 10, top - 8, 10, GATE_H + 14, 4); ctx.fill();
        rr(x0, top - 10, w, 8, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x0 + 2, top - 6, 3, GATE_H + 8);
        ctx.fillRect(x0 + w - 8, top - 6, 3, GATE_H + 8);
        // 숫자
        const sz = 34 * (1 + o.pulse * 0.2);
        text(opText(o), x0 + w / 2, g.y + 3, sz, '#fff', { stroke: 7, strokeColor: good ? '#0a4c66' : '#6b0f19' });
      }
    }
    ctx.globalAlpha = 1;
  }

  // ===== 그리기: 상자 =====
  function drawCrates() {
    for (const c of S.crates) {
      const def = CRATES[c.type];
      const jx = c.flash > 0 ? rand(-2, 2) : 0;
      const x = c.x - c.w / 2 + jx, y = c.y - c.h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y + c.h / 2 + 4, c.w / 2, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.flash > 0.5 ? '#ffe2b8' : '#b5763a';
      rr(x, y, c.w, c.h, 6); ctx.fill();
      ctx.strokeStyle = '#6b3f17'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(107,63,23,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 4, y + c.h / 3); ctx.lineTo(x + c.w - 4, y + c.h / 3); ctx.moveTo(x + 4, y + c.h * 2 / 3); ctx.lineTo(x + c.w - 4, y + c.h * 2 / 3); ctx.stroke();
      ctx.fillStyle = '#d9d9d9';
      for (const [cx, cy] of [[x, y], [x + c.w - 8, y], [x, y + c.h - 8], [x + c.w - 8, y + c.h - 8]]) { rr(cx, cy, 8, 8, 2); ctx.fill(); }
      ctx.fillStyle = def.color;
      rr(x + 8, c.y - 11, c.w - 16, 22, 5); ctx.fill();
      text(def.label, c.x + jx, c.y + 1, 15, '#0b1026');
      hpPill(c.x, y - 12, fmt(Math.ceil(c.hp)), 13);
    }
  }

  // ===== 그리기: 몬스터 =====
  function eyes(ex, ey, er, lx, ly, color) {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff';
      circle(sx * ex, ey, er); ctx.fill();
      ctx.fillStyle = color || '#111';
      circle(sx * ex + lx * er * 0.35, ey + ly * er * 0.35, er * 0.55); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      circle(sx * ex + lx * er * 0.35 - er * 0.2, ey + ly * er * 0.35 - er * 0.2, er * 0.18); ctx.fill();
    }
  }

  function bodyGrad(r, def) {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.25);
    g.addColorStop(0, def.light);
    g.addColorStop(0.45, def.color);
    g.addColorStop(1, def.dark);
    return g;
  }

  function slimePath(r) {
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.55);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.6, -r * 0.55, -r * 1.05, 0, -r * 1.02);
    ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.05, -r * 0.6, r, r * 0.55);
    ctx.quadraticCurveTo(0, r * 0.85, -r, r * 0.55);
    ctx.closePath();
  }

  function drawMonster(type, x, y, r, def, wob, flash, look) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 0.95, r * 0.28, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    const lx = look[0], ly = look[1];
    if (type === 'slime') {
      const sq = Math.sin(wob) * 0.08;
      ctx.scale(1 + sq, 1 - sq);
      slimePath(r);
      ctx.fillStyle = bodyGrad(r, def); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = def.dark; ctx.stroke();
      eyes(r * 0.36, -r * 0.18, r * 0.22, lx, ly);
      ctx.strokeStyle = def.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (type === 'bat') {
      const f = Math.sin(wob);
      ctx.fillStyle = def.dark;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.5, -r * 0.1);
        ctx.lineTo(s * r * 2.0, -r * 0.7 - f * r * 0.6);
        ctx.lineTo(s * r * 1.75, r * 0.15);
        ctx.lineTo(s * r * 1.3, r * 0.0);
        ctx.lineTo(s * r * 1.0, r * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = bodyGrad(r, def);
      circle(0, 0, r); ctx.fill();
      ctx.fillStyle = def.color;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * 0.8); ctx.lineTo(s * r * 0.65, -r * 1.35); ctx.lineTo(s * r * 0.8, -r * 0.55); ctx.fill(); }
      eyes(r * 0.36, -r * 0.1, r * 0.24, lx, ly, '#c4002b');
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.22, r * 0.35); ctx.lineTo(s * r * 0.1, r * 0.62); ctx.lineTo(s * r * 0.0, r * 0.35); ctx.fill(); }
    } else if (type === 'golem') {
      const bob = Math.sin(wob * 0.5) * 1.5;
      ctx.translate(0, bob);
      ctx.fillStyle = def.dark;
      for (const s of [-1, 1]) { rr(s * r * 1.05 - r * 0.25, -r * 0.2, r * 0.5, r * 0.85, r * 0.2); ctx.fill(); }
      ctx.fillStyle = bodyGrad(r, def);
      rr(-r * 0.9, -r * 0.95, r * 1.8, r * 1.8, r * 0.35); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = def.dark; ctx.stroke();
      ctx.strokeStyle = 'rgba(40,45,60,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.7); ctx.lineTo(-r * 0.3, -r * 0.35); ctx.lineTo(-r * 0.45, r * 0.1); ctx.moveTo(r * 0.5, r * 0.3); ctx.lineTo(r * 0.25, r * 0.6); ctx.stroke();
      ctx.fillStyle = '#ffb347';
      for (const s of [-1, 1]) { rr(s * r * 0.35 - r * 0.17 + lx * 2, -r * 0.35, r * 0.34, r * 0.18, 3); ctx.fill(); }
      ctx.fillStyle = 'rgba(80,140,70,0.6)';
      ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.9, r * 0.45, r * 0.15, 0, 0, TAU); ctx.fill();
    } else if (type === 'splitter') {
      const rot = wob * 0.15;
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * TAU, rad = i % 2 ? r * 0.82 : r * 1.08;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = bodyGrad(r, def); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = def.dark; ctx.stroke();
      ctx.rotate(-rot);
      ctx.strokeStyle = 'rgba(120,50,0,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8); ctx.stroke();
      eyes(r * 0.36, -r * 0.12, r * 0.22, lx, ly);
    }
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.35;
      ctx.fillStyle = '#fff';
      circle(0, 0, r); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function lookAt(x, y) {
    const dx = S.px - x, dy = SQUAD_Y - y, d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  }

  function drawEnemies() {
    const list = S.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of list) drawMonster(e.type, e.x, e.y, e.r, e.def, e.wob, e.flash, lookAt(e.x, e.y));
    for (const e of list) hpPill(e.x, e.y - e.r - 12, fmt(Math.ceil(e.hp)), e.r > 24 ? 14 : 12);
  }

  // ===== 그리기: 보스 =====
  function drawBoss() {
    const b = S.boss;
    if (!b) return;
    const r = b.r, look = lookAt(b.x, b.y);
    const sq = Math.sin(b.squash * Math.PI) * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + r * 0.9, r, r * 0.3, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.enraged) ctx.translate(rand(-1.5, 1.5), rand(-1.5, 1.5));

    if (b.kind === 'king') {
      ctx.scale(1 + sq + Math.sin(b.t * 4) * 0.03, 1 - sq - Math.sin(b.t * 4) * 0.03);
      slimePath(r);
      ctx.fillStyle = bodyGrad(r, b); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = b.dark; ctx.stroke();
      // 왕관
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.85);
      ctx.lineTo(-r * 0.55, -r * 1.35); ctx.lineTo(-r * 0.25, -r * 1.1);
      ctx.lineTo(0, -r * 1.5); ctx.lineTo(r * 0.25, -r * 1.1);
      ctx.lineTo(r * 0.55, -r * 1.35); ctx.lineTo(r * 0.5, -r * 0.85);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#ff4d8d'; circle(0, -r * 1.05, r * 0.08); ctx.fill();
      ctx.fillStyle = '#4fc3ff'; circle(-r * 0.35, -r * 1.0, r * 0.06); ctx.fill(); circle(r * 0.35, -r * 1.0, r * 0.06); ctx.fill();
      eyes(r * 0.33, -r * 0.2, r * 0.17, look[0], look[1]);
      ctx.strokeStyle = b.dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.22, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    } else if (b.kind === 'demon') {
      // 불꽃 오라
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + b.t * 2;
        const fr = r * (1.05 + Math.sin(b.t * 9 + i) * 0.08);
        ctx.fillStyle = i % 2 ? 'rgba(255,140,40,0.45)' : 'rgba(255,60,40,0.4)';
        circle(Math.cos(a) * fr * 0.9, Math.sin(a) * fr * 0.9, r * 0.32); ctx.fill();
      }
      // 날개
      ctx.fillStyle = b.dark;
      const f = Math.sin(b.t * 5) * 0.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.6, -r * 0.2);
        ctx.lineTo(s * r * 1.8, -r * (0.9 + f));
        ctx.lineTo(s * r * 1.5, -r * 0.1);
        ctx.lineTo(s * r * 1.7, r * 0.3);
        ctx.lineTo(s * r * 0.8, r * 0.3);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = bodyGrad(r, b);
      circle(0, 0, r); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = b.dark; ctx.stroke();
      // 뿔
      ctx.fillStyle = '#f2e6c9';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.35, -r * 0.8);
        ctx.quadraticCurveTo(s * r * 0.9, -r * 1.2, s * r * 0.75, -r * 1.55);
        ctx.quadraticCurveTo(s * r * 0.75, -r * 1.05, s * r * 0.65, -r * 0.6);
        ctx.closePath(); ctx.fill();
      }
      eyes(r * 0.33, -r * 0.15, r * 0.17, look[0], look[1], '#ffd34d');
      ctx.strokeStyle = '#2a0505'; ctx.lineWidth = 4;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.15, -r * 0.38); ctx.lineTo(s * r * 0.55, -r * 0.5); ctx.stroke(); }
      ctx.fillStyle = '#2a0505';
      ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.35, r * 0.16 + Math.sin(b.t * 6) * 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.25, r * 0.22); ctx.lineTo(s * r * 0.17, r * 0.4); ctx.lineTo(s * r * 0.09, r * 0.22); ctx.fill(); }
    } else if (b.kind === 'titan') {
      ctx.scale(1 + sq * 0.6, 1 - sq * 0.6);
      ctx.fillStyle = b.dark;
      for (const s of [-1, 1]) { rr(s * r * 1.1 - r * 0.3, -r * 0.3, r * 0.6, r * 1.1, r * 0.25); ctx.fill(); }
      ctx.fillStyle = bodyGrad(r, b);
      rr(-r * 0.95, -r * 0.95, r * 1.9, r * 1.85, r * 0.4); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = b.dark; ctx.stroke();
      ctx.fillStyle = b.color;
      for (const s of [-1, 1]) { circle(s * r * 0.95, -r * 0.7, r * 0.38); ctx.fill(); ctx.strokeStyle = b.dark; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(40,45,60,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.8); ctx.lineTo(-r * 0.2, -r * 0.4); ctx.lineTo(-r * 0.4, 0); ctx.moveTo(r * 0.4, r * 0.2); ctx.lineTo(r * 0.15, r * 0.55); ctx.lineTo(r * 0.35, r * 0.8); ctx.stroke();
      const glow = 0.7 + Math.sin(b.t * 5) * 0.3;
      ctx.fillStyle = `rgba(80,230,255,${glow})`;
      for (const s of [-1, 1]) { rr(s * r * 0.38 - r * 0.18 + look[0] * 3, -r * 0.35, r * 0.36, r * 0.16, 4); ctx.fill(); }
      ctx.fillStyle = 'rgba(80,150,70,0.65)';
      ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.92, r * 0.55, r * 0.15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b3040';
      rr(-r * 0.4, r * 0.25, r * 0.8, r * 0.14, 4); ctx.fill();
    }
    if (b.flash > 0) {
      ctx.globalAlpha = b.flash * 0.22;
      ctx.fillStyle = '#fff';
      circle(0, 0, r); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawShots() {
    for (const s of S.shots) {
      const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 1.4);
      g.addColorStop(0, '#fff6c2');
      g.addColorStop(0.4, '#ffb347');
      g.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = g;
      circle(s.x, s.y, s.r * 1.4); ctx.fill();
    }
  }

  function drawHazards() {
    for (const z of S.hazards) {
      if (!z.done) {
        const p = z.t / z.dur;
        const a = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(z.t * (10 + p * 25)));
        ctx.fillStyle = `rgba(255,50,60,${a})`;
        ctx.fillRect(z.x - z.w / 2, 80, z.w, H - 80);
        ctx.strokeStyle = 'rgba(255,80,90,0.9)'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(z.x - z.w / 2, 80, z.w, H - 80);
        ctx.setLineDash([]);
        text('!', z.x, SQUAD_Y - 40, 46, '#fff', { stroke: 6, strokeColor: '#a0101c' });
        // 떨어지는 바위
        if (p > 0.6) {
          const fy = lerp(-40, SQUAD_Y, (p - 0.6) / 0.4);
          ctx.fillStyle = '#8d96a8';
          for (const ox of [-35, 0, 35]) { circle(z.x + ox, fy - Math.abs(ox), 16); ctx.fill(); }
        }
      } else {
        const k = 1 - (z.t - z.dur) / 0.45;
        ctx.fillStyle = `rgba(255,255,255,${0.5 * k})`;
        ctx.fillRect(z.x - z.w / 2, DEFENSE_Y - 30, z.w, H - DEFENSE_Y + 30);
      }
    }
  }

  // ===== 그리기: 분대 =====
  const FORMATION = [];
  for (let i = 0; i < 60; i++) {
    const a = i * 2.39996, d = 6.4 * Math.sqrt(i);
    FORMATION.push([Math.cos(a) * d, Math.sin(a) * d * 0.62]);
  }

  function drawSquad() {
    if (S.n <= 0) return;
    const count = Math.min(S.n, 60);
    const pts = [];
    for (let i = 0; i < count; i++) pts.push([FORMATION[i][0], FORMATION[i][1], i]);
    pts.sort((a, b) => a[1] - b[1]);
    const run = S.mode === 'play' ? S.t : performance.now() / 1000;
    for (const [fx, fy, i] of pts) {
      const x = S.px + fx;
      const y = SQUAD_Y + fy + Math.sin(run * 14 + i) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(x, y + 7, 7, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222a3a';
      ctx.fillRect(x + 2.5, y - 12, 2.6, 11);
      ctx.fillStyle = '#2d8be0';
      circle(x, y + 1, 6.5); ctx.fill();
      ctx.fillStyle = '#6cc4ff';
      circle(x - 1.8, y - 0.2, 2.8); ctx.fill();
      ctx.fillStyle = '#1b4f86';
      ctx.beginPath(); ctx.arc(x, y - 1.2, 5.6, Math.PI, 0); ctx.fill();
    }
    // 병력 배지
    const label = fmt(S.n);
    ctx.font = `900 22px ${FONT}`;
    const tw = ctx.measureText(label).width + 26;
    const by = SQUAD_Y - squadR() * 0.62 - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(S.px - tw / 2, by - 13, tw, 30, 15); ctx.fill();
    ctx.fillStyle = '#4fc3ff';
    rr(S.px - tw / 2, by - 16, tw, 30, 15); ctx.fill();
    ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 2; ctx.stroke();
    text(label, S.px, by, 22, '#06233a');
  }

  function drawBullets() {
    for (const b of S.bullets) {
      ctx.fillStyle = 'rgba(255,220,90,0.35)';
      rr(b.x - 4, b.y - 10, 8, 20, 4); ctx.fill();
      ctx.fillStyle = '#fff6c2';
      rr(b.x - 1.8, b.y - 8, 3.6, 15, 2); ctx.fill();
    }
  }

  function drawFx() {
    for (const p of S.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = clamp(k * 1.5, 0, 1);
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    for (const t of S.texts) {
      ctx.globalAlpha = clamp(t.t * 1.6, 0, 1);
      const pop = 1 + Math.max(0, t.t - 0.85) * 2;
      text(t.text, t.x, t.y, t.size * pop, t.color, { stroke: 6 });
    }
    ctx.globalAlpha = 1;
  }

  function drawCoinFx() {
    const tx = W - 104, ty = 24;
    for (const c of S.coinFx) {
      if (c.t < 0) continue;
      const k = clamp(c.t / c.d, 0, 1);
      const e = k * k;
      const x = lerp(c.sx, tx, e);
      const y = lerp(c.sy, ty, e) - Math.sin(k * Math.PI) * 40;
      drawCoin(x, y, 6);
    }
  }

  function drawCoin(x, y, r) {
    ctx.fillStyle = '#c98a00';
    circle(x, y + 1, r); ctx.fill();
    ctx.fillStyle = '#ffd34d';
    circle(x, y, r); ctx.fill();
    ctx.fillStyle = '#fff2a8';
    circle(x - r * 0.3, y - r * 0.3, r * 0.35); ctx.fill();
  }

  // ===== UI 버튼 =====
  let buttons = [];
  function button(x, y, w, h, label, onClick, o) {
    o = o || {};
    const disabled = !!o.disabled;
    buttons.push({ x, y, w, h, onClick: disabled ? null : onClick });
    const c1 = disabled ? '#4a5270' : (o.color || '#ffcf3f');
    const c2 = disabled ? '#2e344a' : (o.dark || '#c98a00');
    ctx.fillStyle = c2;
    rr(x, y + 4, w, h, o.r || 14); ctx.fill();
    ctx.fillStyle = c1;
    rr(x, y, w, h, o.r || 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rr(x + 4, y + 3, w - 8, h * 0.38, (o.r || 14) - 4); ctx.fill();
    text(label, x + w / 2, y + h / 2 + 1, o.size || 22, disabled ? '#9aa3c0' : (o.textColor || '#3a2400'));
  }

  function drawPauseIcon(x, y) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 6, y - 8, 4, 16);
    ctx.fillRect(x + 2, y - 8, 4, 16);
  }

  function drawSpeaker(x, y, muted) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y - 9); ctx.lineTo(x + 2, y + 9); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x - 9, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = muted ? '#ff4d5e' : '#fff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (muted) { ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 11, y + 5); ctx.moveTo(x + 11, y - 5); ctx.lineTo(x + 5, y + 5); }
    else { ctx.arc(x + 3, y, 6, -0.9, 0.9); ctx.moveTo(x + 7, y - 8); ctx.arc(x + 3, y, 10, -0.9, 0.9); }
    ctx.stroke();
  }

  function iconButton(x, y, draw, onClick) {
    buttons.push({ x: x - 4, y: y - 4, w: 44, h: 44, onClick });
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    rr(x, y, 36, 36, 10); ctx.fill();
    draw(x + 18, y + 18);
  }

  function toggleMute() { SAVE.muted = !SAVE.muted; persist(); }

  // ===== HUD =====
  function drawHud() {
    const tg = ctx.createLinearGradient(0, 0, 0, 80);
    tg.addColorStop(0, 'rgba(5,8,20,0.85)');
    tg.addColorStop(1, 'rgba(5,8,20,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, 80);

    if (S.mode === 'play') iconButton(10, 8, drawPauseIcon, () => { S.mode = 'paused'; });
    iconButton(W - 46, 8, (x, y) => drawSpeaker(x, y, SAVE.muted), toggleMute);

    // 스테이지 + 진행바
    text('STAGE ' + S.stage, W / 2, 18, 18, '#fff', { stroke: 4 });
    const bx = 120, bw = W - 240, by = 34;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    rr(bx, by, bw, 8, 4); ctx.fill();
    const prog = S.phase === 'wave' ? S.stageT / STAGE_LEN : 1;
    ctx.fillStyle = S.phase === 'wave' ? '#4fc3ff' : '#ff4d5e';
    rr(bx, by, Math.max(8, bw * prog), 8, 4); ctx.fill();
    ctx.fillStyle = '#ff4d5e';
    circle(bx + bw, by + 4, 9); ctx.fill();
    text('B', bx + bw, by + 5, 11, '#fff');

    // 코인
    drawCoin(W - 104, 24, 9);
    text(fmt(S.coins), W - 90, 25, 16, '#ffd34d', { align: 'left', stroke: 4 });

    // 보스 체력바
    if (S.boss && !S.boss.enter) {
      const b = S.boss;
      ctx.fillStyle = 'rgba(5,8,20,0.55)';
      rr(8, 52, W - 16, 40, 10); ctx.fill();
      text(b.name, 16, 64, 14, '#ffb3b3', { align: 'left', stroke: 4 });
      text(fmt(Math.ceil(b.hp)), W - 16, 64, 13, '#fff', { align: 'right', stroke: 4 });
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      rr(16, 74, W - 32, 12, 6); ctx.fill();
      const hg = ctx.createLinearGradient(16, 0, W - 16, 0);
      hg.addColorStop(0, '#ff4d5e'); hg.addColorStop(1, '#ff9a3c');
      ctx.fillStyle = hg;
      rr(16, 74, Math.max(6, (W - 32) * clamp(b.hp / b.max, 0, 1)), 12, 6); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.2 + b.flash * 0.15})`;
      rr(18, 75, Math.max(4, (W - 36) * clamp(b.hp / b.max, 0, 1)), 4, 2); ctx.fill();
    }

    // 무기 레벨
    const chips = Object.keys(CRATES).filter(k => S.wl[k] > 0);
    let cx = 20;
    for (const k of chips) {
      const label = CRATES[k].label + ' ' + S.wl[k];
      ctx.font = `800 12px ${FONT}`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      rr(cx, H - 26, w, 20, 10); ctx.fill();
      text(label, cx + w / 2, H - 15, 12, CRATES[k].color, { weight: 800 });
      cx += w + 6;
    }

    // 배너
    if (S.banner && (S.mode === 'play' || S.mode === 'paused')) {
      const bn = S.banner;
      const age = bn.dur - bn.t;
      let a = clamp(bn.t * 2.5, 0, 1);
      if (bn.blink) a *= 0.55 + 0.45 * Math.sin(age * 14);
      const pop = 1 + Math.max(0, 0.18 - age) * 2.5;
      ctx.globalAlpha = a;
      if (bn.blink) {
        ctx.fillStyle = 'rgba(255,30,50,0.18)';
        ctx.fillRect(0, H * 0.33 - 50, W, 100);
      }
      text(bn.text, W / 2, H * 0.36, 44 * pop, bn.color, { stroke: 8 });
      if (bn.sub) text(bn.sub, W / 2, H * 0.36 + 42, 18, '#fff', { stroke: 5, weight: 800 });
      ctx.globalAlpha = 1;
    }

    // 피격/섬광
    if (S.hurt > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(255,0,30,0)');
      vg.addColorStop(1, `rgba(255,0,30,${S.hurt * 0.45})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (S.white > 0) {
      ctx.fillStyle = `rgba(255,255,255,${S.white * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ===== 화면: 타이틀 / 일시정지 / 게임오버 =====
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(x, y + 5, w, h, 18); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,58,0.94)';
    rr(x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(4,7,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    const tt = performance.now() / 1000;

    // 로고
    const ly = 128 + Math.sin(tt * 2) * 4;
    text('곱셈', W / 2 - 62, ly, 58, '#6ff0ff', { stroke: 10, strokeColor: '#0a2a55' });
    text('디펜스', W / 2 + 70, ly + 52, 58, '#ffd34d', { stroke: 10, strokeColor: '#4a2a00' });
    ctx.save();
    ctx.translate(W / 2 + 118, ly - 22);
    ctx.rotate(0.25 + Math.sin(tt * 3) * 0.06);
    ctx.fillStyle = '#ff4d5e';
    rr(-30, -18, 60, 36, 10); ctx.fill();
    text('×10', 0, 1, 22, '#fff');
    ctx.restore();
    text('게이트로 병력을 불리고 몬스터를 막아라!', W / 2, 232, 15, '#dfe6ff', { weight: 700 });

    button(W / 2 - 120, 262, 240, 62, '게임 시작', () => startRun(), { size: 26 });

    const bestLine = SAVE.bestStage > 0 ? `최고 STAGE ${SAVE.bestStage}  ·  최고 점수 ${fmt(SAVE.best)}` : '처음 오셨군요! 행운을 빌어요';
    text(bestLine, W / 2, 352, 14, '#ffd34d', { weight: 800 });

    // 업그레이드
    panel(20, 378, W - 40, 262);
    text('업그레이드', 40, 404, 18, '#fff', { align: 'left' });
    drawCoin(W - 120, 404, 9);
    text(fmt(SAVE.coins), W - 106, 405, 18, '#ffd34d', { align: 'left' });
    UPGRADES.forEach((u, i) => {
      const y = 432 + i * 66;
      const lvl = SAVE.up[u.key];
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      rr(32, y, W - 64, 56, 12); ctx.fill();
      text(u.name, 46, y + 18, 16, '#fff', { align: 'left' });
      text(`Lv.${lvl}  ${u.eff(lvl)}${lvl < u.max ? ' → ' + u.eff(lvl + 1) : ''}`, 46, y + 39, 13, '#9fb3e6', { align: 'left', weight: 700 });
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      button(W - 142, y + 9, 100, 38, maxed ? 'MAX' : fmt(cost), () => {
        SAVE.coins -= cost; SAVE.up[u.key]++; persist(); Sound.power();
        newRun('title');
      }, { size: 17, disabled: maxed || SAVE.coins < cost, r: 10 });
    });

    text('PC: 마우스 · ← →    폰: 좌우 드래그', W / 2, 668, 13, '#9aa6d6', { weight: 700 });
    text('보스는 40초마다 등장해요', W / 2, 690, 13, '#9aa6d6', { weight: 700 });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4,7,20,0.7)';
    ctx.fillRect(0, 0, W, H);
    panel(50, 240, W - 100, 250);
    text('일시정지', W / 2, 288, 32, '#fff');
    button(W / 2 - 110, 330, 220, 56, '계속하기', () => { S.mode = 'play'; }, { size: 22 });
    button(W / 2 - 110, 405, 220, 56, '메인으로', () => { gameOverToTitle(); }, { size: 20, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
  }

  function gameOverToTitle() {
    if (S.mode === 'paused') {
      // 진행 중 포기: 모은 코인은 지급
      SAVE.coins += Math.floor(S.coins);
      SAVE.bestStage = Math.max(SAVE.bestStage, S.stage - 1);
      if (S.score > SAVE.best) SAVE.best = S.score;
      persist();
    }
    toTitle();
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(4,7,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const k = clamp(S.overT * 3, 0, 1);
    panel(40, 170 + (1 - k) * 40, W - 80, 400);
    const y0 = 170 + (1 - k) * 40;
    text('GAME OVER', W / 2, y0 + 50, 42, '#ff4d5e', { stroke: 6 });
    text(`STAGE ${S.stage} 도달`, W / 2, y0 + 105, 22, '#fff');
    text(`처치 ${fmt(S.kills)}  ·  점수 ${fmt(S.score)}`, W / 2, y0 + 140, 16, '#c7d2f5', { weight: 700 });
    drawCoin(W / 2 - 62, y0 + 182, 10);
    text(`+${fmt(S.earned)} 코인`, W / 2 + 10, y0 + 183, 22, '#ffd34d');
    text(S.newBest ? '★ 최고 기록 갱신! ★' : `최고 점수 ${fmt(SAVE.best)}`, W / 2, y0 + 222, 16, S.newBest ? '#7dff8a' : '#9fb3e6');
    if (S.overT > 0.8) {
      button(W / 2 - 120, y0 + 252, 240, 56, '다시 하기', () => startRun(), { size: 22 });
      button(W / 2 - 120, y0 + 322, 240, 52, '업그레이드 하러 가기', () => toTitle(), { size: 18, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
    }
  }

  // ===== 메인 그리기 =====
  function draw() {
    buttons = [];
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.save();
    if (S.shake > 0) ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);
    drawBg();
    drawHazards();
    drawGates();
    drawCrates();
    drawEnemies();
    drawBoss();
    drawShots();
    drawBullets();
    drawSquad();
    drawFx();
    ctx.restore();
    drawCoinFx();
    if (S.mode !== 'title') drawHud();
    if (S.mode === 'title') {
      drawTitle();
      iconButton(W - 46, 8, (x, y) => drawSpeaker(x, y, SAVE.muted), toggleMute);
    } else if (S.mode === 'paused') drawPaused();
    else if (S.mode === 'over') drawOver();
  }

  // ===== 입력 =====
  const keys = { left: false, right: false };
  let drag = null;

  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    Sound.resume();
    const p = toGame(e);
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (b.onClick) { Sound.click(); b.onClick(); }
        return;
      }
    }
    if (S.mode !== 'play') return;
    if (e.pointerType === 'mouse') S.tx = p.x;
    else drag = { id: e.pointerId, x: p.x, tx: S.tx };
  });
  window.addEventListener('pointermove', e => {
    if (S.mode !== 'play') return;
    const p = toGame(e);
    if (e.pointerType === 'mouse') S.tx = p.x;
    else if (drag && drag.id === e.pointerId) S.tx = drag.tx + (p.x - drag.x) * 1.4;
  });
  const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', e => {
    Sound.init(); Sound.resume();
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (S.mode === 'title') startRun();
      else if (S.mode === 'over' && S.overT > 0.8) startRun();
      else if (S.mode === 'paused') S.mode = 'play';
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (S.mode === 'play') S.mode = 'paused';
      else if (S.mode === 'paused') S.mode = 'play';
    }
  });
  window.addEventListener('keyup', e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden && S.mode === 'play') S.mode = 'paused';
  });

  // ===== 메인 루프 =====
  newRun('title');
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt > 0) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 테스트용
  window.__game = {
    get state() { return S; }, start: startRun, toTitle,
    step(sec) { for (let i = 0; i < sec * 60; i++) update(1 / 60); draw(); },
  };
})();
