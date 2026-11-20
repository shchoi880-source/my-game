'use strict';
global.window = global;
// Node 21+ 에서는 navigator 가 읽기 전용 → defineProperty 로 덮어씀
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, writable: true, configurable: true });
global.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
};
global.matchMedia = () => ({ matches: false });
require('../js/core.js');
require('../js/patterns.js');
require('../js/engine.js');
let fails = 0;
const ok = (v, msg) => {
  console.log(`${v ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!v) fails++;
};
function pilot(e) {
  const p = e.player,
    dirs = [[0, 0]];
  for (let i = 0; i < 16; i++) dirs.push([Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]);
  let best = dirs[0],
    bestRisk = Infinity,
    min = 999;
  for (const b of e.bullets) min = Math.min(min, Math.hypot(p.x - b.x, p.y - b.y) - b.r);
  for (const d of dirs) {
    const x = G.clamp(p.x + d[0] * 115, e.left + 18, e.right - 18),
      y = G.clamp(p.y + d[1] * 115, e.top + 18, e.bottom - 18);
    let risk = Math.hypot(x - 640, y - 410) * 0.02;
    for (const b of e.bullets) {
      const bx = b.x + b.vx * 0.34,
        by = b.y + b.vy * 0.34,
        dist = Math.hypot(x - bx, y - by) - b.r;
      if (dist < 105) risk += (105 - dist) * (105 - dist);
    }
    if (risk < bestRisk) {
      bestRisk = risk;
      best = d;
    }
  }
  e.setInput(best[0], best[1], min < 55);
  if (min < 20 && p.dashes > 0) e.dash();
}
console.log('=== ZERO SIGNAL 엔진 검증 ===');
for (const m of G.MISSIONS) for (const mode of ['normal', 'hard']) {
  const tl = G.makeTimeline(m, mode);
  ok(tl.events.length > 20, `${m.id}/${mode}: 패턴 ${tl.events.length}개 · 스펠 ${tl.spells.length}개`);
  ok(
    tl.events.every((v, i, a) => v.t >= 0 && v.t < m.duration && (!i || v.t >= a[i - 1].t)),
    `${m.id}/${mode}: 타임라인 정렬/범위`,
  );
  const e = new G.Engine(m, { mode });
  let max = 0,
    finite = true,
    kinds = true,
    phases = 0;
  for (let n = 0; n < m.duration * 120 + 5 && !e.done && !e.dead; n++) {
    pilot(e);
    e.step();
    for (const ev of e.consume()) if (ev.type === 'bossPhase') phases++;
    max = Math.max(max, e.bullets.length);
    if (e.bullets.some((b) => typeof b.kind !== 'string')) kinds = false;
    const p = e.player;
    if (
      !Number.isFinite(p.x + p.y + e.score) ||
      e.bullets.some((b) => !Number.isFinite(b.x + b.y + b.vx + b.vy))
    )
      finite = false;
  }
  ok(finite, `${m.id}/${mode}: NaN/Infinity 없음`);
  ok(kinds, `${m.id}/${mode}: 모든 탄환에 kind`);
  ok(max <= e.bulletCap, `${m.id}/${mode}: 탄환 상한 ${max}/${e.bulletCap}`);
  ok(e.done || e.dead, `${m.id}/${mode}: 시뮬레이션 종료`);
  const st = e.stats();
  ok(
    st.mode === mode &&
      typeof st.bossBroken === 'boolean' &&
      Number.isInteger(st.dashes) &&
      G.GRADE_ORDER.includes(st.grade) &&
      st.sectionTimes.length === tl.sections.length &&
      st.deathSection === (e.dead ? e.sectionIndex : -1),
    `${m.id}/${mode}: stats 필드 (grade ${st.grade})`,
  );
  ok(!e.done || phases >= 1, `${m.id}/${mode}: 보스 스펠 진행 ${phases}회`);
  ok(typeof G.nextGoal(st, m, mode) === 'string', `${m.id}/${mode}: 다음 목표 "${G.nextGoal(st, m, mode)}"`);
  console.log(
    `    자동 파일럿: ${e.done ? 'CLEAR' : 'DOWN'} · ${e.time.toFixed(1)}초 · 보호막 ${e.player.shields} · 최대 탄환 ${max}`,
  );
}
{
  const m = G.MISSIONS[1],
    e = new G.Engine(m, { mode: 'hard', seed: 7 });
  ok(e.mode === 'hard' && e.player.hit === new G.Engine(m).player.hit, 'Hard 모드: 같은 피격점');
  ok(new G.Engine(m, 'hard').mode === 'hard' && new G.Engine(m).mode === 'normal', 'mode 기본값/문자열 인자');
  // jump to the boss and check boss state, phase events, warnings and the break event
  while (e.time < e.timeline.bossStart + 0.01) {
    e.player.invuln = 1;
    e.step();
  }
  const evs = e.consume();
  ok(e.boss.active && e.boss.hp === e.boss.max && typeof e.boss.name === 'string', `보스 활성 (${e.boss.name})`);
  ok(evs.some((v) => v.type === 'bossPhase'), 'bossPhase 이벤트');
  let warned = false;
  for (let i = 0; i < 120 * 40 && !e.done; i++) {
    e.player.invuln = 1;
    e.step();
    if (e.warnings.some((w) => w.kind === 'laser' && Number.isFinite(w.angle + w.w + w.h + w.t + w.life))) warned = true;
  }
  ok(warned, '레이저 경고(warnings) 데이터');
  const f = new G.Engine(m, { mode: 'normal' });
  while (f.time < f.timeline.bossStart + 0.01) {
    f.player.invuln = 1;
    f.step();
  }
  f.consume();
  f.damage(f.boss.max);
  ok(f.boss.broken && !f.boss.active && f.consume().some((v) => v.type === 'bossBreak'), 'bossBreak 이벤트');
  const base = { clear: true, hits: 0, dashes: 0, score: 1e9 };
  ok(
    G.gradeRun(base, m, 'normal') === 'SS' &&
      G.gradeRun({ ...base, dashes: 3 }, m, 'normal') === 'S' &&
      G.gradeRun({ ...base, hits: 1 }, m, 'normal') === 'A' &&
      G.gradeRun({ ...base, hits: 4, score: 0 }, m, 'normal') === 'C' &&
      G.gradeRun({ ...base, clear: false }, m, 'normal') === 'D',
    'gradeRun 등급 규칙',
  );
}
{
  const a = new G.Engine(G.MISSIONS[0]),
    b = new G.Engine(G.MISSIONS[0]);
  for (let i = 0; i < 1200; i++) a.update(1 / 60);
  for (let i = 0; i < 2400; i++) b.update(1 / 120);
  ok(Math.abs(a.time - b.time) < 1e-8 && a.bullets.length === b.bullets.length, '60Hz/120Hz 고정 스텝 일치');
}
{
  const e = new G.Engine(G.MISSIONS[0]);
  e.spawn(640, 560, 0, 0, { r: 8 });
  e.step();
  ok(e.player.shields === 2 && e.player.invuln > 0, '피격과 중복 피격 방지 시작');
  e.spawn(640, 560, 0, 0, { r: 8 });
  e.step();
  ok(e.player.shields === 2, '무적 시간 중 중복 피격 없음');
}
console.log(fails ? `\n${fails}개 실패` : '\n모든 엔진 검증 통과');
process.exitCode = fails ? 1 : 0;
