'use strict';
// 공통: 캔버스, 유틸, 그리기, 글로우 스프라이트, 저장 (docs/SPEC.md §3)
window.G = window.G || {};
(() => {
  const G = window.G;
  const TAU = Math.PI * 2;
  // 논리 화면 크기: 기본 960×540(16:9). 화면 비율에 맞춰 resize()에서 넓이/높이를 늘림
  G.W = 960; G.H = 540; G.TAU = TAU;
  G.resizeHooks = [];
  G.onResize = fn => { G.resizeHooks.push(fn); };
  G.FONT = '"KenneyFuture","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';

  // ===== 캔버스 =====
  const canvas = typeof document !== 'undefined' && document.getElementById ? document.getElementById('game') : null;
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  G.canvas = canvas; G.ctx = ctx;
  G.scale = 1; G.dpr = 1; G.ox = 0; G.oy = 0;
  // 터치가 주 입력인 기기(폰·태블릿)인지: PC(마우스)는 창이 세로여도 회전 안내를 띄우지 않음
  const mq = q => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  G.isTouch = () => mq('(pointer: coarse)') || (!mq('(pointer: fine)') && (navigator.maxTouchPoints || 0) > 0);
  // env(safe-area-inset-*)는 JS에서 직접 못 읽으므로 숨긴 요소의 padding으로 읽음
  G.SAFE = { l: 0, r: 0, t: 0, b: 0 };
  let probe = null;
  function readInsets() {
    try {
      if (!probe) probe = document.getElementById('safe-probe');
      if (!probe) return { t: 0, r: 0, b: 0, l: 0 };
      const cs = getComputedStyle(probe), f = v => parseFloat(v) || 0;
      return { t: f(cs.paddingTop), r: f(cs.paddingRight), b: f(cs.paddingBottom), l: f(cs.paddingLeft) };
    } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
  }
  G.resize = () => {
    if (!canvas) return;
    let vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    // 폰을 세로로 들고 있으면 '돌려주세요' 대신 캔버스를 90° 돌려서 바로 가로 화면으로 보여줌
    G.portrait = false;
    G.rotated = G.isTouch() && vh > vw * 1.05;
    if (G.rotated) { const t = vw; vw = vh; vh = t; }
    // 1) 화면 비율에 맞춰 논리 크기 결정 → 폰마다 검은 띠 없이 꽉 채움
    //    길쭉한 폰(19.5:9 등): 높이 540 고정, 가로를 넓힘(앞이 더 보임)
    //    태블릿(4:3 등): 가로 960 고정, 세로를 늘림(하늘이 더 보임)
    const aspect = Math.max(4 / 3, Math.min(2.4, vw / vh));
    let w, h;
    if (aspect >= 16 / 9) { h = 540; w = 540 * aspect; } else { w = 960; h = 960 / aspect; }
    // 2) CSS 픽셀 정수로 맞춰서 흐림 방지
    const scale = Math.min(vw / w, vh / h);
    const cssW = Math.max(1, Math.round(w * scale)), cssH = Math.max(1, Math.round(h * scale));
    // 3) 기기 해상도(DPR)대로 선명하게. 너무 큰 화면은 성능을 위해 총 픽셀 수 제한
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    const maxPx = 4.2e6;
    if (cssW * cssH * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (cssW * cssH));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.transform = 'translate(-50%,-50%)' + (G.rotated ? ' rotate(90deg)' : '');
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    G.scale = cssW / w;
    G.W = w; G.H = cssH / G.scale;
    G.dpr = canvas.width / cssW;
    // 4) 노치·둥근 모서리·홈 바(safe-area): 캔버스와 겹치는 만큼만 논리 px로 저장
    //    90° 돌려 그릴 때: 화면 위 = 논리 왼쪽, 화면 아래 = 논리 오른쪽, 화면 오른쪽 = 논리 위, 화면 왼쪽 = 논리 아래
    const ins = readInsets();
    const physW = G.rotated ? cssH : cssW, physH = G.rotated ? cssW : cssH;
    const mx = (window.innerWidth - physW) / 2, my = (window.innerHeight - physH) / 2;
    const ov = (v, m) => Math.max(0, v - Math.max(0, m)) / G.scale;
    const pt = ov(ins.t, my), pb = ov(ins.b, my), pL = ov(ins.l, mx), pR = ov(ins.r, mx);
    G.SAFE = G.rotated ? { l: pt, r: pb, t: pR, b: pL } : { l: pL, r: pR, t: pt, b: pb };
    for (const fn of G.resizeHooks) { try { fn(); } catch (e) { console.warn(e); } }
  };
  if (canvas) {
    window.addEventListener('resize', G.resize);
    // 일부 iOS에서는 회전 직후 resize 시점에 innerWidth/Height가 아직 옛 값 → 잠시 뒤 한 번 더
    window.addEventListener('orientationchange', () => setTimeout(G.resize, 300));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', G.resize);
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
  const KEY = 'neondash-save';  // 저장 키는 예전 이름 그대로(바꾸면 기록이 사라짐)
  const DEFAULT = () => ({ v: 1, sfx: true, music: true, haptics: true, practiceHint: false, totalAttempts: 0, totalJumps: 0, levels: {} });
  let data = DEFAULT();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.v === 1) data = Object.assign(DEFAULT(), raw);
    if (!data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels)) data.levels = {};
  } catch (e) { /* 저장소 사용 불가 */ }
  // ── 기록 보호: localStorage 외에 IndexedDB에도 같은 기록을 복사해 둠 ──
  // localStorage가 비어 있으면(정리·저장소 분리 등) IndexedDB 복사본에서 되살린다.
  const IDB = 'neonjump', STORE = 'kv';
  const idb = cb => {
    try {
      if (typeof indexedDB === 'undefined') return;
      const req = indexedDB.open(IDB, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (e) { /* 이미 있음 */ } };
      req.onsuccess = () => { try { cb(req.result); } catch (e) { /* 무시 */ } };
    } catch (e) { /* 미지원 */ }
  };
  const idbPut = json => idb(db => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(json, KEY); });
  const hadLocal = (() => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } })();
  const hasProgress = d => d && d.levels && Object.keys(d.levels).length > 0;
  if (!hadLocal) {
    idb(db => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      r.onsuccess = () => {
        try {
          const raw = r.result ? JSON.parse(r.result) : null;
          if (raw && raw.v === 1 && hasProgress(raw) && !hasProgress(data)) {
            Object.assign(data, DEFAULT(), raw);
            try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 무시 */ }
          }
        } catch (e) { /* 손상된 복사본 무시 */ }
      };
    });
  } else {
    try { idbPut(localStorage.getItem(KEY)); } catch (e) { /* 무시 */ }
  }
  // 브라우저에게 '이 사이트 데이터는 자동 정리하지 말아 달라'고 요청
  G.requestPersist = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 미지원 */ } };
  G.save = {
    get data() { return data; },
    persist() {
      const json = JSON.stringify(data);
      try { localStorage.setItem(KEY, json); } catch (e) { /* 무시 */ }
      idbPut(json);
    },
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
    try {
      const ua = navigator.userActivation;
      if (ua && !ua.hasBeenActive) return; // 사용자가 화면을 누르기 전엔 브라우저가 막음
      if (data.haptics && navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* 미지원 */ }
  };
})();
