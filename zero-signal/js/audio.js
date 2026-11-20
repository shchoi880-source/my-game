(() => {
  'use strict';
  // ZERO SIGNAL audio: look-ahead beat scheduler (per-mission tracks with section layers),
  // pitched SFX, separate music/sfx buses -> master -> compressor, iOS unlock + lifecycle.
  //
  // Public API (G.audio):
  //   init()                 unlock/resume the context (safe to call on every gesture)
  //   start(missionId?)      with an id: start that mission's track fresh (layer 0).
  //                          without: resume the current track on the beat grid (after pause),
  //                          or use the play scene's mission (fallback 'echo') if none is loaded.
  //   stop()                 pause music (grid position kept so start() continues in time)
  //   setSection(i)          0..4, each section adds a layer (pad, +bass, +kick/hat, +arp, +snare)
  //   setOverdrive(bool)     open filter + octave arp
  //   setDanger(bool)        1 shield left: heartbeat replaces the hats
  //   duck(depth?, hold?)    music dip + muffle (sfx('hit') does this itself)
  //   bossPhase()            dissonant sting
  //   sfx(name, opt)         click ready graze({combo}) flow({combo}|{mult}) dash
  //                          dashThrough (alias phase) shield (alias repair) hit overdrive
  //                          section complete dead boss
  //   setMuted()             re-read G.save.data.sfx / .music (separate buses)
  // While a track plays it also reads (never writes) G.scenes.play.engine when it belongs to the
  // same mission, so layers / overdrive / danger / pre-boundary risers work without explicit calls.
  // Set G.audio.autoSync = false to drive everything through the setters only.
  const G = (window.G = window.G || {});
  const flag = (k) => {
    try {
      return G.save.data[k] !== false;
    } catch (e) {
      return true;
    }
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const MUSIC_VOL = 0.55,
    SFX_VOL = 0.9,
    LOOKAHEAD = 0.12,
    LOOKAHEAD_HIDDEN = 1.0,
    TICK_MS = 25,
    GRAZE_GAP = 0.045;

  // scale = mode intervals, prog = chord-root scale degree per bar, arp = degrees above chord root
  const TRACKS = {
    echo: { bpm: 112, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 4], arp: [0, 2, 4, 7, 4, 2], wave: 'triangle' },
    fracture: { bpm: 128, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], arp: [0, 4, 2, 7, 4, 9], wave: 'square' },
    zero: { bpm: 148, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 6], arp: [0, 2, 1, 4, 7, 4, 2, 8], wave: 'sawtooth' },
  };
  const PENTA = { root: 60, scale: [0, 2, 4, 7, 9] };

  let ac = null,
    master = null,
    musicBus = null,
    duckGain = null,
    gate = null,
    mFilter = null,
    sfxBus = null,
    noiseBuf = null,
    timer = 0,
    unlocked = false,
    playing = false,
    trackId = null,
    tr = null,
    step = 0,
    nextT = 0,
    layer = 0,
    pendingLayer = -1,
    layerStep = -1,
    od = false,
    danger = false,
    sweptFor = -1,
    lastGraze = -1,
    muffleUntil = 0;
  const live = []; // scheduled music sources {n, e}

  const ensure = () => {
    if (ac) return ac;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      ac = new C();
    } catch (e) {
      return null;
    }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ac.destination);
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    // music voices -> mFilter -> duckGain -> gate -> musicBus -> master
    musicBus = ac.createGain();
    musicBus.connect(master);
    gate = ac.createGain();
    gate.gain.value = 0;
    gate.connect(musicBus);
    duckGain = ac.createGain();
    duckGain.connect(gate);
    mFilter = ac.createBiquadFilter();
    mFilter.type = 'lowpass';
    mFilter.frequency.value = 5200;
    mFilter.Q.value = 0.6;
    mFilter.connect(duckGain);
    sfxBus = ac.createGain();
    sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyMute(true);
    return ac;
  };
  const filterBase = () => (od ? 12000 : 5200);
  function applyMute(instant) {
    if (!ac) return;
    const t = ac.currentTime,
      k = instant ? 0.001 : 0.05;
    musicBus.gain.setTargetAtTime(flag('music') ? MUSIC_VOL : 0, t, k);
    sfxBus.gain.setTargetAtTime(flag('sfx') ? SFX_VOL : 0, t, k);
  }

  // ---------- voices ----------
  // oscillator voice. fs = freqs; o = {type, v, a, dur, sus, rel, cut, env, q, slide, sd, det, music}
  function osc(t, fs, o) {
    const g = ac.createGain(),
      a = o.a || 0.004,
      dur = o.dur || 0.1,
      v = Math.max(0.0002, o.v);
    let into = g;
    if (o.cut) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(Math.min(18000, o.cut * (o.env || 1)), t);
      if (o.env) f.frequency.exponentialRampToValueAtTime(o.cut, t + Math.min(0.25, dur));
      f.connect(g);
      into = f;
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    let end;
    if (o.sus) {
      g.gain.setValueAtTime(v, t + Math.max(a, dur - (o.rel || 0.1)));
      g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
      end = t + dur + 0.02;
    } else {
      g.gain.exponentialRampToValueAtTime(0.0002, t + a + dur);
      end = t + a + dur + 0.02;
    }
    g.connect(o.music ? mFilter : sfxBus);
    const n = o.det ? 2 : 1;
    for (const f of fs)
      for (let j = 0; j < n; j++) {
        const s = ac.createOscillator();
        s.type = o.type || 'sine';
        s.frequency.setValueAtTime(f, t);
        if (o.slide) s.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + (o.sd || dur));
        if (o.det) s.detune.setValueAtTime(j ? o.det : -o.det, t);
        s.connect(into);
        s.start(t);
        s.stop(end);
        if (o.music) live.push({ n: s, e: end });
      }
    return end;
  }
  // filtered noise voice. o = {q, f1 (filter end freq), a, music}
  function nz(t, dur, v, type, f, o = {}) {
    const s = ac.createBufferSource(),
      flt = ac.createBiquadFilter(),
      g = ac.createGain(),
      a = o.a || 0.001;
    s.buffer = noiseBuf;
    s.loop = true;
    flt.type = type;
    flt.Q.value = o.q || 0.8;
    flt.frequency.setValueAtTime(f, t);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(0.0002, t + Math.max(dur, a + 0.01));
    s.connect(flt);
    flt.connect(g);
    g.connect(o.music ? mFilter : sfxBus);
    const end = t + Math.max(dur, a + 0.01) + 0.02;
    s.start(t, Math.random() * 0.8);
    s.stop(end);
    if (o.music) live.push({ n: s, e: end });
    return end;
  }

  // ---------- music ----------
  const sd = () => 60 / tr.bpm / 4; // one 16th
  const deg = (d, sc = tr.scale) => sc[((d % sc.length) + sc.length) % sc.length] + 12 * Math.floor(d / sc.length);
  const keyOff = (k) => (((k.root % 12) + 6) % 12) - 6; // -6..5 semitones from C
  const M = { music: true };
  const kick = (t, v = 0.55, f0 = 150) => osc(t, [f0], { ...M, v, dur: 0.24, slide: 0.3, sd: 0.12 });
  const hat = (t, v = 0.045, dur = 0.035) => nz(t, dur, v, 'highpass', 7500, M);
  const snare = (t) => {
    nz(t, 0.14, 0.16, 'bandpass', 1900, { ...M, q: 0.7 });
    osc(t, [190], { ...M, type: 'triangle', v: 0.1, dur: 0.08, slide: 0.6 });
  };
  function playStep(s, t) {
    const pos = s & 15;
    if (s === layerStep && layer >= 2) hat(t, 0.06, 0.3); // small cymbal when a layer enters
    const bar = s >> 4,
      cd = tr.prog[bar % tr.prog.length],
      root = tr.root + deg(cd),
      L = layer;
    // L0 pad: chord on the bar, slow swell
    if (pos === 0) {
      const ch = [0, 2, 4].map((k) => mtof(tr.root + 12 + deg(cd + k)));
      osc(t, ch, { ...M, type: 'sawtooth', v: 0.028, a: 0.35, dur: sd() * 16, rel: 0.4, sus: 1, cut: 900 + L * 220, det: 7 });
    }
    // L1 bass: offbeat pluck (+16th push on the fast track) and a sub on the downbeat
    if (L >= 1 && (pos % 4 === 2 || (tr.bpm > 140 && pos % 4 === 3)))
      osc(t, [mtof(root - 12)], { ...M, type: 'sawtooth', v: 0.1, dur: 0.16, cut: 420, env: 2.5, q: 2 });
    if (L >= 1 && pos === 0) osc(t, [mtof(root - 12)], { ...M, v: 0.16, dur: 0.3 });
    // L2 kick/hat, or the heartbeat when one shield is left
    if (danger) {
      if (pos === 0 || pos === 8) kick(t, 0.42, 95);
      if (pos === 2 || pos === 10) kick(t, 0.28, 85);
    } else {
      if (L >= 2 && pos % 4 === 0) kick(t);
      if (L >= 2 && pos % 2 === 1) hat(t, pos % 4 === 3 ? 0.05 : 0.03);
    }
    // L3 arp (filter opens in overdrive)
    if (L >= 3 && pos % 2 === 0) {
      const a = tr.arp[(s >> 1) % tr.arp.length];
      osc(t, [mtof(tr.root + 12 + deg(cd + a))], { ...M, type: tr.wave, v: 0.035, dur: 0.14, cut: od ? 8000 : 2400, env: 1.5 });
    }
    // overdrive: octave-up 16th arp
    if (od && pos % 2 === 1) {
      const a = tr.arp[(s * 3) % tr.arp.length];
      osc(t, [mtof(tr.root + 24 + deg(cd + a))], { ...M, type: 'square', v: 0.018, dur: 0.07, cut: 8000 });
    }
    // L4 snare + open hat
    if (L >= 4 && (pos === 4 || pos === 12)) snare(t);
    if (L >= 4 && pos === 14 && !danger) hat(t, 0.05, 0.16);
  }
  function riser(t, dur) {
    nz(t, dur, 0.07, 'bandpass', 400, { ...M, f1: 7000, q: 2.2, a: dur * 0.85 });
  }
  function sync() {
    if (!G.audio.autoSync) return;
    const e = G.scenes && G.scenes.play && G.scenes.play.engine;
    if (!e || !e.mission || e.mission.id !== trackId) return;
    try {
      const si = Math.max(0, Math.min(4, e.sectionIndex | 0));
      if (si !== (pendingLayer >= 0 ? pendingLayer : layer)) G.audio.setSection(si);
      G.audio.setOverdrive(e.overdrive > 0);
      G.audio.setDanger(!e.dead && !e.done && !!e.player && e.player.shields === 1);
      const nx = e.timeline && e.timeline.sections && e.timeline.sections[e.sectionIndex + 1];
      if (nx && sweptFor !== e.sectionIndex + 1) {
        const left = nx.t - e.time;
        if (left > 0.2 && left <= sd() * 16) {
          sweptFor = e.sectionIndex + 1;
          riser(Math.max(ac.currentTime, nextT), left); // 1-bar sweep into the boundary
        }
      }
    } catch (err) {
      /* engine shape changed: ignore */
    }
  }
  function schedule() {
    if (!playing || !ac || !tr) return;
    sync();
    const now = ac.currentTime,
      ahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    if (nextT < now - 0.15) nextT = now + 0.03; // timer stalled: skip ahead, keep the step count
    const on = flag('music');
    while (nextT < now + ahead) {
      if (pendingLayer >= 0 && step % 4 === 0) {
        layer = pendingLayer; // new layers enter on the next beat
        pendingLayer = -1;
        layerStep = step;
      }
      if (on) playStep(step, nextT);
      nextT += sd();
      step++;
    }
    for (let i = live.length - 1; i >= 0; i--) if (live[i].e < now) live.splice(i, 1);
  }
  function killMusic(fade = 0.06) {
    if (!ac) return;
    const t = ac.currentTime;
    gate.gain.cancelScheduledValues(t);
    gate.gain.setTargetAtTime(0, t, fade / 3);
    for (const v of live)
      try {
        v.n.stop(t + fade + 0.02);
      } catch (e) {
        /* already stopped */
      }
    live.length = 0;
  }

  // ---------- sfx ----------
  const P = (t, f, o) => osc(t, [f], o);
  const now = () => ac.currentTime + 0.005;
  const SFX = {
    click: () => P(now(), 1300, { type: 'square', v: 0.05, dur: 0.03, cut: 5000 }),
    ready: () => {
      const t = now();
      P(t, 880, { type: 'triangle', v: 0.05, dur: 0.06 });
      P(t + 0.05, 1320, { type: 'triangle', v: 0.05, dur: 0.1 });
    },
    // pitch snaps to the track's scale and climbs with combo, capped at 2 octaves; >=45ms apart
    graze: (o) => {
      const t = ac.currentTime;
      if (lastGraze >= 0 && t - lastGraze < GRAZE_GAP && t >= lastGraze) return;
      lastGraze = t;
      const k = tr || PENTA,
        sc = k.scale,
        c = Math.max(0, Math.min(sc.length * 2, (o && o.combo) | 0)),
        m = 72 + keyOff(k) + sc[c % sc.length] + 12 * Math.floor(c / sc.length);
      P(t + 0.003, mtof(m), { type: 'triangle', v: 0.045, dur: 0.03 });
      P(t + 0.003, mtof(m + 12), { type: 'sine', v: 0.012, dur: 0.025 });
    },
    // combo milestone: 3-note arpeggio in the multiplier's chord (x2..x5)
    flow: (o = {}) => {
      const c = o.combo | 0,
        mult = o.mult || (c >= 100 ? 5 : c >= 50 ? 4 : c >= 25 ? 3 : 2),
        k = tr || PENTA,
        t = now(),
        d0 = (mult - 2) * 2;
      [0, 2, 4].forEach((d, i) =>
        P(t + i * 0.055, mtof(72 + keyOff(k) + deg(d0 + d, k.scale)), { type: 'square', v: 0.04, dur: 0.16, cut: 4500, env: 1.5 }),
      );
      P(t + 0.165, mtof(84 + keyOff(k) + deg(d0, k.scale)), { type: 'triangle', v: 0.05, dur: 0.35 });
      nz(t + 0.1, 0.25, 0.025, 'highpass', 6000);
    },
    dash: () => {
      const t = now();
      P(t, 160, { type: 'sawtooth', v: 0.06, dur: 0.15, slide: 3, cut: 2500 });
      nz(t, 0.14, 0.06, 'bandpass', 600, { f1: 4000, q: 1.2 });
    },
    dashThrough: () => P(now(), 2400 + Math.random() * 400, { type: 'sine', v: 0.016, dur: 0.025 }),
    shield: () => {
      const t = now();
      P(t, 784, { type: 'triangle', v: 0.07, dur: 0.12 });
      P(t + 0.09, 1175, { type: 'triangle', v: 0.07, dur: 0.35 });
      P(t + 0.09, 2350, { type: 'sine', v: 0.02, dur: 0.3 });
    },
    hit: () => {
      const t = now();
      P(t, 110, { type: 'sawtooth', v: 0.12, dur: 0.22, slide: 0.45, cut: 1600 });
      P(t, 60, { v: 0.3, dur: 0.25, slide: 0.6 });
      nz(t, 0.16, 0.1, 'lowpass', 2500, { f1: 300 });
      G.audio.duck();
    },
    overdrive: () => {
      const t = now(),
        k = tr || PENTA;
      [0, 2, 4, 7].forEach((d, i) =>
        P(t + i * 0.05, mtof(64 + keyOff(k) + deg(d, k.scale)), { type: 'sawtooth', v: 0.04, dur: 0.2, cut: 6000, env: 0.5 }),
      );
      nz(t, 0.5, 0.05, 'bandpass', 800, { f1: 8000, q: 1.5, a: 0.3 });
    },
    section: () => {
      const t = now();
      P(t, 520, { type: 'triangle', v: 0.05, dur: 0.22, slide: 1.8 });
      nz(t, 0.35, 0.035, 'highpass', 3000, { f1: 9000 });
    },
    complete: () => {
      const t = now(),
        k = tr || PENTA;
      [0, 2, 4, 7, 9, 11, 14].forEach((d, i) =>
        P(t + i * 0.07, mtof(72 + keyOff(k) + deg(d, k.scale)), { type: 'triangle', v: 0.06, dur: 0.4 }),
      );
    },
    dead: () => {
      const t = now();
      if (playing) {
        // pitch the running music down and fade it, then stop scheduling
        for (const v of live)
          try {
            if (v.n.detune) v.n.detune.setTargetAtTime(-1200, t, 0.3);
            else v.n.playbackRate.setTargetAtTime(0.5, t, 0.3);
          } catch (e) {
            /* ignore */
          }
        playing = false;
        clearInterval(timer);
        gate.gain.cancelScheduledValues(t);
        gate.gain.setTargetAtTime(0, t + 0.15, 0.25);
      }
      P(t, 180, { type: 'sawtooth', v: 0.1, dur: 0.6, slide: 0.2, cut: 2000 });
      nz(t, 0.45, 0.09, 'lowpass', 4000, { f1: 150 });
    },
    boss: () => {
      const t = now(),
        r = tr ? tr.root : 40;
      osc(t, [mtof(r - 12), mtof(r - 11), mtof(r + 6)], { type: 'sawtooth', v: 0.06, a: 0.01, dur: 1.1, cut: 1400, env: 3, det: 12 });
      P(t, 70, { v: 0.35, dur: 0.6, slide: 0.5 });
      nz(t, 0.8, 0.08, 'lowpass', 3000, { f1: 200 });
      G.audio.duck(0.5, 0.9);
    },
  };
  SFX.phase = SFX.dashThrough;
  SFX.repair = SFX.shield;

  // ---------- unlock & lifecycle (iOS/Safari) ----------
  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {}); // also covers iOS 'interrupted'
    if (!unlocked) {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // iOS 17+: 무음 스위치 존중, 다른 앱 음악을 끊지 않음
      } catch (e) {
        /* unsupported */
      }
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050); // 1-sample silent buffer unlocks iOS output
      s.connect(c.destination);
      s.start(0);
      unlocked = true;
    }
  }
  // first gesture of any kind (incl. keyboard mission start) unlocks the context
  ['pointerdown', 'touchend', 'keydown'].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
  const wake = () => {
    if (ac && !document.hidden && ac.state !== 'running') ac.resume().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else wake();
  });
  addEventListener('pageshow', wake);
  addEventListener('focus', wake);

  G.audio = {
    autoSync: true,
    init() {
      unlock();
    },
    sfx(n, opt) {
      if (!flag('sfx') || !SFX[n] || !ensure()) return;
      try {
        SFX[n](opt);
      } catch (e) {
        /* audio must never break the game loop */
      }
    },
    start(id) {
      unlock();
      if (!ac) return;
      if (typeof id === 'string' || !tr) {
        if (typeof id !== 'string') {
          const m = G.scenes && G.scenes.play && G.scenes.play.mission;
          id = m && m.id;
        }
        trackId = TRACKS[id] ? id : 'echo';
        tr = TRACKS[trackId];
        step = 0;
        layer = 0;
        pendingLayer = -1;
        od = false;
        danger = false;
        sweptFor = -1;
      }
      if (playing) return;
      killMusic(0.01);
      const t = ac.currentTime;
      nextT = t + 0.06; // step is kept across stop(), so a resume continues the bar
      gate.gain.cancelScheduledValues(t);
      gate.gain.setValueAtTime(0, t);
      gate.gain.linearRampToValueAtTime(1, t + 0.15);
      mFilter.frequency.cancelScheduledValues(t);
      mFilter.frequency.setValueAtTime(filterBase(), t);
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setValueAtTime(1, t);
      playing = true;
      clearInterval(timer);
      schedule();
      timer = setInterval(schedule, TICK_MS);
    },
    stop() {
      playing = false;
      clearInterval(timer);
      timer = 0;
      killMusic();
    },
    setSection(i) {
      const n = Math.max(0, Math.min(4, i | 0));
      if (n === layer && pendingLayer < 0) return;
      if (n <= layer) {
        layer = n;
        pendingLayer = -1;
      } else pendingLayer = n;
    },
    setOverdrive(on) {
      on = !!on;
      if (on === od) return;
      od = on;
      if (ac && ac.currentTime >= muffleUntil)
        mFilter.frequency.setTargetAtTime(filterBase(), ac.currentTime, on ? 0.05 : 0.4);
    },
    setDanger(on) {
      danger = !!on;
    },
    duck(depth = 0.25, hold = 0.4) {
      if (!ac) return;
      const t = ac.currentTime;
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setTargetAtTime(depth, t, 0.012);
      duckGain.gain.setTargetAtTime(1, t + hold, 0.15);
      mFilter.frequency.cancelScheduledValues(t);
      mFilter.frequency.setTargetAtTime(650, t, 0.01);
      mFilter.frequency.setTargetAtTime(filterBase(), t + 0.06, 0.12);
      muffleUntil = t + 0.4;
    },
    bossPhase() {
      this.sfx('boss');
    },
    setMuted() {
      ensure();
      applyMute(false);
    },
    get state() {
      return { ctx: ac && ac.state, playing, track: trackId, step, layer, od, danger };
    },
    tracks: TRACKS,
  };
})();
