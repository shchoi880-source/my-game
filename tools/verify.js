'use strict';
// NEON DASH 레벨 검증기 (docs/SPEC.md §7)
// 사용법 (프로젝트 루트에서):
//   node tools/verify.js                 G.LEVELS 전체 (levels.js 없으면 내장 테스트 레벨)
//   node tools/verify.js lv3             특정 레벨
//   node tools/verify.js test            내장 테스트 레벨 + 엔진 자체 테스트
//   node tools/verify.js --phys          물리 수치 표 (점프 높이/거리 등)
//   옵션: --beam N (빔 폭, 기본 3000)  --taps (해답 탭 시각 전체 출력)
//         --levels 파일.js (js/levels.js 대신 다른 레벨 파일 로드)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.G = global.G || {};

function load(rel, optional) {
  const f = path.resolve(ROOT, rel);
  if (!fs.existsSync(f)) { if (!optional) throw new Error('missing ' + rel); return false; }
  try { vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); return true; }
  catch (e) { console.log(`! ${rel} 로드 실패: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); return false; }
}
load('js/core.js', true);  // 유틸만 쓰임 (DOM 없으면 캔버스 생략)
load('js/engine.js');
const lvArg = process.argv.indexOf('--levels');
const hasLevels = load(lvArg >= 0 ? path.resolve(process.argv[lvArg + 1]) : 'js/levels.js', true);
const { PHYS, Engine } = G;
const TICK_STEPS = 4; // 1/60초 = 4 스텝

// ===== 내장 테스트 레벨 =====
const TEST_LEVELS = [
  {
    id: 'test1', name: '테스트: 기본', speed: 400, bpm: 120, length: 9000,
    objects: [
      { t: 'spike', x: 1000, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'spike', x: 1400, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'spike', x: 1440, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'block', x: 1900, y: 0, w: 300, h: 60 },
      { t: 'spike', x: 2200, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'gap', x: 2600, w: 160 },
      { t: 'coin', x: 2680, y: 120 },
      { t: 'block', x: 3100, y: 0, w: 120, h: 50 },
      { t: 'block', x: 3300, y: 0, w: 120, h: 110 },
      { t: 'block', x: 3500, y: 0, w: 400, h: 170 },
      { t: 'spike', x: 3920, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'spike', x: 3960, y: 0, w: 40, h: 40, dir: 'up' },
      { t: 'pad', x: 4400, y: 0 },
      { t: 'block', x: 4700, y: 200, w: 300, h: 30 },
      { t: 'saw', x: 4800, y: 80, r: 30 },
      { t: 'coin', x: 4950, y: 260 },
      { t: 'gap', x: 5300, w: 280 },
      { t: 'orb', x: 5800, y: 110 },
      { t: 'spike', x: 5780, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 5820, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 5860, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 5900, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 5940, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 5980, y: 0, w: 40, h: 40 },
      { t: 'saw', x: 6600, y: 60, r: 28, ay: 50, period: 1.5 },
      { t: 'spike', x: 7200, y: 95, w: 40, h: 40, dir: 'down' },
      { t: 'block', x: 7200, y: 135, w: 200, h: 40 },
      { t: 'coin', x: 8000, y: 30 },
    ],
  },
  {
    id: 'test2', name: '테스트: 2단 점프', speed: 450, bpm: 140, length: 8000,
    objects: [
      { t: 'gap', x: 1200, w: 380 },
      { t: 'block', x: 2000, y: 0, w: 200, h: 200 },
      { t: 'spike', x: 2600, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2640, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2680, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2720, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2760, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2800, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2840, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2880, y: 0, w: 40, h: 40 },
      { t: 'spike', x: 2920, y: 0, w: 40, h: 40 },
      { t: 'saw', x: 3500, y: 40, r: 30, ax: 0, ay: 120, period: 1.2 },
      { t: 'saw', x: 3800, y: 160, r: 30, ax: 60, ay: 0, period: 1.0 },
      { t: 'gap', x: 4300, w: 200 },
      { t: 'orb', x: 4600, y: 150 },
      { t: 'gap', x: 4520, w: 480 },
      { t: 'pad', x: 5300, y: 0 },
      { t: 'block', x: 5500, y: 0, w: 600, h: 300 },
      { t: 'spike', x: 5800, y: 300, w: 40, h: 40 },
      { t: 'coin', x: 6500, y: 20 }, { t: 'coin', x: 6600, y: 20 }, { t: 'coin', x: 6700, y: 20 },
    ],
  },
  {
    id: 'impossible', name: '테스트: 불가능', speed: 400, bpm: 120, length: 4000,
    objects: [{ t: 'block', x: 2000, y: 0, w: 100, h: 400 }],
  },
];

// ===== 공용 =====
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
function objDesc(o) {
  if (!o) return '(바닥/구멍)';
  const extra = o.t === 'block' ? ` w=${o.w} h=${o.h}` : o.t === 'saw' ? ` r=${o.r}${o.ax ? ' ax=' + o.ax : ''}${o.ay ? ' ay=' + o.ay : ''}` : o.t === 'spike' ? ` ${o.dir || 'up'}` : '';
  return `${o.t}@x=${o.x},y=${o.y || 0}${extra}`;
}

// 탭 스케줄(틱 번호 배열) 실행. 반환 {done, dead, tick, x, cause, killer, path?}
function simulate(level, taps, opts) {
  opts = opts || {};
  const run = Engine.create(level, { quiet: !opts.events });
  const set = new Set(taps);
  const maxT = Math.ceil(level.length / level.speed * 60) + 600;
  const pathArr = opts.path ? [] : null;
  for (let k = 0; k < maxT; k++) {
    if (pathArr) pathArr.push(run.snapshot());
    if (set.has(k)) run.press();
    for (let i = 0; i < TICK_STEPS; i++) { run.step(); if (run.state.dead || run.state.done) break; }
    if (run.state.dead || run.state.done) {
      return { done: run.state.done, dead: run.state.dead, tick: k + 1, x: run.state.x, t: run.state.t, cause: run.state.cause, killer: run.state.killer, path: pathArr, run };
    }
  }
  return { done: false, dead: false, tick: maxT, x: run.state.x, path: pathArr, run };
}

// ===== 빔 서치 =====
function stateKey(a) {
  // a = snapshot: [x,y,vy,t,grounded,jumpsLeft,dead,done,rot,coyote,buf,pending,lastOrb,coins]
  const yq = Math.round(a[1]) + 1000;            // 1px
  const vq = Math.round(a[2] / 10) + 200;         // 10px/s
  const cq = a[9] > 0 ? Math.min(7, Math.ceil(a[9] * 60)) : 0;
  const bq = a[10] > 0 ? Math.min(7, Math.ceil(a[10] * 60)) : 0;
  return (((((yq * 512 + vq) * 2 + a[4]) * 2 + a[5]) * 8 + cq) * 8 + bq) * 4096 + (a[12] + 1);
}

function search(level, beam) {
  const run = Engine.create(level, { quiet: true });
  const maxT = Math.ceil(level.length / level.speed * 60) + 600;
  let frontier = [{ s: run.snapshot(), p: null, tap: 0, n: 0 }];
  let best = { tick: 0, x: 0, cause: null, killer: null };
  let rng = 12345;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  let peak = 0;
  const orbXs = (level.objects || []).filter(o => o.t === 'orb').map(o => o.x).sort((a, b) => a - b);
  const orbNear = x => { for (const ox of orbXs) { if (ox > x + 34 + 26 + level.speed * 0.15) return false; if (ox + 26 >= x - 5) return true; } return false; };
  for (let k = 0; k < maxT; k++) {
    const next = new Map();
    for (let f = 0; f < frontier.length; f++) {
      const node = frontier[f];
      const ns = node.s;
      // 의미 없는 탭 생략: 공중 + 2단 소진 + 코요테 없음 + 0.1초 안에 착지 불가(상승 중 vy>300) + 근처 오브 없음
      const tapUseless = !ns[4] && ns[5] === 0 && ns[9] <= 0 && ns[2] > 300 && !orbNear(ns[0]);
      for (let tap = 0; tap < (tapUseless ? 1 : 2); tap++) {
        run.restore(ns);
        if (tap) run.press();
        for (let i = 0; i < TICK_STEPS; i++) { run.step(); if (run.state.dead || run.state.done) break; }
        const st = run.state;
        if (st.done) {
          const taps = [];
          let cur = { p: node, tap, k };
          let kk = k;
          for (let nd = cur; nd && nd.p; nd = nd.p, kk--) if (nd.tap) taps.push(kk);
          taps.reverse();
          return { solved: true, taps, peak };
        }
        if (st.dead) {
          if (k >= best.tick) best = { tick: k, x: st.x, cause: st.cause, killer: st.killer, y: st.y };
          continue;
        }
        const snap = run.snapshot();
        const key = stateKey(snap);
        const ex = next.get(key);
        const nn = node.n + tap;
        if (!ex) next.set(key, { s: snap, p: node, tap, n: nn });
        else if (nn < ex.n) { ex.s = snap; ex.p = node; ex.tap = tap; ex.n = nn; }
      }
    }
    frontier = Array.from(next.values());
    if (frontier.length > peak) peak = frontier.length;
    if (frontier.length === 0) return { solved: false, best, peak };
    if (frontier.length > beam) {
      // 절반은 점수 상위(접지/2단점프 보유/탭 적음), 절반은 무작위 → 다양성 유지
      const sc = nd => nd.s[4] * 4 + nd.s[5] * 2 - nd.n * 0.001 + rand() * 0.5;
      frontier.forEach(nd => { nd.sc = sc(nd); });
      frontier.sort((a, b) => b.sc - a.sc);
      const keep = frontier.slice(0, beam >> 1);
      const rest = frontier.slice(beam >> 1);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      frontier = keep.concat(rest.slice(0, beam - keep.length));
    }
  }
  return { solved: false, best, peak };
}

// ===== 허용 오차 (탭 하나를 앞뒤로 몇 틱 옮겨도 깰 수 있나) =====
function sameState(a, b) {
  return Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01 && a[4] === b[4] && a[5] === b[5] &&
    a[12] === b[12] && (a[9] > 0) === (b[9] > 0) && (a[10] > 0) === (b[10] > 0) && a[11] === b[11] &&
    (a[9] <= 0 || Math.abs(a[9] - b[9]) < 1e-6) && (a[10] <= 0 || Math.abs(a[10] - b[10]) < 1e-6);
}

// 탭 idx의 "동작 묶음" 끝 인덱스: idx 이후 다시 땅에 닿기 전까지의 탭들(점프+2단+오브)은 함께 움직인다.
// → 점프 시점을 옮기면 같은 공중 동작의 후속 탭도 같이 옮겨 "이 동작을 언제 시작해야 하나"를 잰다.
function groupEnd(taps, idx, pathArr) {
  let m = taps[idx] + 2;
  while (m < pathArr.length && !pathArr[m][4]) m++;
  let j = idx;
  while (j + 1 < taps.length && taps[j + 1] < m) j++;
  return j;
}

// 탭 묶음(idx..j)을 d틱 옮긴 새 스케줄을 돌려준다(실패 시 null).
// 1) 나머지 탭을 그대로 두고 원래 경로로 수렴하면 성공.
// 2) 아니면 옮긴 뒤 최대 RECOVER_T 틱 동안 이후 탭을 자유롭게 다시 찾아(작은 빔 서치) 원래 경로와 같은 상태로
//    합류할 수 있으면 성공 — "이 순간을 놓쳐도 다음 동작으로 만회 가능"까지 허용 범위로 인정.
const RECOVER_T = 100, RECOVER_BEAM = 160;
function shiftEval(level, taps, idx, d, pathArr, run) {
  const j = groupEnd(taps, idx, pathArr);
  const nt0 = taps[idx] + d, nt1 = taps[j] + d;
  if (nt0 < 0 || nt1 >= pathArr.length - 1) return null;
  if (idx > 0 && nt0 <= taps[idx - 1]) return null;
  if (j < taps.length - 1 && nt1 >= taps[j + 1]) return null;
  const a = Math.min(taps[idx], nt0), b = Math.max(taps[j], nt1);
  const shifted = taps.slice(); for (let i = idx; i <= j; i++) shifted[i] += d;
  const set = new Set(shifted);
  const end = pathArr.length;
  // (1) 고정 스케줄
  run.restore(pathArr[a]);
  let fixedOk = false, snapB = null;
  for (let k = a; k < end + 600; k++) {
    if (k > b && k < end && sameState(run.snapshot(), pathArr[k])) { fixedOk = true; break; }
    if (k === b + 1) snapB = run.snapshot();
    if (set.has(k)) run.press();
    for (let i = 0; i < TICK_STEPS; i++) { run.step(); if (run.state.dead || run.state.done) break; }
    if (run.state.dead) break;
    if (run.state.done) { fixedOk = true; break; }
  }
  if (fixedOk) return shifted;
  if (!snapB) { // 묶음 구간 안에서 이미 사망
    run.restore(pathArr[a]);
    for (let k = a; k <= b; k++) {
      if (set.has(k)) run.press();
      for (let i = 0; i < TICK_STEPS; i++) { run.step(); if (run.state.dead || run.state.done) break; }
      if (run.state.dead) return null;
      if (run.state.done) return shifted;
    }
    snapB = run.snapshot();
  }
  // (2) 만회 탐색: b+1 틱부터 자유 탭
  const before = shifted.filter(t => t <= b);
  let frontier = [{ s: snapB, p: null, tap: 0 }];
  if (sameState(snapB, pathArr[b + 1])) return before.concat(taps.filter(t => t > b));
  for (let k = b + 1; k < b + 1 + RECOVER_T; k++) {
    const next = new Map();
    for (const node of frontier) {
      for (let tap = 0; tap < 2; tap++) {
        run.restore(node.s);
        if (tap) run.press();
        for (let i = 0; i < TICK_STEPS; i++) { run.step(); if (run.state.dead || run.state.done) break; }
        if (run.state.dead) continue;
        const conv = run.state.done || (k + 1 < end && sameState(run.snapshot(), pathArr[k + 1]));
        if (conv) {
          const rec = [];
          let kk = k;
          for (let nd = { p: node, tap }; nd && (nd.p || nd.tap); nd = nd.p, kk--) if (nd.tap) rec.push(kk);
          rec.reverse();
          return before.concat(rec, taps.filter(t => t > k));
        }
        const snap = run.snapshot(), key = stateKey(snap);
        if (!next.has(key)) next.set(key, { s: snap, p: node, tap });
      }
    }
    frontier = Array.from(next.values());
    if (!frontier.length) return null;
    if (frontier.length > RECOVER_BEAM) {
      frontier.sort((x, y) => (y.s[4] * 2 + y.s[5]) - (x.s[4] * 2 + x.s[5]));
      frontier.length = RECOVER_BEAM;
    }
  }
  return null;
}

const CAP = 10;
function windowOf(level, taps, i, pathArr, run) {
  let e = 0, l = 0;
  while (e < CAP && shiftEval(level, taps, i, -e - 1, pathArr, run)) e++;
  while (l < CAP && shiftEval(level, taps, i, l + 1, pathArr, run)) l++;
  return [e, l];
}

function tolerance(level, taps) {
  const sim = simulate(level, taps, { path: true });
  const run = Engine.create(level, { quiet: true });
  return taps.map((tk, i) => {
    const [e, l] = windowOf(level, taps, i, sim.path, run);
    return { tick: tk, x: sim.path[tk][0], y: sim.path[tk][1], air: !sim.path[tk][4], early: e, late: l, win: e + l + 1 };
  });
}

// 없어도 깨지는 탭(빔 서치가 남긴 군더더기) 제거 — 뒤에서부터
function pruneTaps(level, taps) {
  taps = taps.slice();
  for (let i = taps.length - 1; i >= 0; i--) {
    const cand = taps.slice(0, i).concat(taps.slice(i + 1));
    if (simulate(level, cand).done) taps = cand;
  }
  return taps;
}

// 각 탭(동작 묶음)을 허용 구간 가운데로 옮겨 "사람이 칠 만한" 해답으로 다듬기
function centerTaps(level, taps) {
  taps = taps.slice();
  const run = Engine.create(level, { quiet: true });
  for (let i = 0; i < taps.length; i++) {
    const sim = simulate(level, taps, { path: true });
    const [e, l] = windowOf(level, taps, i, sim.path, run);
    const d = Math.trunc((l - e) / 2);
    if (d !== 0) {
      const cand = shiftEval(level, taps, i, d, sim.path, run);
      if (cand && simulate(level, cand).done) taps = cand;
    }
  }
  return taps;
}

function staticCheck(level) {
  const warn = [];
  const objs = level.objects || [];
  const coins = objs.filter(o => o.t === 'coin').length;
  if (coins !== 3) warn.push(`코인 ${coins}개 (3개여야 함)`);
  const types = new Set(['block', 'spike', 'saw', 'pad', 'orb', 'coin', 'gap']);
  objs.forEach((o, i) => {
    if (!types.has(o.t)) warn.push(`#${i} 알 수 없는 t='${o.t}'`);
    for (const k of ['x', 'y', 'w', 'h', 'r']) if (k in o && !Number.isFinite(o[k])) warn.push(`#${i} ${o.t}.${k}=${o[k]}`);
    if (o.x > level.length) warn.push(`#${i} ${o.t} x=${o.x} > length`);
  });
  if (!level.speed) warn.push('speed 없음');
  if (!level.length) warn.push('length 없음');
  const firstHaz = objs.filter(o => o.t !== 'coin').reduce((m, o) => Math.min(m, o.x), Infinity);
  if (firstHaz < level.speed * 1.5) warn.push(`첫 오브젝트 x=${firstHaz} (시작 후 ${fmt(firstHaz / level.speed, 2)}초) — 약 2초 빈 길 권장`);
  return warn;
}

