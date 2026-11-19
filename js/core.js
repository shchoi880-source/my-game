'use strict';
// 공통: 캔버스, 유틸, 그리기, 글로우 스프라이트, 저장 (docs/SPEC.md §3)
window.G = window.G || {};
(() => {
  const G = window.G;
  const W = 960, H = 540, TAU = Math.PI * 2;
  G.W = W; G.H = H; G.TAU = TAU;
  G.FONT = '"KenneyFuture","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';

  // ===== 캔버스 =====
  const canvas = typeof document !== 'undefined' && document.getElementById ? document.getElementById('game') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  G.canvas = canvas; G.ctx = ctx;
  G.scale = 1; G.dpr = 1; G.ox = 0; G.oy = 0;
  G.resize = () => {
    if (!canvas) return;
    G.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth, vh = window.innerHeight;
    G.scale = Math.min(vw / W, vh / H);
    G.portrait = vh > vw * 1.05;
    canvas.style.width = Math.floor(W * G.scale) + 'px';
    canvas.style.height = Math.floor(H * G.scale) + 'px';
    canvas.width = Math.floor(W * G.scale * G.dpr);
    canvas.height = Math.floor(H * G.scale * G.dpr);
  };
  if (canvas) {
    window.addEventListener('resize', G.resize);
    // 일부 iOS에서는 회전 직후 resize 시점에 innerWidth/Height가 아직 옛 값 → 잠시 뒤 한 번 더
    window.addEventListener('orientationchange', () => setTimeout(G.resize, 300));
    G.resize();
  }

  // ===== 유틸 =====
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randi = (a, b) => Math.floor(G.rand(a, b + 1));
  G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  G.easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  G.mulberry = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ===== 그리기 =====
  G.rr = (x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  G.circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); };
  G.text = (str, x, y, size, color, o) => {
    o = o || {};
    ctx.font = `${o.weight || 900} ${size}px ${G.FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    let s = String(str).replace(/%/g, '％');
    if (o.maxW) {
      while (s.length > 1 && ctx.measureText(s).width > o.maxW) s = s.slice(0, -1);
    }
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.stroke;
      ctx.strokeStyle = o.strokeColor || 'rgba(0,0,0,0.7)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
  G.textW = (str, size, weight) => { ctx.font = `${weight || 900} ${size}px ${G.FONT}`; return ctx.measureText(String(str)).width; };

  // ===== 글로우 스프라이트 (assets/fx.png) =====
  const frames = {};
  const tintCache = {};
  G.loadFx = async () => {
    const json = await fetch('assets/fx.json').then(r => r.json());
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/fx.png'; });
    for (const k of Object.keys(json.frames)) { const f = json.frames[k]; frames[k] = { img, x: f[0], y: f[1], w: f[2], h: f[3] }; }
  };
  G.loadFont = async () => {
    try {
      if (!window.FontFace) return;
      const ff = new FontFace('KenneyFuture', 'url(assets/kenney-future.ttf)');
      await ff.load();
      document.fonts.add(ff);
    } catch (e) { /* 시스템 폰트 사용 */ }
  };
  function tinted(name, color) {
    const key = name + color;
    if (tintCache[key]) return tintCache[key];
    const f = frames[name];
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, f.w, f.h);
    return (tintCache[key] = c);
  }
  G.spr = (name, x, y, o) => {
    const f = frames[name];
    if (!f || !ctx) return false;
    o = o || {};
    const sc = o.scale == null ? 1 : o.scale;
    const w = o.w || f.w * sc, h = o.h || f.h * sc;
    const img = o.tint ? tinted(name, o.tint) : f.img;
    const sx = o.tint ? 0 : f.x, sy = o.tint ? 0 : f.y;
    const prevA = ctx.globalAlpha;
    if (o.alpha != null) ctx.globalAlpha = prevA * o.alpha;
    if (o.add) ctx.globalCompositeOperation = 'lighter';
    if (o.rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot);
      ctx.drawImage(img, sx, sy, f.w, f.h, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else ctx.drawImage(img, sx, sy, f.w, f.h, x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = prevA;
    if (o.add) ctx.globalCompositeOperation = 'source-over';
    return true;
  };

  // ===== 저장 =====
  const KEY = 'neondash-save';
  const DEFAULT = () => ({ v: 1, sfx: true, music: true, haptics: true, practiceHint: false, totalAttempts: 0, totalJumps: 0, levels: {} });
  let data = DEFAULT();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.v === 1) data = Object.assign(DEFAULT(), raw);
    if (!data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels)) data.levels = {};
  } catch (e) { /* 저장소 사용 불가 */ }
  G.save = {
    get data() { return data; },
    persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 무시 */ } },
    level(id) {
      // 손상/구버전 저장 데이터 보정 (levels가 null/문자열, 항목 누락, coins 누락 등)
      if (!data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels)) data.levels = {};
      let l = data.levels[id];
      if (!l || typeof l !== 'object' || Array.isArray(l)) l = data.levels[id] = {};
      if (!(typeof l.best === 'number' && isFinite(l.best))) l.best = 0;
      if (!(typeof l.practiceBest === 'number' && isFinite(l.practiceBest))) l.practiceBest = 0;
      if (!(typeof l.attempts === 'number' && isFinite(l.attempts))) l.attempts = 0;
      if (typeof l.done !== 'boolean') l.done = !!l.done;
      if (!Array.isArray(l.coins)) l.coins = [false, false, false];
      if (!(typeof l.bestTime === 'number' && isFinite(l.bestTime))) l.bestTime = null;
      return l;
    },
    reset() { data = DEFAULT(); this.persist(); },
  };

  G.vibrate = p => {
    try { if (data.haptics && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 미지원 */ }
  };
})();
