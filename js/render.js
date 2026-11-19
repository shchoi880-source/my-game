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
    wasGrounded: true, sv: 0, sp: 0, rot: 0, lastT: 0, dt: 0.016,
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
      rs.run = run; rs.count = 0; rs.head = 0; rs.wasGrounded = true; rs.sv = 0; rs.sp = 0; rs.rot = 0;
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
    // 스프링(살짝 튕기며 돌아옴): sv<0 = 납작, sv>0 = 길쭉
    if (gr && !rs.wasGrounded) { rs.sv = -1; rs.sp = 0; }
    if (!gr && rs.wasGrounded && (st.vy || 0) > 0) { rs.sv = 0.8; rs.sp = 0; }
    rs.wasGrounded = gr;
    {
      const h = Math.min(dt, 1 / 30);
      rs.sp += (-260 * rs.sv - 16 * rs.sp) * h; rs.sv += rs.sp * h;
      if (Math.abs(rs.sv) < 0.002 && Math.abs(rs.sp) < 0.02) { rs.sv = 0; rs.sp = 0; }
    }
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
  // 레벨마다 다른 장소(theme.scene): city(1) / ziggurat(2) / gears(3) / spires(4) / ruins(5)
  // 규칙: 배경은 낮은 대비·뒤로 물러나게. 먼 층일수록 안개색(fog)에 가깝게.
  //       빨강·금색 불빛은 지면 띠 근처에 쓰지 않음(위험물·젬 색과 섞이지 않게). shadowBlur·번쩍임 없음.
  // 정적인 층은 오프스크린 캔버스 띠(폭 SW, 가로로 이어짐)에 한 번만 그리고 매 프레임 drawImage 2번으로 끝냄.
  const SW = 2048;           // 띠 한 장의 논리 폭(타일 주기)
  const STRIP_H = 340;       // 띠 높이(지면 위 300 + 아래 40)
  const STRIP_BASE = 300;    // 띠 안의 지면선 y
  const layerCache = new Map();
  if (G.onResize) G.onResize(() => layerCache.clear());
  function layer(key, w, h, paint) {
    let c = layerCache.get(key);
    if (c !== undefined) return c;
    c = null;
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        // 배경은 부드러워서 해상도를 낮게(최대 1.25배) — 모바일 메모리·채우기 비용 절약
        const s = Math.max(0.5, Math.min(1.25, (G.scale || 1) * (G.dpr || 1)));
        c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * s)); c.height = Math.max(1, Math.ceil(h * s));
        const g = c.getContext('2d');
        if (g) { g.scale(s, s); paint(g, w, h); c.lw = w; c.lh = h; } else c = null;
      }
    } catch (e) { c = null; }
    if (layerCache.size > 40) layerCache.clear();
    layerCache.set(key, c);
    return c;
  }
  // 가로로 이어지는 띠 그리기(시차 par)
  function drawStrip(ctx, c, par, camX, y) {
    if (!c) return;
    let ox = -((camX * par) % SW);
    while (ox > -40) ox -= SW;
    for (let x = ox; x < W + 40; x += SW) ctx.drawImage(c, x, y, c.lw, c.lh);
  }
  // 주기 SW 안에서 반복되는 해시/노이즈(띠 이음매가 안 보이게)
  const hp = (i, n, s) => hash((((i % n) + n) % n) + (s || 0) * 101.3);
  const pnoise = (x, n, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hp(i, n, s) * (1 - u) + hp(i + 1, n, s) * u; };
  // 띠 이음매를 넘는 모양은 왼쪽/오른쪽에 한 번 더 그림
  function wrap3(g, x, fn) { fn(x); fn(x - SW); fn(x + SW); }
  function topLine(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); }

  // --- 장면별 색: 안개색과 층 색 ---
  function palette(theme) {
    const key = theme.bg + theme.bg2 + theme.accent + theme.accent2;
    const fog = mix(theme.bg2, theme.bg, 0.5);
    return {
      key, fog,
      far: mix(mix(theme.bg2, theme.bg, 0.3), fog, 0.35),          // 먼 층: 하늘과 비슷하게
      mid: mix(mix(theme.bg, '#000000', 0.45), fog, 0.3),           // 가까운 층: 어둡게(검정 아님)
      lit: mix(theme.accent, fog, 0.6),                             // 창문/빛줄: 한 가지 색만, 안개 섞어 탁하게
    };
  }

  // ===== 먼 층 / 가까운 층 그리기 (오프스크린 1회) =====
  const B = STRIP_BASE;
  const SCENES = {
    city: {
      far(g, th, P) {
        const pts = [];
        for (let x = 0; x <= SW; x += 16) {
          const n = pnoise(x / 128, 16, 1) * 0.7 + pnoise(x / 51.2, 40, 2) * 0.3;
          pts.push(x, B - 40 - n * 150);
        }
        topLine(g, pts); g.lineTo(SW, STRIP_H); g.lineTo(0, STRIP_H); g.closePath();
        g.fillStyle = mix(mix(th.bg2, th.bg, 0.4), P.fog, 0.25); g.fill();
        topLine(g, pts); g.strokeStyle = rgba(th.accent2, 0.14); g.lineWidth = 2; g.stroke();
      },
      mid(g, th, P) {
        const cell = 64, n = SW / cell;
        for (let i = 0; i < n; i++) {
          if (hp(i, n, 3) < 0.18) continue;
          const bw = 34 + hp(i, n, 4) * 26, bh = 40 + hp(i, n, 5) * 150;
          const bx = i * cell, by = B - bh;
          g.fillStyle = P.mid; g.fillRect(bx, by, bw, bh + 40);
          g.fillStyle = rgba(th.accent, 0.2); g.fillRect(bx, by, bw, 2);
          if (hp(i, n, 6) > 0.75) { g.fillStyle = P.mid; g.fillRect(bx + bw * 0.5 - 1, by - 18, 2, 18); }
          g.fillStyle = rgba(P.lit, 0.14);
          for (let wy = by + 10; wy < B - 8; wy += 14) {
            for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
              if (hash(wx * 0.13 + wy * 0.71 + i) > 0.72) g.fillRect(wx, wy, 4, 6);
            }
          }
        }
      },
    },
    ziggurat: {
      far(g, th, P) {
        // 먼 피라미드 + 낮은 언덕
        const pts = [];
        for (let x = 0; x <= SW; x += 32) pts.push(x, B - 18 - pnoise(x / 256, 8, 7) * 40);
        topLine(g, pts); g.lineTo(SW, STRIP_H); g.lineTo(0, STRIP_H); g.closePath();
        g.fillStyle = P.far; g.fill();
        for (let i = 0; i < 7; i++) {
          const cx = (i + hp(i, 7, 8) * 0.6) * (SW / 7), w = 140 + hp(i, 7, 9) * 160, h = w * (0.38 + hp(i, 7, 10) * 0.18);
          wrap3(g, cx, x => {
            const steps = 6;
            g.fillStyle = P.far;
            for (let k = 0; k < steps; k++) {
              const sw = w * (1 - k / steps), sh = h / steps;
              g.fillRect(x - sw / 2, B - (k + 1) * sh, sw, sh + 1);
            }
          });
        }
      },
      mid(g, th, P) {
        const col = mix(P.mid, '#000000', 0.25), line = rgba(P.lit, 0.3);
        for (let i = 0; i < 4; i++) {
          const cx = (i + 0.25 + hp(i, 4, 11) * 0.5) * (SW / 4), w = 300 + hp(i, 4, 12) * 160;
          const steps = 6 + Math.floor(hp(i, 4, 13) * 3), sh = 22 + hp(i, 4, 14) * 8;
          wrap3(g, cx, x => {
            for (let k = 0; k < steps; k++) {
              const sw = w * (1 - k / (steps + 1.2)), y = B - (k + 1) * sh;
              g.fillStyle = col; g.fillRect(x - sw / 2, y, sw, sh + 1);
              g.fillStyle = line; g.fillRect(x - sw / 2, y, sw, 1);
            }
            // 가운데 계단
            const top = B - steps * sh, tw = w * (1 - (steps - 1) / (steps + 1.2));
            g.fillStyle = mix(col, '#000000', 0.25);
            g.beginPath(); g.moveTo(x - 16, B); g.lineTo(x - 8, top); g.lineTo(x + 8, top); g.lineTo(x + 16, B); g.closePath(); g.fill();
            g.fillStyle = rgba(P.lit, 0.1);
            for (let y = B - 6; y > top; y -= 6) g.fillRect(x - 12 + (B - y) * 0.03, y, 24 - (B - y) * 0.06, 1);
            // 꼭대기 신전
            g.fillStyle = col; g.fillRect(x - tw * 0.32, top - 26, tw * 0.64, 26);
            g.fillStyle = line; g.fillRect(x - tw * 0.32, top - 26, tw * 0.64, 1);
            g.fillStyle = rgba(P.lit, 0.16); g.fillRect(x - 5, top - 18, 10, 18);
          });
        }
        // 낮은 담장
        for (let i = 0; i < 16; i++) {
          const x = i * 128 + hp(i, 16, 15) * 40, w = 50 + hp(i, 16, 16) * 60, h = 10 + hp(i, 16, 17) * 16;
          g.fillStyle = col; g.fillRect(x, B - h, w, h + 40);
        }
        g.fillStyle = col; g.fillRect(0, B - 4, SW, 44);
      },
    },
    gears: {
      far(g, th, P) {
        // 톱니 지붕(공장) 스카이라인 + 굴뚝
        g.fillStyle = P.far;
        let x = 0, i = 0;
        while (x < SW) {
          const w = 80 + hp(i, 64, 20) * 120, h = 50 + hp(i, 64, 21) * 70;
          const x2 = Math.min(SW, x + w);
          g.fillRect(x, B - h, x2 - x, h + 40);
          // 톱니 지붕
          g.beginPath(); g.moveTo(x, B - h);
          for (let tx = x; tx < x2 - 1; tx += 24) { g.lineTo(Math.min(x2, tx + 18), B - h - 16); g.lineTo(Math.min(x2, tx + 24), B - h); }
          g.lineTo(x2, B - h); g.closePath(); g.fill();
          x = x2; i++;
        }
        for (let k = 0; k < 9; k++) {
          const cx = (k + hp(k, 9, 22)) * (SW / 9), h = 150 + hp(k, 9, 23) * 90, w = 12 + hp(k, 9, 24) * 8;
          wrap3(g, cx, xx => { g.fillStyle = P.far; g.fillRect(xx - w / 2, B - h, w, h); g.fillRect(xx - w / 2 - 3, B - h, w + 6, 6); });
        }
      },
      mid(g, th, P) {
        const col = P.mid;
        // 큰 굴뚝·탱크·건물 블록·파이프
        for (let i = 0; i < 12; i++) {
          const x = i * (SW / 12) + hp(i, 12, 30) * 40, w = 90 + hp(i, 12, 31) * 70, h = 40 + hp(i, 12, 32) * 70;
          wrap3(g, x, xx => {
            g.fillStyle = col; g.fillRect(xx, B - h, w, h + 40);
            g.fillStyle = rgba(P.lit, 0.1);
            for (let wx = xx + 8; wx < xx + w - 14; wx += 18) g.fillRect(wx, B - h + 12, 10, 3);
            if (hp(i, 12, 33) > 0.5) { // 둥근 탱크
              const r = 22 + hp(i, 12, 34) * 14;
              g.fillStyle = col; g.beginPath(); g.arc(xx + w * 0.5, B - h, r, Math.PI, 0); g.fill();
            }
          });
        }
        for (let k = 0; k < 5; k++) {
          const cx = (k + 0.3 + hp(k, 5, 35) * 0.4) * (SW / 5), h = 190 + hp(k, 5, 36) * 70, w = 22 + hp(k, 5, 37) * 10;
          wrap3(g, cx, xx => {
            g.fillStyle = col;
            g.beginPath(); g.moveTo(xx - w * 0.65, B); g.lineTo(xx - w / 2, B - h); g.lineTo(xx + w / 2, B - h); g.lineTo(xx + w * 0.65, B); g.closePath(); g.fill();
            g.fillRect(xx - w / 2 - 4, B - h, w + 8, 7);
            g.fillStyle = rgba(P.lit, 0.12); g.fillRect(xx - w / 2, B - h + 22, w, 2); g.fillRect(xx - w / 2, B - h + 30, w, 2);
          });
        }
        // 파이프
        g.strokeStyle = col; g.lineWidth = 6;
        for (let k = 0; k < 6; k++) {
          const x = k * (SW / 6) + 60, y = B - 30 - hp(k, 6, 38) * 30;
          g.beginPath(); g.moveTo(x, B); g.lineTo(x, y); g.lineTo(x + 140, y); g.lineTo(x + 140, B); g.stroke();
        }
      },
    },
    spires: {
      far(g, th, P) {
        for (let i = 0; i < 40; i++) {
          const cx = (i + hp(i, 40, 40)) * (SW / 40), h = 110 + hp(i, 40, 41) * 190, w = 6 + hp(i, 40, 42) * 12;
          wrap3(g, cx, x => {
            g.fillStyle = P.far;
            g.beginPath(); g.moveTo(x - w / 2, B + 40); g.lineTo(x - w / 2, B - h * 0.75); g.lineTo(x, B - h); g.lineTo(x + w / 2, B - h * 0.75); g.lineTo(x + w / 2, B + 40); g.closePath(); g.fill();
          });
        }
        g.fillStyle = P.far; g.fillRect(0, B - 20, SW, 60);
      },
      mid(g, th, P) {
        const col = P.mid;
        for (let i = 0; i < 18; i++) {
          const cx = (i + 0.2 + hp(i, 18, 43) * 0.6) * (SW / 18), w = 20 + hp(i, 18, 44) * 28, h = 90 + hp(i, 18, 45) * 130, tip = 40 + hp(i, 18, 46) * 70;
          wrap3(g, cx, x => {
            g.fillStyle = col;
            g.beginPath(); g.moveTo(x - w / 2 - 6, B + 40); g.lineTo(x - w / 2, B - h); g.lineTo(x, B - h - tip); g.lineTo(x + w / 2, B - h); g.lineTo(x + w / 2 + 6, B + 40); g.closePath(); g.fill();
            // 가는 띠 장식
            g.fillStyle = rgba(P.lit, 0.16);
            for (let y = B - h + 14; y < B - 20; y += 34) g.fillRect(x - w / 2, y, w, 1);
            // 첨탑 끝 바늘
            g.fillStyle = col; g.fillRect(x - 0.75, B - h - tip - 22, 1.5, 22);
            g.fillStyle = rgba(P.lit, 0.5); g.fillRect(x - 1, B - h - tip - 24, 2, 2);
          });
        }
        // 첨탑 사이 다리
        g.fillStyle = col;
        for (let i = 0; i < 6; i++) { const x = i * (SW / 6) + hp(i, 6, 47) * 100, y = B - 60 - hp(i, 6, 48) * 60; g.fillRect(x, y, 90 + hp(i, 6, 49) * 60, 4); }
        g.fillRect(0, B - 10, SW, 50);
      },
    },
    ruins: {
      far(g, th, P) {
        for (let i = 0; i < 22; i++) {
          const cx = (i + hp(i, 22, 50)) * (SW / 22), w = 40 + hp(i, 22, 51) * 60, h = 70 + hp(i, 22, 52) * 160, a = (hp(i, 22, 53) - 0.5) * 0.18;
          wrap3(g, cx, x => ruin(g, x, w, h, a, P.far, i + 100, null));
        }
        g.fillStyle = P.far; g.fillRect(0, B - 12, SW, 52);
      },
      mid(g, th, P) {
        const col = P.mid;
        for (let i = 0; i < 13; i++) {
          const cx = (i + 0.2 + hp(i, 13, 54) * 0.6) * (SW / 13), w = 50 + hp(i, 13, 55) * 60, h = 60 + hp(i, 13, 56) * 150, a = (hp(i, 13, 57) - 0.5) * 0.26;
          wrap3(g, cx, x => ruin(g, x, w, h, a, col, i, P));
        }
        // 잔해 더미
        g.fillStyle = col;
        for (let i = 0; i < 24; i++) {
          const x = i * (SW / 24) + hp(i, 24, 58) * 60, r = 14 + hp(i, 24, 59) * 26;
          wrap3(g, x, xx => { g.beginPath(); g.moveTo(xx - r * 1.6, B + 2); g.lineTo(xx - r * 0.5, B - r * 0.8); g.lineTo(xx + r * 0.3, B - r * 0.6); g.lineTo(xx + r * 1.4, B + 2); g.closePath(); g.fill(); });
        }
        g.fillRect(0, B - 2, SW, 42);
      },
    },
  };
  // 부서진 건물: 기울어진 몸통 + 들쭉날쭉한 윗면 + 빈 창 + 철근
  function ruin(g, x, w, h, a, col, seed, P) {
    g.save(); g.translate(x, B + 6); g.rotate(a);
    g.beginPath(); g.moveTo(-w / 2, 40); g.lineTo(-w / 2, -h * (0.75 + hash(seed + 0.1) * 0.25));
    const n = 5;
    for (let k = 1; k < n; k++) g.lineTo(-w / 2 + w * k / n, -h * (0.55 + hash(seed + k * 0.37) * 0.45));
    g.lineTo(w / 2, -h * (0.6 + hash(seed + 0.9) * 0.4)); g.lineTo(w / 2, 40); g.closePath();
    g.fillStyle = col; g.fill();
    if (P) {
      // 빈 창(불 꺼짐) — 어두운 구멍만
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let wy = -18; wy > -h * 0.5; wy -= 18) for (let wx = -w / 2 + 7; wx < w / 2 - 10; wx += 13) if (hash(wx * 0.31 + wy * 0.17 + seed) > 0.45) g.fillRect(wx, wy, 6, 9);
      // 철근
      g.strokeStyle = rgba(P.fog, 0.9); g.lineWidth = 1.2; g.beginPath();
      for (let k = 0; k < 3; k++) { const rx = -w / 2 + w * (0.2 + k * 0.3), ry = -h * (0.55 + hash(seed + k * 0.37) * 0.3); g.moveTo(rx, ry); g.lineTo(rx + (hash(seed + k) - 0.5) * 10, ry - 10 - hash(seed + k * 2) * 12); }
      g.stroke();
    }
    g.restore();
  }

  // ===== 하늘 장식 (캐시 스프라이트) =====
  function moonSprite(theme, P) {
    return layer('moon' + P.key, 280, 280, g => {
      const c = 140, R = 46, pale = mix('#d9fff4', theme.accent, 0.15);
      const hg = g.createRadialGradient(c, c, R * 0.8, c, c, 138);
      hg.addColorStop(0, rgba(pale, 0.12)); hg.addColorStop(1, rgba(pale, 0));
      g.fillStyle = hg; g.fillRect(0, 0, 280, 280);
      const dg = g.createLinearGradient(0, c - R, 0, c + R);
      dg.addColorStop(0, mix(pale, P.fog, 0.15)); dg.addColorStop(1, mix(pale, P.fog, 0.45));
      g.globalAlpha = 0.7; g.fillStyle = dg; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
      g.globalAlpha = 1; g.fillStyle = rgba(P.fog, 0.18);
      [[-14, -10, 9], [12, 8, 12], [-6, 20, 6], [18, -18, 5]].forEach(q => { g.beginPath(); g.arc(c + q[0], c + q[1], q[2], 0, TAU); g.fill(); });
    });
  }
  function rustSunSprite(theme, P) {
    return layer('rsun' + P.key, 460, 460, g => {
      const c = 230, R = 160, col = mix(mix(theme.accent, '#b8321a', 0.5), P.fog, 0.45);
      const hg = g.createRadialGradient(c, c, R * 0.9, c, c, 228);
      hg.addColorStop(0, rgba(col, 0.12)); hg.addColorStop(1, rgba(col, 0));
      g.fillStyle = hg; g.fillRect(0, 0, 460, 460);
      const dg = g.createLinearGradient(0, c - R, 0, c + R);
      dg.addColorStop(0, rgba(col, 0.36)); dg.addColorStop(1, rgba(col, 0.16));
      g.fillStyle = dg; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    });
  }
  function crackedSunSprite(theme, P) {
    return layer('csun' + P.key, 320, 320, g => {
      const c = 160, R = 74;
      const top = mix(mix(theme.accent, '#ffffff', 0.25), P.fog, 0.35), bot = mix(theme.accent, theme.bg2, 0.7);
      const hg = g.createRadialGradient(c, c, R * 0.8, c, c, 158);
      hg.addColorStop(0, rgba(theme.accent, 0.08)); hg.addColorStop(1, rgba(theme.accent, 0));
      g.fillStyle = hg; g.fillRect(0, 0, 320, 320);
      const dg = g.createLinearGradient(0, c - R, 0, c + R);
      dg.addColorStop(0, top); dg.addColorStop(1, bot);
      // 금 간 선 (위→아래 지그재그)
      const crack = [c - 10, c - R - 4, c + 6, c - 40, c - 8, c - 12, c + 12, c + 14, c - 2, c + 44, c + 10, c + R + 4];
      const half = (side, dx, dy, rot) => {
        g.save();
        g.beginPath(); g.moveTo(crack[0], crack[1]);
        for (let k = 2; k < crack.length; k += 2) g.lineTo(crack[k], crack[k + 1]);
        g.lineTo(side < 0 ? 0 : 320, 320); g.lineTo(side < 0 ? 0 : 320, 0); g.closePath(); g.clip();
        g.translate(c + dx, c + dy); g.rotate(rot); g.translate(-c, -c);
        g.globalAlpha = 0.5; g.fillStyle = dg; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
        g.globalAlpha = 1; g.fillStyle = rgba(theme.bg2, 0.55);
        for (let k = 0; k < 5; k++) { const yy = 18 + k * 13; g.fillRect(c - R, c + yy, R * 2, 2 + k * 1.2); }
        g.restore();
      };
      half(-1, 0, 0, 0); half(1, 7, 9, 0.06);
      // 떨어져 나간 조각
      g.fillStyle = rgba(top, 0.55);
      [[c + R + 18, c - 30, 7], [c + R + 34, c - 4, 4], [c + R + 10, c + 20, 3]].forEach(q => { g.beginPath(); g.moveTo(q[0], q[1] - q[2]); g.lineTo(q[0] + q[2], q[1] + q[2] * 0.6); g.lineTo(q[0] - q[2] * 0.8, q[1] + q[2] * 0.4); g.closePath(); g.fill(); });
    });
  }
  function auroraStrip(theme, P) {
    return layer('aur' + P.key, SW, 260, g => {
      const bands = [
        { col: mix(theme.accent2, P.fog, 0.35), y: 120, amp: 38, k: 3, ph: 0.4, len: 90, a: 0.16 },
        { col: mix(theme.accent, P.fog, 0.25), y: 160, amp: 30, k: 2, ph: 2.1, len: 70, a: 0.13 },
      ];
      for (const b of bands) {
        const lg = g.createLinearGradient(0, -1, 0, 0);
        lg.addColorStop(0, rgba(b.col, 0)); lg.addColorStop(0.7, rgba(b.col, b.a)); lg.addColorStop(1, rgba(b.col, b.a * 0.3));
        g.fillStyle = lg;
        for (let x = 0; x < SW; x += 3) {
          const u = x / SW * TAU;
          const yc = b.y + Math.sin(u * b.k + b.ph) * b.amp + Math.sin(u * (b.k * 3 + 1) + b.ph * 2) * b.amp * 0.25;
          const len = b.len * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(u * (b.k + 2) + b.ph * 3)));
          g.save(); g.translate(x, yc); g.scale(1, len); g.fillRect(0, -1, 3, 1); g.restore();
        }
      }
    });
  }
  function starStrip(n, seed, h) {
    return layer('stars' + n + '_' + seed + '_' + h, SW, h, g => {
      const r = G.mulberry ? G.mulberry(seed) : Math.random;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const x = r() * SW, y = r() * h, big = r() < 0.1;
        g.globalAlpha = 0.12 + r() * 0.35;
        g.fillRect(x, y, big ? 2 : 1.3, big ? 2 : 1.3);
      }
    });
  }
  function gearSprite(r, teeth, P) {
    return layer('gear' + r + '_' + teeth + P.key, r * 2 + 24, r * 2 + 24, g => {
      const c = r + 12, ro = r + 10;
      g.fillStyle = mix(P.far, P.mid, 0.45);
      g.beginPath();
      for (let k = 0; k < teeth; k++) {
        const a0 = k / teeth * TAU, da = TAU / teeth;
        g.lineTo(c + Math.cos(a0) * r, c + Math.sin(a0) * r);
        g.lineTo(c + Math.cos(a0 + da * 0.15) * ro, c + Math.sin(a0 + da * 0.15) * ro);
        g.lineTo(c + Math.cos(a0 + da * 0.45) * ro, c + Math.sin(a0 + da * 0.45) * ro);
        g.lineTo(c + Math.cos(a0 + da * 0.6) * r, c + Math.sin(a0 + da * 0.6) * r);
      }
      g.closePath(); g.fill();
      // 바퀴살만 남기고 속을 비움
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(c, c, r * 0.72, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.save(); g.translate(c, c);
      for (let k = 0; k < 5; k++) { g.rotate(TAU / 5); g.fillRect(-r * 0.06, 0, r * 0.12, r * 0.74); }
      g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(0, 0, r * 0.08, 0, TAU); g.fill();
      g.restore();
    });
  }
  const GEARS = [];
  for (let i = 0; i < 6; i++) GEARS.push({ x: (i + 0.15 + hash(i * 3.1 + 70) * 0.7) * (SW / 6), r: Math.round(45 + hash(i * 1.7 + 71) * 60), y: 30 + hash(i + 72) * 70, dir: i % 2 ? 1 : -1, teeth: 10 + Math.floor(hash(i + 73) * 8) });

  // ===== 빠른 먼지/입자 층 (시차 0.6, 결정적 움직임, 깜빡임 없음) =====
  const MOTE_N = 32;
  const MOTES = [];
  for (let i = 0; i < MOTE_N; i++) MOTES.push({ x: hash(i * 2.3 + 1), y: hash(i * 5.1 + 2), v: 0.6 + hash(i * 7.7 + 3) * 0.8, ph: hash(i * 9.3 + 4) * TAU, s: hash(i * 3.3 + 5) });
  function drawMotes(ctx, scene, theme, P, camX, t, oy) {
    const span = W + 120, top = GROUND_Y - 330, hgt = 360;
    const wx = x => { let v = x % span; if (v < 0) v += span; return v - 60; };
    const wy = y => { let v = y % hgt; if (v < 0) v += hgt; return top + v + oy; };
    const px = camX * 0.6;
    let col, a;
    switch (scene) {
      case 'ziggurat': // 떠오르는 빛 조각
        col = mix(theme.accent, P.fog, 0.35); ctx.fillStyle = col;
        for (const m of MOTES) {
          const y = wy(m.y * hgt - t * 14 * m.v), x = wx(m.x * span - px + Math.sin(t * 0.4 + m.ph) * 8);
          const f = Math.min(1, (y - top + 10) / 120); // 위로 갈수록 사라짐
          ctx.globalAlpha = 0.12 * Math.max(0, f); const s = 2 + m.s * 3; ctx.fillRect(x, y, s, s);
        }
        break;
      case 'gears': // 왼쪽 위로 날리는 불씨
        col = mix(theme.accent, P.fog, 0.3); ctx.fillStyle = col;
        for (const m of MOTES) {
          const y = wy(m.y * hgt - t * 26 * m.v + Math.sin(t * 1.3 + m.ph) * 6), x = wx(m.x * span - px - t * 22 * m.v);
          const f = Math.min(1, (y - top) / 90);
          ctx.globalAlpha = 0.16 * Math.max(0, f); ctx.fillRect(x, y, 2, 2);
        }
        break;
      case 'spires': // 위로 내리는 비
        col = mix(theme.accent2, P.fog, 0.4); ctx.fillStyle = col;
        for (const m of MOTES) {
          const len = 12 + m.s * 16, y = wy(m.y * hgt - t * (260 + 200 * m.v)), x = wx(m.x * span - px);
          ctx.globalAlpha = 0.1 + 0.05 * m.s; ctx.fillRect(x, y, 1, len);
        }
        break;
      case 'ruins': { // 재 + 아지랑이 띠
        col = mix('#b9a9b8', P.fog, 0.35); ctx.fillStyle = col;
        for (const m of MOTES) {
          const y = wy(m.y * hgt + t * 12 * m.v), x = wx(m.x * span - px + Math.sin(t * 0.7 + m.ph) * 14 - t * 6);
          ctx.globalAlpha = 0.12; const s = 1.5 + m.s * 1.8; ctx.fillRect(x, y, s, s * 0.7);
        }
        ctx.fillStyle = mix(theme.accent, P.fog, 0.5);
        for (let k = 0; k < 3; k++) {
          const y = GROUND_Y - 40 - k * 46 + Math.sin(t * 0.5 + k * 2) * 6 + oy;
          ctx.globalAlpha = 0.03; ctx.fillRect(-40, y, W + 80, 3 + k);
        }
        break;
      }
      default: // 떠다니는 먼지
        col = mix(theme.accent, P.fog, 0.45); ctx.fillStyle = col;
        for (const m of MOTES) {
          const y = wy(m.y * hgt + Math.sin(t * 0.5 + m.ph) * 10), x = wx(m.x * span - px - t * 8 * m.v);
          ctx.globalAlpha = 0.1; const s = 1.5 + m.s * 1.5; ctx.fillRect(x, y, s, s);
        }
    }
    ctx.globalAlpha = 1;
  }

  // 박자 반응: 순간적으로 튀지 않게 부드럽게 따라가는 값(밝기 변화 5% 미만으로만 사용)
  let amb = 0, barAmb = 0, ambT = 0;
  const STAR_N = { city: 90, ziggurat: 70, gears: 24, spires: 80, ruins: 36 };

  function drawBackground(ctx, theme, camX, camY, t, bt) {
    const dt = Math.max(0, Math.min(0.1, t - ambT)); ambT = t;
    amb += (bt.pulse - amb) * Math.min(1, dt * 6);
    barAmb += (bt.barPulse - barAmb) * Math.min(1, dt * 1.5);
    const scene = SCENES[theme.scene] ? theme.scene : 'city';
    const S = SCENES[scene];
    const P = palette(theme);
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
    // (화면 전체 박자 번쩍임은 눈이 피로해서 제거 — 박자는 지평선 빛으로만, 아주 약하게)
    const oy = camY * 0.15;
    // 별(캐시 띠) + 밝은 별 몇 개만 천천히 반짝
    const sh = Math.max(60, Math.round(GROUND_Y - 90));
    drawStrip(ctx, starStrip(STAR_N[scene], 777 + scene.length, sh), 0.03, camX, oy * 0.5);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      const s = STARS[i];
      let x = (s.x - camX * 0.03) % (W + 40); if (x < -20) x += W + 40;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.8 * s.d + s.ph);
      ctx.fillRect(x, s.y * (GROUND_Y - 120) + oy * 0.5, 2, 2);
    }
    ctx.globalAlpha = 1;
    // 하늘 장식
    const spr = (c, x, y, k) => { if (c) { const w = c.lw * k, h = c.lh * k; ctx.drawImage(c, x - w / 2, y - h / 2, w, h); } };
    if (scene === 'city') {
      // 레트로 태양 (지면 기준 높이 → 화면 비율이 바뀌어도 지평선에 걸침)
      const sunX = W * 0.72, sunY = GROUND_Y - 180 + oy * 0.4, sunR = 105 + amb * 2;
      glow(ctx, sunX, sunY, 5.2, theme.accent2, 0.3 + 0.04 * amb);
      const sg = cachedGrad(ctx, 'sun' + theme.accent + theme.accent2, () => {
        const g = ctx.createLinearGradient(0, -110, 0, 110);
        g.addColorStop(0, '#fff3a8'); g.addColorStop(0.45, theme.accent2); g.addColorStop(1, mix(theme.accent2, theme.bg2, 0.6));
        return g;
      });
      ctx.save(); ctx.translate(sunX, sunY);
      ctx.fillStyle = sg; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(0, 0, sunR, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, sunR + 1, 0, TAU); ctx.clip();
      ctx.fillStyle = mix(theme.bg2, theme.bg, 0.3);
      for (let k = 0; k < 7; k++) {
        const yy = 10 + k * 14 + ((t * 12) % 14), hh = 2 + k * 1.3;
        if (yy < sunR) ctx.fillRect(-sunR, yy, sunR * 2, hh);
      }
      ctx.restore();
    } else if (scene === 'ziggurat') {
      spr(moonSprite(theme, P), W * 0.7, GROUND_Y - 280 + oy * 0.4, 1 + amb * 0.02);
    } else if (scene === 'gears') {
      spr(rustSunSprite(theme, P), W * 0.6, GROUND_Y - 70 + oy * 0.4, 1);
      // 불씨 안개(지평선 쪽 따뜻한 연무)
      const eg = cachedGrad(ctx, 'ember' + P.key, () => {
        const g = ctx.createLinearGradient(0, -260, 0, 0);
        g.addColorStop(0, rgba(theme.accent, 0)); g.addColorStop(1, rgba(mix(theme.accent, P.fog, 0.5), 0.12));
        return g;
      });
      ctx.save(); ctx.translate(0, GROUND_Y + oy); ctx.fillStyle = eg; ctx.fillRect(-40, -260, W + 80, 260); ctx.restore();
    } else if (scene === 'spires') {
      const c = auroraStrip(theme, P);
      if (c) drawStrip(ctx, c, 0.02, camX + t * 60, GROUND_Y - 430 + oy * 0.3);
    } else if (scene === 'ruins') {
      spr(crackedSunSprite(theme, P), W * 0.68, GROUND_Y - 260 + oy * 0.4, 1 + amb * 0.02);
      // 지평선의 붉은 '코어' 빛: 마디(4박)마다 천천히 숨쉼
      const cg = cachedGrad(ctx, 'core' + P.key, () => {
        const g = ctx.createLinearGradient(0, -170, 0, 0);
        g.addColorStop(0, rgba(theme.accent, 0)); g.addColorStop(1, rgba(mix(theme.accent, theme.bg2, 0.45), 0.22));
        return g;
      });
      ctx.save(); ctx.translate(0, GROUND_Y + oy); ctx.globalAlpha = 0.8 + 0.2 * barAmb;
      ctx.fillStyle = cg; ctx.fillRect(-40, -170, W + 80, 170); ctx.restore(); ctx.globalAlpha = 1;
    }
    // 먼 층
    const stripY = k => GROUND_Y - STRIP_BASE + oy * k;
    const far = layer('far' + scene + P.key, SW, STRIP_H, g => S.far(g, theme, P));
    drawStrip(ctx, far, 0.08, camX, stripY(1));
    // 3: 천천히 도는 톱니바퀴 (시차 0.12)
    if (scene === 'gears') {
      const gx = camX * 0.12;
      for (let i = 0; i < GEARS.length; i++) {
        const q = GEARS[i], c = gearSprite(q.r, q.teeth, P);
        if (!c) continue;
        let x = (q.x - gx) % SW; if (x < -q.r - 20) x += SW;
        if (x > W + q.r + 20) continue;
        ctx.save(); ctx.translate(x, GROUND_Y - q.y + oy * 1.2); ctx.rotate(t * 0.12 * q.dir + i);
        ctx.drawImage(c, -c.lw / 2, -c.lh / 2, c.lw, c.lh); ctx.restore();
      }
    }
    // 가까운 층
    const mid = layer('mid' + scene + P.key, SW, STRIP_H, g => S.mid(g, theme, P));
    drawStrip(ctx, mid, 0.28, camX, stripY(1.6));
    // 띠 아래(카메라가 높이 올라갔을 때) 빈틈 메움
    const below = stripY(1.6) + STRIP_H;
    if (below < H + 40) { ctx.fillStyle = P.mid; ctx.fillRect(-40, below - 1, W + 80, H + 41 - below); }
    // 지평선 안개: 스카이라인 아래쪽을 안개색으로 덮어서 지면과 분리
    const hz = cachedGrad(ctx, 'haze' + P.fog, () => {
      const g = ctx.createLinearGradient(0, -140, 0, 0);
      g.addColorStop(0, rgba(P.fog, 0)); g.addColorStop(1, rgba(P.fog, 0.4));
      return g;
    });
    ctx.save(); ctx.translate(0, GROUND_Y + camY);
    ctx.fillStyle = hz; ctx.fillRect(-40, -140, W + 80, 140);
    // 지평선 글로우 (박자에 아주 약하게)
    ctx.globalCompositeOperation = 'lighter';
    const hg = cachedGrad(ctx, 'hz' + theme.accent, () => {
      const g = ctx.createLinearGradient(0, -120, 0, 0);
      g.addColorStop(0, rgba(theme.accent, 0)); g.addColorStop(1, rgba(theme.accent, 0.35));
      return g;
    });
    ctx.globalAlpha = 0.3 + 0.06 * amb;
    ctx.fillStyle = hg; ctx.fillRect(-40, -120, W + 80, 120);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 빠른 입자 층
    drawMotes(ctx, scene, theme, P, camX, t, oy);
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
    ctx.strokeStyle = rgba(theme.accent, 0.5); ctx.lineWidth = 2; ctx.stroke();
    // 윗면: 밟을 수 있는 면을 밝게 강조
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    neonStroke(ctx, theme.accent, 3 + pulse * 0.6, false);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 2, y, w - 4, 2);
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
  // 체크포인트: 바닥에 꽂힌 깃발(먹이 다이아몬드와 다른 모양)
  function drawCheckpoints(ctx, cps, t) {
    if (!cps || !cps.length) return;
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i], last = i === cps.length - 1;
      const px = c.x, py = -(c.y || 0), top = py - 58;
      ctx.fillStyle = KEYLINE; ctx.fillRect(px - 2, top - 1, 5, 60);
      ctx.fillStyle = rgba('#ffffff', last ? 0.85 : 0.45); ctx.fillRect(px - 0.5, top, 2, 58);
      const wv = Math.sin(t * 5 + i) * 2.5;
      ctx.beginPath(); ctx.moveTo(px + 1, top); ctx.quadraticCurveTo(px + 12, top + 2 + wv, px + 24, top + 8 + wv * 0.5);
      ctx.lineTo(px + 1, top + 17); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = KEYLINE; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = last ? CP_COL : rgba(CP_COL, 0.35); ctx.fill();
      if (last) glow(ctx, px + 10, top + 8, 0.35, CP_COL, 0.4);
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
    const sv = Math.max(-1.2, Math.min(1.2, rs.sv));
    const sqX = 1 - 0.18 * sv, sqY = 1 + 0.22 * sv;
    ctx.save(); ctx.translate(pc.x, -(pc.y - s / 2));
    drawCube(ctx, s, curRot(st), sqX, sqY, { vy: st.vy || 0, blink: rs.blink > 0 || rs.sv < -0.45 });
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
    // (배경 쪽에서 안개로 대비를 낮췄으므로 덮개는 옅게: 위쪽 하늘은 덜, 플레이 띠는 조금 더)
    ctx.fillStyle = cachedGrad(ctx, 'dim' + GROUND_Y, () => {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, 'rgba(2,3,10,0.16)'); g.addColorStop(0.55, 'rgba(2,3,10,0.26)'); g.addColorStop(1, 'rgba(2,3,10,0.3)');
      return g;
    });
    ctx.fillRect(-20, -20, W + 40, H + 40);
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
    // 2단 점프 등에서 큐브를 '통' 늘려줌
    kick(v) { rs.sv = v == null ? 1 : v; rs.sp = 0; },
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