function verifyLevel(level, beam, showTaps) {
  const t0 = Date.now();
  console.log(`\n=== ${level.id} ${level.name || ''}  speed=${level.speed} length=${level.length} (${fmt(level.length / level.speed)}s) objects=${(level.objects || []).length}`);
  for (const w of staticCheck(level)) console.log('  ! ' + w);
  const r = search(level, beam);
  if (!r.solved) {
    const b = r.best;
    console.log(`  풀이 가능: NO   (탐색 ${((Date.now() - t0) / 1000).toFixed(1)}s, 최대 상태수 ${r.peak})`);
    console.log(`  최장 도달: x=${fmt(b.x, 0)} (${fmt(b.x / level.length * 100)}%, t=${fmt(b.tick / 60, 2)}s)  사망 원인: ${b.cause} — ${objDesc(b.killer)}`);
    return { id: level.id, solved: false, x: b.x };
  }
  const tSearch = (Date.now() - t0) / 1000;
  let taps = centerTaps(level, pruneTaps(level, r.taps));
  const sim = simulate(level, taps, { events: true });
  if (!sim.done) { console.log('  (내부 오류: 다듬은 해답 재생 실패, 원래 해답 사용)'); taps = r.taps; }
  const fin = simulate(level, taps, { events: true });
  const ev = fin.run.events;
  const cnt = ty => ev.filter(e => e.type === ty).length;
  const tol = tolerance(level, taps);
  const searchSec = (Date.now() - t0) / 1000;
  console.log(`  풀이 가능: YES  완주 시간 ${fmt(fin.t, 2)}s, 탭 ${taps.length}회 (점프 ${cnt('jump')}, 2단 ${cnt('djump')}, 오브 ${cnt('orb')}, 점프대 ${cnt('pad')}, 코인 ${cnt('coin')}, 니어미스 ${cnt('nearmiss')})  [검증 ${searchSec.toFixed(1)}s (탐색 ${tSearch.toFixed(1)}s), 최대 상태수 ${r.peak}]`);
  if (tol.length) {
    const sorted = tol.slice().sort((a, b) => a.win - b.win || a.tick - b.tick);
    const minW = sorted[0].win;
    const avg = tol.reduce((s, a) => s + a.win, 0) / tol.length;
    console.log(`  가장 빡빡한 허용 창: ${minW}프레임 (${fmt(minW / 60 * 1000, 0)}ms), 평균 ${fmt(avg)}프레임   (창 = 이 탭을 1/60초 단위로 옮겨도 깨지는 범위, 최대 ${CAP * 2 + 1})`);
    console.log('  가장 빡빡한 5곳:');
    for (const a of sorted.slice(0, 5)) {
      console.log(`    x=${fmt(a.x, 0).padStart(6)} (${fmt(a.x / level.length * 100).padStart(5)}%, t=${fmt(a.tick / 60, 2)}s, ${a.air ? '공중' : '지면'})  창 ${String(a.win).padStart(2)}f  (-${a.early}/+${a.late})${nearestSection(level, a.x)}`);
    }
  }
  if (showTaps) console.log('  탭 틱(1/60s): ' + taps.join(','));
  return { id: level.id, solved: true, time: fin.t, taps: taps.length, minWin: tol.length ? Math.min(...tol.map(a => a.win)) : null };
}

