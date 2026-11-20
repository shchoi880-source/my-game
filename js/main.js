'use strict';
// 메인: 로딩, 장면 전환, 입력 라우팅, 루프 (docs/SPEC.md §4)
(() => {
  const G = window.G;
  const ctx = G.ctx;

  G.scenes = G.scenes || {};
  let scene = null, sceneName = '';
  G.go = (name, params) => {
    const s = G.scenes[name];
    if (!s) { console.warn('no scene', name); return; }
    scene = s; sceneName = name;
    if (s.enter) s.enter(params || {});
  };
  G.sceneName = () => sceneName;

  // ===== 로딩 =====
  const boot = { progress: 0, ready: false, t: 0 };
  G.boot = boot;
  (async () => {
    const tasks = [G.loadFx(), G.loadFont(), G.audio && G.audio.preload ? G.audio.preload() : Promise.resolve()];
    let done = 0;
    await Promise.all(tasks.map(p => Promise.resolve(p).catch(e => console.warn(e)).then(() => { done++; boot.progress = done / tasks.length; })));
    boot.ready = true;
    G.go('title');
  })();

  // ===== 입력 =====
  const toLogical = e => {
    const r = G.canvas.getBoundingClientRect();
    // 90° 돌려 그린 경우: 화면 아래쪽 = 논리 x+, 화면 왼쪽 = 논리 y+
    if (G.rotated) return { x: (e.clientY - r.top) / r.height * G.W, y: (r.right - e.clientX) / r.width * G.H };
    return { x: (e.clientX - r.left) / r.width * G.W, y: (e.clientY - r.top) / r.height * G.H };
  };
  let audioReady = false;
  const wakeAudio = () => {
    if (!G.audio) return;
    if (!audioReady) { G.audio.init(); audioReady = true; }
    G.audio.resume();
  };
  G.canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    wakeAudio();
    const p = toLogical(e);
    if (scene && scene.down) scene.down(p.x, p.y, e);
  });
  // 터치 기기에서는 pointerdown/touchstart 가 '사용자 활성화'가 아니라서(Chrome Android·iOS Safari)
  // AudioContext.resume()이 거부된다 → 손을 뗄 때(pointerup/touchend)도 오디오를 깨운다.
  G.canvas.addEventListener('touchend', wakeAudio, { passive: true });
  // ===== 앱 설치(PWA) =====
  // Chrome/삼성 인터넷: beforeinstallprompt 를 잡아뒀다가 타이틀의 '앱 설치' 버튼에서 띄움
  let deferred = null, installedNow = false;
  const mqs = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  G.pwa = {
    prompt: null,
    installed: () => installedNow || !!navigator.standalone || (mqs('(display-mode: fullscreen)') && !document.fullscreenElement) || mqs('(display-mode: standalone)'),
  };
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    G.pwa.prompt = () => {
      const d = deferred; if (!d) return;
      deferred = null; G.pwa.prompt = null;
      try { const r = d.prompt(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 무시 */ }
      if (d.userChoice) d.userChoice.then(r => { if (r && r.outcome === 'accepted') installedNow = true; }).catch(() => {});
    };
  });
  window.addEventListener('appinstalled', () => { installedNow = true; deferred = null; G.pwa.prompt = null; });

  // 안드로이드 등: 첫 터치 때 전체화면 + 가로 고정 시도(iPhone은 미지원 → 위의 90° 회전으로 처리)
  let lockTried = false;
  const tryLandscape = () => {
    if (G.noLandscapeOnce) { G.noLandscapeOnce = false; return; }
    if (lockTried || !G.isTouch()) return;
    lockTried = true;
    const so = screen.orientation;
    if (!so || !so.lock) return;
    const de = document.documentElement;
    const lock = () => so.lock('landscape').catch(() => {});
    if (document.fullscreenElement || !de.requestFullscreen) lock();
    else de.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
  };
  let persistAsked = false;
  window.addEventListener('pointerup', e => {
    if (!persistAsked) { persistAsked = true; G.requestPersist && G.requestPersist(); }
    if (e.pointerType !== 'mouse') { wakeAudio(); tryLandscape(); }
    const p = toLogical(e);
    if (scene && scene.up) scene.up(p.x, p.y, e);
  });
  window.addEventListener('pointermove', e => {
    if (scene && scene.move) { const p = toLogical(e); scene.move(p.x, p.y, e); }
  });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    wakeAudio();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (scene && scene.key) scene.key(e.code, true);
  });
  window.addEventListener('keyup', e => { if (scene && scene.key) scene.key(e.code, false); });
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (scene && scene.visibility) scene.visibility(!document.hidden);
    // 백그라운드로 가면 메뉴 음악까지 멈춤(폰에서 앱 전환 후 계속 울리는 문제), 돌아오면 재개 시도
    try {
      const ac = G.audio && G.audio.ctx;
      if (ac) { if (document.hidden) { if (ac.state === 'running' && ac.suspend) ac.suspend().catch(() => {}); } else if (audioReady) G.audio.resume(); }
    } catch (e) { /* 무시 */ }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ===== 루프 =====
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    boot.t += dt;
    ctx.setTransform(G.scale * G.dpr, 0, 0, G.scale * G.dpr, 0, 0);
    if (scene) {
      if (scene.update) scene.update(dt);
      scene.draw(ctx);
    } else {
      // 로딩 화면
      const W = G.W, H = G.H;
      ctx.fillStyle = '#070a1c';
      ctx.fillRect(0, 0, W, H);
      G.text('NEON JUMP', W / 2, H / 2 - 30, 48, '#29f0ff');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; G.rr(W / 2 - 160, H / 2 + 30, 320, 10, 5); ctx.fill();
      ctx.fillStyle = '#29f0ff'; G.rr(W / 2 - 160, H / 2 + 30, Math.max(10, 320 * boot.progress), 10, 5); ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
