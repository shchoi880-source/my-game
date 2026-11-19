'use strict';
// 연출: 월드 그리기(G.render) + 파티클/이펙트(G.fx) — docs/SPEC.md §8
// 좌표: 월드 x 오른쪽+, y 위쪽+(지면 0). 그릴 때는 월드 변환 안에서 (x, -y) 로 그린다.
(() => {
  const G = window.G;
  let W = G.W || 960, H = G.H || 540;
  const TAU = Math.PI * 2;
  // 지면은 화면 아래에서 110px 위 (기본 540 → 430). 화면이 커지면 하늘이 더 보임
  let GROUND_Y = H - 110;
  const PLAYER_SX = 280;
  if (G.onResize) G.onResize(() => { W = G.W; H = G.H; GROUND_Y = H - 110; });
  const SIZE = () => (G.PHYS && G.PHYS.size) || 34;
  const DEFAULT_THEME = { bg: '#0b0f2a', bg2: '#1b0f3a', accent: '#29f0ff', accent2: '#ff3df2', ground: '#121a44' };
  const PLAYER_COL = '#3dffb0';
  // 색 규칙(모든 레벨 공통): 빨강 = 위험, 하늘색 = 도움, 금색 = 먹는 것
  const HAZ = '#ff2a4d', HAZ_HOT = '#ffd0d8', KEYLINE = 'rgba(6,8,24,0.9)';
  const PAD_COL = '#4da6ff';
  const ORB_COL = '#5cb8ff';
  const COIN_COL = '#ffcf3d';
  const CP_COL = '#5dff7a';

  // ===== 색 유틸 =====
  const rgbCache = {};
  function rgb(hex) {
    let c = rgbCache[hex];
    if (c) return c;
    let h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16) || 0;
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache[hex] = c;
    return c;
  }
  function rgba(hex, a) { const c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(3)) + ')'; }
  const mixCache = {};
  function mix(h1, h2, t) {
    const key = h1 + h2 + t;
    if (mixCache[key]) return mixCache[key];
    const a = rgb(h1), b = rgb(h2);
    const r = Math.round(a[0] + (b[0] - a[0]) * t), g = Math.round(a[1] + (b[1] - a[1]) * t), bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return (mixCache[key] = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1));
  }
  const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
  const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  // ===== 그리기 유틸 (ctx 인자로 받음 → 오프스크린 캔버스에서도 사용) =====
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function txt(ctx, str, x, y, size, color, o) {
    o = o || {};
    ctx.font = (o.weight || 900) + ' ' + size + 'px ' + G.FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    let s = String(str).replace(/%/g, '％');
    if (o.maxW) while (s.length > 1 && ctx.measureText(s).width > o.maxW) s = s.slice(0, -1);
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.stroke;
      ctx.strokeStyle = o.strokeColor || 'rgba(0,0,0,0.7)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  // 네온 글자: 넓은 반투명 스트로크 2겹 + 색 채움 + 흰 코어
  function glowText(ctx, str, x, y, size, color, o) {
    o = o || {};
    const g = o.glow == null ? 1 : o.glow;
    ctx.font = (o.weight || 900) + ' ' + size + 'px ' + G.FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    const s = String(str).replace(/%/g, '％');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(color, 0.12 * g); ctx.lineWidth = size * 0.42; ctx.strokeText(s, x, y);
    ctx.strokeStyle = rgba(color, 0.28 * g); ctx.lineWidth = size * 0.2; ctx.strokeText(s, x, y);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(2, size * 0.08); ctx.strokeText(s, x, y);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    if (o.core !== false) {
      const pa = ctx.globalAlpha; ctx.globalAlpha = pa * 0.45; ctx.fillStyle = '#ffffff'; ctx.fillText(s, x, y - size * 0.03); ctx.globalAlpha = pa;
    }
  }
  function neonStroke(ctx, color, w, core) {
    ctx.strokeStyle = rgba(color, 0.18); ctx.lineWidth = w * 4; ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.45); ctx.lineWidth = w * 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    if (core) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, w * 0.4); ctx.stroke(); }
  }
  function glow(ctx, x, y, scale, color, alpha, name) {
    if (G.spr && G.spr(name || 'light_01', x, y, { scale, tint: color, add: true, alpha })) return;
    // 스프라이트 없으면 대체(가산 원)
    const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pa * alpha * 0.25;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 30 * scale, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = pc; ctx.globalAlpha = pa;
  }

  // ===== 박자 =====
  const beatOut = { beat: 0, phase: 0, bar: 0, pulse: 0, barPulse: 0 };
  function getBeat(level) {
    let b = null;
    try { if (G.audio && G.audio.music && G.audio.music.beat && (!G.audio.music.playing || G.audio.music.playing())) b = G.audio.music.beat(); } catch (e) { b = null; }
    if (!b || !isFinite(b.beat)) {
      const bpm = (level && level.bpm) || 120;
      const bt = nowSec() * bpm / 60;
      beatOut.beat = bt; beatOut.phase = bt - Math.floor(bt); beatOut.bar = Math.floor(bt / 4);
    } else {
      beatOut.beat = b.beat; beatOut.phase = b.phase != null ? b.phase : b.beat - Math.floor(b.beat); beatOut.bar = b.bar || 0;
    }
    const p = 1 - beatOut.phase;
    beatOut.pulse = p * p * p;
    beatOut.barPulse = (Math.floor(beatOut.beat) % 4 === 0) ? beatOut.pulse : 0;
    return beatOut;
  }

  // ===== 캐시 =====
  const gradCache = new Map();
  function cachedGrad(ctx, key, make) {
    let e = gradCache.get(key);
    if (!e || e.ctx !== ctx) { e = { ctx, g: make() }; gradCache.set(key, e); }
    return e.g;
  }
  const STARS = [];
  (() => { const r = G.mulberry ? G.mulberry(777) : Math.random; for (let i = 0; i < 90; i++) STARS.push({ x: r() * 2800, y: r(), d: 0.3 + r() * 0.7, s: r() < 0.12 ? 2.5 : 1.3, ph: r() * TAU }); })();

  // 오브젝트 정렬/인덱스 캐시
  const objCache = new WeakMap();
  function objIndex(objects) {
    if (!objects) return null;
    let e = objCache.get(objects);
    if (e && e.n === objects.length) return e;
    const arr = [], gaps = [];
    let ext = 120, ci = 0, gi = 0;
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (!o) continue;
      if (o.t === 'coin') { if (o._ci == null) { try { o._ci = ci; } catch (er) { /* frozen */ } } ci++; }
      if (o.t === 'gem') { if (o._gi == null) { try { o._gi = gi; } catch (er) { /* frozen */ } } gi++; }
      if (o.t === 'gap') { gaps.push(o); continue; }
      arr.push(o);
      const ex = (o.w || 0) + (o.r || 0) * 2 + Math.abs(o.ax || 0) * 2 + 60;
      if (ex > ext) ext = ex;
    }
    arr.sort((a, b) => a.x - b.x);
    gaps.sort((a, b) => a.x - b.x);
    e = { n: objects.length, arr, gaps, ext };
    objCache.set(objects, e);
    return e;
  }
  function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].x < x) lo = m + 1; else hi = m; } return lo; }

  // ===== 렌더 상태(트레일, 찌그러짐, 구간 배너) =====
  const TRAIL_N = 14;
  const rs = {
    run: null, trail: new Float32Array(TRAIL_N * 3), head: 0, count: 0, sample: 0,
    wasGrounded: true, squash: 0, stretch: 0, rot: 0, lastT: 0, dt: 0.016,
    secIdx: -1, banner: null, blinkT: 2.5, blink: 0,
    gemSet: new Set(), // 이번 판에 먹은 젬 번호(엔진이 state.gems 배열을 안 줄 때 대비)
  };
  function playerCenter(st, out) {
    const s = SIZE();
    out = out || {};
    if (G.render.anchor === 'center') { out.x = st.x; out.y = st.y; } else { out.x = st.x + s / 2; out.y = st.y + s / 2; }
    return out;
  }
  const pc = { x: 0, y: 0 };

  function updateRenderState(run, level) {
    const t = nowSec();
    let dt = t - rs.lastT; rs.lastT = t;
    if (!(dt > 0) || dt > 0.05) dt = 0.016;
    if (G.fx) dt *= G.fx.timeScale();
    rs.dt = dt;
    const st = run && run.state;
    if (!st) return;
    playerCenter(st, pc);
    if (rs.run !== run) {
      rs.run = run; rs.count = 0; rs.head = 0; rs.wasGrounded = true; rs.squash = 0; rs.stretch = 0; rs.rot = 0;
      rs.banner = null; rs.secIdx = sectionAt(level, st.x);
      rs.gemSet.clear();
    }
    // 트레일: 프레임마다 샘플
    if (!st.dead) {
      rs.sample += dt;
      if (rs.sample >= 1 / 60 || rs.count === 0) {
        rs.sample = 0;
        const i = rs.head * 3;
        rs.trail[i] = pc.x; rs.trail[i + 1] = pc.y; rs.trail[i + 2] = curRot(st);
        rs.head = (rs.head + 1) % TRAIL_N; rs.count = Math.min(TRAIL_N, rs.count + 1);
      }
    }
    // 착지/점프 감지 → 찌그러짐/늘어남
    const gr = !!st.grounded;
    if (gr && !rs.wasGrounded) { rs.squash = 1; rs.stretch = 0; }
    if (!gr && rs.wasGrounded && (st.vy || 0) > 0) { rs.stretch = 1; rs.squash = 0; }
    rs.wasGrounded = gr;
    rs.squash = Math.max(0, rs.squash - dt * 6);
    rs.stretch = Math.max(0, rs.stretch - dt * 4.5);
    // 대체 회전(엔진이 rot을 안 줄 때)
    if (typeof st.rot !== 'number') {
      if (!gr) rs.rot += dt * 7.2;
      else { const q = Math.round(rs.rot / (Math.PI / 2)) * (Math.PI / 2); rs.rot += (q - rs.rot) * Math.min(1, dt * 20); }
    }
    // 눈 깜빡임
    rs.blinkT -= dt;
    if (rs.blinkT <= 0) { rs.blink = 0.13; rs.blinkT = 2 + Math.random() * 3; }
    rs.blink = Math.max(0, rs.blink - dt);
    // 구간 배너
    const si = sectionAt(level, st.x);
    if (si > rs.secIdx && level && level.sections && level.sections[si]) {
      rs.banner = { name: level.sections[si].name || '', idx: si, t: 0 };
    }
    rs.secIdx = si;
    if (rs.banner) { rs.banner.t += dt; if (rs.banner.t > 2.2) rs.banner = null; }
  }
  function curRot(st) { return typeof st.rot === 'number' ? st.rot : rs.rot; }
  function sectionAt(level, x) {
    const s = level && level.sections;
    if (!s || !s.length) return -1;
    let k = -1;
    for (let i = 0; i < s.length; i++) if (s[i].x <= x) k = i;
    return k;
  }

  // ===== 배경 =====
  function drawBackground(ctx, theme, camX, camY, t, bt) {
    const pulse = bt.pulse;
    // 하늘
    const sky = cachedGrad(ctx, 'sky' + theme.bg + theme.bg2 + GROUND_Y, () => {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, mix(theme.bg, '#000000', 0.35));
      g.addColorStop(0.55, theme.bg);
      g.addColorStop(1, theme.bg2);
      return g;
    });
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, W + 80, H + 80);
    // 박자 배경 맥동
    // (화면 전체 박자 번쩍임은 눈이 피로해서 제거 — 박자는 지평선 빛으로만)
    const oy = camY * 0.15;
    // 별
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      let x = (s.x - camX * 0.03 * s.d) % (W + 40); if (x < -20) x += W + 40;
      const a = 0.35 + 0.45 * Math.sin(t * 2 * s.d + s.ph) + 0.2 * pulse;
      ctx.globalAlpha = Math.max(0.05, Math.min(1, a));
      ctx.fillRect(x, s.y * (GROUND_Y - 100) + oy * 0.5, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // 레트로 태양 (지면 기준 높이 → 화면 비율이 바뀌어도 지평선에 걸침)
    const sunX = W * 0.72, sunY = GROUND_Y - 180 + oy * 0.4, sunR = 105 + pulse * 3;
    glow(ctx, sunX, sunY, 5.2, theme.accent2, 0.35 + 0.25 * pulse);
    const sg = cachedGrad(ctx, 'sun' + theme.accent + theme.accent2, () => {
      const g = ctx.createLinearGradient(0, -110, 0, 110);
      g.addColorStop(0, '#fff3a8'); g.addColorStop(0.45, theme.accent2); g.addColorStop(1, mix(theme.accent2, theme.bg2, 0.6));
      return g;
    });
    ctx.save(); ctx.translate(sunX, sunY);
    ctx.fillStyle = sg; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, 0, sunR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.bg2;
    for (let k = 0; k < 7; k++) {
      const yy = 10 + k * 14 + ((t * 12) % 14), hh = 2 + k * 1.3;
      if (yy < sunR) ctx.fillRect(-sunR, yy, sunR * 2, hh);
    }
    ctx.restore();
    // 먼 산
    const mcol = mix(theme.bg2, theme.bg, 0.4);
    const mx = camX * 0.08;
    ctx.beginPath(); ctx.moveTo(-40, GROUND_Y + 40);
    for (let x = -40; x <= W + 40; x += 30) {
      const n = noise((x + mx) / 160) * 0.7 + noise((x + mx) / 55) * 0.3;
      ctx.lineTo(x, GROUND_Y - 40 - n * 150 + oy);
    }
    ctx.lineTo(W + 40, GROUND_Y + 40); ctx.closePath();
    ctx.fillStyle = mcol; ctx.fill();
    ctx.strokeStyle = rgba(theme.accent2, 0.25 + 0.08 * pulse); ctx.lineWidth = 2; ctx.stroke();
    // 도시 실루엣
    const cx = camX * 0.28, cell = 64;
    const first = Math.floor((cx - 40) / cell), last = Math.floor((cx + W + 40) / cell);
    const ccol = mix(theme.bg, '#000000', 0.45);
    for (let i = first; i <= last; i++) {
      const h1 = hash(i * 1.37);
      if (h1 < 0.18) continue;
      const bw = 34 + hash(i + 0.3) * 26, bh = 40 + hash(i + 0.7) * 150;
      const bx = i * cell - cx, by = GROUND_Y - bh + oy * 1.6;
      ctx.fillStyle = ccol; ctx.fillRect(bx, by, bw, bh + 60);
      ctx.fillStyle = rgba(theme.accent, 0.22 + 0.08 * pulse); ctx.fillRect(bx, by, bw, 2);
      // 창문
      const lit = rgba(mix(theme.accent, theme.bg2, 0.35), 0.16);
      ctx.fillStyle = lit;
      for (let wy = by + 10; wy < GROUND_Y - 8; wy += 14) {
        for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
          if (hash(wx * 0.13 + wy * 0.71 + i) > 0.62) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
    // 지평선 글로우
    ctx.globalCompositeOperation = 'lighter';
    const hg = cachedGrad(ctx, 'hz' + theme.accent, () => {
      const g = ctx.createLinearGradient(0, -120, 0, 0);
      g.addColorStop(0, rgba(theme.accent, 0)); g.addColorStop(1, rgba(theme.accent, 0.35));
      return g;
    });
    ctx.globalAlpha = 0.4 + 0.25 * pulse;
    ctx.save(); ctx.translate(0, GROUND_Y + camY);
    ctx.fillStyle = hg; ctx.fillRect(-40, -120, W + 80, 120);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ===== 바닥 =====
  function drawGround(ctx, level, theme, cam, idx, x0, x1, bt) {
    const depth = H - (GROUND_Y + cam.y) + 60;
    if (depth <= 0) return;
    const pulse = bt.pulse;
    const gg = cachedGrad(ctx, 'gnd' + theme.ground, () => {
      const g = ctx.createLinearGradient(0, 0, 0, 170);
      g.addColorStop(0, theme.ground); g.addColorStop(1, mix(theme.ground, '#000000', 0.75));
      return g;
    });
    ctx.fillStyle = gg; ctx.fillRect(x0, 0, x1 - x0, depth);
    // 원근 그리드
    const vp = cam.x + W / 2;
    ctx.beginPath();
    const step = 80;
    for (let gx = Math.floor((x0 - 400) / step) * step; gx <= x1 + 400; gx += step) {
      const bx = vp + (gx - vp) * 2.4;
      ctx.moveTo(gx, 0); ctx.lineTo(bx, depth);
    }
    for (let j = 1; j <= 5; j++) { const yy = depth * Math.pow(j / 5.5, 1.7); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); }
    ctx.strokeStyle = rgba(theme.accent, 0.13 + 0.12 * pulse); ctx.lineWidth = 1.5; ctx.stroke();
    // 눈금(스크롤)
    ctx.beginPath();
    for (let tx = Math.floor(x0 / 40) * 40; tx <= x1; tx += 40) {
      const tall = (Math.round(tx / 40) % 4) === 0;
      ctx.moveTo(tx, 3); ctx.lineTo(tx, tall ? 14 : 8);
    }
    ctx.strokeStyle = rgba(theme.accent, 0.5); ctx.lineWidth = 2; ctx.stroke();
    // 구멍(공허)
    const gaps = idx ? idx.gaps : [];
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i];
      if (g.x + g.w < x0 || g.x > x1) continue;
      ctx.fillStyle = '#020309'; ctx.fillRect(g.x, -1, g.w, depth + 2);
      const vg = cachedGrad(ctx, 'void' + HAZ, () => {
        const q = ctx.createLinearGradient(0, 0, 0, 120);
        q.addColorStop(0, rgba(HAZ, 0)); q.addColorStop(1, rgba(HAZ, 0.28));
        return q;
      });
      ctx.fillStyle = vg; ctx.fillRect(g.x, 0, g.w, Math.min(depth, 120));
      // 경고 해칭
      ctx.beginPath();
      for (let hx = g.x + 8; hx < g.x + g.w - 4; hx += 18) { ctx.moveTo(hx, depth); ctx.lineTo(hx + 10, depth - 14); }
      ctx.strokeStyle = rgba(HAZ, 0.45); ctx.lineWidth = 2; ctx.stroke();
    }
    // 네온 지면 라인 (구멍 제외 구간)
    ctx.beginPath();
    let sx = x0;
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i];
      if (g.x + g.w < x0) continue;
      if (g.x > x1) break;
      if (g.x > sx) { ctx.moveTo(sx, 0); ctx.lineTo(g.x, 0); ctx.lineTo(g.x, depth); }
      ctx.moveTo(g.x + g.w, depth); ctx.lineTo(g.x + g.w, 0);
      sx = Math.max(sx, g.x + g.w);
    }
    if (sx < x1) { ctx.moveTo(sx, 0); ctx.lineTo(x1, 0); }
    neonStroke(ctx, theme.accent, 2.5 + pulse * 1.5, true);
  }

  // ===== 오브젝트 =====
  const sawP = { x: 0, y: 0 };
  function sawPos(o, t) {
    if (o.cx != null && o.cy != null) { sawP.x = o.cx; sawP.y = o.cy; return sawP; }
    if (G.Engine && G.Engine.sawPos) {
      try {
        const p = G.Engine.sawPos(o, t);
        if (p) { if (Array.isArray(p)) { sawP.x = p[0]; sawP.y = p[1]; } else { sawP.x = p.x != null ? p.x : p.cx; sawP.y = p.y != null ? p.y : p.cy; } return sawP; }
      } catch (e) { /* 아래 계산 */ }
    }
    const ph = o.period ? Math.sin(TAU * t / o.period) : 0;
    sawP.x = o.x + (o.ax || 0) * ph; sawP.y = o.y + (o.ay || 0) * ph;
    return sawP;
  }

  function drawBlock(ctx, o, theme, pulse) {
    const x = o.x, y = -(o.y + o.h), w = o.w, h = o.h;
    const bg = cachedGrad(ctx, 'blk' + theme.bg2 + theme.accent, () => {
      const g = ctx.createLinearGradient(0, 0, 0, 1);
      g.addColorStop(0, mix(theme.bg2, theme.accent, 0.28)); g.addColorStop(0.5, mix(theme.bg2, '#000000', 0.2)); g.addColorStop(1, mix(theme.bg, '#000000', 0.5));
      return g;
    });
    ctx.save(); ctx.translate(x, y); ctx.scale(w, h); ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1); ctx.restore();
    // 안쪽 무늬
    ctx.strokeStyle = rgba(theme.accent, 0.22); ctx.lineWidth = 1.5;
    if (w > 16 && h > 16) { ctx.strokeRect(x + 6, y + 6, w - 12, h - 12); }
    ctx.beginPath(); ctx.rect(x, y, w, h);
    neonStroke(ctx, theme.accent, 2 + pulse * 0.8, false);
    // 윗면 하이라이트
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + 2, y, w - 4, 2);
  }
  function drawSpike(ctx, o, theme, pulse) {
    const w = o.w || 40, h = o.h || 40, x = o.x, y0 = o.y || 0;
    const d = o.dir || 'up';
    let tx, ty;
    ctx.beginPath();
    if (d === 'left' || d === 'right') {
      const bx = d === 'left' ? x + w : x; tx = d === 'left' ? x : x + w; ty = -(y0 + h / 2);
      ctx.moveTo(bx, -y0); ctx.lineTo(tx, ty); ctx.lineTo(bx, -(y0 + h));
    } else {
      const base = d === 'down' ? -(y0 + h) : -y0; tx = x + w / 2; ty = d === 'down' ? -y0 : -(y0 + h);
      ctx.moveTo(x, base); ctx.lineTo(tx, ty); ctx.lineTo(x + w, base);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = KEYLINE; ctx.lineWidth = 5; ctx.stroke();
    // 꽉 찬 빨강(뾰족한 끝이 밝게) — 배경 장식(선만 있는 네온)과 구분
    if (d === 'up' || d === 'down') {
      const lg = ctx.createLinearGradient(0, ty, 0, d === 'down' ? ty - h : ty + h);
      lg.addColorStop(0, HAZ_HOT); lg.addColorStop(0.45, HAZ); lg.addColorStop(1, mix(HAZ, '#000000', 0.45));
      ctx.fillStyle = lg;
    } else ctx.fillStyle = HAZ;
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.55 + 0.25 * pulse); ctx.lineWidth = 1.5; ctx.stroke();
  }
  function drawSaw(ctx, o, theme, t, pulse) {
    const p = sawPos(o, t);
    const r = o.r || 30, cx = p.x, cy = -p.y;
    glow(ctx, cx, cy, r / 30 * 0.9, HAZ, 0.3 + 0.1 * pulse);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 9);
    const n = 12;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 0.55) / n * TAU, a2 = (i + 1) / n * TAU;
      ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
      ctx.lineTo(Math.cos(a1) * r * 1.02, Math.sin(a1) * r * 1.02);
      ctx.lineTo(Math.cos(a2) * r * 0.78, Math.sin(a2) * r * 0.78);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = KEYLINE; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = HAZ; ctx.fill();
    ctx.strokeStyle = rgba(HAZ_HOT, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.fillStyle = mix(HAZ, '#000000', 0.55); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); }
    ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  function drawPad(ctx, o, t, pulse) {
    const x = o.x, y = -(o.y || 0), w = 40;
    glow(ctx, x + w / 2, y - 6, 0.7 + pulse * 0.2, PAD_COL, 0.6);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 18, x + w, y); ctx.closePath();
    ctx.strokeStyle = KEYLINE; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = PAD_COL; ctx.fill();
    neonStroke(ctx, PAD_COL, 2, true);
    // 위로 흐르는 쉐브론
    for (let k = 0; k < 3; k++) {
      const ph = ((t * 1.6 + k / 3) % 1);
      const cy = y - 14 - ph * 44, a = (1 - ph) * 0.9;
      ctx.beginPath(); ctx.moveTo(x + 9, cy + 7); ctx.lineTo(x + w / 2, cy); ctx.lineTo(x + w - 9, cy + 7);
      ctx.strokeStyle = rgba(PAD_COL, a); ctx.lineWidth = 3; ctx.stroke();
    }
  }
  function drawOrb(ctx, o, t, pulse) {
    const cx = o.x, cy = -o.y, r = 26;
    const s = 1 + 0.08 * Math.sin(t * 6) + 0.08 * pulse;
    glow(ctx, cx, cy, 1.15 * s, ORB_COL, 0.65);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82 * s, 0, TAU);
    ctx.strokeStyle = KEYLINE; ctx.lineWidth = 7; ctx.stroke();
    neonStroke(ctx, ORB_COL, 3, true);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, TAU); ctx.fillStyle = rgba(ORB_COL, 0.85); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    // 회전 점선 링
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2.5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.moveTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12); ctx.arc(0, 0, r * 1.12, a, a + 0.5); }
    ctx.strokeStyle = rgba(ORB_COL, 0.55); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  function drawCoin(ctx, o, t) {
    const cx = o.x, cy = -o.y + Math.sin(t * 3 + o.x) * 4, r = 17;
    const sx = Math.max(0.12, Math.abs(Math.cos(t * 2.6 + o.x * 0.01)));
    glow(ctx, cx, cy, 1.0, COIN_COL, 0.75);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = mix(COIN_COL, '#7a4a00', 0.35); ctx.fill();
    neonStroke(ctx, COIN_COL, 2.5, true);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.strokeStyle = rgba('#fff6c0', 0.8); ctx.lineWidth = 1.5; ctx.stroke();
    starPath(ctx, 0, 0, r * 0.45, r * 0.2, 5);
    ctx.fillStyle = '#fff6c0'; ctx.fill();
    ctx.restore();
    if (((t * 0.7 + o.x * 0.001) % 1) < 0.15) G.spr && G.spr('star_04', cx + 8, cy - 9, { scale: 0.35, tint: '#ffffff', add: true, alpha: 0.9, rot: t * 3 });
  }
  // 리듬 젬: 또렷한 흰 다이아몬드(어두운 테두리 + 금빛 후광). 색이 바뀌지 않아 눈이 덜 피곤함
  const GEM_COLS = ['#ffe680', '#ffe680', '#ffe680', '#ffe680'];
  function drawGem(ctx, o, t, bt, theme, gi) {
    const col = '#ffe680';
    const cx = o.x, cy = -o.y + Math.sin(t * 3 + o.x * 0.02) * 2.5;
    const s = 1 + 0.1 * bt.pulse;
    const hw = 10 * s, hh = 13.5 * s;
    glow(ctx, cx, cy, 0.5, col, 0.55);
    const path = (w, h) => { ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + h); ctx.lineTo(cx - w, cy); ctx.closePath(); };
    // 어두운 바깥 테두리: 밝은 배경 위에서도 윤곽이 보이게
    path(hw, hh); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,8,24,0.9)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    // 안쪽 흰 면
    path(hw * 0.5, hh * 0.5); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  function starPath(ctx, x, y, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function drawFinish(ctx, level, theme, t, pulse) {
    const L = level.length;
    if (!L) return;
    // 체커 라인 + 포털
    const top = -560;
    glow(ctx, L, -120, 3.5, '#ffffff', 0.35 + 0.3 * pulse);
    const fg = cachedGrad(ctx, 'fin' + theme.accent, () => {
      const g = ctx.createLinearGradient(0, -560, 0, 0);
      g.addColorStop(0, rgba(theme.accent, 0)); g.addColorStop(0.6, rgba(theme.accent, 0.35)); g.addColorStop(1, rgba('#ffffff', 0.6));
      return g;
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = fg; ctx.fillRect(L - 26, top, 52, -top);
    ctx.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 28; k++) {
      ctx.fillStyle = k % 2 ? '#ffffff' : '#111122';
      ctx.fillRect(L - 6, -k * 12 - 12, 6, 12);
      ctx.fillStyle = k % 2 ? '#111122' : '#ffffff';
      ctx.fillRect(L, -k * 12 - 12, 6, 12);
    }
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.8 + i / 4) % 1;
      ctx.beginPath(); ctx.ellipse(L, -130, 26 + ph * 40, 110 + ph * 50, 0, 0, TAU);
      ctx.strokeStyle = rgba(i % 2 ? theme.accent : theme.accent2, (1 - ph) * 0.7); ctx.lineWidth = 3; ctx.stroke();
    }
    txt(ctx, 'FINISH', L + 60, -300, 22, rgba('#ffffff', 0.8), { stroke: 4 });
  }
  function drawCheckpoints(ctx, cps, t) {
    if (!cps || !cps.length) return;
    const s = SIZE();
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i];
      const cx = c.x + s / 2, cy = -(c.y + s / 2) - 50 + Math.sin(t * 3 + i) * 3;
      const last = i === cps.length - 1;
      glow(ctx, cx, cy, 0.5, CP_COL, last ? 0.7 : 0.3);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4 + (last ? t * 1.5 : 0));
      ctx.beginPath(); ctx.rect(-8, -8, 16, 16);
      ctx.fillStyle = rgba(CP_COL, last ? 0.6 : 0.25); ctx.fill();
      ctx.strokeStyle = CP_COL; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }

  // ===== 플레이어 =====
  function drawCube(ctx, s, rot, sqX, sqY, opt) {
    // (0,0)=바닥 중앙 기준으로 이미 이동된 상태
    ctx.save();
    ctx.scale(sqX, sqY);
    ctx.translate(0, -s / 2);
    ctx.rotate(rot);
    const col = (opt && opt.color) || PLAYER_COL;
    const bodyG = cachedGrad(ctx, 'cube' + col + s, () => {
      const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      g.addColorStop(0, mix(col, '#ffffff', 0.35)); g.addColorStop(0.5, col); g.addColorStop(1, mix(col, '#003040', 0.55));
      return g;
    });
    // 어두운 테두리: 어떤 배경 위에서도 큐브 윤곽이 보이게
    rr(ctx, -s / 2 - 2, -s / 2 - 2, s + 4, s + 4, 8); ctx.fillStyle = '#04121a'; ctx.fill();
    rr(ctx, -s / 2, -s / 2, s, s, 6);
    ctx.fillStyle = bodyG; ctx.fill();
    neonStroke(ctx, col, 2, true);
    rr(ctx, -s / 2 + 5, -s / 2 + 5, s - 10, s - 10, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 얼굴: 몸통은 돌아도 얼굴은 항상 똑바로 (착지 후 누워 보이지 않게)
    ctx.rotate(-rot);
    const vy = (opt && opt.vy) || 0;
    const look = G.clamp ? G.clamp(-vy / 900 * 3, -3, 3) : 0;
    const blink = opt && opt.blink;
    const k = s / 34;
    ctx.fillStyle = '#ffffff';
    if (blink) {
      ctx.fillRect(-10 * k, -3 * k, 8 * k, 2.5 * k); ctx.fillRect(3 * k, -3 * k, 8 * k, 2.5 * k);
    } else {
      rr(ctx, -10 * k, -9 * k, 8 * k, 11 * k, 3 * k); ctx.fill();
      rr(ctx, 3 * k, -9 * k, 8 * k, 11 * k, 3 * k); ctx.fill();
      ctx.fillStyle = '#0a1a2a';
      rr(ctx, -6.5 * k, (-6 + look) * k, 4 * k, 6 * k, 2 * k); ctx.fill();
      rr(ctx, 6.5 * k, (-6 + look) * k, 4 * k, 6 * k, 2 * k); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5.5 * k, (-5.5 + look) * k, 1.6 * k, 1.6 * k); ctx.fillRect(7.5 * k, (-5.5 + look) * k, 1.6 * k, 1.6 * k);
    }
    // 볼터치 + 입
    ctx.fillStyle = 'rgba(255,90,170,0.55)';
    ctx.fillRect(-13 * k, 4 * k, 5 * k, 3 * k); ctx.fillRect(9 * k, 4 * k, 5 * k, 3 * k);
    ctx.beginPath();
    if (vy > 200) { ctx.arc(1 * k, 7 * k, 3 * k, 0, TAU); ctx.fillStyle = '#0a1a2a'; ctx.fill(); }
    else { ctx.arc(1 * k, 4 * k, 4 * k, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = '#0a1a2a'; ctx.lineWidth = 2 * k; ctx.stroke(); }
    ctx.restore();
  }
  function drawPlayer(ctx, st, t) {
    const s = SIZE();
    // 트레일: 뒤로 갈수록 가늘고 흐려지는 리본(줄무늬 없이 부드럽게)
    if (rs.count > 2) {
      const n = Math.min(rs.count, 10), px = [], py = [];
      for (let k = 0; k < n; k++) { const i = ((rs.head - 1 - k + TRAIL_N * 2) % TRAIL_N) * 3; px.push(rs.trail[i]); py.push(-rs.trail[i + 1]); }
      const g = ctx.createLinearGradient(px[0], 0, px[n - 1] - 1, 0);
      g.addColorStop(0, rgba(PLAYER_COL, 0.4)); g.addColorStop(1, rgba(PLAYER_COL, 0));
      ctx.beginPath();
      for (let k = 0; k < n; k++) ctx.lineTo(px[k], py[k] - s * 0.32 * (1 - k / n));
      for (let k = n - 1; k >= 0; k--) ctx.lineTo(px[k], py[k] + s * 0.32 * (1 - k / n));
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
    if (st.dead) return;
    playerCenter(st, pc);
    // 바닥 그림자: 높이 뛸수록 작고 옅게
    const hgt = Math.max(0, Math.min(1, (pc.y - s / 2) / 220));
    ctx.fillStyle = rgba('#000000', 0.45 * (1 - hgt));
    ctx.beginPath(); ctx.ellipse(pc.x, 2, s * 0.55 * (1 - hgt * 0.5), 4, 0, 0, TAU); ctx.fill();
    glow(ctx, pc.x, -pc.y, 0.75, PLAYER_COL, 0.3);
    const sqX = 1 + 0.28 * rs.squash - 0.16 * rs.stretch;
    const sqY = 1 - 0.3 * rs.squash + 0.24 * rs.stretch;
    ctx.save(); ctx.translate(pc.x, -(pc.y - s / 2));
    drawCube(ctx, s, curRot(st), sqX, sqY, { vy: st.vy || 0, blink: rs.blink > 0 });
    ctx.restore();
  }

  // ===== 구간 배너 =====
  function drawBanner(ctx, theme) {
    const b = rs.banner;
    if (!b) return;
    const t = b.t;
    const inT = Math.min(1, t / 0.35), outT = Math.max(0, (t - 1.7) / 0.5);
    const e = G.easeOutBack ? G.easeOutBack(inT) : inT;
    const a = Math.max(0, 1 - outT);
    const y = 92;
    ctx.save();
    ctx.globalAlpha = a;
    const x = W / 2 + (1 - e) * 300 - outT * 300;
    const bw = 360;
    ctx.fillStyle = 'rgba(5,6,20,0.55)';
    ctx.beginPath(); ctx.moveTo(x - bw / 2 - 20, y - 24); ctx.lineTo(x + bw / 2 + 20, y - 24); ctx.lineTo(x + bw / 2, y + 24); ctx.lineTo(x - bw / 2, y + 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = theme.accent; ctx.fillRect(x - bw / 2, y + 22, bw * Math.min(1, t / 0.6), 2);
    txt(ctx, 'SECTION ' + (b.idx + 1), x, y - 11, 12, rgba(theme.accent, 0.9), { weight: 700 });
    glowText(ctx, b.name, x, y + 7, 24, '#ffffff', { glow: 0.6 });
    ctx.restore();
  }

  // ===== 월드 =====
  function world(ctx, run, level, cam, fx) {
    level = level || {};
    const theme = Object.assign({}, DEFAULT_THEME, level.theme || {});
    const st = (run && run.state) || { x: 0, y: 0, vy: 0, grounded: true, t: 0 };
    cam = cam || { x: st.x - PLAYER_SX, y: 0, zoom: 1 };
    fx = fx || G.fx;
    updateRenderState(run, level);
    const t = nowSec();
    const rt = st.t != null ? st.t : t;
    const bt = getBeat(level);
    const z = (cam.zoom || 1) * (fx ? 1 + fx.punchAmt : 1);
    ctx.save();
    if (fx) ctx.translate(fx.shakeX, fx.shakeY);
    if (z !== 1) {
      playerCenter(st, pc);
      const px = pc.x - cam.x, py = GROUND_Y + cam.y - pc.y;
      ctx.translate(px, py); ctx.scale(z, z); ctx.translate(-px, -py);
    }
    drawBackground(ctx, theme, cam.x, cam.y, t, bt);
    // 배경을 살짝 눌러서 장애물·먹이가 배경 불빛과 섞이지 않게
    ctx.fillStyle = 'rgba(2,3,10,0.38)'; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.save();
    ctx.translate(-cam.x, GROUND_Y + cam.y);
    const x0 = cam.x - 120, x1 = cam.x + W + 120;
    const idx = objIndex((run && run.objects) || level.objects);
    drawGround(ctx, level, theme, cam, idx, x0, x1, bt);
    if (level.length) drawFinish(ctx, level, theme, t, bt.pulse);
    if (cam.attempt) {
      const ax = (cam.attemptX != null ? cam.attemptX : 0) + 420;
      if (ax > x0 - 300 && ax < x1 + 300) glowText(ctx, 'ATTEMPT ' + cam.attempt, ax, -230, 40, '#ffffff', { glow: 0.5 });
    }
    if (idx) {
      const arr = idx.arr, coins = st.coins;
      for (let i = Math.max(0, lowerBound(arr, x0 - idx.ext)); i < arr.length; i++) {
        const o = arr[i];
        if (o.x > x1 + 60) break;
        switch (o.t) {
          case 'block': drawBlock(ctx, o, theme, bt.pulse); break;
          case 'spike': drawSpike(ctx, o, theme, bt.pulse); break;
          case 'saw': drawSaw(ctx, o, theme, rt, bt.pulse); break;
          case 'pad': drawPad(ctx, o, t, bt.pulse); break;
          case 'orb': drawOrb(ctx, o, t, bt.pulse); break;
          case 'coin': {
            const ci = o.ci != null ? o.ci : o._ci;
            const got = o.taken || o.collected || o.got || (coins && ci != null && coins[ci]);
            if (!got) drawCoin(ctx, o, t);
            else if (cam.coinGhost) { ctx.globalAlpha = 0.25; drawCoin(ctx, o, t); ctx.globalAlpha = 1; }
            break;
          }
          case 'gem': {
            const gi = o.gi != null ? o.gi : o._gi;
            const gs = st.gems;
            const got = o._taken || o.taken || o.got || rs.gemSet.has(gi) ||
              (gs && typeof gs === 'object' && gi != null && gs[gi]);
            if (!got) drawGem(ctx, o, t, bt, theme, gi || 0);
            break;
          }
        }
      }
    }
    drawCheckpoints(ctx, cam.checkpoints, t);
    if (run) drawPlayer(ctx, st, t);
    if (fx) fx.draw(ctx, 0);
    ctx.restore();
    drawBanner(ctx, theme);
    ctx.restore();
  }

  // 카메라
  function newCam() { return { x: -PLAYER_SX, y: 0, zoom: 1 }; }
  function updateCam(cam, run, dt, snap) {
    const st = run && run.state;
    if (!st) return cam;
    const s = SIZE();
    playerCenter(st, pc);
    cam.x = pc.x - s / 2 - PLAYER_SX;
    // 플레이어 윗변이 화면 위에서 약 140px 아래에 머물도록(화면이 높으면 덜 따라감)
    const target = Math.max(0, pc.y + s / 2 - (GROUND_Y - 140));
    if (snap) cam.y = target;
    else cam.y += (target - cam.y) * Math.min(1, dt * (target > cam.y ? 5 : 3.5));
    return cam;
  }

  G.render = {
    anchor: 'bl', // 'bl' = state.x/y 가 히트박스 왼쪽-아래, 'center' = 중심
    get GROUND_Y() { return GROUND_Y; },
    PLAYER_SX, DEFAULT_THEME, PLAYER_COL, GEM_COLS,
    world, newCam, updateCam, playerCenter,
    // 이번 판에 먹은 젬 표시(엔진이 state.gems 배열을 주면 없어도 됨). 판이 바뀌면 자동 초기화
    gemTaken(gi) { if (gi != null) rs.gemSet.add(gi); },
    background: (ctx, theme, camX, camY) => drawBackground(ctx, Object.assign({}, DEFAULT_THEME, theme || {}), camX || 0, camY || 0, nowSec(), getBeat(null)),
    beat: getBeat,
    cube: drawCube,
    rr, txt, glowText, neonStroke, glow, rgba, mix, starPath,
    // 화면 좌표 변환(월드 y-up → 화면)
    toScreen(cam, wx, wy, out) { out = out || {}; out.x = wx - cam.x; out.y = GROUND_Y + cam.y - wy; return out; },
  };

  // ======================================================================
  // ===== G.fx: 파티클 + 화면 효과 =====
  // ======================================================================
  const MAX = 400;
  const K_SPR = 0, K_SHARD = 1, K_STREAK = 2, K_RING = 3, K_TEXT = 4, K_DOT = 5;
  const P = [];
  for (let i = 0; i < MAX; i++) P.push({ on: false, layer: 0, k: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, size: 1, size2: 1, rot: 0, vr: 0, color: '#fff', name: '', text: '', add: true, a: 1 });
  let pi = 0;
  function spawn(layer, k, x, y) {
    let p = null;
    for (let n = 0; n < MAX; n++) { const q = P[pi]; pi = (pi + 1) % MAX; if (!q.on) { p = q; break; } }
    if (!p) { p = P[pi]; pi = (pi + 1) % MAX; }
    p.on = true; p.layer = layer; p.k = k; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.g = 0; p.drag = 0;
    p.life = 0; p.max = 0.5; p.size = 4; p.size2 = 4; p.rot = 0; p.vr = 0; p.color = '#ffffff'; p.name = 'light_01'; p.text = ''; p.add = true; p.a = 1;
    return p;
  }
  const R = (a, b) => a + Math.random() * (b - a);

  const fx = {
    shakeX: 0, shakeY: 0, punchAmt: 0,
    trauma: 0, punchV: 0, hitT: 0, slowF: 1, slowT: 0,
    flashA: 0, flashCol: '#ffffff', glitchT: 0, combo: 0, comboT: 0, edgeA: 0, edgeCol: '#ffe14d',
    count() { let n = 0; for (let i = 0; i < MAX; i++) if (P[i].on) n++; return n; },
    clear() { for (let i = 0; i < MAX; i++) P[i].on = false; this.trauma = 0; this.flashA = 0; this.edgeA = 0; this.glitchT = 0; this.hitT = 0; this.slowT = 0; this.slowF = 1; this.punchV = 0; this.punchAmt = 0; this.shakeX = this.shakeY = 0; },
    // --- 시간 조작 ---
    hitstop(s) { this.hitT = Math.max(this.hitT, s); },
    slowmo(f, s) { this.slowF = f; this.slowT = s; },
    timeScale() { return this.hitT > 0 ? 0 : (this.slowT > 0 ? this.slowF : 1); },
    shake(a) { this.trauma = Math.min(1, this.trauma + a); },
    punch(a) { this.punchV = Math.max(this.punchV, a); },
    flash(col, a) { this.flashCol = col || '#ffffff'; this.flashA = Math.max(this.flashA, a == null ? 0.6 : a); },
    glitch(s) { this.glitchT = Math.max(this.glitchT, s); },

    update(dt) {
      // 실제 시간 기준 타이머
      if (this.hitT > 0) this.hitT -= dt;
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowF = 1; }
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
      const sh = Math.min(8, this.trauma * this.trauma * 16);
      this.shakeX = sh ? R(-sh, sh) : 0; this.shakeY = sh ? R(-sh, sh) : 0;
      this.punchV = Math.max(0, this.punchV - dt * 0.5);
      this.punchAmt = this.punchV;
      this.flashA = Math.max(0, this.flashA - dt * 3.2);
      this.edgeA = Math.max(0, this.edgeA - dt * 1.6);
      this.glitchT = Math.max(0, this.glitchT - dt);
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
      const sdt = dt * this.timeScale();
      if (sdt <= 0) return;
      for (let i = 0; i < MAX; i++) {
        const p = P[i];
        if (!p.on) continue;
        p.life += sdt;
        if (p.life >= p.max) { p.on = false; continue; }
        if (p.drag) { const d = Math.max(0, 1 - p.drag * sdt); p.vx *= d; p.vy *= d; }
        p.vy += p.g * sdt;
        p.x += p.vx * sdt; p.y += p.vy * sdt;
        p.rot += p.vr * sdt;
      }
    },
    draw(ctx, layer) {
      for (let i = 0; i < MAX; i++) {
        const p = P[i];
        if (!p.on || p.layer !== layer) continue;
        const f = p.life / p.max, a = (1 - f) * p.a;
        if (a <= 0.004) continue;
        switch (p.k) {
          case K_SPR: {
            const sc = p.size + (p.size2 - p.size) * f;
            if (!(G.spr && G.spr(p.name, p.x, p.y, { scale: sc, rot: p.rot, tint: p.color, add: p.add, alpha: a }))) {
              ctx.globalAlpha = a * 0.6; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 20 * sc, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
            }
            break;
          }
          case K_SHARD: {
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 1.4);
            const s = p.size * (1 - f * 0.4);
            ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.strokeRect(-s / 2, -s / 2, s, s);
            ctx.restore(); ctx.globalAlpha = 1;
            break;
          }
          case K_STREAK: {
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
            ctx.strokeStyle = p.color; ctx.lineWidth = p.size * (1 - f * 0.5); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            break;
          }
          case K_RING: {
            const e = 1 - (1 - f) * (1 - f);
            const r = p.size + (p.size2 - p.size) * e;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
            ctx.beginPath();
            if (p.vr === 1) { ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); }
            else ctx.arc(p.x, p.y, Math.max(0.1, r), 0, TAU);
            ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.drag * (1 - f)); ctx.stroke();
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            break;
          }
          case K_TEXT: {
            const pop = Math.min(1, p.life / 0.18);
            const sc = (G.easeOutBack ? G.easeOutBack(pop) : pop) * (1 + f * 0.15);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sc, sc);
            ctx.globalAlpha = f < 0.7 ? 1 : (1 - f) / 0.3;
            glowText(ctx, p.text, 0, 0, p.size, p.color, { glow: 0.8 });
            ctx.restore(); ctx.globalAlpha = 1;
            break;
          }
          case K_DOT: {
            ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; ctx.globalAlpha = a;
            ctx.fillStyle = p.color; const s = p.size * (1 - f * 0.6);
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            break;
          }
        }
      }
    },
    // 섬광 + 글리치(RGB 어긋남) — 장면 맨 마지막에 화면 좌표로
    drawOverlay(ctx) {
      if (this.glitchT > 0 && ctx.canvas && ctx.canvas.width) {
        const c = ctx.canvas, k = this.glitchT / 0.3;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try {
          for (let i = 0; i < 7; i++) {
            const y = Math.random() * c.height, h = (4 + Math.random() * 26) * (c.height / H);
            const off = R(-24, 24) * k * (c.width / W);
            ctx.globalAlpha = 0.75;
            ctx.drawImage(c, 0, y, c.width, h, off, y, c.width, h);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.22 * k;
            ctx.fillStyle = i % 2 ? '#ff2050' : '#20f0ff';
            ctx.fillRect(0, y, c.width, h);
            ctx.globalCompositeOperation = 'source-over';
          }
        } catch (e) { /* 일부 환경에서 자기 자신 그리기 실패 */ }
        ctx.restore();
        // RGB 가장자리
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * k;
        ctx.fillStyle = '#ff1040'; ctx.fillRect(0, 0, 10, H); ctx.fillRect(0, 0, W, 6);
        ctx.fillStyle = '#10e0ff'; ctx.fillRect(W - 10, 0, 10, H); ctx.fillRect(0, H - 6, W, 6);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      // 화면 가장자리 색 번쩍임(콤보 마일스톤) — 가운데는 가리지 않음
      if (this.edgeA > 0.004) {
        const e = Math.min(1, this.edgeA), d = 70 + 40 * e;
        ctx.globalCompositeOperation = 'lighter';
        const c0 = rgba(this.edgeCol, 0.55 * e), c1 = rgba(this.edgeCol, 0);
        let g = ctx.createLinearGradient(0, 0, d, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, d, H);
        g = ctx.createLinearGradient(W, 0, W - d, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(W - d, 0, d, H);
        g = ctx.createLinearGradient(0, 0, 0, d); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, W, d);
        g = ctx.createLinearGradient(0, H, 0, H - d); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, H - d, W, d);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (this.flashA > 0.004) {
        ctx.globalAlpha = Math.min(1, this.flashA);
        ctx.fillStyle = this.flashCol; ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.globalAlpha = 1;
      }
    },

    // ===== 이미터 (월드 좌표: y 위쪽+) =====
    jumpRing(x, y, color) {
      color = color || PLAYER_COL;
      const r = spawn(0, K_RING, x, -y); r.size = 6; r.size2 = 36; r.max = 0.32; r.color = color; r.drag = 4;
      for (let i = 0; i < 6; i++) {
        const d = spawn(0, K_DOT, x + R(-12, 12), -y); d.vx = R(-120, 60); d.vy = R(-30, 40); d.g = 300; d.max = R(0.25, 0.4); d.size = R(3, 5); d.color = color;
      }
    },
    doubleJumpSparkle(x, y, color) {
      color = color || '#ffffff';
      const r = spawn(0, K_RING, x, -y); r.size = 10; r.size2 = 54; r.max = 0.38; r.color = color; r.drag = 5;
      const r2 = spawn(0, K_RING, x, -y); r2.size = 4; r2.size2 = 34; r2.max = 0.3; r2.color = PLAYER_COL; r2.drag = 3; r2.vr = 1;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU, sp = R(140, 260);
        const s = spawn(0, K_SPR, x, -y); s.name = 'star_04'; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp + 80; s.drag = 4; s.max = R(0.35, 0.55); s.size = R(0.22, 0.34); s.size2 = 0.05; s.color = i % 2 ? '#ffffff' : PLAYER_COL; s.vr = R(-8, 8);
      }
    },
    landDust(x, y, color, strength) {
      const k = strength == null ? 1 : strength;
      color = color || '#9ab8ff';
      const n = Math.round(6 + 6 * k);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const d = spawn(0, K_DOT, x + side * R(4, 16), -y - 2); d.vx = side * R(60, 220) * k; d.vy = R(-90, -20); d.g = 420; d.drag = 3; d.max = R(0.25, 0.45); d.size = R(2.5, 5); d.color = color;
      }
      const s = spawn(0, K_SPR, x, -y - 4); s.name = 'smoke_01'; s.size = 0.25; s.size2 = 0.5; s.max = 0.35; s.color = color; s.a = 0.35 * k;
    },
    nearMiss(x, y) {
      this.combo++; this.comboT = 2.2;
      for (let i = 0; i < 12; i++) {
        const a = R(0, TAU), sp = R(200, 480);
        const s = spawn(0, K_STREAK, x, -y); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 5; s.max = R(0.2, 0.35); s.size = R(2, 3.5); s.color = i % 3 ? '#ffe14d' : '#ffffff';
      }
      const fl = spawn(0, K_SPR, x, -y); fl.name = 'spark_04'; fl.size = 0.3; fl.size2 = 0.9; fl.max = 0.25; fl.color = '#ffe14d';
      const t = spawn(0, K_TEXT, x + 10, -y - 40); t.text = this.combo > 1 ? '아슬! ×' + this.combo : '아슬!'; t.size = Math.min(28, 18 + this.combo * 2); t.vy = -70; t.drag = 2; t.max = 0.8; t.color = this.combo > 2 ? '#ff7df5' : '#ffe14d'; t.rot = R(-0.15, 0.15);
      this.punch(0.025);
    },
    death(x, y, color) {
      color = color || PLAYER_COL;
      this.combo = 0; this.comboT = 0;
      const cols = [color, '#ffffff', mix(color, '#ffffff', 0.5), mix(color, '#0040ff', 0.4)];
      for (let i = 0; i < 28; i++) {
        const a = R(0, TAU), sp = R(150, 620);
        const s = spawn(0, K_SHARD, x + R(-12, 12), -y + R(-12, 12)); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - 180; s.g = 1300; s.drag = 1.2; s.max = R(0.5, 0.95); s.size = R(5, 12); s.vr = R(-16, 16); s.rot = R(0, TAU); s.color = cols[i % 4];
      }
      for (let i = 0; i < 16; i++) {
        const a = R(0, TAU), sp = R(400, 900);
        const s = spawn(0, K_STREAK, x, -y); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 6; s.max = R(0.2, 0.4); s.size = R(2, 4); s.color = i % 2 ? '#ffffff' : color;
      }
      const r = spawn(0, K_RING, x, -y); r.size = 10; r.size2 = 120; r.max = 0.45; r.color = '#ffffff'; r.drag = 8;
      const r2 = spawn(0, K_RING, x, -y); r2.size = 6; r2.size2 = 80; r2.max = 0.35; r2.color = color; r2.drag = 5;
      const fl = spawn(0, K_SPR, x, -y); fl.name = 'flare_01'; fl.size = 1.2; fl.size2 = 2.8; fl.max = 0.35; fl.color = '#ffffff';
      const fl2 = spawn(0, K_SPR, x, -y); fl2.name = 'light_01'; fl2.size = 2; fl2.size2 = 3.5; fl2.max = 0.45; fl2.color = color;
      this.flash(mix(color, '#ffffff', 0.5), 0.25); this.shake(0.4); this.punch(0.05); this.hitstop(0.07);
    },
    coin(x, y) {
      const r = spawn(0, K_RING, x, -y); r.size = 8; r.size2 = 60; r.max = 0.4; r.color = COIN_COL; r.drag = 5;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, sp = R(160, 340);
        const s = spawn(0, K_SPR, x, -y); s.name = i % 2 ? 'star_04' : 'spark_04'; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 3.5; s.max = R(0.4, 0.7); s.size = R(0.25, 0.4); s.size2 = 0.05; s.color = i % 3 ? COIN_COL : '#ffffff'; s.vr = R(-6, 6);
      }
      const t = spawn(0, K_TEXT, x, -y - 36); t.text = '★ COIN'; t.size = 22; t.vy = -60; t.drag = 1.5; t.max = 0.9; t.color = COIN_COL;
      this.edgeCol = COIN_COL; this.edgeA = Math.max(this.edgeA || 0, 0.4); this.punch(0.03);
    },
    orbBurst(x, y, color) {
      color = color || ORB_COL;
      const r = spawn(0, K_RING, x, -y); r.size = 26; r.size2 = 64; r.max = 0.3; r.color = color; r.drag = 5;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU, sp = R(180, 320);
        const s = spawn(0, K_STREAK, x + Math.cos(a) * 20, -y + Math.sin(a) * 20); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 5; s.max = 0.28; s.size = 3; s.color = color;
      }
      this.punch(0.02);
    },
    padBurst(x, y, color) {
      color = color || PAD_COL;
      const r = spawn(0, K_RING, x, -y); r.size = 8; r.size2 = 48; r.max = 0.3; r.color = color; r.drag = 4;
      for (let i = 0; i < 12; i++) {
        const s = spawn(0, K_STREAK, x + R(-18, 18), -y); s.vx = R(-60, 60); s.vy = -R(300, 620); s.drag = 4; s.max = R(0.25, 0.4); s.size = R(2, 3.5); s.color = i % 3 ? color : '#ffffff';
      }
      this.punch(0.02);
    },
    // 젬 획득: 작은 반짝임 + 은은한 링 + 작은 "+10"(시야를 가리지 않게 작고 짧게)
    gemPickup(x, y, color, text) {
      color = color || '#29f0ff';
      const r = spawn(0, K_RING, x, -y); r.size = 4; r.size2 = 22; r.max = 0.22; r.color = color; r.drag = 2; r.a = 0.8;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + R(-0.3, 0.3), sp = R(90, 170);
        const s = spawn(0, K_SPR, x, -y); s.name = 'star_04'; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 5; s.max = R(0.2, 0.32); s.size = R(0.12, 0.18); s.size2 = 0.02; s.color = i % 2 ? '#ffffff' : color;
      }
      if (text) {
        const t = spawn(0, K_TEXT, x + 6, -y - 18); t.text = text; t.size = 13; t.vy = -110; t.drag = 3; t.max = 0.4; t.color = color;
      }
    },
    // 콤보 끊김: 작은 붉은 파편 + "BREAK"
    comboBreak(x, y, combo) {
      for (let i = 0; i < 8; i++) {
        const a = R(-Math.PI, 0), sp = R(80, 200);
        const d = spawn(0, K_DOT, x, -y); d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp; d.g = 500; d.max = R(0.3, 0.5); d.size = R(2.5, 4); d.color = '#ff3d6a';
      }
      const t = spawn(0, K_TEXT, x, -y - 30); t.text = combo >= 10 ? 'BREAK ' + combo : 'BREAK'; t.size = 15; t.vy = -60; t.drag = 2; t.max = 0.55; t.color = '#ff3d6a';
      this.shake(0.08);
    },
    // 콤보 마일스톤(50, 100, …): 큰 링 + 가장자리 번쩍임 + 화면 문구
    milestone(x, y, combo, color) {
      color = color || '#ffe14d';
      const r = spawn(0, K_RING, x, -y); r.size = 20; r.size2 = 260; r.max = 0.6; r.color = color; r.drag = 6;
      const r2 = spawn(0, K_RING, x, -y); r2.size = 10; r2.size2 = 160; r2.max = 0.45; r2.color = '#ffffff'; r2.drag = 3;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, sp = R(260, 420);
        const s = spawn(0, K_STREAK, x, -y); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 4; s.max = 0.4; s.size = 3; s.color = i % 2 ? color : '#ffffff';
      }
      const t = spawn(1, K_TEXT, W / 2, 128); t.text = combo + ' COMBO!'; t.size = 40; t.vy = -20; t.drag = 1; t.max = 1.1; t.color = color;
      this.edgeCol = color; this.edgeA = 1; this.punch(0.035);
    },
    checkpoint(x, y) {
      const r = spawn(0, K_RING, x, -y); r.size = 6; r.size2 = 46; r.max = 0.45; r.color = CP_COL; r.drag = 3; r.vr = 1;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const s = spawn(0, K_SPR, x, -y); s.name = 'star_04'; s.vx = Math.cos(a) * 140; s.vy = Math.sin(a) * 140; s.drag = 4; s.max = 0.45; s.size = 0.25; s.size2 = 0.05; s.color = CP_COL;
      }
    },
    respawn(x, y, color) {
      color = color || PLAYER_COL;
      const r = spawn(0, K_RING, x, -y); r.size = 70; r.size2 = 4; r.max = 0.25; r.color = color; r.drag = 3;
      const fl = spawn(0, K_SPR, x, -y); fl.name = 'light_01'; fl.size = 1.6; fl.size2 = 0.6; fl.max = 0.25; fl.color = color;
    },
    // 화면 좌표 불꽃(레이어 1)
    firework(sx, sy, color) {
      color = color || G.pick(['#29f0ff', '#ff3df2', '#ffe14d', '#3dffb0', '#ff7a3d', '#9d7bff']);
      const n = 36;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + R(-0.05, 0.05), sp = R(220, 360);
        const s = spawn(1, K_STREAK, sx, sy); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.g = 260; s.drag = 2.2; s.max = R(0.8, 1.3); s.size = R(2, 3.5); s.color = i % 4 ? color : '#ffffff';
      }
      for (let i = 0; i < 6; i++) {
        const a = R(0, TAU), sp = R(60, 180);
        const s = spawn(1, K_SPR, sx, sy); s.name = 'star_04'; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.g = 120; s.drag = 2; s.max = R(0.8, 1.2); s.size = 0.4; s.size2 = 0.1; s.color = '#ffffff'; s.vr = R(-5, 5);
      }
      const fl = spawn(1, K_SPR, sx, sy); fl.name = 'flare_01'; fl.size = 0.8; fl.size2 = 2.2; fl.max = 0.4; fl.color = color;
      const r = spawn(1, K_RING, sx, sy); r.size = 8; r.size2 = 140; r.max = 0.5; r.color = color; r.drag = 4;
    },
    // 화면 좌표 반짝(UI용)
    uiBurst(sx, sy, color, n) {
      color = color || '#29f0ff';
      n = n || 12;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, sp = R(120, 260);
        const s = spawn(1, K_SPR, sx, sy); s.name = 'star_04'; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.drag = 4; s.max = R(0.35, 0.6); s.size = R(0.2, 0.35); s.size2 = 0.04; s.color = i % 2 ? color : '#ffffff'; s.vr = R(-6, 6);
      }
      const r = spawn(1, K_RING, sx, sy); r.size = 6; r.size2 = 50; r.max = 0.35; r.color = color; r.drag = 4;
    },
    uiText(sx, sy, text, size, color) {
      const t = spawn(1, K_TEXT, sx, sy); t.text = text; t.size = size || 30; t.color = color || '#ffffff'; t.vy = -40; t.drag = 2; t.max = 1.0;
      return t;
    },
  };
  G.fx = fx;
})();