function nearestSection(level, x) {
  const s = (level.sections || []).filter(s => s.x <= x).pop();
  return s ? `  [${s.name}]` : '';
}

// ===== 물리 측정 =====
function physTable() {
  console.log('물리 측정 (1/240s 스텝 실측). 점프 거리 = 이륙 지점→같은 높이 착지까지 수평 이동');
  const meas = (speed, setup) => {
    const lv = { id: 'p', speed, length: 1e7, objects: setup || [] };
    return lv;
  };
  function arc(speed, djumpAt) {
    // djumpAt: 첫 점프 후 2단 점프를 누를 시간(초) (null이면 단일 점프)
    const run = Engine.create(meas(speed), { quiet: true });
    run.press();
    let maxY = 0, steps = 0, pressed = false;
    run.step(); steps++;
    const x0 = 0;
    while (true) {
      if (djumpAt != null && !pressed && steps * PHYS.step >= djumpAt) { run.press(); pressed = true; }
      run.step(); steps++;
      if (run.state.y > maxY) maxY = run.state.y;
      if (run.state.grounded) break;
    }
    return { h: maxY, air: (steps - 1) * PHYS.step, dist: run.state.x - x0 - speed * PHYS.step };
  }
  const single = arc(400);
  console.log(`  단일 점프: 최고 높이 ${fmt(single.h)}px, 체공 ${fmt(single.air, 3)}s`);
  // 2단: 최고점에서 누를 때 최대 높이
  let bestD = { h: 0 };
  for (let t = 0.05; t <= 0.6; t += 1 / 60) { const a = arc(400, t); if (a.h > bestD.h) bestD = Object.assign(a, { at: t }); }
  console.log(`  2단 점프(최고점 ${fmt(bestD.at, 3)}s에 탭): 최고 높이 ${fmt(bestD.h)}px (+${fmt(bestD.h - single.h)}), 체공 ${fmt(bestD.air, 3)}s`);
  const padRun = Engine.create(meas(400, [{ t: 'pad', x: 0, y: 0 }]), { quiet: true });
  let ph = 0, pa = 0; for (let i = 0; i < 2000; i++) { padRun.step(); if (padRun.state.y > ph) ph = padRun.state.y; if (i > 5 && padRun.state.grounded) { pa = i * PHYS.step; break; } }
  console.log(`  점프대: 최고 높이 ${fmt(ph)}px, 체공 ${fmt(pa, 3)}s`);
  const orbH = 950 * 950 / 6000;
  console.log(`  오브: vy=950 → 그 지점에서 +${fmt(orbH)}px 상승 (이론값)`);
  console.log('');
  console.log('  속도 | 점프거리 | 2단최대거리 | 단일점프 최대 구멍폭 | 2단 최대 구멍폭 | 단일 오를수있는 블록높이 | 2단 블록높이');
  for (const sp of [380, 400, 420, 450, 480]) {
    const s1 = arc(sp);
    let d2 = 0; for (let t = 0.05; t <= 0.6; t += 1 / 60) { const a = arc(sp, t); if (a.dist > d2) d2 = a.dist; }
    const g1 = maxGap(sp, false), g2 = maxGap(sp, true);
    const b1 = maxBlock(sp, false), b2 = maxBlock(sp, true);
    console.log(`  ${sp}  |  ${fmt(s1.dist, 0)}px  |  ${fmt(d2, 0)}px  |  ${g1}px  |  ${g2}px  |  ${b1}px  |  ${b2}px`);
  }
}

