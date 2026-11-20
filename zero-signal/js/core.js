(() => {
  'use strict';
  const G = (window.G = window.G || {});
  G.W = 1280;
  G.H = 720;
  G.TAU = Math.PI * 2;
  G.FONT = 'Inter, Pretendard, system-ui, sans-serif';
  G.canvas = typeof document !== 'undefined' ? document.getElementById('game') : null;
  G.ctx = G.canvas ? G.canvas.getContext('2d', { alpha: false }) : null;
  // [resize] 화면 맞춤 (NEON JUMP 방식). 논리 높이 720 고정, 게임 영역(G.W=1280)은 그대로 두고
  // 가로가 긴 화면은 논리 전체 폭 G.VW(1280..1600)를 늘림 → 좌우 G.AX 만큼 여백(gutter)이 생김.
  // main.js 가 scene.draw 전에 translate(G.AX, 0) 하므로 장면 좌표는 0..1280 그대로.
  G.VW = 1280;
  G.AX = 0;
  G.scale = 1;
  G.dpr = 1;
  G.rotated = false;
  G.SAFE = { l: 0, r: 0, t: 0, b: 0 };
  G.resizeHooks = [];
  G.onResize = (fn) => G.resizeHooks.push(fn);
  const mq = (q) => {
    try {
      return !!(typeof matchMedia !== 'undefined' && matchMedia(q).matches);
    } catch {
      return false;
    }
  };
  G.isTouch = () =>
    mq('(pointer: coarse)') ||
    (!mq('(pointer: fine)') && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0);
  let probe = null;
  const readInsets = () => {
    try {
      if (!probe) probe = document.getElementById('safe-probe');
      if (!probe) return { t: 0, r: 0, b: 0, l: 0 };
      const cs = getComputedStyle(probe),
        f = (v) => parseFloat(v) || 0;
      return { t: f(cs.paddingTop), r: f(cs.paddingRight), b: f(cs.paddingBottom), l: f(cs.paddingLeft) };
    } catch {
      return { t: 0, r: 0, b: 0, l: 0 };
    }
  };
  G.resize = () => {
    const canvas = G.canvas;
    if (!canvas || typeof innerWidth === 'undefined') return;
    let vw = Math.max(1, innerWidth),
      vh = Math.max(1, innerHeight);
    // 폰을 세로로 들면 '돌려주세요' 대신 캔버스를 90° 돌려 바로 가로 화면으로 보여줌
    G.rotated = G.isTouch() && vh > vw * 1.05;
    if (G.rotated) [vw, vh] = [vh, vw];
    const h = 720,
      w = Math.max(1280, Math.min(1600, (h * vw) / vh));
    const scale = Math.min(vw / w, vh / h);
    const cssW = Math.max(1, Math.round(w * scale)),
      cssH = Math.max(1, Math.round(h * scale));
    let dpr = Math.min(devicePixelRatio || 1, 3);
    if (cssW * cssH * dpr * dpr > 4.2e6) dpr = Math.sqrt(4.2e6 / (cssW * cssH));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.transform = 'translate(-50%,-50%)' + (G.rotated ? ' rotate(90deg)' : '');
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    G.scale = cssW / w;
    G.VW = w;
    G.AX = (w - 1280) / 2;
    G.dpr = canvas.width / cssW;
    // 노치·둥근 모서리·홈 바: 캔버스와 겹치는 만큼만 논리 px 로 저장
    // 90° 돌려 그릴 때: 화면 위 = 논리 왼쪽, 화면 아래 = 논리 오른쪽, 화면 오른쪽 = 논리 위, 화면 왼쪽 = 논리 아래
    const ins = readInsets(),
      physW = G.rotated ? cssH : cssW,
      physH = G.rotated ? cssW : cssH,
      mx = (innerWidth - physW) / 2,
      my = (innerHeight - physH) / 2,
      ov = (v, m) => Math.max(0, v - Math.max(0, m)) / G.scale,
      pt = ov(ins.t, my),
      pb = ov(ins.b, my),
      pL = ov(ins.l, mx),
      pR = ov(ins.r, mx);
    G.SAFE = G.rotated ? { l: pt, r: pb, t: pR, b: pL } : { l: pL, r: pR, t: pt, b: pb };
    for (const fn of G.resizeHooks)
      try {
        fn();
      } catch (e) {
        console.warn(e);
      }
  };
  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.invLerp = (a, b, v) => G.clamp((v - a) / (b - a), 0, 1);
  G.smooth = (t) => t * t * (3 - 2 * t);
  G.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  G.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  G.randi = (a, b) => Math.floor(G.rand(a, b + 1));
  G.hypot = (x, y) => Math.sqrt(x * x + y * y);
  G.mulberry = (s) => () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  G.rr = (c, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
  };
  G.text = (c, s, x, y, size, color = '#fff', opt = {}) => {
    c.save();
    c.font = `${opt.weight || 700} ${size}px ${G.FONT}`;
    c.textAlign = opt.align || 'left';
    c.textBaseline = opt.base || 'middle';
    c.fillStyle = color;
    if (opt.alpha != null) c.globalAlpha = opt.alpha;
    if (opt.stroke) {
      c.lineWidth = opt.stroke;
      c.strokeStyle = opt.strokeColor || '#050711';
      c.strokeText(String(s), x, y, opt.maxW);
    }
    c.fillText(String(s), x, y, opt.maxW);
    c.restore();
  };
  const defaults = {
    version: 2,
    sfx: true,
    music: true,
    haptics: true,
    reduced: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    best: {},
    unlocked: 1,
    totalRuns: 0,
    totalGraze: 0,
  };
  // [save] localStorage + IndexedDB 복사본 (NEON JUMP 방식). 저장 키는 그대로 유지(바꾸면 기록 소실)
  const KEY = 'zero-signal-save';
  const valid = (d) => d && typeof d === 'object' && !Array.isArray(d) && d.version === 2;
  const hasProgress = (d) =>
    !!d && ((d.best && typeof d.best === 'object' && Object.keys(d.best).length > 0) || d.totalRuns > 0);
  const data = { ...defaults };
  let hadLocal = false;
  try {
    const json = localStorage.getItem(KEY);
    hadLocal = !!json;
    const raw = JSON.parse(json || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.assign(data, raw);
  } catch {}
  if (!data.best || typeof data.best !== 'object' || Array.isArray(data.best)) data.best = {};
  // localStorage 가 비어 있으면(정리·저장소 분리 등) IndexedDB 복사본에서 되살린다.
  const IDB = 'zerosignal',
    STORE = 'kv';
  const idb = (cb) => {
    try {
      if (typeof indexedDB === 'undefined') return;
      const req = indexedDB.open(IDB, 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore(STORE);
        } catch {}
      };
      req.onsuccess = () => {
        try {
          cb(req.result);
        } catch {}
      };
    } catch {}
  };
  const idbPut = (json) => idb((db) => db.transaction(STORE, 'readwrite').objectStore(STORE).put(json, KEY));
  G.saveRestored = false;
  if (!hadLocal) {
    idb((db) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      r.onsuccess = () => {
        try {
          const raw = r.result ? JSON.parse(r.result) : null;
          if (valid(raw) && hasProgress(raw)) {
            // 복원 전에 이미 시작한 판 수는 보존
            const runs = data.totalRuns;
            Object.assign(data, defaults, raw);
            data.totalRuns = Math.max(data.totalRuns || 0, runs);
            if (!data.best || typeof data.best !== 'object') data.best = {};
            try {
              localStorage.setItem(KEY, JSON.stringify(data));
            } catch {}
            G.saveRestored = true;
          }
        } catch {}
      };
    });
  } else {
    try {
      idbPut(localStorage.getItem(KEY));
    } catch {}
  }
  // 브라우저에게 '이 사이트 데이터는 자동 정리하지 말아 달라'고 요청 (첫 터치 때 main.js 가 호출)
  G.requestPersist = () => {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch {}
  };
  G.save = {
    data,
    persist() {
      const json = JSON.stringify(data);
      try {
        localStorage.setItem(KEY, json);
      } catch {}
      idbPut(json);
    },
    mission(id) {
      return data.best[id] || (data.best[id] = { score: 0, time: 0, clear: false, grade: '-', graze: 0 });
    },
  };
  G.vibrate = (p) => {
    try {
      const ua = navigator.userActivation;
      if (ua && !ua.hasBeenActive) return; // 첫 터치 전엔 브라우저가 막음
      if (data.haptics && navigator.vibrate) navigator.vibrate(p);
    } catch {}
  };
  G.PALETTE = {
    bg: '#050711',
    ink: '#eef7ff',
    muted: '#8291ad',
    cyan: '#4deeea',
    violet: '#a66cff',
    gold: '#ffd166',
    danger: '#ff3b6b',
    blue: '#4b8cff',
    panel: 'rgba(9,13,28,.86)',
  };
  G.particles = [];
  G.burst = (x, y, color, n = 12, speed = 180) => {
    if (G.save.data.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n && G.particles.length < 180; i++) {
      const a = Math.random() * G.TAU,
        v = G.rand(speed * 0.35, speed);
      G.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: G.rand(0.25, 0.65),
        max: 1,
        color,
        size: G.rand(2, 6),
      });
    }
  };
  G.updateParticles = (dt) => {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.02, dt);
      p.vy *= Math.pow(0.02, dt);
    }
  };
})();
