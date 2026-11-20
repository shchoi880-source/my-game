(() => {
  'use strict';
  /*
   * ZERO SIGNAL screens — art direction B "Bold & Juicy", built only from the G.ui kit (js/render.js).
   * Scenes: title (home) · play (training missions + SIGNAL RUN sectors, touch controls, sector stinger)
   *         draft (card reveal) · shop (cache) · result (run + training) · training · daily · hangar
   * The SIGNAL RUN (G.run / G.meta in js/run.js) is the main mode: PLAY on the title starts or resumes it.
   * Eye comfort: no full-screen flashes, nothing blinks faster than 2 Hz, G.save.data.reduced removes
   * bobbing, flips, shakes and count-up bumps.
   */
  const G = (window.G = window.G || {});
  G.scenes = {};
  const U = G.ui,
    C = U.C;
  const RED = () => !!(G.save && G.save.data && G.save.data.reduced);
  const edgeL = () => -G.AX + ((G.SAFE && G.SAFE.l) || 0);
  const edgeR = () => 1280 + G.AX - ((G.SAFE && G.SAFE.r) || 0);
  const edgeT = () => (G.SAFE && G.SAFE.t) || 0;
  const edgeB = () => 720 - ((G.SAFE && G.SAFE.b) || 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (n) => U.num(n);
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const grow = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
  const mix = (a, b, k) => {
    const pa = parseInt(a.slice(1), 16),
      pb = parseInt(b.slice(1), 16),
      ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
  };
  const sfx = (n, o) => G.audio && G.audio.sfx(n, o);

  // ---- toasts (screen space; drawn by main.js after the scene) -------------------------------------
  // G.toast(msg, sec) replaces the current one (install help); G.notify(msg, {color}) queues rewards.
  const TQ = { cur: null, q: [] };
  G.toast = (msg, sec = 2.5, o = {}) => {
    TQ.cur = { msg, t: 0, life: sec, ...o };
  };
  G.notify = (msg, o = {}) => {
    if (TQ.q.length < 8) TQ.q.push({ msg, t: 0, life: o.life || 2.6, color: o.color || C.mint, ...o });
  };
  G.drawToast = (c, dt) => {
    if (!TQ.cur && TQ.q.length) TQ.cur = TQ.q.shift();
    const T = TQ.cur;
    if (!T) return;
    T.t += dt;
    if (T.t >= T.life) {
      TQ.cur = null;
      return;
    }
    const fs = 19,
      h = 54,
      w = Math.min(G.VW - 40, U.measure(T.msg, fs) + 60),
      inK = RED() ? 1 : U.ease.backOut(Math.min(1, T.t / 0.25)),
      out = clamp((T.life - T.t) / 0.25, 0, 1),
      x = G.VW / 2 - w / 2,
      y = 720 - ((G.SAFE && G.SAFE.b) || 0) - 92 + (1 - inK) * 46;
    const fill = T.color || C.ink,
      ink = [C.mint, C.sun, C.sky, C.cream, C.pink].includes(fill);
    c.save();
    c.globalAlpha = out * Math.min(1, T.t * 8);
    U.plate(c, x, y, w, h, { fill, r: h / 2, sw: 4, sh: 6, sheenA: ink ? 0.25 : 0.08 });
    U.text(c, T.msg, G.VW / 2, y + h / 2 + 1, fs, ink ? C.ink : C.cream, { align: 'center', maxW: w - 30 });
    c.restore();
  };

  // ---- install (Chrome/Samsung prompt, otherwise instructions) — unchanged logic ---------------------
  function installApp() {
    sfx('click');
    const p = G.pwa || {};
    if (p.prompt) {
      p.prompt();
      G.toast('창이 안 뜨면: ⋮ 메뉴 → 앱 설치 / 홈 화면에 추가', 6);
      return;
    }
    const ua = navigator.userAgent || '',
      ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    if (ios)
      G.toast(
        /CriOS|FxiOS|EdgiOS|KAKAOTALK|NAVER/.test(ua)
          ? 'Safari로 열고 → 공유(□↑) → 홈 화면에 추가'
          : '아래 공유 버튼(□↑) → 홈 화면에 추가',
        6,
      );
    else if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//.test(ua)) G.toast('⋮ 메뉴 → 다른 브라우저(Chrome)로 열기', 6);
    else if (/SamsungBrowser/.test(ua)) G.toast('아래 ≡ 메뉴 → 현재 페이지 추가 → 홈 화면', 6);
    else G.toast('오른쪽 위 ⋮ 메뉴 → 홈 화면에 추가', 6);
  }

  // ---- records (save key / version 2 unchanged; HARD = best['id:hard']) ------------------------------
  const recKey = (id, mode) => (mode === 'hard' ? `${id}:hard` : id);
  const rec = (id, mode = 'normal') => {
    const r = G.save.mission(recKey(id, mode));
    if (typeof r.score !== 'number') r.score = +r.score || 0;
    if (typeof r.time !== 'number') r.time = +r.time || 0;
    if (typeof r.graze !== 'number') r.graze = +r.graze || 0;
    if (typeof r.flow !== 'number') r.flow = 0;
    if (!r.grade) r.grade = '-';
    if (!r.medals || typeof r.medals !== 'object' || Array.isArray(r.medals)) {
      r.medals = {};
      if (r.clear) r.medals.clear = 1;
      if (r.clear && r.grade === 'S') r.medals.nohit = 1;
    }
    return r;
  };
  G.save.rec = rec;
  const gradeRank = (g) => G.GRADE_ORDER.indexOf(g);
  const hardOpen = (m) => !!rec(m.id, 'normal').clear;
  const MEDALS = [
    ['clear', '클리어', 'check'],
    ['nohit', '무피격', 'shield'],
    ['graze150', '스치기 150', 'spark'],
    ['nodash', '무대시', 'bolt'],
    ['boss', '코어 격파', 'medal'],
  ];
  const medalName = (id) => (MEDALS.find((m) => m[0] === id) || [id, id])[1];
  const MCOL = { echo: C.sky, fracture: C.grape, zero: C.pink };
  const mColor = (m) => (m.daily ? C.sun : m.run ? C.mint : MCOL[m.id] || C.sky);
  const SECTION_NAMES = ['접속', '나선 간섭', '차단벽', '적색 폭우', '코어 개방'];
  const SIG_KIND = { echo: 'fan', fracture: 'spiral', zero: 'rain' };

  // ---- daily signal ("오늘의 신호", the mission flavour) --------------------------------------------
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const yesterdayKey = () => {
    const d = new Date();
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  };
  function dailyMission() {
    const k = dayKey(),
      h = G.hash('ZS' + k),
      base = G.MISSIONS[h % G.MISSIONS.length];
    return {
      ...base,
      seed: h,
      name: '오늘의 신호',
      sub: `일일 신호 · ${+k.slice(4, 6)}/${+k.slice(6)}`,
      color: '#ffd166',
      daily: k,
      baseName: base.name,
      desc: `오늘의 시드 · ${base.name} 기반. 매일 자정에 바뀝니다.`,
    };
  }
  G.dailyMission = dailyMission;
  function dailyData() {
    const d = G.save.data,
      k = dayKey();
    if (!d.daily || typeof d.daily !== 'object') d.daily = { streak: 0, last: '' };
    const D = d.daily;
    if (D.date !== k) Object.assign(D, { date: k, best: 0, time: 0, graze: 0, flow: 0, grade: '-', clear: false, tries: 0 });
    return D;
  }
  const dailyOpen = () => G.save.data.unlocked >= 2;

  // ---- skins → BLIP colours ---------------------------------------------------------------------
  function skinLook(s) {
    if (!s || s.id === 'default') return { body: C.sky, fin: C.skyD };
    const body = s.trail || C.sky;
    return { body, fin: mix(body, C.ink, 0.3) };
  }
  const applySkin = () => {
    try {
      G.shipSkin = skinLook(G.meta.skin());
    } catch {
      G.shipSkin = null;
    }
  };

  // ---- perk look ---------------------------------------------------------------------------------
  const PICON = {
    radar: 'eye', echo: 'music', battery: 'bolt', amp: 'sound', coil: 'spark', flame: 'star', dash3: 'bolt',
    needle: 'spark', core: 'medal', snow: 'clock', burst: 'star', shield: 'shield', mirror: 'eye', crown: 'trophy',
    zero: 'skin', prism: 'star', glitch: 'cross', glass: 'cross', purge: 'cross', boost: 'star', card: 'cardBack',
  };
  const TAGC = { GRAZE: C.sun, DASH: C.sky, FLOW: C.pink, CORE: C.mint, GLITCH: C.coral };
  const TAGK = { GRAZE: '스침', DASH: '대시', FLOW: '흐름', CORE: '코어', GLITCH: '글리치' };
  const RARK = { C: 'common', R: 'rare', E: 'epic', L: 'legendary', G: 'glitch' };
  const RARN = { C: '일반', R: '희귀', E: '영웅', L: '전설', G: '글리치' };
  const kitIcon = (n) => PICON[n] || (U.ICONS.includes(n) ? n : 'star');
  function perkDisc(c, x, y, r, id) {
    const d = G.perkDef(id);
    if (!d) return;
    const R = U.RARITY[RARK[d.rar] || 'common'];
    U.disc(c, x, y, r, R.fill, { sw: Math.max(2.5, r * 0.18), sh: Math.max(2, r * 0.2) });
    U.icon(c, kitIcon(d.icon), x, y - r * 0.04, r * 1.15, { color: C.cream, sw: Math.max(1.6, r * 0.12) });
  }

  // ---- small drawing helpers -------------------------------------------------------------------------
  // ◆ 신호 데이터 (meta) = sky gem; in-run 파편 (shards) = mint crystal
  function gem(c, x, y, r, col = C.sky) {
    c.save();
    c.translate(x, y);
    c.lineJoin = 'round';
    const path = (dy) => {
      c.beginPath();
      c.moveTo(0, -r + dy);
      c.lineTo(r * 0.86, dy - r * 0.1);
      c.lineTo(0, r + dy);
      c.lineTo(-r * 0.86, dy - r * 0.1);
      c.closePath();
    };
    path(Math.max(2, r * 0.2));
    c.fillStyle = C.ink;
    c.fill();
    path(0);
    c.fillStyle = col;
    c.fill();
    c.lineWidth = Math.max(2.5, r * 0.2);
    c.strokeStyle = C.ink;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -r * 0.62);
    c.lineTo(r * 0.45, -r * 0.08);
    c.lineTo(0, -r * 0.08);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fill();
    c.restore();
  }
  function shardIcon(c, x, y, r, col = C.mint) {
    c.save();
    c.translate(x, y);
    c.rotate(0.35);
    c.lineJoin = 'round';
    const path = (dy) => {
      c.beginPath();
      c.moveTo(0, -r + dy);
      c.lineTo(r * 0.5, -r * 0.35 + dy);
      c.lineTo(r * 0.5, r * 0.5 + dy);
      c.lineTo(0, r + dy);
      c.lineTo(-r * 0.5, r * 0.5 + dy);
      c.lineTo(-r * 0.5, -r * 0.35 + dy);
      c.closePath();
    };
    path(Math.max(2, r * 0.18));
    c.fillStyle = C.ink;
    c.fill();
    path(0);
    c.fillStyle = col;
    c.fill();
    c.lineWidth = Math.max(2.5, r * 0.2);
    c.strokeStyle = C.ink;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.fillRect(-r * 0.25, -r * 0.55, r * 0.2, r * 0.9);
    c.restore();
  }
  // pill with a custom-drawn icon, optional caps label and a sticker value
  function pill(c, x, y, text, o = {}) {
    const h = o.h || 46,
      fs = o.size || Math.round(h * 0.47),
      iw = o.icon ? h * 0.6 : 0,
      lab = o.label || '',
      ls = Math.round(h * 0.25),
      lw = lab ? U.measure(lab.toUpperCase(), ls, 900, 1.5) + 8 : 0,
      tw = U.measure(String(text), fs),
      pad = h * 0.34,
      w = Math.max(o.w || 0, Math.ceil(pad * 2 + iw + (iw ? 8 : 0) + lw + tw));
    if (o.align === 'right') x -= w;
    else if (o.align === 'center') x -= w / 2;
    U.plate(c, x, y, w, h, { fill: o.color || C.plate, r: h / 2, sw: 4, sh: o.sh ?? 5, sheenA: 0.18, sheen: o.sheen });
    let px = x + pad;
    if (o.icon) {
      o.icon(c, px + iw / 2, y + h / 2, iw / 2);
      px += iw + 8;
    }
    if (lab) {
      U.label(c, lab, px, y + h / 2 + 1, { size: ls, color: o.labelColor });
      px += lw;
    }
    if (o.plain) U.text(c, String(text), px, y + h / 2 + 1, fs, o.textColor || C.cream);
    else U.sticker(c, String(text), px, y + h / 2, fs, { align: 'left', fill: o.textColor || C.cream, stroke: Math.max(3, Math.round(fs * 0.15)), shadow: 2 });
    return { x, y, w, h };
  }
  const gemPill = (c, x, y, v, o = {}) => pill(c, x, y, num(v), { icon: (c, x, y, r) => gem(c, x, y, r * 0.95), ...o });
  const shardPill = (c, x, y, v, o = {}) => pill(c, x, y, num(v), { icon: (c, x, y, r) => shardIcon(c, x, y, r), ...o });
  function levelChip(c, xR, y, lv, w = 214) {
    const h = 58,
      x = xR - w;
    U.plate(c, x, y, w, h, { fill: C.plate, r: 22, sw: 4, sh: 5 });
    U.burst(c, x + 30, y + h / 2, 23, { points: 10, inner: 0.78, fill: C.sun, disc: C.coral, discR: 0.7, tilt: 8, sh: 3, sw: 3 });
    U.sticker(c, String(lv.level), x + 30, y + h / 2 + 1, lv.level >= 10 ? 17 : 21, { stroke: 4, shadow: 2 });
    U.label(c, 'PILOT', x + 62, y + 17, { size: 10 });
    U.text(c, lv.title || (lv.need ? `${num(lv.xp)}/${num(lv.need)}` : 'MAX'), x + w - 14, y + 18, 12, C.cream, { align: 'right', maxW: w - 120 });
    U.progress(c, x + 62, y + 31, w - 76, 14, lv.pct, { color: C.sky });
    return { x, y, w, h };
  }
  // medal starburst (training)
  function medalBadge(c, x, y, r, id, on, fresh) {
    const m = MEDALS.find((q) => q[0] === id) || MEDALS[0];
    U.burst(c, x, y, r, { points: 10, inner: 0.8, fill: on ? C.sun : C.deep, disc: on ? (fresh ? C.pink : C.coral) : C.night, discR: 0.68, tilt: 8, sh: Math.max(2, r * 0.12), sw: Math.max(2.5, r * 0.08) });
    U.icon(c, m[2], x, y, r * 0.95, { color: on ? C.cream : C.plateHi, sw: Math.max(1.8, r * 0.1) });
  }
  function header(c, title, sub) {
    U.sticker(c, title, 640, edgeT() + 52, 46, { stroke: 7, shadow: 5 });
    if (sub) U.label(c, sub, 640, edgeT() + 96, { size: 13, align: 'center' });
  }
  function dim(c, a) {
    c.save();
    c.globalAlpha = a;
    c.fillStyle = C.ink;
    c.fillRect(-G.AX, 0, G.VW, 720);
    c.restore();
  }
  // a small tilted sticker plate (NEW BEST, HARD 해제 …)
  function stickerTag(c, x, y, s, o = {}) {
    const fs = o.size || 22,
      h = o.h || Math.round(fs * 1.9),
      w = U.measure(s, fs) + h * 0.9;
    U.plate(c, x - w / 2, y - h / 2, w, h, { fill: o.color || C.mint, r: o.r ?? 14, sw: 4, sh: 5, sheenA: 0.3, tilt: o.tilt ?? -8 });
    c.save();
    c.translate(x, y);
    c.rotate(((o.tilt ?? -8) * Math.PI) / 180);
    U.text(c, s, 0, 1, fs, o.textColor || C.ink, { align: 'center' });
    c.restore();
    return w;
  }
  const popK = (t) => (RED() ? (t > 0 ? 1 : 0) : t <= 0 ? 0 : U.ease.pop(t / 0.26));
  function popAt(c, x, y, t, fn) {
    const k = popK(t);
    if (k <= 0) return;
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.translate(-x, -y);
    fn();
    c.restore();
  }

  // ---- scene UI mixin: press-sink buttons that fire on release ---------------------------------------
  function withUI(scene) {
    scene.hb = [];
    scene.pid = null;
    scene.hit0 = null;
    scene.begin = function () {
      this.hb = [];
    };
    scene.reg = function (id, r, fn, o = {}) {
      this.hb.push({ id, r, fn, o });
      return this.pid === id;
    };
    scene.btn = function (c, id, r, lab, o, fn) {
      const p = this.reg(id, r, fn, o);
      U.button(c, r, lab, { ...o, pressed: p && !o.disabled });
      return r;
    };
    scene.uiDown = function (x, y) {
      for (let i = this.hb.length - 1; i >= 0; i--) {
        const h = this.hb[i];
        if (U.hit(grow(h.r, h.o.pad ?? 6), x, y)) {
          this.pid = h.id;
          this.hit0 = h;
          if (h.o.onDown) h.o.onDown();
          return h;
        }
      }
      this.pid = null;
      this.hit0 = null;
      return null;
    };
    scene.uiUp = function (x, y) {
      const h = this.hit0;
      this.pid = null;
      this.hit0 = null;
      if (!h) return false;
      const cur = this.hb.find((q) => q.id === h.id) || h;
      if (!U.hit(grow(cur.r, (cur.o.pad ?? 6) + 10), x, y)) return false;
      if (!cur.o.silent) sfx(cur.o.disabled ? 'hit' : 'click');
      if (cur.fn) cur.fn();
      return true;
    };
    if (!scene.down)
      scene.down = function (x, y) {
        G.audio.init();
        const h = this.uiDown(x, y);
        this.blankDown = !h;
      };
    if (!scene.up)
      scene.up = function (x, y) {
        const blank = this.blankDown;
        this.blankDown = false;
        if (!this.uiUp(x, y) && blank && this.blank) this.blank(x, y);
      };
    return scene;
  }
  const backBtn = (scene, c, fn, lab = '홈') =>
    scene.btn(c, 'back', { x: edgeL() + 22, y: edgeT() + 20, w: 128, h: 58 }, lab, { variant: 'secondary', icon: 'back', size: 'sm', fontSize: 20 }, fn);

  // ---- SIGNAL RUN routing -------------------------------------------------------------------------
  const SECTOR_TRACK = ['echo', 'echo', 'fracture', 'fracture', 'zero'];
  function routeRun() {
    const r = G.run.current;
    if (!r) return G.go('title');
    if (r.state === 'pick') G.go('draft');
    else if (r.state === 'shop') G.go('shop');
    else if (r.state === 'play' || r.state === 'boss') G.go('play', { run: true });
    else finishRun();
  }
  function finishRun() {
    const lv0 = G.meta.level(),
      gems0 = G.meta.gems(),
      sum = G.run.finish();
    G.audio.stop();
    G.go('result', { kind: 'run', sum, lv0, gems0 });
  }
  function startRun(o = {}) {
    G.audio.init();
    if (o.resume) {
      const r = G.run.resume();
      if (r) return routeRun();
    }
    G.run.start(o);
    routeRun();
  }
  G.startRun = startRun;

  // ===================================================================================== TITLE (home)
  const title = withUI({
    t: 0,
    modal: null,
    arm: 0,
    install: null,
    enter() {
      this.t = 0;
      this.modal = null;
      this.arm = 0;
      G.audio.stop();
      applySkin();
      this.refresh();
      for (const n of G.meta.takeNotices()) G.notify(n.label, { color: n.type === 'skin' ? C.sky : C.mint });
    },
    refresh() {
      const d = G.save.data;
      this.lv = G.meta.level();
      this.gems = G.meta.gems();
      this.active = G.run.active();
      this.runs = G.meta.runs();
      this.depthMax = G.meta.depthMax();
      this.depths = G.meta.depths();
      this.streak = G.meta.streak();
      this.dr = G.meta.dailyRun();
      this.dailyAny = this.dr.open || dailyOpen();
      this.affordable =
        G.meta.perks().some((p) => p.canBuy) || G.meta.skins().some((s) => s.buyable && !s.owned && s.price <= this.gems);
      if (typeof d.runDepth !== 'number') d.runDepth = this.depthMax;
      d.runDepth = clamp(d.runDepth | 0, 0, this.depthMax);
    },
    installRect(x) {
      if (!G.isTouch() || !G.pwa || G.pwa.installed()) return null;
      const h = Math.max(54, 46 / (G.scale || 1)),
        w = 150;
      return { x: x - w, y: edgeT() + 18, w, h };
    },
    update(dt) {
      this.t += dt;
      if (this.arm > 0) this.arm -= dt;
      G.updateParticles(dt);
    },
    draw(c) {
      this.begin();
      const t = this.t,
        still = RED(),
        L = edgeL(),
        Rr = edgeR(),
        x0 = L + 64,
        ax = (x0 + 560 + Rr) / 2,
        ay = 404;
      U.bg(c, { kind: 'title', rays: { x: ax, y: ay } });
      // ---- hero art: bullet curtain, JAMMER, BLIP
      G.render.demoBullets(c, t, ax, ay - 10, 300);
      const bob = still ? 0 : Math.sin(t * Math.PI * 1.6) * 5;
      c.save();
      c.strokeStyle = 'rgba(255,244,222,.45)';
      c.setLineDash([3, 12]);
      c.lineCap = 'round';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(ax, ay + bob, 132, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      U.boss(c, ax + 262, ay - 218, { scale: 0.74, t, look: { x: -0.8, y: 0.7 } });
      c.fillStyle = 'rgba(27,18,51,.35)';
      c.beginPath();
      c.ellipse(ax, ay + 164, 90, 14, 0, 0, Math.PI * 2);
      c.fill();
      U.ship(c, ax, ay + bob, { scale: 3.3, flame: still ? 38 : 38 + 3 * Math.sin(t * 9), rot: still ? 0 : Math.sin(t * 0.9) * 4, look: { x: 0.6, y: -0.4 }, ...(G.shipSkin || {}) });
      U.spark(c, ax - 118, ay - 96, 16, C.sun);
      U.spark(c, ax + 112, ay - 70, 11, C.cream);
      U.spark(c, ax + 96, ay + 118, 13, C.sun);
      // best run under the art
      const rb = this.runs.best;
      if (rb && rb.score > 0)
        pill(c, ax, 660, num(rb.score), { align: 'center', label: rb.depth ? `BEST · 깊이 ${rb.depth}` : 'BEST RUN', h: 46, color: C.deep, icon: (c, x, y, r) => U.icon(c, 'trophy', x, y, r * 2), textColor: C.sun });
      // ---- logo
      U.sticker(c, 'ZERO', x0 - 6, 128, 150, { align: 'left', rot: -5, stroke: 16, shadow: 12, ls: -4 });
      U.plate(c, x0 + 14, 188, 452, 118, { fill: C.coral, r: 26, sw: 6, sh: 10, tilt: -5, sheenA: 0.22, lip: 10 });
      U.sticker(c, 'SIGNAL', x0 + 240, 248, 100, { fill: C.sun, rot: -5, stroke: 13, shadow: 8, ls: -3, maxW: 420 });
      U.chip(c, x0 + 22, 330, '피하고 · 스치고 · 돌파하라', { color: C.ink, size: 15, h: 40, ls: 2, sh: 0, sheen: false });
      // ---- PLAY (starts or resumes the SIGNAL RUN)
      const A = this.active,
        sub = A
          ? `${A.daily ? '오늘의 런' : A.weekly ? '주간 변조' : 'SIGNAL RUN'} · 섹터 ${A.sector} 이어하기`
          : this.runs.count
            ? `SIGNAL RUN · 깊이 ${G.save.data.runDepth}`
            : 'SIGNAL RUN · 5섹터 생존',
        pr = { x: x0, y: 392, w: 470, h: 116 };
      this.btn(c, 'play', pr, A ? '이어하기' : 'PLAY', { variant: 'primary', icon: 'play', size: 'lg', sub, fontSize: A ? 44 : 54 }, () =>
        startRun(A ? { resume: true } : { depth: G.save.data.runDepth }),
      );
      // ---- secondary row
      const by = 530,
        bw = 150,
        gap = 10;
      this.btn(c, 'train', { x: x0, y: by, w: bw, h: 78 }, '훈련', { variant: 'secondary', icon: 'trophy', fontSize: 22 }, () => G.go('training'));
      const dr = { x: x0 + bw + gap, y: by, w: bw, h: 78 };
      this.btn(c, 'daily', dr, '오늘의 런', { variant: 'pink', icon: 'star', fontSize: 20, iconColor: C.sun }, () => G.go('daily'));
      const hr = { x: x0 + (bw + gap) * 2, y: by, w: bw, h: 78 };
      this.btn(c, 'hangar', hr, '격납고', { variant: 'share', icon: 'skin', fontSize: 22, iconColor: C.cream }, () => G.go('hangar'));
      const sk = this.streak;
      if (sk.days > 0)
        U.burst(c, dr.x + dr.w - 6, dr.y - 4, 24, { points: 12, inner: 0.78, fill: sk.lit ? C.sun : C.plateHi, disc: sk.lit ? C.coral : C.plate, discR: 0.68, text: String(sk.days), textSize: 19, tilt: 10, sh: 3 });
      else if (!this.dailyAny) U.disc(c, dr.x + dr.w - 6, dr.y - 2, 15, C.plate, { sw: 3, sh: 3 }), U.icon(c, 'lock', dr.x + dr.w - 6, dr.y - 3, 17, { color: C.mute });
      if (this.affordable) stickerTag(c, hr.x + hr.w - 10, hr.y - 2, 'NEW', { color: C.sun, size: 14, tilt: 10, h: 28 });
      // ---- depth selector (after the first clear) / abandon the saved run
      const ry = 632;
      if (A) {
        this.btn(c, 'abandon', { x: x0, y: ry, w: 230, h: 50 }, this.arm > 0 ? '한 번 더: 정산 후 포기' : '런 포기', { variant: 'ghost', size: 'sm', fontSize: this.arm > 0 ? 15 : 18 }, () => {
          if (this.arm > 0) {
            this.arm = 0;
            if (G.run.resume()) finishRun();
            else this.refresh();
          } else this.arm = 2.5;
        });
        U.label(c, '보상은 클리어한 섹터만큼', x0 + 246, ry + 25, { size: 12 });
      } else if (this.depthMax >= 1) {
        const dsel = G.save.data.runDepth,
          D = this.depths[dsel] || { name: '', desc: '' },
          set = (n) => {
            G.save.data.runDepth = clamp(n, 0, this.depthMax);
            G.save.persist();
          };
        this.btn(c, 'dm', { x: x0, y: ry, w: 56, h: 52 }, '◀', { variant: 'secondary', size: 'sm', fontSize: 20, disabled: dsel <= 0 }, () => set(dsel - 1));
        U.plate(c, x0 + 66, ry, 338, 52, { fill: C.deep, r: 20, sw: 4, sh: 5, sheen: false });
        U.burst(c, x0 + 96, ry + 26, 22, { points: 10, fill: dsel ? C.grape : C.plateHi, disc: C.deep, discR: 0.66, text: String(dsel), textSize: 18, tilt: 6, sh: 3 });
        U.label(c, `깊이 ${dsel} · ${D.name}`, x0 + 128, ry + 17, { size: 12, color: C.cream });
        U.text(c, dsel ? D.desc + ' (누적)' : '규칙 없음 · 기본 런', x0 + 128, ry + 36, 13, C.mute, { weight: 800, maxW: 266 });
        this.btn(c, 'dp', { x: x0 + 414, y: ry, w: 56, h: 52 }, '▶', { variant: 'secondary', size: 'sm', fontSize: 20, disabled: dsel >= this.depthMax }, () => set(dsel + 1));
      } else if (!this.runs.count) U.label(c, 'WASD 이동 · SPACE 대시 · SHIFT 집중', x0 + 4, ry + 24, { size: 12 });
      // ---- top-right: settings, ◆, pilot level, install
      const gx = Rr - 46,
        gy = edgeT() + 46;
      const gp = this.reg('gear', { x: gx - 30, y: gy - 30, w: 60, h: 60 }, () => (this.modal = 'settings'));
      U.roundButton(c, gx, gy, 28, { color: C.plate, icon: 'gear', iconColor: C.cream, pressed: gp });
      const gm = gemPill(c, gx - 44, edgeT() + 18, this.gems, { align: 'right', h: 56, size: 25, label: '' });
      const lc = levelChip(c, gm.x - 12, edgeT() + 18, this.lv);
      this.install = this.installRect(lc.x - 12);
      if (this.install)
        this.btn(c, 'install', this.install, '앱 설치', { variant: 'mint', size: 'sm', fontSize: 19, silent: true, onDown: () => (G.noLandscapeOnce = true) }, installApp);
      U.label(c, 'v2.0 · SIGNAL RUN', Rr - 20, edgeB() - 18, { size: 11, align: 'right', color: 'rgba(185,173,230,.6)' });
      if (this.modal === 'settings') this.settings(c);
    },
    settings(c) {
      this.begin(); // only the modal is tappable
      dim(c, 0.62);
      const w = 560,
        h = 470,
        x = 640 - w / 2,
        y = 360 - h / 2;
      U.panel(c, x, y, w, h, { color: C.plate });
      U.sticker(c, '설정', 640, y + 50, 38, { stroke: 6, shadow: 4 });
      const rows = [
        ['sfx', '효과음', 'sound'],
        ['music', '음악', 'music'],
        ['haptics', '진동', 'bolt'],
        ['reduced', '효과 줄이기', 'eye'],
      ];
      rows.forEach(([k, lab, ic], i) => {
        const ry = y + 96 + i * 70;
        U.icon(c, ic, x + 52, ry + 27, 30);
        U.text(c, lab, x + 82, ry + 28, 22, C.cream);
        const tr = { x: x + w - 250, y: ry, w: 210, h: 56 },
          on = !!G.save.data[k];
        U.toggle(c, tr, ['끔', '켬'], on ? 1 : 0, { colors: [C.plateHi, C.mint], size: 19 });
        this.reg('t-' + k, tr, () => {
          G.save.data[k] = !G.save.data[k];
          G.save.persist();
          G.audio.setMuted();
        });
      });
      U.label(c, '기록은 이 기기에 저장됩니다', 640, y + h - 104, { size: 12, align: 'center' });
      this.btn(c, 'close', { x: 640 - 120, y: y + h - 86, w: 240, h: 64 }, '닫기', { variant: 'primary', fontSize: 26 }, () => (this.modal = null));
    },
    key(code, on) {
      if (!on) return;
      if (this.modal) {
        if (code === 'Escape' || code === 'Enter') this.modal = null;
        return;
      }
      if (code === 'Enter' || code === 'Space') startRun(this.active ? { resume: true } : { depth: G.save.data.runDepth });
      if (code === 'KeyT') G.go('training');
      if (code === 'KeyH') G.go('hangar');
    },
    blank() {
      if (this.modal) this.modal = null;
    },
  });
  G.scenes.title = title;

  // ===================================================================================== PLAY
  // Training missions ({mission, mode}) and SIGNAL RUN sectors ({run: true}). Input logic (per-finger roles,
  // floating joystick in the left 55%, gutter buttons, safe areas, pause hit-testing, resume countdown,
  // onboarding) is the mobile engineer's, only the look changed.
  const play = {
    engine: null,
    mission: null,
    mode: 'normal',
    run: null,
    banners: [],
    toasts: [],
    tut: null,
    keys: new Set(),
    countdown: 2.4,
    paused: false,
    ended: false,
    joy: null,
    joyBase: null,
    ptrs: new Map(),
    dashBuf: 0,
    resume: 0,
    sig: '',
    ui: null,
    stinger: null,
    pauseBtn: { x: 1213, y: 22, w: 46, h: 46 },
    pauseBtns: [],
    layout() {
      const S = G.SAFE,
        sc = G.scale || 1,
        R = 1280 + G.AX - S.r,
        B = 720 - S.b,
        T = S.t,
        m = 16,
        rD = G.clamp(42 / sc, 58, 84), // DASH 지름 ≥ 84 CSS px
        rF = G.clamp(32 / sc, 46, 66), // FOCUS 지름 ≥ 64 CSS px
        min = 46 / sc, // 터치 목표 최소 46 CSS px
        room = R - 1206,
        gutter = room >= rD * 2 + 8;
      const ui = { gutter, min, joyR: 70 };
      if (gutter) {
        const cx = R - Math.max(m + rD, room / 2);
        ui.dash = { cx, cy: B - m - rD - 18, r: rD };
        ui.focus = { cx, cy: ui.dash.cy - rD - rF - 30, r: rF };
        const w = G.clamp(40 / sc, 52, Math.min(80, room - 12));
        ui.pause = { x: cx - w / 2, y: T + 14, w, h: w };
      } else {
        ui.dash = { cx: R - m - rD, cy: B - m - rD - 12, r: rD };
        ui.focus = { cx: ui.dash.cx - rD - rF - 20, cy: B - m - rF - 12, r: rF };
        const w = G.clamp(40 / sc, 46, Math.max(46, R - 1216));
        ui.pause = { x: R - 10 - w, y: T + 14, w, h: w };
      }
      ui.joyMaxX = G.VW * 0.55 - G.AX;
      this.pauseBtn = ui.pause;
      this.ui = ui;
      return ui;
    },
    pad(b, min) {
      const px = Math.max(0, (min - b.w) / 2),
        py = Math.max(0, (min - b.h) / 2);
      return { x: b.x - px, y: b.y - py, w: b.w + px * 2, h: b.h + py * 2 };
    },
    inCircle(b, x, y, k = 1.25) {
      return Math.hypot(x - b.cx, y - b.cy) <= b.r * k;
    },
    triggerDash() {
      if (this.paused || this.ended || this.countdown > 0) return;
      this.dashBuf = 0.12;
    },
    track() {
      return this.run ? SECTOR_TRACK[this.run.sector.index] || 'echo' : this.mission.id;
    },
    setPaused(on) {
      if (on === this.paused) return;
      this.paused = on;
      if (on) {
        this.ptrs.clear();
        this.joy = null;
        G.audio.stop();
      } else {
        this.resume = this.countdown > 0 ? 0 : 1.2;
        G.audio.start();
      }
    },
    resized() {
      const sig = `${G.VW}|${G.rotated}`;
      if (sig === this.sig) return;
      this.sig = sig;
      if (!this.ended && this.countdown <= 0) this.setPaused(true);
    },
    enter(p = {}) {
      applySkin();
      if (p.run) {
        this.run = G.run.current;
        this.engine = this.run.engine;
        this.mission = this.engine.mission;
        this.mode = 'normal';
      } else {
        this.run = null;
        this.mission = p.mission;
        this.mode = p.mission.daily ? 'normal' : p.mode === 'hard' ? 'hard' : 'normal';
        this.engine = new G.Engine(p.mission, { mode: this.mode });
      }
      this.keys.clear();
      this.countdown = this.run ? 2.8 : 2.4;
      this.paused = false;
      this.ended = false;
      this.endT = 0;
      this.stinger = null;
      this.finished = false;
      this.sectorEnded = false;
      this.shardFx = null;
      this.near = null;
      this.joy = null;
      this.ptrs.clear();
      this.dashBuf = 0;
      this.resume = 0;
      this.banners = [];
      this.toasts = [];
      this.left = false;
      this.t = 0;
      this.sig = `${G.VW}|${G.rotated}`;
      const first = !G.save.data.tutorial;
      this.tut =
        first && ((this.run && this.run.sector.index === 0) || (!this.run && p.mission.id === 'echo' && this.mode === 'normal' && !p.mission.daily))
          ? { step: 0, n: 0, focusT: 0, t: 0, skip: null }
          : null;
      this.hudSector = this.run ? { ...this.run.sector } : null;
      if (this.run)
        for (const n of G.run.takeNotices()) {
          if (n.type === 'resonance') this.banner(n.name, `공명 발동 · ${TAGK[n.tag] || n.tag}`, TAGC[n.tag] || C.pink, 2.4);
          else if (n.type === 'repair') this.toast('보호막 수리', null, C.sky);
        }
      G.particles.length = 0;
      G.save.data.totalRuns++;
      G.save.persist();
      G.audio.start(this.track());
    },
    restart() {
      if (this.run) return;
      G.go('play', { mission: this.mission, mode: this.mode });
    },
    update(dt) {
      this.t += dt;
      if (this.paused) return;
      if (this.shardFx) this.shardFx.t += dt;
      if (this.near) this.near.t += dt;
      if (this.stinger) this.stinger.t += dt;
      for (const list of [this.banners, this.toasts])
        for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
      if (this.ended) {
        this.endT += dt;
        this.outro(dt);
        return;
      }
      G.updateParticles(dt);
      if (this.countdown > 0) {
        this.countdown -= dt;
        return;
      }
      if (this.resume > 0) {
        this.resume -= dt;
        return;
      }
      const k = this.keys,
        x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0),
        y = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0),
        jx = this.joy?.x || 0,
        jy = this.joy?.y || 0,
        focus = k.has('ShiftLeft') || k.has('ShiftRight') || [...this.ptrs.values()].some((r) => r === 'focus'),
        stick = jx !== 0 || jy !== 0;
      this.engine.setInput(stick ? jx : x, stick ? jy : y, focus);
      if (this.dashBuf > 0) {
        this.engine.dash();
        this.dashBuf -= dt;
      }
      this.engine.update(dt);
      for (const ev of this.engine.consume()) this.onEvent(ev);
      if (this.run) {
        // the run's engines are not the track's mission → drive the music layers here
        const e = this.engine;
        G.audio.setSection(Math.min(4, Math.max(this.run.sector.index, e.sectionIndex | 0)));
        G.audio.setOverdrive(e.overdrive > 0);
        G.audio.setDanger(!e.dead && !e.done && e.player.shields === 1);
      }
      this.tutorial(dt, focus);
      if ((this.engine.dead || this.engine.done) && !this.ended) {
        this.ended = true;
        this.endT = 0;
        this.ptrs.clear();
        this.joy = null;
      }
    },
    // after the engine ends: training → results; run → sector stinger / draft / results
    outro() {
      const e = this.engine;
      if (this.left) return;
      if (!this.run) {
        if (this.endT >= (e.done ? 1.1 : 0.8) && !this.finished) {
          this.finished = true;
          this.finish();
        }
        return;
      }
      if (this.stinger) {
        const S = this.stinger;
        if (S.t >= S.life && !S.gone) this.leaveStinger();
        return;
      }
      if (this.endT < (e.done ? 1.0 : 0.85) || this.sectorEnded) return;
      this.sectorEnded = true;
      const n = this.run.sector.n,
        name = this.run.sector.name,
        out = G.run.endSector();
      if (!out) return finishRun();
      if (out.state === 'pick') {
        const nx = this.run.sector;
        this.stinger = { t: 0, life: 3.6, n, name, sec: out.sector, shards: out.shards, next: nx, lastShard: 0 };
        sfx('complete');
      } else {
        G.audio.stop();
        finishRun();
      }
    },
    leaveStinger() {
      if (!this.stinger || this.stinger.gone) return;
      this.stinger.gone = true;
      this.left = true;
      G.audio.stop();
      routeRun();
    },
    // ---- onboarding ----
    TUT: [
      { goal: 3, text: '탄환 바로 옆을 스쳐 지나가 보세요', sub: '스치기 = 점수 + FLOW' },
      { goal: 1.2, text: () => (G.isTouch() ? 'FOCUS를 누른 채 움직여 보세요' : 'SHIFT를 누른 채 움직여 보세요'), sub: '느리고 정밀한 이동' },
      { goal: 1, text: () => (G.isTouch() ? 'DASH로 탄환을 뚫고 지나가세요' : 'SPACE로 탄환을 뚫고 지나가세요'), sub: '대시 중엔 무적 · 충전식' },
      { goal: 0, text: '좋아요! 이제 끝까지 버티세요', sub: '' },
    ],
    tutorial(dt, focus) {
      const T = this.tut;
      if (!T) return;
      T.t += dt;
      if (T.step === 1 && focus) T.n += dt;
      const s = this.TUT[T.step];
      if (T.step < 3 && T.n >= s.goal) {
        T.step++;
        T.n = 0;
        T.t = 0;
        sfx('ready');
      } else if (T.step === 3 && T.t > 2.6) this.endTutorial();
    },
    tutEvent(ev) {
      const T = this.tut;
      if (!T) return;
      if (T.step === 0 && ev.type === 'graze') T.n++;
      if (T.step === 2 && ev.type === 'dash') T.n++;
    },
    endTutorial() {
      this.tut = null;
      if (!G.save.data.tutorial) {
        G.save.data.tutorial = true;
        G.save.persist();
      }
    },
    drawTutorial(c) {
      const T = this.tut;
      if (!T) return;
      const s = this.TUT[T.step],
        text = typeof s.text === 'function' ? s.text() : s.text,
        w = 640,
        h = 64,
        x = 640 - w / 2,
        y = Math.min(640, 720 - G.SAFE.b - h - 14),
        a = Math.min(1, T.t * 4);
      c.save();
      c.globalAlpha = a;
      U.plate(c, x, y, w, h, { fill: C.ink, r: 24, sw: 4, sh: 5, sheen: false });
      if (T.step < 3) {
        U.burst(c, x + 34, y + h / 2, 22, { points: 10, fill: C.sun, disc: C.coral, text: String(T.step + 1), textSize: 18, tilt: 6, sh: 3 });
        U.text(c, text, x + 68, y + 24, 19, C.cream, { maxW: 410 });
        const prog = T.step === 0 ? `${s.sub} · ${Math.min(s.goal, T.n | 0)}/${s.goal}` : s.sub;
        U.text(c, prog, x + 68, y + 46, 13, C.mute, { weight: 800 });
        if (T.step === 1) U.progress(c, x + 300, y + 40, 150, 12, G.clamp(T.n / s.goal, 0, 1), { color: C.sky });
        T.skip = { x: x + w - 118, y: y + 10, w: 106, h: h - 20 };
        U.button(c, T.skip, '건너뛰기', { variant: 'secondary', size: 'sm', fontSize: 15 });
        // slow breathing ring around the button to press (0.5 Hz, no blinking)
        const ui = this.ui,
          btn = ui && (T.step === 1 ? ui.focus : T.step === 2 ? ui.dash : null);
        if (btn && G.isTouch()) {
          const k = 0.5 + 0.5 * Math.sin(T.t * 3.2);
          c.save();
          c.globalAlpha = 0.45 + 0.4 * k;
          c.strokeStyle = C.cream;
          c.lineWidth = 5;
          c.setLineDash([4, 10]);
          c.lineCap = 'round';
          c.beginPath();
          c.arc(btn.cx, btn.cy, btn.r + 16 + 6 * k, 0, G.TAU);
          c.stroke();
          c.restore();
        }
      } else {
        T.skip = null;
        U.sticker(c, text, 640, y + h / 2, 24, { fill: C.mint, stroke: 5, shadow: 3 });
      }
      c.restore();
    },
    banner(text, sub, color = C.cream, life = 1.6) {
      this.banners = [{ text, sub, color, t: 0, life }];
    },
    toast(text, value, color = C.mint) {
      // one on screen, the rest queue behind it
      const last = this.toasts[this.toasts.length - 1],
        start = last ? Math.min(0, last.t - (last.life - 0.25)) : 0;
      this.toasts.push({ text, value, color, t: start, life: 1.64 });
      if (this.toasts.length > 4) this.toasts.shift();
    },
    onEvent(ev) {
      this.tutEvent(ev);
      if (ev.type === 'graze') {
        sfx('graze', { combo: ev.combo });
        if (ev.combo === 10 || ev.combo === 25 || ev.combo === 50 || ev.combo === 100) sfx('flow', { combo: ev.combo });
        G.burst(ev.x, ev.y, C.sun, 2, 70);
      } else if (ev.type === 'phase') {
        sfx('dashThrough');
        G.burst(ev.x, ev.y, C.cream, 5, 150);
      } else if (ev.type === 'dash') {
        this.dashBuf = 0;
        sfx('dash');
        G.vibrate(12);
      } else if (ev.type === 'hit') {
        sfx('hit');
        G.vibrate([45, 30, 45]);
        G.burst(ev.x, ev.y, C.coral, 16, 260);
      } else if (ev.type === 'overdrive') {
        sfx('overdrive');
        G.vibrate([20, 20, 35]);
      } else if (ev.type === 'section') {
        sfx('section');
        const i = this.engine.sectionIndex;
        if (i < 4 && !this.run) this.banner(ev.name, `SECTION ${i + 1}`, C.cream);
      } else if (ev.type === 'repair') {
        sfx('shield');
        this.toast('보호막 복구', null, C.sky);
      } else if (ev.type === 'bossPhase') {
        G.audio.bossPhase();
        this.banner(ev.name, this.engine.boss.final ? 'FINAL SIGNAL' : `SPELL ${ev.phase + 1}`, C.pink, 2);
      } else if (ev.type === 'bossBreak') {
        sfx('flow', { mult: 5 });
        G.vibrate([30, 30, 60]);
        this.banner('코어 격파!', 'CORE BREAK', C.sun, 2.2);
      } else if (ev.type === 'bonus') this.toast(ev.label, '+' + num(ev.value), C.mint);
      else if (ev.type === 'shard') this.shardFx = { n: ev.n, t: 0 };
      else if (ev.type === 'revive') {
        sfx('shield');
        this.banner('제로 포인트', '치명타 무효', C.sun, 1.8);
      } else if (ev.type === 'nearMiss') this.near = { x: ev.x, y: ev.y, t: 0 };
      else if (ev.type === 'dashReady') sfx('ready');
      else if (ev.type === 'complete') sfx('complete');
      else if (ev.type === 'dead') sfx('dead');
    },
    // training results: records, medals, unlocks (unchanged) + ◆/XP via G.meta.missionReward
    finish() {
      const s = this.engine.stats(),
        m = this.mission,
        mode = this.mode,
        d = G.save.data,
        out = { kind: 'mission', mission: m, mode, stats: s, grade: s.grade, news: {}, newMedals: [], unlocks: [] };
      if (this.tut || !d.tutorial) this.endTutorial();
      let firstClear = false;
      if (m.daily) {
        const D = dailyData(),
          k = dayKey();
        out.prev = { score: D.best, time: D.time, graze: D.graze, flow: D.flow };
        D.tries++;
        if (D.last !== k) {
          D.streak = D.last === yesterdayKey() ? (D.streak || 0) + 1 : 1;
          D.last = k;
        }
        if (s.score > D.best) D.best = s.score;
        D.time = Math.max(D.time, s.time);
        D.graze = Math.max(D.graze, s.grazes);
        D.flow = Math.max(D.flow, s.maxCombo);
        if (gradeRank(s.grade) > gradeRank(D.grade)) D.grade = s.grade;
        D.clear = D.clear || s.clear;
        out.streak = D.streak;
      } else {
        const r = rec(m.id, mode),
          wasClear = r.clear;
        out.prev = { score: r.score, time: r.time, graze: r.graze, flow: r.flow };
        if (s.score > r.score) r.score = s.score;
        r.time = Math.max(r.time, s.time);
        r.graze = Math.max(r.graze, s.grazes);
        r.flow = Math.max(r.flow, s.maxCombo);
        if (gradeRank(s.grade) > gradeRank(r.grade)) r.grade = s.grade;
        r.clear = r.clear || s.clear;
        for (const id of G.runMedals(s))
          if (!r.medals[id]) {
            r.medals[id] = 1;
            out.newMedals.push(id);
          }
        if (s.clear && !wasClear) {
          firstClear = true;
          if (mode === 'normal') {
            out.unlocks.push(`${m.name} HARD 해제`);
            const idx = G.MISSIONS.indexOf(m),
              next = G.MISSIONS[idx + 1];
            if (next && d.unlocked < idx + 2) out.unlocks.push(`「${next.name}」 해제`);
            if (idx === 0 && d.unlocked < 2) out.unlocks.push('오늘의 신호 해제');
            d.unlocked = Math.max(d.unlocked, Math.min(G.MISSIONS.length, idx + 2));
          } else out.unlocks.push('HARD 첫 생존');
        }
      }
      const p = out.prev,
        had = p.time > 0;
      out.news = {
        score: had && s.score > p.score,
        time: had && s.time > p.time + 0.05,
        graze: had && s.grazes > p.graze,
        flow: had && s.maxCombo > p.flow,
      };
      out.first = !had;
      d.totalGraze += s.grazes;
      G.save.persist();
      out.lv0 = G.meta.level();
      out.gems0 = G.meta.gems();
      out.reward = G.meta.missionReward(s, m, mode, { newMedals: out.newMedals, firstClear });
      for (const u of out.reward.levelUps) out.unlocks.push(`파일럿 Lv ${u.level} · ${u.reward.label}`);
      for (const n of G.meta.takeNotices()) out.unlocks.push(n.label);
      G.audio.stop();
      G.go('result', out);
    },
    draw(c) {
      const e = this.engine;
      G.render.world(c, e);
      const ui = this.layout();
      if (this.run) this.runHud(c);
      this.drawBanners(c);
      if (this.countdown > 0 && !this.ended) this.drawCountdown(c);
      else if (this.resume > 0 && !this.paused) {
        dim(c, 0.25);
        U.sticker(c, String(Math.ceil(this.resume / 0.4)), 640, 360, 96, { fill: C.sky, stroke: 12, shadow: 8 });
      }
      if (!this.stinger) {
        U.roundButton(c, ui.pause.x + ui.pause.w / 2, ui.pause.y + ui.pause.h / 2 - 2, ui.pause.w / 2 - 2, { color: C.plate, icon: 'pause', iconColor: C.cream });
        this.touchUi(c, ui);
      }
      if (!this.paused && this.countdown <= 0 && !this.ended) this.drawTutorial(c);
      if (this.stinger) this.drawStinger(c);
      if (this.paused) this.pauseOverlay(c);
    },
    drawCountdown(c) {
      const n = Math.ceil(this.countdown),
        k = this.countdown - Math.floor(this.countdown),
        sc = RED() ? 1 : U.ease.pop(1 - k);
      dim(c, 0.32);
      if (this.run) {
        const S = this.run.sector;
        U.chip(c, 640, 196, `깊이 ${this.run.depth}`, { color: C.ink, size: 14, h: 36, align: 'center', label: `SECTOR ${S.n}/5`, sh: 0, sheen: false });
        U.sticker(c, S.boss ? '코어' : S.name, 640, 268, 78, { fill: S.boss ? C.sun : C.cream, stroke: 11, shadow: 7, rot: -3 });
        const f = S.featureNames || [];
        let fx = 640 - (f.length * 120) / 2;
        const ws = f.map((s) => U.measure(s, 15) + 34),
          tw = ws.reduce((a, b) => a + b + 10, -10);
        fx = 640 - tw / 2;
        f.forEach((s, i) => {
          U.chip(c, fx, 318, s, { color: C.deep, size: 15, h: 36, sh: 4, sheen: false });
          fx += ws[i] + 10;
        });
      } else if (this.mode === 'hard') stickerTag(c, 640, 250, 'HARD MODE', { color: C.coral, textColor: C.cream, size: 20, tilt: -4 });
      else if (this.mission.daily) stickerTag(c, 640, 250, `오늘의 신호 · ${this.mission.baseName}`, { color: C.sun, size: 18, tilt: -4 });
      c.save();
      c.translate(640, 430);
      c.scale(sc, sc);
      U.sticker(c, n > 0 ? String(n) : 'GO', 0, 0, 112, { fill: n === 1 ? C.sun : C.cream, stroke: 14, shadow: 9 });
      c.restore();
      const hint = this.tut ? '처음이라면 아래 안내를 따라 해보세요' : G.isTouch() ? '왼쪽: 이동 · 오른쪽: 대시 / 집중(누르고 있기)' : '탄환에 스치면 FLOW가 오릅니다';
      U.chip(c, 640, 520, hint, { color: C.ink, size: 16, h: 40, align: 'center', sh: 0, sheen: false });
      U.chip(c, 640, 570, '기체 가운데 하얀 점에 맞을 때만 실드가 깎여요', { color: C.ink, size: 15, h: 36, align: 'center', sh: 0, sheen: false });
    },
    // run HUD: sector chip + progress, shards, perk icons
    runHud(c) {
      const r = this.run,
        e = this.engine,
        gut = (G.AX || 0) >= 120,
        S = this.hudSector || r.sector,
        x = gut ? 16 : 12 + (G.SAFE.l || 0),
        y = gut ? 14 : 96;
      U.plate(c, x, y, 228, 62, { fill: C.deep, r: 20, sw: 4, sh: 5, sheen: false });
      U.label(c, `SECTOR ${S.n}/5`, x + 16, y + 17, { size: 11 });
      U.sticker(c, S.boss ? '코어' : S.name, x + 16, y + 42, 22, { align: 'left', stroke: 4, shadow: 2, fill: S.boss ? C.sun : C.cream });
      const f = clamp(e.time / Math.max(1, e.mission.duration), 0, 1);
      for (let i = 0; i < 5; i++) {
        const px = x + 104 + i * 23,
          done = i < S.index,
          cur = i === S.index;
        U.rr(c, px, y + 34, 19, 14, 7);
        c.fillStyle = C.ink;
        c.fill();
        U.rr(c, px + 2.5, y + 36.5, 14, 9, 4.5);
        c.fillStyle = done ? C.mint : C.night;
        c.fill();
        if (cur) {
          U.rr(c, px + 2.5, y + 36.5, Math.max(4, 14 * f), 9, 4.5);
          c.fillStyle = C.sun;
          c.fill();
        }
      }
      U.label(c, `D${r.depth}`, x + 212, y + 17, { size: 11, align: 'right', color: r.depth ? C.pink : C.mute });
      const sh = this.sectorEnded ? r.shards : r.shards + (e.shards || 0),
        bump = this.shardFx && this.shardFx.t < 0.3 && !RED() ? 1 + 0.15 * (1 - this.shardFx.t / 0.3) : 1;
      c.save();
      const sx = x + 240,
        sy = y + 8;
      c.translate(sx + 40, sy + 23);
      c.scale(bump, bump);
      c.translate(-(sx + 40), -(sy + 23));
      shardPill(c, sx, sy, sh, { h: 46, size: 22, color: C.deep, label: '' });
      c.restore();
      // perks: left gutter (gutter HUD) or a row under the sector chip
      const ids = r.picks;
      if (!ids.length) return;
      if (gut) {
        const Lc = (-G.AX + (G.SAFE.l || 0)) / 2,
          per = 4,
          sp = 28;
        U.label(c, 'PERKS', Lc, 474, { size: 10, align: 'center' });
        ids.slice(0, 16).forEach((id, i) => {
          const row = Math.floor(i / per),
            col = i % per,
            nRow = Math.min(per, ids.length - row * per);
          perkDisc(c, Lc + (col - (nRow - 1) / 2) * sp, 498 + row * 28, 12, id);
        });
        r.resonance.forEach((tag, i) => U.disc(c, Lc + (i - (r.resonance.length - 1) / 2) * 16, 590, 5, TAGC[tag], { sw: 2, sh: 0, sheen: false }));
      } else ids.slice(0, 12).forEach((id, i) => perkDisc(c, x + 18 + i * 28, y + 82, 12, id));
    },
    drawBanners(c) {
      for (const b of this.banners) {
        const k = b.t / b.life,
          a = Math.min(1, b.t * 5, (1 - k) * 3),
          s = RED() ? 1 : U.ease.pop(Math.min(1, b.t / 0.26));
        U.label(c, b.sub, 640, 262, { size: 14, align: 'center', color: C.cream, alpha: a });
        c.save();
        c.globalAlpha = a;
        c.translate(640, 302);
        c.scale(s, s);
        U.sticker(c, b.text, 0, 0, 44, { fill: b.color, stroke: 8, shadow: 5, rot: -3 });
        c.restore();
      }
      const gut = (G.AX || 0) >= 120,
        ty = this.run ? (gut ? 96 : 150) : gut ? 22 : 96;
      for (const q of this.toasts) U.toast(c, q.text, q.value, { t: q.t, life: q.life, x: gut ? 20 : 14, y: ty, color: q.color });
      if (this.near) {
        if (this.near.t < 0.5) U.popup(c, 'CLOSE!', this.near.x + 40, this.near.y - 30, this.near.t / 0.5, { color: C.pink, size: 18, life: 0.5 });
      }
    },
    touchUi(c, ui) {
      const e = this.engine,
        p = e.player,
        roles = [...this.ptrs.values()],
        JR = ui.joyR;
      // joystick: deep well + sky knob; dim ghost where it was last
      const base = this.joy || this.joyBase || (G.isTouch() ? { ox: 230, oy: 560 } : null);
      if (base) {
        c.save();
        c.globalAlpha = this.joy ? 0.75 : 0.3;
        U.disc(c, base.ox, base.oy, JR, C.deep, { sw: 4, sh: 0, sheen: false });
        c.setLineDash([3, 10]);
        c.lineCap = 'round';
        c.lineWidth = 3;
        c.strokeStyle = C.mute;
        c.beginPath();
        c.arc(base.ox, base.oy, JR - 12, 0, G.TAU);
        c.stroke();
        c.setLineDash([]);
        U.disc(c, base.ox + (this.joy?.kx || 0), base.oy + (this.joy?.ky || 0), 27, C.sky, { sw: 4, sh: 4 });
        c.restore();
      }
      const d = ui.dash,
        ready = p.dashes > 0,
        regen = (e.md && e.md.dashRegen ? e.md.dashRegen : 2.8) * ((e.k && e.k.dashRegenMul) || 1),
        dmax = (e.k && e.k.dashMax) || 2;
      U.roundButton(c, d.cx, d.cy, d.r, {
        color: ready ? C.sun : C.plateHi,
        icon: 'bolt',
        iconColor: ready ? C.cream : C.mute,
        pressed: roles.includes('dash'),
        progress: p.dashes < dmax ? G.clamp(p.dashRegen / regen, 0, 1) : null,
        pips: [p.dashes, dmax],
        pipLabel: 'DASH',
        alpha: 0.94,
      });
      const f = ui.focus,
        on = roles.includes('focus') || (e.input && e.input.focus);
      U.roundButton(c, f.cx, f.cy, f.r, { color: C.sky, icon: 'eye', label: 'FOCUS', pressed: on, ring: on ? C.sky : false, ringOffset: RED() ? 0 : -this.t * 30, alpha: 0.94 });
    },
    // sector clear stinger: score + shards tally, no-hit stamp. No flashes.
    drawStinger(c) {
      const S = this.stinger,
        t = S.t,
        sec = S.sec;
      dim(c, 0.55 * Math.min(1, t / 0.3));
      U.ribbon(c, 640, 150, 520, `섹터 ${S.n} 클리어!`, { color: C.mint, dark: C.mintD, k: (t - 0.05) / 0.22, size: 40, h: 72 });
      const pk = popK(t - 0.25);
      if (pk > 0) {
        c.save();
        c.translate(640, 360);
        c.scale(pk, pk);
        c.translate(-640, -360);
        U.panel(c, 400, 236, 480, 236, { color: C.plate });
        U.label(c, 'SCORE', 432, 268, { size: 12 });
        const cu = U.countUp(sec.gained, t, { delay: 0.35, dur: 0.7 });
        c.save();
        c.translate(432, 310);
        c.scale(cu.sx, cu.sy);
        U.sticker(c, '+' + num(cu.value), 0, 0, 46, { align: 'left', fill: C.sun, stroke: 8, shadow: 4 });
        c.restore();
        U.label(c, `총점 ${num(this.run.score)}`, 432, 436, { size: 11, color: C.cream });
        U.label(c, 'SHARDS', 432, 366, { size: 12 });
        const ns = Math.min(S.shards, Math.floor(Math.max(0, t - 0.9) / 0.09));
        if (ns > S.lastShard) {
          S.lastShard = ns;
          sfx('graze', { combo: ns * 4 });
        }
        for (let i = 0; i < Math.min(S.shards, 14); i++) {
          const on = i < ns;
          if (on) shardIcon(c, 446 + i * 24, 400, 11);
          else U.disc(c, 446 + i * 24, 400, 5, C.deep, { sw: 2, sh: 0, sheen: false });
        }
        U.sticker(c, '+' + ns, 848, 400, 34, { align: 'right', fill: C.mint, stroke: 6, shadow: 3 });
        U.label(c, `보유 ${num(this.run.shards)}`, 848, 436, { size: 11, align: 'right', color: C.mute });
        c.restore();
      }
      if (sec.hits === 0) popAt(c, 860, 236, t - 1.4, () => U.burst(c, 860, 236, 52, { points: 14, fill: C.mint, disc: C.mintD, text: '무피격', textSize: 20, tilt: 12 }));
      const nx = S.next;
      if (nx && t > 1.2) {
        const a = Math.min(1, (t - 1.2) * 4);
        c.save();
        c.globalAlpha = a;
        U.chip(c, 640, 500, `다음 · 섹터 ${nx.n} ${nx.boss ? '코어' : nx.name}`, { color: C.ink, size: 17, h: 42, align: 'center', sh: 0, sheen: false });
        U.label(c, t > 0.8 ? '탭해서 카드 고르기' : '', 640, 566, { size: 12, align: 'center', color: C.cream });
        c.restore();
      }
    },
    pauseOverlay(c) {
      dim(c, 0.7);
      const w = 440,
        h = 470,
        x = 640 - w / 2,
        y = 360 - h / 2;
      U.panel(c, x, y, w, h, { color: C.plate });
      U.sticker(c, '일시정지', 640, y + 54, 40, { stroke: 7, shadow: 4 });
      U.label(c, this.run ? `SIGNAL RUN · 섹터 ${this.run.sector.n}/5` : `${this.mission.name} · ${this.mode.toUpperCase()}`, 640, y + 96, { size: 12, align: 'center' });
      this.pauseBtns = this.run
        ? [
            { x: x + 40, y: y + 128, w: w - 80, h: 84, act: 'resume', label: '계속', v: 'primary', icon: 'play' },
            { x: x + 40, y: y + 230, w: w - 80, h: 76, act: 'home', label: '홈으로 (저장)', v: 'secondary', icon: 'home' },
            { x: x + 40, y: y + 324, w: w - 80, h: 76, act: 'abandon', label: '런 포기', v: 'ghost', icon: 'cross' },
          ]
        : [
            { x: x + 40, y: y + 128, w: w - 80, h: 84, act: 'resume', label: '계속', v: 'primary', icon: 'play' },
            { x: x + 40, y: y + 230, w: w - 80, h: 76, act: 'restart', label: '처음부터', v: 'secondary', icon: 'retry' },
            { x: x + 40, y: y + 324, w: w - 80, h: 76, act: 'select', label: '훈련 목록', v: 'secondary', icon: 'back' },
          ];
      this.pauseBtns.forEach((b) =>
        U.button(c, b, b.label, { variant: b.v, icon: b.icon, fontSize: 26, pressed: this.pausePress === b.act, iconColor: b.v === 'primary' ? undefined : C.cream }),
      );
    },
    down(x, y, id, type) {
      G.audio.init();
      const ui = this.ui || this.layout();
      if (this.stinger) {
        if (this.stinger.t > 0.8) this.leaveStinger();
        return;
      }
      if (this.paused) {
        // x·y 모두 검사. 버튼 사이 간격 → 7씩 확장
        const b = this.pauseBtns.find((b) => G.render.hit({ x: b.x - 7, y: b.y - 7, w: b.w + 14, h: b.h + 14 }, x, y));
        if (!b) return;
        sfx('click');
        if (b.act === 'resume') this.setPaused(false);
        else if (b.act === 'restart') this.restart();
        else if (b.act === 'abandon') {
          this.left = true;
          G.audio.stop();
          finishRun();
        } else {
          this.left = true;
          G.audio.stop();
          if (this.run) {
            G.run.current = null; // runActive stays saved → PLAY resumes it
            G.go('title');
          } else G.go('training');
        }
        return;
      }
      if (this.ended) return;
      const sk = this.tut && this.tut.skip;
      if (sk && G.render.hit(this.pad(sk, ui.min), x, y)) {
        sfx('click');
        this.endTutorial();
        return;
      }
      if (G.render.hit(this.pad(ui.pause, ui.min), x, y)) {
        this.setPaused(true);
        return;
      }
      // 버튼 판정은 원 + 25% 여유. 두 버튼이 겹치면 가까운 쪽
      const dd = Math.hypot(x - ui.dash.cx, y - ui.dash.cy) / ui.dash.r,
        df = Math.hypot(x - ui.focus.cx, y - ui.focus.cy) / ui.focus.r;
      if (dd <= 1.25 && dd <= df) {
        this.ptrs.set(id, 'dash');
        this.triggerDash();
        return;
      }
      if (df <= 1.25) {
        this.ptrs.set(id, 'focus');
        G.vibrate(6);
        return;
      }
      if (!this.joy && (x < ui.joyMaxX || type === 'mouse' || !G.isTouch())) {
        this.ptrs.set(id, 'joy');
        this.joy = { id, ox: x, oy: y, x: 0, y: 0, kx: 0, ky: 0 };
      }
    },
    move(x, y, id) {
      const role = this.ptrs.get(id);
      if (!role || this.paused) return;
      const ui = this.ui;
      if (role === 'focus' && this.inCircle(ui.dash, x, y, 1)) {
        this.ptrs.set(id, 'dash');
        this.triggerDash();
        return;
      }
      if (role === 'dash' && this.inCircle(ui.focus, x, y, 1)) {
        this.ptrs.set(id, 'focus');
        return;
      }
      if (role !== 'joy' || !this.joy || this.joy.id !== id) return;
      const j = this.joy,
        R = ui.joyR;
      let dx = x - j.ox,
        dy = y - j.oy,
        l = Math.hypot(dx, dy);
      if (l > R) {
        j.ox += dx * (1 - R / l);
        j.oy += dy * (1 - R / l);
        dx = x - j.ox;
        dy = y - j.oy;
        l = R;
      }
      const t = l / R,
        s = t < 0.12 ? 0 : (t - 0.12) / 0.88;
      j.kx = dx;
      j.ky = dy;
      j.x = l ? (dx / l) * s : 0;
      j.y = l ? (dy / l) * s : 0;
    },
    up(x, y, id) {
      this.ptrs.delete(id);
      if (this.joy?.id === id) {
        this.joyBase = { ox: this.joy.ox, oy: this.joy.oy };
        this.joy = null;
      }
    },
    key(code, on) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(code))
        on ? this.keys.add(code) : this.keys.delete(code);
      if (!on) return;
      if (this.stinger) {
        if ((code === 'Enter' || code === 'Space') && this.stinger.t > 0.5) this.leaveStinger();
        return;
      }
      if (code === 'Space') this.triggerDash();
      if (!this.ended && (code === 'Escape' || code === 'KeyP')) this.setPaused(!this.paused);
      if (code === 'KeyR' && !this.run) this.restart();
    },
    blur() {
      this.keys.clear();
      this.joy = null;
      this.ptrs.clear();
      if (!this.ended) this.setPaused(true);
    },
  };
  G.scenes.play = play;

  // ===================================================================================== DRAFT
  // 3 face-down cards slide in, then flip one by one; the back flares in its rarity colour just before
  // the flip (legendary: slow rays + bigger burst). Tap a revealed card to pick it.
  const TAGS = ['GRAZE', 'DASH', 'FLOW', 'CORE'];
  const draft = withUI({
    enter() {
      this.run = G.run.current;
      if (!this.run) return G.go('title');
      this.t = 0;
      this.picked = -1;
      this.reso = null;
      this.deal();
      this.pity = G.run.takeNotices().some((n) => n.type === 'pity');
      this.preview = G.run.preview();
      G.audio.stop();
    },
    deal() {
      this.cards = G.run.offer();
      this.t0 = this.t;
      this.fired = this.cards.map(() => false);
      const n = this.cards.length,
        w = n > 3 ? 222 : 252,
        gap = n > 3 ? 22 : 40,
        x0 = 640 - (n * w + (n - 1) * gap) / 2;
      this.rects = this.cards.map((cd, i) => ({ x: x0 + i * (w + gap), y: 150, w, h: 336 }));
      // flip schedule (legendary waits a beat longer for its flare)
      let at = 0.62;
      this.flipAt = this.cards.map((cd) => {
        const pre = cd.rarity === 'L' ? 0.55 : cd.rarity === 'E' ? 0.3 : 0.18,
          a = at + pre;
        at = a + 0.34;
        return a;
      });
      if (RED()) this.flipAt = this.cards.map(() => 0);
    },
    flipK(i) {
      if (RED()) return 1;
      return clamp((this.t - this.t0 - this.flipAt[i]) / 0.36, 0, 1);
    },
    revealed() {
      return this.cards.every((cd, i) => this.flipK(i) >= 1);
    },
    update(dt) {
      this.t += dt;
      // reveal sounds at the flip midpoint
      this.cards.forEach((cd, i) => {
        if (!this.fired[i] && this.flipK(i) >= 0.5) {
          this.fired[i] = true;
          if (cd.rarity === 'L') sfx('flow', { mult: 5 }), G.vibrate([20, 30, 40]);
          else if (cd.rarity === 'E') sfx('flow', { combo: 50 });
          else if (cd.rarity === 'R') sfx('ready');
          else if (cd.rarity === 'G') sfx('boss');
          else sfx('click');
        }
      });
      if (this.picked >= 0 && !this.done && this.t - this.pickT > 0.55) {
        this.done = true;
        const ok = G.run.pick(this.picked);
        if (!ok) return routeRun();
        const res = G.run.current.notices.filter((n) => n.type === 'resonance');
        if (res.length) {
          G.run.current.notices = G.run.current.notices.filter((n) => n.type !== 'resonance');
          this.reso = { n: res[0], t: 0 };
          sfx('flow', { mult: 4 });
        } else routeRun();
      }
      if (this.reso) {
        this.reso.t += dt;
        if (this.reso.t > 1.9) {
          this.reso = null;
          routeRun();
        }
      }
    },
    choose(i) {
      if (this.picked >= 0 || !this.revealed()) return;
      this.picked = i;
      this.pickT = this.t;
      this.done = false;
      sfx('flow', { combo: 25 });
      G.vibrate(15);
    },
    draw(c) {
      this.begin();
      const r = this.run,
        t = this.t - this.t0;
      U.bg(c, { kind: 'title', rays: { x: 640, y: 320 } });
      // header
      const cleared = r.sectorsCleared,
        nx = r.sector;
      U.label(c, `섹터 ${cleared} 클리어 · 드래프트 ${cleared}/4`, 640, edgeT() + 30, { size: 13, align: 'center', color: C.mint });
      U.sticker(c, '카드를 고르세요', 640, edgeT() + 72, 44, { stroke: 7, shadow: 5, rot: -2 });
      const nxt = `다음 · 섹터 ${nx.n} ${nx.boss ? '코어' : nx.name}${this.preview ? ' — ' + nx.featureNames.join(' · ') : ''}`;
      U.chip(c, 640, edgeT() + 104, nxt, { color: C.ink, size: 14, h: 34, align: 'center', sh: 0, sheen: false });
      shardPill(c, edgeL() + 22, edgeT() + 20, r.shards, { h: 54, size: 26, label: '파편' });
      pill(c, edgeR() - 22, edgeT() + 20, num(r.score), { align: 'right', h: 54, size: 24, label: 'SCORE', color: C.plate });
      // owned perks (right, under the score)
      r.picks.slice(0, 10).forEach((id, i) => perkDisc(c, edgeR() - 40 - i * 32, edgeT() + 104, 13, id));
      // resonance halo behind a legendary while its back flares
      this.cards.forEach((cd, i) => {
        const b = this.rects[i],
          k = this.flipK(i),
          pre = cd.rarity === 'L' && !RED() ? clamp((t - (this.flipAt[i] - 0.55)) / 0.55, 0, 1) : 0;
        if (cd.rarity === 'L' && (pre > 0 || k > 0) && this.picked < 0) {
          const cx = b.x + b.w / 2,
            cy = b.y + b.h / 2,
            a = k >= 1 ? 0.6 : 0.3 + 0.5 * pre;
          c.save();
          c.globalAlpha = a;
          c.beginPath();
          c.arc(cx, cy, 250, 0, Math.PI * 2);
          c.clip();
          c.fillStyle = 'rgba(255,200,61,1)';
          U.rays(c, cx, cy, 16, 260, 0.22, RED() ? 0 : this.t * 0.25);
          c.restore();
          if (k > 0.5) popAt(c, cx, cy, t - this.flipAt[i] - 0.18, () => U.burst(c, cx, b.y - 6, 40, { points: 16, fill: C.sun, disc: C.coral, text: '전설!', textSize: 17, tilt: -10 }));
        }
      });
      // cards
      this.cards.forEach((cd, i) => {
        const b0 = this.rects[i],
          slide = RED() ? 1 : U.ease.backOut(clamp((t - 0.05 - i * 0.09) / 0.34, 0, 1), 1.3),
          k = this.flipK(i),
          picked = this.picked === i,
          other = this.picked >= 0 && !picked,
          pk = this.picked >= 0 ? clamp((this.t - this.pickT) / 0.3, 0, 1) : 0;
        if (slide <= 0) return;
        let b = { ...b0, y: b0.y + (1 - slide) * 420 };
        const rar = RARK[cd.rarity] || 'common',
          pre = clamp((t - (this.flipAt[i] - (cd.rarity === 'L' ? 0.55 : 0.25))) / 0.25, 0, 1);
        c.save();
        if (other) c.globalAlpha = 1 - 0.7 * pk;
        if (other) b.y += 40 * pk;
        if (picked) {
          const s = 1 + 0.08 * U.ease.backOut(pk);
          b.y -= 22 * U.ease.backOut(pk);
          c.translate(b.x + b.w / 2, b.y + b.h / 2);
          c.scale(s, s);
          c.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        }
        const pressed = this.reg('card' + i, b0, () => this.choose(i), { silent: true }) && k >= 1 && this.picked < 0;
        // the flare: the face-down back shows its true rarity frame and lifts slightly before turning
        const lift = k <= 0 && !RED() ? Math.sin(pre * Math.PI) * 8 : 0;
        const back = (c2, bb) => U.cardBack(c2, { ...bb, y: bb.y - lift }, { rarity: pre > 0 ? rar : 'common' });
        const face = (c2, bb) =>
          U.cardFace(c2, bb, {
            rarity: rar,
            title: cd.name,
            desc: cd.desc,
            icon: kitIcon(cd.icon),
            iconColor: TAGC[cd.tag] || C.cream,
            tag: `${RARN[cd.rarity] || ''} · ${TAGK[cd.tag] || cd.tag}`,
            level: cd.maxStack > 1 ? cd.stack + 1 : undefined,
            levelMax: cd.maxStack,
            pressed,
            titleSize: 24,
            descSize: 15,
          });
        U.flipCard(c, b, k, face, back);
        if (k >= 1 && cd.completes) stickerTag(c, b.x + b.w - 30, b.y + 6, '공명 완성!', { color: C.pink, size: 15, tilt: 9, h: 30 });
        if (k >= 1 && cd.stack > 0) stickerTag(c, b.x + 34, b.y + 6, '중첩', { color: C.sun, size: 14, tilt: -9, h: 28 });
        if (k >= 1 && this.pity && i === 0) stickerTag(c, b.x + 40, b.y + b.h - 4, '확정 희귀', { color: C.sky, size: 13, tilt: -6, h: 28 });
        c.restore();
      });
      // resonance progress by tag
      const counts = {};
      for (const id of r.picks) {
        const d = G.perkDef(id);
        if (d) counts[d.tag] = (counts[d.tag] || 0) + 1;
      }
      const rw = 190,
        rx0 = 640 - (TAGS.length * rw + (TAGS.length - 1) * 12) / 2;
      U.label(c, '공명 · 같은 태그 3장', 640, 520, { size: 11, align: 'center' });
      TAGS.forEach((tag, i) => {
        const x = rx0 + i * (rw + 12),
          y = 534,
          n = Math.min(3, counts[tag] || 0),
          lit = r.resonance.includes(tag),
          col = TAGC[tag];
        U.plate(c, x, y, rw, 44, { fill: lit ? col : C.deep, r: 22, sw: 4, sh: 4, sheen: lit });
        U.disc(c, x + 22, y + 22, 9, col, { sw: 3, sh: 0, sheen: false });
        U.text(c, lit ? G.RESONANCE[tag].name : TAGK[tag], x + 40, y + 23, 16, lit ? C.ink : C.cream);
        if (lit) U.icon(c, 'check', x + rw - 24, y + 22, 22, { color: C.ink, ink: false });
        else
          for (let j = 0; j < 3; j++) {
            c.beginPath();
            c.arc(x + rw - 58 + j * 18, y + 22, 6, 0, Math.PI * 2);
            c.fillStyle = j < n ? col : C.night;
            c.fill();
            c.lineWidth = 2.5;
            c.strokeStyle = C.ink;
            c.stroke();
          }
      });
      // reroll / skip
      const cost = G.run.rerollCost(),
        can = cost <= r.shards && this.picked < 0,
        ready = this.revealed() && this.picked < 0;
      this.btn(c, 'reroll', { x: 640 - 262, y: 604, w: 250, h: 82 }, '리롤', { variant: 'secondary', icon: 'retry', iconColor: C.cream, fontSize: 28, sub: cost ? `파편 ${cost}` : '무료', disabled: !can || !ready }, () => {
        if (!ready) return;
        if (!can) return G.toast(`파편이 부족해요 (${cost} 필요)`, 1.8);
        if (G.run.reroll()) {
          sfx('section');
          this.deal();
        }
      });
      this.btn(c, 'skip', { x: 640 + 12, y: 604, w: 250, h: 82 }, '건너뛰기', { variant: 'secondary', fontSize: 26, sub: '파편 +8', disabled: !ready }, () => {
        if (!ready) return;
        this.picked = 99;
        this.done = true;
        G.run.skip();
        routeRun();
      });
      if (this.reso) this.drawReso(c);
    },
    drawReso(c) {
      const R = this.reso,
        t = R.t,
        col = TAGC[R.n.tag] || C.pink;
      dim(c, 0.6 * Math.min(1, t / 0.25));
      popAt(c, 640, 330, t, () => {
        U.burst(c, 640, 300, 120, { points: 18, fill: col, disc: C.ink, discR: 0.7, tilt: -6 });
        U.sticker(c, '공명!', 640, 296, 64, { fill: col, stroke: 9, shadow: 6, rot: -6 });
      });
      if (t > 0.3) {
        U.sticker(c, R.n.name, 640, 470, 36, { stroke: 6, shadow: 4 });
        U.chip(c, 640, 504, R.n.desc, { color: C.ink, size: 16, h: 40, align: 'center', sh: 0, sheen: false });
      }
    },
    key(code, on) {
      if (!on) return;
      if (/^Digit[1-4]$/.test(code)) this.choose(+code.slice(-1) - 1);
      if (code === 'KeyR') this.hb.find((h) => h.id === 'reroll')?.fn();
    },
  });
  G.scenes.draft = draft;

  // ===================================================================================== SHOP (cache)
  const shop = withUI({
    enter() {
      this.run = G.run.current;
      if (!this.run) return G.go('title');
      this.t = 0;
      this.flash = null;
    },
    update(dt) {
      this.t += dt;
      if (this.flash) this.flash.t += dt;
    },
    draw(c) {
      this.begin();
      const r = this.run,
        items = G.run.shopItems(),
        t = this.t;
      U.bg(c, { kind: 'results', rays: { x: 640, y: 120 } });
      U.label(c, '섹터 3 이후 · 한 번만 열립니다', 640, edgeT() + 30, { size: 13, align: 'center', color: C.mint });
      U.sticker(c, '캐시', 640, edgeT() + 74, 52, { stroke: 8, shadow: 5, rot: -3 });
      U.chip(c, 640, edgeT() + 108, '파편으로 정비하고 폭풍에 들어가세요', { color: C.ink, size: 14, h: 34, align: 'center', sh: 0, sheen: false });
      const bump = this.flash && this.flash.t < 0.25 && !RED() ? 1 + 0.12 * (1 - this.flash.t / 0.25) : 1;
      c.save();
      c.translate(edgeL() + 100, edgeT() + 48);
      c.scale(bump, bump);
      c.translate(-(edgeL() + 100), -(edgeT() + 48));
      shardPill(c, edgeL() + 22, edgeT() + 20, r.shards, { h: 58, size: 28, label: '파편' });
      c.restore();
      // shields now
      const k = G.Run.tunables(r),
        shN = r.carry ? r.carry.shields : 3;
      const tw2 = 40 * k.shieldMax + 34;
      U.plate(c, edgeR() - 22 - tw2, edgeT() + 20, tw2, 58, { fill: C.deep, r: 24, sw: 4, sh: 5, sheen: false });
      for (let i = 0; i < k.shieldMax; i++) U.shield(c, edgeR() - 22 - tw2 + 37 + i * 40, edgeT() + 48, i < shN, 28);
      U.label(c, '보호막', edgeR() - 22 - tw2 - 12, edgeT() + 50, { size: 11, align: 'right' });
      const n = items.length,
        cols = n > 6 ? 4 : 3,
        w = cols === 4 ? 282 : 360,
        rows = Math.ceil(n / cols),
        h = rows > 1 ? 180 : 230,
        gap = 18,
        x0 = 640 - (cols * w + (cols - 1) * gap) / 2,
        y0 = rows > 1 ? 150 : 200;
      items.forEach((it, i) => {
        const x = x0 + (i % cols) * (w + gap),
          y = y0 + Math.floor(i / cols) * (h + gap),
          bought = r.bought.includes(it.id),
          pk = popK(t - 0.05 - i * 0.06);
        if (pk <= 0) return;
        c.save();
        c.translate(x + w / 2, y + h / 2);
        c.scale(pk, pk);
        c.translate(-(x + w / 2), -(y + h / 2));
        U.panel(c, x, y, w, h, { color: bought ? C.deep : C.plate, sheen: false });
        const ic = it.id.startsWith('upgrade:') ? null : it.icon,
          perk = it.id.startsWith('upgrade:') || it.id.startsWith('purge:') ? it.id.split(':')[1] : null;
        if (perk) perkDisc(c, x + 46, y + 50, 26, perk);
        else {
          U.disc(c, x + 46, y + 50, 26, it.id === 'repair' ? C.sky : it.id === 'boost' ? C.sun : C.grape, { sw: 4, sh: 4 });
          U.icon(c, kitIcon(ic), x + 46, y + 49, 30, { color: C.cream });
        }
        if (it.id.startsWith('purge:')) U.icon(c, 'cross', x + 66, y + 70, 22);
        U.text(c, it.name, x + 86, y + 40, 21, C.cream, { maxW: w - 100 });
        U.wrapLines(it.desc, w - 104, 13, 700)
          .slice(0, 2)
          .forEach((ln, j) => U.text(c, ln, x + 86, y + 66 + j * 18, 13, C.mute, { weight: 700 }));
        const br = { x: x + w - 170, y: y + h - 64, w: 154, h: 50 };
        if (bought) {
          U.icon(c, 'check', br.x + 30, br.y + 25, 28);
          U.text(c, '구매 완료', br.x + 52, br.y + 26, 17, C.mint);
        } else {
          const pressed = this.reg('it' + i, { x, y, w, h }, () => {
            if (!it.can) return G.toast(it.price > r.shards ? `파편이 부족해요 (${it.price} 필요)` : '지금은 살 수 없어요', 1.8);
            if (G.run.buy(it.id)) {
              sfx('shield');
              G.vibrate(15);
              this.flash = { t: 0 };
            }
          }, { silent: !it.can });
          U.button(c, br, it.price ? String(it.price) : '무료', { variant: it.can ? 'primary' : 'ghost', size: 'sm', fontSize: 22, pressed: pressed && it.can, disabled: !it.can });
          if (it.price) shardIcon(c, br.x + 28, br.y + 24 + (pressed && it.can ? 6 : 0), 11);
        }
        c.restore();
      });
      const nx = r.sector;
      this.btn(c, 'go', { x: 640 - 220, y: 590, w: 440, h: 100 }, `섹터 ${nx.n} 출발`, { variant: 'primary', icon: 'play', size: 'lg', fontSize: 40, sub: nx.featureNames.join(' · ') }, () => {
        G.run.leaveShop();
        routeRun();
      });
    },
    key(code, on) {
      if (on && (code === 'Enter' || code === 'Space')) {
        G.run.leaveShop();
        routeRun();
      }
    },
  });
  G.scenes.shop = shop;

  // ===================================================================================== RESULTS
  // kind 'run' (G.run.finish summary) or 'mission' (training). Sequence: badge drops in → ribbon unrolls →
  // score counts up → NEW BEST → stage segments fill → ◆ counts → XP bar fills (level-up burst) → unlocks.
  const runRank = (s) => (s.clear ? (s.bossBroken && s.hits === 0 ? 'SS' : 'S') : s.sectorsCleared >= 4 ? 'A' : s.sectorsCleared >= 2 ? 'B' : s.sectorsCleared >= 1 ? 'C' : 'D');
  function xpSegs(lv0, lv1, ups) {
    if (!ups || !ups.length) return [{ L: lv0.level, a: lv0.pct, b: lv1.pct }];
    const out = [{ L: lv0.level, a: lv0.pct, b: 1, up: ups[0] }];
    for (let i = 1; i < ups.length; i++) out.push({ L: ups[i - 1].level, a: 0, b: 1, up: ups[i] });
    out.push({ L: lv1.level, a: 0, b: lv1.pct });
    return out;
  }
  function nextPerkUnlock() {
    const ps = G.meta.perks().filter((p) => !p.owned && !p.locked).sort((a, b) => a.price - b.price),
      p = ps[0];
    return p ? { id: p.id, name: p.name, price: p.price, missing: Math.max(0, p.price - G.meta.gems()) } : null;
  }

  // ---- share card (NEON JUMP method: pre-rendered PNG → navigator.share, else download) ----
  function drawCard(c, r) {
    const run = r.kind === 'run',
      s = run ? r.sum : r.stats,
      g = r.grade;
    c.save();
    c.scale(1.5, 1.5); // 720 × 720 design space
    U.bg(c, { kind: 'results', x0: 0, w: 720, rays: { x: 360, y: 300 } });
    U.sticker(c, 'ZERO', 300, 62, 64, { align: 'right', rot: -4, stroke: 8, shadow: 6 });
    U.plate(c, 312, 30, 200, 62, { fill: C.coral, r: 16, sw: 4, sh: 6, tilt: -4 });
    U.sticker(c, 'SIGNAL', 412, 62, 44, { fill: C.sun, rot: -4, stroke: 6, shadow: 4 });
    const tag = run
      ? `${s.daily ? `오늘의 런 ${+s.daily.slice(4, 6)}/${+s.daily.slice(6)}` : s.weekly ? '주간 변조' : 'SIGNAL RUN'} · 깊이 ${s.depth}`
      : r.mission.daily
        ? `오늘의 신호 · ${r.mission.baseName}`
        : `${r.mission.name} · ${r.mode === 'hard' ? 'HARD' : 'NORMAL'}`;
    U.chip(c, 360, 116, tag, { color: C.ink, size: 16, h: 38, align: 'center', sh: 0, sheen: false });
    U.gradeBadge(c, 220, 280, g, { size: 0.62 });
    const ok = run ? s.clear : s.clear;
    U.ribbon(c, 220, 392, 260, ok ? '클리어!' : run ? `섹터 ${s.sectorsCleared}/5` : '실패', { color: ok ? C.pink : C.plate, dark: ok ? C.pinkD : C.deep, h: 52, size: 30 });
    U.label(c, 'SCORE', 420, 214, { size: 13 });
    U.sticker(c, num(s.score), 420, 262, 62, { align: 'left', stroke: 9, shadow: 6, maxW: 280 });
    const rows = run
      ? [['스치기', num(s.grazes)], ['최대 FLOW', num(s.maxCombo)], ['퍽', String(s.perks.length)]]
      : [['시간', fmtT(s.time)], ['스치기', num(s.grazes)], ['최대 FLOW', num(s.maxCombo)]];
    rows.forEach(([l, v], i) => {
      U.label(c, l, 420, 314 + i * 38, { size: 12 });
      U.sticker(c, v, 680, 316 + i * 38, 26, { align: 'right', stroke: 5, shadow: 3, fill: C.sun });
    });
    const names = run ? G.SECTORS.map((q) => q.name) : SECTION_NAMES,
      filled = run ? s.sectorsCleared : s.clear ? 5 : Math.max(0, s.deathSection);
    U.segments(c, 60, 480, 600, 40, 5, filled, { labels: names, labelSize: 15 });
    if (run && s.perks.length) s.perks.slice(0, 14).forEach((p, i) => perkDisc(c, 360 + (i - (Math.min(14, s.perks.length) - 1) / 2) * 40, 590, 16, p.id));
    if (!run) MEDALS.forEach(([id], i) => medalBadge(c, 360 + (i - 2) * 64, 590, 24, id, G.runMedals(s).includes(id)));
    if (run && s.share) U.label(c, s.share.replace(/[🟦🟪🟨🟥⬜]/gu, '').trim(), 360, 660, { size: 13, align: 'center', color: C.cream });
    U.label(c, '피하고 · 스치고 · 돌파하라 · #ZEROSIGNAL', 360, 690, { size: 11, align: 'center' });
    c.restore();
  }
  function prepareCard(r) {
    r.card = null;
    r.cardBlob = null;
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1080;
      drawCard(cv.getContext('2d'), r);
      r.card = cv;
      cv.toBlob?.((b) => (r.cardBlob = b), 'image/png');
    } catch (e) {
      r.card = null;
    }
  }
  function shareCard(r) {
    const run = r.kind === 'run',
      m = r.mission,
      name = run ? `zero-signal-run-${r.sum.daily || dayKey()}.png` : `zero-signal-${m.daily ? 'daily-' + m.daily : m.id + '-' + r.mode}.png`,
      text = run
        ? r.sum.share
        : `ZERO SIGNAL 「${m.daily ? '오늘의 신호' : m.name}」${m.daily ? '' : ' ' + r.mode.toUpperCase()} · ${r.grade} · ${num(r.stats.score)}점${m.daily && r.streak ? ` · 연속 ${r.streak}일` : ''}`;
    const download = (blob) => {
      try {
        const a = document.createElement('a'),
          url = blob ? URL.createObjectURL(blob) : r.card.toDataURL('image/png');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
        try {
          navigator.clipboard?.writeText?.(text).catch(() => {});
        } catch {}
        G.toast('기록 카드를 저장했어요', 2.5, { color: C.sky });
      } catch (e) {
        G.toast('저장에 실패했어요');
      }
    };
    const blob = r.cardBlob;
    try {
      if (blob && typeof File !== 'undefined' && navigator.share && navigator.canShare) {
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'ZERO SIGNAL', text }).catch((e) => {
            if (!e || e.name !== 'AbortError') download(blob);
          });
          return;
        }
      }
    } catch (e) {
      /* 다운로드로 */
    }
    if (blob) download(blob);
    else if (r.card && r.card.toBlob) r.card.toBlob((b) => download(b), 'image/png');
    else G.toast('이 기기에서는 저장할 수 없어요');
  }

  const result = withUI({
    enter(p) {
      Object.assign(this, { streak: 0, first: false, news: {}, newMedals: [], unlocks: [], prev: null, reward: null, mission: null, stats: null, sum: null }, p);
      this.t = 0;
      this.ups = [];
      this.upIdx = 0;
      this.fxs = [];
      this.lastSeg = 0;
      const run = this.kind === 'run';
      if (run) {
        const s = this.sum;
        this.grade = runRank(s);
        this.gain = s.dataEarned;
        this.levelUps = s.levelUps || [];
        this.list = [...s.bounties.map((b) => `현상금 · ${b.label} ◆80`), ...s.unlocks];
        this.next = s.nextUnlock;
      } else {
        this.gain = this.reward ? this.reward.data : 0;
        this.levelUps = this.reward ? this.reward.levelUps : [];
        this.list = [...this.unlocks, ...this.newMedals.map((id) => `메달 · ${medalName(id)}`)];
        this.next = nextPerkUnlock();
      }
      this.lv1 = G.meta.level();
      this.segs = xpSegs(this.lv0 || this.lv1, this.lv1, this.levelUps);
      this.tXp = run ? 1.7 : 1.5;
      let d = 0;
      for (const s of this.segs) d += 0.25 + 0.6 * (s.b - s.a);
      this.tList = this.tXp + d + 0.2;
      this.tEnd = this.tList + this.list.length * 0.16 + 0.3;
      this.landed = false;
      G.particles.length = 0;
      prepareCard(this);
    },
    xpNow() {
      let tt = this.t - this.tXp;
      for (let i = 0; i < this.segs.length; i++) {
        const s = this.segs[i],
          d = 0.25 + 0.6 * (s.b - s.a);
        if (tt < d || i === this.segs.length - 1) {
          return { i, L: s.L, f: s.a + (s.b - s.a) * U.ease.cubicOut(clamp(tt / d, 0, 1)) };
        }
        tt -= d;
      }
      return { i: 0, L: this.segs[0].L, f: this.segs[0].a };
    },
    update(dt) {
      this.t += dt;
      for (let i = this.fxs.length - 1; i >= 0; i--) if ((this.fxs[i].t += dt) > this.fxs[i].life) this.fxs.splice(i, 1);
      if (!this.landed && this.t > 0.38) {
        this.landed = true;
        sfx(this.kind === 'run' ? (this.sum.clear ? 'complete' : 'section') : this.stats.clear ? 'complete' : 'section');
      }
      const x = this.xpNow();
      while (this.lastSeg < x.i) {
        const s = this.segs[this.lastSeg];
        if (s.up) {
          this.fxs.push({ t: 0, life: 3.2, up: s.up });
          sfx('flow', { mult: 5 });
          G.vibrate([20, 30, 40]);
        }
        this.lastSeg++;
      }
    },
    skipAnim() {
      if (this.t < this.tEnd) this.t = Math.max(this.t, this.tEnd);
    },
    retry() {
      if (this.kind === 'run') {
        const s = this.sum;
        if (s.daily && !G.meta.dailyRun().open) return G.go('title');
        startRun({ daily: !!s.daily, weekly: !!s.weekly, depth: s.depth });
      } else G.go('play', { mission: this.mission.daily ? dailyMission() : this.mission, mode: this.mode });
    },
    home() {
      G.go(this.kind === 'run' ? 'title' : 'training');
    },
    draw(c) {
      this.begin();
      const run = this.kind === 'run',
        s = run ? this.sum : this.stats,
        t = this.t,
        L = Math.max(edgeL(), -60);
      // camera nudge when the badge lands (4 px, once)
      const sh = !RED() && t > 0.38 && t < 0.5 ? (1 - (t - 0.38) / 0.12) * 4 : 0;
      U.bg(c, { kind: 'results', rays: { x: L + 300, y: 300 } });
      c.save();
      c.translate(0, sh * Math.sin(t * 90));
      // ---- left: badge + ribbon
      const tag = run
        ? `${s.daily ? '오늘의 런' : s.weekly ? '주간 변조' : 'SIGNAL RUN'} · 깊이 ${s.depth}`
        : this.mission.daily
          ? `오늘의 신호 · ${this.mission.baseName}`
          : `${this.mission.name} · ${this.mode === 'hard' ? 'HARD' : 'NORMAL'}`;
      U.chip(c, L + 300, edgeT() + 24, tag, { color: C.ink, size: 16, h: 42, align: 'center', sh: 0, sheen: false });
      U.gradeBadge(c, L + 300, 290, this.grade, { size: 0.9, k: RED() ? 1 : t / 0.38 });
      const ok = s.clear;
      U.ribbon(c, L + 300, 480, 330, ok ? '클리어!' : run ? '신호 끊김' : '실패', { color: ok ? C.pink : C.plate, dark: ok ? C.pinkD : C.deep, k: RED() ? 1 : (t - 0.3) / 0.22, h: 68, size: 40 });
      if (run) {
        U.label(c, s.clear ? (s.bossBroken ? '코어 격파 · 완전 돌파' : '5섹터 생존') : `섹터 ${s.deathSector} 「${G.SECTORS[s.deathSector - 1]?.name || ''}」에서 끊김`, L + 300, 552, { size: 13, align: 'center', color: C.cream });
        const ps = s.perks.slice(0, 12),
          n = ps.length;
        ps.forEach((p, i) => popAt(c, L + 300 + (i - (n - 1) / 2) * 34, 594, t - 0.6 - i * 0.04, () => perkDisc(c, L + 300 + (i - (n - 1) / 2) * 34, 594, 14, p.id)));
        if (s.resonance.length) U.label(c, '공명 · ' + s.resonance.map((q) => G.RESONANCE[q].name).join(' · '), L + 300, 630, { size: 12, align: 'center', color: C.pink });
      } else {
        U.label(c, s.clear ? (s.hits ? `피격 ${s.hits} · 대시 ${s.dashes}` : `NO-HIT · 대시 ${s.dashes}`) : `생존 ${fmtT(s.time)} / ${fmtT(this.mission.duration)}`, L + 300, 552, { size: 13, align: 'center', color: C.cream });
        const earned = G.runMedals(s);
        MEDALS.forEach(([id], i) =>
          popAt(c, L + 300 + (i - 2) * 58, 604, t - 0.7 - i * 0.07, () => medalBadge(c, L + 300 + (i - 2) * 58, 604, 22, id, earned.includes(id), this.newMedals.includes(id))),
        );
      }
      // ---- right column
      const X = 660,
        W = Math.min(600, edgeR() - 24 - X);
      U.label(c, 'SCORE', X, 64, { size: 13 });
      const cu = U.countUp(s.score, t, { delay: 0.3, dur: 0.9 });
      c.save();
      c.translate(X, 122);
      c.scale(cu.sx, cu.sy);
      U.sticker(c, num(cu.value), 0, 0, 92, { align: 'left', stroke: 12, shadow: 8, ls: -2, maxW: W - 150 });
      c.restore();
      const best = run ? s.newBest : this.news.score || (this.first && s.clear);
      if (best) popAt(c, X + W - 80, 74, t - 1.25, () => stickerTag(c, X + W - 80, 74, run && s.daily ? '오늘 BEST' : 'NEW BEST', { color: C.mint, size: 24, tilt: 8 }));
      const sub = run
        ? `스치기 ${num(s.grazes)} · 최대 FLOW ${s.maxCombo} · 아슬아슬 ${s.nearMisses} · ${fmtT(s.time)}`
        : this.prev && this.prev.score
          ? `${s.score >= this.prev.score ? '+' + num(s.score - this.prev.score) + ' vs 최고 기록' : '최고 ' + num(this.prev.score)} · 스치기 ${s.grazes} · FLOW ${s.maxCombo}`
          : `스치기 ${s.grazes} · 최대 FLOW ${s.maxCombo} · ${fmtT(s.time)}`;
      U.text(c, sub, X + 4, 182, 15, run || !this.news.score ? C.mute : C.mint, { weight: 800, maxW: W });
      // stage / sector segments with a death mark
      const names = run ? G.SECTORS.map((q) => q.name) : SECTION_NAMES,
        total = run ? s.sectorsCleared : s.clear ? 5 : Math.max(0, s.deathSection),
        shown = RED() ? total : Math.min(total, Math.floor(Math.max(0, t - 0.5) / 0.09)),
        deadIdx = run ? (s.clear ? -1 : s.deathSector - 1) : s.clear ? -1 : s.deathSection;
      let partial = 0;
      if (!run && !s.clear && deadIdx >= 0) {
        const T = s.sectionTimes,
          a = T[deadIdx],
          b = T[deadIdx + 1] ?? this.mission.duration;
        partial = clamp((s.time - a) / Math.max(1, b - a), 0, 1);
      }
      U.label(c, run ? 'SECTORS' : 'STAGE PROGRESS', X, 214, { size: 12 });
      U.label(c, `${total}/5`, X + W, 214, { size: 12, align: 'right', color: C.mint });
      U.segments(c, X, 228, W, 40, 5, shown, { labels: names, labelSize: 14, partial: shown === total ? partial : 0 });
      if (deadIdx >= 0 && t > 0.5 + total * 0.09 + 0.1) {
        const gap = 6,
          sw = (W - 8 - gap * 4) / 5,
          cx = X + 4 + deadIdx * (sw + gap) + sw / 2;
        popAt(c, cx, 248, t - (0.6 + total * 0.09), () => U.icon(c, 'cross', cx, 248, 30));
      }
      // rewards: ◆ + pilot XP
      const ry = 312;
      U.plate(c, X, ry, W, 108, { fill: C.deep, r: 22, sw: 5, sh: 6, sheen: false });
      gem(c, X + 40, ry + 54, 22);
      const gc = U.countUp(this.gain, t, { delay: 1.3, dur: 0.6 });
      U.label(c, '신호 데이터', X + 72, ry + 32, { size: 11 });
      c.save();
      c.translate(X + 72, ry + 66);
      c.scale(gc.sx, gc.sy);
      U.sticker(c, '+' + num(gc.value), 0, 0, 36, { align: 'left', fill: C.sky, stroke: 7, shadow: 3 });
      c.restore();
      const xp = this.xpNow(),
        bx = X + 236,
        bw = W - 262;
      U.label(c, 'PILOT', bx, ry + 30, { size: 11 });
      U.sticker(c, `Lv ${xp.L}`, bx + 56, ry + 30, 20, { align: 'left', stroke: 4, shadow: 2, fill: C.sun });
      U.label(c, `XP +${num(this.gain)}`, bx + bw, ry + 30, { size: 11, align: 'right', color: C.cream });
      U.progress(c, bx, ry + 52, bw, 22, t < this.tXp ? this.segs[0].a : xp.f, { color: C.sky, notches: [0.25, 0.5, 0.75] });
      const lv1 = this.lv1;
      U.label(c, lv1.need ? `다음 레벨까지 ${num(Math.max(0, lv1.need - lv1.xp))} XP` : '최고 레벨', bx, ry + 92, { size: 11 });
      // unlocks + next nudge
      const uy = 446;
      if (this.list.length) {
        U.label(c, 'UNLOCKED', X, uy, { size: 12, color: C.sun });
        let ux = X,
          uyy = uy + 14;
        this.list.slice(0, 6).forEach((s2, i) => {
          const w = U.measure(s2, 14) + 34;
          if (ux + w > X + W) {
            ux = X;
            uyy += 46;
          }
          if (uyy > uy + (this.next ? 14 : 60)) return;
          const x0 = ux;
          popAt(c, x0 + w / 2, uyy + 18, t - this.tList - i * 0.16, () => U.chip(c, x0, uyy, s2, { color: i % 2 ? C.sky : C.pink, size: 14, h: 36, sh: 4 }));
          ux += w + 10;
        });
      }
      if (this.next) {
        const nx = this.next,
          have = Math.max(0, nx.price - nx.missing),
          uy = this.list.length ? 512 : 446;
        U.plate(c, X, uy - 4, W, 72, { fill: C.night, r: 20, sw: 5, sh: 5, sheen: false });
        U.burst(c, X + 40, uy + 32, 24, { points: 10, fill: C.sun, disc: C.grape, tilt: 8, sh: 3 });
        U.icon(c, 'cardBack', X + 40, uy + 32, 24);
        U.label(c, 'NEXT UNLOCK', X + 80, uy + 14, { size: 11, color: C.sun });
        U.text(c, nx.missing ? `「${nx.name}」까지 ◆${num(nx.missing)}` : `「${nx.name}」 해금 가능! 격납고로`, X + 80, uy + 35, 17, C.cream, { maxW: W - 110 });
        U.progress(c, X + 80, uy + 50, W - 110, 10, nx.price ? have / nx.price : 1, { color: C.sun });
      }
      c.restore();
      // ---- buttons (pop in early: retry is always one tap away)
      const by = 598,
        rw = Math.min(300, W * 0.5);
      popAt(c, X + rw / 2, by + 48, t - 0.5, () =>
        this.btn(c, 'retry', { x: X, y: by, w: rw, h: 96 }, run ? '다시 런' : 'RETRY', { variant: 'primary', icon: 'retry', size: 'lg', fontSize: 40 }, () => this.retry()),
      );
      const ow = (W - rw - 24) / 2;
      popAt(c, X + rw + 12 + ow / 2, by + 48, t - 0.58, () =>
        this.btn(c, 'home', { x: X + rw + 12, y: by + 8, w: ow, h: 84 }, run ? '홈' : '훈련', { variant: 'secondary', icon: run ? 'home' : 'back', fontSize: 26, iconColor: C.cream }, () => this.home()),
      );
      popAt(c, X + rw + 24 + ow * 1.5, by + 48, t - 0.66, () =>
        this.btn(c, 'share', { x: X + rw + 24 + ow, y: by + 8, w: ow, h: 84 }, '공유', { variant: 'share', icon: 'share', fontSize: 26 }, () => shareCard(this)),
      );
      if (t > this.tEnd) U.label(c, run ? 'ENTER · 다시 런' : '빈 곳을 탭하면 재도전', X + W / 2, Math.min(712, edgeB() - 6), { size: 10, align: 'center' });
      // level-up moments
      for (const f of this.fxs) {
        const k = f.t,
          a = Math.min(1, (f.life - k) * 3);
        c.save();
        c.globalAlpha = a;
        const lx = X + W - 62,
          ly = ry + 40;
        popAt(c, lx, ly, k, () => {
          U.burst(c, lx, ly, 58, { points: 16, fill: C.sun, disc: C.coral, tilt: -8 });
          U.sticker(c, 'LEVEL UP', lx, ly - 12, 17, { rot: -8, stroke: 4, shadow: 2 });
          U.sticker(c, `Lv ${f.up.level}`, lx, ly + 13, 24, { rot: -8, fill: C.sun, stroke: 5, shadow: 3 });
        });
        c.restore();
      }
    },
    blank() {
      if (this.t < this.tEnd) return this.skipAnim();
      if (this.kind !== 'run' && this.t > 0.8) this.retry();
    },
    key(code, on) {
      if (!on || this.t < 0.4) return;
      if (code === 'Enter' || code === 'Space' || code === 'KeyR') this.retry();
      if (code === 'Escape') this.home();
    },
  });
  G.scenes.result = result;

  // ===================================================================================== TRAINING
  const training = withUI({
    get mode() {
      return G.save.data.mode === 'hard' ? 'hard' : 'normal';
    },
    enter() {
      this.t = 0;
      this.daily = dailyMission();
      this.gems = G.meta.gems();
      this.stars = G.meta.stars();
    },
    update(dt) {
      this.t += dt;
    },
    state(m, i) {
      if (m.daily) return dailyOpen() ? 'open' : 'locked';
      if (i >= G.save.data.unlocked) return 'locked';
      if (this.mode === 'hard' && !hardOpen(m)) return 'hardLocked';
      return 'open';
    },
    launch(m, i) {
      const st = this.state(m, i);
      if (st !== 'open') {
        sfx('hit');
        G.toast(st === 'hardLocked' ? 'NORMAL로 생존하면 HARD가 열려요' : m.daily ? `「${G.MISSIONS[0].name}」을 생존하면 열려요` : '앞 임무를 생존하면 열려요', 2);
        return;
      }
      if (m.daily) G.go('play', { mission: dailyMission(), mode: 'normal' });
      else G.go('play', { mission: m, mode: this.mode });
    },
    draw(c) {
      this.begin();
      const t = this.t,
        hard = this.mode === 'hard';
      U.bg(c, { kind: 'title', rays: { x: 640, y: 760 } });
      backBtn(this, c, () => G.go('title'));
      header(c, '훈련', '기록 · 메달 · ◆ 보상 — 런 실력이 늘어요');
      const tr = { x: edgeR() - 24 - 250, y: edgeT() + 20, w: 250, h: 58 };
      U.toggle(c, tr, ['NORMAL', 'HARD'], hard ? 1 : 0, { size: 19 });
      this.reg('mode', tr, () => {
        G.save.data.mode = hard ? 'normal' : 'hard';
        G.save.persist();
      });
      pill(c, tr.x - 14, edgeT() + 22, `${this.stars}/30`, { align: 'right', h: 54, size: 22, icon: (c, x, y, r) => U.icon(c, 'medal', x, y, r * 2) });
      const list = [...G.MISSIONS, this.daily],
        W = 272,
        gap = 20,
        x0 = 640 - (list.length * W + (list.length - 1) * gap) / 2;
      list.forEach((m, i) => {
        const x = x0 + i * (W + gap),
          y = 138,
          h = 440,
          pk = popK(t - 0.04 - i * 0.06);
        if (pk <= 0) return;
        c.save();
        c.translate(x + W / 2, y + h / 2);
        c.scale(pk, pk);
        c.translate(-(x + W / 2), -(y + h / 2));
        this.card(c, m, i, x, y, W, h);
        c.restore();
      });
      U.label(c, '이동 WASD/방향키 · 집중 SHIFT · 대시 SPACE · 모드 H · 1-4 시작', 640, edgeB() - 22, { size: 11, align: 'center' });
    },
    card(c, m, i, x, y, w, h) {
      const st = this.state(m, i),
        open = st === 'open',
        hard = this.mode === 'hard' && !m.daily,
        col = mColor(m);
      U.panel(c, x, y, w, h, { color: open ? C.plate : C.deep, sheen: false });
      // colour band
      c.save();
      U.rr(c, x + 3, y + 3, w - 6, 64, 18);
      c.clip();
      c.fillStyle = open ? col : C.plateHi;
      c.fillRect(x, y, w, 64);
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.fillRect(x, y, w, 18);
      c.restore();
      U.rr(c, x, y, w, h, 20);
      c.lineWidth = 5;
      c.strokeStyle = C.ink;
      c.stroke();
      U.text(c, m.sub, x + 20, y + 34, 14, C.ink, { maxW: w - 80 });
      if (open) G.render.bulletIcon(c, x + w - 34, y + 34, m.daily ? 'petal' : SIG_KIND[m.id] || 'fan', 12, this.t * 0.6 * (RED() ? 0 : 1));
      U.sticker(c, m.name, x + 20, y + 98, 30, { align: 'left', stroke: 5, shadow: 3, maxW: w - 40 });
      if (hard && open) stickerTag(c, x + w - 46, y + 98, 'HARD', { color: C.coral, textColor: C.cream, size: 14, tilt: 8, h: 28 });
      if (m.daily && this.mode === 'hard') stickerTag(c, x + w - 60, y + 98, 'NORMAL', { color: C.mint, size: 13, tilt: 8, h: 28 });
      const btnR = { x: x + 20, y: y + h - 82, w: w - 40, h: 64 };
      if (!open) {
        const cx = x + w / 2;
        U.disc(c, cx, y + 190, 40, C.plate, { sw: 4, sh: 5 });
        U.icon(c, 'lock', cx, y + 188, 44, { color: st === 'hardLocked' ? C.coral : C.mute });
        const prev = G.MISSIONS[i - 1],
          cond = m.daily ? `「${G.MISSIONS[0].name}」을 생존하면 매일 새 신호` : st === 'hardLocked' ? 'NORMAL로 생존하면 HARD 해제' : `「${prev ? prev.name : ''}」을 생존하면 해제`;
        U.wrapLines(cond, w - 40, 16, 800)
          .slice(0, 3)
          .forEach((ln, j) => U.text(c, ln, cx, y + 260 + j * 24, 16, C.cream, { align: 'center', weight: 800 }));
        if (st === 'hardLocked') {
          const r = rec(m.id, 'normal');
          U.label(c, r.time ? `NORMAL 최고 ${fmtT(r.time)} / ${fmtT(m.duration)}` : 'NORMAL 기록 없음', cx, y + 336, { size: 11, align: 'center' });
        }
        this.btn(c, 'm' + i, btnR, '잠김', { variant: 'ghost', icon: 'lock', fontSize: 22, disabled: true }, () => this.launch(m, i));
        return;
      }
      U.wrapLines(m.desc, w - 40, 14, 700)
        .slice(0, 2)
        .forEach((ln, j) => U.text(c, ln, x + 20, y + 136 + j * 20, 14, C.mute, { weight: 700 }));
      for (let j = 0; j < 3; j++) U.icon(c, 'star', x + 32 + j * 26, y + 196, 24, { color: j < m.difficulty ? C.sun : C.deep });
      U.chip(c, x + w - 20, y + 182, fmtT(m.duration), { color: C.deep, size: 14, h: 30, align: 'right', icon: 'clock', sh: 3, sheen: false });
      if (m.daily) {
        const D = dailyData(),
          sk = G.meta.streak().days;
        U.label(c, '오늘 BEST', x + 20, y + 238, { size: 11 });
        U.sticker(c, D.best ? num(D.best) : '—', x + 20, y + 270, 30, { align: 'left', stroke: 5, shadow: 3, fill: D.best ? C.sun : C.mute });
        if (D.best && D.grade !== '-') U.gradeBadge(c, x + w - 50, y + 262, D.grade, { size: 0.2 });
        U.label(c, sk ? `연속 ${sk}일째 수신 중` : '오늘 첫 수신으로 연속 시작', x + 20, y + 312, { size: 12, color: sk ? C.mint : C.mute });
        for (let j = 0; j < 7; j++) {
          U.rr(c, x + 20 + j * 33, y + 326, 27, 12, 6);
          c.fillStyle = j < Math.min(7, sk) ? C.mint : C.night;
          c.fill();
        }
      } else {
        const r = rec(m.id, this.mode);
        U.label(c, 'BEST', x + 20, y + 238, { size: 11 });
        U.sticker(c, r.score ? num(r.score) : '—', x + 20, y + 270, 30, { align: 'left', stroke: 5, shadow: 3, fill: r.score ? C.sun : C.mute });
        if (r.score && r.grade !== '-') U.gradeBadge(c, x + w - 50, y + 262, r.grade, { size: 0.2 });
        MEDALS.forEach(([id], j) => medalBadge(c, x + 36 + j * 50, y + 322, 19, id, !!r.medals[id]));
      }
      this.btn(c, 'm' + i, btnR, m.daily ? '수신' : hard ? 'HARD 시작' : '시작', { variant: hard ? 'danger' : 'primary', icon: 'play', fontSize: 26, iconColor: hard ? C.cream : undefined }, () => this.launch(m, i));
    },
    key(code, on) {
      if (!on) return;
      if (code === 'Escape') G.go('title');
      if (code === 'KeyH') {
        G.save.data.mode = this.mode === 'hard' ? 'normal' : 'hard';
        G.save.persist();
      }
      if (/^Digit[1-4]$/.test(code)) {
        const i = +code.slice(-1) - 1,
          m = [...G.MISSIONS, this.daily][i];
        if (m) this.launch(m, i);
      }
    },
  });
  G.scenes.training = training;
  G.scenes.select = training; // legacy name

  // ===================================================================================== DAILY (오늘의 런)
  const daily = withUI({
    enter() {
      this.t = 0;
      this.refresh();
    },
    refresh() {
      this.dr = G.meta.dailyRun();
      this.wk = G.meta.weekly();
      this.sk = G.meta.streak();
      this.dm = dailyMission();
      this.gems = G.meta.gems();
    },
    update(dt) {
      this.t += dt;
    },
    draw(c) {
      this.begin();
      const t = this.t,
        k = dayKey();
      U.bg(c, { kind: 'title', rays: { x: 640, y: 380 } });
      backBtn(this, c, () => G.go('title'));
      header(c, '오늘의 런', `${+k.slice(4, 6)}월 ${+k.slice(6)}일 · 모두 같은 시드`);
      // streak flame
      const sk = this.sk;
      U.burst(c, edgeR() - 70, edgeT() + 56, 44, { points: 14, fill: sk.lit ? C.sun : C.plateHi, disc: sk.lit ? C.coral : C.plate, text: String(sk.days), textSize: 32, tilt: 10 });
      U.label(c, sk.lit ? '연속 수신' : '오늘 아직', edgeR() - 126, edgeT() + 50, { size: 12, align: 'right', color: sk.lit ? C.sun : C.cream });
      U.label(c, `보호 ${sk.freezes}/2`, edgeR() - 126, edgeT() + 70, { size: 11, align: 'right' });
      const W = 372,
        gap = 22,
        x0 = 640 - (W * 3 + gap * 2) / 2,
        y = 134,
        H = 430;
      const cards = [
        () => this.dailyRun(c, x0, y, W, H),
        () => this.dailySignal(c, x0 + W + gap, y, W, H),
        () => this.weekly(c, x0 + (W + gap) * 2, y, W, H),
      ];
      cards.forEach((fn, i) => {
        const pk = popK(t - 0.04 - i * 0.07),
          x = x0 + i * (W + gap);
        if (pk <= 0) return;
        c.save();
        c.translate(x + W / 2, y + H / 2);
        c.scale(pk, pk);
        c.translate(-(x + W / 2), -(y + H / 2));
        fn();
        c.restore();
      });
      // streak strip
      const sy = 600,
        sx = 640 - 330;
      U.plate(c, sx, sy, 660, 74, { fill: C.deep, r: 24, sw: 5, sh: 6, sheen: false });
      U.label(c, 'STREAK', sx + 22, sy + 24, { size: 11 });
      for (let j = 0; j < 7; j++) {
        const on = j < Math.min(7, sk.days);
        U.disc(c, sx + 40 + j * 40, sy + 50, 13, on ? C.sun : C.night, { sw: 3, sh: 2, sheen: on });
        if (on) U.icon(c, 'check', sx + 40 + j * 40, sy + 50, 16, { color: C.ink, ink: false });
      }
      const nx = sk.next;
      U.text(c, nx ? `연속 ${nx.days}일 보상` : '모든 연속 보상 획득!', sx + 340, sy + 26, 14, C.sun);
      U.text(c, nx ? nx.label : '끊기지 않는 신호', sx + 340, sy + 50, 16, C.cream, { maxW: 300 });
    },
    cardShell(c, x, y, w, h, col, title, label, open) {
      U.panel(c, x, y, w, h, { color: open ? C.plate : C.deep, sheen: false });
      c.save();
      U.rr(c, x + 3, y + 3, w - 6, 70, 18);
      c.clip();
      c.fillStyle = open ? col : C.plateHi;
      c.fillRect(x, y, w, 72);
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.fillRect(x, y, w, 20);
      c.restore();
      U.rr(c, x, y, w, h, 20);
      c.lineWidth = 5;
      c.strokeStyle = C.ink;
      c.stroke();
      U.label(c, label, x + 22, y + 26, { size: 11, color: C.ink });
      U.sticker(c, title, x + 22, y + 52, 26, { align: 'left', stroke: 5, shadow: 3 });
    },
    lockBody(c, x, y, w, text) {
      U.disc(c, x + w / 2, y + 170, 40, C.plate, { sw: 4, sh: 5 });
      U.icon(c, 'lock', x + w / 2, y + 168, 44, { color: C.mute });
      U.wrapLines(text, w - 60, 17, 800).forEach((ln, j) => U.text(c, ln, x + w / 2, y + 244 + j * 26, 17, C.cream, { align: 'center' }));
    },
    dailyRun(c, x, y, w, h) {
      const D = this.dr;
      this.cardShell(c, x, y, w, h, C.pink, '일일 런', 'DAILY SIGNAL RUN', D.open);
      const br = { x: x + 22, y: y + h - 88, w: w - 44, h: 68 };
      if (!D.open) {
        this.lockBody(c, x, y, w, 'SIGNAL RUN을 한 번 클리어하면 열려요');
        this.btn(c, 'dr', br, '잠김', { variant: 'ghost', icon: 'lock', disabled: true, fontSize: 24 }, () => G.toast('SIGNAL RUN 1회 클리어 시 해제', 2));
        return;
      }
      U.text(c, '오늘은 모두 같은 섹터 · 같은 카드', x + 22, y + 104, 15, C.mute, { weight: 800 });
      U.label(c, '오늘 BEST', x + 22, y + 148, { size: 11 });
      U.sticker(c, D.best ? num(D.best) : '—', x + 22, y + 184, 40, { align: 'left', stroke: 7, shadow: 4, fill: D.best ? C.sun : C.mute });
      U.label(c, `도전 ${D.tries}회 · 깊이 0`, x + 22, y + 226, { size: 12, color: C.cream });
      if (D.firstBonus) stickerTag(c, x + w - 80, y + 160, '첫 도전 ◆×2', { color: C.mint, size: 16, tilt: 8 });
      const A = G.run.active(),
        busy = A && !A.daily;
      if (A && A.daily) U.label(c, `진행 중 · 섹터 ${A.sector}`, x + 22, y + 262, { size: 12, color: C.mint });
      if (busy) U.wrapLines('진행 중인 런이 있어요 — 끝내거나 포기하면 도전할 수 있어요', w - 44, 13, 700).forEach((ln, j) => U.text(c, ln, x + 22, y + 270 + j * 18, 13, C.sun, { weight: 700 }));
      this.btn(c, 'dr', br, A && A.daily ? '이어하기' : '도전', { variant: busy ? 'ghost' : 'primary', icon: 'play', fontSize: 28, disabled: busy }, () => {
        if (busy) return G.toast('진행 중인 런을 먼저 끝내세요', 2);
        startRun(A && A.daily ? { resume: true } : { daily: true });
      });
    },
    dailySignal(c, x, y, w, h) {
      const open = dailyOpen(),
        m = this.dm;
      this.cardShell(c, x, y, w, h, C.sun, '오늘의 신호', 'DAILY MISSION', open);
      const br = { x: x + 22, y: y + h - 88, w: w - 44, h: 68 };
      if (!open) {
        this.lockBody(c, x, y, w, `「${G.MISSIONS[0].name}」을 생존하면 매일 새 신호가 열려요`);
        this.btn(c, 'ds', br, '잠김', { variant: 'ghost', icon: 'lock', disabled: true, fontSize: 24 }, () => G.toast('훈련 「잔향 구역」 생존 시 해제', 2));
        return;
      }
      U.text(c, `${m.baseName} 기반 · ${fmtT(m.duration)} 생존`, x + 22, y + 104, 15, C.mute, { weight: 800 });
      G.render.bulletIcon(c, x + w - 40, y + 104, 'petal', 12, this.t * (RED() ? 0 : 0.6));
      const D = dailyData();
      U.label(c, '오늘 BEST', x + 22, y + 148, { size: 11 });
      U.sticker(c, D.best ? num(D.best) : '—', x + 22, y + 184, 40, { align: 'left', stroke: 7, shadow: 4, fill: D.best ? C.sun : C.mute });
      if (D.best && D.grade !== '-') U.gradeBadge(c, x + w - 64, y + 180, D.grade, { size: 0.26 });
      U.label(c, `도전 ${D.tries || 0}회 · 훈련 기록 · 연속에 포함`, x + 22, y + 226, { size: 12, color: C.cream });
      this.btn(c, 'ds', br, '수신', { variant: 'primary', icon: 'play', fontSize: 28 }, () => G.go('play', { mission: dailyMission(), mode: 'normal' }));
    },
    weekly(c, x, y, w, h) {
      const W = this.wk;
      this.cardShell(c, x, y, w, h, C.grape, '주간 변조', `WEEK ${W.key.split('-W')[1] || ''}`, W.open);
      const br = { x: x + 22, y: y + h - 88, w: w - 44, h: 68 };
      if (!W.open) {
        this.lockBody(c, x, y, w, '깊이 2에 도달하면 열려요 · 매주 새 규칙');
        this.btn(c, 'wk', br, '잠김', { variant: 'ghost', icon: 'lock', disabled: true, fontSize: 24 }, () => G.toast('깊이 2 도달 시 해제', 2));
        return;
      }
      const days = Math.floor(W.endsIn / 864e5),
        hrs = Math.floor((W.endsIn % 864e5) / 36e5);
      U.text(c, `깊이 3 · 글리치 2장 · ${days}일 ${hrs}시간 남음`, x + 22, y + 100, 14, C.mute, { weight: 800 });
      const fd = G.perkDef(W.forced);
      if (fd) {
        perkDisc(c, x + 40, y + 140, 17, W.forced);
        U.text(c, `시작 퍽 · ${fd.name}`, x + 66, y + 141, 15, C.cream);
      }
      W.bounties.forEach((b, j) => {
        const by = y + 182 + j * 46;
        U.plate(c, x + 18, by, w - 36, 38, { fill: b.done ? C.mintD : C.deep, r: 14, sw: 3, sh: 3, sheen: false });
        U.icon(c, b.done ? 'check' : 'star', x + 38, by + 19, 20, { color: b.done ? C.cream : C.sun });
        U.text(c, b.label, x + 56, by + 20, 13, C.cream, { maxW: w - 140 });
        U.text(c, '◆80', x + w - 30, by + 20, 13, C.sky, { align: 'right' });
      });
      const A = G.run.active(),
        busy = A && !A.weekly;
      this.btn(c, 'wk', br, A && A.weekly ? '이어하기' : '도전', { variant: busy ? 'ghost' : 'primary', icon: 'play', fontSize: 28, disabled: busy }, () => {
        if (busy) return G.toast('진행 중인 런을 먼저 끝내세요', 2);
        startRun(A && A.weekly ? { resume: true } : { weekly: true });
      });
    },
    key(code, on) {
      if (on && code === 'Escape') G.go('title');
    },
  });
  G.scenes.daily = daily;

  // ===================================================================================== HANGAR (격납고)
  const TABS = ['스킨', '아카이브', '보정', '기록'];
  const hangar = withUI({
    tab: 0,
    sel: null,
    enter(p = {}) {
      this.t = 0;
      if (p.tab != null) this.tab = p.tab;
      this.refresh();
      if (!this.sel) this.sel = G.meta.skin().id;
    },
    refresh() {
      this.gems = G.meta.gems();
      this.vouchers = G.meta.vouchers();
      this.skins = G.meta.skins();
      this.perks = G.meta.perks();
      this.calib = G.meta.calib();
      this.stars = G.meta.stars();
      this.lv = G.meta.level();
      this.runs = G.meta.runs();
      this.depths = G.meta.depths();
      applySkin();
    },
    update(dt) {
      this.t += dt;
      if (this.bump) this.bump.t += dt;
    },
    bought(msg) {
      sfx('flow', { mult: 3 });
      G.vibrate(20);
      this.bump = { t: 0 };
      this.refresh();
      G.notify(msg, { color: C.mint, life: 1.8 });
    },
    draw(c) {
      this.begin();
      U.bg(c, { kind: 'results', rays: { x: 240, y: 420 } });
      backBtn(this, c, () => G.go('title'));
      U.sticker(c, '격납고', edgeL() + 176, edgeT() + 50, 40, { align: 'left', stroke: 7, shadow: 5, rot: -3 });
      const tr = { x: 640 - 250, y: edgeT() + 20, w: 500, h: 58 };
      const segs = U.toggle(c, tr, TABS, this.tab, { colors: [C.sky, C.sun, C.mint, C.pink], size: 19 });
      segs.forEach((s, i) => this.reg('tab' + i, s, () => (this.tab = i), { pad: 2 }));
      const bk = this.bump && this.bump.t < 0.25 && !RED() ? 1 + 0.12 * (1 - this.bump.t / 0.25) : 1;
      c.save();
      c.translate(edgeR() - 80, edgeT() + 48);
      c.scale(bk, bk);
      c.translate(-(edgeR() - 80), -(edgeT() + 48));
      const gp = gemPill(c, edgeR() - 22, edgeT() + 20, this.gems, { align: 'right', h: 56, size: 25 });
      c.restore();
      if (this.vouchers) pill(c, gp.x - 10, edgeT() + 24, `해금권 ${this.vouchers}`, { align: 'right', h: 46, size: 17, color: C.grape, icon: (c, x, y, r) => U.icon(c, 'cardBack', x, y, r * 2) });
      [this.skinTab, this.archiveTab, this.calibTab, this.statsTab][this.tab].call(this, c);
    },
    // ---- skins: preview + grid
    skinTab(c) {
      const t = this.t,
        S = this.skins,
        sel = S.find((s) => s.id === this.sel) || S[0],
        look = skinLook(sel);
      const px = edgeL() + 40 > 20 ? 40 : Math.max(edgeL() + 30, -40),
        pw = 360;
      U.panel(c, px, 112, pw, 560, { color: C.deep, sheen: false });
      U.rays(c, px + pw / 2, 290, 18, 200, 0.05, 0);
      const bob = RED() ? 0 : Math.sin(t * Math.PI * 1.6) * 5;
      c.fillStyle = 'rgba(27,18,51,.4)';
      c.beginPath();
      c.ellipse(px + pw / 2, 404, 70, 12, 0, 0, Math.PI * 2);
      c.fill();
      U.ship(c, px + pw / 2, 290 + bob, { scale: 2.7, flame: RED() ? 38 : 38 + 3 * Math.sin(t * 9), ...look, look: { x: 0.4, y: -0.3 } });
      U.sticker(c, sel.name, px + pw / 2, 452, 32, { stroke: 6, shadow: 4, maxW: pw - 40 });
      U.label(c, sel.equipped ? '장착 중' : sel.owned ? '보유 중' : sel.buyable ? '◆로 구매' : '획득 조건', px + pw / 2, 488, { size: 12, align: 'center', color: sel.equipped ? C.mint : C.mute });
      const br = { x: px + 30, y: 520, w: pw - 60, h: 80 };
      if (sel.equipped) U.button(c, br, '장착 중', { variant: 'mint', icon: 'check', fontSize: 28, disabled: false });
      else if (sel.owned) this.btn(c, 'equip', br, '장착', { variant: 'primary', icon: 'skin', fontSize: 30 }, () => G.meta.equipSkin(sel.id) && this.bought(`「${sel.name}」 장착`));
      else if (sel.buyable) {
        const can = this.gems >= sel.price;
        this.btn(c, 'buy', br, num(sel.price), { variant: can ? 'primary' : 'ghost', fontSize: 32, disabled: !can }, () => {
          if (!can) return G.toast(`◆ ${num(sel.price - this.gems)} 더 필요해요`, 2);
          if (G.meta.buySkin(sel.id)) {
            G.meta.equipSkin(sel.id);
            this.bought(`스킨 「${sel.name}」 획득!`);
          }
        });
        gem(c, br.x + br.w / 2 - U.measure(num(sel.price), 32) / 2 - 26, br.y + br.h / 2 - 4, 16);
      } else {
        U.plate(c, br.x, br.y, br.w, br.h, { fill: C.night, r: 22, sw: 4, sh: 0, sheen: false });
        U.icon(c, 'lock', br.x + 34, br.y + br.h / 2, 30, { color: C.mute });
        U.wrapLines(sel.cond || '', br.w - 80, 16, 800)
          .slice(0, 2)
          .forEach((ln, j, a) => U.text(c, ln, br.x + 62, br.y + br.h / 2 + (j - (a.length - 1) / 2) * 22, 16, C.cream));
      }
      U.label(c, '히트박스(눈)는 모든 스킨에서 같아요', px + pw / 2, 636, { size: 11, align: 'center' });
      const cols = 4,
        gx0 = px + pw + 26,
        gw = Math.min(1250, edgeR() - 20) - gx0,
        tw = (gw - (cols - 1) * 14) / cols,
        th = 172;
      S.forEach((s, i) => {
        const x = gx0 + (i % cols) * (tw + 14),
          y = 112 + Math.floor(i / cols) * (th + 22),
          on = s.id === this.sel,
          pk = popK(this.t - 0.03 - i * 0.025);
        if (pk <= 0) return;
        const pr = this.reg('sk' + i, { x, y, w: tw, h: th }, () => (this.sel = s.id), { pad: 2 });
        c.save();
        c.translate(x + tw / 2, y + th / 2);
        c.scale(pk, pk);
        c.translate(-(x + tw / 2), -(y + th / 2));
        U.plate(c, x, y + (pr ? 4 : 0), tw, th, { fill: on ? C.plateHi : s.owned ? C.plate : C.deep, r: 20, sw: on ? 6 : 4, sh: pr ? 2 : 6, sheen: s.owned });
        const yy = y + (pr ? 4 : 0);
        if (on) {
          U.rr(c, x - 4, yy - 4, tw + 8, th + 8, 24);
          c.lineWidth = 4;
          c.strokeStyle = C.sun;
          c.stroke();
        }
        c.save();
        if (!s.owned) c.globalAlpha = 0.55;
        U.ship(c, x + tw / 2, yy + 66, { scale: 1.25, ...skinLook(s), look: { x: 0, y: -0.5 } });
        c.restore();
        U.text(c, s.name, x + tw / 2, yy + 120, 16, C.cream, { align: 'center', maxW: tw - 16 });
        if (s.equipped) U.chip(c, x + tw / 2, yy + 134, '장착 중', { color: C.mint, size: 12, h: 26, align: 'center', sh: 3 });
        else if (s.owned) U.label(c, '보유', x + tw / 2, yy + 148, { size: 11, align: 'center', color: C.mint });
        else if (s.buyable) {
          const w = U.measure(num(s.price), 16) + 30;
          gem(c, x + tw / 2 - w / 2 + 8, yy + 148, 8);
          U.text(c, num(s.price), x + tw / 2 - w / 2 + 22, yy + 149, 16, this.gems >= s.price ? C.sky : C.mute);
        } else U.icon(c, 'lock', x + tw / 2, yy + 148, 20, { color: C.mute });
        c.restore();
      });
    },
    // ---- archive: perks that enter the draft pool
    archiveTab(c) {
      const P = this.perks,
        cols = 6,
        gap = 12,
        L = Math.max(edgeL() + 24, 20),
        R = Math.min(edgeR() - 24, 1260),
        tw = (R - L - gap * (cols - 1)) / cols,
        th = 156;
      U.label(c, `드래프트 풀 ${P.filter((p) => p.owned).length}/${P.length} · ◆로 카드를 해금하면 런에 등장합니다`, 640, 112, { size: 12, align: 'center' });
      P.forEach((p, i) => {
        const x = L + (i % cols) * (tw + gap),
          y = 132 + Math.floor(i / cols) * (th + gap),
          rar = RARK[p.rarity] || 'common',
          pk = popK(this.t - 0.02 - i * 0.02);
        if (pk <= 0) return;
        const pr = this.reg('pk' + i, { x, y, w: tw, h: th }, () => {
          if (p.owned) return G.toast(`「${p.name}」 · ${p.desc}`, 3);
          if (p.locked) return G.toast('4섹터에 도달하면 글리치 카드가 열려요', 2.2);
          if (!p.canBuy) return G.toast(`◆ ${num(p.price - this.gems)} 더 필요해요`, 2);
          if (G.meta.buyPerk(p.id)) this.bought(`「${p.name}」 드래프트에 추가!`);
        }, { pad: 2 });
        c.save();
        c.translate(x + tw / 2, y + th / 2);
        c.scale(pk, pk);
        c.translate(-(x + tw / 2), -(y + th / 2));
        if (p.locked && !p.owned) c.globalAlpha = 0.6;
        U.cardFrame(c, x, y, tw, th, rar, { pressed: pr, sh: 6, r: 18 });
        const yy = y + (pr ? 5 : 0);
        perkDisc(c, x + 34, yy + 40, 18, p.id);
        U.text(c, p.name, x + 60, yy + 34, 16, C.cream, { maxW: tw - 72 });
        U.label(c, `${RARN[p.rarity]} · ${TAGK[p.tag] || p.tag}`, x + 60, yy + 53, { size: 10, color: TAGC[p.tag] || C.mute });
        U.wrapLines(p.desc, tw - 32, 12, 700)
          .slice(0, 2)
          .forEach((ln, j) => U.text(c, ln, x + 16, yy + 82 + j * 17, 12, C.mute, { weight: 700 }));
        if (p.owned) {
          U.icon(c, 'check', x + tw - 30, yy + th - 30, 24);
          U.label(c, p.price ? '해금됨' : '기본', x + 18, yy + th - 28, { size: 11, color: C.mint });
        } else if (p.locked) {
          U.icon(c, 'lock', x + 26, yy + th - 30, 20, { color: C.mute });
          U.label(c, '4섹터 도달', x + 42, yy + th - 29, { size: 10 });
        } else {
          const can = p.canBuy;
          gem(c, x + 24, yy + th - 30, 9);
          U.sticker(c, num(p.price), x + 38, yy + th - 29, 20, { align: 'left', stroke: 4, shadow: 2, fill: can ? C.sky : C.mute });
          if (can) stickerTag(c, x + tw - 38, yy + th - 30, '해금', { color: C.sun, size: 13, tilt: -6, h: 26 });
        }
        c.restore();
      });
    },
    // ---- calibration (QoL, needs 10 medals)
    calibTab(c) {
      const Cs = this.calib,
        locked = Cs.length && Cs[0].locked,
        W = 360,
        gap = 26,
        x0 = 640 - (W * 3 + gap * 2) / 2;
      U.label(c, locked ? `훈련 메달 10개가 필요해요 · 현재 ${this.stars}/10` : '편의 기능 · 런의 난이도는 그대로', 640, 118, { size: 13, align: 'center', color: locked ? C.sun : C.mute });
      if (locked) U.progress(c, 640 - 160, 134, 320, 14, this.stars / 10, { color: C.sun });
      const ICN = { reroll: 'retry', preview: 'eye', cache4: 'cardBack' };
      Cs.forEach((q, i) => {
        const x = x0 + i * (W + gap),
          y = 176,
          h = 400,
          pk = popK(this.t - 0.04 - i * 0.07);
        if (pk <= 0) return;
        c.save();
        c.translate(x + W / 2, y + h / 2);
        c.scale(pk, pk);
        c.translate(-(x + W / 2), -(y + h / 2));
        U.panel(c, x, y, W, h, { color: q.owned ? C.mintD : locked ? C.deep : C.plate, sheen: !locked });
        U.disc(c, x + W / 2, y + 92, 52, q.owned ? C.mint : C.sky, { sw: 5, sh: 6 });
        U.icon(c, ICN[q.id] || 'gear', x + W / 2, y + 90, 56, { color: q.id === 'reroll' ? C.ink : C.cream });
        U.sticker(c, q.name, x + W / 2, y + 188, 30, { stroke: 6, shadow: 3 });
        U.wrapLines(q.desc, W - 60, 16, 700).forEach((ln, j) => U.text(c, ln, x + W / 2, y + 232 + j * 24, 16, C.cream, { align: 'center', weight: 700 }));
        const br = { x: x + 30, y: y + h - 96, w: W - 60, h: 72 };
        if (q.owned) U.button(c, br, '보유', { variant: 'mint', icon: 'check', fontSize: 26 });
        else {
          const can = !locked && this.gems >= q.price;
          this.btn(c, 'cb' + i, br, num(q.price), { variant: can ? 'primary' : 'ghost', fontSize: 30, disabled: !can, icon: locked ? 'lock' : undefined }, () => {
            if (locked) return G.toast(`훈련 메달 10개 필요 (${this.stars}/10)`, 2);
            if (!can) return G.toast(`◆ ${num(q.price - this.gems)} 더 필요해요`, 2);
            if (G.meta.buyCalib(q.id)) this.bought(`보정 「${q.name}」 적용`);
          });
          if (!locked) gem(c, br.x + br.w / 2 - U.measure(num(q.price), 30) / 2 - 24, br.y + br.h / 2 - 4, 14);
        }
        c.restore();
      });
    },
    // ---- records
    statsTab(c) {
      const R = this.runs,
        d = G.save.data,
        lv = this.lv;
      // pilot card
      U.panel(c, 60, 116, 420, 250, { color: C.plate });
      U.burst(c, 140, 210, 62, { points: 14, fill: C.sun, disc: C.coral, text: String(lv.level), textSize: 46, tilt: -8 });
      U.label(c, 'PILOT', 220, 160, { size: 12 });
      U.sticker(c, lv.title || `Lv ${lv.level}`, 220, 196, 28, { align: 'left', stroke: 5, shadow: 3, maxW: 240 });
      U.progress(c, 220, 226, 230, 18, lv.pct, { color: C.sky });
      U.label(c, lv.need ? `${num(lv.xp)} / ${num(lv.need)} XP` : 'MAX', 220, 262, { size: 11 });
      U.label(c, `칭호 ${lv.titles.length}개 · 메달 ${this.stars}/30`, 90, 330, { size: 12, color: C.cream });
      // stat tiles
      const tiles = [
        ['런', num(R.count), 'play'],
        ['클리어', num(R.clears), 'trophy'],
        ['최고 점수', num(R.best.score), 'star'],
        ['최고 섹터', `${Math.min(5, R.bestSector)}/5`, 'medal'],
        ['총 스치기', num(d.totalGraze || 0), 'spark'],
        ['아슬아슬', num((d.stats && d.stats.nearMiss) || 0), 'eye'],
      ];
      tiles.forEach(([l, v, ic], i) => {
        const x = 510 + (i % 3) * 246,
          y = 116 + Math.floor(i / 3) * 130,
          pk = popK(this.t - 0.03 - i * 0.05);
        if (pk <= 0) return;
        U.panel(c, x, y, 230, 114, { color: C.deep, sheen: false });
        U.label(c, l, x + 18, y + 26, { size: 12 });
        U.icon(c, ic, x + 196, y + 30, 30);
        U.sticker(c, v, x + 18, y + 74, 36, { align: 'left', stroke: 6, shadow: 3, maxW: 200, fill: C.sun });
      });
      // depth ladder
      U.label(c, `깊이 · 최대 ${R.depthMax}`, 60, 404, { size: 12 });
      this.depths.forEach((D, i) => {
        const x = 90 + i * 106,
          y = 470,
          col = D.cleared ? C.mint : D.unlocked ? C.grape : C.deep;
        U.burst(c, x, y, 38, { points: 12, fill: col, disc: D.unlocked ? C.ink : C.night, discR: 0.7, text: String(D.n), textSize: 26, tilt: i % 2 ? 6 : -6, sh: 4 });
        U.text(c, D.name, x, y + 60, 13, D.unlocked ? C.cream : C.mute, { align: 'center', maxW: 100 });
        if (D.cleared) U.icon(c, 'check', x + 28, y - 28, 22);
      });
      U.label(c, '깊이 N을 클리어하면 N+1이 열립니다 · 규칙은 누적', 640, 580, { size: 12, align: 'center' });
    },
    key(code, on) {
      if (!on) return;
      if (code === 'Escape') G.go('title');
      if (code === 'ArrowRight') this.tab = (this.tab + 1) % 4;
      if (code === 'ArrowLeft') this.tab = (this.tab + 3) % 4;
    },
  });
  G.scenes.hangar = hangar;

  G.screensDebug = { dailyMission, dailyData, rec, drawCard, skinLook, routeRun, finishRun };
  applySkin();
})();