// 이분 탐색 없이 폭 증가 → 탭 스케줄 탐색으로 통과 가능한 최대 값
function canPass(level, dbl) {
  // 1~2탭 스케줄 전수 조사 (첫 탭 틱 a, 두 번째 탭 a+d)
  const end = Math.ceil(level.length / level.speed * 60);
  for (let a = 0; a < end; a++) {
    if (!dbl) { if (simulate(level, [a]).done) return true; continue; }
    for (let d = 1; d <= 40; d++) if (simulate(level, [a, a + d]).done) return true;
  }
  return false;
}
function maxGap(speed, dbl) {
  let lo = 0, hi = 1000;
  const mk = w => ({ id: 'g', speed, length: 600 + w + 60, objects: [{ t: 'gap', x: 400, w }] });
  // 이분 탐색 (5px 단위)
  while (hi - lo > 5) { const m = Math.round((lo + hi) / 2); if (canPassFast(mk(m), dbl)) lo = m; else hi = m; }
  return lo;
}
function maxBlock(speed, dbl) {
  let lo = 0, hi = 600;
  const mk = h => ({ id: 'b', speed, length: 800, objects: [{ t: 'block', x: 500, y: 0, w: 300, h }] });
  while (hi - lo > 2) { const m = Math.round((lo + hi) / 2); if (canPassFast(mk(m), dbl)) lo = m; else hi = m; }
  return lo;
}
function canPassFast(level, dbl) {
  // 탭 후보를 장애물 직전 1.2초 범위로 제한
  const obj = level.objects[0];
  const k0 = Math.max(0, Math.floor((obj.x - level.speed * 1.2) / level.speed * 60));
  const k1 = Math.ceil(obj.x / level.speed * 60) + 2;
  for (let a = k0; a <= k1; a++) {
    if (!dbl) { if (simulate(level, [a]).done) return true; continue; }
    for (let d = 1; d <= 40; d++) if (simulate(level, [a, a + d]).done) return true;
  }
  return false;
}

