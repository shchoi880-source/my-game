(() => {
  'use strict';
  const G = (window.G = window.G || {});
  G.scenes = {};
  const center = (c, s, y, size, color = '#eef7ff', o = {}) =>
    G.text(c, s, s === 'DASH' ? 1138 : 640, y, size, color, { align: 'center', ...o });
  // [toast] 화면 아래 알림 한 줄. main.js 가 장면 위(화면 좌표 0..G.VW)에 그림
  const toastS = { msg: '', t: 0 };
  G.toast = (msg, sec = 2.5) => {
    toastS.msg = msg;
    toastS.t = sec;
  };
  G.drawToast = (c, dt) => {
    if (toastS.t <= 0) return;
    toastS.t -= dt;
    c.save();
    c.globalAlpha = Math.min(1, toastS.t * 3);
    c.font = `700 18px ${G.FONT}`;
    const w = Math.min(G.VW - 40, Math.max(240, c.measureText(toastS.msg).width + 56)),
      x = G.VW / 2 - w / 2,
      y = 720 - G.SAFE.b - 92;
    G.rr(c, x, y, w, 50, 25);
    c.fillStyle = 'rgba(8,12,28,.94)';
    c.fill();
    c.strokeStyle = 'rgba(77,238,234,.7)';
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
    G.text(c, toastS.msg, G.VW / 2, y + 25, 18, '#eef7ff', {
      align: 'center',
      alpha: Math.min(1, toastS.t * 3),
      maxW: w - 28,
    });
  };
  // [install] 앱 설치: Chrome/삼성 인터넷은 설치 창, 그 외(iOS 등)는 방법 안내 (NEON JUMP 방식)
  function installApp() {
    G.audio.sfx('click');
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
    else if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//.test(ua))
      G.toast('⋮ 메뉴 → 다른 브라우저(Chrome)로 열기', 6);
    else if (/SamsungBrowser/.test(ua)) G.toast('아래 ≡ 메뉴 → 현재 페이지 추가 → 홈 화면', 6);
    else G.toast('오른쪽 위 ⋮ 메뉴 → 홈 화면에 추가', 6);
  }
  // ---- records ----------------------------------------------------------------
  // 저장 키·version(2)은 그대로. NORMAL 기록은 예전 그대로 best[id] (옛 세이브 = NORMAL 기록),
  // HARD 기록은 best['id:hard']. 새 필드(flow, medals)는 없으면 채워 넣는다.
  const GOLD = '#ffd166',
    CYAN = '#4deeea',
    HARD_COL = '#ff5c8a';
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
      // 옛 세이브: 클리어 기록과 옛 S(=무피격 클리어)를 메달로 옮김
      if (r.clear) r.medals.clear = 1;
      if (r.clear && r.grade === 'S') r.medals.nohit = 1;
    }
    return r;
  };
  G.save.rec = rec;
  const gradeRank = (g) => G.GRADE_ORDER.indexOf(g);
  const hardOpen = (m) => !!rec(m.id, 'normal').clear;
  const MEDALS = [
    ['clear', '클리어'],
    ['nohit', '무피격'],
    ['graze150', '스치기 150'],
    ['nodash', '무대시'],
    ['boss', '코어 격파'],
  ];
  const medalName = (id) => (MEDALS.find((m) => m[0] === id) || [id, id])[1];
  const fmtT = (s) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60)
      .toString()
      .padStart(2, '0')}`;
  const num = (n) => Math.floor(n).toLocaleString('ko-KR');
  const gradeColor = (g, m) =>
    g === 'SS' || g === 'S'
      ? GOLD
      : g === 'A'
        ? CYAN
        : g === 'B'
          ? '#b45cff'
          : g === 'D'
            ? '#ff5c8a'
            : (m && m.color) || '#9aa7bd';

  // ---- daily signal ("오늘의 신호") --------------------------------------------
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const yesterdayKey = () => {
    const d = new Date();
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  };
  // 지역 날짜로 시드를 정함 → 같은 날엔 모두 같은 패턴. 기반 임무도 날짜로 고름.
  function dailyMission() {
    const k = dayKey(),
      h = G.hash('ZS' + k),
      base = G.MISSIONS[h % G.MISSIONS.length];
    return {
      ...base,
      seed: h,
      name: '오늘의 신호',
      sub: `일일 신호 · ${+k.slice(4, 6)}/${+k.slice(6)}`,
      color: GOLD,
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
    if (D.date !== k)
      Object.assign(D, { date: k, best: 0, time: 0, graze: 0, flow: 0, grade: '-', clear: false, tries: 0 });
    return D;
  }
  const dailyStreak = (D) => (D.last === dayKey() || D.last === yesterdayKey() ? D.streak || 0 : 0);
  const dailyOpen = () => G.save.data.unlocked >= 2;

  // ---- small drawing helpers ----------------------------------------------------
  function wrap(c, s, maxW, size, weight = 600) {
    c.save();
    c.font = `${weight} ${size}px ${G.FONT}`;
    const out = [];
    let line = '';
    for (const w of String(s).split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (line && c.measureText(t).width > maxW) {
        out.push(line);
        line = w;
      } else line = t;
    }
    if (line) out.push(line);
    c.restore();
    return out;
  }
  function chip(c, x, y, label, bg, fg = '#141006', size = 11, align = 'left') {
    c.save();
    c.font = `900 ${size}px ${G.FONT}`;
    const w = Math.ceil(c.measureText(label).width) + size * 1.3,
      h = size + 9;
    if (align === 'right') x -= w;
    if (align === 'center') x -= w / 2;
    G.rr(c, x, y - h / 2, w, h, h / 2);
    c.fillStyle = bg;
    c.fill();
    c.restore();
    G.text(c, label, x + w / 2, y + 0.5, size, fg, { align: 'center', weight: 900 });
    return w;
  }
  // 메달 아이콘(글꼴에 기대지 않고 직접 그림)
  function medalIcon(c, x, y, id, on, r = 12) {
    const col = on ? GOLD : '#46506a',
      k = r * 0.5;
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.arc(0, 0, r, 0, G.TAU);
    c.fillStyle = on ? 'rgba(255,209,102,.16)' : 'rgba(255,255,255,.03)';
    c.fill();
    c.lineWidth = Math.max(1.5, r * 0.11);
    c.strokeStyle = col;
    c.stroke();
    c.fillStyle = col;
    c.lineWidth = Math.max(1.6, r * 0.15);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    if (id === 'clear') {
      c.moveTo(-k * 0.95, 0.05 * k);
      c.lineTo(-k * 0.25, k * 0.72);
      c.lineTo(k, -k * 0.7);
      c.stroke();
    } else if (id === 'nohit') {
      c.moveTo(0, -k);
      c.lineTo(k * 0.85, 0);
      c.lineTo(0, k);
      c.lineTo(-k * 0.85, 0);
      c.closePath();
      c.fill();
    } else if (id === 'graze150') {
      c.arc(0, 0, k * 0.95, 0.5, 4.6);
      c.stroke();
      c.beginPath();
      c.arc(k * 0.62, -k * 0.62, k * 0.3, 0, G.TAU);
      c.fill();
    } else if (id === 'nodash') {
      c.moveTo(-k * 0.8, -k * 0.6);
      c.lineTo(-k * 0.2, 0);
      c.lineTo(-k * 0.8, k * 0.6);
      c.moveTo(k * 0.05, -k * 0.6);
      c.lineTo(k * 0.65, 0);
      c.lineTo(k * 0.05, k * 0.6);
      c.stroke();
      c.beginPath();
      c.moveTo(-k, k);
      c.lineTo(k, -k);
      c.stroke();
    } else if (id === 'boss') {
      c.arc(0, 0, k * 0.75, 0, G.TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(0, -k * 1.15);
      c.lineTo(0, -k * 0.45);
      c.moveTo(0, k * 0.45);
      c.lineTo(0, k * 1.15);
      c.moveTo(-k * 1.15, 0);
      c.lineTo(-k * 0.45, 0);
      c.moveTo(k * 0.45, 0);
      c.lineTo(k * 1.15, 0);
      c.stroke();
    }
    c.restore();
  }
  // 5구간 진행 막대: 채움 = 이번 판, 빨간 표시 = 탈락 지점, 금색 표시 = 이전 최고 생존 시간
  function progressBar(c, x, y, w, o) {
    const { duration, sections, time, dead, best, color, labels = true, h = 12 } = o;
    const X = (t) => x + (w * G.clamp(t, 0, duration)) / duration;
    G.rr(c, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
    c.fillStyle = 'rgba(5,7,17,.9)';
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.07)';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, X(time) - x, h);
    // 구간 경계
    c.fillStyle = 'rgba(5,7,17,.95)';
    sections.forEach((t, i) => i && c.fillRect(X(t) - 1.5, y - 1, 3, h + 2));
    if (labels) {
      const fs = o.labelSize || 12;
      sections.forEach((t, i) => {
        const t1 = sections[i + 1] ?? duration,
          reached = time >= t;
        G.text(c, o.names[i], (X(t) + X(t1)) / 2, y + h + fs + 4, fs, reached ? '#c9d3e6' : '#5a6580', {
          align: 'center',
          weight: 700,
          maxW: X(t1) - X(t) - 6,
        });
      });
    }
    if (best > 0 && best < duration - 0.05) {
      const bx = X(best);
      c.fillStyle = GOLD;
      c.beginPath();
      c.moveTo(bx, y - 3);
      c.lineTo(bx - 7, y - 13);
      c.lineTo(bx + 7, y - 13);
      c.closePath();
      c.fill();
      c.fillRect(bx - 1, y - 3, 2, h + 6);
      G.text(c, 'BEST', bx, y - 23, o.tagSize || 11, GOLD, { align: 'center', weight: 900 });
    }
    if (dead) {
      const dx = X(time),
        s = h * 0.55 + 3;
      c.save();
      c.strokeStyle = '#050711';
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(dx - s, y + h / 2 - s);
      c.lineTo(dx + s, y + h / 2 + s);
      c.moveTo(dx + s, y + h / 2 - s);
      c.lineTo(dx - s, y + h / 2 + s);
      c.stroke();
      c.strokeStyle = '#ff3b6b';
      c.lineWidth = 3;
      c.stroke();
      c.restore();
    }
  }
  const SIG_KIND = { echo: 'fan', fracture: 'spiral', zero: 'rain' };
  const title = {
    t: 0,
    start: { x: 490, y: 500, w: 300, h: 64 },
    install: null,
    installRect() {
      if (!G.isTouch() || !G.pwa || G.pwa.installed()) return null;
      const h = Math.max(48, 46 / (G.scale || 1)),
        w = 150;
      return { x: 1280 + G.AX - G.SAFE.r - 16 - w, y: G.SAFE.t + 16, w, h };
    },
    enter() {
      this.t = 0;
      G.audio.stop();
    },
    update(dt) {
      this.t += dt;
      G.updateParticles(dt);
    },
    draw(c) {
      G.render.bg(c, this.t);
      c.save();
      c.translate(640, 270);
      c.rotate(this.t * 0.08);
      for (let i = 0; i < 4; i++) {
        c.strokeStyle = `rgba(${77 + i * 35},${238 - i * 20},${234 - i * 20},${0.22 - i * 0.035})`;
        c.lineWidth = 2;
        c.setLineDash([22 + i * 7, 15]);
        c.beginPath();
        c.arc(0, 0, 92 + i * 28, this.t * (i % 2 ? -0.28 : 0.2), G.TAU + this.t * (i % 2 ? -0.28 : 0.2));
        c.stroke();
      }
      c.restore();
      // 느리게 도는 적 탄환: '따뜻한 색 = 위험'을 첫 화면에서 보여줌
      G.render.demoBullets(c, this.t, 640, 232, 290);
      center(c, 'ZERO', 218, 78, '#eef7ff', { weight: 950 });
      center(c, 'SIGNAL', 292, 78, '#4deeea', { weight: 950 });
      center(c, 'BULLET SURVIVAL PROTOCOL', 352, 16, '#8291ad', { weight: 800 });
      center(c, '스치고 · 집중하고 · 돌파하라', 405, 20, '#eef7ff', { weight: 700 });
      G.render.button(c, this.start, '접속 시작', true, '화면 터치 · ENTER');
      center(c, 'WASD / 방향키 이동  ·  SPACE 대시  ·  SHIFT 집중', 600, 15, '#8291ad', { weight: 700 });
      center(c, 'v1.1  ·  오프라인 플레이 지원', 672, 12, '#52627d', { weight: 600 });
      this.install = this.installRect();
      if (this.install) G.render.button(c, this.install, '앱 설치');
    },
    down(x, y) {
      G.audio.init();
      // 설치 창은 '손을 뗄 때'만 브라우저가 허락함 → 여기서는 표시만 하고 up()에서 실행
      if (this.install && G.render.hit(this.install, x, y)) {
        this.installDown = true;
        G.noLandscapeOnce = true;
        return;
      }
      this.installDown = false;
      if (G.render.hit(this.start, x, y)) {
        G.audio.sfx('click');
        G.go('select');
      }
    },
    up(x, y) {
      if (this.installDown) {
        this.installDown = false;
        if (this.install && G.render.hit(this.install, x, y)) installApp();
      }
    },
    key(code, on) {
      if (on && (code === 'Enter' || code === 'Space')) this.down(640, 530);
    },
  };
  G.scenes.title = title;
  const select = {
    t: 0,
    cards: [],
    back: { x: 70, y: 42, w: 110, h: 46 },
    modeBtn: { x: 970, y: 42, w: 240, h: 46 },
    get mode() {
      return G.save.data.mode === 'hard' ? 'hard' : 'normal';
    },
    enter() {
      this.t = 0;
      const W = 262,
        gap = 18,
        x0 = 640 - (W * 4 + gap * 3) / 2;
      this.daily = dailyMission();
      this.cards = [...G.MISSIONS, this.daily].map((m, i) => ({
        x: x0 + i * (W + gap),
        y: 146,
        w: W,
        h: 350,
        m,
        i,
      }));
    },
    update(dt) {
      this.t += dt;
      G.updateParticles(dt);
    },
    // 카드 상태: open(시작 가능) / locked(임무 잠김) / hardLocked(HARD 잠김)
    state(b) {
      if (b.m.daily) return dailyOpen() ? 'open' : 'locked';
      if (b.i >= G.save.data.unlocked) return 'locked';
      if (this.mode === 'hard' && !hardOpen(b.m)) return 'hardLocked';
      return 'open';
    },
    draw(c) {
      G.render.bg(c, this.t, 1);
      G.render.button(c, this.back, '처음으로');
      center(c, '임무 선택', 72, 34, '#eef7ff', { weight: 950 });
      center(
        c,
        this.mode === 'hard'
          ? 'HARD · 더 빽빽하고 빠른 탄막, 복구는 보스 직전 한 번'
          : '각 임무는 같은 패턴 시드로 공정하게 재현됩니다',
        111,
        15,
        this.mode === 'hard' ? '#ff9db6' : '#8291ad',
        { weight: 600 },
      );
      this.modeToggle(c);
      for (const b of this.cards) this.card(c, b);
      const y = 548;
      this.toggle(c, 190, y, '효과음', G.save.data.sfx, 'sfx');
      this.toggle(c, 470, y, '음악', G.save.data.music, 'music');
      this.toggle(c, 750, y, '진동', G.save.data.haptics, 'haptics');
      this.toggle(c, 1030, y, '효과 줄이기', G.save.data.reduced, 'reduced');
      center(
        c,
        '이동: WASD/방향키 · 집중: SHIFT · 대시: SPACE · 모드: H · 일시정지: ESC',
        656,
        14,
        '#8291ad',
        {
          weight: 600,
        },
      );
    },
    modeToggle(c) {
      const b = this.modeBtn,
        half = b.w / 2,
        hard = this.mode === 'hard';
      G.rr(c, b.x, b.y, b.w, b.h, b.h / 2);
      c.fillStyle = 'rgba(9,13,28,.94)';
      c.fill();
      c.strokeStyle = 'rgba(145,170,220,.28)';
      c.lineWidth = 1;
      c.stroke();
      G.rr(c, b.x + 4 + (hard ? half : 0), b.y + 4, half - 8, b.h - 8, (b.h - 8) / 2);
      c.fillStyle = hard ? HARD_COL : CYAN;
      c.fill();
      G.text(c, 'NORMAL', b.x + half / 2, b.y + b.h / 2, 15, hard ? '#8291ad' : '#041018', {
        align: 'center',
        weight: 900,
      });
      G.text(c, 'HARD', b.x + half * 1.5, b.y + b.h / 2, 15, hard ? '#1a0610' : '#8291ad', {
        align: 'center',
        weight: 900,
      });
    },
    card(c, b) {
      const st = this.state(b),
        m = b.m,
        mode = m.daily ? 'normal' : this.mode,
        x = b.x,
        y = b.y,
        w = b.w,
        L = x + 22;
      G.render.panel(c, x, y, w, b.h, 0.9);
      if (mode === 'hard' && st === 'open') {
        G.rr(c, x, y, w, b.h, 18);
        c.strokeStyle = 'rgba(255,92,138,.45)';
        c.lineWidth = 1.5;
        c.stroke();
      }
      c.save();
      c.globalAlpha = st === 'open' ? 1 : 0.35;
      c.fillStyle = m.color;
      c.fillRect(x + 14, y, w - 28, 4);
      c.restore();
      const play = { x: L, y: y + b.h - 64, w: w - 44, h: 44 };
      b.play = play;
      G.text(c, m.sub, L, y + 30, 13, st === 'open' ? m.color : '#8a95ad', { weight: 800, maxW: w - 80 });
      G.text(c, m.name, L, y + 66, 26, st === 'open' ? '#eef7ff' : '#c9d3e6', { weight: 950, maxW: w - 44 });
      if (st !== 'open') {
        // 잠긴 카드: 흐린 글씨 대신 자물쇠 + 또렷한 해제 조건
        const cx = x + w / 2,
          cy = y + 150,
          col = st === 'hardLocked' ? HARD_COL : '#9aa7bd';
        c.beginPath();
        c.arc(cx, cy, 34, 0, G.TAU);
        c.fillStyle = 'rgba(255,255,255,.04)';
        c.fill();
        c.strokeStyle = st === 'hardLocked' ? 'rgba(255,92,138,.5)' : 'rgba(154,167,189,.35)';
        c.lineWidth = 2;
        c.stroke();
        G.render.lock(c, cx, cy + 5, 28, col);
        const prev = G.MISSIONS[b.i - 1],
          cond = m.daily
            ? `「${G.MISSIONS[0].name}」을 생존하면 매일 새 신호가 열립니다`
            : st === 'hardLocked'
              ? `NORMAL로 생존하면 HARD가 열립니다`
              : `「${prev ? prev.name : ''}」을 생존하면 해제됩니다`;
        wrap(c, cond, w - 44, 14, 700)
          .slice(0, 3)
          .forEach((ln, i) =>
            G.text(c, ln, cx, y + 214 + i * 21, 14, '#b4bfd3', { align: 'center', weight: 700 }),
          );
        if (st === 'hardLocked') {
          const r = rec(m.id, 'normal');
          G.text(
            c,
            r.time ? `NORMAL 최고 생존 ${fmtT(r.time)} / ${fmtT(m.duration)}` : 'NORMAL 기록 없음',
            cx,
            y + 262,
            12,
            '#8291ad',
            {
              align: 'center',
              weight: 700,
            },
          );
        }
        G.rr(c, play.x, play.y, play.w, play.h, 14);
        c.fillStyle = 'rgba(19,27,52,.6)';
        c.fill();
        c.strokeStyle = 'rgba(145,170,220,.18)';
        c.lineWidth = 1;
        c.stroke();
        G.render.lock(c, play.x + play.w / 2 - 30, play.y + play.h / 2 + 3, 14, '#8291ad');
        G.text(c, '잠김', play.x + play.w / 2 + 8, play.y + play.h / 2, 16, '#8291ad', {
          align: 'center',
          weight: 900,
        });
        return;
      }
      // 미리보기: 임무를 대표하는 탄환 모양
      G.render.bulletIcon(
        c,
        x + w - 34,
        y + 34,
        m.daily ? 'petal' : SIG_KIND[m.id] || 'fan',
        9,
        this.t * 0.6,
      );
      if (mode === 'hard') chip(c, x + w - 54, y + 30, 'HARD', HARD_COL, '#1a0610', 10, 'right');
      wrap(c, m.desc, w - 44, 14, 600)
        .slice(0, 2)
        .forEach((ln, i) => G.text(c, ln, L, y + 100 + i * 20, 14, '#9aa7bd', { weight: 600 }));
      const bars = '◆'.repeat(m.difficulty) + '◇'.repeat(3 - m.difficulty);
      G.text(c, bars, L, y + 158, 16, m.color, { weight: 800 });
      G.text(
        c,
        `${Math.floor(m.duration / 60)}분${m.duration % 60 ? ' ' + (m.duration % 60) + '초' : ''}`,
        L + 70,
        y + 158,
        15,
        '#eef7ff',
        {
          weight: 700,
        },
      );
      c.fillStyle = 'rgba(135,160,220,.16)';
      c.fillRect(L, y + 180, w - 44, 1);
      if (m.daily) {
        if (this.mode === 'hard') chip(c, x + w - 54, y + 30, 'NORMAL 고정', CYAN, '#041018', 10, 'right');
        const D = dailyData(),
          sk = dailyStreak(D);
        G.text(
          c,
          D.best ? `오늘 BEST  ${num(D.best)}` : '오늘 기록 없음',
          L,
          y + 204,
          14,
          D.best ? GOLD : '#65708a',
          {
            weight: 800,
          },
        );
        if (D.best) chip(c, x + w - 22, y + 204, D.grade, gradeColor(D.grade), '#0a0d18', 12, 'right');
        G.text(
          c,
          sk ? `연속 ${sk}일째 수신 중` : '오늘 첫 수신으로 연속 기록 시작',
          L,
          y + 234,
          13,
          sk ? CYAN : '#8291ad',
          {
            weight: 800,
          },
        );
        // 최근 7일 연속 표시(채운 칸 = 연속 일수)
        for (let i = 0; i < 7; i++) {
          c.fillStyle = i < Math.min(7, sk) ? CYAN : 'rgba(255,255,255,.08)';
          c.fillRect(L + i * 26, y + 254, 20, 6);
        }
        G.render.button(c, play, '신호 수신', true);
        return;
      }
      const r = rec(m.id, mode);
      if (r.score) {
        G.text(c, `BEST  ${num(r.score)}`, L, y + 204, 15, GOLD, { weight: 900 });
        chip(c, x + w - 22, y + 204, r.grade, gradeColor(r.grade, m), '#0a0d18', 12, 'right');
        G.text(c, r.clear ? '생존 완료' : `최고 생존 ${fmtT(r.time)}`, L, y + 228, 12, '#8291ad', {
          weight: 700,
        });
      } else G.text(c, '기록 없음', L, y + 204, 14, '#65708a', { weight: 800 });
      MEDALS.forEach(([id], i) => medalIcon(c, L + 13 + i * 34, y + 258, id, !!r.medals[id], 12));
      G.render.button(c, play, mode === 'hard' ? 'HARD 시작' : '임무 시작', true);
    },
    toggle(c, x, y, label, on, key) {
      const b = { x: x - 95, y, w: 190, h: 48, key };
      G.render.button(c, b, `${label}  ${on ? 'ON' : 'OFF'}`, on);
      this[key + 'Btn'] = b;
    },
    setMode(mode) {
      G.save.data.mode = mode;
      G.save.persist();
      G.audio.sfx('click');
    },
    launch(b) {
      const st = this.state(b);
      if (st !== 'open') {
        G.audio.sfx('hit');
        G.toast(st === 'hardLocked' ? 'NORMAL로 생존하면 HARD가 열립니다' : '아직 잠긴 신호입니다', 2);
        return;
      }
      G.audio.sfx('click');
      if (b.m.daily) G.go('play', { mission: dailyMission(), mode: 'normal' });
      else G.go('play', { mission: b.m, mode: this.mode });
    },
    down(x, y) {
      if (G.render.hit(this.back, x, y)) {
        G.audio.sfx('click');
        G.go('title');
        return;
      }
      if (G.render.hit(this.modeBtn, x, y)) {
        this.setMode(x < this.modeBtn.x + this.modeBtn.w / 2 ? 'normal' : 'hard');
        return;
      }
      for (const b of this.cards)
        if (b.play && G.render.hit(b.play, x, y)) {
          this.launch(b);
          return;
        }
      for (const k of ['sfx', 'music', 'haptics', 'reduced'])
        if (G.render.hit(this[k + 'Btn'], x, y)) {
          G.save.data[k] = !G.save.data[k];
          G.save.persist();
          G.audio.setMuted();
          G.audio.sfx('click');
          return;
        }
    },
    key(code, on) {
      if (!on) return;
      if (code === 'Escape') G.go('title');
      if (code === 'KeyH') this.setMode(this.mode === 'hard' ? 'normal' : 'hard');
      if (/^Digit[1-4]$/.test(code)) {
        const b = this.cards[+code.slice(-1) - 1];
        if (b) this.launch(b);
      }
    },
  };
  G.scenes.select = select;
  const play = {
    engine: null,
    mission: null,
    mode: 'normal',
    banners: [],
    pops: [],
    tut: null,
    keys: new Set(),
    countdown: 2.4,
    paused: false,
    ended: false,
    // [controls] 터치 조작: 포인터별 역할(Map) · 떠다니는 조이스틱 · 여백(gutter) 버튼 · 대시 입력 버퍼
    joy: null,
    joyBase: null,
    ptrs: new Map(),
    dashBuf: 0,
    resume: 0,
    sig: '',
    ui: null,
    pauseBtn: { x: 1213, y: 22, w: 46, h: 46 },
    pauseBtns: [
      { x: 490, y: 272, w: 300, h: 76, act: 'resume', label: '계속' },
      { x: 490, y: 362, w: 300, h: 76, act: 'restart', label: '처음부터' },
      { x: 490, y: 452, w: 300, h: 76, act: 'select', label: '임무 선택' },
    ],
    // 모든 좌표는 장면 좌표(0..1280). 화면 오른쪽 끝 = 1280 + G.AX. SAFE(노치·홈 바) 안쪽에 배치
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
        room = R - 1206, // 경기장 오른쪽 벽 ~ 화면 오른쪽(안전 영역) 사이
        gutter = room >= rD * 2 + 8;
      const ui = { gutter, min, joyR: 70 };
      if (gutter) {
        const cx = R - Math.max(m + rD, room / 2);
        ui.dash = { cx, cy: B - m - rD - 10, r: rD };
        ui.focus = { cx, cy: ui.dash.cy - rD - rF - 24, r: rF };
        const w = G.clamp(40 / sc, 52, Math.min(80, room - 12));
        ui.pause = { x: cx - w / 2, y: T + 14, w, h: w };
      } else {
        ui.dash = { cx: R - m - rD, cy: B - m - rD, r: rD };
        ui.focus = { cx: ui.dash.cx - rD - rF - 20, cy: B - m - rF, r: rF };
        const w = G.clamp(40 / sc, 46, Math.max(46, R - 1216));
        ui.pause = { x: R - 10 - w, y: T + 14, w, h: w };
      }
      // 조이스틱은 화면 왼쪽 55% 에서만 시작
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
      this.dashBuf = 0.12; // 쿨다운 중 눌러도 120ms 안에 충전되면 나감
    },
    setPaused(on) {
      if (on === this.paused) return;
      this.paused = on;
      if (on) {
        this.ptrs.clear();
        this.joy = null;
        G.audio.stop();
      } else {
        this.resume = this.countdown > 0 ? 0 : 1.2; // 손가락을 다시 올릴 시간
        G.audio.start();
      }
    },
    resized() {
      const sig = `${G.VW}|${G.rotated}`;
      if (sig === this.sig) return;
      this.sig = sig;
      if (!this.ended && this.countdown <= 0) this.setPaused(true);
    },
    enter({ mission, mode = 'normal' }) {
      this.mission = mission;
      this.mode = mission.daily ? 'normal' : mode === 'hard' ? 'hard' : 'normal';
      this.engine = new G.Engine(mission, { mode: this.mode });
      this.keys.clear();
      this.countdown = 2.4;
      this.paused = false;
      this.ended = false;
      this.joy = null;
      this.ptrs.clear();
      this.dashBuf = 0;
      this.resume = 0;
      this.banners = [];
      this.pops = [];
      this.left = false;
      this.sig = `${G.VW}|${G.rotated}`;
      // 첫 실행 안내: 잔향 구역 NORMAL 첫 판에서 한 번만 (스치기 → 집중 → 대시)
      this.tut =
        !G.save.data.tutorial && mission.id === 'echo' && this.mode === 'normal' && !mission.daily
          ? { step: 0, n: 0, focusT: 0, t: 0, skip: null }
          : null;
      G.particles.length = 0;
      G.save.data.totalRuns++;
      G.save.persist();
      G.audio.start(mission.id);
    },
    restart() {
      G.go('play', { mission: this.mission, mode: this.mode });
    },
    update(dt) {
      if (this.paused || this.ended) return;
      G.updateParticles(dt);
      for (const list of [this.banners, this.pops])
        for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
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
        focus =
          k.has('ShiftLeft') || k.has('ShiftRight') || [...this.ptrs.values()].some((r) => r === 'focus'),
        stick = jx !== 0 || jy !== 0;
      this.engine.setInput(stick ? jx : x, stick ? jy : y, focus);
      if (this.dashBuf > 0) {
        this.engine.dash();
        this.dashBuf -= dt;
      }
      this.engine.update(dt);
      for (const ev of this.engine.consume()) this.onEvent(ev);
      this.tutorial(dt, focus);
      if ((this.engine.dead || this.engine.done) && !this.ended) {
        this.ended = true;
        const e = this.engine;
        setTimeout(
          () => {
            if (this.engine === e && !this.left) this.finish();
          },
          e.done ? 1100 : 800,
        );
      }
    },
    // ---- onboarding ----
    TUT: [
      { goal: 3, text: '탄환 바로 옆을 스쳐 지나가 보세요', sub: '스치기(GRAZE) = 점수와 FLOW' },
      {
        goal: 1.2,
        text: () => (G.isTouch() ? 'FOCUS를 누른 채 움직여 보세요' : 'SHIFT를 누른 채 움직여 보세요'),
        sub: '느리고 정밀한 이동',
      },
      {
        goal: 1,
        text: () => (G.isTouch() ? 'DASH로 탄환을 뚫고 지나가세요' : 'SPACE로 탄환을 뚫고 지나가세요'),
        sub: '대시 중엔 무적 · 2회 충전',
      },
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
        G.audio.sfx('ready');
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
        w = 600,
        h = 48,
        x = 640 - w / 2,
        y = Math.min(664, 720 - G.SAFE.b - h - 6),
        a = Math.min(1, T.t * 4);
      c.save();
      c.globalAlpha = 0.92 * a;
      G.rr(c, x, y, w, h, h / 2);
      c.fillStyle = 'rgba(7,11,24,.88)';
      c.fill();
      c.strokeStyle = 'rgba(77,238,234,.55)';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
      if (T.step < 3) {
        G.text(c, `${T.step + 1}/3`, x + 26, y + h / 2, 13, CYAN, { weight: 900, alpha: a });
        G.text(c, text, x + 62, y + h / 2 - 7, 17, '#eef7ff', { weight: 800, alpha: a, maxW: 400 });
        const prog = T.step === 1 ? `${s.sub}` : `${s.sub}  ·  ${Math.min(s.goal, T.n | 0)}/${s.goal}`;
        G.text(c, T.step === 2 ? s.sub : prog, x + 62, y + h / 2 + 12, 11, '#8291ad', {
          weight: 700,
          alpha: a,
        });
        if (T.step === 1) {
          c.fillStyle = 'rgba(255,255,255,.1)';
          c.fillRect(x + 250, y + h / 2 + 9, 150, 5);
          c.fillStyle = '#a66cff';
          c.fillRect(x + 250, y + h / 2 + 9, 150 * G.clamp(T.n / s.goal, 0, 1), 5);
        }
        T.skip = { x: x + w - 110, y: y + 6, w: 100, h: h - 12 };
        G.rr(c, T.skip.x, T.skip.y, T.skip.w, T.skip.h, T.skip.h / 2);
        c.fillStyle = 'rgba(19,27,52,.95)';
        c.fill();
        G.text(c, '건너뛰기', T.skip.x + T.skip.w / 2, y + h / 2, 13, '#c9d3e6', {
          align: 'center',
          weight: 800,
          alpha: a,
        });
        // 터치: 해당 버튼 주위에 천천히 숨쉬는 고리(깜빡임 없음)
        const ui = this.ui,
          btn = ui && (T.step === 1 ? ui.focus : T.step === 2 ? ui.dash : null);
        if (btn && G.isTouch()) {
          const k = 0.5 + 0.5 * Math.sin(T.t * 3.2);
          c.save();
          c.globalAlpha = 0.25 + 0.35 * k;
          c.strokeStyle = T.step === 1 ? '#a66cff' : CYAN;
          c.lineWidth = 3;
          c.beginPath();
          c.arc(btn.cx, btn.cy, btn.r + 10 + 6 * k, 0, G.TAU);
          c.stroke();
          c.restore();
        }
      } else {
        T.skip = null;
        G.text(c, text, 640, y + h / 2, 18, CYAN, { align: 'center', weight: 900, alpha: a });
      }
    },
    banner(text, sub, color = '#eef7ff', life = 1.6) {
      this.banners = [{ text, sub, color, t: 0, life }];
    },
    pop(text, color = GOLD) {
      this.pops.push({ text, color, t: 0, life: 1.8 });
      if (this.pops.length > 4) this.pops.shift();
    },
    onEvent(ev) {
      this.tutEvent(ev);
      // 피격·대시·오버드라이브 이펙트는 render 가 엔진 상태로 직접 그림 → G.render.fx 호출 안 함
      if (ev.type === 'graze') {
        G.audio.sfx('graze', { combo: ev.combo });
        if (ev.combo === 10 || ev.combo === 25 || ev.combo === 50 || ev.combo === 100)
          G.audio.sfx('flow', { combo: ev.combo });
        G.burst(ev.x, ev.y, CYAN, 2, 70);
      } else if (ev.type === 'phase') {
        G.audio.sfx('dashThrough');
        G.burst(ev.x, ev.y, ev.color, 5, 150);
      } else if (ev.type === 'dash') {
        this.dashBuf = 0;
        G.audio.sfx('dash');
        G.vibrate(12);
      } else if (ev.type === 'hit') {
        G.audio.sfx('hit');
        G.vibrate([45, 30, 45]);
        G.burst(ev.x, ev.y, '#ff3b6b', 16, 260);
      } else if (ev.type === 'overdrive') {
        G.audio.sfx('overdrive');
        G.vibrate([20, 20, 35]);
      } else if (ev.type === 'section') {
        G.audio.sfx('section');
        const i = this.engine.sectionIndex;
        if (i < 4) this.banner(ev.name, `SECTION ${i + 1}`, '#eef7ff');
      } else if (ev.type === 'repair') {
        G.audio.sfx('shield');
        this.pop('보호막 복구', CYAN);
      } else if (ev.type === 'bossPhase') {
        G.audio.bossPhase();
        this.banner(ev.name, this.engine.boss.final ? 'FINAL SIGNAL' : `SPELL ${ev.phase + 1}`, '#ff8eaa', 2);
      } else if (ev.type === 'bossBreak') {
        G.audio.sfx('flow', { mult: 5 });
        G.vibrate([30, 30, 60]);
        this.banner('코어 격파', 'CORE BREAK', GOLD, 2.2);
      } else if (ev.type === 'bonus') this.pop(`${ev.label}  +${num(ev.value)}`);
      else if (ev.type === 'dashReady') G.audio.sfx('ready');
      else if (ev.type === 'complete') G.audio.sfx('complete');
      else if (ev.type === 'dead') G.audio.sfx('dead');
    },
    finish() {
      const s = this.engine.stats(),
        m = this.mission,
        mode = this.mode,
        d = G.save.data,
        out = { mission: m, mode, stats: s, grade: s.grade, news: {}, newMedals: [], unlocks: [] };
      if (this.tut || !d.tutorial) this.endTutorial();
      if (m.daily) {
        if (this.mode === 'hard') chip(c, x + w - 54, y + 30, 'NORMAL 고정', CYAN, '#041018', 10, 'right');
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
      G.audio.stop();
      G.go('result', out);
    },
    draw(c) {
      G.render.world(c, this.engine);
      this.drawBanners(c);
      if (this.countdown > 0) {
        const n = Math.ceil(this.countdown);
        c.fillStyle = 'rgba(3,5,12,.3)';
        c.fillRect(-G.AX, 0, G.VW, G.H); // 좌우 여백까지 덮음
        if (this.mode === 'hard') center(c, 'HARD MODE', 290, 18, HARD_COL, { weight: 900, stroke: 5 });
        else if (this.mission.daily)
          center(c, `오늘의 신호 · ${this.mission.baseName}`, 290, 18, GOLD, { weight: 900, stroke: 5 });
        center(c, n > 0 ? String(n) : 'GO', 360, 90, n === 1 ? CYAN : '#eef7ff', {
          weight: 950,
          stroke: 8,
        });
        center(
          c,
          this.tut
            ? '처음이라면 아래 안내를 따라 해보세요'
            : G.isTouch()
              ? '왼쪽: 이동  ·  오른쪽: 대시 / 집중(누르고 있기)'
              : '탄환에 스치면 FLOW가 오릅니다',
          430,
          17,
          '#eef7ff',
          { weight: 700, stroke: 4 },
        );
      } else if (this.resume > 0 && !this.paused) {
        c.fillStyle = 'rgba(3,5,12,.25)';
        c.fillRect(-G.AX, 0, G.VW, G.H);
        center(c, String(Math.ceil(this.resume / 0.4)), 360, 72, CYAN, { weight: 950, stroke: 8 });
      }
      const ui = this.layout();
      G.render.button(c, ui.pause, 'Ⅱ');
      this.touchUi(c, ui);
      if (!this.paused && this.countdown <= 0) this.drawTutorial(c);
      if (this.paused) this.pauseOverlay(c);
    },
    // 구간·스펠 이름(가운데, 잠깐) + 보너스 알림(점수 아래 오른쪽). 화면 번쩍임 없음
    drawBanners(c) {
      for (const b of this.banners) {
        const k = b.t / b.life,
          a = Math.min(1, b.t * 5, (1 - k) * 3),
          dy = (1 - G.easeOut(Math.min(1, b.t * 3))) * 10;
        G.text(c, b.sub, 640, 300 + dy, 13, '#8291ad', { align: 'center', weight: 900, alpha: a, stroke: 4 });
        G.text(c, b.text, 640, 330 + dy, 30, b.color, { align: 'center', weight: 950, alpha: a, stroke: 6 });
      }
      this.pops.forEach((p, i) => {
        const a = Math.min(1, p.t * 6, (p.life - p.t) * 2.5);
        G.text(c, p.text, 1202, 90 + i * 24 - Math.min(6, p.t * 10), 15, p.color, {
          align: 'right',
          weight: 900,
          alpha: a,
          stroke: 4,
        });
      });
    },
    touchUi(c, ui) {
      const p = this.engine.player,
        roles = [...this.ptrs.values()],
        JR = ui.joyR;
      c.save();
      // 조이스틱: 누르는 동안 진하게, 떼면 마지막 위치에 흐린 받침만
      const base = this.joy || this.joyBase || (G.isTouch() ? { ox: 230, oy: 560 } : null);
      if (base) {
        c.globalAlpha = this.joy ? 0.5 : 0.18;
        c.strokeStyle = '#eef7ff';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(base.ox, base.oy, JR, 0, G.TAU);
        c.stroke();
        c.fillStyle = '#4deeea';
        c.beginPath();
        c.arc(base.ox + (this.joy?.kx || 0), base.oy + (this.joy?.ky || 0), 22, 0, G.TAU);
        c.fill();
      }
      // DASH: 충전 게이지(재충전 진행) + 남은 횟수 점 2개, 누르면 살짝 작아짐
      const d = ui.dash,
        held = roles.includes('dash'),
        ready = p.dashes > 0;
      c.globalAlpha = ready ? 0.62 : 0.34;
      c.translate(d.cx, d.cy);
      if (held) c.scale(0.92, 0.92);
      c.fillStyle = 'rgba(77,238,234,.10)';
      c.beginPath();
      c.arc(0, 0, d.r, 0, G.TAU);
      c.fill();
      c.strokeStyle = 'rgba(77,238,234,.35)';
      c.lineWidth = 3;
      c.stroke();
      if (p.dashes < 2) {
        c.strokeStyle = '#4deeea';
        c.lineWidth = 5;
        c.beginPath();
        c.arc(0, 0, d.r - 3, -Math.PI / 2, -Math.PI / 2 + G.TAU * G.clamp(p.dashRegen / 2.8, 0, 1));
        c.stroke();
      } else {
        c.strokeStyle = '#4deeea';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(0, 0, d.r, 0, G.TAU);
        c.stroke();
      }
      G.text(c, 'DASH', 0, -4, Math.round(d.r * 0.27), '#4deeea', { align: 'center', weight: 900 });
      for (let i = 0; i < 2; i++) {
        c.fillStyle = i < p.dashes ? '#4deeea' : 'rgba(77,238,234,.2)';
        c.beginPath();
        c.arc((i - 0.5) * 16, d.r * 0.32, 4.5, 0, G.TAU);
        c.fill();
      }
      c.restore();
      c.save();
      // FOCUS: 누르고 있는 동안 빛남
      const f = ui.focus,
        on = roles.includes('focus') || this.engine.input.focus;
      c.globalAlpha = on ? 0.85 : 0.5;
      if (on) {
        c.shadowColor = '#a66cff';
        c.shadowBlur = 18;
        c.fillStyle = 'rgba(166,108,255,.22)';
        c.beginPath();
        c.arc(f.cx, f.cy, f.r, 0, G.TAU);
        c.fill();
      }
      c.strokeStyle = '#a66cff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(f.cx, f.cy, f.r, 0, G.TAU);
      c.stroke();
      c.shadowBlur = 0;
      G.text(c, 'FOCUS', f.cx, f.cy, Math.round(f.r * 0.3), '#a66cff', { align: 'center', weight: 900 });
      c.restore();
    },
    pauseOverlay(c) {
      c.fillStyle = 'rgba(2,4,10,.82)';
      c.fillRect(-G.AX, 0, G.VW, G.H);
      G.render.panel(c, 430, 140, 420, 440, 0.97);
      center(c, '일시정지', 190, 34, '#eef7ff', { weight: 950 });
      center(c, '신호가 동결되었습니다', 232, 15, '#8291ad', { weight: 600 });
      this.pauseBtns.forEach((b, i) => G.render.button(c, b, b.label, i === 0));
    },
    down(x, y, id, type) {
      G.audio.init();
      const ui = this.ui || this.layout();
      if (this.paused) {
        // x·y 모두 검사 (예전엔 y 띠만 보고 '처음부터'가 눌림). 버튼 사이 간격 14 → 7씩 확장
        const b = this.pauseBtns.find((b) =>
          G.render.hit({ x: b.x - 7, y: b.y - 7, w: b.w + 14, h: b.h + 14 }, x, y),
        );
        if (!b) return;
        G.audio.sfx('click');
        if (b.act === 'resume') this.setPaused(false);
        else if (b.act === 'restart') this.restart();
        else {
          this.left = true;
          G.audio.stop();
          G.go('select');
        }
        return;
      }
      const sk = this.tut && this.tut.skip;
      if (sk && G.render.hit(this.pad(sk, ui.min), x, y)) {
        G.audio.sfx('click');
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
      // 버튼 사이 미끄러뜨리기: FOCUS 를 누른 채 DASH 로 밀면 대시, 반대로 오면 집중
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
        // 손가락이 반경 밖으로 나가면 받침이 따라옴 → 조이스틱이 '끝나지' 않음
        j.ox += dx * (1 - R / l);
        j.oy += dy * (1 - R / l);
        dx = x - j.ox;
        dy = y - j.oy;
        l = R;
      }
      const t = l / R,
        s = t < 0.12 ? 0 : (t - 0.12) / 0.88; // 원형 데드존 후 재스케일
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
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ShiftLeft',
          'ShiftRight',
        ].includes(code)
      ) {
        on ? this.keys.add(code) : this.keys.delete(code);
      }
      if (on && code === 'Space') this.triggerDash();
      if (on && !this.ended && (code === 'Escape' || code === 'KeyP')) this.setPaused(!this.paused);
      if (on && code === 'KeyR') this.restart();
    },
    blur() {
      this.keys.clear();
      this.joy = null;
      this.ptrs.clear();
      if (!this.ended) this.setPaused(true);
    },
  };
  G.scenes.play = play;

  // ---- share card (NEON JUMP 방식: 미리 그려 둔 PNG → navigator.share, 안 되면 다운로드) ----
  const SECTION_NAMES = ['접속', '나선 간섭', '차단벽', '적색 폭우', '코어 개방'];
  function drawCard(c, r) {
    const S = 1080,
      s = r.stats,
      m = r.mission,
      g = r.grade,
      gc = gradeColor(g, m);
    c.fillStyle = '#050711';
    c.fillRect(0, 0, S, S);
    const bgG = c.createRadialGradient(540, 430, 40, 540, 540, 820);
    bgG.addColorStop(0, '#16203f');
    bgG.addColorStop(0.55, '#080c1c');
    bgG.addColorStop(1, '#03050b');
    c.fillStyle = bgG;
    c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(77,238,234,.06)';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= S; x += 60) {
      c.moveTo(x, 0);
      c.lineTo(x, S);
    }
    for (let y = 0; y <= S; y += 60) {
      c.moveTo(0, y);
      c.lineTo(S, y);
    }
    c.stroke();
    c.fillStyle = m.color;
    c.fillRect(0, 0, S, 10);
    G.text(c, 'ZERO', 540 - 12, 112, 70, '#eef7ff', { align: 'right', weight: 950 });
    G.text(c, 'SIGNAL', 540 + 12, 112, 70, CYAN, { align: 'left', weight: 950 });
    const mode = m.daily
      ? `오늘의 신호 · ${+m.daily.slice(4, 6)}/${+m.daily.slice(6)}`
      : `${m.name} · ${r.mode === 'hard' ? 'HARD' : 'NORMAL'}`;
    G.text(c, mode, 540, 196, 40, m.daily ? GOLD : r.mode === 'hard' ? HARD_COL : '#eef7ff', {
      align: 'center',
      weight: 900,
    });
    G.text(c, s.clear ? 'PROTOCOL SURVIVED' : 'SIGNAL LOST', 540, 248, 24, s.clear ? CYAN : '#ff5c8a', {
      align: 'center',
      weight: 900,
    });
    // grade
    c.save();
    c.strokeStyle = gc;
    c.globalAlpha = 0.5;
    c.lineWidth = 6;
    c.beginPath();
    c.arc(540, 440, 150, 0, G.TAU);
    c.stroke();
    c.globalAlpha = 0.18;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(540, 440, 178, 0, G.TAU);
    c.stroke();
    c.restore();
    G.text(c, g, 540, 448, g.length > 1 ? 190 : 230, gc, { align: 'center', weight: 950, stroke: 14 });
    // stats
    const items = [
      ['SCORE', num(s.score)],
      ['TIME', fmtT(s.time)],
      ['GRAZE', String(s.grazes)],
      ['MAX FLOW', String(s.maxCombo)],
    ];
    items.forEach(([l, v], i) => {
      const x = 155 + i * 257;
      G.text(c, l, x, 660, 22, '#8291ad', { align: 'center', weight: 800 });
      G.text(c, v, x, 712, 50, '#eef7ff', { align: 'center', weight: 950 });
    });
    progressBar(c, 120, 800, 840, {
      duration: m.duration,
      sections: s.sectionTimes,
      names: SECTION_NAMES,
      time: s.time,
      dead: !s.clear,
      best: 0,
      color: m.color,
      h: 18,
      labelSize: 20,
    });
    const med = G.runMedals(s);
    MEDALS.forEach(([id], i) => medalIcon(c, 540 + (i - 2) * 76, 912, id, med.includes(id), 26));
    if (m.daily && r.streak)
      G.text(c, `연속 ${r.streak}일째 수신 중`, 540, 966, 24, CYAN, { align: 'center', weight: 800 });
    G.text(c, '#ZEROSIGNAL  ·  스치고 · 집중하고 · 돌파하라', 540, 1030, 22, '#52627d', {
      align: 'center',
      weight: 700,
    });
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
    const m = r.mission,
      name = `zero-signal-${m.daily ? 'daily-' + m.daily : m.id + '-' + r.mode}.png`,
      text = `ZERO SIGNAL 「${m.daily ? '오늘의 신호' : m.name}」${m.daily ? '' : ' ' + r.mode.toUpperCase()} · ${r.grade} · ${num(r.stats.score)}점${
        m.daily && r.streak ? ` · 연속 ${r.streak}일` : ''
      }`;
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
        G.toast('기록 카드를 저장했어요');
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

  const result = {
    again: { x: 330, y: 566, w: 240, h: 62 },
    select: { x: 590, y: 566, w: 190, h: 62 },
    share: { x: 800, y: 566, w: 150, h: 62 },
    enter(p) {
      Object.assign(this, { streak: 0, first: false }, p);
      this.t = 0;
      G.particles.length = 0;
      prepareCard(this);
    },
    update(dt) {
      this.t += dt;
      G.updateParticles(dt);
    },
    retry() {
      G.audio.sfx('click');
      G.go('play', { mission: this.mission.daily ? dailyMission() : this.mission, mode: this.mode });
    },
    draw(c) {
      const s = this.stats,
        m = this.mission,
        g = this.grade,
        gc = gradeColor(g, m),
        t = this.t;
      G.render.bg(c, t, 4, m);
      const tag = m.daily
        ? `오늘의 신호 · ${m.baseName}`
        : `${m.name}  ·  ${this.mode === 'hard' ? 'HARD' : 'NORMAL'}`;
      center(c, s.clear ? 'PROTOCOL SURVIVED' : 'SIGNAL LOST', 58, 17, s.clear ? CYAN : '#ff5c8a', {
        weight: 900,
      });
      center(c, s.clear ? '임무 생존 완료' : '코어와의 접속이 끊겼습니다', 96, 28, '#eef7ff', {
        weight: 950,
      });
      // grade: 금색 고리 한 번(SS 는 두 번) + 글자 등장. 무작위 폭죽 없음
      const GX = 330,
        GY = 246;
      if (g !== 'D') {
        G.render.gradeRing(c, GX, GY, (t - 0.12) / 1.1, g === 'S' || g === 'SS' ? GOLD : gc);
        if (g === 'SS') G.render.gradeRing(c, GX, GY, (t - 0.45) / 1.1, GOLD);
      }
      const k = G.easeOut(G.clamp(t / 0.35, 0, 1));
      c.save();
      c.translate(GX, GY);
      c.scale(1.25 - 0.25 * k, 1.25 - 0.25 * k);
      G.text(c, g, 0, 0, g.length > 1 ? 112 : 132, gc, {
        align: 'center',
        weight: 950,
        stroke: 10,
        alpha: k,
      });
      c.restore();
      c.fillStyle = m.color;
      c.globalAlpha = 0.85 * k;
      c.fillRect(GX - 60, GY + 76, 120, 4);
      c.globalAlpha = 1;
      G.text(c, tag, GX, GY + 100, 14, m.daily ? GOLD : this.mode === 'hard' ? HARD_COL : '#c9d3e6', {
        align: 'center',
        weight: 800,
        maxW: 300,
      });
      if (m.daily && this.streak)
        G.text(c, `연속 ${this.streak}일째 수신`, GX, GY + 122, 13, CYAN, { align: 'center', weight: 800 });
      // stats 2x2 with NEW chips and previous best
      const p = this.prev || {},
        tiles = [
          ['SCORE', num(s.score), 'score', p.score ? `BEST ${num(p.score)}` : ''],
          ['TIME', `${fmtT(s.time)} / ${fmtT(m.duration)}`, 'time', p.time ? `BEST ${fmtT(p.time)}` : ''],
          ['GRAZE', String(s.grazes), 'graze', p.graze ? `BEST ${p.graze}` : ''],
          ['MAX FLOW', String(s.maxCombo), 'flow', p.flow ? `BEST ${p.flow}` : ''],
        ];
      tiles.forEach(([label, val, key, best], i) => {
        const x = 520 + (i % 2) * 290,
          y = 150 + Math.floor(i / 2) * 104,
          w = 270,
          h = 92,
          kk = G.easeOut(G.clamp((t - 0.15 - i * 0.07) / 0.3, 0, 1));
        c.save();
        c.globalAlpha = kk;
        G.render.panel(c, x, y, w, h, 0.9);
        c.restore();
        G.text(c, label, x + 18, y + 22, 12, '#8291ad', { weight: 800, alpha: kk });
        G.text(c, val, x + 18, y + 54, 28, '#eef7ff', { weight: 950, alpha: kk, maxW: w - 36 });
        if (best) G.text(c, best, x + 18, y + 79, 11, '#65708a', { weight: 700, alpha: kk });
        if (this.news && this.news[key] && kk > 0.5)
          chip(c, x + w - 14, y + 22, 'NEW', GOLD, '#241a00', 11, 'right');
      });
      if (this.first) G.text(c, '첫 기록', 1080, 132, 12, GOLD, { align: 'right', weight: 900 });
      // 5구간 진행 막대: 탈락 지점(빨간 X) + 이전 최고(금색)
      const bx = 200,
        bw = 880,
        by = 440;
      const best = p.time || 0,
        diff = s.time - best;
      G.text(
        c,
        s.clear
          ? '전 구간 생존'
          : `생존 ${fmtT(s.time)}  ·  ${SECTION_NAMES[Math.max(0, s.deathSection)]}에서 끊김`,
        bx,
        by - 30,
        14,
        s.clear ? CYAN : '#ff8eaa',
        {
          weight: 800,
        },
      );
      const cap =
        s.clear || !best
          ? ''
          : diff > 0.5
            ? `최고 기록보다 +${Math.round(diff)}초`
            : diff < -0.5
              ? `베스트까지 ${Math.round(-diff)}초`
              : '최고 기록과 같은 지점';
      if (cap)
        G.text(c, cap, bx + bw, by - 30, 14, diff > 0.5 ? GOLD : '#c9d3e6', { align: 'right', weight: 800 });
      progressBar(c, bx, by, bw, {
        duration: m.duration,
        sections: s.sectionTimes,
        names: SECTION_NAMES,
        time: s.time * G.clamp((t - 0.2) / 0.7, 0, 1),
        dead: !s.clear && t > 0.9,
        best,
        color: m.color,
      });
      center(c, `다음 목표 · ${G.nextGoal(s, m, this.mode)}`, 504, 18, GOLD, { weight: 900 });
      const extra = [
        ...(this.unlocks || []),
        ...(this.newMedals || []).map((id) => `메달: ${medalName(id)}`),
      ];
      if (extra.length) center(c, extra.join('   ·   '), 536, 15, CYAN, { weight: 800, maxW: 1000 });
      G.render.button(c, this.again, '다시 동기화', true, 'ENTER · R');
      G.render.button(c, this.select, '임무 선택', false, 'ESC');
      G.render.button(c, this.share, '기록 공유');
      if (t > 0.8) center(c, '빈 곳을 탭해도 바로 다시 시작', 654, 12, '#52627d', { weight: 700 });
    },
    down(x, y) {
      G.audio.init();
      if (G.render.hit(this.again, x, y)) this.retry();
      else if (G.render.hit(this.select, x, y)) {
        G.audio.sfx('click');
        G.go('select');
      } else if (G.render.hit(this.share, x, y)) {
        G.audio.sfx('click');
        shareCard(this);
      } else if (this.t > 0.8) this.retry(); // 빠른 재도전 (실수 입력 방지 0.8초)
    },
    key(code, on) {
      if (!on || this.t < 0.4) return;
      if (code === 'Enter' || code === 'Space' || code === 'KeyR') this.retry();
      if (code === 'Escape') G.go('select');
    },
  };
  G.scenes.result = result;
  G.screensDebug = { dailyMission, dailyData, rec, drawCard };
})();
