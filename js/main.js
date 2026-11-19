'use strict';
// 메인: 로딩, 장면 전환, 입력, 게임 루프
(() => {
  const MD = window.MD;
  const { W, H } = MD;
  const ctx = MD.ctx;

  const main = { scene: 'loading', progress: 0, ready: false, t: 0, fade: 0, battleIdx: 0 };
  MD.main = main;

  // ===== 로딩 =====
  (async () => {
    let done = 0;
    const total = 3 + 1 + 26;
    const step = () => { done++; main.progress = done / total; };
    try {
      await Promise.all([
        MD.loadAtlas('main').then(step),
        MD.loadAtlas('monsters').then(step),
        MD.loadAtlas('fx').then(step),
        MD.loadFont().then(step),
        MD.sfx.preload(step),
      ]);
    } catch (e) {
      console.error(e);
    }
    main.progress = 1;
    main.ready = true;
  })();

  function goMenu(tab) {
    main.scene = 'menu';
    main.fade = 1;
    MD.menu.enter(tab);
  }
  main.startBattle = idx => {
    main.battleIdx = idx;
    main.scene = 'battle';
    main.fade = 1;
    MD.battle.start(idx);
  };
  MD.battle.onExit = action => {
    MD.sfx.click();
    const idx = main.battleIdx;
    if (action === 'next') main.startBattle(Math.min(MD.STAGE_COUNT - 1, idx + 1));
    else if (action === 'retry') main.startBattle(idx);
    else if (action === 'upgrade') goMenu('upgrades');
    else goMenu('map');
  };

  // ===== 입력 =====
  const toGame = e => {
    const r = MD.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  let ptr = null;

  MD.canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    MD.sfx.init();
    MD.sfx.resume();
    const p = toGame(e);
    if (main.scene === 'loading') {
      if (main.ready) { MD.sfx.confirm(); goMenu('map'); }
      return;
    }
    // 즉시 반응 버튼 (전투 중 일시정지/스킬)
    const ib = MD.ui.find(p.x, p.y, true);
    if (ib) { ib.onClick(); ptr = null; return; }
    ptr = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, type: e.pointerType, t: performance.now(), vy: 0 };
    if (main.scene === 'battle' && !MD.battle.isPaused() && !MD.battle.inResult()) {
      if (e.pointerType === 'mouse') MD.battle.setTarget(p.x);
      ptr.tx0 = MD.battle.getTarget();
      ptr.steer = true;
    }
  });

  window.addEventListener('pointermove', e => {
    const p = toGame(e);
    if (main.scene === 'battle' && e.pointerType === 'mouse' && !MD.battle.isPaused()) MD.battle.setTarget(p.x);
    if (!ptr || ptr.id !== e.pointerId) return;
    const dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (Math.hypot(p.x - ptr.x0, p.y - ptr.y0) > 10) ptr.moved = true;
    if (ptr.steer && e.pointerType !== 'mouse') MD.battle.setTarget(ptr.tx0 + (p.x - ptr.x0) * 1.4);
    if (main.scene === 'menu' && ptr.moved && MD.menu.canScroll()) {
      MD.menu.scrollBy(-dy);
      const now = performance.now();
      ptr.vy = -dy / Math.max(1, now - ptr.t) * 1000;
      ptr.t = now;
    }
  });

  const up = e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    const p = toGame(e);
    if (!ptr.moved) {
      const b = MD.ui.find(p.x, p.y, false);
      if (b) b.onClick();
    } else if (main.scene === 'menu' && MD.menu.canScroll()) {
      MD.menu.fling = MD.clamp(ptr.vy, -2500, 2500);
    }
    ptr = null;
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', e => { if (ptr && ptr.id === e.pointerId) ptr = null; });

  window.addEventListener('wheel', e => { if (main.scene === 'menu' && MD.menu.canScroll()) MD.menu.scrollBy(e.deltaY); }, { passive: true });

  window.addEventListener('keydown', e => {
    MD.sfx.init(); MD.sfx.resume();
    const k = e.key;
    if (main.scene === 'loading' && main.ready && (k === ' ' || k === 'Enter')) { goMenu('map'); return; }
    if (main.scene !== 'battle') return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') MD.battle.keys.left = true;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') MD.battle.keys.right = true;
    if (k === ' ' || k === 'e' || k === 'E') { e.preventDefault(); MD.battle.useSkill(); }
    if (k === 'p' || k === 'P' || k === 'Escape') MD.battle.pause();
  });
  window.addEventListener('keyup', e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') MD.battle.keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') MD.battle.keys.right = false;
  });

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden && main.scene === 'battle') MD.battle.pause();
  });

  // ===== 루프 =====
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    main.t += dt;
    main.fade = Math.max(0, main.fade - dt * 3);

    MD.ui.begin();
    ctx.setTransform(MD.scale * MD.dpr, 0, 0, MD.scale * MD.dpr, 0, 0);
    if (main.scene === 'loading') {
      MD.drawTitle(main.t, main.progress, main.ready);
    } else if (main.scene === 'menu') {
      MD.menu.update(dt);
      MD.menu.draw();
    } else if (main.scene === 'battle') {
      MD.battle.update(dt);
      MD.battle.draw();
    }
    if (main.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${main.fade})`; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 테스트용
  window.__game = {
    main,
    battle: MD.battle,
    step(sec) { for (let i = 0; i < sec * 60; i++) MD.battle.update(1 / 60); },
  };
})();
