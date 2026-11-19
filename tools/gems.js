'use strict';
// 리듬 젬 배치 생성기 → js/gems.js
// 사용법 (프로젝트 루트에서): node tools/gems.js [lvId ...] [--beam N] [--every 박수(기본 0.5)]
//  1) tools/verify.js의 해답 탐색으로 각 레벨의 탭 스케줄을 구한다.
//  2) 그 경로를 1/240초로 재생하며 반박(half-beat)마다 플레이어 중심에 젬을 놓는다.
//     (시작 2초 활주 구간 이후 ~ 완주 0.5초 전까지)
//  3) 위험물(판정 모양 + 여유) / 블록 / 코인·오브 근처 / 점프대·오브 발사 직후 0.25초는 건너뛴다.
//  4) 같은 경로를 다시 돌려 모든 젬이 한 번의 정상 플레이로 전부 먹히는지 검증한다.
// 레벨이 바뀌면 다시 실행할 것.
const fs = require('fs');
const path = require('path');

global.__NO_GEMS = true;                 // 기존 js/gems.js는 불러오지 않음
const V = require('./verify.js');
const { Engine, PHYS } = G;

const GEM_VIS = 14;          // 젬 그림 반지름(대략) — 겹침 판정용
const HAZ_PAD = 10;          // 위험물 판정 모양을 이만큼 부풀려서 피함
const NEAR_ITEM = 40;        // 코인/오브 중심에서 이 거리 이내는 생략
const LAUNCH_QUIET = 0.25;   // 점프대/오브 발사 직후 생략 시간(초)
const RUNWAY = 2.0, TAIL = 0.5;
const ei = process.argv.indexOf('--every');
const EVERY = ei >= 0 ? +process.argv[ei + 1] : 0.5;   // 젬 간격(박). 기본 반박

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function triDist(px, py, v) {
  const s = (ax, ay, bx, by) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d1 = s(v[0], v[1], v[2], v[3]), d2 = s(v[2], v[3], v[4], v[5]), d3 = s(v[4], v[5], v[0], v[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(neg && pos)) return 0; // 내부
  return Math.min(segDist(px, py, v[0], v[1], v[2], v[3]), segDist(px, py, v[2], v[3], v[4], v[5]), segDist(px, py, v[4], v[5], v[0], v[1]));
}
function circleRect(cx, cy, r, x0, y0, x1, y1) {
  const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
  const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
  return dx * dx + dy * dy < r * r;
}

function blockedReason(objs, gx, gy) {
  for (const o of objs) {
    if (o.t === 'gem' || o.t === 'gap' || o.t === 'pad') continue;
    if (Math.abs((o.x || 0) - gx) > 400) continue;
    if (o.t === 'spike') { if (triDist(gx, gy, o._hit) < GEM_VIS + HAZ_PAD) return 'spike'; }
    else if (o.t === 'saw') {
      const p = o.period || 2;
      for (let i = 0; i < 48; i++) {
        const q = Engine.sawPos(o, p * i / 48);
        if (Math.hypot(q.x - gx, q.y - gy) < o._hr + GEM_VIS + HAZ_PAD) return 'saw';
      }
    } else if (o.t === 'block') { if (circleRect(gx, gy, GEM_VIS, o.x, o.y || 0, o.x + o.w, (o.y || 0) + o.h)) return 'block'; }
    else if (o.t === 'coin' || o.t === 'orb') { if (Math.hypot(o.x - gx, o.y - gy) < NEAR_ITEM) return o.t; }
  }
  return null;
}

// 탭 스케줄을 1/240초 스텝 단위로 재생: 스텝별 중심 좌표 + 발사 이벤트 시각
function trace(level, taps) {
  const run = Engine.create(level);
  const set = new Set(taps);
  const cx = [], cy = [], launches = [];
  cx.push(run.state.x + PHYS.size / 2); cy.push(run.state.y + PHYS.size / 2);
  let n = 0;
  for (let k = 0; !run.state.dead && !run.state.done; k++) {
    if (set.has(k)) run.press();
    for (let i = 0; i < V.TICK_STEPS && !run.state.dead && !run.state.done; i++) {
      run.step(); n++;
      cx.push(run.state.x + PHYS.size / 2); cy.push(run.state.y + PHYS.size / 2);
      while (run.events.length) { const e = run.events.shift(); if (e.type === 'pad' || e.type === 'orb') launches.push(n * PHYS.step); }
    }
    if (k > 1e6) break;
  }
  return { cx, cy, launches, done: run.state.done, steps: n, objects: run.objects };
}

function placeGems(level, taps) {
  const tr = trace(level, taps);
  if (!tr.done) throw new Error(level.id + ': 해답 재생 실패');
  const hb = EVERY * 60 / level.bpm, finT = tr.steps * PHYS.step;
  const gems = [], skipped = {};
  for (let k = Math.ceil(RUNWAY / hb - 1e-9); k * hb <= finT - TAIL + 1e-9; k++) {
    const t = k * hb, n = Math.round(t / PHYS.step);
    if (n >= tr.cx.length) break;
    const gx = Math.round(tr.cx[n] * 10) / 10, gy = Math.round(tr.cy[n] * 10) / 10;
    let why = tr.launches.some(lt => t >= lt && t < lt + LAUNCH_QUIET) ? 'launch' : null;
    if (!why) why = blockedReason(tr.objects, gx, gy);
    if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }
    gems.push({ t: 'gem', x: gx, y: gy });
  }
  return { gems, skipped };
}

