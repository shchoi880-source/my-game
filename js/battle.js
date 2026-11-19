'use strict';
// 전투: 스테이지 진행, 몬스터/보스, 게이트, 스킬, 연출
(() => {
  const MD = window.MD;
  const { W, H, TAU } = MD;
  const ctx = MD.ctx;
  const { rand, randi, pick, clamp, lerp, fmt, rr, circle, text } = MD;

  const SQUAD_Y = 676;
  const DEFENSE_Y = 612;
  const GATE_H = 62;
  const SCROLL = 95;
  const MAX_N = 1e12;

  const B = {};
  MD.battle = B;
  let S = null;
  B.state = () => S;

  // ===================================================================
  //  몬스터 / 영웅 그리기 (메뉴에서도 사용)
  // ===================================================================
  MD.drawMonster = (recipe, color, x, y, size, t, o) => {
    o = o || {};
    const body = MD.frame(`body_${color}${recipe.body}`);
    if (!body) {
      ctx.fillStyle = '#7c5';
      circle(x, y, size / 2); ctx.fill();
      return;
    }
    const k = size / body.w;
    const bw = body.w * k, bh = body.h * k;
    const walk = Math.sin(t * (o.walkSpeed || 8));
    ctx.save();
    ctx.translate(x, y);
    if (o.squash) ctx.scale(1 + o.squash, 1 - o.squash);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, bh * 0.62, bw * 0.55, bh * 0.14, 0, 0, TAU); ctx.fill();
    // 다리
    if (recipe.legs) {
      const n = `leg_${color}${recipe.legs}`;
      MD.spr(n, -bw * 0.2, bh * 0.28, { scale: k * 0.55, ay: 0.1, rot: walk * 0.22, flipX: true });
      MD.spr(n, bw * 0.2, bh * 0.28, { scale: k * 0.55, ay: 0.1, rot: -walk * 0.22 });
    }
    // 팔
    if (recipe.arms) {
      const n = `arm_${color}${recipe.arms}`;
      const sw = Math.sin(t * (o.walkSpeed || 8) + 1.2) * 0.18 + (o.armUp || 0);
      MD.spr(n, -bw * 0.44, -bh * 0.02, { scale: k * 0.6, ay: 0.1, rot: 0.5 + sw, flipX: true });
      MD.spr(n, bw * 0.44, -bh * 0.02, { scale: k * 0.6, ay: 0.1, rot: -0.5 - sw });
    }
    // 장식 (뿔/더듬이/귀)
    if (recipe.detail) {
      const d = recipe.detail, n = `detail_${color}_${d.k}`;
      MD.spr(n, -bw * d.x, bh * d.y, { scale: k * d.s, ay: 0.85, rot: -0.25, flipX: true });
      MD.spr(n, bw * d.x, bh * d.y, { scale: k * d.s, ay: 0.85, rot: 0.25 });
    }
    // 몸통
    MD.spr(`body_${color}${recipe.body}`, 0, 0, { scale: k });
    if (o.flash > 0) MD.spr(`body_${color}${recipe.body}`, 0, 0, { scale: k, tint: '#ffffff', alpha: o.flash * 0.55 });
    // 눈
    const blink = ((t + (o.seed || 0)) % 3.4) < 0.12;
    for (const e of recipe.eyes) {
      const f = MD.frame(e.k);
      if (!f) continue;
      const sc = k * e.s * 1.5;
      MD.spr(e.k, bw * e.x + (o.lookX || 0) * 2, bh * e.y + (o.lookY || 0) * 2, { w: f.w * sc, h: f.h * sc * (blink ? 0.15 : 1) });
    }
    // 입
    if (recipe.mouth) {
      const m = recipe.mouth;
      MD.spr(m.k, bw * m.x, bh * m.y, { scale: k * m.s * 1.4 });
    }
    // 왕관
    if (recipe.crown) {
      const cw = bw * 0.55, cy = -bh * 0.52;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(-cw / 2, cy);
      ctx.lineTo(-cw / 2, cy - cw * 0.45); ctx.lineTo(-cw / 4, cy - cw * 0.2);
      ctx.lineTo(0, cy - cw * 0.55); ctx.lineTo(cw / 4, cy - cw * 0.2);
      ctx.lineTo(cw / 2, cy - cw * 0.45); ctx.lineTo(cw / 2, cy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ff4d8d'; circle(0, cy - cw * 0.12, cw * 0.08); ctx.fill();
    }
    ctx.restore();
  };

  // 영웅 스프라이트는 오른쪽을 보고 있으므로 위로 회전
  MD.drawHero = (sprite, pose, x, y, scale, rot) => {
    return MD.spr(`${sprite}_${pose}`, x, y, { scale, rot: (rot || 0) - Math.PI / 2, ax: 0.42 });
  };

  MD.drawCoin = (x, y, r) => {
    ctx.fillStyle = '#c98a00';
    circle(x, y + r * 0.15, r); ctx.fill();
    ctx.fillStyle = '#ffd34d';
    circle(x, y, r); ctx.fill();
    ctx.fillStyle = '#e8a800';
    circle(x, y, r * 0.62); ctx.fill();
    ctx.fillStyle = '#fff2a8';
    circle(x - r * 0.3, y - r * 0.3, r * 0.28); ctx.fill();
  };

  // ===================================================================
  //  시작
  // ===================================================================
  function makeBg(info) {
    const world = info.worldData;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = W; c.height = 512;
    const g = c.getContext('2d');
    if (!g || !g.drawImage) return null;
    g.fillStyle = world.ground;
    g.fillRect(0, 0, W, 512);
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < W; x += 64) {
        const f = MD.frame(pick(world.tiles));
        if (f) g.drawImage(f.img, f.x, f.y, f.w, f.h, x, y, 64, 64);
      }
    }
    // 작은 장식
    for (let i = 0; i < 7; i++) {
      const f = MD.frame(pick(world.deco));
      if (!f) continue;
      const s = rand(0.45, 0.8);
      g.globalAlpha = 0.85;
      g.drawImage(f.img, f.x, f.y, f.w, f.h, rand(60, W - 100), rand(0, 512 - 40), f.w * s, f.h * s);
    }
    g.globalAlpha = 1;
    return c;
  }

  function makeSideDeco(info) {
    const arr = [];
    const side = info.worldData.side;
    for (let i = 0; i < 16; i++) {
      const left = i % 2 === 0;
      arr.push({ name: pick(side), x: left ? rand(-14, 14) : W - rand(-14, 14), y: rand(-80, H), s: rand(0.9, 1.4), rot: rand(-0.4, 0.4) });
    }
    return arr;
  }

  B.start = idx => {
    const info = MD.stageInfo(idx);
    const st = MD.stats();
    S = {
      idx, info, st,
      phase: 'wave', t: 0, stageT: 0, phaseT: 0, realT: 0,
      n: st.startN, peak: st.startN, lost: 0, px: W / 2, tx: W / 2,
      bullets: [], enemies: [], gates: [], crates: [], shots: [], hazards: [], parts: [], texts: [], coinFx: [], grenades: [],
      wl: { rate: 0, dmg: 0, spread: 0, pierce: 0 },
      fireT: 0, spawnT: 2.0, gateT: 0.8, crateT: 9,
      coins: 0, kills: 0, leaks: 0, boss: null, bossKillT: null,
      shake: 0, hurt: 0, white: 0, timeScale: 1, scroll: 0, id: 0,
      skill: { charge: 0, kind: st.hero.skill, ready: false },
      buff: { rate: 0, shield: 0, slow: 0, laser: 0, flame: 0 },
      banner: null, cine: null, result: null, paused: false,
      muzzle: 0, firstGateDone: false,
      bg: makeBg(info), deco: makeSideDeco(info), ambient: [],
      hint: null,
    };
    setBanner(`STAGE ${info.label}`, info.worldData.name, '#ffffff', 2.2);
    MD.sfx.music(info.worldData.music);
  };

  function setBanner(t, sub, color, dur, blink) {
    S.banner = { text: t, sub: sub || '', color: color || '#fff', t: dur || 2, dur: dur || 2, blink: !!blink };
  }

  // ===================================================================
  //  난이도
  // ===================================================================
  const progress = () => (S.phase === 'wave' ? S.stageT / S.info.len : 1);
  const diff = () => 1.2 * Math.pow(1.215, S.idx) * (1 + progress() * 0.5);
  const stageBase = () => Math.pow(Math.max(1, S.n), 0.9) * diff() + 2 + S.idx;
  const squadR = () => 10 + 5.6 * Math.sqrt(Math.min(S.n, 40));
  const rateTotal = () => S.st.rateMul * (1 + S.wl.rate * 0.25) * (S.buff.rate > 0 ? 3 : 1);
  const dmgTotal = () => S.st.dmgMul * (1 + S.wl.dmg * 0.3);
  const dps = () => S.n * 2.2 * dmgTotal() * rateTotal();

  // ===================================================================
  //  이펙트
  // ===================================================================
  function fx(sprite, x, y, o) {
    if (S.parts.length > 420) return;
    o = o || {};
    const life = o.life || rand(0.35, 0.7);
    const a = o.angle != null ? o.angle : rand(0, TAU);
    const sp = o.speed != null ? o.speed : 0;
    S.parts.push({
      sprite, x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
      life, max: life, s0: o.s0 != null ? o.s0 : 0.4, s1: o.s1 != null ? o.s1 : 0.1,
      rot: o.rot != null ? o.rot : rand(0, TAU), vr: o.vr || 0, color: o.color || '#ffffff',
      add: o.add !== false, alpha: o.alpha || 1, drag: o.drag == null ? 0.92 : o.drag, grav: o.grav || 0,
    });
  }
  function burst(x, y, color, n, speed, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      fx(o.sprite || pick(['spark_04', 'star_04', 'light_02']), x, y, { speed: rand(0.3, 1) * (speed || 240), color, life: rand(0.3, 0.7), s0: o.s0 || rand(0.18, 0.35), s1: 0.02, grav: o.grav });
    }
  }
  function explosion(x, y, size, color) {
    fx('light_01', x, y, { color: color || '#ffcf6b', s0: size * 0.02, s1: size * 0.03, life: 0.3, speed: 0 });
    fx('circle_02', x, y, { color: '#ffffff', s0: size * 0.003, s1: size * 0.022, life: 0.4, speed: 0, alpha: 0.8 });
    for (let i = 0; i < 6; i++) fx(pick(['smoke_01', 'smoke_02', 'smoke_04']), x + rand(-size, size) * 0.3, y + rand(-size, size) * 0.3, { color: '#6b5a52', add: false, s0: size * 0.008, s1: size * 0.016, life: rand(0.5, 0.9), speed: rand(20, 60), alpha: 0.7, drag: 0.9 });
    for (let i = 0; i < 4; i++) fx(pick(['fire_01', 'fire_02', 'flame_01']), x, y, { color: pick(['#ffb347', '#ff6a3d', '#ffd34d']), s0: size * 0.008, s1: size * 0.002, life: 0.4, speed: rand(40, 160) });
    burst(x, y, '#ffd34d', 10, size * 4);
  }
  function addText(x, y, str, color, size) {
    S.texts.push({ x, y, text: str, color, size, t: 1 });
  }
  function coinFx(x, y, n) {
    for (let i = 0; i < n && S.coinFx.length < 40; i++) S.coinFx.push({ sx: x + rand(-12, 12), sy: y + rand(-12, 12), t: -i * 0.04, d: rand(0.45, 0.7) });
  }

  // ===================================================================
  //  게이트
  // ===================================================================
  const isGood = o => o.op === '+' || o.op === '×';
  const opText = o => o.op + fmt(o.v);
  function goodOp() {
    const s = S.idx + 1, r = Math.random();
    if (r < 0.5) return { op: '+', v: randi(3 + s * 2, 8 + s * 5), pulse: 0 };
    if (r < 0.85) return { op: '×', v: Math.random() < 0.65 ? 2 : 3, pulse: 0 };
    if (r < 0.97) return { op: '×', v: 5, pulse: 0 };
    return { op: '×', v: 10, pulse: 0 };
  }
  function minusOp() { const s = S.idx + 1; return { op: '−', v: randi(3 + s * 2, 6 + s * 4), pulse: 0 }; }
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

  // ===================================================================
  //  보급 상자
  // ===================================================================
  function spawnCrate() {
    if (S.gates.some(g => g.y < 100)) { S.crateT = 1.5; return; }
    const types = Object.keys(MD.CRATES).filter(k => S.wl[k] < MD.CRATES[k].max);
    if (!types.length) return;
    const hp = Math.max(6, Math.round(stageBase() * 2.5));
    S.crates.push({ id: ++S.id, type: pick(types), x: rand(70, W - 70), y: -40, w: 64, h: 54, hp, max: hp, flash: 0 });
  }
  function openCrate(c) {
    c.dead = true;
    S.wl[c.type]++;
    const def = MD.CRATES[c.type];
    explosion(c.x, c.y, 60, def.color);
    for (let i = 0; i < 8; i++) fx('dirt_01', c.x, c.y, { color: '#b5763a', add: false, speed: rand(80, 220), s0: 0.15, s1: 0.05, life: 0.6, grav: 400 });
    addText(c.x, c.y - 10, def.label + ' UP!', def.color, 30);
    MD.sfx.crate();
    MD.sfx.levelup();
    MD.addStat('crates', 1);
    if (!MD.save.tut.crate) MD.save.tut.crate = true;
  }

  // ===================================================================
  //  몬스터
  // ===================================================================
  function pickType() {
    const pool = ['grunt', 'grunt', 'grunt'];
    if (S.idx >= 1 || S.stageT > 12) pool.push('runner', 'runner');
    if (S.idx >= 3) pool.push('tank');
    if (S.idx >= 6) pool.push('splitter', 'splitter');
    if (S.idx >= 10) pool.push('tank', 'runner');
    return pick(pool);
  }
  function spawnEnemy(type, x, y, hpOverride, child) {
    const def = MD.ENEMY[type];
    const hp = hpOverride || Math.max(1, Math.round(stageBase() * def.hp * rand(0.8, 1.2)));
    const r = def.r * (1 + Math.min(0.35, Math.log10(hp) / 16)) * (child ? 0.75 : 1);
    S.enemies.push({
      id: ++S.id, type, def, recipe: MD.MON_RECIPES[type], color: S.info.worldData.colors[type],
      hp, max: hp, r,
      x: x != null ? clamp(x, r + 18, W - r - 18) : rand(r + 20, W - r - 20),
      y: y != null ? y : -r - 30,
      sp: def.sp * rand(0.9, 1.15) + Math.min(28, S.idx * 1.6),
      t: rand(0, 10), flash: 0, child: !!child, ph: rand(0, TAU), seed: rand(0, 3),
    });
  }
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    S.kills++;
    S.coins += e.def.coin * S.st.coinMul;
    coinFx(e.x, e.y, 1);
    fx('smoke_04', e.x, e.y, { color: '#ffffff', add: false, s0: e.r * 0.012, s1: e.r * 0.022, life: 0.45, alpha: 0.6 });
    fx('circle_03', e.x, e.y, { color: '#ffffff', s0: 0.05, s1: e.r * 0.012, life: 0.3, alpha: 0.7 });
    burst(e.x, e.y, colorHex(e.color), 10, 220);
    MD.sfx.kill();
    chargeSkill(3.2);
    if (e.type === 'splitter' && !e.child) for (const s of [-1, 1]) spawnEnemy('grunt', e.x + s * 18, e.y, Math.max(1, Math.round(e.max * 0.35)), true);
  }
  function colorHex(c) {
    return { green: '#62d66b', blue: '#4fc3ff', red: '#ff5a6a', yellow: '#ffcf3f', white: '#e8f2ff', dark: '#8a7a6a' }[c] || '#ffffff';
  }
  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 1;
    if (e.hp <= 0) killEnemy(e);
  }

  // ===================================================================
  //  보스
  // ===================================================================
  function spawnBoss() {
    const info = S.info, def = info.boss;
    const hp = Math.round(stageBase() * 30 * (info.isWorldBoss ? 1.5 : 0.75));
    const kindIdx = MD.BOSSES.indexOf(def);
    S.boss = {
      def, kind: def.kind, name: def.name, title: def.title, recipe: def.recipe,
      color: S.info.worldData.colors.boss,
      size: info.isWorldBoss ? 120 : 92, r: info.isWorldBoss ? 60 : 46,
      x: W / 2, y: -140, ty: 190, hp, max: hp, vx: 50 + S.idx * 2.5, t: 0,
      atkT: 2.0, flash: 0, squash: 0, slams: 0, enraged: false, atk: 0, kindIdx,
    };
  }
  function damageBoss(dmg) {
    const b = S.boss;
    if (!b || S.phase !== 'boss') return;
    b.hp -= dmg;
    b.flash = 1;
    chargeSkill(0.02);
    if (b.hp <= 0) killBoss();
  }
  function killBoss() {
    const b = S.boss;
    S.bossKillT = b.t;
    S.phase = 'bossdeath';
    S.phaseT = 0;
    S.timeScale = 0.25;
    S.white = 0.8;
    S.shake = 26;
    MD.sfx.bigboom();
    MD.sfx.roar();
    for (const e of S.enemies) if (!e.dead) { e.dead = true; burst(e.x, e.y, colorHex(e.color), 6, 160); }
    S.enemies = [];
    S.shots = []; S.hazards = []; S.crates = [];
    MD.addStat('bosses', 1);
  }

  function updateBoss(dt) {
    const b = S.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt * 6);
    b.squash = Math.max(0, b.squash - dt * 2.5);
    b.x += b.vx * dt * (S.buff.slow > 0 ? 0.15 : 1);
    if (b.x < b.r + 24) { b.x = b.r + 24; b.vx = Math.abs(b.vx); }
    if (b.x > W - b.r - 24) { b.x = W - b.r - 24; b.vx = -Math.abs(b.vx); }
    if (b.t > 30) {
      if (!b.enraged) { b.enraged = true; setBanner('보스 분노!', '빨리 처치하세요!', '#ff4d5e', 1.6, true); MD.sfx.warn(); }
      b.ty += 9 * dt;
    }
    b.y += (b.ty - b.y) * Math.min(1, dt * 2);
    if (b.y + b.r >= DEFENSE_Y) {
      loseTroops(S.n * 0.8 + 10, b.x, true);
      if (S.n > 0) { b.ty = 150; b.y = 150; b.t = 20; b.enraged = false; }
      return;
    }
    if (S.buff.slow > 0) return;
    b.atkT -= dt * (b.enraged ? 1.6 : 1);
    if (b.atkT > 0) return;
    let kind = b.kind;
    if (kind === 'overlord') kind = ['king', 'demon', 'titan'][b.atk++ % 3];
    if (kind === 'king') {
      b.atkT = 3;
      b.squash = 1;
      const cnt = S.info.isWorldBoss ? 3 : 2;
      for (let i = 0; i < cnt; i++) spawnEnemy('grunt', b.x + (i - (cnt - 1) / 2) * 44, b.y + b.r * 0.6);
      fx('circle_02', b.x, b.y + b.r, { color: '#7dff8a', s0: 0.2, s1: 1.4, life: 0.5, speed: 0 });
      MD.sfx.slam();
    } else if (kind === 'demon') {
      b.atkT = 1.5;
      const cnt = 1 + Math.min(2, Math.floor(S.idx / 4));
      const base = Math.atan2(SQUAD_Y - b.y, S.px - b.x);
      const shp = Math.max(3, Math.round(stageBase() * 0.3));
      for (let i = 0; i < cnt; i++) {
        const a = base + (i - (cnt - 1) / 2) * 0.28;
        S.shots.push({ x: b.x, y: b.y + b.r * 0.4, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: 13, hp: shp, t: 0 });
      }
      b.squash = 0.5;
      MD.sfx.fire();
    } else if (kind === 'titan') {
      b.atkT = 3.2;
      b.squash = 1;
      S.hazards.push({ x: clamp(S.px, 75, W - 75), w: 140, t: 0, dur: 1.15, done: false });
      if (b.slams++ % 2 === 1) spawnEnemy('tank', b.x, b.y + b.r);
      MD.sfx.slam();
    }
  }

  // ===================================================================
  //  발사 / 스킬
  // ===================================================================
  function fire() {
    const w = S.st.weapon;
    const k = Math.max(1, Math.min(S.n, Math.round((6 + S.wl.spread * 2) * w.bullets)));
    const rt = rateTotal();
    S.fireT = 0.2 / rt;
    const per = S.n * 2.2 * dmgTotal() * 0.2 / k;
    const R = squadR();
    const spread = (w.spread + S.wl.spread) * 0.11;
    for (let i = 0; i < k; i++) {
      const f = k === 1 ? 0 : i / (k - 1) - 0.5;
      const a = f * spread + rand(-0.02, 0.02);
      S.bullets.push({ x: S.px + f * R * 1.2, y: SQUAD_Y - R * 0.5, vx: Math.sin(a) * 780, vy: -Math.cos(a) * 780, dmg: per, pierce: w.pierce + S.wl.pierce, hits: [], gate: 0 });
    }
    S.muzzle = 0.06;
    MD.sfx.shoot(w.sfx);
  }

  function chargeSkill(v) {
    if (S.skill.ready) return;
    S.skill.charge = Math.min(100, S.skill.charge + v * S.st.chargeMul);
    if (S.skill.charge >= 100) { S.skill.ready = true; MD.sfx.select(); }
  }

  B.useSkill = () => {
    if (!S || !S.skill.ready || (S.phase !== 'wave' && S.phase !== 'boss' && S.phase !== 'warn')) return;
    S.skill.ready = false;
    S.skill.charge = 0;
    MD.addStat('skills', 1);
    MD.save.tut.skill = true;
    MD.sfx.skill();
    const kind = S.skill.kind, d = dps();
    const hero = S.st.hero;
    setBanner(hero.skillName + '!', '', '#ffd34d', 1.0);
    S.white = 0.25;
    switch (kind) {
      case 'volley': S.buff.rate = 5; break;
      case 'grenade':
        S.grenades.push({ x0: S.px, y0: SQUAD_Y - 20, x1: S.px, y1: Math.max(200, SQUAD_Y - 300), t: 0, dur: 0.5, dmg: d * 8 });
        break;
      case 'heal': {
        const back = Math.max(Math.ceil(S.lost * 0.5), Math.ceil(S.n * 0.15));
        S.n += back; S.lost = Math.max(0, S.lost - back);
        addText(S.px, SQUAD_Y - 90, '+' + fmt(back), '#7dff8a', 34);
        for (let i = 0; i < 20; i++) fx('star_06', S.px + rand(-50, 50), SQUAD_Y + rand(-20, 30), { color: '#7dff8a', vy: -rand(60, 160), s0: 0.25, s1: 0.05, life: 0.8 });
        MD.sfx.good();
        break;
      }
      case 'shield': S.buff.shield = 7; MD.sfx.shield(); break;
      case 'flame': S.buff.flame = 2.2; MD.sfx.fire(); break;
      case 'snipe': {
        let target = S.boss && S.phase === 'boss' ? S.boss : null;
        if (!target) for (const e of S.enemies) if (!e.dead && (!target || e.hp > target.hp)) target = e;
        if (target) {
          S.snipe = { x: target.x, y: target.y, t: 0.35 };
          explosion(target.x, target.y, 80, '#ff4d5e');
          addText(target.x, target.y - 40, 'HEADSHOT!', '#ff4d5e', 32);
          if (target === S.boss) damageBoss(d * 10); else damageEnemy(target, d * 14);
        }
        MD.sfx.shoot('shoot_rifle');
        break;
      }
      case 'slow': S.buff.slow = 6; MD.sfx.shield(); break;
      case 'laser': S.buff.laser = 4; MD.sfx.laser(); break;
    }
  };

  function loseTroops(amount, x, big) {
    if (S.buff.shield > 0) {
      fx('circle_02', x != null ? x : S.px, DEFENSE_Y, { color: '#6ff0ff', s0: 0.2, s1: 0.8, life: 0.4, speed: 0 });
      MD.sfx.metal();
      return;
    }
    const loss = Math.max(1, Math.ceil(amount));
    S.n -= loss;
    S.lost += Math.min(loss, Math.max(0, S.n + loss));
    S.leaks++;
    S.hurt = Math.min(1, S.hurt + (big ? 1 : 0.6));
    S.shake = Math.max(S.shake, big ? 22 : 10);
    addText(x != null ? clamp(x, 60, W - 60) : S.px, SQUAD_Y - 95, '−' + fmt(loss), '#ff5a5a', 30);
    MD.sfx.hurt();
    if (S.n <= 0) endBattle(false);
  }

  // ===================================================================
  //  종료 / 결과
  // ===================================================================
  function endBattle(win) {
    if (S.result) return;
    S.n = Math.max(0, S.n);
    const sv = MD.save;
    const prevStars = sv.stars[S.idx] || 0;
    let stars = 0;
    const checks = [win, win && S.leaks <= 3, win && S.bossKillT != null && S.bossKillT <= 30];
    if (win) stars = checks.filter(Boolean).length;
    const newStars = Math.max(0, stars - prevStars);
    const first = win && prevStars === 0;
    let coins = Math.floor(S.coins);
    let bonus = 0;
    if (win) {
      bonus = Math.round(40 * Math.pow(1.14, S.idx) * S.st.coinMul * (first ? 2 : 1)) + newStars * 25;
      coins += bonus;
      sv.stars[S.idx] = Math.max(prevStars, stars);
      sv.unlocked = Math.max(sv.unlocked, Math.min(MD.STAGE_COUNT - 1, S.idx + 1));
      MD.addStat('clears', 1);
      if (stars === 3) MD.addStat('perfect', 1);
    } else {
      // 실패해도 진행도만큼 위로 보상
      const prog = S.phase === 'wave' ? S.stageT / S.info.len : 1;
      bonus = Math.round(40 * Math.pow(1.14, S.idx) * S.st.coinMul * 0.5 * prog);
      coins += bonus;
    }
    sv.coins += coins;
    MD.addStat('kills', S.kills);
    MD.addStat('maxTroops', S.peak);
    MD.persist();
    S.result = { win, stars, checks, coins, bonus, first, newStars, t: 0, shownCoins: 0 };
    S.phase = 'result';
    S.phaseT = 0;
    S.timeScale = 1;
    if (win) { MD.sfx.win(); } else { MD.sfx.lose(); S.shake = 18; }
    MD.sfx.stopMusic();
  }

  // ===================================================================
  //  업데이트
  // ===================================================================
  function updateFx(dt) {
    for (const p of S.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.grav * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    S.parts = S.parts.filter(p => p.life > 0);
    for (const t of S.texts) { t.y -= 45 * dt; t.t -= dt * 0.85; }
    S.texts = S.texts.filter(t => t.t > 0);
    for (const c of S.coinFx) { c.t += dt; if (c.t >= c.d && !c.done) { c.done = true; MD.sfx.coin(); } }
    S.coinFx = S.coinFx.filter(c => !c.done);
    for (const g of S.gates) for (const o of g.sides) o.pulse = Math.max(0, o.pulse - dt * 6);
    S.shake = Math.max(0, S.shake - dt * 45);
    S.hurt = Math.max(0, S.hurt - dt * 1.8);
    S.white = Math.max(0, S.white - dt * 2);
    S.muzzle = Math.max(0, S.muzzle - dt);
    if (S.snipe) { S.snipe.t -= dt; if (S.snipe.t <= 0) S.snipe = null; }
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    // 환경 입자
    const amb = S.info.worldData.ambient;
    if (amb && S.ambient.length < 40 && Math.random() < dt * 20) {
      if (amb === 'snow') S.ambient.push({ x: rand(0, W), y: -10, vx: rand(-15, 15), vy: rand(30, 70), r: rand(1.5, 3.5), c: 'rgba(255,255,255,0.8)' });
      if (amb === 'dust') S.ambient.push({ x: -10, y: rand(0, H), vx: rand(60, 140), vy: rand(-10, 10), r: rand(1, 2.5), c: 'rgba(255,220,160,0.5)' });
      if (amb === 'ember') S.ambient.push({ x: rand(0, W), y: H + 10, vx: rand(-15, 15), vy: -rand(40, 90), r: rand(1.5, 3), c: 'rgba(255,140,60,0.8)' });
    }
    for (const a of S.ambient) { a.x += a.vx * dt; a.y += a.vy * dt; }
    S.ambient = S.ambient.filter(a => a.x > -20 && a.x < W + 20 && a.y > -20 && a.y < H + 20);
  }

  B.update = dtReal => {
    if (!S) return;
    S.realT += dtReal;
    if (S.paused) return;
    if (S.phase === 'result') {
      S.result.t += dtReal;
      S.result.shownCoins = Math.min(S.result.coins, S.result.shownCoins + Math.max(1, S.result.coins * dtReal * 1.2));
      updateFx(dtReal);
      return;
    }
    const dt = dtReal * S.timeScale;
    updateFx(dt);

    // 연출 단계
    if (S.phase === 'bossdeath') {
      S.phaseT += dtReal;
      if (S.boss && Math.random() < dtReal * 14) explosion(S.boss.x + rand(-50, 50), S.boss.y + rand(-50, 50), rand(50, 110));
      if (S.phaseT > 1.6) {
        if (S.boss) {
          explosion(S.boss.x, S.boss.y, 220, '#ffd34d');
          coinFx(S.boss.x, S.boss.y, 20);
          S.coins += (20 + S.idx * 8) * S.st.coinMul;
          S.boss = null;
          S.timeScale = 1;
          S.white = 1;
          MD.sfx.explode();
        }
        if (S.phaseT > 2.6) endBattle(true);
      }
      return;
    }
    if (S.phase === 'cine') {
      S.phaseT += dtReal;
      const b = S.boss;
      b.t += dtReal;
      b.y = lerp(-140, b.ty, MD.easeOutCubic(clamp(S.phaseT / 1.4, 0, 1)));
      if (S.phaseT > 1.4 && !S.cineRoar) { S.cineRoar = true; b.squash = 1; S.shake = 20; MD.sfx.roar(); }
      b.squash = Math.max(0, b.squash - dtReal * 2);
      if (S.phaseT > 2.8) { S.phase = 'boss'; S.phaseT = 0; b.t = 0; MD.sfx.music('boss'); }
      return;
    }

    S.t += dt;
    S.scroll += SCROLL * dt;
    for (const d of S.deco) { d.y += SCROLL * dt; if (d.y > H + 80) { d.y = rand(-140, -60); d.name = pick(S.info.worldData.side); } }

    // 이동
    if (B.keys.left) S.tx -= 480 * dtReal;
    if (B.keys.right) S.tx += 480 * dtReal;
    const R = squadR();
    S.tx = clamp(S.tx, R + 8, W - R - 8);
    S.px += (S.tx - S.px) * Math.min(1, dt * 14);

    // 버프
    for (const k of Object.keys(S.buff)) S.buff[k] = Math.max(0, S.buff[k] - dt);
    chargeSkill(dt * 1.8);

    // 단계 진행
    S.phaseT += dt;
    if (S.phase === 'wave') {
      S.stageT += dt;
      if (S.stageT >= S.info.len) {
        S.phase = 'warn'; S.phaseT = 0;
        MD.sfx.warn();
        setBanner('WARNING', (S.info.isWorldBoss ? '월드 보스 ' : '') + S.info.boss.name + ' 접근 중!', '#ff4d5e', 2.3, true);
      }
    } else if (S.phase === 'warn') {
      if (S.phaseT >= 2.3) {
        spawnBoss();
        S.phase = 'cine'; S.phaseT = 0; S.cineRoar = false;
        S.shots = [];
        MD.sfx.stopMusic();
        return;
      }
    }

    // 스폰
    if (S.phase === 'wave' || S.phase === 'boss') {
      S.spawnT -= dt;
      if (S.spawnT <= 0) {
        const iv = Math.max(0.5, 1.15 - S.idx * 0.025 - progress() * 0.3);
        S.spawnT = S.phase === 'boss' ? iv * 2.4 : iv;
        spawnEnemy(pickType());
        if (S.idx >= 3 && Math.random() < 0.12 + S.idx * 0.015) spawnEnemy(pickType());
      }
    }
    if (S.phase === 'wave' || S.phase === 'boss') {
      S.gateT -= dt;
      if (S.gateT <= 0) { S.gateT = S.phase === 'boss' ? rand(5.5, 7.5) : rand(4, 5.2); spawnGate(); }
      S.crateT -= dt;
      if (S.crateT <= 0) { S.crateT = rand(13, 18); spawnCrate(); }
    }

    // 발사
    S.fireT -= dt;
    if (S.fireT <= 0) fire();

    // 수류탄
    for (const g of S.grenades) {
      g.t += dt;
      if (g.t >= g.dur && !g.done) {
        g.done = true;
        explosion(g.x1, g.y1, 200, '#ffb347');
        S.shake = 18;
        MD.sfx.bigboom();
        for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - g.x1, e.y - g.y1) < 150) damageEnemy(e, g.dmg);
        if (S.boss && S.phase === 'boss' && Math.hypot(S.boss.x - g.x1, S.boss.y - g.y1) < 150 + S.boss.r) damageBoss(g.dmg * 0.5);
      }
    }
    S.grenades = S.grenades.filter(g => !g.done);

    // 레이저 / 화염
    if (S.buff.laser > 0) {
      const d = dps() * 3 * dt;
      for (const e of S.enemies) if (!e.dead && Math.abs(e.x - S.px) < 36 + e.r) damageEnemy(e, d);
      if (S.boss && S.phase === 'boss' && Math.abs(S.boss.x - S.px) < 36 + S.boss.r) damageBoss(d * 0.6);
      if (Math.random() < 0.6) fx('spark_05', S.px + rand(-20, 20), rand(80, SQUAD_Y - 40), { color: '#ff4dd2', s0: 0.3, s1: 0.05, life: 0.3, speed: rand(30, 80) });
    }
    if (S.buff.flame > 0) {
      const d = dps() * 2.5 * dt;
      for (const e of S.enemies) {
        if (e.dead) continue;
        damageEnemy(e, d);
        if (Math.random() < 0.25) fx(pick(['fire_01', 'flame_01']), e.x + rand(-e.r, e.r), e.y, { color: pick(['#ff6a3d', '#ffb347']), vy: -80, s0: 0.25, s1: 0.05, life: 0.4 });
      }
      if (S.boss && S.phase === 'boss') { damageBoss(d * 0.35); if (Math.random() < 0.5) fx('fire_01', S.boss.x + rand(-50, 50), S.boss.y + rand(-40, 40), { color: '#ff6a3d', vy: -80, s0: 0.4, s1: 0.05, life: 0.4 }); }
    }

    // 총알
    const boss = S.phase === 'boss' ? S.boss : null;
    for (const b of S.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
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
        if (dx * dx + dy * dy < (s.r + 5) * (s.r + 5)) {
          s.hp -= b.dmg; b.dead = true;
          if (s.hp <= 0) { s.dead = true; explosion(s.x, s.y, 40, '#ff9a3c'); }
          break;
        }
      }
      if (b.dead) continue;
      for (const e of S.enemies) {
        if (e.dead || b.hits.includes(e.id)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.r + 5) * (e.r + 5)) {
          damageEnemy(e, b.dmg);
          b.hits.push(e.id);
          if (Math.random() < 0.35) fx('spark_04', b.x, b.y, { color: '#fff3b0', s0: 0.18, s1: 0.02, life: 0.15 });
          MD.sfx.hit();
          if (b.pierce-- <= 0) { b.dead = true; break; }
        }
      }
      if (b.dead) continue;
      if (boss) {
        const dx = b.x - boss.x, dy = b.y - boss.y;
        if (dx * dx + dy * dy < boss.r * boss.r) {
          damageBoss(b.dmg); b.dead = true;
          if (Math.random() < 0.3) fx('spark_04', b.x, b.y, { color: '#fff3b0', s0: 0.22, s1: 0.02, life: 0.15 });
          MD.sfx.hit();
          if (S.phase !== 'boss') break;
          continue;
        }
      }
      for (const g of S.gates) {
        if (g.used || b.gate === g.id) continue;
        if (Math.abs(b.y - g.y) < GATE_H / 2) { b.gate = g.id; bumpGate(g, b.x < W / 2 ? 0 : 1); }
      }
    }
    S.bullets = S.bullets.filter(b => !b.dead);
    if (S.phase === 'bossdeath' || S.result) return;

    // 몬스터 이동
    const slow = S.buff.slow > 0 ? 0.15 : 1;
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.y += e.sp * dt * slow;
      e.t += dt * slow;
      e.flash = Math.max(0, e.flash - dt * 7);
      if (e.def.zig) e.x = clamp(e.x + Math.sin(S.t * 3 + e.ph) * 70 * dt * slow, e.r + 18, W - e.r - 18);
      if (e.y + e.r * 0.8 >= DEFENSE_Y) {
        e.dead = true;
        explosion(e.x, DEFENSE_Y, 50, '#ff5a5a');
        loseTroops(S.n * (e.child ? 0.04 : e.def.leak) + 1 + S.idx * 0.5, e.x);
        if (S.result) return;
      }
    }
    S.enemies = S.enemies.filter(e => !e.dead);

    if (S.phase === 'boss') { updateBoss(dt); if (S.result || S.phase !== 'boss') return; }

    // 불덩이
    const R2 = squadR();
    for (const s of S.shots) {
      if (s.dead) continue;
      s.t += dt;
      s.x += s.vx * dt * slow; s.y += s.vy * dt * slow;
      if (Math.random() < 0.7) fx(pick(['fire_01', 'flame_01']), s.x, s.y, { color: pick(['#ffb347', '#ff6a3d']), vy: -30, s0: 0.22, s1: 0.04, life: 0.25 });
      if (s.y > SQUAD_Y - R2 * 0.6 && Math.abs(s.x - S.px) < R2 + s.r) {
        s.dead = true;
        explosion(s.x, s.y, 70, '#ff6a3d');
        loseTroops(S.n * 0.1 + S.idx * 3 + 2, s.x);
        if (S.result) return;
      } else if (s.y > H + 30 || s.x < -30 || s.x > W + 30) s.dead = true;
    }
    S.shots = S.shots.filter(s => !s.dead);

    // 바위 낙하
    for (const z of S.hazards) {
      z.t += dt * slow;
      if (!z.done && z.t >= z.dur) {
        z.done = true;
        S.shake = Math.max(S.shake, 16);
        MD.sfx.slam();
        explosion(z.x, SQUAD_Y, 120, '#c5ccd9');
        for (let i = 0; i < 10; i++) fx('dirt_02', z.x + rand(-z.w / 2, z.w / 2), SQUAD_Y + rand(-30, 30), { color: '#8d96a8', add: false, speed: rand(60, 200), angle: rand(-Math.PI, 0), s0: 0.2, s1: 0.08, life: 0.7, grav: 500 });
        if (Math.abs(S.px - z.x) < z.w / 2 + R2 * 0.4) { loseTroops(S.n * 0.25 + S.idx * 4, S.px, true); if (S.result) return; }
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
        S.peak = Math.max(S.peak, S.n);
        const good = isGood(o);
        addText(S.px, SQUAD_Y - 100, opText(o), good ? '#6ff0ff' : '#ff6a6a', 42);
        for (let i = 0; i < 14; i++) fx('star_04', S.px + rand(-40, 40), SQUAD_Y - 10, { color: good ? '#6ff0ff' : '#ff6a6a', vy: -rand(80, 220), s0: 0.3, s1: 0.03, life: 0.6 });
        if (good) MD.sfx.good(); else MD.sfx.bad();
        if (o.op === '×') MD.addStat('gatesX', 1);
        MD.save.tut.gate = true;
        if (S.n <= 0) { endBattle(false); return; }
      } else if (g.used) g.fade -= dt * 3;
    }
    S.gates = S.gates.filter(g => g.fade > 0 && g.y < H + GATE_H);

    // 상자
    for (const c of S.crates) {
      c.y += SCROLL * dt;
      c.flash = Math.max(0, c.flash - dt * 8);
      if (c.y > DEFENSE_Y + 20) { c.dead = true; burst(c.x, c.y, '#c88a4a', 8, 120); }
    }
    S.crates = S.crates.filter(c => !c.dead);

    if (S.t > 4) MD.save.tut.move = true;
  };

  // ===================================================================
  //  그리기
  // ===================================================================
  function drawBg() {
    const world = S.info.worldData;
    ctx.fillStyle = world.ground;
    ctx.fillRect(-30, -30, W + 60, H + 60);
    if (S.bg) {
      const off = S.scroll % 512;
      for (let y = -512 + off; y < H; y += 512) ctx.drawImage(S.bg, 0, Math.floor(y));
    }
    if (world.tint) { ctx.fillStyle = world.tint; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(8,14,32,0.32)'; ctx.fillRect(0, 0, W, H);
    // 가장자리 어둡게
    const vg = ctx.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, 'rgba(0,0,0,0.35)'); vg.addColorStop(0.15, 'rgba(0,0,0,0)');
    vg.addColorStop(0.85, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // 위쪽 어둡게 (깊이감)
    const tg = ctx.createLinearGradient(0, 0, 0, 260);
    tg.addColorStop(0, 'rgba(0,0,0,0.35)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 260);
    // 중앙선
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -S.scroll;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, DEFENSE_Y - 10); ctx.stroke();
    ctx.setLineDash([]);
    // 위험 구역
    const dg = ctx.createLinearGradient(0, DEFENSE_Y - 80, 0, DEFENSE_Y);
    dg.addColorStop(0, 'rgba(255,40,60,0)'); dg.addColorStop(1, 'rgba(255,40,60,0.22)');
    ctx.fillStyle = dg; ctx.fillRect(0, DEFENSE_Y - 80, W, 80);
    // 기지
    ctx.fillStyle = 'rgba(20,30,60,0.35)';
    ctx.fillRect(0, DEFENSE_Y, W, H - DEFENSE_Y);
    // 모래주머니
    for (let row = 0; row < 2; row++) {
      for (let x = -10 + row * 13, i = 0; x < W + 10; x += 26, i++) {
        const y = DEFENSE_Y - 8 + row * 10;
        ctx.fillStyle = '#5e4f33';
        rr(x, y + 2, 25, 13, 6); ctx.fill();
        ctx.fillStyle = (i + row) % 2 ? '#a08a5c' : '#b39b68';
        rr(x, y, 25, 12, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        rr(x + 4, y + 2, 15, 3, 2); ctx.fill();
      }
    }
    if (S.buff.shield > 0) {
      const a = Math.min(1, S.buff.shield) * (0.55 + Math.sin(S.realT * 8) * 0.15);
      const sg = ctx.createLinearGradient(0, DEFENSE_Y - 40, 0, DEFENSE_Y + 10);
      sg.addColorStop(0, 'rgba(110,240,255,0)'); sg.addColorStop(1, `rgba(110,240,255,${a})`);
      ctx.fillStyle = sg; ctx.fillRect(0, DEFENSE_Y - 40, W, 50);
      ctx.strokeStyle = `rgba(180,250,255,${a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, DEFENSE_Y - 10); ctx.lineTo(W, DEFENSE_Y - 10); ctx.stroke();
    }
  }

  function drawSideDeco() {
    for (const d of S.deco) MD.spr(d.name, d.x, d.y, { scale: d.s, rot: d.rot });
  }

  function drawGates() {
    for (const g of S.gates) {
      for (let s = 0; s < 2; s++) {
        const o = g.sides[s], good = isGood(o);
        ctx.globalAlpha = g.used ? Math.max(0, g.fade) * (g.chosen === s ? 1 : 0.35) : 1;
        const x0 = s === 0 ? 14 : W / 2 + 2, w = W / 2 - 16, top = g.y - GATE_H / 2;
        const edge = good ? '#38d1ff' : '#ff4d5e';
        const pg = ctx.createLinearGradient(0, top, 0, top + GATE_H);
        pg.addColorStop(0, good ? 'rgba(56,209,255,0.55)' : 'rgba(255,77,94,0.55)');
        pg.addColorStop(1, good ? 'rgba(56,209,255,0.15)' : 'rgba(255,77,94,0.15)');
        ctx.fillStyle = pg;
        rr(x0 + 6, top, w - 12, GATE_H, 6); ctx.fill();
        ctx.save();
        rr(x0 + 6, top, w - 12, GATE_H, 6); ctx.clip();
        const sx = x0 + ((S.realT * 140 + g.id * 70) % (w + 120)) - 60;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + 22, top); ctx.lineTo(sx - 8, top + GATE_H); ctx.lineTo(sx - 30, top + GATE_H); ctx.fill();
        ctx.restore();
        // 기둥
        for (const px of [x0, x0 + w - 12]) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(px + 2, top - 6, 12, GATE_H + 16, 4); ctx.fill();
          ctx.fillStyle = edge; rr(px, top - 9, 12, GATE_H + 16, 4); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(px + 2, top - 6, 3, GATE_H + 10);
        }
        ctx.fillStyle = edge; rr(x0, top - 12, w, 9, 4); ctx.fill();
        MD.spr('light_01', x0 + w / 2, g.y, { scale: 0.9, tint: edge, add: true, alpha: 0.25 });
        const sz = 34 * (1 + o.pulse * 0.2);
        text(opText(o), x0 + w / 2, g.y + 3, sz, '#fff', { stroke: 7, strokeColor: good ? '#0a4c66' : '#6b0f19' });
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCrates() {
    for (const c of S.crates) {
      const def = MD.CRATES[c.type];
      const jx = c.flash > 0 ? rand(-2, 2) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y + c.h / 2 + 4, c.w / 2, 7, 0, 0, TAU); ctx.fill();
      MD.spr('light_01', c.x, c.y, { scale: 1.1, tint: def.color, add: true, alpha: 0.35 + Math.sin(S.realT * 5) * 0.1 });
      if (!MD.spr('deco_129', c.x + jx, c.y, { w: c.w, h: c.h })) { ctx.fillStyle = '#b5763a'; rr(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, 6); ctx.fill(); }
      if (c.flash > 0.5) MD.spr('deco_129', c.x + jx, c.y, { w: c.w, h: c.h, tint: '#ffffff', alpha: 0.5 });
      ctx.fillStyle = def.color;
      rr(c.x - 26, c.y - 11, 52, 22, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.stroke();
      text(def.label, c.x + jx, c.y + 1, 14, '#0b1026');
      hpPill(c.x, c.y - c.h / 2 - 12, fmt(Math.ceil(c.hp)), 13);
    }
  }

  function hpPill(x, y, str, size) {
    ctx.font = `900 ${size}px ${MD.FONT}`;
    const w = ctx.measureText(str).width + 12;
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    rr(x - w / 2, y - size * 0.72, w, size * 1.44, size * 0.72); ctx.fill();
    text(str, x, y + 1, size, '#fff');
  }

  function drawEnemies() {
    const list = S.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const dx = S.px - e.x, dy = SQUAD_Y - e.y, d = Math.hypot(dx, dy) || 1;
      MD.drawMonster(e.recipe, e.color, e.x, e.y, e.r * 2.1, e.t, { flash: e.flash, lookX: dx / d, lookY: dy / d, seed: e.seed, walkSpeed: e.def.zig ? 14 : 8 });
      if (S.buff.slow > 0) MD.spr('magic_04', e.x, e.y, { scale: e.r * 0.02, tint: '#9fd8ff', add: true, alpha: 0.4 });
    }
    for (const e of list) hpPill(e.x, e.y - e.r * 1.25 - 10, fmt(Math.ceil(e.hp)), e.r > 24 ? 14 : 12);
  }

  function drawBoss() {
    const b = S.boss;
    if (!b) return;
    if (b.kind === 'demon' || b.kind === 'overlord') MD.spr('fire_02', b.x, b.y, { scale: b.size * 0.011, tint: '#ff5a2a', add: true, alpha: 0.35 + Math.sin(S.realT * 9) * 0.1 });
    if (b.enraged) MD.spr('light_01', b.x, b.y, { scale: b.size * 0.02, tint: '#ff2040', add: true, alpha: 0.4 });
    const dx = S.px - b.x, dy = SQUAD_Y - b.y, d = Math.hypot(dx, dy) || 1;
    const shakeX = b.enraged ? rand(-1.5, 1.5) : 0;
    MD.drawMonster(b.recipe, b.color, b.x + shakeX, b.y, b.size, b.t * 0.7, { flash: b.flash * 0.6, squash: Math.sin(b.squash * Math.PI) * 0.15, lookX: dx / d, lookY: dy / d, armUp: b.squash * 0.8, walkSpeed: 5 });
  }

  function drawShots() {
    for (const s of S.shots) {
      MD.spr('light_01', s.x, s.y, { scale: 0.5, tint: '#ff7a2a', add: true });
      MD.spr('flare_01', s.x, s.y, { scale: 0.25, tint: '#fff2c0', add: true });
      ctx.fillStyle = '#ffe9a8'; circle(s.x, s.y, s.r * 0.55); ctx.fill();
    }
  }

  function drawHazards() {
    for (const z of S.hazards) {
      if (!z.done) {
        const p = z.t / z.dur;
        const a = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(z.t * (10 + p * 25)));
        ctx.fillStyle = `rgba(255,50,60,${a})`;
        ctx.fillRect(z.x - z.w / 2, 90, z.w, H - 90);
        ctx.strokeStyle = 'rgba(255,80,90,0.9)'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]); ctx.strokeRect(z.x - z.w / 2, 90, z.w, H - 90); ctx.setLineDash([]);
        text('!', z.x, SQUAD_Y - 50, 48, '#fff', { stroke: 6, strokeColor: '#a0101c' });
        if (p > 0.55) {
          const fy = lerp(-60, SQUAD_Y, (p - 0.55) / 0.45);
          for (const ox of [-38, 0, 38]) MD.spr(pick(['deco_237', 'deco_238', 'deco_239']), z.x + ox, fy - Math.abs(ox), { scale: 1.1, rot: S.realT * 4 + ox });
        }
      }
    }
  }

  const FORMATION = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, d = 10.5 * Math.sqrt(i);
    FORMATION.push([Math.cos(a) * d, Math.sin(a) * d * 0.6]);
  }

  function drawSquad() {
    if (S.n <= 0) return;
    const hero = S.st.hero, w = S.st.weapon;
    const count = Math.min(S.n, 40);
    const pts = [];
    for (let i = 1; i < count; i++) pts.push([FORMATION[i][0], FORMATION[i][1] + 10, i]);
    pts.sort((a, b) => a[1] - b[1]);
    for (const [fx2, fy, i] of pts) {
      const x = S.px + fx2, y = SQUAD_Y + fy + Math.sin(S.realT * 14 + i) * 1.3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 9, 4, 0, 0, TAU); ctx.fill();
      if (!MD.drawHero(hero.sprite, w.pose, x, y, 0.62)) { ctx.fillStyle = '#2d8be0'; circle(x, y, 6); ctx.fill(); }
    }
    // 리더
    const ly = SQUAD_Y - 6 + Math.sin(S.realT * 10) * 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(S.px, ly + 14, 14, 5, 0, 0, TAU); ctx.fill();
    MD.spr('light_02', S.px, ly, { scale: 0.5, tint: '#6ff0ff', add: true, alpha: 0.35 });
    if (!MD.drawHero(hero.sprite, w.pose, S.px, ly, 1.0)) { ctx.fillStyle = '#4fc3ff'; circle(S.px, ly, 10); ctx.fill(); }
    if (S.muzzle > 0) MD.spr(pick(['muzzle_01', 'muzzle_02']), S.px + 6, ly - 34, { scale: 0.22, tint: '#ffe58a', add: true, rot: -Math.PI / 2 });
    // 병력 배지
    const label = fmt(S.n);
    ctx.font = `900 22px ${MD.FONT}`;
    const tw = ctx.measureText(label).width + 28;
    const by = SQUAD_Y - squadR() * 0.6 - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(S.px - tw / 2, by - 12, tw, 30, 15); ctx.fill();
    const bg = ctx.createLinearGradient(0, by - 15, 0, by + 15);
    bg.addColorStop(0, '#7fd6ff'); bg.addColorStop(1, '#2f9be6');
    ctx.fillStyle = bg; rr(S.px - tw / 2, by - 15, tw, 30, 15); ctx.fill();
    ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 2; ctx.stroke();
    text(label, S.px, by + 1, 21, '#06233a');
  }

  function drawBullets() {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of S.bullets) {
      ctx.fillStyle = 'rgba(255,200,80,0.35)';
      rr(b.x - 4, b.y - 11, 8, 22, 4); ctx.fill();
      ctx.fillStyle = '#fff6c2';
      rr(b.x - 1.8, b.y - 9, 3.6, 17, 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSkillFx() {
    if (S.buff.laser > 0) {
      const a = Math.min(1, S.buff.laser * 2);
      const w = 30 + Math.sin(S.realT * 40) * 6;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(S.px - w, 0, S.px + w, 0);
      g.addColorStop(0, 'rgba(255,60,200,0)'); g.addColorStop(0.5, `rgba(255,120,230,${0.8 * a})`); g.addColorStop(1, 'rgba(255,60,200,0)');
      ctx.fillStyle = g; ctx.fillRect(S.px - w, 0, w * 2, SQUAD_Y - 30);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`; ctx.fillRect(S.px - 5, 0, 10, SQUAD_Y - 30);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const g of S.grenades) {
      const p = clamp(g.t / g.dur, 0, 1);
      const x = lerp(g.x0, g.x1, p), y = lerp(g.y0, g.y1, p) - Math.sin(p * Math.PI) * 120;
      ctx.fillStyle = '#3b4a2a'; circle(x, y, 9); ctx.fill();
      ctx.fillStyle = '#6b7a4a'; circle(x - 3, y - 3, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,60,0.6)'; ctx.lineWidth = 2;
      circle(g.x1, g.y1, 150 * (0.6 + 0.4 * p)); ctx.stroke();
    }
    if (S.snipe) {
      ctx.strokeStyle = `rgba(255,80,90,${S.snipe.t * 2.5})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(S.px, SQUAD_Y - 30); ctx.lineTo(S.snipe.x, S.snipe.y); ctx.stroke();
    }
    if (S.buff.slow > 0) {
      ctx.fillStyle = `rgba(120,180,255,${Math.min(0.18, S.buff.slow * 0.1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawFx() {
    for (const p of S.parts) {
      const k = p.life / p.max;
      const sc = lerp(p.s1, p.s0, k);
      MD.spr(p.sprite, p.x, p.y, { scale: sc, rot: p.rot, tint: p.color, add: p.add, alpha: clamp(k * 1.6, 0, 1) * p.alpha });
    }
    for (const a of S.ambient) { ctx.fillStyle = a.c; circle(a.x, a.y, a.r); ctx.fill(); }
    for (const t of S.texts) {
      ctx.globalAlpha = clamp(t.t * 1.6, 0, 1);
      const pop = 1 + Math.max(0, t.t - 0.85) * 2.2;
      text(t.text, t.x, t.y, t.size * pop, t.color, { stroke: 6 });
    }
    ctx.globalAlpha = 1;
  }

  function drawCoinFx() {
    const tx = W - 96, ty = 26;
    for (const c of S.coinFx) {
      if (c.t < 0) continue;
      const k = clamp(c.t / c.d, 0, 1), e = k * k;
      MD.drawCoin(lerp(c.sx, tx, e), lerp(c.sy, ty, e) - Math.sin(k * Math.PI) * 40, 7);
    }
  }

  // ===== HUD =====
  function drawHud() {
    const tg = ctx.createLinearGradient(0, 0, 0, 84);
    tg.addColorStop(0, 'rgba(5,8,20,0.85)'); tg.addColorStop(1, 'rgba(5,8,20,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 84);
    MD.ui.iconButton(10, 8, 'pause', () => { S.paused = true; MD.sfx.click(); }, { instant: true });

    text('STAGE ' + S.info.label, W / 2, 18, 17, '#fff', { stroke: 4 });
    const bx = 116, bw = W - 232, by = 34;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(bx, by, bw, 9, 4.5); ctx.fill();
    const prog = S.phase === 'wave' ? S.stageT / S.info.len : 1;
    const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    pg.addColorStop(0, '#4fc3ff'); pg.addColorStop(1, S.phase === 'wave' ? '#7dff8a' : '#ff4d5e');
    ctx.fillStyle = pg; rr(bx, by, Math.max(9, bw * prog), 9, 4.5); ctx.fill();
    ctx.fillStyle = '#ff4d5e'; circle(bx + bw, by + 4.5, 11); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    text('B', bx + bw, by + 5.5, 11, '#fff');

    MD.drawCoin(W - 96, 26, 10);
    text(fmt(S.coins), W - 82, 27, 16, '#ffd34d', { align: 'left', stroke: 4 });

    if (S.boss && (S.phase === 'boss' || S.phase === 'bossdeath')) {
      const b = S.boss;
      ctx.fillStyle = 'rgba(5,8,20,0.6)'; rr(8, 54, W - 16, 42, 10); ctx.fill();
      text(b.name, 18, 67, 14, '#ffb3b3', { align: 'left', stroke: 4 });
      text(fmt(Math.max(0, Math.ceil(b.hp))), W - 18, 67, 13, '#fff', { align: 'right', stroke: 4 });
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(16, 78, W - 32, 12, 6); ctx.fill();
      const hg = ctx.createLinearGradient(16, 0, W - 16, 0);
      hg.addColorStop(0, '#ff4d5e'); hg.addColorStop(1, '#ff9a3c');
      const pct = clamp(b.hp / b.max, 0, 1);
      ctx.fillStyle = hg; rr(16, 78, Math.max(6, (W - 32) * pct), 12, 6); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.25 + b.flash * 0.2})`; rr(18, 79, Math.max(4, (W - 36) * pct), 4, 2); ctx.fill();
      if (b.t <= 30 && S.phase === 'boss') text(`★ ${Math.ceil(30 - b.t)}초`, W / 2, 67, 12, '#ffd34d', { stroke: 3 });
    }

    // 보급 버프
    let cx = 14;
    for (const k of Object.keys(MD.CRATES)) {
      if (!S.wl[k]) continue;
      const label = MD.CRATES[k].label + ' ' + S.wl[k];
      ctx.font = `800 12px ${MD.FONT}`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(cx, H - 28, w, 20, 10); ctx.fill();
      text(label, cx + w / 2, H - 17, 12, MD.CRATES[k].color, { weight: 800 });
      cx += w + 6;
    }

    // 스킬 버튼
    drawSkillButton();

    // 배너
    if (S.banner) {
      const bn = S.banner, age = bn.dur - bn.t;
      let a = clamp(bn.t * 2.5, 0, 1);
      if (bn.blink) a *= 0.55 + 0.45 * Math.sin(age * 14);
      const pop = 1 + Math.max(0, 0.18 - age) * 2.5;
      ctx.globalAlpha = a;
      if (bn.blink) { ctx.fillStyle = 'rgba(255,30,50,0.2)'; ctx.fillRect(0, H * 0.33 - 52, W, 104); }
      text(bn.text, W / 2, H * 0.36, 42 * pop, bn.color, { stroke: 8 });
      if (bn.sub) text(bn.sub, W / 2, H * 0.36 + 42, 17, '#fff', { stroke: 5, weight: 800 });
      ctx.globalAlpha = 1;
    }

    drawHints();

    if (S.hurt > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(255,0,30,0)'); vg.addColorStop(1, `rgba(255,0,30,${S.hurt * 0.45})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (S.white > 0) { ctx.fillStyle = `rgba(255,255,255,${S.white * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawSkillButton() {
    const x = W - 50, y = H - 62, r = 34;
    const hero = S.st.hero, ready = S.skill.ready;
    MD.ui.hit(x - r - 6, y - r - 6, r * 2 + 12, r * 2 + 12, () => B.useSkill(), { instant: true });
    if (ready) MD.spr('light_01', x, y, { scale: 1.1 + Math.sin(S.realT * 6) * 0.1, tint: '#ffd34d', add: true, alpha: 0.6 });
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; circle(x, y + 3, r); ctx.fill();
    ctx.fillStyle = ready ? '#ffcf3f' : '#2a3556'; circle(x, y, r); ctx.fill();
    ctx.fillStyle = ready ? '#fff2b0' : '#3a4770'; circle(x, y, r - 6); ctx.fill();
    ctx.save(); circle(x, y, r - 6); ctx.clip();
    MD.spr(`${hero.sprite}_stand`, x, y + 2, { scale: 1.1, rot: -Math.PI / 2 });
    ctx.restore();
    ctx.strokeStyle = ready ? '#fff' : '#6ff0ff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * S.skill.charge / 100); ctx.stroke();
    text(hero.skillName, x, y + r + 12, 12, ready ? '#ffd34d' : '#cbd5f5', { stroke: 4 });
    if (ready && !MD.save.tut.skill) bubble(x - 80, y - 52, '스킬 준비 완료! 눌러보세요');
  }

  function bubble(x, y, str) {
    const w = MD.textW(str, 14, 800) + 24;
    const bx = clamp(x - w / 2, 8, W - w - 8);
    const bob = Math.sin(S.realT * 5) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(bx, y - 16 + bob + 3, w, 32, 12); ctx.fill();
    ctx.fillStyle = '#fff'; rr(bx, y - 16 + bob, w, 32, 12); ctx.fill();
    text(str, bx + w / 2, y + bob + 1, 14, '#1b2440', { weight: 800 });
  }

  function drawHints() {
    if (S.phase === 'result' || S.paused) return;
    const tut = MD.save.tut;
    if (!tut.move && S.t < 4.5) {
      const hx = W / 2 + Math.sin(S.realT * 3) * 90;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff'; circle(hx, SQUAD_Y - 120, 16); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(hx, SQUAD_Y - 120, 24 + Math.sin(S.realT * 8) * 3); ctx.fill();
      ctx.globalAlpha = 1;
      bubble(W / 2, SQUAD_Y - 170, '좌우로 드래그해서 이동!');
    }
    if (!tut.gate) {
      const g = S.gates.find(g => !g.used && g.y > 280);
      if (g) {
        const best = (() => { const v = o => applyOp(S.n, o); return v(g.sides[0]) >= v(g.sides[1]) ? 0 : 1; })();
        const x = best === 0 ? W / 4 : W * 3 / 4;
        bubble(x, g.y - 62, '이쪽 게이트로!');
      }
    }
    if (!tut.crate) {
      const c = S.crates.find(c => c.y > 120);
      if (c) bubble(c.x, c.y - 62, '상자를 쏴서 부수면 강화!');
    }
  }

  // ===== 보스 등장 연출 =====
  function drawCine() {
    const p = S.phaseT;
    const bar = 70 * MD.easeOutCubic(clamp(p / 0.4, 0, 1)) * (p > 2.5 ? clamp((2.8 - p) / 0.3, 0, 1) : 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    if (p > 1.3) {
      const k = MD.easeOutBack(clamp((p - 1.3) / 0.4, 0, 1));
      const x = lerp(-W, 0, k);
      ctx.save(); ctx.translate(x, 0);
      ctx.fillStyle = 'rgba(160,20,40,0.85)';
      ctx.beginPath(); ctx.moveTo(0, H * 0.58); ctx.lineTo(W, H * 0.55); ctx.lineTo(W, H * 0.66); ctx.lineTo(0, H * 0.69); ctx.closePath(); ctx.fill();
      text(S.info.isWorldBoss ? 'WORLD BOSS' : 'BOSS', W / 2, H * 0.585, 14, '#ffd34d', { stroke: 4 });
      text(S.boss.name, W / 2, H * 0.62, 34, '#fff', { stroke: 7, strokeColor: '#4a0010' });
      text(S.boss.title, W / 2, H * 0.655, 14, '#ffb3b3', { stroke: 4, weight: 800 });
      ctx.restore();
    }
  }

  // ===== 결과 =====
  function drawResult() {
    const r = S.result, t = r.t;
    ctx.fillStyle = `rgba(4,7,20,${Math.min(0.75, t * 2)})`;
    ctx.fillRect(0, 0, W, H);
    const k = MD.easeOutBack(clamp(t / 0.45, 0, 1));
    const py = 150 + (1 - k) * 60;
    ctx.globalAlpha = clamp(t * 3, 0, 1);
    MD.ui.panel(30, py, W - 60, 470);
    if (r.win) {
      MD.spr('light_03', W / 2, py + 10, { scale: 1.6 + Math.sin(S.realT * 2) * 0.05, rot: S.realT * 0.5, tint: '#ffd34d', add: true, alpha: 0.35 });
      text('STAGE CLEAR!', W / 2, py + 48, 36, '#7dff8a', { stroke: 7, strokeColor: '#0b3b1b' });
    } else {
      text('방어 실패...', W / 2, py + 48, 34, '#ff6a6a', { stroke: 7, strokeColor: '#3b0b10' });
    }
    text(`STAGE ${S.info.label}  ·  ${S.info.worldData.name}`, W / 2, py + 86, 14, '#9fb3e6', { weight: 800 });
    // 별
    for (let i = 0; i < 3; i++) {
      const appear = 0.5 + i * 0.35;
      const on = r.win && i < r.stars;
      const sx = W / 2 + (i - 1) * 76, sy = py + 140 + (i === 1 ? -12 : 0);
      MD.spr('star_empty', sx, sy, { scale: 1.25 });
      if (on && t > appear) {
        const sk = MD.easeOutBack(clamp((t - appear) / 0.3, 0, 1));
        MD.spr('star', sx, sy, { scale: 1.25 * sk });
        if (!r['s' + i]) { r['s' + i] = true; MD.sfx.star(i); burst(sx, sy, '#ffd34d', 12, 200); }
      }
    }
    // 조건
    const labels = ['스테이지 클리어', '방어선 돌파 3회 이하', '보스 30초 안에 처치'];
    labels.forEach((l, i) => {
      const ok = r.checks[i];
      const y = py + 200 + i * 28;
      MD.ui.check(64, y, ok);
      text(l, 86, y + 1, 15, ok ? '#fff' : '#7f8bb0', { align: 'left', weight: 800 });
    });
    // 보상
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(56, py + 288, W - 112, 54, 14); ctx.fill();
    MD.drawCoin(W / 2 - 70, py + 315, 14);
    text('+' + fmt(r.shownCoins), W / 2 - 48, py + 316, 26, '#ffd34d', { align: 'left', stroke: 5 });
    if (r.first) text('첫 클리어 보너스 ×2', W / 2, py + 356, 13, '#7dff8a', { weight: 800 });
    ctx.globalAlpha = 1;
    if (t > 1.2) {
      const hasNext = r.win && S.idx + 1 < MD.STAGE_COUNT;
      if (hasNext) {
        MD.ui.button(W / 2 - 130, py + 372, 260, 56, '다음 스테이지 ▶', () => B.onExit('next'), { size: 22 });
      } else {
        MD.ui.button(W / 2 - 130, py + 372, 260, 56, r.win ? '맵으로' : '다시 도전', () => B.onExit(r.win ? 'map' : 'retry'), { size: 22 });
      }
      MD.ui.button(W / 2 - 130, py + 438, 124, 46, hasNext || !r.win ? (r.win ? '다시' : '강화') : '다시', () => B.onExit(r.win ? 'retry' : 'upgrade'), { size: 17, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
      MD.ui.button(W / 2 + 6, py + 438, 124, 46, '맵', () => B.onExit('map'), { size: 17, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
    }
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(4,7,20,0.72)'; ctx.fillRect(0, 0, W, H);
    MD.ui.panel(50, 220, W - 100, 300);
    text('일시정지', W / 2, 266, 32, '#fff');
    MD.ui.button(W / 2 - 110, 304, 220, 54, '계속하기', () => { S.paused = false; }, { size: 21 });
    MD.ui.button(W / 2 - 110, 372, 220, 50, '다시 시작', () => B.onExit('retry'), { size: 18, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
    MD.ui.button(W / 2 - 110, 436, 220, 50, '맵으로 나가기', () => B.onExit('map'), { size: 18, color: '#8fa2d6', dark: '#4b5a85', textColor: '#0b1026' });
    MD.ui.soundToggles(W / 2, 200);
  }

  B.draw = () => {
    if (!S) return;
    ctx.save();
    if (S.shake > 0) ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);
    drawBg();
    drawSideDeco();
    drawHazards();
    drawGates();
    drawCrates();
    drawEnemies();
    drawBoss();
    drawShots();
    drawBullets();
    drawSkillFx();
    drawSquad();
    drawFx();
    ctx.restore();
    drawCoinFx();
    if (S.phase === 'cine') drawCine();
    else if (S.phase !== 'result') drawHud();
    if (S.phase === 'result') drawResult();
    else if (S.paused) drawPause();
  };

  // ===== 입력 =====
  B.keys = { left: false, right: false };
  B.setTarget = x => { if (S && !S.paused && S.phase !== 'result') S.tx = x; };
  B.getTarget = () => (S ? S.tx : W / 2);
  B.pause = () => { if (S && S.phase !== 'result') S.paused = true; };
  B.isPaused = () => !!(S && S.paused);
  B.inResult = () => !!(S && S.phase === 'result');
  B.onExit = () => {};
})();
