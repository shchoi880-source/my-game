'use strict';
// 사운드: Kenney 효과음(ogg) + 합성음 대체, 절차적 배경음악
(() => {
  const MD = window.MD;
  let ac = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
  const bufs = {}, raw = {}, last = {};

  const SFX_NAMES = ['shoot_pistol', 'shoot_smg', 'shoot_rifle', 'shoot_shotgun', 'hit', 'kill', 'kill2', 'explode', 'explode2', 'bigboom', 'crate', 'hurt', 'slam', 'shield', 'laser', 'fire', 'good', 'bad', 'click', 'back', 'open', 'confirm', 'error', 'coin', 'select', 'metal'];

  function decode(name, data) {
    try {
      const p = ac.decodeAudioData(data, b => { bufs[name] = b; }, () => { /* 지원 안 하면 합성음 */ });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 무시 */ }
  }

  function init() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfxGain = ac.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
      musicGain = ac.createGain(); musicGain.gain.value = 0.2; musicGain.connect(master);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      for (const n of Object.keys(raw)) { decode(n, raw[n]); delete raw[n]; }
      if (curSong) { nextTime = ac.currentTime + 0.1; ensureTimer(); }
    } catch (e) { ac = null; }
  }

  async function preload(onEach) {
    await Promise.all(SFX_NAMES.map(async n => {
      try {
        const r = await fetch('assets/sfx/' + n + '.ogg');
        const data = await r.arrayBuffer();
        if (ac) decode(n, data); else raw[n] = data;
      } catch (e) { /* 오프라인 첫 실행 등 */ }
      if (onEach) onEach();
    }));
  }

  function throttled(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return true;
    last[key] = now;
    return false;
  }

  function play(name, vol, rate) {
    if (!ac || !MD.save.sfx) return true; // 소리 꺼짐: 합성음도 재생하지 않음
    const b = bufs[name];
    if (!b) return false;
    const src = ac.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate || 1;
    const g = ac.createGain();
    g.gain.value = vol == null ? 1 : vol;
    src.connect(g); g.connect(sfxGain);
    src.start();
    return true;
  }

  function tone(freq, dur, type, vol, slide, delay, dest) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    toneAt(t, freq, dur, type, vol, slide, dest || sfxGain);
  }
  function toneAt(t, freq, dur, type, vol, slide, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noiseAt(t, dur, vol, type, freq, dest) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq || 1500, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const sfxOn = () => ac && MD.save.sfx;

  // ===== 효과음 API =====
  const S = {
    init,
    preload,
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },
    shoot(name) { if (throttled('shoot', 95)) return; if (!play(name, 0.22, MD.rand(0.95, 1.08)) && sfxOn()) tone(900, 0.035, 'square', 0.025, 0.5); },
    hit() { if (throttled('hit', 70)) return; if (!play('hit', 0.35, MD.rand(0.9, 1.2)) && sfxOn()) tone(240, 0.05, 'triangle', 0.05, 0.6); },
    kill() { if (throttled('kill', 50)) return; if (!play(Math.random() < 0.5 ? 'kill' : 'kill2', 0.5, MD.rand(0.9, 1.25)) && sfxOn()) tone(520, 0.09, 'square', 0.06, 1.9); },
    explode() { if (throttled('explode', 80)) return; if (!play(Math.random() < 0.5 ? 'explode' : 'explode2', 0.7) && sfxOn()) noiseAt(ac.currentTime, 0.5, 0.4, 'lowpass', 1200, sfxGain); },
    bigboom() { if (!play('bigboom', 1.0) && sfxOn()) { noiseAt(ac.currentTime, 1, 0.6, 'lowpass', 900, sfxGain); tone(70, 0.8, 'sine', 0.4, 0.3); } },
    crate() { if (!play('crate', 0.8) && sfxOn()) noiseAt(ac.currentTime, 0.2, 0.3, 'bandpass', 800, sfxGain); },
    hurt() { if (throttled('hurt', 120)) return; if (!play('hurt', 0.7) && sfxOn()) tone(110, 0.25, 'sawtooth', 0.1, 0.5); },
    slam() { if (!play('slam', 1.0, 0.7) && sfxOn()) tone(60, 0.4, 'sine', 0.3, 0.5); },
    shield() { if (!play('shield', 0.8) && sfxOn()) tone(300, 0.6, 'sine', 0.15, 2); },
    laser() { if (!play('laser', 0.8, 0.8) && sfxOn()) tone(200, 0.6, 'sawtooth', 0.1, 3); },
    fire() { if (throttled('fire', 100)) return; if (!play('fire', 0.6) && sfxOn()) noiseAt(ac.currentTime, 0.3, 0.2, 'bandpass', 2500, sfxGain); },
    good() { if (!play('good', 0.7) && sfxOn()) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.07, 1, i * 0.05)); },
    bad() { if (!play('bad', 0.7) && sfxOn()) [392, 311, 233].forEach((f, i) => tone(f, 0.16, 'sawtooth', 0.07, 1, i * 0.07)); },
    click() { if (!play('click', 0.6) && sfxOn()) tone(660, 0.05, 'square', 0.05); },
    back() { if (!play('back', 0.6) && sfxOn()) tone(440, 0.06, 'square', 0.05); },
    open() { if (!play('open', 0.6) && sfxOn()) tone(520, 0.08, 'triangle', 0.08, 1.5); },
    confirm() { if (!play('confirm', 0.7) && sfxOn()) [660, 880].forEach((f, i) => tone(f, 0.1, 'square', 0.06, 1, i * 0.06)); },
    error() { if (!play('error', 0.6) && sfxOn()) tone(160, 0.2, 'square', 0.08); },
    coin() { if (throttled('coin', 60)) return; if (sfxOn()) { tone(1320, 0.05, 'square', 0.03); tone(1760, 0.08, 'square', 0.03, 1, 0.05); } },
    select() { if (!play('select', 0.6) && sfxOn()) tone(780, 0.06, 'square', 0.05); },
    metal() { if (!play('metal', 0.6) && sfxOn()) tone(300, 0.1, 'square', 0.08); },
    warn() { if (!sfxOn()) return; for (let i = 0; i < 4; i++) { tone(440, 0.22, 'sawtooth', 0.08, 1.6, i * 0.4); tone(330, 0.18, 'square', 0.05, 1, i * 0.4 + 0.2); } },
    roar() { if (!sfxOn()) return; noiseAt(ac.currentTime, 1.2, 0.35, 'lowpass', 500, sfxGain); tone(90, 1.0, 'sawtooth', 0.12, 0.6); tone(60, 1.2, 'square', 0.08, 0.7); },
    star(i) { if (sfxOn()) { const f = [784, 988, 1318][i] || 1318; tone(f, 0.25, 'triangle', 0.15); tone(f * 2, 0.2, 'sine', 0.06, 1, 0.03); } },
    levelup() { if (sfxOn()) [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 1, i * 0.05)); },
    win() { if (sfxOn()) [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.14, 'square', 0.07, 1, i * 0.1)); },
    lose() { if (sfxOn()) [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 1, i * 0.2)); },
    skill() { if (sfxOn()) { tone(300, 0.4, 'sawtooth', 0.08, 4); noiseAt(ac.currentTime, 0.4, 0.15, 'highpass', 3000, sfxGain); } },
  };

  // ===== 배경음악 (절차적 시퀀서) =====
  // chords: [근음(반음), 단조?] 마디별 / 패턴은 16스텝
  const SONGS = {
    menu: { bpm: 100, base: 57, chords: [[0, 0], [5, 0], [7, 0], [0, 0]], bass: 'x...x...x...x.x.', arp: 'x.x.x.x.x.x.x.x.', lead: '', kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', arpWave: 'triangle' },
    w1: { bpm: 128, base: 55, chords: [[0, 0], [9, 1], [5, 0], [7, 0]], bass: 'x.x.x.x.x.x.x.x.', arp: 'xxxxxxxxxxxxxxxx', lead: 'x..x..x.x.x.....', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', arpWave: 'square' },
    w2: { bpm: 120, base: 52, chords: [[0, 1], [8, 0], [3, 0], [10, 0]], bass: 'x..x..x.x..x..x.', arp: 'x.xx.xx.x.xx.xx.', lead: 'x...x.x...x.x...', kick: 'x..x..x.x..x....', snare: '....x.......x...', hat: '.xx..xx..xx..xx.', arpWave: 'square' },
    w3: { bpm: 112, base: 59, chords: [[0, 1], [5, 1], [10, 0], [3, 0]], bass: 'x.......x...x...', arp: 'x.x.x.x.x.x.x.x.', lead: 'x.....x.....x...', kick: 'x.......x.......', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', arpWave: 'triangle' },
    w4: { bpm: 140, base: 50, chords: [[0, 1], [0, 1], [8, 0], [7, 0]], bass: 'xxx.xxx.xxx.x.x.', arp: 'x.x.xx.xx.x.xx.x', lead: 'x..x..x...x.x...', kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', arpWave: 'sawtooth' },
    boss: { bpm: 150, base: 50, chords: [[0, 1], [1, 0], [0, 1], [10, 0]], bass: 'xxxxxxxxxxxxxxxx', arp: 'x.xxx.xxx.xxx.xx', lead: 'x.x.x...x.x.x...', kick: 'x.x.x.x.x.x.x.x.', snare: '....x..x....x.xx', hat: 'xxxxxxxxxxxxxxxx', arpWave: 'sawtooth' },
  };
  const ARP_ORDER = [0, 1, 2, 1, 0, 2, 1, 2];
  const LEAD_ORDER = [2, 1, 0, 1, 2, 2, 1, 0, 2, 3, 2, 1];
  let curSong = null, step = 0, nextTime = 0, timer = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function ensureTimer() { if (!timer) timer = setInterval(tick, 25); }

  function scheduleStep(i, t) {
    const song = SONGS[curSong];
    if (!song) return;
    const spb = 60 / song.bpm / 4;
    const s = i % 16, bar = Math.floor(i / 16) % song.chords.length;
    const [root, minor] = song.chords[bar];
    const tones = minor ? [0, 3, 7, 10] : [0, 4, 7, 11];
    const base = song.base + root;
    if (song.bass[s] === 'x') toneAt(t, mtof(base - 12), spb * 1.6, 'triangle', 0.32, 0, musicGain);
    if (song.arp[s] === 'x') toneAt(t, mtof(base + 12 + tones[ARP_ORDER[s % ARP_ORDER.length]]), spb * 0.9, song.arpWave, 0.06, 0, musicGain);
    if (song.lead && song.lead[s] === 'x' && bar % 2 === 1) {
      const k = LEAD_ORDER[(Math.floor(i / 16) * 5 + s) % LEAD_ORDER.length];
      toneAt(t, mtof(base + 24 + tones[k]), spb * 2.2, 'square', 0.04, 0, musicGain);
    }
    if (song.kick[s] === 'x') toneAt(t, 150, 0.16, 'sine', 0.5, 0.25, musicGain);
    if (song.snare[s] === 'x') noiseAt(t, 0.12, 0.22, 'highpass', 1500, musicGain);
    if (song.hat[s] === 'x') noiseAt(t, 0.035, 0.06, 'highpass', 7000, musicGain);
  }

  function tick() {
    if (!ac || !curSong) return;
    const song = SONGS[curSong];
    const spb = 60 / song.bpm / 4;
    if (!MD.save.music) { nextTime = ac.currentTime + 0.1; return; }
    if (nextTime < ac.currentTime - 0.5) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + 0.12) {
      scheduleStep(step, nextTime);
      nextTime += spb;
      step++;
    }
  }

  S.music = id => {
    if (curSong === id) return;
    curSong = id;
    step = 0;
    if (ac) { nextTime = ac.currentTime + 0.15; ensureTimer(); }
  };
  S.stopMusic = () => { curSong = null; };

  MD.sfx = S;
})();
