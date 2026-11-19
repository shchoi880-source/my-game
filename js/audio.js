'use strict';
// 사운드 (docs/SPEC.md §5): 효과음(샘플+합성 대체) + WebAudio 절차적 음악(룩어헤드 스케줄러)
// AudioContext/fetch/document 가 없는 환경(Node)에서는 모든 메서드가 안전한 무동작.
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const G = root.G = root.G || {};
  const AC = root.AudioContext || root.webkitAudioContext || null;
  const hasDoc = typeof document !== 'undefined' && !!document.addEventListener;
  const perfNow = () => (root.performance && root.performance.now ? root.performance.now() : Date.now()) / 1000;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const flag = k => { try { const d = G.save && G.save.data; return !d || d[k] !== false; } catch (e) { return true; } };
  const mulberry = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const MUSIC_VOL = 0.5, SFX_VOL = 0.8, DUCK_MUL = 0.35, DUCK_CUT = 650;
  const LEAD = 0.01;                 // 박 0 = 지금 + 10ms
  const LOOKAHEAD = 0.12, LOOKAHEAD_HIDDEN = 1.2, TICK_MS = 25;
  const SAMPLE_NAMES = ['click', 'back', 'coin', 'explode', 'hit', 'gold'];

  let ctx = null, comp = null, musicGain = null, duckLP = null, sfxGain = null, noiseBuf = null, timer = null;
  const raw = {}, buffers = {};
  let ducked = false, musicTarget = -1, layer = 3;
  let run = null, lastTime = 0, lastBpm = 120;
  const sfxEnds = [], lastSfx = {};

  // ===================== 합성 기본 보이스 =====================
  function track(r, node, end) { if (r) r.srcs.push({ n: node, e: end }); }

  // 감산 합성 보이스. fs: 주파수 배열. o: {type,v,cut,env,q,fd,a,sus,dk,rel,det,slide,sd,sub}
  // sus 미지정 = 플럭(지수 감쇠), 지정 = 서스테인 후 릴리즈
  function syn(r, dest, t, dur, fs, o) {
    const g = ctx.createGain();
    let into = g;
    if (o.cut) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.q || 0.8;
      const c = o.cut, c0 = Math.min(c * (o.env || 1), 18000);
      f.frequency.setValueAtTime(c0, t);
      if (c0 !== c) f.frequency.exponentialRampToValueAtTime(c, t + (o.fd || Math.min(0.2, dur)));
      f.connect(g); into = f;
    }
    const a = o.a || 0.003, v = Math.max(0.0002, o.v);
    let end;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sus == null) {
      g.gain.exponentialRampToValueAtTime(0.0003, t + a + dur);
      end = t + a + dur + 0.01;
    } else {
      const rel = o.rel || 0.05;
      if (o.sus < 1) g.gain.setTargetAtTime(v * o.sus, t + a, Math.max(0.01, (o.dk || 0.1) / 3));
      g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur), rel / 4);
      end = t + Math.max(a, dur) + rel + 0.02;
    }
    g.connect(dest);
    const type = o.type || 'sawtooth', n = o.det ? 2 : 1;
    for (let i = 0; i < fs.length; i++) {
      for (let j = 0; j < n; j++) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(fs[i], t);
        if (o.slide) osc.frequency.exponentialRampToValueAtTime(fs[i] * o.slide, t + (o.sd || dur));
        if (o.det) osc.detune.setValueAtTime(j ? o.det : -o.det, t);
        osc.connect(into);
        osc.start(t); osc.stop(end);
        track(r, osc, end);
      }
    }
    if (o.sub) { // 베이스 몸통: 같은 음 사인 (필터 거치지 않음)
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.setValueAtTime(fs[0], t);
      sg.gain.value = o.sub; s.connect(sg); sg.connect(g);
      s.start(t); s.stop(end); track(r, s, end);
    }
    return end;
  }

  // 노이즈 보이스 (공용 노이즈 버퍼 재사용). o: {q, f1(필터 끝 주파수), a}
  function nz(r, dest, t, dur, v, ft, f, o) {
    o = o || {};
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = ft; flt.Q.value = o.q || 0.7;
    flt.frequency.setValueAtTime(f, t);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain();
    const a = o.a || 0.001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(0.0003, t + Math.max(dur, a + 0.01));
    s.connect(flt); flt.connect(g); g.connect(dest);
    const end = t + Math.max(dur, a + 0.01) + 0.02;
    s.start(t, Math.random() * 1.5); s.stop(end);
    track(r, s, end);
    return end;
  }

  function sample(name, v, rate) {
    const b = buffers[name];
    if (!b) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; if (rate) s.playbackRate.value = rate;
    g.gain.value = v;
    s.connect(g); g.connect(sfxGain);
    s.start(ctx.currentTime + 0.002);
    return true;
  }

  // ===================== 효과음 =====================
  const P = (t, f, o) => syn(null, sfxGain, t, o.dur, [f], o);
  const PENTA = [0, 2, 4, 7, 9];
  const LOW = { land: 1, tick: 1, nearmiss: 1, click: 1 };
  const SFX = {
    jump: t => {
      P(t, 300, { type: 'square', v: 0.11, cut: 3200, slide: 2.2, sd: 0.07, dur: 0.1 });
      return P(t, 150, { type: 'sine', v: 0.2, slide: 2.2, sd: 0.07, dur: 0.09 });
    },
    djump: t => {
      P(t, 620, { type: 'triangle', v: 0.2, slide: 1.9, sd: 0.08, dur: 0.12 });
      P(t + 0.035, 1568, { type: 'sine', v: 0.08, dur: 0.12 });
      P(t + 0.07, 2093, { type: 'sine', v: 0.07, dur: 0.14 });
      return P(t + 0.1, 2637, { type: 'square', v: 0.025, cut: 7000, dur: 0.12 });
    },
    land: t => {
      nz(null, sfxGain, t, 0.06, 0.18, 'lowpass', 900);
      return P(t, 140, { type: 'sine', v: 0.22, slide: 0.45, sd: 0.07, dur: 0.08 });
    },
    die: t => {
      nz(null, sfxGain, t, 0.5, 0.5, 'lowpass', 6000, { f1: 160, q: 1 });
      P(t, 520, { type: 'sawtooth', v: 0.18, cut: 2600, slide: 0.12, sd: 0.5, dur: 0.55 });
      P(t, 90, { type: 'square', v: 0.2, cut: 900, slide: 0.45, sd: 0.3, dur: 0.32 });
      sample('explode', 0.45); sample('hit', 0.3, 0.9);
      return t + 0.6;
    },
    coin: t => {
      P(t, 988, { type: 'square', v: 0.09, cut: 5000, dur: 0.08 });
      P(t + 0.075, 1319, { type: 'square', v: 0.1, cut: 5000, dur: 0.38 });
      P(t + 0.075, 2637, { type: 'triangle', v: 0.05, dur: 0.3 });
      sample('coin', 0.25);
      return t + 0.5;
    },
    orb: t => {
      P(t, 440, { type: 'sine', v: 0.24, slide: 2, sd: 0.12, dur: 0.2 });
      P(t, 880, { type: 'triangle', v: 0.09, slide: 2, sd: 0.12, dur: 0.25 });
      nz(null, sfxGain, t, 0.12, 0.07, 'bandpass', 2000, { f1: 5000, q: 1.5 });
      return t + 0.3;
    },
    pad: t => {
      P(t, 180, { type: 'sawtooth', v: 0.13, cut: 1800, env: 3, slide: 5, sd: 0.2, dur: 0.24 });
      P(t, 90, { type: 'sine', v: 0.2, slide: 4, sd: 0.2, dur: 0.2 });
      nz(null, sfxGain, t, 0.2, 0.1, 'bandpass', 600, { f1: 5000, q: 1.2 });
      return t + 0.3;
    },
    nearmiss: (t, o) => {
      const c = Math.max(0, Math.min(24, (o.combo | 0)));
      const semi = PENTA[c % 5] + 12 * Math.floor(c / 5);
      const k = Math.pow(2, Math.min(semi, 24) / 12);
      nz(null, sfxGain, t, 0.17, 0.2, 'bandpass', 1100 * k, { f1: 5500 * Math.min(k, 3), q: 1.3, a: 0.04 });
      P(t + 0.03, 1046 * k, { type: 'sine', v: 0.08, dur: 0.12 });
      return P(t + 0.03, 2093 * k, { type: 'triangle', v: 0.03, dur: 0.1 });
    },
    checkpoint: t => {
      P(t, 784, { type: 'triangle', v: 0.14, dur: 0.08 });
      return P(t + 0.07, 1175, { type: 'triangle', v: 0.14, dur: 0.28 });
    },
    complete: t => {
      [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => {
        P(t + i * 0.07, mtof(m), { type: 'square', v: 0.07, cut: 5000, dur: 0.18 });
        P(t + i * 0.07, mtof(m + 12), { type: 'triangle', v: 0.04, dur: 0.15 });
      });
      syn(null, sfxGain, t + 0.5, 1.0, [72, 76, 79, 84].map(mtof), { type: 'sawtooth', v: 0.06, cut: 3500, env: 1.6, det: 8, a: 0.02, sus: 0.8, rel: 0.6 });
      nz(null, sfxGain, t + 0.5, 1.2, 0.08, 'highpass', 5000);
      return t + 2.1;
    },
    newbest: t => {
      [[67, 0], [72, 0.1], [76, 0.2]].forEach(([m, d]) => P(t + d, mtof(m), { type: 'sawtooth', v: 0.1, cut: 2600, env: 2, dur: 0.1, a: 0.008 }));
      syn(null, sfxGain, t + 0.3, 0.2, [mtof(79)], { type: 'sawtooth', v: 0.11, cut: 3000, env: 2, a: 0.01, sus: 0.8, rel: 0.08 });
      syn(null, sfxGain, t + 0.55, 0.8, [72, 76, 79, 84].map(mtof), { type: 'sawtooth', v: 0.06, cut: 3200, env: 2, det: 10, a: 0.015, sus: 0.75, rel: 0.5 });
      P(t + 0.55, mtof(96), { type: 'triangle', v: 0.05, dur: 0.6 });
      sample('gold', 0.3);
      return t + 1.6;
    },
    click: t => {
      if (sample('click', 0.5)) return t + 0.1;
      return P(t, 1400, { type: 'square', v: 0.08, cut: 6000, dur: 0.03 });
    },
    back: t => {
      if (sample('back', 0.5)) return t + 0.2;
      return P(t, 700, { type: 'triangle', v: 0.16, slide: 0.55, sd: 0.08, dur: 0.09 });
    },
    tick: t => {
      P(t, 880, { type: 'square', v: 0.025, cut: 4000, dur: 0.03 });
      return P(t, 1760, { type: 'sine', v: 0.12, dur: 0.035 });
    },
  };

  function sfx(name, opts) {
    if (!ctx || !flag('sfx') || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const lp = lastSfx[name];
    if (lp != null && now - lp < 0.03 && now >= lp) return; // 같은 소리 스팸 방지
    lastSfx[name] = now;
    for (let i = sfxEnds.length - 1; i >= 0; i--) if (sfxEnds[i] < now) sfxEnds.splice(i, 1);
    if (sfxEnds.length >= 16 || (sfxEnds.length >= 10 && LOW[name])) return; // 동시 보이스 제한
    let end;
    try { end = fn(now + 0.002, opts || {}); } catch (e) { end = now + 0.3; }
    sfxEnds.push(end || now + 0.3);
  }

  // ===================== 곡 정의 =====================
  const SC = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  const QL = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7], sus4: [0, 5, 7] };
  const C = (r, q) => ({ r, tones: QL[q].map(x => x + r) });

  const RH_SLOW = ['x.......x...x...', 'x...x.......x...', 'x.....x.........', '..x.....x.x.....'];
  const RH_MID = ['x..x..x...x.x...', 'x...x.x.x..x.x..', 'x.x...x...x.x...', '..x..x..x.x.x...', 'x..x..x.x..x.x..', 'x.....x.x...x...'];
  const RH_FAST = ['x.xxx.x.x.xxx.x.', 'x.x.x.xxx.x.x.x.', 'xx.x.x.xx.x.x.x.', 'x..x..x.x.x.xxx.', 'x..x..x.x..x.x..'];
  const CAD = ['x...x...x.......', 'x.x.x...........', 'x..x..x.........'];

  // 구간: I 인트로 / A 벌스 / B 코러스 / C 코러스2(변주) / D 숨 구간 / E 피크
  const SEC = {
    I: { kick: 1, snare: 0, hat: 1, bass: 1, pad: 1, arp: 0, lead: 0, extra: 0 },
    A: { kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, arp: 1, lead: 0, extra: 0 },
    B: { kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, arp: 1, lead: 1, mel: 0, extra: 1, crash: 1, peak: 1 },
    C: { kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, arp: 1, lead: 1, mel: 1, extra: 1, crash: 1, peak: 1, alt: 1 },
    D: { kick: 0, snare: 0, hat: 2, bass: 2, pad: 1, arp: 1, lead: 1, mel: 1, soft: 1, extra: 0 },
    E: { kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, arp: 1, lead: 1, mel: 0, extra: 1, crash: 1, peak: 1, alt: 1, hard: 1 },
  };

  const DEF = {
    menu: {
      bpm: 100, key: 62, scale: SC.dorian, feel: 'D dorian · 느긋한 로파이 신스웨이브',
      chords: [C(0, 'm9'), C(5, 'M'), C(3, 'M7'), C(10, 'add9'), C(0, 'm9'), C(5, 'M'), C(8, 'M7'), C(10, 'sus2')],
      form: ['I', 'A', 'B', 'A', 'D', 'C'], loop: 1,
      kick: 'x.........x.....', snare: '........x.......', hat: 'h.x.h.x.h.x.h.x.', ohat: '..............x.', hat2: '',
      bass: 'x-.....x..x-....', bass2: 'x-.....x..o-..5.', bgate: 0.9,
      arp: '0123', arpRate: 2, arpLo: 67, lo: 64, hi: 81, rh: RH_SLOW, pump: 0.3, delay: 0.75, fb: 0.42, wet: 0.32, hv: 0.6,
      snd: { bass: 'triangle', bcut: 900, benv: 1, bq: 1, bv: 1.2, pad: 'sawtooth', pcut: 900, pv: 1.1, arp: 'triangle', acut: 3000, av: 1, lead: 'triangle', lcut: 4000, ldet: 0, lv: 1.1, snf: 2600 },
    },
    lv1: {
      bpm: 120, key: 57, scale: SC.minor, feel: 'A minor · 밝은 클래식 신스웨이브(옥타브 베이스)',
      chords: [C(0, 'm'), C(8, 'M'), C(3, 'M'), C(10, 'M'), C(0, 'm'), C(8, 'M'), C(10, 'M'), C(7, 'm'),
        C(8, 'M7'), C(10, 'M'), C(0, 'm'), C(0, 'm7'), C(8, 'M'), C(10, 'M'), C(7, 'M'), C(7, 'd7')],
      form: ['I', 'A', 'B', 'A', 'D', 'C', 'B', 'E'], loop: 1,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', ohat: '..x...x...x...x.', hat2: 'h...h...h...h...',
      bass: 'x.o.x.o.x.o.x.o.', bass2: 'x.oxx.o.x.oxx.o5', bgate: 0.7,
      arp: '0121', arpRate: 1, arpLo: 69, lo: 67, hi: 86, rh: RH_MID, pump: 0.45, delay: 0.75, fb: 0.35, wet: 0.25, hv: 1,
      snd: { bass: 'sawtooth', bcut: 500, benv: 4, bq: 6, bv: 1, pad: 'sawtooth', pcut: 1500, pv: 1, arp: 'square', acut: 2200, av: 1, lead: 'sawtooth', lcut: 3200, ldet: 6, lv: 1, snf: 1800 },
    },
    lv2: {
      bpm: 128, key: 60, scale: SC.minor, feel: 'C minor · 일렉트로 하우스(오프비트 베이스, 클랩)',
      chords: [C(0, 'm'), C(8, 'M'), C(3, 'M'), C(10, 'M'), C(5, 'm'), C(8, 'M'), C(10, 'M'), C(7, 'M'),
        C(0, 'm'), C(8, 'M'), C(3, 'M'), C(10, 'M'), C(5, 'm7'), C(8, 'M7'), C(7, 'sus4'), C(7, 'M')],
      form: ['I', 'A', 'B', 'A', 'D', 'B', 'C', 'E'], loop: 1,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..X...X...X...X.', ohat: '', hat2: 'hh.hhh.hhh.hhh.h',
      bass: '..x-..x-..x-..x-', bass2: '..x-..x-..o-.5x-', bgate: 0.85,
      arp: '0213', arpRate: 2, arpLo: 70, lo: 67, hi: 86, rh: RH_MID, pump: 0.5, delay: 0.75, fb: 0.35, wet: 0.25, hv: 0.9,
      snd: { bass: 'square', bcut: 700, benv: 3, bq: 4, bv: 0.9, pad: 'sawtooth', pcut: 1200, pv: 1, arp: 'sawtooth', acut: 2600, av: 1, lead: 'square', lcut: 3000, ldet: 0, lv: 0.9, snf: 1500 },
    },
    lv3: {
      bpm: 136, key: 55, scale: SC.minor, feel: 'G minor · 어두운 다크웨이브(갤럽 베이스)',
      chords: [C(0, 'm'), C(8, 'M'), C(5, 'm'), C(7, 'M'), C(0, 'm'), C(8, 'M'), C(3, 'M'), C(10, 'M'),
        C(5, 'm7'), C(8, 'M7'), C(0, 'm'), C(7, 'M'), C(8, 'M'), C(10, 'M'), C(7, 'sus4'), C(7, 'd7')],
      form: ['I', 'A', 'B', 'A', 'D', 'C', 'E', 'B', 'D', 'E'], loop: 2,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', ohat: '..x.......x.....', hat2: 'hh.hhh.hhh.hhh.h',
      bass: 'x.xxx.xxx.xxx.xx', bass2: 'x.xxo.xxx.xx5.xo', bgate: 0.6,
      arp: '0120', arpRate: 1, arpLo: 67, lo: 65, hi: 84, rh: RH_MID, pump: 0.45, delay: 0.75, fb: 0.4, wet: 0.28, hv: 0.9,
      snd: { bass: 'sawtooth', bcut: 450, benv: 5, bq: 8, bv: 1, pad: 'sawtooth', pcut: 900, pv: 1.1, arp: 'triangle', acut: 4000, av: 1.3, lead: 'sawtooth', lcut: 2400, ldet: 8, lv: 1, snf: 1700 },
    },
    lv4: {
      bpm: 146, key: 59, scale: SC.minor, feel: 'B minor · 질주하는 일렉트로(16분 베이스, 싱코페이션 킥)',
      chords: [C(0, 'm'), C(3, 'M'), C(10, 'M'), C(8, 'M'), C(5, 'm'), C(8, 'M'), C(10, 'M'), C(7, 'M'),
        C(0, 'm'), C(3, 'M'), C(10, 'M'), C(8, 'M'), C(5, 'm7'), C(8, 'M'), C(7, 'd7'), C(7, 'M')],
      form: ['I', 'A', 'B', 'C', 'D', 'A', 'E', 'E', 'D', 'B', 'E', 'E'], loop: 4,
      kick: 'x...x...x...x..x', kickE: 'x..xx...x..xx..x', snare: '....x.......x...', snareE: '....x.......x.hx',
      hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', hat2: '.h.h.h.h.h.h.h.h',
      bass: 'x.xxx.xox.xxx.5o', bass2: 'xxoxxxoxxxoxxxo5', bgate: 0.55,
      arp: '01232101', arpRate: 1, arpLo: 69, lo: 67, hi: 86, rh: RH_MID, pump: 0.5, delay: 0.75, fb: 0.3, wet: 0.22, hv: 0.8,
      snd: { bass: 'square', bcut: 600, benv: 5, bq: 5, bv: 0.9, pad: 'sawtooth', pcut: 1300, pv: 1, arp: 'sawtooth', acut: 3000, av: 0.9, lead: 'square', lcut: 3500, ldet: 5, lv: 0.9, snf: 1900 },
    },
    lv5: {
      bpm: 160, key: 52, scale: SC.harm, feel: 'E 화성단음계/프리지안 · 극한 하드 일렉트로(롤링 베이스, 슈퍼소 리드)',
      chords: [C(0, 'm'), C(8, 'M'), C(5, 'm'), C(7, 'M'), C(0, 'm'), C(1, 'M'), C(0, 'm'), C(7, 'M'),
        C(8, 'M'), C(10, 'M'), C(7, 'M'), C(0, 'm'), C(1, 'M'), C(1, 'M7'), C(7, 'M'), C(7, 'd7')],
      form: ['I', 'E', 'A', 'E', 'C', 'D', 'E', 'E', 'A', 'C', 'D', 'E', 'E'], loop: 2,
      kick: 'x...x...x...x...', kickE: 'x...x...x...x.x.', snare: '....x.......x...', snareE: '....x.......x..h',
      hat: 'xxXxxxXxxxXxxxXx', ohat: '..x...x...x...x.', hat2: '',
      bass: '.xxx.xxx.xxx.xxx', bass2: '.xxo.xxx.xxo.x5o', bgate: 0.7,
      arp: '0123', arpRate: 1, arpLo: 71, lo: 67, hi: 88, rh: RH_FAST, pump: 0.55, delay: 0.5, fb: 0.3, wet: 0.2, hv: 0.55,
      snd: { bass: 'sawtooth', bcut: 700, benv: 4, bq: 7, bv: 1, pad: 'sawtooth', pcut: 1600, pv: 0.9, arp: 'sawtooth', acut: 3500, av: 0.9, lead: 'sawtooth', lcut: 5000, ldet: 14, lv: 1, snf: 2000 },
    },
  };

  const wrap = (m, lo) => lo + (((m - lo) % 12) + 12) % 12;

  function pool(tr, ch, lo, hi) {
    const set = new Set(tr.scale.map(s => (tr.key + s) % 12));
    for (const tn of ch.tones) {
      const pc = (tr.key + tn) % 12;
      if (!set.has(pc)) { set.delete((pc + 1) % 12); set.delete((pc + 11) % 12); set.add(pc); }
    }
    const out = [];
    for (let m = lo; m <= hi; m++) if (set.has(m % 12)) out.push(m);
    return out;
  }

  // 결정적 멜로디 생성(시드 고정 → 매 시도 같은 곡)
  function genMel(tr, seed) {
    const rnd = mulberry(seed), pick = a => a[(rnd() * a.length) | 0];
    const lo = tr.lo, hi = tr.hi, n = tr.chords.length;
    const bars = [];
    let cur = (lo + hi) >> 1, rhA = null, rhB = null, motif = null;
    for (let b = 0; b < n; b++) {
      const ch = tr.chords[b], pl = pool(tr, ch, lo, hi);
      const cpc = ch.tones.map(x => (tr.key + x) % 12), rootPc = (tr.key + ch.r) % 12;
      const inPh = b & 3;
      if (inPh === 0 || !rhA) { rhA = pick(tr.rh); rhB = pick(tr.rh); }
      const rh = inPh === 1 ? rhB : inPh === 3 ? pick(CAD) : rhA;
      const on = [];
      for (let i = 0; i < 16; i++) if (rh[i] === 'x') on.push(i);
      const snap = (i, pcs) => {
        let best = clamp(i, 0, pl.length - 1), bd = 1e9;
        for (let k = 0; k < pl.length; k++) if (pcs.indexOf(pl[k] % 12) >= 0) {
          const d = Math.abs(k - i) + rnd() * 0.6;
          if (d < bd) { bd = d; best = k; }
        }
        return best;
      };
      let idx = 0, bd = 1e9;
      for (let k = 0; k < pl.length; k++) { const d = Math.abs(pl[k] - cur); if (d < bd) { bd = d; idx = k; } }
      const evs = new Array(16).fill(null), seq = [];
      for (let k = 0; k < on.length; k++) {
        const i = on[k];
        if (inPh === 2 && motif && k < motif.length) idx = k === 0 ? snap(idx, cpc) : idx + motif[k];
        else if (k === 0 || (i & 3) === 0) idx = snap(idx + pick([-2, -1, 0, 1, 1, 2]), cpc);
        else idx += pick([-2, -1, -1, 1, 1, 2]);
        idx = clamp(idx, 0, pl.length - 1);
        if (pl[idx] > hi - 3 && rnd() < 0.5) idx = Math.max(0, idx - 2);
        if (pl[idx] < lo + 3 && rnd() < 0.5) idx = Math.min(pl.length - 1, idx + 2);
        const last = k === on.length - 1;
        if (inPh === 3 && last) idx = snap(idx, [rootPc]);
        seq.push(idx);
        const nextOn = last ? 16 : on[k + 1];
        const len = inPh === 3 && last ? 16 - i : Math.min(nextOn - i, 4);
        evs[i] = { m: pl[idx], len };
      }
      if (inPh === 0) motif = seq.map((v, k) => (k ? v - seq[k - 1] : 0));
      if (seq.length) cur = pl[seq[seq.length - 1]];
      bars.push(evs);
    }
    return bars;
  }

  const built = {};
  function getTrack(id) {
    if (built[id]) return built[id];
    const d = DEF[id];
    if (!d) return null;
    const tr = Object.assign({ id }, d);
    for (const ch of tr.chords) {
      ch.pad = Array.from(new Set(ch.tones.slice(0, 4).map(x => wrap(tr.key + x, 58)))).sort((a, b) => a - b).map(mtof);
      const ar = Array.from(new Set(ch.tones.slice(0, 4).map(x => wrap(tr.key + x, tr.arpLo)))).sort((a, b) => a - b);
      ar.push(ar[0] + 12);
      ch.arp = ar;
      ch.bass = wrap(tr.key + ch.r, 33);
      ch.third = ch.tones[1] - ch.r; ch.fifth = ch.tones[2] - ch.r;
    }
    let h = 7;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0;
    tr.mel = [genMel(tr, h), genMel(tr, h ^ 0x9e3779b9)];
    return (built[id] = tr);
  }

  const secAt = (tr, ph) => {
    const f = tr.form;
    return ph < f.length ? f[ph] : f[tr.loop + (ph - f.length) % (f.length - tr.loop)];
  };
  const vel = (p, pos) => {
    if (!p) return 0;
    const c = p[pos % p.length];
    return c === 'x' ? 1 : c === 'X' ? 1.4 : c === 'h' ? 0.5 : 0;
  };

  // ===================== 음악 런 (재시작마다 새 노드 묶음) =====================
  function makeRunNodes(r) {
    const tr = r.tr, gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const n = {};
    n.out = gn(1); n.out.connect(musicGain);
    n.drums = gn(1); n.drums.connect(n.out);
    n.bass = gn(1); n.bass.connect(n.out);
    n.pump = gn(1); n.pump.connect(n.out);
    n.pad = gn(1); n.pad.connect(n.pump);
    n.arp = gn(layer >= 1 ? 1 : 0); n.arp.connect(n.pump);
    n.lead = gn(layer >= 2 ? 1 : 0); n.lead.connect(n.out);
    n.extra = gn(layer >= 3 ? 1 : 0); n.extra.connect(n.drums);
    n.send = gn(tr.wet);
    n.arp.connect(n.send); n.lead.connect(n.send);
    n.delay = ctx.createDelay(1.5);
    n.delay.delayTime.value = Math.min(1.4, tr.delay * 60 / tr.bpm);
    n.fbf = ctx.createBiquadFilter(); n.fbf.type = 'lowpass'; n.fbf.frequency.value = 2500;
    n.fb = gn(tr.fb);
    n.send.connect(n.delay); n.delay.connect(n.out);
    n.delay.connect(n.fbf); n.fbf.connect(n.fb); n.fb.connect(n.delay);
    r.n = n;
  }

  function kill(r) {
    if (!r) return;
    r.alive = false;
    if (r.clock !== 'ctx' || !r.n) return;
    const now = ctx.currentTime, g = r.n.out.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      g.linearRampToValueAtTime(0, now + 0.015);
    } catch (e) { /* 무시 */ }
    for (const s of r.srcs) { try { s.n.stop(now + 0.03); } catch (e) { /* 이미 정지 */ } }
    r.srcs.length = 0;
    const out = r.n.out, fb = r.n.fb;
    try { fb.gain.setValueAtTime(0, now + 0.02); } catch (e) { /* 무시 */ }
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* 무시 */ } }, 120);
    r.n = null;
  }

  // 사람이 실제로 듣는 시점의 컨텍스트 시간 (출력 지연 보정)
  function heardTime() {
    const ct = ctx.currentTime;
    try {
      if (ctx.getOutputTimestamp && root.performance) {
        const ts = ctx.getOutputTimestamp();
        if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
          const h = ts.contextTime + (root.performance.now() - ts.performanceTime) / 1000;
          if (h <= ct + 0.03 && h >= ct - 0.6) return h;
        }
      }
    } catch (e) { /* 미지원 */ }
    return ct - latency();
  }
  function latency() {
    if (!ctx) return 0;
    const l = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return clamp(isFinite(l) ? l : 0, 0, 0.5);
  }

  function bassV(r, t, dur, m, v, soft) {
    const s = r.tr.snd;
    syn(r, r.n.bass, t, dur, [mtof(m)], {
      type: soft ? 'triangle' : s.bass, v: 0.26 * v * s.bv, cut: soft ? 400 : s.bcut, env: soft ? 1 : s.benv,
      q: soft ? 1 : s.bq, fd: 0.12, a: soft ? 0.05 : 0.004, sus: 0.8, dk: 0.15, rel: soft ? 0.3 : 0.04, sub: soft ? 0 : 0.6,
    });
  }
  function kick(r, t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.012);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g); g.connect(r.n.drums);
    o.start(t); o.stop(t + 0.36);
    track(r, o, t + 0.36);
  }
  function pump(r, t) {
    const p = r.n.pump.gain, d = r.tr.pump;
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(1 - d, t + 0.01);
    p.linearRampToValueAtTime(1, t + Math.min(0.3, r.sd * 3.2));
  }

  function scheduleStep(r, s, t) {
    if (!flag('music')) { r.first = true; return; } // 음소거: 시계만 진행
    const tr = r.tr, sd = r.sd, pos = s & 15, bar = s >> 4, inPh = bar & 3, ph = bar >> 2;
    const key = secAt(tr, ph), S = SEC[key], nk = secAt(tr, ph + 1), N = SEC[nk];
    const ch = tr.chords[bar % tr.chords.length];
    const build = inPh === 3 && !!N.peak && nk !== key;
    const first = r.first; r.first = false;
    const D = r.n.drums, X = r.n.extra;

    // 드럼
    let kv = S.kick ? vel((S.hard && tr.kickE) || tr.kick, pos) : 0;
    if (build && pos >= 12) kv = 0;
    if (kv) { kick(r, t, 0.9 * Math.min(kv, 1)); if ((pos & 3) === 0) pump(r, t); }
    let sv = S.snare ? vel((S.hard && tr.snareE) || tr.snare, pos) : 0;
    if (build && pos >= 8) sv = Math.max(sv, pos >= 12 ? 0.4 + (pos - 12) * 0.18 : (pos & 1) ? 0 : 0.35);
    else if (inPh === 3 && (bar & 7) === 7 && S.snare && pos >= 14) sv = Math.max(sv, 0.5);
    if (sv) {
      nz(r, D, t, 0.17, 0.4 * sv, 'bandpass', tr.snd.snf, { q: 0.6 });
      syn(r, D, t, 0.07, [220], { type: 'triangle', v: 0.25 * sv, slide: 0.6, sd: 0.07 });
      if (S.extra && sv >= 1) { nz(r, X, t, 0.11, 0.22, 'bandpass', 1200, { q: 1.2 }); nz(r, X, t + 0.012, 0.1, 0.18, 'bandpass', 1300, { q: 1.2 }); }
    }
    const hv = tr.hv;
    if (S.hat === 1) { const v = vel(tr.hat, pos); if (v) nz(r, D, t, 0.04, 0.12 * v * hv, 'highpass', 7000, { q: 0.5 }); }
    else if (S.hat === 2 && (pos & 3) === 2) nz(r, D, t, 0.04, 0.05 * hv, 'highpass', 7000, { q: 0.5 });
    if (S.extra) {
      const ov = vel(tr.ohat, pos); if (ov) nz(r, X, t, 0.2, 0.06 * ov * hv, 'highpass', 6500, { q: 0.5 });
      const h2 = vel(tr.hat2, pos); if (h2) nz(r, X, t, 0.03, 0.08 * h2 * hv, 'highpass', 8000, { q: 0.5 });
    }
    if (S.crash && inPh === 0 && pos === 0) nz(r, D, t, 1.3, 0.11, 'highpass', 4000);
    if (build && pos === 0) nz(r, D, t, sd * 16, 0.1, 'bandpass', 400, { f1: 7000, q: 2, a: sd * 15 });

    // 베이스
    if (S.bass === 1) {
      const bp = (S.alt && tr.bass2) || tr.bass, c = bp[pos];
      if (c && c !== '.' && c !== '-' && !(build && pos >= 14)) {
        let len = 1;
        while (pos + len < 16 && bp[pos + len] === '-') len++;
        const m = ch.bass + (c === 'o' ? 12 : c === '5' ? ch.fifth : c === '3' ? ch.third : 0);
        bassV(r, t, len * sd * tr.bgate, m, 1, false);
      }
    } else if (S.bass === 2 && (pos === 0 || first)) bassV(r, t, (16 - pos) * sd * 0.95, ch.bass + 12, 0.8, true);

    // 패드
    if (S.pad && (pos === 0 || first)) {
      syn(r, r.n.pad, t, (16 - pos) * sd, ch.pad, {
        type: tr.snd.pad, v: 0.045 * tr.snd.pv, cut: tr.snd.pcut * (S.peak ? 1.4 : 1), det: 9, a: Math.min(0.12, sd * 2), sus: 1, rel: 0.25,
      });
    }
    // 아르페지오
    if (S.arp && pos % tr.arpRate === 0) {
      const k = (pos / tr.arpRate) | 0;
      const idx = (+tr.arp[k % tr.arp.length]) % ch.arp.length;
      const up = S.alt && (bar & 1) ? 12 : 0;
      syn(r, r.n.arp, t, sd * tr.arpRate * 1.6, [mtof(ch.arp[idx] + up)], {
        type: tr.snd.arp, v: 0.08 * tr.snd.av * (S.soft ? 0.8 : 1), cut: tr.snd.acut * (S.soft ? 0.6 : 1), env: 2.5, q: 3, fd: 0.08,
      });
    }
    // 리드
    if (S.lead) {
      const ev = tr.mel[S.mel][bar % tr.chords.length][pos];
      if (ev) {
        syn(r, r.n.lead, t, Math.max(sd, ev.len * sd * 0.92), [mtof(ev.m)], {
          type: tr.snd.lead, v: 0.1 * tr.snd.lv * (S.soft ? 0.6 : 1), cut: tr.snd.lcut * (S.soft ? 0.6 : 1), env: 2, q: 2, fd: 0.15,
          det: tr.snd.ldet, a: 0.01, sus: 0.7, dk: 0.2, rel: 0.12,
        });
      }
    }
  }

  function tick() {
    if (!ctx) return;
    applyMusicGain();
    const r = run;
    if (!r || r.clock !== 'ctx' || !r.alive) return;
    const now = ctx.currentTime;
    // 탭이 백그라운드 등으로 크게 밀렸으면 늦은 음을 몰아치지 않고 건너뜀
    if (r.nextT < now - 0.05) {
      r.step = Math.max(r.step, Math.ceil((now + LEAD - r.startTime) / r.sd));
      r.nextT = r.startTime + r.step * r.sd;
      r.first = true;
    }
    const horizon = now + (hasDoc && document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
    let guard = 0;
    while (r.nextT < horizon && guard++ < 256) {
      try { scheduleStep(r, r.step, r.nextT); } catch (e) { /* 한 스텝 실패해도 계속 */ }
      r.step++;
      r.nextT = r.startTime + r.step * r.sd;
    }
    if (r.srcs.length > 96) r.srcs = r.srcs.filter(x => x.e > now - 0.05);
  }

  function applyMusicGain() {
    if (!ctx) return;
    const target = flag('music') ? MUSIC_VOL * (ducked ? DUCK_MUL : 1) : 0;
    if (target === musicTarget) return;
    musicTarget = target;
    try { musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05); } catch (e) { /* 무시 */ }
  }

  // ===================== 공개 API =====================
  function time() {
    const r = run;
    if (!r) return lastTime;
    let t;
    if (r.clock === 'perf') t = perfNow() - r.perfStart;
    else t = heardTime() - r.startTime;
    if (!(t >= 0)) t = 0;
    if (t < r.lastT && r.lastT - t < 0.05) t = r.lastT; // 미세 역행 방지(단조 증가)
    r.lastT = t;
    lastTime = t;
    return t;
  }

  function start(id, fromSec) {
    const tr = getTrack(id) || getTrack('lv1');
    kill(run);
    fromSec = Math.max(0, +fromSec || 0);
    ducked = false;
    lastBpm = tr.bpm;
    const r = { id: tr.id, tr, bpm: tr.bpm, sd: 60 / tr.bpm / 4, srcs: [], alive: true, first: true, lastT: 0 };
    run = r;
    lastTime = fromSec;
    if (ctx) {
      try {
        applyMusicGain();
        if (duckLP) duckLP.frequency.setTargetAtTime(20000, ctx.currentTime, 0.03);
        r.clock = 'ctx';
        r.startTime = ctx.currentTime + LEAD - fromSec;
        r.step = Math.max(0, Math.ceil(fromSec / r.sd - 1e-6));
        r.nextT = r.startTime + r.step * r.sd;
        makeRunNodes(r);
        tick(); // 첫 박을 즉시 예약
        return;
      } catch (e) { /* 아래 perf 시계로 대체 */ }
    }
    r.clock = 'perf';
    r.perfStart = perfNow() - fromSec;
  }

  function stop() {
    if (!run) return;
    time();
    kill(run);
    run = null;
  }

  function duck(on) {
    ducked = !!on;
    if (!ctx) return;
    applyMusicGain();
    try { duckLP.frequency.setTargetAtTime(ducked ? DUCK_CUT : 20000, ctx.currentTime, 0.06); } catch (e) { /* 무시 */ }
  }

  function beat() {
    const t = time(), b = t * lastBpm / 60;
    const fb = Math.floor(b);
    return { beat: b, phase: b - fb, bar: Math.floor(b / 4) };
  }

  function setLayer(n) {
    layer = clamp(Math.round(+n || 0), 0, 3);
    const r = run;
    if (!ctx || !r || !r.n) return;
    const now = ctx.currentTime;
    try {
      r.n.arp.gain.setTargetAtTime(layer >= 1 ? 1 : 0, now, 0.25);
      r.n.lead.gain.setTargetAtTime(layer >= 2 ? 1 : 0, now, 0.25);
      r.n.extra.gain.setTargetAtTime(layer >= 3 ? 1 : 0, now, 0.25);
    } catch (e) { /* 무시 */ }
  }

  function decodeOne(name) {
    const ab = raw[name];
    if (!ab || !ctx) return;
    delete raw[name];
    try {
      const done = b => { if (b) buffers[name] = b; };
      const p = ctx.decodeAudioData(ab, done, () => { /* 디코드 실패 → 합성음 */ });
      if (p && p.then) p.then(done, () => { /* 합성음 대체 */ });
    } catch (e) { /* 합성음 대체 */ }
  }

  function preload() {
    if (typeof fetch !== 'function') return Promise.resolve();
    const all = Promise.all(SAMPLE_NAMES.map(n =>
      Promise.resolve()
        .then(() => fetch('assets/sfx/' + n + '.ogg'))
        .then(r => (r && r.ok ? r.arrayBuffer() : null))
        .then(ab => { if (ab) { raw[n] = ab; if (ctx) decodeOne(n); } })
        .catch(() => { /* 없어도 됨 */ })
    )).then(() => {});
    const to = new Promise(res => { const h = setTimeout(res, 4000); if (h && h.unref) h.unref(); });
    return Promise.race([all, to]);
  }

  function init() {
    if (ctx || !AC) return;
    try {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      comp.connect(ctx.destination);
      duckLP = ctx.createBiquadFilter(); duckLP.type = 'lowpass'; duckLP.frequency.value = 20000; duckLP.Q.value = 0.7;
      duckLP.connect(comp);
      musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(duckLP);
      sfxGain = ctx.createGain(); sfxGain.gain.value = SFX_VOL; sfxGain.connect(comp);
      const len = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // iOS 잠금 해제용 무음 버퍼
      const sil = ctx.createBufferSource();
      sil.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      sil.connect(ctx.destination); sil.start(0);
      for (const n of Object.keys(raw)) decodeOne(n);
      timer = setInterval(tick, TICK_MS);
      if (hasDoc) document.addEventListener('visibilitychange', tick);
      musicTarget = -1;
      applyMusicGain();
      if (duckLP && ducked) duckLP.frequency.value = DUCK_CUT;
      // 초기화 전에 시작된 곡(perf 시계)은 같은 위치에서 실제 재생으로 전환
      if (run && run.clock === 'perf') start(run.id, time());
    } catch (e) {
      if (timer) clearInterval(timer);
      ctx = null; timer = null;
    }
  }

  function resume() {
    try {
      if (ctx && ctx.state !== 'running' && ctx.resume) return ctx.resume().catch(() => {});
    } catch (e) { /* 무시 */ }
    return Promise.resolve();
  }

  const TRACKS = {};
  for (const k of Object.keys(DEF)) TRACKS[k] = { bpm: DEF[k].bpm, feel: DEF[k].feel };

  G.audio = {
    preload, init, resume, sfx,
    music: {
      start, stop, duck, time, beat, setLayer,
      playing: () => !!(run && run.alive),
      layer: () => layer,
      track: () => (run ? run.id : null),
    },
    TRACKS,
    latency,                       // 추정 출력 지연(초), 디버그용
    get ctx() { return ctx; },
  };
})();
