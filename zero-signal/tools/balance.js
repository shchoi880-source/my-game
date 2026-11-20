'use strict';
// Balance harness: proves "hard but humanly beatable".
//   node tools/balance.js            full gate run (exit code 1 on failure)
//   node tools/balance.js --quick    fewer seeds, no gate
//   node tools/balance.js --mission zero --mode hard
global.window = global;
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, writable: true, configurable: true });
global.localStorage = { getItem: () => null, setItem() {} };
global.matchMedia = () => ({ matches: false });
require('../js/core.js');
require('../js/patterns.js');
require('../js/engine.js');

const args = process.argv.slice(2),
  arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null),
  QUICK = args.includes('--quick'),
  SEEDS = +(arg('--seeds') || (QUICK ? 4 : 10)),
  ONLY_M = arg('--mission'),
  ONLY_MODE = arg('--mode'),
  PILOT = arg('--pilot');
const seedOf = (m, k) => (m.seed * 7919 + k * 104729) >>> 0;

// ---------------------------------------------------------------- pilots
const DIRS = (n) => {
  const out = [[0, 0]];
  for (let i = 0; i < n; i++) out.push([Math.cos((i * G.TAU) / n), Math.sin((i * G.TAU) / n)]);
  return out;
};
const D16 = DIRS(16),
  D24 = DIRS(24);
// distance from point to laser lane (ray)
function laneDist(w, x, y) {
  const ux = Math.cos(w.angle),
    uy = Math.sin(w.angle),
    dx = x - w.x,
    dy = y - w.y,
    along = dx * ux + dy * uy;
  if (along < 0) return Math.hypot(dx, dy);
  return Math.abs(dx * uy - dy * ux);
}
// Evaluate candidate moves. Returns {dir, focus, clear} where clear = predicted min clearance for the pick.
function choose(e, cfg) {
  const p = e.player,
    taus = cfg.taus,
    margin = cfg.margin;
  let best = null;
  const near = e.bullets.filter((b) => Math.abs(b.x - p.x) < 420 && Math.abs(b.y - p.y) < 420),
    warns = e.warnings.filter((w) => w.t < taus[taus.length - 1] + 0.35);
  for (const focus of [false, true]) {
    const spd = focus ? 210 : 350;
    for (const d of cfg.dirs) {
      if (focus && d[0] === 0 && d[1] === 0) continue;
      let risk = 0,
        minC = 1e9,
        minNow = 1e9,
        gz = 0;
      let fx = 0,
        fy = 0;
      for (const tau of taus) {
        // velocity blends from current toward target (accel ~2900)
        const blend = Math.min(1, tau / 0.12),
          vx = p.vx * (1 - blend) + d[0] * spd * blend,
          vy = p.vy * (1 - blend) + d[1] * spd * blend,
          x = G.clamp(p.x + vx * tau, e.left + p.r, e.right - p.r),
          y = G.clamp(p.y + vy * tau, e.top + p.r, e.bottom - p.r);
        fx = x;
        fy = y;
        const w = 1 / (0.35 + tau);
        for (const b of near) {
          const bx = b.x + b.vx * tau,
            by = b.y + b.vy * tau,
            c = Math.hypot(x - bx, y - by) - b.r - p.hit;
          if (c < minC) minC = c;
          if (tau <= 0.12 && c < minNow) minNow = c;
          if (c < margin) risk += (margin - c) * (margin - c) * w + (c < 3 ? 4000 * w : 0);
          else if (cfg.graze && c < 24) gz += 1;
        }
        for (const wr of warns)
          if (wr.t < tau + 0.35) {
            const c = laneDist(wr, x, y) - wr.w / 2 - p.hit - 8;
            if (c < margin) risk += (margin - c) * (margin - c) * w * 2 + (c < 3 ? 4000 * w : 0);
          }
      }
      // walls are big and slow: a player reads them from far away. Check "move there, then wait" against walls.
      if (cfg.far)
        for (const tau of cfg.far)
          for (const b of e.bullets) {
            if (b.kind !== 'wall') continue;
            const c = Math.hypot(fx - b.x - b.vx * tau, fy - b.y - b.vy * tau) - b.r - p.hit;
            if (c < margin) risk += (margin - c) * (margin - c) * 0.5;
          }
      risk += Math.hypot(fx - 640, fy - 500) * cfg.home;
      const edge = Math.min(fx - e.left, e.right - fx, fy - e.top, e.bottom - fy);
      if (edge < 70) risk += (70 - edge) * 3;
      if (cfg.graze) risk -= gz * cfg.graze;
      if (!best || risk < best.risk) best = { risk, dir: d, focus, clear: minNow };
    }
  }
  return best;
}
function makePilot(kind, rngSeed) {
  const rng = G.mulberry(rngSeed);
  if (kind === 'idle') return { act() {} };
  const human = kind === 'human';
  const cfg = human
    ? { dirs: D16, taus: [0.05, 0.12, 0.2, 0.3, 0.5, 0.8], margin: 40, home: 0.03, graze: 0, far: [1.1, 1.5, 2] }
    : { dirs: D24, taus: [0.04, 0.1, 0.2, 0.32, 0.5], margin: 12, home: 0.02, graze: 15, far: [0.8, 1.2, 1.8] };
  if (process.env.PCFG) Object.assign(cfg, JSON.parse(process.env.PCFG)[kind] || {});
  let n = 0,
    lastDash = -99,
    held = [0, 0, false];
  return {
    act(e) {
      const every = human ? 22 : 2;
      if (n++ % every === 0) {
        const c = choose(e, cfg);
        let [dx, dy] = c.dir;
        if (human && (dx || dy)) {
          const a = Math.atan2(dy, dx) + ((rng() - 0.5) * 20 * Math.PI) / 180;
          dx = Math.cos(a);
          dy = Math.sin(a);
        }
        held = [dx, dy, c.focus];
        const gap = human ? 4 : 0.5;
        if (c.clear < (human ? 4 : 1) && e.player.dashes > 0 && e.time - lastDash > gap && e.player.invuln <= 0) {
          lastDash = e.time;
          if (!dx && !dy) e.setInput(0, 1, false);
          e.dash();
        }
      }
      e.setInput(held[0], held[1], held[2]);
    },
  };
}

