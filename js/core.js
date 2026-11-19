'use strict';
// 공통: 캔버스, 유틸, 저장, 에셋(아틀라스) 로더, 스프라이트 그리기
window.MD = window.MD || {};
(() => {
  const MD = window.MD;
  const W = 420, H = 760, TAU = Math.PI * 2;
  MD.W = W; MD.H = H; MD.TAU = TAU;
  MD.FONT = '"KenneyFuture","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';

  // ===== 캔버스 =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  MD.canvas = canvas; MD.ctx = ctx;
  MD.scale = 1; MD.dpr = 1;
  MD.resize = () => {
    MD.dpr = Math.min(window.devicePixelRatio || 1, 2);
    MD.scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * MD.scale) + 'px';
    canvas.style.height = Math.floor(H * MD.scale) + 'px';
    canvas.width = Math.floor(W * MD.scale * MD.dpr);
    canvas.height = Math.floor(H * MD.scale * MD.dpr);
  };
  window.addEventListener('resize', MD.resize);
  MD.resize();

  // ===== 유틸 =====
  MD.rand = (a, b) => a + Math.random() * (b - a);
  MD.randi = (a, b) => Math.floor(MD.rand(a, b + 1));
  MD.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  MD.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  MD.lerp = (a, b, t) => a + (b - a) * t;
  MD.easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  MD.easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  MD.today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  MD.dayDiff = (a, b) => {
    const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(b) - p(a)) / 86400000);
  };

  MD.fmt = n => {
    n = Math.floor(n);
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  };

  MD.rr = (x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  MD.circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); };

  MD.text = (str, x, y, size, color, o) => {
    o = o || {};
    ctx.font = `${o.weight || 900} ${size}px ${MD.FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    let s = String(str).replace(/%/g, '％');
    if (o.maxW) {
      while (s.length > 1 && ctx.measureText(s).width > o.maxW) s = s.slice(0, -1);
      if (s !== String(str)) s = s.slice(0, -1) + '…';
    }
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.stroke;
      ctx.strokeStyle = o.strokeColor || 'rgba(0,0,0,0.65)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
  MD.textW = (str, size, weight) => { ctx.font = `${weight || 900} ${size}px ${MD.FONT}`; return ctx.measureText(String(str)).width; };

  // 여러 줄 텍스트 (글자 단위 줄바꿈, 한글 대응)
  MD.wrapText = (str, x, y, maxW, size, color, lineH, o) => {
    o = o || {};
    ctx.font = `${o.weight || 700} ${size}px ${MD.FONT}`;
    const lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
        else line += ch;
      }
      lines.push(line);
    }
    lines.forEach((l, i) => MD.text(l, x, y + i * (lineH || size * 1.35), size, color, Object.assign({ weight: 700 }, o)));
    return lines.length;
  };

  // ===== 저장 =====
  const DEFAULT = () => ({
    v: 3, coins: 0, sfx: true, music: true,
    stars: {}, unlocked: 0, best: {},
    hero: 'soldier', heroes: { soldier: { lv: 1 } },
    weapon: 'pistol', weapons: { pistol: { lv: 1 } },
    up: { troops: 0, power: 0, bonus: 0, charge: 0 },
    stats: { kills: 0, bosses: 0, gatesX: 0, maxTroops: 0, clears: 0, crates: 0, skills: 0, perfect: 0 },
    daily: { last: '', day: 0 },
    missions: { date: '', list: [] },
    ach: {},
    tut: { move: false, gate: false, skill: false, crate: false },
  });
  function deepMerge(dst, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepMerge(dst[k], v);
      else dst[k] = v;
    }
    return dst;
  }
  function loadSave() {
    const s = DEFAULT();
    try {
      const raw = JSON.parse(localStorage.getItem('mdef-save') || 'null');
      if (raw && typeof raw === 'object') {
        if (raw.v === 3) deepMerge(s, raw);
        else {
          // v2 저장 이전: 코인과 강화만 가져옴
          s.coins = Math.floor(raw.coins || 0);
          if (raw.up) { s.up.troops = raw.up.troops || 0; s.up.power = raw.up.power || 0; s.up.bonus = raw.up.bonus || 0; }
          s.sfx = !raw.muted;
        }
      }
    } catch (e) { /* 저장소 사용 불가 */ }
    return s;
  }
  MD.save = loadSave();
  MD.persist = () => { try { localStorage.setItem('mdef-save', JSON.stringify(MD.save)); } catch (e) { /* 무시 */ } };
  MD.resetSave = () => { MD.save = DEFAULT(); MD.persist(); };

  // ===== 에셋 =====
  const atlases = {};
  const frameIndex = {};
  MD.frame = name => frameIndex[name] || null;

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('image ' + src));
      img.src = src;
    });
  }

  MD.loadAtlas = async name => {
    const [json, img] = await Promise.all([
      fetch('assets/' + name + '.json').then(r => r.json()),
      loadImage('assets/' + name + '.png'),
    ]);
    atlases[name] = { img, frames: json.frames };
    for (const k of Object.keys(json.frames)) {
      const f = json.frames[k];
      frameIndex[k] = { img, x: f[0], y: f[1], w: f[2], h: f[3] };
    }
  };

  MD.loadFont = async () => {
    try {
      if (!window.FontFace) return;
      const ff = new FontFace('KenneyFuture', 'url(assets/kenney-future.ttf)');
      await ff.load();
      document.fonts.add(ff);
    } catch (e) { /* 시스템 폰트 사용 */ }
  };

  // 스프라이트 그리기: (x,y)는 기준점, ax/ay는 기준점 비율(기본 중앙)
  MD.spr = (name, x, y, o) => {
    const f = frameIndex[name];
    if (!f) return false;
    o = o || {};
    const sc = o.scale == null ? 1 : o.scale;
    const w = (o.w || f.w * sc), h = (o.h || f.h * sc);
    const ax = o.ax == null ? 0.5 : o.ax, ay = o.ay == null ? 0.5 : o.ay;
    const img = o.tint ? MD.tinted(name, o.tint) : f.img;
    const sx = o.tint ? 0 : f.x, sy = o.tint ? 0 : f.y;
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.add) ctx.globalCompositeOperation = 'lighter';
    if (o.rot || o.flipX || o.flipY) {
      ctx.save();
      ctx.translate(x, y);
      if (o.rot) ctx.rotate(o.rot);
      ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
      ctx.drawImage(img, sx, sy, f.w, f.h, -w * ax, -h * ay, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, f.w, f.h, x - w * ax, y - h * ay, w, h);
    }
    if (o.alpha != null) ctx.globalAlpha = 1;
    if (o.add) ctx.globalCompositeOperation = 'source-over';
    return true;
  };

  // 색을 입힌 스프라이트 캐시 (파티클/피격 플래시용)
  const tintCache = {};
  MD.tinted = (name, color) => {
    const key = name + '|' + color;
    if (tintCache[key]) return tintCache[key];
    const f = frameIndex[name];
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, f.w, f.h);
    tintCache[key] = c;
    return c;
  };
})();
