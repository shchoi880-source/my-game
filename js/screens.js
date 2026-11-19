'use strict';
// 장면: title / select / play(+일시정지) / complete — docs/SPEC.md §8
(() => {
  const G = window.G;
  const W = G.W || 960, H = G.H || 540, TAU = Math.PI * 2;
  G.scenes = G.scenes || {};
  const RN = () => G.render;
  const FX = () => G.fx;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const eob = t => (G.easeOutBack ? G.easeOutBack(clamp(t, 0, 1)) : clamp(t, 0, 1));
  const eoc = t => (G.easeOutCubic ? G.easeOutCubic(clamp(t, 0, 1)) : clamp(t, 0, 1));
  const DIFF = ['쉬움', '보통', '어려움', '매우 어려움', '극악'];
  const DIFF_COL = ['#3dffb0', '#29f0ff', '#ffd23d', '#ff7a3d', '#ff2d6a'];
  const levels = () => (Array.isArray(G.LEVELS) ? G.LEVELS : []);
  const save = () => G.save;
  const lvSave = lv => (G.save && lv ? G.save.level(lv.id) : { best: 0, done: false, attempts: 0, coins: [false, false, false], bestTime: null, practiceBest: 0 });
  const persist = () => { try { G.save && G.save.persist(); } catch (e) { /* 무시 */ } };
  const unlocked = i => i === 0 || (levels()[i - 1] && lvSave(levels()[i - 1]).done);
  const fmtTime = s => { if (s == null || !isFinite(s)) return '--'; const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };

  // ===== 오디오 안전 래퍼 =====
  let curTrack = null;
  const A = {
    sfx(n, o) { try { if (G.audio && G.audio.sfx) G.audio.sfx(n, o); } catch (e) { /* 무시 */ } },
    start(track, from) { try { if (G.audio && G.audio.music && G.audio.music.start) { G.audio.music.start(track, from || 0); curTrack = track; } } catch (e) { /* 무시 */ } },
    stop() { try { if (G.audio && G.audio.music && G.audio.music.stop) G.audio.music.stop(); } catch (e) { /* 무시 */ } curTrack = null; },
    duck(on) { try { if (G.audio && G.audio.music && G.audio.music.duck) G.audio.music.duck(on); } catch (e) { /* 무시 */ } },
    layer(n) { try { if (G.audio && G.audio.music && G.audio.music.setLayer) G.audio.music.setLayer(n); } catch (e) { /* 무시 */ } },
    playing() { try { return !!(G.audio && G.audio.music && G.audio.music.playing && G.audio.music.playing()); } catch (e) { return false; } },
  };
  function menuMusic() {
    if (G.save && G.save.data && G.save.data.music === false) return;
    if (curTrack !== 'menu' || !A.playing()) { A.duck(false); A.layer(1); A.start('menu', 0); }
  }

  // ===== 즉시 모드 버튼 =====
  const ui = { btns: [], press: null, hover: null, anim: {}, mx: -1, my: -1 };
  function uiBegin() { ui.btns.length = 0; }
  function hitBtn(x, y) {
    for (let i = ui.btns.length - 1; i >= 0; i--) {
      const b = ui.btns[i];
      if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }
  function uiDown(x, y) {
    const b = hitBtn(x, y);
    if (!b) return false;
    ui.press = b.id;
    if (b.fireOnDown) { ui.press = null; b.onClick && b.onClick(); }
    return true;
  }
  function uiUp(x, y) {
    const id = ui.press; ui.press = null;
    if (!id) return false;
    const b = hitBtn(x, y);
    if (b && b.id === id && b.onClick) { b.onClick(); return true; }
    return false;
  }
  function uiMove(x, y) { ui.mx = x; ui.my = y; const b = hitBtn(x, y); ui.hover = b ? b.id : null; }
  // 버튼 등록 + 눌림/호버 애니메이션 값(k: 0~1 눌림, h: 0~1 호버)
  function region(id, x, y, w, h, onClick, o) {
    o = o || {};
    ui.btns.push({ id, x, y, w, h, onClick, fireOnDown: !!o.fireOnDown, disabled: !!o.disabled });
    let a = ui.anim[id];
    if (!a) a = ui.anim[id] = { k: 0, h: 0 };
    const pk = ui.press === id ? 1 : 0, hv = ui.hover === id ? 1 : 0;
    a.k += (pk - a.k) * 0.35; a.h += (hv - a.h) * 0.25;
    return a;
  }
  function button(ctx, id, x, y, w, h, label, onClick, o) {
    o = o || {};
    const R = RN();
    const a = region(id, x, y, w, h, onClick, o);
    const col = o.color || '#29f0ff';
    const s = 1 - a.k * 0.06 + a.h * 0.03;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    R.rr(ctx, -w / 2, -h / 2, w, h, o.r || 14);
    if (o.primary) {
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, R.mix(col, '#ffffff', 0.25)); g.addColorStop(1, R.mix(col, '#000000', 0.35));
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(8,10,30,0.82)';
    ctx.fill();
    R.neonStroke(ctx, col, 2 + a.h, o.primary);
    if (o.icon) o.icon(ctx, o.label2 ? -w / 2 + 26 : 0, 0, col);
    if (label) R.glowText(ctx, label, o.icon && label ? 10 : 0, 1, o.size || 22, o.primary ? '#ffffff' : col, { glow: 0.5, core: !o.primary });
    ctx.restore();
    return a;
  }

  // ===== 전환 =====
  const tr = { phase: 0, t: 0, to: null, params: null };
  function nav(name, params) {
    if (tr.phase === 1) return;
    tr.phase = 1; tr.t = 0; tr.to = name; tr.params = params;
  }
  const busy = () => tr.phase === 1;
  function trUpdate(dt) {
    if (tr.phase === 1) { tr.t += dt; if (tr.t >= 0.2) { tr.phase = 2; tr.t = 0; ui.press = null; G.go(tr.to, tr.params); } }
    else if (tr.phase === 2) { tr.t += dt; if (tr.t >= 0.3) tr.phase = 0; }
  }
  function trDraw(ctx) {
    if (!tr.phase) return;
    const k = tr.phase === 1 ? eoc(tr.t / 0.2) : 1 - eoc(tr.t / 0.3);
    if (k <= 0) return;
    const R = RN();
    const sk = 160, edge = -sk + (W + sk * 2) * k;
    ctx.fillStyle = '#05060f';
    ctx.beginPath();
    if (tr.phase === 1) { ctx.moveTo(-10, -10); ctx.lineTo(edge + sk, -10); ctx.lineTo(edge, H + 10); ctx.lineTo(-10, H + 10); }
    else { const e2 = W + sk - (W + sk * 2) * k; ctx.moveTo(W + 10, -10); ctx.lineTo(e2, -10); ctx.lineTo(e2 - sk, H + 10); ctx.lineTo(W + 10, H + 10); }
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    if (tr.phase === 1) { ctx.moveTo(edge + sk, -10); ctx.lineTo(edge, H + 10); }
    else { const e2 = W + sk - (W + sk * 2) * k; ctx.moveTo(e2, -10); ctx.lineTo(e2 - sk, H + 10); }
    R.neonStroke(ctx, '#ff3df2', 3, true);
  }

  // ===== 토스트 =====
  const toastS = { msg: '', t: 0 };
  function toast(msg) { toastS.msg = msg; toastS.t = 2; }
  function toastDraw(ctx, dt) {
    if (toastS.t <= 0) return;
    toastS.t -= dt;
    const R = RN();
    const a = Math.min(1, toastS.t * 3), w = Math.max(220, R.txt && (G.textW ? G.textW(toastS.msg, 18) : 200) + 50);
    ctx.globalAlpha = a;
    R.rr(ctx, W / 2 - w / 2, H - 78, w, 44, 22); ctx.fillStyle = 'rgba(8,10,30,0.92)'; ctx.fill();
    R.neonStroke(ctx, '#29f0ff', 1.5);
    R.txt(ctx, toastS.msg, W / 2, H - 56, 18, '#ffffff', { weight: 700 });
    ctx.globalAlpha = 1;
  }

  // ===== 세로 화면 안내 =====
  function portraitDraw(ctx, t) {
    if (!G.portrait) return false;
    const R = RN();
    ctx.fillStyle = 'rgba(4,6,15,0.96)'; ctx.fillRect(0, 0, W, H);
    const ph = (t % 2.4) / 2.4;
    const rot = ph < 0.2 ? 0 : ph < 0.55 ? eoc((ph - 0.2) / 0.35) * (-Math.PI / 2) : ph < 0.85 ? -Math.PI / 2 : (-Math.PI / 2) * (1 - (ph - 0.85) / 0.15);
    ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.rotate(rot);
    R.rr(ctx, -45, -80, 90, 160, 14); R.neonStroke(ctx, '#29f0ff', 3, true);
    ctx.fillStyle = 'rgba(41,240,255,0.12)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 66, 5, 0, TAU); ctx.fillStyle = '#29f0ff'; ctx.fill();
    ctx.restore();
    // 회전 화살표
    ctx.beginPath(); ctx.arc(W / 2, H / 2 - 40, 120, -Math.PI * 0.85, -Math.PI * 0.55);
    ctx.strokeStyle = 'rgba(255,61,242,0.8)'; ctx.lineWidth = 4; ctx.stroke();
    R.glowText(ctx, '가로로 돌려주세요', W / 2, H / 2 + 110, 40, '#ffffff', { glow: 0.6 });
    R.txt(ctx, 'NEON DASH 는 가로 화면 전용이에요', W / 2, H / 2 + 160, 18, 'rgba(255,255,255,0.6)', { weight: 600 });
    return true;
  }

  // ===== 공통 프레임 =====
  let clock = 0, lastDt = 0.016;
  function common(dt) {
    clock += dt; lastDt = dt;
    if (FX()) FX().update(dt);
    trUpdate(dt);
  }
  function post(ctx) {
    if (FX()) { FX().draw(ctx, 1); FX().drawOverlay(ctx); }
    toastDraw(ctx, lastDt);
    trDraw(ctx);
    portraitDraw(ctx, clock);
  }
  function vignette(ctx, a) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ===== 데모 월드 (타이틀/선택/완료 배경) =====
  const DEMO_P = 456; // 점프 주기 px (체공 0.6초 × 380px/s ≈ 228 + 지상 228)
  const demo = {
    run: { state: { x: 0, y: 0, vy: 0, t: 0, grounded: true, jumpsLeft: 1, dead: false, done: false, progress: 0, coins: [false, false, false], rot: 0 }, objects: [], events: [] },
    level: { id: 'demo', bpm: 100, objects: [], theme: null },
    cam: null, nextJump: DEMO_P, built: -1, theme: null,
  };
  function demoBuild() {
    const st = demo.run.state;
    const k0 = Math.floor(st.x / DEMO_P) - 1;
    if (k0 === demo.built) return;
    demo.built = k0;
    const objs = [];
    for (let k = Math.max(1, k0); k < k0 + 5; k++) {
      const bx = k * DEMO_P, h = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
      if (h < 0.4) objs.push({ t: 'spike', x: bx + 94, y: 0, w: 40, h: 40, dir: 'up' });
      else if (h < 0.65) { objs.push({ t: 'spike', x: bx + 74, y: 0, w: 40, h: 40, dir: 'up' }, { t: 'spike', x: bx + 114, y: 0, w: 40, h: 40, dir: 'up' }); }
      else if (h < 0.8) { objs.push({ t: 'spike', x: bx + 94, y: 0, w: 40, h: 40, dir: 'up' }, { t: 'saw', x: bx + 114, y: 250, r: 26, cx: bx + 114, cy: 250 }); }
      else if (h < 0.9) objs.push({ t: 'gap', x: bx + 70, w: 90 }, { t: 'coin', x: bx + 300, y: 60 });
      else objs.push({ t: 'spike', x: bx + 94, y: 0, w: 40, h: 40, dir: 'up' }, { t: 'orb', x: bx + 340, y: 120 });
    }
    demo.run.objects = objs;
  }
  function demoSetTheme(theme) {
    const L = levels();
    demo.level.theme = theme || (L[0] && L[0].theme) || (RN() && RN().DEFAULT_THEME);
  }
  function demoUpdate(dt) {
    const R = RN();
    if (!demo.cam) demo.cam = R.newCam();
    if (!demo.level.theme) demoSetTheme();
    const st = demo.run.state;
    const sp = 380;
    const PH = G.PHYS || { gravity: 3000, jumpV: 900, size: 34 };
    const rotSpeed = (PH.rotSpeed) || Math.PI * 2 / 0.6;
    st.x += sp * dt; st.t += dt;
    if (st.grounded && st.x >= demo.nextJump) {
      st.vy = PH.jumpV || 900; st.grounded = false; demo.nextJump += DEMO_P;
      if (FX()) FX().jumpRing(st.x + 17, st.y, R.PLAYER_COL);
    }
    if (!st.grounded) {
      st.vy -= (PH.gravity || 3000) * dt; st.y += st.vy * dt;
      st.rot += rotSpeed * dt;
      if (st.y <= 0) {
        st.y = 0; st.vy = 0; st.grounded = true;
        st.rot = Math.round(st.rot / (Math.PI / 2)) * (Math.PI / 2);
        if (FX()) FX().landDust(st.x + 17, 0, null, 0.6);
      }
    }
    if (st.x > 2e6) { st.x = 0; demo.nextJump = DEMO_P; demo.built = -99; }
    demoBuild();
    R.updateCam(demo.cam, demo.run, dt);
  }
  function demoDraw(ctx) {
    const R = RN();
    if (!demo.cam) demo.cam = R.newCam();
    if (!demo.level.theme) demoSetTheme();
    R.world(ctx, demo.run, demo.level, demo.cam, FX());
  }

  // ===== 작은 아이콘 =====
  function lockIcon(ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(0, -8, 10, Math.PI, 0); ctx.lineTo(10, 0); ctx.moveTo(-10, 0); ctx.lineTo(-10, -8);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    RN().rr(ctx, -15, -2, 30, 24, 5); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 8, 3.5, 0, TAU); ctx.fillStyle = '#05060f'; ctx.fill();
    ctx.restore();
  }
  function coinSlot(ctx, x, y, r, got, pop) {
    const R = RN();
    ctx.save(); ctx.translate(x, y);
    const s = got ? 1 + 0.25 * (pop || 0) : 1; ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    if (got) { ctx.fillStyle = '#ffcf3d'; ctx.fill(); ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 2; ctx.stroke(); R.starPath(ctx, 0, 0, r * 0.55, r * 0.24, 5); ctx.fillStyle = '#fff6c0'; ctx.fill(); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,207,61,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }
  function stars(ctx, x, y, n, total, size, col) {
    const R = RN();
    const gap = size * 1.15, x0 = x - (total - 1) * gap / 2;
    for (let i = 0; i < total; i++) {
      R.starPath(ctx, x0 + i * gap, y, size / 2, size / 4.6, 5);
      if (i < n) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
  }
  function gearIcon(ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 9 : 12; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function backIcon(ctx, x, y, col) {
    ctx.beginPath(); ctx.moveTo(x + 5, y - 9); ctx.lineTo(x - 5, y); ctx.lineTo(x + 5, y + 9);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
  }
  function pauseIcon(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x - 8, y - 10, 6, 20); ctx.fillRect(x + 2, y - 10, 6, 20); }

  // ======================================================================
  // ===== TITLE =====
  // ======================================================================
  const title = { t: 0 };
  G.scenes.title = {
    enter() {
      title.t = 0;
      if (FX()) FX().clear();
      demoSetTheme();
      menuMusic();
    },
    update(dt) { common(dt); title.t += dt; demoUpdate(dt); },
    draw(ctx) {
      const R = RN(); uiBegin();
      demoDraw(ctx);
      ctx.fillStyle = 'rgba(4,5,16,0.35)'; ctx.fillRect(0, 0, W, H);
      vignette(ctx, 0.6);
      const t = title.t, bt = R.beat({ bpm: 100 });
      // 로고 (글자별 낙하)
      const word = 'NEON DASH', size = 92;
      ctx.font = '900 ' + size + 'px ' + G.FONT;
      const total = ctx.measureText(word).width;
      let x = W / 2 - total / 2;
      const ly = 150;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i], cw = ctx.measureText(ch).width;
        const k = eob((t - 0.08 * i) / 0.5);
        if (k > 0 && ch !== ' ') {
          const yy = ly - (1 - k) * 120 + Math.sin(t * 3 + i * 0.6) * 3;
          ctx.save(); ctx.globalAlpha = clamp(k, 0, 1);
          // RGB 어긋남
          ctx.globalCompositeOperation = 'lighter';
          R.txt(ctx, ch, x + cw / 2 - 3 - bt.pulse * 3, yy, size, 'rgba(255,61,242,0.55)', { align: 'center' });
          R.txt(ctx, ch, x + cw / 2 + 3 + bt.pulse * 3, yy, size, 'rgba(41,240,255,0.55)', { align: 'center' });
          ctx.globalCompositeOperation = 'source-over';
          R.glowText(ctx, ch, x + cw / 2, yy, size, i < 4 ? '#29f0ff' : '#ff3df2', { glow: 0.8 + bt.pulse * 0.4 });
          ctx.restore();
        }
        x += cw;
      }
      const sk = eoc((t - 0.8) / 0.5);
      ctx.globalAlpha = sk;
      R.glowText(ctx, '「네온 대시」', W / 2, ly + 78, 30, '#ffffff', { glow: 0.4, weight: 800 });
      ctx.fillStyle = 'rgba(255,61,242,0.9)'; ctx.fillRect(W / 2 - 150 * sk, ly + 104, 300 * sk, 2);
      ctx.globalAlpha = 1;
      // 터치해서 시작
      if (t > 1.1) {
        const pa = 0.55 + 0.45 * Math.sin(t * 4.2);
        const sc = 1 + bt.pulse * 0.06;
        ctx.save(); ctx.translate(W / 2, 352); ctx.scale(sc, sc); ctx.globalAlpha = pa;
        R.rr(ctx, -200, -28, 400, 56, 28); ctx.fillStyle = 'rgba(5,6,20,0.65)'; ctx.fill();
        R.neonStroke(ctx, '#29f0ff', 2);
        R.glowText(ctx, '화면을 터치해서 시작', 0, 1, 26, '#ffffff', { glow: 0.6 });
        ctx.restore();
        R.txt(ctx, 'PC: 스페이스 · ↑ · 클릭 = 점프   공중에서 한 번 더 = 2단 점프', W / 2, 400, 14, 'rgba(255,255,255,0.65)', { weight: 600 });
      }
      const sd = G.save && G.save.data;
      if (sd && sd.totalAttempts) R.txt(ctx, '총 시도 ' + sd.totalAttempts + '회', W - 20, H - 18, 14, 'rgba(255,255,255,0.5)', { align: 'right', weight: 600 });
      R.txt(ctx, 'v1', 20, H - 18, 12, 'rgba(255,255,255,0.35)', { align: 'left', weight: 600 });
      post(ctx);
    },
    down(x, y) {
      if (busy() || G.portrait) return;
      menuMusic();
      if (title.t < 0.3) return;
      A.sfx('click');
      if (FX()) FX().uiBurst(x, y, '#29f0ff', 14);
      nav('select');
    },
    up() {},
    key(code, down) {
      if (!down || busy()) return;
      if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') { menuMusic(); A.sfx('click'); nav('select'); }
    },
  };

  // ======================================================================
  // ===== SELECT =====
  // ======================================================================
  const sel = { t: 0, practice: false, settings: false, setT: 0, focus: 0, shake: {} };
  function playLevel(i) {
    if (!unlocked(i)) { A.sfx('back'); sel.shake[i] = 0.4; G.vibrate && G.vibrate(30); return; }
    A.sfx('click');
    nav('play', { level: i, practice: sel.practice });
  }
  function toggleSetting(key) {
    const d = G.save && G.save.data;
    if (!d) return;
    d[key] = !d[key];
    persist();
    A.sfx('click');
    if (key === 'music') { if (d.music) menuMusic(); else A.stop(); }
    if (key === 'haptics' && d.haptics) G.vibrate && G.vibrate(25);
  }
  function toggleRow(ctx, id, x, y, w, label, on, onClick) {
    const R = RN();
    const a = region(id, x, y, w, 52, onClick);
    ctx.save();
    R.rr(ctx, x, y, w, 52, 12); ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + a.h * 0.04) + ')'; ctx.fill();
    R.txt(ctx, label, x + 20, y + 26, 20, '#ffffff', { align: 'left', weight: 700 });
    const sx = x + w - 84, sy = y + 12;
    R.rr(ctx, sx, sy, 64, 28, 14); ctx.fillStyle = on ? 'rgba(61,255,176,0.35)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    R.neonStroke(ctx, on ? '#3dffb0' : '#666a88', 1.5);
    const kx = sx + (on ? 50 : 14);
    ctx.beginPath(); ctx.arc(kx, sy + 14, 10, 0, TAU); ctx.fillStyle = on ? '#3dffb0' : '#9aa0c0'; ctx.fill();
    R.txt(ctx, on ? 'ON' : 'OFF', sx - 12, y + 26, 13, on ? '#3dffb0' : '#9aa0c0', { align: 'right', weight: 800 });
    ctx.restore();
  }
  function drawCard(ctx, i, x, y, w, h, a) {
    const R = RN();
    const lv = levels()[i];
    const th = Object.assign({}, R.DEFAULT_THEME, lv.theme || {});
    const sv = lvSave(lv);
    const lock = !unlocked(i);
    const focus = sel.focus === i;
    ctx.save();
    const sh = sel.shake[i] > 0 ? Math.sin(sel.shake[i] * 60) * 8 * sel.shake[i] : 0;
    const s = 1 - a.k * 0.05 + a.h * 0.04 + (focus ? 0.02 : 0);
    ctx.translate(x + w / 2 + sh, y + h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
    // 판
    R.rr(ctx, 0, 0, w, h, 18);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, R.mix(th.bg2, '#000000', 0.1)); g.addColorStop(1, R.mix(th.bg, '#000000', 0.45));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); R.rr(ctx, 0, 0, w, h, 18); ctx.clip();
    // 상단 장식: 테마 그라데이션 밴드 + 미니 산
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, R.rgba(th.accent, 0.5)); bg.addColorStop(1, R.rgba(th.accent2, 0.5));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, 70);
    ctx.beginPath(); ctx.moveTo(0, 70);
    for (let k = 0; k <= 8; k++) ctx.lineTo(k * w / 8, 70 - 12 - Math.abs(Math.sin(k * 1.7 + i)) * 26);
    ctx.lineTo(w, 70); ctx.closePath(); ctx.fillStyle = R.rgba(th.bg, 0.8); ctx.fill();
    ctx.restore();
    R.rr(ctx, 0, 0, w, h, 18);
    R.neonStroke(ctx, lock ? '#555a7a' : (focus ? '#ffffff' : th.accent), 2 + a.h + (focus ? 0.5 : 0), !lock);
    R.txt(ctx, 'LEVEL ' + (i + 1), 16, 22, 14, '#ffffff', { align: 'left', weight: 800, stroke: 3 });
    if (sv.done) { R.rr(ctx, w - 70, 12, 58, 22, 11); ctx.fillStyle = '#3dffb0'; ctx.fill(); R.txt(ctx, 'CLEAR', w - 41, 23, 12, '#04140c', { weight: 900 }); }
    R.glowText(ctx, lv.name || lv.id, w / 2, 98, 22, '#ffffff', { glow: 0.4, weight: 800 });
    // 난이도
    const dc = DIFF_COL[Math.min(4, i)];
    stars(ctx, w / 2, 130, i + 1, 5, 18, dc);
    R.txt(ctx, DIFF[Math.min(4, i)], w / 2, 154, i === 4 ? 17 : 14, dc, { weight: 900, stroke: i === 4 ? 3 : 0 });
    // 최고 %
    const best = sel.practice ? (sv.practiceBest || 0) : (sv.best || 0);
    R.glowText(ctx, best + '%', w / 2, 194, 40, sel.practice ? '#5dff7a' : '#ffffff', { glow: 0.5 });
    R.rr(ctx, 18, 222, w - 36, 8, 4); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    if (best > 0) { R.rr(ctx, 18, 222, (w - 36) * best / 100, 8, 4); ctx.fillStyle = sel.practice ? '#5dff7a' : th.accent; ctx.fill(); }
    R.txt(ctx, (sel.practice ? '연습 최고' : '최고 기록') + ' · 시도 ' + (sv.attempts || 0), w / 2, 244, 12, 'rgba(255,255,255,0.65)', { weight: 700, maxW: w - 16 });
    // 코인
    for (let c = 0; c < 3; c++) coinSlot(ctx, w / 2 - 30 + c * 30, 274, 10, sv.coins && sv.coins[c]);
    if (lock) {
      R.rr(ctx, 0, 0, w, h, 18); ctx.fillStyle = 'rgba(3,4,12,0.88)'; ctx.fill();
      lockIcon(ctx, w / 2, h / 2 - 20, 1.6, '#9aa0c0');
      R.txt(ctx, '이전 레벨 클리어 시 해금', w / 2, h / 2 + 40, 13, '#9aa0c0', { weight: 700, maxW: w - 12 });
    }
    ctx.restore();
  }
  G.scenes.select = {
    enter(p) {
      sel.t = 0; sel.settings = false; sel.setT = 0;
      if (p && p.practice != null) sel.practice = !!p.practice;
      const L = levels();
      if (p && p.focus != null) sel.focus = p.focus;
      else { let f = 0; for (let i = 0; i < L.length; i++) if (unlocked(i)) f = i; sel.focus = f; }
      demoSetTheme(L[sel.focus] && L[sel.focus].theme);
      if (FX()) FX().clear();
      menuMusic();
    },
    update(dt) {
      common(dt); sel.t += dt; demoUpdate(dt * 0.6);
      sel.setT = clamp(sel.setT + (sel.settings ? dt : -dt) * 5, 0, 1);
      for (const k in sel.shake) sel.shake[k] = Math.max(0, sel.shake[k] - dt);
    },
    draw(ctx) {
      const R = RN(); uiBegin();
      demoDraw(ctx);
      ctx.fillStyle = 'rgba(4,5,16,0.6)'; ctx.fillRect(0, 0, W, H);
      vignette(ctx, 0.5);
      const t = sel.t;
      // 헤더
      const hk = eoc(t / 0.4);
      ctx.save(); ctx.translate(0, (1 - hk) * -60);
      button(ctx, 'back', 16, 16, 52, 48, '', () => { A.sfx('back'); nav('title'); }, { icon: backIcon, r: 14 });
      R.glowText(ctx, '레벨 선택', 90, 41, 30, '#ffffff', { align: 'left', glow: 0.5 });
      // 연습 모드 토글
      const px = W - 300, pw = 210;
      const pa = region('practice', px, 16, pw, 48, () => {
        sel.practice = !sel.practice; A.sfx('click');
        if (FX()) FX().uiBurst(px + pw - 30, 40, sel.practice ? '#5dff7a' : '#29f0ff', 10);
      });
      R.rr(ctx, px, 16, pw, 48, 24); ctx.fillStyle = sel.practice ? 'rgba(93,255,122,0.2)' : 'rgba(8,10,30,0.82)'; ctx.fill();
      R.neonStroke(ctx, sel.practice ? '#5dff7a' : '#6a70a0', 1.5 + pa.h);
      R.txt(ctx, '연습 모드', px + 22, 40, 18, sel.practice ? '#5dff7a' : '#c0c4e0', { align: 'left', weight: 800 });
      R.rr(ctx, px + pw - 66, 26, 50, 28, 14); ctx.fillStyle = sel.practice ? '#5dff7a' : 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px + pw - (sel.practice ? 30 : 52), 40, 10, 0, TAU); ctx.fillStyle = sel.practice ? '#04140c' : '#9aa0c0'; ctx.fill();
      button(ctx, 'gear', W - 76, 16, 60, 48, '', () => { sel.settings = true; A.sfx('click'); }, { icon: gearIcon, r: 14 });
      ctx.restore();
      // 카드
      const L = levels();
      if (!L.length) {
        R.glowText(ctx, '레벨 데이터를 불러오지 못했어요', W / 2, H / 2, 24, '#ff3df2');
      } else {
        const n = L.length, cw = 172, gap = 12, total = n * cw + (n - 1) * gap;
        const sx = W / 2 - total / 2, cy = 100, ch = 300;
        for (let i = 0; i < n; i++) {
          const k = eob((t - 0.1 - i * 0.07) / 0.5);
          if (k <= 0) continue;
          const x = sx + i * (cw + gap), y = cy + (1 - k) * 260;
          const a = region('card' + i, x, y, cw, ch, () => { sel.focus = i; playLevel(i); }, { disabled: sel.settings });
          ctx.save(); ctx.globalAlpha = clamp(k, 0, 1);
          drawCard(ctx, i, x, y, cw, ch, a);
          ctx.restore();
        }
        if (sel.practice) R.txt(ctx, '연습 모드: 3초마다 자동 체크포인트 · 기록은 연습 최고에만 저장', W / 2, 424, 14, '#5dff7a', { weight: 700 });
      }
      // 하단 합계
      const sd = G.save && G.save.data;
      if (sd && L.length) {
        let clr = 0, coins = 0;
        for (const lv of L) { const s = lvSave(lv); if (s.done) clr++; coins += (s.coins || []).filter(Boolean).length; }
        const fy = 470, ft = eoc((t - 0.5) / 0.4);
        ctx.globalAlpha = ft;
        R.rr(ctx, W / 2 - 260, fy - 22, 520, 44, 22); ctx.fillStyle = 'rgba(8,10,30,0.75)'; ctx.fill();
        R.txt(ctx, '클리어 ' + clr + '/' + L.length + '     코인 ' + coins + '/' + (L.length * 3) + '     총 시도 ' + (sd.totalAttempts || 0), W / 2, fy, 16, '#ffffff', { weight: 700 });
        ctx.globalAlpha = 1;
      }
      // 설정 패널
      if (sel.setT > 0) {
        const k = eob(sel.setT);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * sel.setT) + ')'; ctx.fillRect(0, 0, W, H);
        region('setdim', 0, 0, W, H, () => { sel.settings = false; A.sfx('back'); });
        const pw = 420, ph = 330, px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - k) * 80;
        ctx.save(); ctx.globalAlpha = sel.setT;
        region('setpanel', px, py, pw, ph, null);
        R.rr(ctx, px, py, pw, ph, 22); ctx.fillStyle = 'rgba(10,12,34,0.97)'; ctx.fill();
        R.neonStroke(ctx, '#ff3df2', 2, true);
        R.glowText(ctx, '설정', W / 2, py + 40, 28, '#ffffff', { glow: 0.5 });
        const d = (G.save && G.save.data) || {};
        toggleRow(ctx, 'tsfx', px + 30, py + 76, pw - 60, '효과음', d.sfx !== false, () => toggleSetting('sfx'));
        toggleRow(ctx, 'tmus', px + 30, py + 136, pw - 60, '음악', d.music !== false, () => toggleSetting('music'));
        toggleRow(ctx, 'tvib', px + 30, py + 196, pw - 60, '진동', d.haptics !== false, () => toggleSetting('haptics'));
        button(ctx, 'setclose', W / 2 - 90, py + ph - 66, 180, 48, '닫기', () => { sel.settings = false; A.sfx('back'); }, { primary: true, color: '#ff3df2' });
        ctx.restore();
      }
      post(ctx);
    },
    down(x, y) { if (busy() || G.portrait) return; menuMusic(); uiDown(x, y); },
    up(x, y) { uiUp(x, y); },
    move(x, y) { uiMove(x, y); },
    key(code, down) {
      if (!down || busy()) return;
      const n = levels().length;
      if (sel.settings) { if (code === 'Escape') sel.settings = false; return; }
      if (code === 'ArrowRight' || code === 'KeyD') { sel.focus = Math.min(n - 1, sel.focus + 1); A.sfx('tick'); }
      else if (code === 'ArrowLeft' || code === 'KeyA') { sel.focus = Math.max(0, sel.focus - 1); A.sfx('tick'); }
      else if (code === 'Enter' || code === 'Space') playLevel(sel.focus);
      else if (code === 'Escape' || code === 'Backspace') { A.sfx('back'); nav('title'); }
      else if (code === 'KeyP') { sel.practice = !sel.practice; A.sfx('click'); }
      else if (/^Digit[1-9]$/.test(code)) { const i = +code.slice(5) - 1; if (i < n) { sel.focus = i; playLevel(i); } }
    },
  };

  // ======================================================================
  // ===== PLAY =====
  // ======================================================================
  const RESTART = 0.4, CP_EVERY = 3;
  const PAUSE_BTN = { x: W - 66, y: 8, w: 56, h: 50 };
  const pl = {
    li: 0, level: null, practice: false, run: null, cam: null, err: null,
    attempt: 0, sessionAttempts: 0, deadT: -1, death: null, paused: false, pauseT: 0,
    checkpoints: [], cpTimer: 0, completeT: -1, result: null, layer: -1, pctShown: 0,
    jumps: 0, fwT: 0, coinPop: [0, 0, 0], runStart: 0,
  };
  const track = () => (pl.level && (pl.level.track || pl.level.id)) || 'lv1';
  const center = st => { const s = (G.PHYS && G.PHYS.size) || 34; return { x: st.x + s / 2, y: st.y + s / 2 }; };

  function startAttempt() {
    const R = RN();
    const lv = pl.level;
    const cp = pl.practice && pl.checkpoints.length ? pl.checkpoints[pl.checkpoints.length - 1] : null;
    try {
      pl.run = G.Engine.create(lv, cp ? { startX: cp.x, startY: cp.y } : { startX: 0 });
    } catch (e) { pl.err = '엔진 오류: ' + (e && e.message); console.error(e); return; }
    if (!pl.cam) pl.cam = R.newCam();
    R.updateCam(pl.cam, pl.run, 0, true);
    pl.deadT = -1; pl.completeT = -1; pl.cpTimer = 0; pl.layer = -1; pl.fwT = 0;
    pl.runStart = pl.run.state.x;
    if (!pl.practice) {
      const sv = lvSave(lv);
      sv.attempts = (sv.attempts || 0) + 1;
      if (G.save && G.save.data) G.save.data.totalAttempts = (G.save.data.totalAttempts || 0) + 1;
      persist();
      pl.attempt = sv.attempts;
    } else { pl.sessionAttempts++; pl.attempt = pl.sessionAttempts; }
    pl.cam.attempt = pl.attempt;
    pl.cam.attemptX = pl.run.state.x;
    pl.cam.checkpoints = pl.practice ? pl.checkpoints : null;
    pl.cam.coinGhost = true;
    // 음악: 처음부터(연습이면 체크포인트 시간부터). state.t = startX/speed
    if (!G.save || !G.save.data || G.save.data.music !== false) {
      A.duck(false);
      A.layer(0); // start 전에: 새 곡 노드가 레이어 0으로 생성되게(이전 판의 레이어 3이 잠깐 울리는 것 방지)
      A.start(track(), pl.run.state.t || 0);
    }
    if (cp && FX()) { const c = center(pl.run.state); FX().respawn(c.x, c.y); }
  }
  // 연습 체크포인트 후보가 '부활 직후 반응할 틈 없이 죽는' 자리인지 검사:
  // 그 자리에서 입력 없이 CP_SAFE초 동안 살아남아야 체크포인트로 인정(아니면 다음 프레임에 재시도)
  const CP_SAFE = 0.35;
  function cpSafe(st) {
    try {
      const r = G.Engine.create(pl.level, { startX: st.x, startY: st.y, quiet: true });
      const n = Math.ceil(CP_SAFE / ((G.PHYS && G.PHYS.step) || 1 / 240));
      for (let i = 0; i < n; i++) { r.step(); if (r.state.dead) return false; if (r.state.done) break; }
    } catch (e) { /* 검사 실패 시 그냥 허용 */ }
    return true;
  }
  function setLayer() {
    const p = pl.run ? pl.run.state.progress || 0 : 0;
    const n = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : 3;
    if (n !== pl.layer) { pl.layer = n; A.layer(n); }
  }
  function onDeath() {
    if (pl.deadT >= 0) return;
    pl.deadT = 0;
    const st = pl.run.state, c = center(st);
    const pct = Math.floor((st.progress || 0) * 100);
    if (FX()) FX().death(c.x, c.y, RN().PLAYER_COL);
    A.sfx('die');
    A.stop();
    G.vibrate && G.vibrate([35, 25, 45]);
    const sv = lvSave(pl.level);
    let nb = false;
    if (!pl.practice) { if (pct > (sv.best || 0)) { sv.best = pct; nb = true; } }
    else if (pct > (sv.practiceBest || 0)) { sv.practiceBest = pct; nb = true; }
    if (G.save && G.save.data) { G.save.data.totalJumps = (G.save.data.totalJumps || 0) + pl.jumps; }
    pl.jumps = 0;
    persist();
    pl.death = { pct, nb, t: 0 };
    if (nb && pct > 0) setTimeout(() => A.sfx('newbest'), 120);
  }
  function onComplete() {
    if (pl.completeT >= 0) return;
    pl.completeT = 0;
    const st = pl.run.state;
    const f = FX();
    if (f) { f.slowmo(0.35, 1.1); f.flash('#ffffff', 0.55); f.punch(0.06); f.shake(0.3); for (let i = 0; i < 3; i++) f.firework(200 + i * 280, 140 + (i % 2) * 60); }
    A.sfx('complete');
    A.layer(3);
    G.vibrate && G.vibrate([40, 30, 90]);
    const sv = lvSave(pl.level);
    const time = st.t || (st.x / (pl.level.speed || 400));
    const firstClear = !pl.practice && !sv.done;
    const newCoins = [false, false, false];
    if (!pl.practice) {
      sv.done = true; sv.best = 100;
      if (!sv.coins) sv.coins = [false, false, false];
      for (let i = 0; i < 3; i++) if (st.coins && st.coins[i] && !sv.coins[i]) { sv.coins[i] = true; newCoins[i] = true; }
      if (sv.bestTime == null || time < sv.bestTime) sv.bestTime = time;
    } else sv.practiceBest = 100;
    if (G.save && G.save.data) G.save.data.totalJumps = (G.save.data.totalJumps || 0) + pl.jumps;
    pl.jumps = 0;
    persist();
    pl.result = {
      level: pl.li, attempts: pl.attempt, time, practice: pl.practice, firstClear,
      coins: (st.coins || [false, false, false]).slice(), newCoins, savedCoins: (sv.coins || []).slice(),
      bestTime: sv.bestTime,
    };
  }
  function processEvents() {
    const run = pl.run, ev = run.events;
    if (!ev || !ev.length) return;
    const f = FX(), R = RN(), st = run.state, S = (G.PHYS && G.PHYS.size) || 34;
    const th = (pl.level && pl.level.theme) || R.DEFAULT_THEME;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      const ex = (e.x != null ? e.x : st.x) + S / 2, ey = e.y != null ? e.y : st.y;
      switch (e.type) {
        case 'jump': A.sfx('jump'); pl.jumps++; f && f.jumpRing(ex, ey, R.PLAYER_COL); break;
        case 'djump': A.sfx('djump'); pl.jumps++; f && f.doubleJumpSparkle(ex, ey + S / 2); break;
        case 'land': A.sfx('land'); f && f.landDust(ex, ey, th.accent, 0.8); break;
        case 'orb': A.sfx('orb'); f && f.orbBurst(e.ox != null ? e.ox : ex, e.oy != null ? e.oy : ey + S / 2); G.vibrate && G.vibrate(10); break;
        case 'pad': A.sfx('pad'); f && f.padBurst(e.ox != null ? e.ox : ex, e.oy != null ? e.oy : ey); G.vibrate && G.vibrate(10); break;
        case 'coin': {
          A.sfx('coin'); f && f.coin(e.ox != null ? e.ox : ex, e.oy != null ? e.oy : ey + S / 2); G.vibrate && G.vibrate(25);
          if (e.i != null && e.i < 3) pl.coinPop[e.i] = 1;
          break;
        }
        case 'nearmiss': f && f.nearMiss(ex, ey + S / 2); A.sfx('nearmiss', { combo: f ? Math.max(0, f.combo - 1) : 0 }); G.vibrate && G.vibrate(8); break;
        case 'die': onDeath(); break;
        case 'complete': onComplete(); break;
      }
    }
    ev.length = 0;
  }
  function pause() {
    if (pl.paused || pl.err || !pl.run || pl.completeT >= 0) return;
    pl.paused = true; pl.pauseT = 0;
    A.sfx('click');
    A.stop();
  }
  function resume() {
    if (!pl.paused) return;
    pl.paused = false;
    A.sfx('click');
    if (pl.run && !pl.run.state.dead && (!G.save || !G.save.data || G.save.data.music !== false)) {
      A.start(track(), pl.run.state.t || 0);
      pl.layer = -1; setLayer();
    }
  }
  function restartFromPause(practice) {
    pl.paused = false;
    if (practice != null) pl.practice = practice;
    pl.checkpoints = [];
    pl.death = null;
    if (FX()) FX().clear();
    A.sfx('click');
    startAttempt();
  }

  function drawHud(ctx) {
    const R = RN();
    const st = pl.run.state, lv = pl.level, sv = lvSave(lv);
    const th = Object.assign({}, R.DEFAULT_THEME, lv.theme || {});
    const p = st.progress || 0;
    pl.pctShown += (p - pl.pctShown) * 0.3;
    // 진행 바
    const bx = 250, bw = W - 500, by = 18, bh = 8;
    R.rr(ctx, bx - 3, by - 3, bw + 6, bh + 6, 7); ctx.fillStyle = 'rgba(4,5,16,0.65)'; ctx.fill();
    R.rr(ctx, bx, by, bw, bh, 4); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    if (pl.pctShown > 0.002) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, pl.practice ? '#5dff7a' : th.accent); g.addColorStop(1, pl.practice ? '#c8ff5d' : th.accent2);
      R.rr(ctx, bx, by, Math.max(bh, bw * pl.pctShown), bh, 4); ctx.fillStyle = g; ctx.fill();
      R.glow(ctx, bx + bw * pl.pctShown, by + bh / 2, 0.22, '#ffffff', 0.7);
    }
    const best = (pl.practice ? sv.practiceBest : sv.best) || 0;
    if (best > 0 && best < 100) {
      const mx = bx + bw * best / 100;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1, by - 6, 2, bh + 12);
      R.txt(ctx, 'BEST', mx, by + bh + 14, 9, 'rgba(255,255,255,0.75)', { weight: 800 });
    }
    if (pl.practice) {
      ctx.fillStyle = '#5dff7a';
      for (const c of pl.checkpoints) { const cx = bx + bw * clamp(c.x / (lv.length || 1), 0, 1); ctx.save(); ctx.translate(cx, by + bh / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
    }
    R.glowText(ctx, Math.floor(p * 100) + '%', bx + bw + 46, by + 4, 22, '#ffffff', { glow: 0.4 });
    // 좌상단: 시도
    R.txt(ctx, (pl.practice ? 'PRACTICE ' : 'ATTEMPT ') + pl.attempt, 18, 22, 18, pl.practice ? '#5dff7a' : '#ffffff', { align: 'left', weight: 900, stroke: 4 });
    R.txt(ctx, lv.name || lv.id, 18, 44, 13, 'rgba(255,255,255,0.65)', { align: 'left', weight: 700, stroke: 3 });
    for (let i = 0; i < 3; i++) {
      pl.coinPop[i] = Math.max(0, pl.coinPop[i] - lastDt * 2.5);
      const got = st.coins && st.coins[i];
      if (!got && sv.coins && sv.coins[i]) { ctx.globalAlpha = 0.35; coinSlot(ctx, 26 + i * 24, 68, 8, true); ctx.globalAlpha = 1; }
      else coinSlot(ctx, 26 + i * 24, 68, 8, got, pl.coinPop[i]);
    }
    // 일시정지 버튼
    const b = PAUSE_BTN;
    R.rr(ctx, b.x + 6, b.y + 4, b.w - 12, b.h - 8, 12); ctx.fillStyle = 'rgba(4,5,16,0.55)'; ctx.fill();
    R.neonStroke(ctx, '#ffffff', 1.5);
    pauseIcon(ctx, b.x + b.w / 2, b.y + b.h / 2, '#ffffff');
  }
  function drawDeathInfo(ctx) {
    const d = pl.death;
    if (!d) return;
    d.t += lastDt;
    if (d.t > 1.0) { pl.death = null; return; }
    const R = RN();
    const k = eob(d.t / 0.22), a = d.t < 0.7 ? 1 : 1 - (d.t - 0.7) / 0.3;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, H / 2 - 40); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    R.glowText(ctx, d.pct + '%', 0, 0, 104, d.nb ? '#ffe14d' : '#ffffff', { glow: 0.9 });
    if (d.nb && d.pct > 0) {
      const k2 = eob((d.t - 0.08) / 0.25);
      ctx.save(); ctx.translate(0, 74); ctx.rotate(-0.05 + Math.sin(d.t * 18) * 0.03); ctx.scale(k2, k2);
      const hue = ['#ff3df2', '#29f0ff', '#ffe14d', '#3dffb0'][Math.floor(d.t * 14) % 4];
      R.glowText(ctx, pl.practice ? '연습 최고 기록!' : 'NEW BEST!', 0, 0, 44, hue, { glow: 1 });
      ctx.restore();
    }
    ctx.restore();
  }
  function drawPause(ctx) {
    const R = RN();
    pl.pauseT += lastDt;
    const k = eob(pl.pauseT / 0.3);
    ctx.fillStyle = 'rgba(3,4,14,' + (0.7 * clamp(pl.pauseT / 0.15, 0, 1)) + ')'; ctx.fillRect(0, 0, W, H);
    region('pdim', 0, 0, W, H, null);
    const pw = 440, ph = 400, px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - k) * 60;
    R.rr(ctx, px, py, pw, ph, 24); ctx.fillStyle = 'rgba(10,12,34,0.96)'; ctx.fill();
    R.neonStroke(ctx, '#29f0ff', 2, true);
    R.glowText(ctx, '일시정지', W / 2, py + 44, 32, '#ffffff', { glow: 0.6 });
    const st = pl.run.state;
    R.txt(ctx, (pl.level.name || '') + ' · ' + Math.floor((st.progress || 0) * 100) + '%' + (pl.practice ? ' · 연습' : ''), W / 2, py + 82, 15, 'rgba(255,255,255,0.7)', { weight: 700 });
    const bx = px + 50, bw2 = pw - 100;
    button(ctx, 'p_resume', bx, py + 108, bw2, 56, '계속', resume, { primary: true, color: '#29f0ff', size: 24 });
    button(ctx, 'p_restart', bx, py + 176, bw2, 50, '처음부터', () => restartFromPause(), { color: '#ffffff' });
    button(ctx, 'p_practice', bx, py + 238, bw2, 50, pl.practice ? '연습 모드 끄기' : '연습 모드로 전환', () => restartFromPause(!pl.practice), { color: '#5dff7a' });
    button(ctx, 'p_select', bx, py + 300, bw2, 50, '레벨 선택', () => { A.sfx('back'); A.stop(); nav('select', { practice: pl.practice, focus: pl.li }); }, { color: '#ff3df2' });
  }

  G.scenes.play = {
    enter(p) {
      p = p || {};
      const L = levels();
      pl.li = typeof p.level === 'number' ? p.level : Math.max(0, L.findIndex(l => l.id === p.level));
      pl.level = L[pl.li] || null;
      pl.practice = !!p.practice;
      pl.paused = false; pl.err = null; pl.death = null; pl.checkpoints = []; pl.sessionAttempts = 0; pl.result = null; pl.jumps = 0;
      pl.cam = RN().newCam(); pl.pctShown = 0; pl.run = null;
      if (FX()) FX().clear();
      if (!pl.level) { pl.err = '레벨 데이터를 찾을 수 없어요'; return; }
      if (!G.Engine || !G.Engine.create) { pl.err = '엔진을 불러오지 못했어요'; return; }
      startAttempt();
    },
    update(dt) {
      common(dt);
      if (pl.err || !pl.run) return;
      if (G.portrait && !pl.paused && pl.completeT < 0 && !pl.run.state.dead) pause();
      if (pl.paused) return;
      const f = FX();
      const ts = f ? f.timeScale() : 1;
      const st = pl.run.state;
      if (!st.dead) {
        try { pl.run.update(dt * ts); } catch (e) { pl.err = '엔진 오류: ' + (e && e.message); console.error(e); return; }
      }
      processEvents();
      if (st.dead && pl.deadT < 0) onDeath();
      if (st.done && pl.completeT < 0) onComplete();
      RN().updateCam(pl.cam, pl.run, dt * Math.max(ts, 0.25));
      setLayer();
      // 연습 체크포인트
      if (pl.practice && !st.dead && !st.done && st.grounded) {
        pl.cpTimer += dt * ts;
        const last = pl.checkpoints[pl.checkpoints.length - 1];
        if (pl.cpTimer >= CP_EVERY && (!last || st.x - last.x > 300) && cpSafe(st)) {
          pl.cpTimer = 0;
          pl.checkpoints.push({ x: st.x, y: st.y });
          if (pl.checkpoints.length > 60) pl.checkpoints.shift();
          const c = center(st);
          if (f) f.checkpoint(c.x, c.y + 50);
          A.sfx('checkpoint');
        }
      }
      // 사망 → 자동 재시작
      if (pl.deadT >= 0) {
        pl.deadT += dt;
        if (pl.deadT >= RESTART) startAttempt();
      }
      // 클리어 → 불꽃 → complete
      if (pl.completeT >= 0) {
        pl.completeT += dt;
        pl.fwT -= dt;
        if (pl.fwT <= 0 && f) { pl.fwT = 0.18; f.firework(G.rand ? G.rand(120, W - 120) : W / 2, G.rand ? G.rand(70, 260) : 150); }
        if (pl.completeT >= 2.0 && !busy()) nav('complete', pl.result);
      }
    },
    draw(ctx) {
      const R = RN(); uiBegin();
      if (pl.err || !pl.run) {
        ctx.fillStyle = '#070a1c'; ctx.fillRect(0, 0, W, H);
        R.glowText(ctx, pl.err || '로딩 중…', W / 2, H / 2 - 40, 26, '#ff3df2');
        button(ctx, 'err_back', W / 2 - 110, H / 2 + 20, 220, 54, '레벨 선택', () => nav('select'), { primary: true, color: '#29f0ff' });
        post(ctx);
        return;
      }
      R.world(ctx, pl.run, pl.level, pl.cam, FX());
      drawHud(ctx);
      drawDeathInfo(ctx);
      if (pl.completeT >= 0) {
        const k = eob(pl.completeT / 0.4);
        ctx.save(); ctx.translate(W / 2, H / 2 - 50); ctx.scale(k, k); ctx.rotate(-0.04);
        R.glowText(ctx, pl.practice ? 'PRACTICE CLEAR!' : 'LEVEL COMPLETE!', 0, 0, 64, '#ffe14d', { glow: 1 });
        ctx.restore();
      }
      if (pl.paused) drawPause(ctx);
      post(ctx);
    },
    down(x, y) {
      if (busy() || G.portrait) return;
      if (pl.err || pl.paused) { uiDown(x, y); return; }
      const b = PAUSE_BTN;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { pause(); return; }
      if (!pl.run || pl.run.state.dead || pl.run.state.done) return;
      pl.run.press();
    },
    up(x, y) { uiUp(x, y); },
    move(x, y) { uiMove(x, y); },
    key(code, down) {
      if (!down || busy()) return;
      if (code === 'Escape' || code === 'KeyP') { if (pl.paused) resume(); else pause(); return; }
      if (pl.paused) { if (code === 'Enter') resume(); return; }
      if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        if (pl.run && !pl.run.state.dead && !pl.run.state.done) pl.run.press();
      }
    },
    visibility(visible) { if (!visible) pause(); },
  };

  // ======================================================================
  // ===== COMPLETE =====
  // ======================================================================
  const cp = { r: null, t: 0, fw: 0, card: null, cardBlob: null, musicT: 0 };
  function cardCanvas(r) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const R = RN();
    const lv = levels()[r.level] || {};
    const th = Object.assign({}, R.DEFAULT_THEME, lv.theme || {});
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const g = c.getContext && c.getContext('2d');
    if (!g) return null;
    const bg = g.createLinearGradient(0, 0, 0, 630);
    bg.addColorStop(0, R.mix(th.bg, '#000000', 0.3)); bg.addColorStop(0.7, th.bg2); bg.addColorStop(1, th.bg);
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    // 태양 + 그리드
    const sg = g.createRadialGradient(900, 300, 0, 900, 300, 260);
    sg.addColorStop(0, R.rgba(th.accent2, 0.55)); sg.addColorStop(1, R.rgba(th.accent2, 0));
    g.fillStyle = sg; g.fillRect(600, 0, 600, 630);
    g.beginPath();
    for (let i = -20; i <= 20; i++) { g.moveTo(600 + i * 40, 470); g.lineTo(600 + i * 140, 630); }
    for (let j = 1; j < 6; j++) { const yy = 470 + 160 * Math.pow(j / 6, 1.7); g.moveTo(0, yy); g.lineTo(1200, yy); }
    g.strokeStyle = R.rgba(th.accent, 0.35); g.lineWidth = 2; g.stroke();
    g.beginPath(); g.moveTo(0, 470); g.lineTo(1200, 470); R.neonStroke(g, th.accent, 3, true);
    // 큐브
    g.save(); g.translate(960, 470); g.rotate(0); R.cube(g, 120, -0.2, 1, 1, { vy: 300 }); g.restore();
    // 글자
    R.glowText(g, 'NEON DASH', 70, 78, 46, '#29f0ff', { align: 'left', glow: 0.7 });
    R.txt(g, '「네온 대시」', 380, 80, 24, 'rgba(255,255,255,0.8)', { align: 'left', weight: 800 });
    R.glowText(g, r.practice ? 'PRACTICE CLEAR' : 'LEVEL COMPLETE', 70, 170, 34, '#ffe14d', { align: 'left', glow: 0.7 });
    R.glowText(g, 'LV' + (r.level + 1) + '  ' + (lv.name || ''), 70, 235, 54, '#ffffff', { align: 'left', glow: 0.5 });
    stars(g, 70 + 5 * 13, 290, r.level + 1, 5, 24, DIFF_COL[Math.min(4, r.level)]);
    R.txt(g, DIFF[Math.min(4, r.level)], 230, 291, 22, DIFF_COL[Math.min(4, r.level)], { align: 'left', weight: 900 });
    R.txt(g, '시도', 70, 360, 24, 'rgba(255,255,255,0.7)', { align: 'left', weight: 700 });
    R.glowText(g, String(r.attempts), 70, 420, 76, '#ffffff', { align: 'left', glow: 0.6 });
    R.txt(g, '시간', 340, 360, 24, 'rgba(255,255,255,0.7)', { align: 'left', weight: 700 });
    R.glowText(g, fmtTime(r.time), 340, 420, 54, '#ffffff', { align: 'left', glow: 0.5 });
    R.txt(g, '코인', 70, 520, 24, 'rgba(255,255,255,0.7)', { align: 'left', weight: 700 });
    for (let i = 0; i < 3; i++) {
      g.save(); g.translate(150 + i * 50, 520);
      g.beginPath(); g.arc(0, 0, 18, 0, TAU);
      const got = r.coins && r.coins[i];
      g.fillStyle = got ? '#ffcf3d' : 'rgba(255,255,255,0.08)'; g.fill();
      g.strokeStyle = got ? '#fff6c0' : 'rgba(255,207,61,0.5)'; g.lineWidth = 2; g.stroke();
      if (got) { R.starPath(g, 0, 0, 10, 4.5, 5); g.fillStyle = '#fff6c0'; g.fill(); }
      g.restore();
    }
    const d = new Date();
    R.txt(g, d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(), 1130, 600, 18, 'rgba(255,255,255,0.5)', { align: 'right', weight: 700 });
    return c;
  }
  function prepareCard() {
    cp.card = null; cp.cardBlob = null;
    try {
      const c = cardCanvas(cp.r);
      cp.card = c;
      if (c && c.toBlob) c.toBlob(b => { cp.cardBlob = b; }, 'image/png');
    } catch (e) { console.warn(e); }
  }
  function shareCard() {
    const r = cp.r;
    if (!cp.card) prepareCard();
    const name = 'neon-dash-' + ((levels()[r.level] || {}).id || 'lv') + '.png';
    const lvName = (levels()[r.level] || {}).name || '';
    const text = 'NEON DASH 「' + lvName + '」 ' + r.attempts + '번 만에 클리어!';
    const doDownload = blob => {
      try {
        const a = document.createElement('a');
        const url = blob ? URL.createObjectURL(blob) : cp.card.toDataURL('image/png');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        if (blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('기록 카드를 저장했어요');
      } catch (e) { toast('저장에 실패했어요'); }
    };
    const blob = cp.cardBlob;
    try {
      if (blob && typeof File !== 'undefined' && navigator.share && navigator.canShare) {
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'NEON DASH', text }).catch(e => { if (!e || e.name !== 'AbortError') doDownload(blob); });
          return;
        }
      }
    } catch (e) { /* 다운로드로 */ }
    if (blob) doDownload(blob);
    else if (cp.card && cp.card.toBlob) cp.card.toBlob(b => doDownload(b), 'image/png');
    else toast('이 기기에서는 저장할 수 없어요');
  }
  G.scenes.complete = {
    enter(r) {
      cp.r = Object.assign({ level: 0, attempts: 1, time: 0, coins: [false, false, false], newCoins: [false, false, false], practice: false }, r || {});
      cp.t = 0; cp.fw = 0; cp.musicT = 1.6;
      const lv = levels()[cp.r.level];
      demoSetTheme(lv && lv.theme);
      A.duck(true);
      prepareCard();
    },
    update(dt) {
      common(dt); cp.t += dt; demoUpdate(dt * 0.5);
      cp.fw -= dt;
      const f = FX();
      if (cp.fw <= 0 && f) { cp.fw = cp.t < 2.5 ? 0.28 : 1.1; f.firework(G.rand ? G.rand(80, W - 80) : W / 2, G.rand ? G.rand(60, 240) : 140); }
      if (cp.musicT > 0) { cp.musicT -= dt; if (cp.musicT <= 0) { A.stop(); menuMusic(); } }
    },
    draw(ctx) {
      const R = RN(); uiBegin();
      const r = cp.r, t = cp.t;
      const L = levels(), lv = L[r.level] || {};
      demoDraw(ctx);
      ctx.fillStyle = 'rgba(4,5,16,0.62)'; ctx.fillRect(0, 0, W, H);
      vignette(ctx, 0.55);
      // 제목
      const k = eob(t / 0.45);
      ctx.save(); ctx.translate(W / 2, 70); ctx.scale(k, k); ctx.rotate(-0.03 + Math.sin(t * 2) * 0.01);
      R.glowText(ctx, r.practice ? '연습 클리어!' : '레벨 클리어!', 0, 0, 60, '#ffe14d', { glow: 1 });
      ctx.restore();
      ctx.globalAlpha = eoc((t - 0.2) / 0.3);
      R.txt(ctx, 'LEVEL ' + (r.level + 1) + ' · ' + (lv.name || ''), W / 2, 122, 20, '#ffffff', { weight: 800, stroke: 4 });
      if (r.firstClear) R.txt(ctx, '첫 클리어!' + (L[r.level + 1] ? '  다음 레벨 해금!' : '  모든 레벨 정복!'), W / 2, 150, 15, '#3dffb0', { weight: 800 });
      ctx.globalAlpha = 1;
      // 스탯 타일
      const tiles = 3, tw = 220, th = 150, gap = 24, sx = W / 2 - (tiles * tw + (tiles - 1) * gap) / 2, ty = 178;
      for (let i = 0; i < tiles; i++) {
        const kk = eob((t - 0.35 - i * 0.12) / 0.4);
        if (kk <= 0) continue;
        const x = sx + i * (tw + gap);
        ctx.save(); ctx.translate(x + tw / 2, ty + th / 2); ctx.scale(kk, kk); ctx.translate(-tw / 2, -th / 2);
        R.rr(ctx, 0, 0, tw, th, 18); ctx.fillStyle = 'rgba(10,12,34,0.9)'; ctx.fill();
        R.neonStroke(ctx, ['#29f0ff', '#ff3df2', '#ffcf3d'][i], 2);
        R.txt(ctx, ['시도 횟수', '시간', '코인'][i], tw / 2, 28, 16, 'rgba(255,255,255,0.7)', { weight: 700 });
        if (i === 0) {
          const n = Math.round(r.attempts * eoc((t - 0.45) / 0.8));
          R.glowText(ctx, String(n), tw / 2, 86, 60, '#ffffff', { glow: 0.6 });
        } else if (i === 1) {
          R.glowText(ctx, fmtTime(r.time * eoc((t - 0.55) / 0.8)), tw / 2, 82, 38, '#ffffff', { glow: 0.5 });
          if (!r.practice && r.bestTime != null) R.txt(ctx, '최고 ' + fmtTime(r.bestTime), tw / 2, 124, 13, 'rgba(255,255,255,0.6)', { weight: 700 });
        } else {
          for (let c = 0; c < 3; c++) {
            const kc = eob((t - 0.8 - c * 0.18) / 0.3);
            const got = r.coins && r.coins[c], had = !r.practice && r.savedCoins && r.savedCoins[c];
            ctx.save(); ctx.translate(tw / 2 - 56 + c * 56, 84);
            if (got) { ctx.scale(Math.max(0.01, kc), Math.max(0.01, kc)); }
            if (!got && had) ctx.globalAlpha = 0.4;
            coinSlot(ctx, 0, 0, 20, got || had);
            ctx.restore();
            if (got && r.newCoins && r.newCoins[c] && kc > 0.9) R.txt(ctx, 'NEW', tw / 2 - 56 + c * 56, 118, 11, '#ffe14d', { weight: 900 });
          }
        }
        ctx.restore();
      }
      // 버튼
      const bk = eoc((t - 0.9) / 0.4);
      if (bk > 0) {
        ctx.save(); ctx.globalAlpha = bk; ctx.translate(0, (1 - bk) * 40);
        const by = 360;
        const hasNext = !!L[r.level + 1] && unlocked(r.level + 1);
        const bw = 200, bg2 = 16;
        const n = hasNext ? 3 : 2, bx0 = W / 2 - (n * bw + (n - 1) * bg2) / 2;
        let bi = 0;
        if (hasNext) { button(ctx, 'c_next', bx0, by, bw, 58, '다음 레벨 ▶', () => { A.sfx('click'); nav('play', { level: r.level + 1, practice: false }); }, { primary: true, color: '#3dffb0', size: 22 }); bi++; }
        button(ctx, 'c_retry', bx0 + bi * (bw + bg2), by, bw, 58, '다시', () => { A.sfx('click'); nav('play', { level: r.level, practice: r.practice }); }, { primary: !hasNext, color: '#29f0ff', size: 22 }); bi++;
        button(ctx, 'c_select', bx0 + bi * (bw + bg2), by, bw, 58, '레벨 선택', () => { A.sfx('back'); nav('select', { focus: hasNext ? r.level + 1 : r.level }); }, { color: '#ff3df2', size: 22 });
        button(ctx, 'c_share', W / 2 - 130, by + 76, 260, 50, '기록 카드 공유 / 저장', () => { A.sfx('click'); shareCard(); }, { color: '#ffcf3d', size: 18 });
        ctx.restore();
      }
      post(ctx);
    },
    down(x, y) { if (busy() || G.portrait) return; uiDown(x, y); },
    up(x, y) { uiUp(x, y); },
    move(x, y) { uiMove(x, y); },
    key(code, down) {
      if (!down || busy() || cp.t < 0.8) return;
      const r = cp.r, L = levels();
      if (code === 'Enter' || code === 'Space') {
        if (L[r.level + 1] && unlocked(r.level + 1)) nav('play', { level: r.level + 1 });
        else nav('play', { level: r.level, practice: r.practice });
        A.sfx('click');
      } else if (code === 'KeyR') { A.sfx('click'); nav('play', { level: r.level, practice: r.practice }); }
      else if (code === 'Escape') { A.sfx('back'); nav('select', { focus: r.level }); }
    },
  };

  G.screens = { nav, toast, menuMusic };
})();