// ---------------------------------------------------------------- run
function run(m, mode, seed, kind) {
  const e = new G.Engine(m, { mode, seed }),
    pilot = makePilot(kind, seed ^ 0x5bd1e995),
    nSec = e.timeline.sections.length,
    secHits = new Array(nSec).fill(0),
    secSum = new Array(nSec).fill(0),
    secN = new Array(nSec).fill(0),
    secPeak = new Array(nSec).fill(0);
  if (kind === 'idle') e.player.shields = 1e9;
  const hitKinds = {},
    origHit = e.hit.bind(e);
  e.hit = () => {
    let bk = '?',
      bd = 1e9;
    for (const b of e.bullets) {
      const d = Math.hypot(b.x - e.player.x, b.y - e.player.y) - b.r;
      if (d < bd) (bd = d), (bk = b.kind);
    }
    const key = `${e.sectionIndex}:${bk}`;
    hitKinds[key] = (hitKinds[key] || 0) + 1;
    origHit();
  };
  let lastHits = 0;
  while (!e.done && !e.dead) {
    pilot.act(e);
    e.step();
    const s = e.sectionIndex;
    if (e.hits > lastHits) secHits[s] += e.hits - lastHits;
    lastHits = e.hits;
    secSum[s] += e.bullets.length;
    secN[s]++;
    secPeak[s] = Math.max(secPeak[s], e.bullets.length);
    e.consume();
  }
  const st = e.stats();
  return { st, hitKinds, secHits, secAvg: secSum.map((v, i) => v / (secN[i] || 1)), secPeak, boss: e.boss };
}