// ===== 엔진 자체 테스트 =====
function selfTest() {
  let fail = 0;
  const ok = (c, msg) => { console.log(`  ${c ? 'ok ' : 'FAIL'} ${msg}`); if (!c) fail++; };
  const L = (objs, speed = 400, length = 5000) => ({ id: 't', speed, length, objects: objs });
  const runTo = (run, x, onStep) => { let i = 0; while (run.state.x < x && !run.state.dead && i++ < 100000) { if (onStep) onStep(run); run.step(); } return run; };
  console.log('\n=== 엔진 자체 테스트');
  // 점프 높이
  { const r = Engine.create(L([]), { quiet: true }); r.press(); let m = 0; for (let i = 0; i < 300; i++) { r.step(); m = Math.max(m, r.state.y); } ok(Math.abs(m - 135) < 3, `점프 높이 ${fmt(m)} ≈ 135`); }
  // 가시 사망 / 점프로 회피
  { const r = runTo(Engine.create(L([{ t: 'spike', x: 600, y: 0, w: 40, h: 40 }])), 800); ok(r.state.dead && r.state.cause === 'spike', '가시에 닿으면 사망'); }
  { const r = Engine.create(L([{ t: 'spike', x: 600, y: 0, w: 40, h: 40 }])); runTo(r, 500); r.press(); runTo(r, 900); ok(!r.state.dead, '가시 점프로 회피'); }
  // 니어미스: 가시를 아슬하게 넘도록 늦게 점프 — 여러 시점 시도해서 nearmiss가 발생하는 시점이 존재하는지
  {
    let found = false, died = 0;
    for (let px = 380; px < 600 && !found; px += 2) {
      const r = Engine.create(L([{ t: 'spike', x: 600, y: 0, w: 40, h: 40 }])); runTo(r, px); r.press(); runTo(r, 900);
      if (r.state.dead) died++; else if (r.events.some(e => e.type === 'nearmiss')) found = true;
    }
    ok(found, '아슬하게 넘으면 nearmiss 발생');
    const r = Engine.create(L([{ t: 'spike', x: 600, y: 0, w: 40, h: 40 }])); runTo(r, 470); r.press(); runTo(r, 900);
    ok(!r.state.dead && !r.events.some(e => e.type === 'nearmiss'), '여유 있게 넘으면 nearmiss 없음');
  }
  // 톱날
  { const r = runTo(Engine.create(L([{ t: 'saw', x: 700, y: 30, r: 30 }])), 900); ok(r.state.dead && r.state.cause === 'saw', '톱날 사망'); }
  { const r = runTo(Engine.create(L([{ t: 'saw', x: 700, y: 30 + 17 + 30 * 0.85 + 5, r: 30 }])), 900); ok(!r.state.dead, '톱날 판정 85% (머리 위 시각 반지름 안쪽이어도 생존)'); }
  { const r = Engine.create(L([{ t: 'saw', x: 700, y: 100, r: 30, ay: 100, period: 1 }])); r.update(0.3); ok(Math.abs(r.objects[0].cy - G.Engine.sawPos(r.objects[0], r.state.t).y) < 1e-9, 'o.cx/cy 갱신'); }
  // 블록 착지 / 위로 달리기 / 옆면 사망
  { const r = Engine.create(L([{ t: 'block', x: 600, y: 0, w: 400, h: 80 }])); runTo(r, 480); r.press(); runTo(r, 900); ok(!r.state.dead && r.state.grounded && r.state.y === 80, '블록 윗면 착지 + 달리기'); runTo(r, 1100); ok(!r.state.dead && r.state.y < 80, '블록 끝에서 떨어짐'); runTo(r, 1300); ok(r.state.y === 0 && r.state.grounded, '바닥 재착지'); }
  { const r = runTo(Engine.create(L([{ t: 'block', x: 600, y: 0, w: 100, h: 60 }])), 800); ok(r.state.dead && r.state.cause === 'block', '블록 옆면 충돌 사망'); }
  { const r = runTo(Engine.create(L([{ t: 'block', x: 600, y: 0, w: 100, h: 8 }])), 800); ok(!r.state.dead, '8px 턱은 그냥 올라감 (모서리 보정)'); }
  // 모서리 착지 보정: 블록 높이 = 점프 정점 근처에서 하강 중 모서리를 스칠 때
  {
    let saved = 0, total = 0;
    for (let px = 300; px < 620; px += 3) {
      const r = Engine.create(L([{ t: 'block', x: 600, y: 0, w: 300, h: 120 }])); runTo(r, px); r.press(); runTo(r, 950);
      total++; if (!r.state.dead) saved++;
    }
    ok(saved > 0, `120px 블록 단일 점프로 오르기: ${saved}/${total} 시점 성공`);
  }
  // 천장 박치기
  { const r = Engine.create(L([{ t: 'block', x: 500, y: 100, w: 300, h: 40 }])); runTo(r, 520); r.press(); runTo(r, 900); ok(r.state.dead && r.state.cause === 'block', '천장 블록에 머리 → 사망'); }
  // 구멍
  { const r = runTo(Engine.create(L([{ t: 'gap', x: 600, w: 150 }])), 1500); ok(r.state.dead && (r.state.cause === 'gap' || r.state.cause === 'fall'), `구멍 사망 (${r.state.cause})`); }
  { const r = Engine.create(L([{ t: 'gap', x: 600, w: 150 }])); runTo(r, 520); r.press(); runTo(r, 1500); ok(!r.state.dead, '구멍 점프'); }
  { const r = runTo(Engine.create(L([{ t: 'gap', x: 600, w: 2000 }])), 2500); ok(r.state.dead && r.state.cause === 'fall' && r.state.y < -300, '깊이 떨어지면 fall 사망'); }
  // 코요테: 블록 끝을 지난 직후(0.05s) 탭 → 일반 점프(2단 점프 남음)
  {
    const r = Engine.create(L([{ t: 'block', x: 0, y: 0, w: 600, h: 100 }]), { startY: 100 });
    runTo(r, 600); for (let i = 0; i < 12; i++) r.step(); // 0.05s 낙하
    r.press(); r.step();
    const ev = r.events.map(e => e.type);
    ok(ev.includes('jump') && r.state.jumpsLeft === 1, `코요테 점프 (이벤트 ${ev.join(',')})`);
  }
  { const r = Engine.create(L([{ t: 'block', x: 0, y: 0, w: 600, h: 100 }]), { startY: 100 }); runTo(r, 600); for (let i = 0; i < 24; i++) r.step(); r.press(); r.step(); ok(r.events.some(e => e.type === 'djump'), '코요테 지난 뒤(0.1s) 탭 → 2단 점프'); }
  // 버퍼: 2단 점프 소진 후 착지 0.08s 전에 탭 → 착지 즉시 점프
  {
    const r = Engine.create(L([]));
    r.press(); r.step(); for (let i = 0; i < 20; i++) r.step(); r.press(); r.step(); // djump
    let steps = 0; const probe = Engine.create(L([])); probe.restore(r.snapshot());
    while (!probe.state.grounded) { probe.step(); steps++; }
    for (let i = 0; i < steps - 19; i++) r.step(); // 착지 약 0.08s 전
    r.press();
    for (let i = 0; i < 40; i++) r.step();
    const types = r.events.map(e => e.type);
    ok(types.filter(t => t === 'jump').length === 2 && !r.state.grounded, `버퍼 점프 (이벤트 ${types.join(',')})`);
  }
  { // 버퍼 밖(0.15s 전) 탭은 무시
    const r = Engine.create(L([]));
    r.press(); r.step(); for (let i = 0; i < 20; i++) r.step(); r.press(); r.step();
    let steps = 0; const probe = Engine.create(L([])); probe.restore(r.snapshot());
    while (!probe.state.grounded) { probe.step(); steps++; }
    for (let i = 0; i < steps - 36; i++) r.step(); r.press(); for (let i = 0; i < 60; i++) r.step();
    ok(r.events.filter(e => e.type === 'jump').length === 1, '버퍼 밖 탭은 무시');
  }
  // 2단 점프 1회만
  { const r = Engine.create(L([])); r.press(); r.step(); for (let i = 0; i < 30; i++) r.step(); r.press(); r.step(); for (let i = 0; i < 10; i++) r.step(); r.press(); r.step(); ok(r.events.filter(e => e.type === 'djump').length === 1, '2단 점프는 1회'); }
  // 점프대
  { const r = Engine.create(L([{ t: 'pad', x: 400, y: 0 }])); let m = 0; for (let i = 0; i < 400; i++) { r.step(); m = Math.max(m, r.state.y); } ok(Math.abs(m - 260) < 5 && r.events.filter(e => e.type === 'pad').length === 1, `점프대 높이 ${fmt(m)} ≈ 260, 이벤트 1회`); }
  { const r = Engine.create(L([{ t: 'pad', x: 400, y: 0 }])); r.press(); r.step(); r.press(); for (let i = 0; i < 20; i++) r.step(); runTo(r, 420); r.press(); r.step(); ok(r.events.some(e => e.type === 'djump'), '점프대가 2단 점프 회복'); }
  // 오브
  {
    const r = Engine.create(L([{ t: 'orb', x: 600, y: 120 }]));
    runTo(r, 400); r.press(); r.step(); // 점프
    let used = false;
    for (let i = 0; i < 300 && !used; i++) { r.step(); const ox = r.state.x + 17, oy = r.state.y + 17; if (Math.hypot(ox - 600, oy - 120) < 20) { r.press(); r.step(); used = true; } }
    const ev = r.events.map(e => e.type);
    ok(ev.includes('orb') && r.state.jumpsLeft === 1, `오브 점프 (2단 유지) ${ev.join(',')}`);
    r.press(); r.step(); ok(r.events.some(e => e.type === 'djump'), '오브 뒤 2단 점프 가능');
  }
  // 코인 인덱스
  { const r = runTo(Engine.create(L([{ t: 'coin', x: 900, y: 17 }, { t: 'coin', x: 500, y: 17 }, { t: 'coin', x: 700, y: 300 }])), 1000); const c = r.events.filter(e => e.type === 'coin').map(e => e.i); ok(c.join() === '1,0' && r.state.coins.join() === 'true,true,false', `코인 인덱스 = 레벨 배열 순서 (${c})`); }
  // 완주
  { const r = Engine.create(L([], 400, 1000)); for (let i = 0; i < 200; i++) r.update(1 / 60); ok(r.state.done && r.events.some(e => e.type === 'complete') && r.state.progress === 1, '완주 이벤트'); }
  // update 누적기
  { const a = Engine.create(L([])), b = Engine.create(L([])); for (let i = 0; i < 60; i++) a.update(1 / 60); for (let i = 0; i < 240; i++) b.step(); ok(Math.abs(a.state.x - b.state.x) < 1e-6, `고정 스텝 누적 (x=${fmt(a.state.x, 3)})`); }
  // 회전 스냅
  { const r = Engine.create(L([])); r.press(); for (let i = 0; i < 400; i++) r.step(); ok(Math.abs(r.state.rot / (Math.PI / 2) - Math.round(r.state.rot / (Math.PI / 2))) < 1e-9, '착지 시 rot 90° 스냅'); }
  // 성능
  {
    const objs = []; for (let i = 0; i < 600; i++) objs.push({ t: ['spike', 'block', 'saw', 'coin'][i % 4], x: 600 + i * 50, y: i % 4 === 1 ? 300 : 0, w: 40, h: 40, r: 20 });
    const r = Engine.create(L(objs, 400, 40000), { quiet: true }); const t0 = process.hrtime.bigint();
    let n = 0; for (; n < 100000; n++) { r.step(); if (r.state.dead) r.restore([0, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0]); }
    const us = Number(process.hrtime.bigint() - t0) / 1000 / n;
    ok(us < 5, `스텝 비용 ${us.toFixed(3)}µs (600 오브젝트)`);
  }
  console.log(fail ? `  ${fail}개 실패` : '  전부 통과');
  return fail;
}

