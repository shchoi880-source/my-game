'use strict';
(() => {
  // ===== 기본 설정 =====
  const W = 420, H = 760;          // 논리 해상도 (세로 화면)
  const PLAYER_Y = 660;            // 분대 위치
  const DEFENSE_Y = 628;           // 방어선: 적이 여기 닿으면 병력 감소
  const GATE_H = 54;
  const GATE_SPEED = 100;
  const WAVE_LEN = 20;             // 웨이브 길이(초)
  const MAX_N = 999999;
  const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';

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

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  let best = 0;
  try { best = Number(localStorage.getItem('mdef-best')) || 0; } catch (e) { /* 저장 불가 환경 */ }
  function saveBest() { try { localStorage.setItem('mdef-best', String(best)); } catch (e) { /* 무시 */ } }

  // ===== 게임 상태 =====
  let S;
  function newGame() {
    S = {
      mode: 'play', t: 0, n: 5,
      px: W / 2, tx: W / 2,
      bullets: [], enemies: [], gates: [], parts: [], texts: [],
      fireT: 0, spawnT: 3.0, gateT: 0.5,
      wave: 1, waveT: 0,
      score: 0, shake: 0, scroll: 0, gateId: 0, overT: 0,
      banner: { text: 'WAVE 1', t: 1.6 },
    };
  }
  newGame();
  S.mode = 'title';

  // ===== 게이트 =====
  const isGood = o => o.op === '+' || o.op === '×';
  const opText = o => o.op + fmt(o.v);

  function goodOp() {
    const w = S.wave, r = Math.random();
    if (r < 0.5) return { op: '+', v: randi(3 + w * 2, 8 + w * 5), pulse: 0 };
    if (r < 0.9) return { op: '×', v: pick([2, 2, 2, 3]), pulse: 0 };
    if (r < 0.98) return { op: '×', v: 5, pulse: 0 };
    return { op: '×', v: 10, pulse: 0 };
  }
  function minusOp() { const w = S.wave; return { op: '−', v: randi(2 + w, 5 + w * 3), pulse: 0 }; }
  function badOp() { return Math.random() < 0.6 ? minusOp() : { op: '÷', v: pick([2, 2, 3]), pulse: 0 }; }

  function spawnGate() {
    let a, b;
    const r = Math.random();
    if (r < 0.55) { a = goodOp(); b = badOp(); }
    else if (r < 0.9) { a = goodOp(); b = goodOp(); }
    else { a = minusOp(); b = minusOp(); } // 둘 다 마이너스: 총으로 쏴서 플러스로 바꿔야 함
    if (Math.random() < 0.5) [a, b] = [b, a];
    S.gates.push({ id: ++S.gateId, y: -GATE_H, sides: [a, b], used: false, chosen: -1, fade: 1 });
  }

  // 총알이 게이트에 맞으면 숫자가 커짐 (마이너스는 줄어들다가 플러스로 바뀜)
  function bumpGate(g, side) {
    const o = g.sides[side];
    if (o.op === '+') o.v += 1;
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

  // ===== 적 =====
  const baseHp = () => 4 * Math.pow(2.2, S.wave - 1);

  function spawnEnemy(boss) {
    const hp = boss
      ? Math.round(baseHp() * 30 + S.n * 4)
      : Math.max(1, Math.round(baseHp() * rand(0.6, 1.4) + S.n * rand(0.08, 0.25)));
    const r = boss ? 46 : 14 + Math.min(22, Math.log10(hp) * 6);
    S.enemies.push({
      x: boss ? W / 2 : rand(r + 8, W - r - 8), y: -r, r, hp, max: hp,
      sp: boss ? 22 : rand(38, 52) + Math.min(40, S.wave * 2.5),
      boss, flash: 0, wob: rand(0, 6.28), hue: boss ? 0 : randi(260, 330),
    });
  }

  function hitEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 1;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      S.score += e.max;
      burst(e.x, e.y, e.boss ? '#ffd34d' : `hsl(${e.hue},80%,65%)`, e.boss ? 40 : 12);
      if (e.boss) { S.shake = 14; addText(e.x, e.y, 'BOSS 격파!', '#ffd34d', 30); }
    }
  }

  // ===== 분대 =====
  const squadWidth = () => Math.min(150, 18 + Math.sqrt(Math.min(S.n, 48)) * 16);

  function fire() {
    const k = Math.min(S.n, 10);
    if (k <= 0) return;
    const dmg = S.n * 0.5 / k;
    const spread = squadWidth() * 0.8;
    for (let i = 0; i < k; i++) {
      const off = k === 1 ? 0 : (i / (k - 1) - 0.5) * spread;
      S.bullets.push({ x: S.px + off, y: PLAYER_Y - 24, dmg, gate: 0 });
    }
  }

  // ===== 이펙트 =====
  function burst(x, y, color, n) {
    for (let i = 0; i < n && S.parts.length < 500; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 260);
      S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
    }
  }
  function addText(x, y, text, color, size) {
    S.texts.push({ x, y, text, color, size, t: 1 });
  }

  function gameOver() {
    S.n = 0;
    S.mode = 'over';
    S.overT = 0;
    S.shake = 16;
    burst(S.px, PLAYER_Y, '#4fc3ff', 40);
    if (S.score > best) { best = S.score; S.newBest = true; saveBest(); }
  }

  // ===== 업데이트 =====
  function updateFx(dt) {
    for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0);
    for (const t of S.texts) { t.y -= 40 * dt; t.t -= dt * 0.9; }
    S.texts = S.texts.filter(t => t.t > 0);
    for (const g of S.gates) for (const o of g.sides) o.pulse = Math.max(0, o.pulse - dt * 6);
    S.shake = Math.max(0, S.shake - dt * 40);
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
  }

  function update(dt) {
    updateFx(dt);
    if (S.mode === 'over') { S.overT += dt; return; }
    if (S.mode !== 'play') { S.scroll += dt * 40; return; }

    S.t += dt;
    S.scroll += dt * 90;

    // 이동
    if (keys.left) S.tx -= 460 * dt;
    if (keys.right) S.tx += 460 * dt;
    const hw = squadWidth() / 2;
    S.tx = clamp(S.tx, hw, W - hw);
    S.px += (S.tx - S.px) * Math.min(1, dt * 14);

    // 웨이브
    S.waveT += dt;
    if (S.waveT >= WAVE_LEN) {
      S.waveT = 0;
      S.wave++;
      const boss = S.wave % 5 === 0;
      S.banner = { text: boss ? `WAVE ${S.wave} · BOSS!` : `WAVE ${S.wave}`, t: 1.8 };
      if (boss) spawnEnemy(true);
    }

    // 스폰
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      const bossOn = S.enemies.some(e => e.boss);
      const iv = Math.max(0.45, 1.25 - S.wave * 0.06);
      S.spawnT = bossOn ? iv * 2.2 : iv;
      spawnEnemy(false);
      if (S.wave >= 6 && Math.random() < 0.25) spawnEnemy(false);
    }
    S.gateT -= dt;
    if (S.gateT <= 0) { S.gateT = rand(4, 5.5); spawnGate(); }

    // 발사
    S.fireT -= dt;
    if (S.fireT <= 0) { S.fireT = 0.22; fire(); }

    // 총알
    for (const b of S.bullets) {
      b.y -= 720 * dt;
      for (const e of S.enemies) {
        if (e.dead) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.r + 4) * (e.r + 4)) { hitEnemy(e, b.dmg); b.dead = true; break; }
      }
      if (b.dead) continue;
      for (const g of S.gates) {
        if (g.used || b.gate === g.id) continue;
        if (Math.abs(b.y - g.y) < GATE_H / 2) { b.gate = g.id; bumpGate(g, b.x < W / 2 ? 0 : 1); }
      }
      if (b.y < -20) b.dead = true;
    }
    S.bullets = S.bullets.filter(b => !b.dead);

    // 적 이동 / 방어선 돌파
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.y += e.sp * dt;
      e.wob += dt * 6;
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.y + e.r >= DEFENSE_Y) {
        const loss = Math.ceil(e.hp);
        S.n -= loss;
        e.dead = true;
        S.shake = e.boss ? 18 : 8;
        addText(S.px, PLAYER_Y - 70, '−' + fmt(loss), '#ff5a5a', 28);
        burst(e.x, DEFENSE_Y, '#ff5a5a', 14);
        if (S.n <= 0) { gameOver(); return; }
      }
    }
    S.enemies = S.enemies.filter(e => !e.dead);

    // 게이트 이동 / 통과
    for (const g of S.gates) {
      g.y += GATE_SPEED * dt;
      if (!g.used && g.y >= PLAYER_Y - 6) {
        g.used = true;
        const side = S.px < W / 2 ? 0 : 1;
        g.chosen = side;
        const o = g.sides[side];
        S.n = clamp(applyOp(S.n, o), 0, MAX_N);
        addText(S.px, PLAYER_Y - 80, opText(o), isGood(o) ? '#7dff8a' : '#ff6a6a', 36);
        burst(S.px, PLAYER_Y - 20, isGood(o) ? '#7dff8a' : '#ff6a6a', 16);
        if (S.n <= 0) { gameOver(); return; }
      } else if (g.used) {
        g.fade -= dt * 3;
      }
    }
    S.gates = S.gates.filter(g => g.fade > 0);
  }

  // ===== 그리기 =====
  function drawBg() {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0b1026');
    grd.addColorStop(1, '#151d3f');
    ctx.fillStyle = grd;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    // 도로 줄무늬
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    const step = 48, off = S.scroll % step;
    for (let y = -step + off; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -S.scroll;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);

    // 방어선
    ctx.strokeStyle = 'rgba(255,80,90,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = S.t * 20;
    ctx.beginPath(); ctx.moveTo(0, DEFENSE_Y); ctx.lineTo(W, DEFENSE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,80,90,0.08)';
    ctx.fillRect(0, DEFENSE_Y, W, H - DEFENSE_Y);
  }

  function drawGates() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of S.gates) {
      for (let s = 0; s < 2; s++) {
        const o = g.sides[s];
        ctx.globalAlpha = g.used ? Math.max(0, g.fade) * (g.chosen === s ? 1 : 0.4) : 1;
        const x0 = s === 0 ? 6 : W / 2 + 3, w = W / 2 - 9;
        const good = isGood(o);
        ctx.fillStyle = good ? 'rgba(40,200,120,0.25)' : 'rgba(230,60,70,0.25)';
        roundRect(x0, g.y - GATE_H / 2, w, GATE_H, 12);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = good ? '#3dff9a' : '#ff4d5e';
        ctx.stroke();
        const sz = 30 * (1 + o.pulse * 0.18);
        ctx.font = `900 ${sz}px ${FONT}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(opText(o), x0 + w / 2, g.y + 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of S.enemies) {
      const sq = Math.sin(e.wob) * 0.06;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1 + sq, 1 - sq);
      const body = e.boss ? '#e0384b' : `hsl(${e.hue},65%,55%)`;
      ctx.fillStyle = e.flash > 0.5 ? '#ffffff' : body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      if (e.boss) {
        // 뿔
        ctx.fillStyle = '#ffd34d';
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * e.r * 0.45, -e.r * 0.8);
          ctx.lineTo(sx * e.r * 0.8, -e.r * 1.35);
          ctx.lineTo(sx * e.r * 0.85, -e.r * 0.55);
          ctx.fill();
        }
      }
      // 눈
      const ey = -e.r * 0.25, ex = e.r * 0.35, er = Math.max(3, e.r * 0.18);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-ex, ey, er, 0, Math.PI * 2); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-ex, ey + er * 0.3, er * 0.5, 0, Math.PI * 2); ctx.arc(ex, ey + er * 0.3, er * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 체력 숫자
      ctx.font = `900 ${e.boss ? 22 : Math.max(13, e.r * 0.7)}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const label = fmt(Math.ceil(e.hp));
      const ly = e.y + e.r * 0.4;
      ctx.strokeText(label, e.x, ly);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, e.x, ly);

      if (e.boss) {
        const bw = 120;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 30, bw, 8);
        ctx.fillStyle = '#ff4d5e';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 30, bw * clamp(e.hp / e.max, 0, 1), 8);
      }
    }
  }

  function drawBullets() {
    ctx.fillStyle = '#ffe680';
    for (const b of S.bullets) {
      ctx.fillRect(b.x - 2, b.y - 7, 4, 12);
    }
  }

  function drawSquad() {
    if (S.n <= 0) return;
    const count = Math.min(S.n, 40);
    const perRow = Math.min(count, 8);
    const rows = Math.ceil(count / perRow);
    const gap = 15;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, count - i);
      for (let c = 0; c < inRow; c++, i++) {
        const x = S.px + (c - (inRow - 1) / 2) * gap;
        const y = PLAYER_Y + r * 13;
        // 총
        ctx.fillStyle = '#2a3556';
        ctx.fillRect(x - 1.5, y - 14, 3, 9);
        // 몸
        ctx.fillStyle = '#4fc3ff';
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#1a6fa8';
        ctx.stroke();
      }
    }
    // 병력 숫자
    const label = fmt(S.n);
    ctx.font = `900 22px ${FONT}`;
    const tw = ctx.measureText(label).width + 22;
    const by = PLAYER_Y - 44;
    ctx.fillStyle = '#4fc3ff';
    roundRect(S.px - tw / 2, by - 15, tw, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#06233a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, S.px, by + 1);
  }

  function drawFx() {
    for (const p of S.parts) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of S.texts) {
      ctx.globalAlpha = clamp(t.t * 1.5, 0, 1);
      ctx.font = `900 ${t.size}px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, 54);
    ctx.textBaseline = 'middle';
    ctx.font = `800 16px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('점수 ' + fmt(S.score), 14, 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('최고 ' + fmt(best), W - 14, 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `900 18px ${FONT}`;
    ctx.fillText('WAVE ' + S.wave, W / 2, 20);
    // 웨이브 진행바
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(14, 40, W - 28, 5);
    ctx.fillStyle = (S.wave + 1) % 5 === 0 ? '#ff4d5e' : '#4fc3ff';
    ctx.fillRect(14, 40, (W - 28) * clamp(S.waveT / WAVE_LEN, 0, 1), 5);

    if (S.banner && S.mode === 'play') {
      const a = clamp(S.banner.t * 2, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `900 40px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(S.banner.text, W / 2, H * 0.38);
      ctx.fillStyle = S.banner.text.includes('BOSS') ? '#ff4d5e' : '#fff';
      ctx.fillText(S.banner.text, W / 2, H * 0.38);
      ctx.globalAlpha = 1;
    }
  }

  function overlay() {
    ctx.fillStyle = 'rgba(4,7,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  function drawTitle() {
    overlay();
    ctx.font = `900 52px ${FONT}`;
    ctx.fillStyle = '#4fc3ff';
    ctx.fillText('곱셈 디펜스', W / 2, 210);
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#7dff8a';
    ctx.fillText('×2   +10   ×5', W / 2, 270);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = '#dfe6ff';
    const lines = [
      '좌우로 움직이면 자동으로 총을 쏴요',
      '초록 게이트를 통과해 병력을 늘리고',
      '빨간 게이트는 피하세요',
      '게이트를 쏘면 숫자가 커져요!',
      '적이 빨간 방어선에 닿으면 병력이 줄어요',
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 340 + i * 30));
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = '#9aa6d6';
    ctx.fillText('PC: 마우스 / ← → 키   ·   폰: 드래그', W / 2, 510);
    const blink = 0.55 + Math.sin(performance.now() / 300) * 0.45;
    ctx.globalAlpha = blink;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('탭해서 시작', W / 2, 590);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.font = `800 16px ${FONT}`;
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('최고 점수 ' + fmt(best), W / 2, 640);
    }
  }

  function drawOver() {
    overlay();
    ctx.font = `900 50px ${FONT}`;
    ctx.fillStyle = '#ff4d5e';
    ctx.fillText('GAME OVER', W / 2, 230);
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('WAVE ' + S.wave + ' 도달', W / 2, 310);
    ctx.fillText('점수 ' + fmt(S.score), W / 2, 350);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(S.newBest ? '★ 최고 기록! ★' : '최고 ' + fmt(best), W / 2, 395);
    if (S.overT > 0.7) {
      const blink = 0.55 + Math.sin(performance.now() / 300) * 0.45;
      ctx.globalAlpha = blink;
      ctx.font = `900 26px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText('탭해서 다시 시작', W / 2, 500);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.save();
    if (S.shake > 0) ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);
    drawBg();
    drawGates();
    drawEnemies();
    drawBullets();
    drawSquad();
    drawFx();
    ctx.restore();
    drawHud();
    if (S.mode === 'title') drawTitle();
    else if (S.mode === 'over') drawOver();
  }

  // ===== 입력 =====
  const keys = { left: false, right: false };
  let drag = null; // 터치: 상대 드래그

  function toGameX(e) {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width * W;
  }

  function tryStart() {
    if (S.mode === 'title') { newGame(); return true; }
    if (S.mode === 'over') { if (S.overT > 0.7) newGame(); return true; }
    return false;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (tryStart()) return;
    if (e.pointerType === 'mouse') S.tx = toGameX(e);
    else drag = { id: e.pointerId, x: toGameX(e), tx: S.tx };
  });
  window.addEventListener('pointermove', e => {
    if (S.mode !== 'play') return;
    if (e.pointerType === 'mouse') S.tx = toGameX(e);
    else if (drag && drag.id === e.pointerId) S.tx = drag.tx + (toGameX(e) - drag.x) * 1.3;
  });
  const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === ' ' || e.key === 'Enter') { tryStart(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  // ===== 메인 루프 =====
  let last = performance.now();
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt > 0) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 디버그/테스트용
  window.__game = { get state() { return S; } };
})();
