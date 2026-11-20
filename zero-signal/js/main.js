(() => {
  'use strict';
  const G = window.G;
  let scene = null,
    last = performance.now();
  G.go = (name, param = {}) => {
    scene = G.scenes[name];
    if (!scene) throw Error(`scene not found: ${name}`);
    scene.enter?.(param);
  };
  // [input] 화면 좌표 → 논리 좌표. 90° 회전(G.rotated)이면 화면 아래 = 논리 x+, 화면 왼쪽 = 논리 y+.
  // 반환값은 장면 좌표(0..1280, 여백 G.AX 를 뺀 값). 화면 기준 좌표는 x + G.AX.
  function point(e) {
    const r = G.canvas.getBoundingClientRect();
    const p = G.rotated
      ? { x: ((e.clientY - r.top) / r.height) * G.VW, y: ((r.right - e.clientX) / r.width) * 720 }
      : { x: ((e.clientX - r.left) / r.width) * G.VW, y: ((e.clientY - r.top) / r.height) * 720 };
    p.x -= G.AX;
    return p;
  }
  G.toLogical = point;
  // 여백(gutter): 장면 바깥 좌우를 게임 배경과 이어지게 칠함
  function gutters(c) {
    const ax = G.AX;
    c.fillStyle = '#03050b';
    c.fillRect(0, 0, G.VW, 720);
    if (ax < 1) return;
    for (const [x0, dir] of [
      [ax, -1],
      [G.VW - ax, 1],
    ]) {
      const g = c.createLinearGradient(x0, 0, x0 + dir * ax, 0);
      g.addColorStop(0, '#070b1a');
      g.addColorStop(1, '#03050b');
      c.fillStyle = g;
      c.fillRect(Math.min(x0, x0 + dir * ax), 0, ax, 720);
      c.fillStyle = 'rgba(77,238,234,.05)';
      for (let y = 18; y < 720; y += 36)
        for (let x = x0 + dir * 18; dir < 0 ? x > 0 : x < G.VW; x += dir * 36) c.fillRect(x - 1, y - 1, 2, 2);
      c.fillStyle = 'rgba(77,238,234,.16)';
      c.fillRect(x0 - (dir < 0 ? 1 : 0), 0, 1, 720);
    }
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    scene?.update?.(dt);
    const c = G.ctx,
      k = G.scale * G.dpr;
    c.setTransform(k, 0, 0, k, 0, 0);
    gutters(c);
    c.save();
    c.translate(G.AX, 0);
    scene?.draw?.(c);
    c.restore();
    G.drawToast?.(c, dt);
    requestAnimationFrame(frame);
  }
  addEventListener('resize', G.resize, { passive: true });
  // 일부 iOS 는 회전 직후 innerWidth/Height 가 옛 값 → 잠시 뒤 한 번 더
  addEventListener('orientationchange', () => setTimeout(G.resize, 300), { passive: true });
  if (window.visualViewport) visualViewport.addEventListener('resize', G.resize, { passive: true });
  document.addEventListener('fullscreenchange', () => setTimeout(G.resize, 50));
  // 게임 중 화면 회전·크기 변경 → 일시정지
  G.onResize(() => scene?.resized?.());

  // [pwa] Chrome/삼성 인터넷: beforeinstallprompt 를 잡아뒀다가 타이틀의 '앱 설치' 버튼에서 띄움
  let deferred = null,
    installedNow = false;
  G.pwa = {
    prompt: null,
    installed: () =>
      installedNow ||
      !!navigator.standalone ||
      (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement) ||
      matchMedia('(display-mode: standalone)').matches,
  };
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    G.pwa.prompt = () => {
      const d = deferred;
      if (!d) return;
      deferred = null;
      G.pwa.prompt = null;
      try {
        d.prompt()?.catch?.(() => {});
      } catch {}
      d.userChoice
        ?.then((r) => {
          if (r?.outcome === 'accepted') installedNow = true;
        })
        .catch(() => {});
    };
  });
  addEventListener('appinstalled', () => {
    installedNow = true;
    deferred = null;
    G.pwa.prompt = null;
  });
  // 안드로이드 등: 첫 터치 때 전체화면 + 가로 고정 시도 (iPhone 은 미지원 → 90° 회전으로 처리)
  let lockTried = false,
    persistAsked = false;
  const tryLandscape = () => {
    if (lockTried || !G.isTouch()) return;
    lockTried = true;
    const so = screen.orientation,
      de = document.documentElement;
    if (!so?.lock) return;
    const lock = () => so.lock('landscape').catch(() => {});
    if (document.fullscreenElement || !de.requestFullscreen) lock();
    else de.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
  };
  // 터치 기기는 pointerdown 이 '사용자 활성화'가 아니라 AudioContext.resume 이 거부됨 → 손 뗄 때도 깨움
  const wakeAudio = () => G.audio?.init?.();
  G.canvas.addEventListener('touchend', wakeAudio, { passive: true });

  G.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    G.canvas.setPointerCapture?.(e.pointerId);
    const p = point(e);
    scene?.down?.(p.x, p.y, e.pointerId, e.pointerType);
  });
  G.canvas.addEventListener('pointermove', (e) => {
    const p = point(e);
    scene?.move?.(p.x, p.y, e.pointerId, e.pointerType);
  });
  G.canvas.addEventListener('pointerup', (e) => {
    if (!persistAsked) {
      persistAsked = true;
      G.requestPersist?.();
    }
    if (e.pointerType !== 'mouse') {
      wakeAudio();
      tryLandscape();
    }
    const p = point(e);
    scene?.up?.(p.x, p.y, e.pointerId, e.pointerType);
  });
  G.canvas.addEventListener('pointercancel', (e) => scene?.up?.(0, 0, e.pointerId, e.pointerType));
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    scene?.key?.(e.code, true);
  });
  addEventListener('keyup', (e) => scene?.key?.(e.code, false));
  addEventListener('blur', () => scene?.blur?.());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scene?.blur?.();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // [audio]
  G.resize();
  G.go('title');
  requestAnimationFrame(frame);
})();