// ===== main =====
const args = process.argv.slice(2);
const beamI = args.indexOf('--beam');
const BEAM = beamI >= 0 ? +args[beamI + 1] : 3000;
const showTaps = args.includes('--taps');
const lvI = args.indexOf('--levels');
const names = args.filter((a, i) => !a.startsWith('--') && !(beamI >= 0 && i === beamI + 1) && !(lvI >= 0 && i === lvI + 1));

if (args.includes('--phys')) { physTable(); process.exit(0); }

let levels;
let fails = 0;
if (names[0] === 'test') {
  fails += selfTest();
  levels = TEST_LEVELS;
} else {
  const real = hasLevels && Array.isArray(G.LEVELS) ? G.LEVELS : null;
  if (!real) console.log(hasLevels ? '! G.LEVELS 없음 — 내장 테스트 레벨 사용' : '! js/levels.js 없음 — 내장 테스트 레벨 사용');
  const pool = (real || []).concat(TEST_LEVELS);
  levels = names.length ? pool.filter(l => names.includes(l.id)) : (real || TEST_LEVELS);
  if (names.length && !levels.length) { console.log('레벨을 찾을 수 없음: ' + names.join(', ')); process.exit(1); }
}
const results = levels.map(l => verifyLevel(l, BEAM, showTaps));
console.log('\n요약: ' + results.map(r => `${r.id}=${r.solved ? 'OK(' + (r.minWin != null ? r.minWin + 'f' : '-') + ')' : 'FAIL'}`).join('  '));
process.exitCode = fails || results.some(r => !r.solved && r.id !== 'impossible') ? 1 : 0;