// ---------------------------------------------------------------- report + gates
if (require.main !== module) {
  module.exports = { run, makePilot, choose, seedOf };
  return;
}
let fails = 0;
const gate = (ok, msg) => {
  if (QUICK) return;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const pad = (s, n) => String(s).padEnd(n);
const missions = G.MISSIONS.filter((m) => !ONLY_M || m.id === ONLY_M),
  modes = ['normal', 'hard'].filter((x) => !ONLY_MODE || x === ONLY_MODE),
  table = [];
for (const m of missions)
  for (const mode of modes) {
    console.log(`\n=== ${m.id} / ${mode} (${SEEDS} seeds) ===`);
    const idle = [],
      human = [],
      expert = [];
    for (let k = 0; k < SEEDS; k++) {
      const seed = seedOf(m, k);
      if (!PILOT || PILOT === 'idle') idle.push(run(m, mode, seed, 'idle'));
      if (!PILOT || PILOT === 'human') human.push(run(m, mode, seed, 'human'));
      if (!PILOT || PILOT === 'expert') expert.push(run(m, mode, seed, 'expert'));
    }
    const nSec = 5,
      idleMin = [...Array(nSec)].map((_, s) => (idle.length ? Math.min(...idle.map((r) => r.secHits[s])) : 0)),
      hClear = human.filter((r) => r.st.clear).length,
      hClear1 = human.filter((r) => r.st.clear && r.st.hits <= 2).length,
      xNoHit = expert.filter((r) => r.st.clear && r.st.hits === 0).length,
      xClear = expert.filter((r) => r.st.clear).length,
      avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1),
      secAvg = [...Array(nSec)].map((_, s) => avg(human.map((r) => r.secAvg[s])).toFixed(0)),
      secPeak = [...Array(nSec)].map((_, s) => Math.max(0, ...human.map((r) => r.secPeak[s]))),
      deaths = human.filter((r) => !r.st.clear).map((r) => r.st.deathSection + 1),
      grades = (rs) => rs.map((r) => r.st.grade).join(''),
      sc = (rs) => rs.map((r) => r.st.score).sort((a, b) => a - b),
      bd = expert.reduce(
        (a, r) => {
          for (const k in r.st.breakdown) a[k] += r.st.breakdown[k];
          return a;
        },
        { passive: 0, graze: 0, phase: 0, bonus: 0 },
      ),
      bdTot = bd.passive + bd.graze + bd.phase + bd.bonus || 1;
    console.log(`  idle hits/section (min over seeds): ${idleMin.join(' / ')}`);
    console.log(`  bullets avg/peak per section (human): ${secAvg.map((a, i) => `${a}/${secPeak[i]}`).join('  ')}`);
    console.log(
      `  human : clear ${hClear}/${SEEDS} (<=2 hits ${hClear1}) · deaths in section ${deaths.join(',') || '-'} · avg hits ${avg(human.map((r) => r.st.hits)).toFixed(1)} · dashes ${avg(human.map((r) => r.st.dashes)).toFixed(1)} · grades ${grades(human)}`,
    );
    console.log(`          scores ${sc(human).join(' ')}`);
    const hk = {};
    for (const r of human) for (const k in r.hitKinds) hk[k] = (hk[k] || 0) + r.hitKinds[k];
    console.log(`          hits by section:kind ${Object.entries(hk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(
      `  expert: clear ${xClear}/${SEEDS} · no-hit ${xNoHit}/${SEEDS} · boss broken ${expert.filter((r) => r.st.bossBroken).length} (dmg ${avg(expert.map((r) => r.boss.max - r.boss.hp)).toFixed(0)}/${expert[0] ? expert[0].boss.max : 0}) · overdrives ${avg(expert.map((r) => r.st.overdrives)).toFixed(1)} · grazes ${avg(expert.map((r) => r.st.grazes)).toFixed(0)} · grades ${grades(expert)}`,
    );
    console.log(`          scores ${sc(expert).join(' ')}`);
    console.log(
      `          score mix: passive ${((100 * bd.passive) / bdTot).toFixed(0)}% graze ${((100 * bd.graze) / bdTot).toFixed(0)}% phase ${((100 * bd.phase) / bdTot).toFixed(0)}% bonus ${((100 * bd.bonus) / bdTot).toFixed(0)}%`,
    );
    gate(
      idleMin.every((h) => h >= 1),
      'standing still is hit in every section',
    );
    if (mode === 'normal') gate(hClear >= Math.ceil(SEEDS * 0.8), `human clears Normal >= 8/10 (${hClear}/${SEEDS})`);
    else
      gate(
        hClear >= Math.round(SEEDS * 0.3) && hClear <= Math.round(SEEDS * 0.7),
        `human clears Hard 3-7/10 (${hClear}/${SEEDS})`,
      );
    if (mode === 'hard') gate(xNoHit >= 1, `expert no-hits Hard at least once (${xNoHit}/${SEEDS})`);
    table.push({ m: m.id, mode, idle: idleMin.join('/'), human: `${hClear}/${SEEDS}`, expert: `${xNoHit}/${SEEDS}`, dens: secAvg.join('/') });
  }
console.log('\nmission   mode    idle hits/sec   human clear  expert no-hit  avg bullets/section');
for (const r of table)
  console.log(`${pad(r.m, 10)}${pad(r.mode, 8)}${pad(r.idle, 16)}${pad(r.human, 13)}${pad(r.expert, 15)}${r.dens}`);
if (!QUICK) console.log(fails ? `\n${fails} balance gate(s) FAILED` : '\nall balance gates passed');
process.exitCode = fails ? 1 : 0;