function validate(level, taps, gems) {
  const lv = Object.assign({}, level, { objects: level.objects.concat(gems) });
  const r = V.simulate(lv, taps, { events: true });
  const s = r.run.state;
  return { done: r.done, got: s.gems, total: r.run.gemCount, maxCombo: s.maxCombo, score: s.score };
}

function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf('--beam');
  const beam = bi >= 0 ? +args[bi + 1] : 3000;
  const ids = args.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1) && !(ei >= 0 && i === ei - 1));
  if (!Array.isArray(G.LEVELS)) { console.log('G.LEVELS 없음 (js/levels.js)'); process.exit(1); }
  const out = path.join(__dirname, '..', 'js', 'gems.js');
  // 일부 레벨만 다시 만들 때는 기존 파일의 다른 레벨 데이터 유지
  let data = {};
  if (ids.length && fs.existsSync(out)) {
    const m = fs.readFileSync(out, 'utf8').match(/const D = (\{[\s\S]*?\});\n/);
    if (m) data = JSON.parse(m[1]);
  }
  let bad = 0;
  for (const level of G.LEVELS) {
    if (ids.length && !ids.includes(level.id)) continue;
    const t0 = Date.now();
    const sol = V.solveLevel(level, beam);
    if (!sol.solved) { console.log(`${level.id}: 풀이 실패 — 젬 생성 생략`); bad++; continue; }
    const { gems, skipped } = placeGems(level, sol.taps);
    const v = validate(level, sol.taps, gems);
    const ok = v.done && v.got === gems.length && v.total === gems.length;
    if (!ok) bad++;
    data[level.id] = [].concat(...gems.map(g => [g.x, g.y]));
    const sk = Object.entries(skipped).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${level.id}: 젬 ${gems.length}개 (생략: ${sk || '없음'})  검증 ${ok ? 'OK' : 'FAIL'} — 한 번의 해답 경로로 ${v.got}/${v.total} 획득, 최대콤보 ${v.maxCombo}, 점수 ${v.score}  [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  }
  const body = Object.keys(data).map(id => `    ${JSON.stringify(id)}: [${data[id].join(',')}]`).join(',\n');
  const src = `'use strict';
// generated by tools/gems.js — do not edit
// 리듬 젬 배치: 레벨 id → [x, y, x, y, ...] (젬 중심). levels.js 다음, engine.js 전에 로드.
// 레벨을 고친 뒤에는 \`node tools/gems.js\` 로 다시 생성할 것.
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const G = root.G = root.G || {};
  const D = {
${body}
  };
  for (const id in D) {
    const lv = (G.LEVELS || []).find(l => l.id === id);
    if (!lv || lv._gemsAdded) continue;
    lv._gemsAdded = true;
    const a = D[id];
    for (let i = 0; i < a.length; i += 2) lv.objects.push({ t: 'gem', x: a[i], y: a[i + 1] });
  }
})();
`;
  fs.writeFileSync(out, src);
  console.log(`→ ${path.relative(process.cwd(), out)} 저장 (${Object.keys(data).length}개 레벨)`);
  process.exitCode = bad ? 1 : 0;
}

if (require.main === module) main();
