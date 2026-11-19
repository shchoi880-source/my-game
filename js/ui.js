'use strict';
// UI: 즉시모드 버튼, 패널, 메인 메뉴(맵/영웅/무기/강화/미션), 팝업
(() => {
  const MD = window.MD;
  const { W, H, TAU } = MD;
  const ctx = MD.ctx;
  const { clamp, lerp, fmt, rr, circle, text, rand } = MD;

  // ===================================================================
  //  즉시모드 UI 기본 요소
  // ===================================================================
  const ui = {
    buttons: [], modalStart: 0, clip: null,
    begin() { this.buttons = []; this.modalStart = 0; this.clip = null; },
    modal() { this.modalStart = this.buttons.length; },
    hit(x, y, w, h, onClick, o) {
      this.buttons.push({ x, y, w, h, onClick, instant: !!(o && o.instant), clip: this.clip });
    },
    find(px, py, instant) {
      for (let i = this.buttons.length - 1; i >= this.modalStart; i--) {
        const b = this.buttons[i];
        if (!b.onClick || !!b.instant !== !!instant) continue;
        if (b.clip && (py < b.clip[0] || py > b.clip[1])) continue;
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
      }
      return null;
    },
    blocks(px, py) {
      // 모달이 열려 있으면 그 아래는 막힘
      return this.modalStart > 0;
    },
  };
  MD.ui = ui;

  ui.button = (x, y, w, h, label, onClick, o) => {
    o = o || {};
    const disabled = !!o.disabled;
    ui.hit(x, y, w, h, disabled ? null : onClick, o);
    const r = o.r || 14;
    const c1 = disabled ? '#4a5270' : (o.color || '#ffcf3f');
    const c2 = disabled ? '#2e344a' : (o.dark || '#c98a00');
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x, y + 6, w, h, r); ctx.fill();
    ctx.fillStyle = c2; rr(x, y + 4, w, h, r); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, lighten(c1)); g.addColorStop(1, c1);
    ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; rr(x + 5, y + 3, w - 10, h * 0.36, r - 5); ctx.fill();
    if (o.icon === 'coin') {
      const tw = MD.textW(label, o.size || 20);
      MD.drawCoin(x + w / 2 - tw / 2 - 8, y + h / 2 + 1, (o.size || 20) * 0.45);
      text(label, x + w / 2 + 10, y + h / 2 + 2, o.size || 20, disabled ? '#9aa3c0' : (o.textColor || '#3a2400'));
    } else {
      text(label, x + w / 2, y + h / 2 + 2, o.size || 20, disabled ? '#9aa3c0' : (o.textColor || '#3a2400'));
    }
    if (o.badge) { ctx.fillStyle = '#ff3b4e'; circle(x + w - 4, y + 4, 8); ctx.fill(); }
  };
  function lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + 40), g = Math.min(255, ((n >> 8) & 255) + 40), b = Math.min(255, (n & 255) + 40);
    return `rgb(${r},${g},${b})`;
  }

  ui.panel = (x, y, w, h, o) => {
    o = o || {};
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(x, y + 6, w, h, 20); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, o.top || '#2a3a70'); g.addColorStop(1, o.bottom || '#161f42');
    ctx.fillStyle = g; rr(x, y, w, h, 20); ctx.fill();
    ctx.strokeStyle = o.edge || 'rgba(140,180,255,0.45)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; rr(x + 6, y + 6, w - 12, 30, 14); ctx.fill();
  };

  ui.check = (x, y, ok) => {
    ctx.fillStyle = ok ? '#38c172' : 'rgba(255,255,255,0.12)';
    rr(x - 11, y - 11, 22, 22, 6); ctx.fill();
    if (ok) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 1, y + 5); ctx.lineTo(x + 7, y - 5); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  };

  const ICONS = {
    pause(x, y) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y - 8, 4, 16); ctx.fillRect(x + 2, y - 8, 4, 16); },
    gear(x, y) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(x, y); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-3, -11, 6, 6); ctx.restore(); }
      circle(x, y, 8); ctx.fill();
      ctx.fillStyle = '#2a3556'; circle(x, y, 3.5); ctx.fill();
    },
    sfx(x, y, off) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y - 9); ctx.lineTo(x + 2, y + 9); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x - 9, y + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = off ? '#ff4d5e' : '#fff'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (off) { ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 11, y + 5); ctx.moveTo(x + 11, y - 5); ctx.lineTo(x + 5, y + 5); }
      else { ctx.arc(x + 3, y, 6, -0.9, 0.9); ctx.moveTo(x + 7, y - 8); ctx.arc(x + 3, y, 10, -0.9, 0.9); }
      ctx.stroke();
    },
    music(x, y, off) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      circle(x - 5, y + 6, 4); ctx.fill(); circle(x + 6, y + 4, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 2, y + 6); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x + 9, y - 10); ctx.lineTo(x + 9, y + 4); ctx.stroke();
      if (off) { ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 11, y - 11); ctx.lineTo(x + 11, y + 11); ctx.stroke(); }
    },
    close(x, y) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke(); ctx.lineCap = 'butt'; },
  };
  ui.iconButton = (x, y, icon, onClick, o) => {
    o = o || {};
    ui.hit(x - 4, y - 4, 44, 44, onClick, o);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x, y + 3, 36, 36, 10); ctx.fill();
    ctx.fillStyle = o.bg || 'rgba(60,80,140,0.85)'; rr(x, y, 36, 36, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ICONS[icon](x + 18, y + 18, o.off);
  };
  ui.soundToggles = (cx, y) => {
    ui.iconButton(cx - 44, y - 18, 'sfx', () => { MD.save.sfx = !MD.save.sfx; MD.persist(); MD.sfx.click(); }, { off: !MD.save.sfx });
    ui.iconButton(cx + 8, y - 18, 'music', () => { MD.save.music = !MD.save.music; MD.persist(); MD.sfx.click(); }, { off: !MD.save.music });
  };

  // ===================================================================
  //  메뉴
  // ===================================================================
  const M = {
    tab: 'map', scroll: { map: 0, heroes: 0, weapons: 0, upgrades: 0, missions: 0 },
    popup: null, viewHero: null, viewWeapon: null, parts: [], t: 0, toast: null,
    worldBg: [], contentH: { map: 0, missions: 0 },
  };
  MD.menu = M;
  const TOP = 66, BOTTOM = H - 80;

  M.enter = tab => {
    if (tab) M.tab = tab;
    M.popup = null;
    MD.sfx.music('menu');
    MD.refreshMissions();
    if (MD.dailyAvailable()) M.popup = { kind: 'daily', t: 0 };
    M.viewHero = MD.save.hero;
    M.viewWeapon = MD.save.weapon;
    if (M.tab === 'map') scrollToCurrent();
  };

  function scrollToCurrent() {
    const p = nodePos(MD.save.unlocked);
    M.scroll.map = clamp(p.y - (BOTTOM - TOP) / 2, 0, Math.max(0, M.contentH.map - (BOTTOM - TOP)));
  }

  function toast(msg, color) { M.toast = { msg, color: color || '#fff', t: 1.8 }; }
  function spend(cost) {
    if (MD.save.coins < cost) { MD.sfx.error(); toast('코인이 부족해요', '#ff8a8a'); return false; }
    MD.save.coins -= cost;
    return true;
  }
  function coinBurst(x, y, n) {
    for (let i = 0; i < n; i++) M.parts.push({ x, y, vx: rand(-200, 200), vy: rand(-380, -120), life: rand(0.6, 1.1), coin: true });
  }

  // ----- 맵 배치 -----
  const WORLD_H = 560;
  const NODE_X = [120, 300, 150, 290, 210];
  function nodePos(i) {
    const w = Math.floor(i / 5), s = i % 5;
    return { x: NODE_X[s], y: w * WORLD_H + 140 + s * 84 + (s === 4 ? 10 : 0) };
  }
  M.contentH.map = MD.WORLDS.length * WORLD_H + 40;

  function worldBg(w) {
    if (M.worldBg[w] !== undefined) return M.worldBg[w];
    const world = MD.WORLDS[w];
    const c = document.createElement('canvas');
    c.width = W; c.height = WORLD_H;
    const g = c.getContext('2d');
    g.fillStyle = world.ground; g.fillRect(0, 0, W, WORLD_H);
    for (let y = 0; y < WORLD_H; y += 64) for (let x = 0; x < W; x += 64) {
      const f = MD.frame(MD.pick(world.tiles));
      if (f) g.drawImage(f.img, f.x, f.y, f.w, f.h, x, y, 64, 64);
    }
    for (let i = 0; i < 14; i++) {
      const f = MD.frame(MD.pick(world.deco.concat(world.side)));
      if (!f) continue;
      const s = rand(0.7, 1.2);
      const x = i % 2 ? rand(-20, 50) : rand(W - 80, W - 10);
      g.drawImage(f.img, f.x, f.y, f.w, f.h, x, rand(60, WORLD_H - 60), f.w * s, f.h * s);
    }
    if (world.tint) { g.fillStyle = world.tint; g.fillRect(0, 0, W, WORLD_H); }
    const gr = g.createLinearGradient(0, 0, 0, WORLD_H);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.15, 'rgba(0,0,0,0)'); gr.addColorStop(0.9, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gr; g.fillRect(0, 0, W, WORLD_H);
    M.worldBg[w] = c;
    return c;
  }

  function drawMap() {
    const oy = TOP - M.scroll.map;
    const sv = MD.save;
    for (let w = 0; w < MD.WORLDS.length; w++) {
      const y0 = oy + w * WORLD_H;
      if (y0 > BOTTOM || y0 + WORLD_H < TOP) continue;
      const bg = worldBg(w);
      if (bg) ctx.drawImage(bg, 0, y0);
      const locked = sv.unlocked < w * 5;
      // 월드 배너
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(40, y0 + 22, W - 80, 64, 16); ctx.fill();
      text(`WORLD ${w + 1}`, W / 2, y0 + 40, 13, '#ffd34d', { stroke: 3 });
      text(MD.WORLDS[w].name, W / 2, y0 + 64, 24, '#fff', { stroke: 5 });
      let st = 0; for (let i = 0; i < 5; i++) st += sv.stars[w * 5 + i] || 0;
      MD.spr('star', W - 76, y0 + 54, { scale: 0.45 });
      text(`${st}/15`, W - 60, y0 + 55, 12, '#fff', { align: 'left', stroke: 3 });
      // 경로
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 6; ctx.setLineDash([2, 14]); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let s = 0; s < 5; s++) { const p = nodePos(w * 5 + s); if (s === 0) ctx.moveTo(p.x, p.y + oy); else ctx.lineTo(p.x, p.y + oy); }
      if (w < MD.WORLDS.length - 1) { const p = nodePos(w * 5 + 5); ctx.lineTo(p.x, p.y + oy); }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
      for (let s = 0; s < 5; s++) drawNode(w * 5 + s, oy);
      if (locked) {
        ctx.fillStyle = 'rgba(5,8,20,0.55)'; ctx.fillRect(0, y0 + 96, W, WORLD_H - 96);
        lockIcon(W / 2, y0 + WORLD_H / 2, 1.6);
        text(`${w}-5 클리어 시 열려요`, W / 2, y0 + WORLD_H / 2 + 46, 15, '#fff', { stroke: 4 });
      }
    }
  }

  function lockIcon(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = '#cfd6ea'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, -5, 7, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#cfd6ea'; rr(-10, -5, 20, 16, 4); ctx.fill();
    ctx.fillStyle = '#4a5270'; circle(0, 2, 2.5); ctx.fill();
    ctx.restore();
  }

  function drawNode(i, oy) {
    const p = nodePos(i), x = p.x, y = p.y + oy;
    if (y < TOP - 60 || y > BOTTOM + 60) return;
    const sv = MD.save, info = MD.stageInfo(i);
    const unlocked = i <= sv.unlocked, stars = sv.stars[i] || 0, current = i === sv.unlocked && !stars;
    const r = info.isWorldBoss ? 38 : 30;
    if (current) MD.spr('light_01', x, y, { scale: 1.2 + Math.sin(M.t * 4) * 0.12, tint: '#ffd34d', add: true, alpha: 0.6 });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; circle(x, y + 5, r); ctx.fill();
    const base = !unlocked ? '#5a6280' : stars ? (stars === 3 ? '#ffb020' : '#3cc06a') : '#3b8cf0';
    ctx.fillStyle = base; circle(x, y, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; circle(x, y - r * 0.25, r * 0.7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; circle(x, y, r); ctx.stroke();
    if (info.isWorldBoss && unlocked) {
      ctx.save(); circle(x, y, r - 3); ctx.clip();
      MD.drawMonster(info.boss.recipe, info.worldData.colors.boss, x, y + 4, r * 1.25, M.t, {});
      ctx.restore();
    } else if (unlocked) {
      text(info.label, x, y + 2, r > 32 ? 18 : 16, '#fff', { stroke: 4 });
    } else lockIcon(x, y, 1);
    if (unlocked) for (let k = 0; k < 3; k++) MD.spr(k < stars ? 'star' : 'star_empty', x + (k - 1) * 20, y + r + 10 - (k === 1 ? 3 : 0), { scale: 0.42 });
    if (current) {
      const bob = Math.sin(M.t * 5) * 4;
      MD.drawHero(MD.heroById(sv.hero).sprite, MD.weaponById(sv.weapon).pose, x + r + 18, y - 8 + bob, 0.8);
    }
    if (unlocked) ui.hit(x - r - 6, y - r - 6, r * 2 + 12, r * 2 + 24, () => { M.popup = { kind: 'stage', idx: i, t: 0 }; MD.sfx.open(); });
  }

  // ----- 영웅 -----
  function statBar(x, y, label, v, max, color) {
    text(label, x, y, 13, '#9fb3e6', { align: 'left', weight: 800 });
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(x + 46, y - 6, 120, 12, 6); ctx.fill();
    ctx.fillStyle = color; rr(x + 46, y - 6, Math.max(12, 120 * clamp(v / max, 0, 1)), 12, 6); ctx.fill();
  }

  function showcase(heroId, weaponId, y) {
    const hero = MD.heroById(heroId), w = MD.weaponById(weaponId);
    MD.spr('light_03', W / 2 - 90, y + 110, { scale: 1.3, rot: M.t * 0.3, tint: '#4f8cff', add: true, alpha: 0.3 });
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(W / 2 - 90, y + 168, 56, 14, 0, 0, TAU); ctx.fill();
    MD.drawHero(hero.sprite, w.pose, W / 2 - 96, y + 125 + Math.sin(M.t * 2.5) * 3, 1.9);
  }

  function drawHeroes() {
    const sv = MD.save, y = TOP + 6;
    const hero = MD.heroById(M.viewHero || sv.hero);
    const owned = sv.heroes[hero.id];
    const lv = owned ? owned.lv : 1;
    ui.panel(12, y, W - 24, 270);
    showcase(hero.id, sv.weapon, y);
    const rx = W / 2 - 10;
    text(hero.name, rx, y + 34, 26, '#fff', { align: 'left', stroke: 5 });
    text(owned ? `Lv.${lv}` : '미보유', rx, y + 60, 14, owned ? '#7dff8a' : '#ff8a8a', { align: 'left', weight: 800 });
    statBar(rx, y + 88, '공격', hero.dmg * (1 + (lv - 1) * 0.1), 4.5, '#ff7a45');
    statBar(rx, y + 110, '연사', hero.rate, 1.3, '#4fc3ff');
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(rx - 6, y + 126, W - rx - 14, 62, 10); ctx.fill();
    text('스킬 · ' + hero.skillName, rx + 2, y + 142, 14, '#ffd34d', { align: 'left' });
    MD.wrapText(hero.desc, rx + 2, y + 164, W - rx - 30, 12, '#dfe6ff', 16, { align: 'left' });
    // 버튼
    if (!owned) {
      ui.button(rx - 4, y + 204, W - rx - 14, 50, fmt(hero.cost), () => {
        if (!spend(hero.cost)) return;
        sv.heroes[hero.id] = { lv: 1 }; sv.hero = hero.id; MD.persist();
        MD.sfx.levelup(); coinBurst(W / 2, y + 120, 16); toast(`${hero.name} 영입!`, '#7dff8a');
      }, { icon: 'coin', size: 20, disabled: sv.coins < hero.cost });
    } else {
      const maxed = lv >= MD.HERO_MAX, cost = MD.heroUpCost(lv);
      if (sv.hero !== hero.id) {
        ui.button(rx - 4, y + 204, 92, 50, '선택', () => { sv.hero = hero.id; MD.persist(); MD.sfx.confirm(); }, { size: 18, color: '#4fc3ff', dark: '#1f6fa8', textColor: '#06233a' });
      } else {
        ctx.fillStyle = 'rgba(125,255,138,0.18)'; rr(rx - 4, y + 204, 92, 50, 14); ctx.fill();
        text('출전 중', rx + 42, y + 230, 15, '#7dff8a');
      }
      ui.button(rx + 96, y + 204, W - rx - 114, 50, maxed ? 'MAX' : fmt(cost), () => {
        if (!spend(cost)) return;
        owned.lv++; MD.persist(); MD.sfx.levelup(); toast(`${hero.name} Lv.${owned.lv}!`, '#7dff8a');
      }, { icon: maxed ? null : 'coin', size: 18, disabled: maxed || sv.coins < cost });
    }
    // 목록
    const gy = y + 286, cw = (W - 24 - 18) / 4, ch = 118;
    MD.HEROES.forEach((h, i) => {
      const cx = 12 + (i % 4) * (cw + 6), cy = gy + Math.floor(i / 4) * (ch + 8);
      const own = sv.heroes[h.id], sel = M.viewHero === h.id;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(cx, cy + 4, cw, ch, 14); ctx.fill();
      ctx.fillStyle = sel ? '#3a5bb0' : own ? '#263464' : '#1b223f'; rr(cx, cy, cw, ch, 14); ctx.fill();
      if (sv.hero === h.id) { ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 3; rr(cx, cy, cw, ch, 14); ctx.stroke(); }
      else if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(cx, cy, cw, ch, 14); ctx.stroke(); }
      ctx.globalAlpha = own ? 1 : 0.45;
      MD.drawHero(h.sprite, 'stand', cx + cw / 2, cy + 50, 1.3);
      ctx.globalAlpha = 1;
      text(h.name, cx + cw / 2, cy + 90, 13, '#fff', { maxW: cw - 6 });
      if (own) text(`Lv.${own.lv}`, cx + cw / 2, cy + 107, 11, '#7dff8a', { weight: 800 });
      else { MD.drawCoin(cx + cw / 2 - 22, cy + 107, 5); text(fmt(h.cost), cx + cw / 2 + 4, cy + 107, 11, '#ffd34d', { weight: 800 }); }
      ui.hit(cx, cy, cw, ch, () => { M.viewHero = h.id; MD.sfx.select(); });
    });
  }

  function drawWeapons() {
    const sv = MD.save, y = TOP + 6;
    const w = MD.weaponById(M.viewWeapon || sv.weapon);
    const owned = sv.weapons[w.id], lv = owned ? owned.lv : 1;
    ui.panel(12, y, W - 24, 270);
    showcase(sv.hero, w.id, y);
    const rx = W / 2 - 10;
    text(w.name, rx, y + 34, 26, '#fff', { align: 'left', stroke: 5 });
    text(owned ? `Lv.${lv}` : '미보유', rx, y + 60, 14, owned ? '#7dff8a' : '#ff8a8a', { align: 'left', weight: 800 });
    statBar(rx, y + 88, '위력', w.dmg * (1 + (lv - 1) * 0.1), 6, '#ff7a45');
    statBar(rx, y + 110, '연사', w.rate, 2, '#4fc3ff');
    statBar(rx, y + 132, '탄수', w.bullets, 2.5, '#b48cff');
    MD.wrapText(w.desc + (w.pierce ? ` (관통 ${w.pierce})` : ''), rx + 2, y + 162, W - rx - 30, 12, '#dfe6ff', 16, { align: 'left' });
    if (!owned) {
      ui.button(rx - 4, y + 204, W - rx - 14, 50, fmt(w.cost), () => {
        if (!spend(w.cost)) return;
        sv.weapons[w.id] = { lv: 1 }; sv.weapon = w.id; MD.persist();
        MD.sfx.levelup(); coinBurst(W / 2, y + 120, 16); toast(`${w.name} 획득!`, '#7dff8a');
      }, { icon: 'coin', size: 20, disabled: sv.coins < w.cost });
    } else {
      const maxed = lv >= MD.WEAPON_MAX, cost = MD.weaponUpCost(lv);
      if (sv.weapon !== w.id) ui.button(rx - 4, y + 204, 92, 50, '장착', () => { sv.weapon = w.id; MD.persist(); MD.sfx.confirm(); }, { size: 18, color: '#4fc3ff', dark: '#1f6fa8', textColor: '#06233a' });
      else { ctx.fillStyle = 'rgba(125,255,138,0.18)'; rr(rx - 4, y + 204, 92, 50, 14); ctx.fill(); text('장착 중', rx + 42, y + 230, 15, '#7dff8a'); }
      ui.button(rx + 96, y + 204, W - rx - 114, 50, maxed ? 'MAX' : fmt(cost), () => {
        if (!spend(cost)) return;
        owned.lv++; MD.persist(); MD.sfx.levelup(); toast(`${w.name} Lv.${owned.lv}!`, '#7dff8a');
      }, { icon: maxed ? null : 'coin', size: 18, disabled: maxed || sv.coins < cost });
    }
    const gy = y + 286, cw = (W - 24 - 18) / 4, ch = 130;
    MD.WEAPONS.forEach((wp, i) => {
      const cx = 12 + i * (cw + 6), cy = gy;
      const own = sv.weapons[wp.id], sel = M.viewWeapon === wp.id;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(cx, cy + 4, cw, ch, 14); ctx.fill();
      ctx.fillStyle = sel ? '#3a5bb0' : own ? '#263464' : '#1b223f'; rr(cx, cy, cw, ch, 14); ctx.fill();
      if (sv.weapon === wp.id) { ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 3; rr(cx, cy, cw, ch, 14); ctx.stroke(); }
      else if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(cx, cy, cw, ch, 14); ctx.stroke(); }
      ctx.globalAlpha = own ? 1 : 0.45;
      MD.drawHero(MD.heroById(sv.hero).sprite, wp.pose, cx + cw / 2, cy + 58, 1.3);
      ctx.globalAlpha = 1;
      text(wp.name, cx + cw / 2, cy + 100, 13, '#fff', { maxW: cw - 6 });
      if (own) text(`Lv.${own.lv}`, cx + cw / 2, cy + 118, 11, '#7dff8a', { weight: 800 });
      else { MD.drawCoin(cx + cw / 2 - 22, cy + 118, 5); text(fmt(wp.cost), cx + cw / 2 + 4, cy + 118, 11, '#ffd34d', { weight: 800 }); }
      ui.hit(cx, cy, cw, ch, () => { M.viewWeapon = wp.id; MD.sfx.select(); });
    });
    // 팁
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(12, gy + 146, W - 24, 70, 14); ctx.fill();
    MD.wrapText('무기는 모든 영웅이 함께 써요. 레벨이 오를수록 위력이 10%씩 강해져요.', W / 2, gy + 172, W - 60, 13, '#c7d2f5', 18);
  }

  // ----- 강화 -----
  function drawUpgrades() {
    const sv = MD.save, y = TOP + 8;
    ui.panel(12, y, W - 24, 92);
    text('전투력', W / 2, y + 28, 15, '#9fb3e6', { weight: 800 });
    text(fmt(MD.power()), W / 2, y + 62, 34, '#ffd34d', { stroke: 6 });
    MD.UPGRADES.forEach((u, i) => {
      const cy = y + 108 + i * 104;
      const lvl = sv.up[u.key] || 0, maxed = lvl >= u.max, cost = u.cost(lvl);
      ui.panel(12, cy, W - 24, 92, { top: '#24315f', bottom: '#18203f' });
      text(u.name, 32, cy + 30, 19, '#fff', { align: 'left' });
      text(`Lv.${lvl}`, 32, cy + 58, 14, '#7dff8a', { align: 'left', weight: 800 });
      text(`${u.eff(lvl)}${maxed ? '' : '  →  ' + u.eff(lvl + 1)}`, 86, cy + 58, 14, '#c7d2f5', { align: 'left', weight: 800 });
      ui.button(W - 140, cy + 22, 112, 48, maxed ? 'MAX' : fmt(cost), () => {
        if (!spend(cost)) return;
        sv.up[u.key] = lvl + 1; MD.persist(); MD.sfx.levelup(); toast(`${u.name} 강화!`, '#7dff8a');
      }, { icon: maxed ? null : 'coin', size: 18, disabled: maxed || sv.coins < cost });
    });
  }

  // ----- 미션 / 업적 -----
  function drawMissions() {
    const sv = MD.save;
    const oy = TOP + 8 - M.scroll.missions;
    let y = oy;
    // 출석
    ui.panel(12, y, W - 24, 150);
    text('출석 보상', 30, y + 26, 18, '#fff', { align: 'left' });
    text(`${sv.daily.day}일째`, W - 30, y + 26, 13, '#9fb3e6', { align: 'right', weight: 800 });
    const bw = (W - 48 - 6 * 6) / 7;
    MD.DAILY.forEach((amt, i) => {
      const bx = 24 + i * (bw + 6), by = y + 46;
      const got = i < sv.daily.day && !(MD.dailyAvailable() && sv.daily.day === MD.DAILY.length);
      ctx.fillStyle = got ? '#2e6b45' : i === (MD.dailyAvailable() ? sv.daily.day % 7 : -1) ? '#3a5bb0' : 'rgba(255,255,255,0.08)';
      rr(bx, by, bw, 50, 8); ctx.fill();
      text(`${i + 1}일`, bx + bw / 2, by + 12, 10, '#c7d2f5', { weight: 800 });
      MD.drawCoin(bx + bw / 2, by + 28, 6);
      text(fmt(amt), bx + bw / 2, by + 42, 10, '#ffd34d', { weight: 800 });
    });
    if (MD.dailyAvailable()) ui.button(W / 2 - 80, y + 104, 160, 38, '받기', () => { const a = MD.claimDaily(); coinBurst(W / 2, y + 120, 18); MD.sfx.confirm(); toast(`+${a} 코인!`, '#ffd34d'); }, { size: 17, badge: true });
    else text('내일 또 와요!', W / 2, y + 124, 14, '#7f8bb0', { weight: 800 });
    y += 164;
    // 일일 미션
    text('일일 미션', 24, y + 12, 18, '#fff', { align: 'left', stroke: 4 });
    y += 30;
    for (const m of sv.missions.list) {
      const def = MD.MISSION_POOL.find(p => p.id === m.id);
      if (!def) continue;
      const done = m.prog >= def.goal;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(12, y + 4, W - 24, 70, 14); ctx.fill();
      ctx.fillStyle = m.claimed ? '#1b2a2a' : '#22305c'; rr(12, y, W - 24, 70, 14); ctx.fill();
      text(def.text(def.goal), 28, y + 22, 15, m.claimed ? '#7f8bb0' : '#fff', { align: 'left' });
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(28, y + 42, 200, 12, 6); ctx.fill();
      ctx.fillStyle = done ? '#7dff8a' : '#4fc3ff'; rr(28, y + 42, Math.max(12, 200 * Math.min(1, m.prog / def.goal)), 12, 6); ctx.fill();
      text(`${fmt(m.prog)}/${fmt(def.goal)}`, 236, y + 48, 11, '#c7d2f5', { align: 'left', weight: 800 });
      if (m.claimed) text('완료', W - 64, y + 35, 15, '#7dff8a');
      else ui.button(W - 118, y + 14, 94, 42, fmt(def.reward), () => {
        m.claimed = true; sv.coins += def.reward; MD.persist(); MD.sfx.confirm(); coinBurst(W - 70, y + 35, 12); toast(`+${def.reward} 코인!`, '#ffd34d');
      }, { icon: 'coin', size: 15, disabled: !done, badge: done });
      y += 80;
    }
    y += 10;
    text('업적', 24, y + 12, 18, '#fff', { align: 'left', stroke: 4 });
    y += 30;
    for (const a of MD.ACHIEVEMENTS) {
      const st = MD.achState(a);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(12, y + 4, W - 24, 76, 14); ctx.fill();
      ctx.fillStyle = st.done ? '#2a2a18' : '#22305c'; rr(12, y, W - 24, 76, 14); ctx.fill();
      for (let k = 0; k < a.tiers.length; k++) MD.spr(k < st.tier ? 'star' : 'star_empty', 30 + k * 16, y + 18, { scale: 0.32 });
      text(a.name, 30 + a.tiers.length * 16 + 6, y + 19, 15, '#fff', { align: 'left' });
      text(st.done ? '모든 단계 달성!' : a.text(st.goal), 28, y + 44, 13, '#c7d2f5', { align: 'left', weight: 800 });
      if (!st.done) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(28, y + 58, 200, 9, 4.5); ctx.fill();
        ctx.fillStyle = st.claimable ? '#7dff8a' : '#b48cff'; rr(28, y + 58, Math.max(9, 200 * Math.min(1, st.val / st.goal)), 9, 4.5); ctx.fill();
        ui.button(W - 118, y + 17, 94, 42, fmt(st.reward), () => {
          sv.ach[a.id] = st.tier + 1; sv.coins += st.reward; MD.persist(); MD.sfx.levelup(); coinBurst(W - 70, y + 38, 14); toast(`업적 달성! +${st.reward}`, '#ffd34d');
        }, { icon: 'coin', size: 15, disabled: !st.claimable, badge: st.claimable });
      }
      y += 86;
    }
    M.contentH.missions = y - oy + 20;
  }

  // ----- 상단 / 하단 바 -----
  function drawTopBar() {
    const g = ctx.createLinearGradient(0, 0, 0, TOP);
    g.addColorStop(0, '#0d1430'); g.addColorStop(1, 'rgba(13,20,48,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(12, 16, 132, 34, 17); ctx.fill();
    MD.drawCoin(30, 33, 12);
    text(fmt(MD.save.coins), 48, 34, 18, '#ffd34d', { align: 'left', stroke: 3 });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(152, 16, 124, 34, 17); ctx.fill();
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath(); ctx.moveTo(170, 22); ctx.lineTo(162, 35); ctx.lineTo(169, 35); ctx.lineTo(165, 45); ctx.lineTo(176, 30); ctx.lineTo(169, 30); ctx.closePath(); ctx.fill();
    text(fmt(MD.power()), 184, 34, 17, '#fff', { align: 'left', stroke: 3 });
    ui.iconButton(W - 50, 14, 'gear', () => { M.popup = { kind: 'settings', t: 0 }; MD.sfx.open(); });
  }

  const TABS = [
    { id: 'heroes', label: '영웅' },
    { id: 'weapons', label: '무기' },
    { id: 'map', label: '전투' },
    { id: 'upgrades', label: '강화' },
    { id: 'missions', label: '미션' },
  ];
  function tabIcon(id, x, y, on) {
    const c = on ? '#fff' : '#8fa2d6';
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 3;
    if (id === 'heroes') { circle(x, y - 6, 6); ctx.fill(); rr(x - 9, y + 2, 18, 10, 5); ctx.fill(); }
    if (id === 'weapons') { rr(x - 12, y - 6, 22, 7, 2); ctx.fill(); ctx.fillRect(x - 6, y, 5, 10); ctx.fillRect(x + 10, y - 5, 4, 3); }
    if (id === 'map') { ctx.beginPath(); ctx.moveTo(x - 8, y + 12); ctx.lineTo(x - 8, y - 12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 10, y - 7); ctx.lineTo(x - 8, y - 1); ctx.closePath(); ctx.fill(); }
    if (id === 'upgrades') { ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 11, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 4, y + 11); ctx.lineTo(x - 4, y + 11); ctx.lineTo(x - 4, y); ctx.lineTo(x - 11, y); ctx.closePath(); ctx.fill(); }
    if (id === 'missions') { rr(x - 10, y - 12, 20, 24, 3); ctx.stroke(); ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 5, y - 5 + i * 6); ctx.lineTo(x + 5, y - 5 + i * 6); ctx.stroke(); } }
  }
  function drawTabBar() {
    const g = ctx.createLinearGradient(0, BOTTOM, 0, H);
    g.addColorStop(0, '#162050'); g.addColorStop(1, '#0b1230');
    ctx.fillStyle = g; ctx.fillRect(0, BOTTOM, W, H - BOTTOM);
    ctx.fillStyle = 'rgba(120,160,255,0.35)'; ctx.fillRect(0, BOTTOM, W, 2);
    const tw = W / TABS.length;
    TABS.forEach((t, i) => {
      const x = i * tw, on = M.tab === t.id, mid = t.id === 'map';
      if (mid) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; circle(x + tw / 2, BOTTOM + 22, 36); ctx.fill();
        const bg = ctx.createLinearGradient(0, BOTTOM - 14, 0, BOTTOM + 54);
        bg.addColorStop(0, on ? '#ffe17a' : '#ffcf3f'); bg.addColorStop(1, '#e0961a');
        ctx.fillStyle = bg; circle(x + tw / 2, BOTTOM + 18, 34); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        tabIcon(t.id, x + tw / 2, BOTTOM + 14, true);
        text(t.label, x + tw / 2, BOTTOM + 64, 13, on ? '#fff' : '#c7d2f5');
      } else {
        if (on) { ctx.fillStyle = 'rgba(80,120,220,0.35)'; rr(x + 6, BOTTOM + 6, tw - 12, H - BOTTOM - 12, 14); ctx.fill(); }
        tabIcon(t.id, x + tw / 2, BOTTOM + 30, on);
        text(t.label, x + tw / 2, BOTTOM + 60, 13, on ? '#fff' : '#8fa2d6');
      }
      if (t.id === 'missions' && MD.pendingRewards() > 0) { ctx.fillStyle = '#ff3b4e'; circle(x + tw / 2 + 16, BOTTOM + 16, 7); ctx.fill(); }
      ui.hit(x, BOTTOM - (mid ? 20 : 0), tw, H - BOTTOM + (mid ? 20 : 0), () => {
        if (M.tab === t.id) return;
        M.tab = t.id; MD.sfx.click();
        if (t.id === 'heroes') M.viewHero = MD.save.hero;
        if (t.id === 'weapons') M.viewWeapon = MD.save.weapon;
        if (t.id === 'map') scrollToCurrent();
      });
    });
  }

  // ----- 팝업 -----
  function drawPopup() {
    const p = M.popup;
    if (!p) return;
    ui.modal();
    ctx.fillStyle = `rgba(4,7,20,${Math.min(0.7, p.t * 4)})`;
    ctx.fillRect(0, 0, W, H);
    ui.hit(0, 0, W, H, () => { if (p.kind !== 'daily') { M.popup = null; MD.sfx.back(); } });
    const k = MD.easeOutBack(clamp(p.t / 0.3, 0, 1));
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-W / 2, -H / 2);
    ctx.globalAlpha = clamp(p.t * 5, 0, 1);
    if (p.kind === 'stage') drawStagePopup(p);
    else if (p.kind === 'settings') drawSettings(p);
    else if (p.kind === 'daily') drawDailyPopup(p);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawStagePopup(p) {
    const info = MD.stageInfo(p.idx), sv = MD.save;
    const x = 30, y = 120, w = W - 60, h = 500;
    ui.panel(x, y, w, h);
    ui.hit(x, y, w, h, () => {});
    ui.iconButton(x + w - 46, y + 10, 'close', () => { M.popup = null; MD.sfx.back(); }, { bg: 'rgba(200,60,80,0.9)' });
    text(`STAGE ${info.label}`, W / 2, y + 34, 26, '#fff', { stroke: 5 });
    text(info.worldData.name, W / 2, y + 62, 14, '#9fb3e6', { weight: 800 });
    // 보스 미리보기
    ctx.save();
    rr(x + 20, y + 80, w - 40, 150, 14); ctx.clip();
    const bg = worldBg(info.world);
    if (bg) ctx.drawImage(bg, 0, 120, W, 150, x + 20, y + 80, w - 40, 150);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 20, y + 80, w - 40, 150);
    MD.drawMonster(info.boss.recipe, info.worldData.colors.boss, W / 2, y + 150, info.isWorldBoss ? 100 : 80, M.t, { seed: 1 });
    ctx.restore();
    text((info.isWorldBoss ? '월드 보스 · ' : '보스 · ') + info.boss.name, W / 2, y + 248, 17, info.isWorldBoss ? '#ff8a8a' : '#ffd34d', { stroke: 4 });
    // 별 조건
    const labels = ['스테이지 클리어', '방어선 돌파 3회 이하', '보스 30초 안에 처치'];
    const got = sv.stars[p.idx] || 0;
    labels.forEach((l, i) => {
      const yy = y + 284 + i * 28;
      MD.spr(i < got ? 'star' : 'star_empty', x + 46, yy, { scale: 0.45 });
      text(l, x + 66, yy + 1, 14, '#dfe6ff', { align: 'left', weight: 800 });
    });
    // 전투력
    const my = MD.power(), rec = info.recommended;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x + 20, y + 370, w - 40, 44, 12); ctx.fill();
    text('권장 전투력', x + 36, y + 392, 13, '#9fb3e6', { align: 'left', weight: 800 });
    text(fmt(rec), x + 128, y + 392, 16, '#fff', { align: 'left' });
    text('내 전투력', x + 200, y + 392, 13, '#9fb3e6', { align: 'left', weight: 800 });
    text(fmt(my), x + 278, y + 392, 16, my >= rec ? '#7dff8a' : '#ff8a8a', { align: 'left' });
    ui.button(x + 40, y + 426, w - 80, 58, '출전!', () => { M.popup = null; MD.sfx.confirm(); MD.main.startBattle(p.idx); }, { size: 26 });
  }

  function drawSettings(p) {
    const x = 50, y = 200, w = W - 100, h = 330;
    ui.panel(x, y, w, h);
    ui.hit(x, y, w, h, () => {});
    ui.iconButton(x + w - 46, y + 10, 'close', () => { M.popup = null; MD.sfx.back(); }, { bg: 'rgba(200,60,80,0.9)' });
    text('설정', W / 2, y + 32, 22, '#fff');
    const row = (yy, label, on, fn) => {
      text(label, x + 30, yy, 16, '#fff', { align: 'left' });
      ui.button(x + w - 120, yy - 20, 90, 40, on ? 'ON' : 'OFF', fn, { size: 16, color: on ? '#3cc06a' : '#6b7395', dark: on ? '#1f7a40' : '#3b4260', textColor: '#fff' });
    };
    row(y + 86, '효과음', MD.save.sfx, () => { MD.save.sfx = !MD.save.sfx; MD.persist(); MD.sfx.click(); });
    row(y + 140, '배경음악', MD.save.music, () => { MD.save.music = !MD.save.music; MD.persist(); MD.sfx.click(); });
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(x + 20, y + 180, w - 40, 120, 12); ctx.fill();
    text('CREDITS', W / 2, y + 200, 13, '#ffd34d');
    MD.wrapText('그래픽·효과음: Kenney (kenney.nl)\nCC0 공개 라이선스 에셋 사용\n음악: 절차적 생성', W / 2, y + 226, w - 60, 12, '#c7d2f5', 18);
    text('곱셈 디펜스 v3', W / 2, y + 290, 11, '#7f8bb0', { weight: 800 });
  }

  function drawDailyPopup(p) {
    const sv = MD.save, x = 30, y = 170, w = W - 60, h = 380;
    ui.panel(x, y, w, h, { top: '#3a2f70', bottom: '#1b1640' });
    ui.hit(x, y, w, h, () => {});
    MD.spr('light_03', W / 2, y + 110, { scale: 1.4, rot: M.t * 0.6, tint: '#ffd34d', add: true, alpha: 0.35 });
    text('출석 보상', W / 2, y + 36, 26, '#ffd34d', { stroke: 5 });
    const gap = sv.daily.last ? MD.dayDiff(sv.daily.last, MD.today()) : 1;
    const next = gap === 1 ? (sv.daily.day % MD.DAILY.length) + 1 : 1;
    text(`${next}일째 보상`, W / 2, y + 70, 15, '#fff', { weight: 800 });
    MD.drawCoin(W / 2, y + 140, 40 + Math.sin(M.t * 4) * 2);
    text('+' + MD.DAILY[next - 1], W / 2, y + 210, 36, '#ffd34d', { stroke: 6 });
    const bw = (w - 40 - 36) / 7;
    for (let i = 0; i < 7; i++) {
      const bx = x + 20 + i * (bw + 6), on = i < next;
      ctx.fillStyle = i === next - 1 ? '#ffcf3f' : on ? '#5a4fb0' : 'rgba(255,255,255,0.1)';
      rr(bx, y + 244, bw, 28, 8); ctx.fill();
      text(String(i + 1), bx + bw / 2, y + 259, 12, i === next - 1 ? '#3a2400' : '#fff');
    }
    ui.button(x + 50, y + 296, w - 100, 56, '받기!', () => {
      const a = MD.claimDaily(); coinBurst(W / 2, y + 140, 26); MD.sfx.levelup(); toast(`+${a} 코인!`, '#ffd34d'); M.popup = null;
    }, { size: 24 });
  }

  // ===================================================================
  //  메뉴 업데이트/그리기/입력
  // ===================================================================
  M.update = dt => {
    M.t += dt;
    if (M.popup) M.popup.t += dt;
    if (M.toast) { M.toast.t -= dt; if (M.toast.t <= 0) M.toast = null; }
    for (const p of M.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.life -= dt; }
    M.parts = M.parts.filter(p => p.life > 0);
    if (M.fling) {
      const tab = M.tab;
      if (M.scroll[tab] != null) {
        M.scroll[tab] += M.fling * dt;
        M.fling *= Math.pow(0.05, dt);
        if (Math.abs(M.fling) < 5) M.fling = 0;
        clampScroll();
      }
    }
  };

  function clampScroll() {
    const tab = M.tab;
    const ch = tab === 'map' ? M.contentH.map : tab === 'missions' ? M.contentH.missions : 0;
    M.scroll[tab] = clamp(M.scroll[tab], 0, Math.max(0, ch - (BOTTOM - TOP)));
  }
  M.scrollBy = dy => {
    if (M.popup) return;
    M.scroll[M.tab] = (M.scroll[M.tab] || 0) + dy;
    clampScroll();
  };
  M.canScroll = () => !M.popup && (M.tab === 'map' || M.tab === 'missions');

  M.draw = () => {
    ctx.fillStyle = '#0f1736';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, TOP, W, BOTTOM - TOP); ctx.clip();
    ui.clip = [TOP, BOTTOM];
    const bg = ctx.createLinearGradient(0, TOP, 0, BOTTOM);
    bg.addColorStop(0, '#16224d'); bg.addColorStop(1, '#0d1430');
    ctx.fillStyle = bg; ctx.fillRect(0, TOP, W, BOTTOM - TOP);
    if (M.tab === 'map') drawMap();
    else if (M.tab === 'heroes') drawHeroes();
    else if (M.tab === 'weapons') drawWeapons();
    else if (M.tab === 'upgrades') drawUpgrades();
    else if (M.tab === 'missions') drawMissions();
    ctx.restore();
    ui.clip = null;
    drawTopBar();
    drawTabBar();
    for (const p of M.parts) MD.drawCoin(p.x, p.y, 7);
    drawPopup();
    if (M.toast) {
      const a = clamp(M.toast.t * 3, 0, 1);
      ctx.globalAlpha = a;
      const w = MD.textW(M.toast.msg, 17) + 40;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; rr(W / 2 - w / 2, 92, w, 40, 20); ctx.fill();
      text(M.toast.msg, W / 2, 113, 17, M.toast.color);
      ctx.globalAlpha = 1;
    }
  };

  // ===================================================================
  //  로딩 / 타이틀
  // ===================================================================
  MD.drawTitle = (t, progress, ready) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1430'); g.addColorStop(1, '#1d2f5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    MD.spr('light_03', W / 2, 250, { scale: 2.2, rot: t * 0.2, tint: '#3a6bff', add: true, alpha: 0.3 });
    if (MD.frame('body_greenB')) {
      MD.drawMonster(MD.MON_RECIPES.grunt, 'green', 80, 470 + Math.sin(t * 2) * 6, 70, t, { seed: 0 });
      MD.drawMonster(MD.MON_RECIPES.tank, 'red', 340, 450 + Math.sin(t * 2 + 1) * 6, 80, t, { seed: 1 });
      MD.drawMonster(MD.BOSSES[1].recipe, 'red', W / 2, 400 + Math.sin(t * 1.5) * 4, 110, t, { seed: 2 });
      for (let i = 0; i < 7; i++) MD.drawHero('soldier1', 'machine', W / 2 + (i - 3) * 34, 600 + Math.abs(i - 3) * 8, 0.9);
    }
    const ly = 170 + Math.sin(t * 2) * 4;
    text('곱셈', W / 2 - 62, ly, 66, '#6ff0ff', { stroke: 12, strokeColor: '#0a2a55' });
    text('디펜스', W / 2 + 64, ly + 60, 66, '#ffd34d', { stroke: 12, strokeColor: '#4a2a00' });
    ctx.save(); ctx.translate(W / 2 + 122, ly - 28); ctx.rotate(0.25 + Math.sin(t * 3) * 0.06);
    ctx.fillStyle = '#ff4d5e'; rr(-32, -19, 64, 38, 10); ctx.fill();
    text('×10', 0, 1, 22, '#fff'); ctx.restore();
    if (!ready) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(70, 690, W - 140, 14, 7); ctx.fill();
      ctx.fillStyle = '#4fc3ff'; rr(70, 690, Math.max(14, (W - 140) * progress), 14, 7); ctx.fill();
      text('불러오는 중...', W / 2, 670, 14, '#c7d2f5', { weight: 800 });
    } else {
      ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.4;
      text('화면을 터치해서 시작', W / 2, 690, 22, '#fff', { stroke: 5 });
      ctx.globalAlpha = 1;
    }
    text('Assets by Kenney (CC0)', W / 2, H - 18, 10, 'rgba(255,255,255,0.35)', { weight: 700 });
  };
})();
