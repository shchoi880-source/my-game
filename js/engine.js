'use strict';
// 엔진: 고정 스텝 물리, 충돌, 이벤트 (docs/SPEC.md §7)
// 순수 로직 (DOM 없음) — 브라우저와 Node 양쪽에서 동작.
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const G = root.G = root.G || {};

  // ===== 물리 상수 (SPEC §7) + 판정 튜닝 값 =====
  const PHYS = {
    size: 34, gravity: 3000, jumpV: 900, djumpV: 800, padV: 1250, orbV: 950, maxFall: 1600,
    coyote: 0.07, buffer: 0.1, step: 1 / 240,
    // --- 판정 튜닝 (SPEC 외 추가, 읽기 전용으로 쓸 것) ---
    landForgive: 10,   // 떨어지는 중 발이 블록 윗면 아래 이 px 이내면 윗면으로 올려 착지
    riseForgive: 10,   // 올라가는 중 블록 모서리를 이 px 이내로 스치면 윗면으로 밀어 올림(사망 X)
    gapForgive: 6,     // 구멍 오른쪽 벽: 발이 지면 아래 이 px 이내면 지면으로 올림
    hurtInset: 2,      // 가시/톱날 판정용 플레이어 박스 축소(각 변 px)
    spikeScale: 0.7,   // 가시 판정 삼각형 = 시각 삼각형을 무게중심 기준 70%
    sawScale: 0.85,    // 톱날 판정 반지름 비율
    nearDist: 12,      // 니어미스 거리
    orbR: 26, coinR: 22, padW: 40, padH: 10, gemR: 18,
    fallDeath: -300,
    rotSpeed: Math.PI * 2 / 0.6, // 공중 회전 속도(rad/s) — 기본 점프 한 번에 약 1바퀴
  };
  G.PHYS = PHYS;

  const S = PHYS.size, STEP = PHYS.step, EPS = 1e-3, HALF_PI = Math.PI / 2, TAU = Math.PI * 2;
  const K_BLOCK = 1, K_SPIKE = 2, K_SAW = 3, K_PAD = 4, K_ORB = 5, K_COIN = 6;
  const KIND = { block: K_BLOCK, spike: K_SPIKE, saw: K_SAW, pad: K_PAD, orb: K_ORB, coin: K_COIN };
  const MARGIN = 24; // 플레이어 주변 검사 창 여유(px) — nearDist보다 커야 함

  function sawPos(o, t) {
    const p = o.period || 2;
    const s = (o.ax || o.ay) ? Math.sin(TAU * t / p) : 0;
    return { x: o.x + (o.ax || 0) * s, y: o.y + (o.ay || 0) * s };
  }

  // 가시 판정 삼각형(축소) + SAT 축 미리 계산
  function prepSpike(c) {
    const w = c.w || 40, h = c.h || 40, x = c.x, y = c.y || 0, d = c.dir || 'up';
    let v;
    if (d === 'down') v = [x, y + h, x + w, y + h, x + w / 2, y];
    else if (d === 'left') v = [x + w, y, x + w, y + h, x, y + h / 2];
    else if (d === 'right') v = [x, y, x, y + h, x + w, y + h / 2];
    else v = [x, y, x + w, y, x + w / 2, y + h];
    const gx = (v[0] + v[2] + v[4]) / 3, gy = (v[1] + v[3] + v[5]) / 3, k = PHYS.spikeScale;
    for (let i = 0; i < 6; i += 2) { v[i] = gx + (v[i] - gx) * k; v[i + 1] = gy + (v[i + 1] - gy) * k; }
    // axes: x, y, 3 edge normals → 각 축마다 [nx, ny, triMin, triMax]
    const ax = new Float64Array(20);
    const put = (j, nx, ny) => {
      const p0 = nx * v[0] + ny * v[1], p1 = nx * v[2] + ny * v[3], p2 = nx * v[4] + ny * v[5];
      ax[j] = nx; ax[j + 1] = ny; ax[j + 2] = Math.min(p0, p1, p2); ax[j + 3] = Math.max(p0, p1, p2);
    };
    put(0, 1, 0); put(4, 0, 1);
    for (let e = 0; e < 3; e++) {
      const i0 = e * 2, i1 = ((e + 1) % 3) * 2;
      let nx = -(v[i1 + 1] - v[i0 + 1]), ny = v[i1] - v[i0];
      const l = Math.hypot(nx, ny) || 1;
      put(8 + e * 4, nx / l, ny / l);
    }
    c._ax = ax;
    c._hit = v;
  }

  // SAT 분리 거리 (음수 = 겹침). 축이 정규화되어 있어 양수 값은 실제 거리의 하한(근사).
  function spikeSep(ax, x0, y0, x1, y1) {
    let sep = -Infinity;
    for (let j = 0; j < 20; j += 4) {
      const nx = ax[j], ny = ax[j + 1];
      const bmin = (nx > 0 ? nx * x0 : nx * x1) + (ny > 0 ? ny * y0 : ny * y1);
      const bmax = (nx > 0 ? nx * x1 : nx * x0) + (ny > 0 ? ny * y1 : ny * y0);
      const a = bmin - ax[j + 3], b = ax[j + 2] - bmax;
      if (a > sep) sep = a;
      if (b > sep) sep = b;
    }
    return sep;
  }

  function circleBoxSep(cx, cy, r, x0, y0, x1, y1) {
    const dx = cx < x0 ? x0 - cx : (cx > x1 ? cx - x1 : 0);
    const dy = cy < y0 ? y0 - cy : (cy > y1 ? cy - y1 : 0);
    return Math.sqrt(dx * dx + dy * dy) - r;
  }

  // 레벨 오브젝트 → 런 전용 복사본 + x 정렬 + 구멍 병합
  function prep(level) {
    const src = level.objects || [];
    const objects = [], list = [], gapsRaw = [], gems = [];
    let coinIdx = 0;
    for (let i = 0; i < src.length; i++) {
      const o = src[i];
      const c = Object.assign({}, o);
      objects.push(c);
      if (o.t === 'gap') { if (o.w > 0) gapsRaw.push([o.x, o.x + o.w]); continue; }
      if (o.t === 'gem') { gems.push(c); continue; }   // 젬은 물리/충돌과 완전히 분리
      const k = KIND[o.t];
      if (!k) continue;
      c._k = k;
      const y = c.y || 0;
      if (k === K_BLOCK) { c._x1 = c.x + c.w; c._top = y + c.h; c._y0 = y; c._xMin = c.x; c._xMax = c._x1; }
      else if (k === K_SPIKE) { prepSpike(c); c._xMin = c.x; c._xMax = c.x + (c.w || 40); }
      else if (k === K_SAW) {
        c.r = c.r || 30; c._hr = c.r * PHYS.sawScale;
        const p = sawPos(c, 0); c.cx = p.x; c.cy = p.y;
        c._xMin = c.x - Math.abs(c.ax || 0) - c.r; c._xMax = c.x + Math.abs(c.ax || 0) + c.r;
      }
      else if (k === K_PAD) { c._xMin = c.x; c._xMax = c.x + PHYS.padW; }
      else if (k === K_ORB) { c._xMin = c.x - PHYS.orbR; c._xMax = c.x + PHYS.orbR; }
      else if (k === K_COIN) { c.ci = coinIdx++; c._xMin = c.x - PHYS.coinR; c._xMax = c.x + PHYS.coinR; }
      list.push(c);
    }
    list.sort((a, b) => a._xMin - b._xMin);
    const n = list.length;
    const xMin = new Float64Array(n), pm = new Float64Array(n);
    let m = -Infinity;
    for (let i = 0; i < n; i++) {
      list[i]._i = i;
      xMin[i] = list[i]._xMin;
      if (list[i]._xMax > m) m = list[i]._xMax;
      pm[i] = m;
    }
    gapsRaw.sort((a, b) => a[0] - b[0]);
    const g0 = [], g1 = [];
    for (const g of gapsRaw) {
      if (g0.length && g[0] <= g1[g1.length - 1]) g1[g1.length - 1] = Math.max(g1[g1.length - 1], g[1]);
      else { g0.push(g[0]); g1.push(g[1]); }
    }
    const saws = list.filter(c => c._k === K_SAW);
    gems.sort((a, b) => a.x - b.x);
    gems.forEach((c, i) => { c.gi = i; c.got = false; c.missed = false; });
    return { objects, list, xMin, pm, gap0: Float64Array.from(g0), gap1: Float64Array.from(g1), saws, coinCount: coinIdx, gems };
  }

  function create(level, opts) {
    opts = opts || {};
    const P = prep(level);
    const list = P.list, xMinA = P.xMin, pmA = P.pm, gap0 = P.gap0, gap1 = P.gap1, ng = gap0.length, n = list.length;
    const speed = level.speed || 400, length = level.length || Infinity;
    // 하드 모드: 시간을 k배 빠르게(속도·중력·점프 모두 비례) → 점프 궤적(모양)은 같고 반응 시간만 짧아짐
    const k = level.tscale || 1;
    const JUMP_V = PHYS.jumpV * k, ORB_V = PHYS.orbV * k, DJUMP_V = PHYS.djumpV * k, PAD_V = PHYS.padV * k;
    const GRAV = PHYS.gravity * k * k, MAX_FALL = PHYS.maxFall * k, ROT_SPEED = PHYS.rotSpeed * k;
    const COYOTE = PHYS.coyote / k, BUFFER = PHYS.buffer / k;
    const quiet = !!opts.quiet;
    const near = new Uint8Array(n);
    const events = [];
    const startX = opts.startX || 0;
    const s = {
      x: startX, y: opts.startY || 0, vy: 0,
      t: opts.startT != null ? opts.startT : startX / speed,
      grounded: true, jumpsLeft: 1, dead: false, done: false,
      progress: 0, coins: [false, false, false], rot: 0,
      cause: null, killer: null, // 사망 원인/오브젝트 (추가 필드)
      gems: 0, combo: 0, maxCombo: 0, score: 0, // 리듬 젬 (물리와 무관)
    };
    // 내부 상태
    let coyoteT = 0, buf = 0, pending = false, lastOrb = -1, acc = 0;
    // 젬: x 정렬 배열 + 포인터. gst: 0 미결, 1 획득, 2 놓침, 3 시작 지점 뒤(무효)
    const gems = P.gems, ngem = gems.length, gst = new Uint8Array(ngem), GR = PHYS.gemR;
    let gp = 0;
    while (gp < ngem && gems[gp].x + GR < startX) { gst[gp] = 3; gp++; }

    function updateGems() {
      const x0 = s.x, x1 = x0 + S, y0 = s.y, y1 = y0 + S;
      for (let i = gp; i < ngem; i++) {
        const o = gems[i];
        if (o.x - GR > x1) break;
        if (gst[i]) continue;
        if (circleBoxSep(o.x, o.y, GR, x0, y0, x1, y1) <= 0) {
          gst[i] = 1; o.got = true;
          s.gems++; s.combo++;
          if (s.combo > s.maxCombo) s.maxCombo = s.combo;
          const mult = Math.min(4, 1 + Math.floor(s.combo / 16)), points = 10 * mult;
          s.score += points;
          emit('gem', { gi: i, ox: o.x, oy: o.y, combo: s.combo, mult, points, obj: o });
        } else if (o.x + GR < x0) {
          gst[i] = 2; o.missed = true;
          const lost = s.combo;
          s.combo = 0;
          if (lost > 0) emit('gemmiss', { gi: i, ox: o.x, oy: o.y, comboLost: lost, obj: o });
        }
      }
      while (gp < ngem && gst[gp]) gp++;
    }
    let lo = 0, hi = -1, gi = 0; // 검사 창 [lo, hi] (정렬 인덱스), 구멍 포인터

    function emit(type, extra) {
      if (quiet) return;
      const e = { type, x: s.x, y: s.y };
      if (extra) Object.assign(e, extra);
      events.push(e);
    }

    function setWindow(x) {
      const a = x - MARGIN, b = x + S + MARGIN;
      while (lo > 0 && pmA[lo - 1] >= a) lo--;
      while (lo < n && pmA[lo] < a) lo++;
      while (hi + 1 < n && xMinA[hi + 1] <= b) hi++;
      while (hi >= 0 && xMinA[hi] > b) hi--;
    }

    // 박스 [x0,x1]가 구멍 안에 완전히 들어가 있지 않으면 바닥이 있음
    function floorSolid(x0, x1) {
      if (s.done || ng === 0) return true;
      while (gi > 0 && gap1[gi - 1] >= x0) gi--;
      while (gi < ng && gap1[gi] < x0) gi++;
      return !(gi < ng && gap0[gi] <= x0 && gap1[gi] >= x1);
    }

    function findOrb() {
      const x0 = s.x, y0 = s.y, x1 = x0 + S, y1 = y0 + S;
      for (let i = lo; i <= hi; i++) {
        const o = list[i];
        if (o._k !== K_ORB || i === lastOrb) continue;
        if (circleBoxSep(o.x, o.y, PHYS.orbR, x0, y0, x1, y1) <= 0) return i;
      }
      return -1;
    }

    function die(cause, o) {
      s.dead = true; s.cause = cause; s.killer = o || null;
      emit('die', { cause, obj: o || null });
    }

    function step() {
      if (s.dead) return;
      const dt = STEP;
      setWindow(s.x);
      // --- 입력 / 점프 ---
      let fresh = false;
      const wasGrounded = s.grounded;
      if (pending) { pending = false; buf = BUFFER; fresh = true; }
      if (buf > 0) {
        if (s.grounded || coyoteT > 0) {
          s.vy = JUMP_V; s.grounded = false; coyoteT = 0; s.jumpsLeft = 1; buf = 0;
          emit('jump');
        } else {
          const oi = findOrb();
          if (oi >= 0) {
            s.vy = ORB_V; lastOrb = oi; buf = 0;
            const o = list[oi];
            emit('orb', { ox: o.x, oy: o.y, obj: o });
          } else if (fresh && s.jumpsLeft > 0) {
            s.vy = DJUMP_V; s.jumpsLeft = 0; buf = 0;
            emit('djump');
          }
        }
        if (buf > 0) buf -= dt;
      }

      // --- 적분 (semi-implicit Euler) ---
      // 평균 속도 적분 → 스텝 크기와 무관하게 정확한 포물선 (점프 높이 = v²/2g)
      const prevY = s.y, vy0 = s.vy;
      s.vy -= GRAV * dt;
      if (s.vy < -MAX_FALL) s.vy = -MAX_FALL;
      s.y += (vy0 + s.vy) * 0.5 * dt;
      s.x += speed * dt;
      s.t += dt;
      setWindow(s.x);

      let x = s.x, landed = false;
      // --- 블록 착지/모서리 보정 ---
      for (let i = lo; i <= hi; i++) {
        const o = list[i];
        if (o._k !== K_BLOCK) continue;
        const y = s.y;
        if (x < o._x1 && x + S > o.x && y < o._top - EPS && y + S > o._y0 + EPS) {
          const pen = o._top - y;
          if (s.vy <= 0 && (prevY >= o._top - 0.01 || pen <= PHYS.landForgive)) { s.y = o._top; s.vy = 0; landed = true; }
          else if (s.vy > 0 && pen <= PHYS.riseForgive) s.y = o._top;
        }
      }
      // --- 바닥 / 구멍 ---
      if (s.y < 0) {
        if (floorSolid(x, x + S)) {
          if (s.vy <= 0 && (prevY >= -0.01 || s.y >= -PHYS.gapForgive)) { s.y = 0; s.vy = 0; landed = true; }
          else { die('gap', null); return; }
        }
      }
      // --- 점프대 ---
      for (let i = lo; i <= hi; i++) {
        const o = list[i];
        if (o._k !== K_PAD) continue;
        const py = o.y || 0;
        if (x < o.x + PHYS.padW && x + S > o.x && s.y <= py + PHYS.padH && s.y + S > py) {
          if (s.vy <= 0 || wasGrounded) { // 떨어지는 중/달리는 중 접촉 (발사 직후 재발동 방지)
            s.vy = PAD_V; s.jumpsLeft = 1; coyoteT = 0; landed = false;
            if (s.grounded) s.grounded = false;
            emit('pad', { ox: o.x + PHYS.padW / 2, oy: py, obj: o });
          }
        }
      }
      // --- 접지 상태 ---
      if (landed) {
        if (!s.grounded) {
          s.grounded = true;
          s.rot = ((Math.round(s.rot / HALF_PI) * HALF_PI) % TAU + TAU) % TAU;
          emit('land');
        }
        s.jumpsLeft = 1; coyoteT = 0;
      } else {
        if (s.grounded) { s.grounded = false; coyoteT = COYOTE; }
        else if (coyoteT > 0) coyoteT -= dt;
        s.rot += ROT_SPEED * dt;
        if (s.rot >= TAU) s.rot -= TAU;
      }

      // --- 위험물 / 블록 충돌 / 코인 ---
      if (!s.done) {
        const y = s.y, hi0 = PHYS.hurtInset;
        const hx0 = x + hi0, hx1 = x + S - hi0, hy0 = y + hi0, hy1 = y + S - hi0;
        for (let i = lo; i <= hi; i++) {
          const o = list[i], k = o._k;
          if (k === K_BLOCK) {
            if (x < o._x1 - EPS && x + S > o.x + EPS && y < o._top - EPS && y + S > o._y0 + EPS) { die('block', o); return; }
          } else if (k === K_SPIKE || k === K_SAW) {
            let sep;
            if (k === K_SPIKE) sep = spikeSep(o._ax, hx0, hy0, hx1, hy1);
            else {
              const p = o.period || 2, sn = (o.ax || o.ay) ? Math.sin(TAU * s.t / p) : 0;
              sep = circleBoxSep(o.x + (o.ax || 0) * sn, o.y + (o.ay || 0) * sn, o._hr, hx0, hy0, hx1, hy1);
            }
            if (sep < 0) { die(k === K_SPIKE ? 'spike' : 'saw', o); return; }
            if (!quiet) {
              if (sep <= PHYS.nearDist) { if (near[i] === 0) near[i] = 1; }
              else if (near[i] === 1) { near[i] = 2; emit('nearmiss', { ox: o.x, oy: o.y || 0, obj: o }); }
            }
          } else if (k === K_COIN) {
            if (o.ci < 3 && !s.coins[o.ci] && circleBoxSep(o.x, o.y, PHYS.coinR, x, y, x + S, y + S) <= 0) {
              s.coins[o.ci] = true; s.score += 250;
              emit('coin', { i: o.ci, ox: o.x, oy: o.y, obj: o });
            }
          }
        }
        if (s.y < PHYS.fallDeath) { die('fall', null); return; }
        if (ngem) updateGems();
        if (x >= length) { s.done = true; emit('complete'); }
      }
      s.progress = length === Infinity ? 0 : Math.min(1, Math.max(0, s.x / length));
    }

    function syncSaws() {
      const t = s.t, saws = P.saws;
      for (let i = 0; i < saws.length; i++) {
        const o = saws[i], p = o.period || 2, sn = (o.ax || o.ay) ? Math.sin(TAU * t / p) : 0;
        o.cx = o.x + (o.ax || 0) * sn; o.cy = o.y + (o.ay || 0) * sn;
      }
    }

    const run = {
      state: s,
      events,
      objects: P.objects,
      level,
      press() { if (!s.dead) pending = true; },
      update(dt) {
        if (s.dead) return;
        acc += Math.min(Math.max(dt, 0), 0.1);
        while (acc >= STEP - 1e-9) {
          acc -= STEP;
          step();
          if (s.dead) { acc = 0; break; }
        }
        syncSaws();
      },
      // --- 도구/테스트용 (SPEC 외 추가) ---
      step() { step(); },                 // 정확히 1 고정 스텝
      snapshot() {                        // 물리 상태 복사 (니어미스 플래그는 제외)
        return [s.x, s.y, s.vy, s.t, s.grounded ? 1 : 0, s.jumpsLeft, s.dead ? 1 : 0, s.done ? 1 : 0,
          s.rot, coyoteT, buf, pending ? 1 : 0, lastOrb,
          (s.coins[0] ? 1 : 0) | (s.coins[1] ? 2 : 0) | (s.coins[2] ? 4 : 0)];
      },
      restore(a) {
        s.x = a[0]; s.y = a[1]; s.vy = a[2]; s.t = a[3]; s.grounded = !!a[4]; s.jumpsLeft = a[5];
        s.dead = !!a[6]; s.done = !!a[7]; s.rot = a[8]; coyoteT = a[9]; buf = a[10]; pending = !!a[11];
        lastOrb = a[12]; s.coins[0] = !!(a[13] & 1); s.coins[1] = !!(a[13] & 2); s.coins[2] = !!(a[13] & 4);
        s.cause = null; s.killer = null; acc = 0;
      },
      get coyoteT() { return coyoteT; },
      get bufferT() { return buf; },
      get lastOrb() { return lastOrb; },
      coinCount: P.coinCount,
      gemCount: P.gems.length,
      gems: P.gems,                       // x 정렬된 젬 복사본 (o.gi, o.got, o.missed)
    };
    // 시작 위치가 구멍/블록 위인지 정리: startY 미지정이면 바닥(0)
    s.progress = length === Infinity ? 0 : Math.min(1, Math.max(0, s.x / length));
    syncSaws();
    return run;
  }

  G.Engine = { create, sawPos };
})();
