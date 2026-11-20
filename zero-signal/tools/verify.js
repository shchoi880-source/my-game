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
require('../js/run.js');
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
// 훈련(임무) 하위 호환: mods={} 엔진이 SIGNAL RUN 이전 엔진과 같은 점수를 내는지 (자동 파일럿 고정 결과)
const GOLDEN = {
  'echo:normal': [15539, 11, 0, 90],
  'echo:hard': [4301, 26, 3, 52.1917],
  'fracture:normal': [15640, 42, 3, 150],
  'fracture:hard': [1864, 17, 3, 24.15],
  'zero:normal': [12960, 71, 4, 240],
  'zero:hard': [2170, 18, 3, 45.0333],
};
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
  {
    const got = [Math.floor(e.score), e.grazes, e.hits, +e.time.toFixed(4)];
    ok(JSON.stringify(got) === JSON.stringify(GOLDEN[`${m.id}:${mode}`]), `${m.id}/${mode}: 하위 호환 점수 ${got.join('/')}`);
  }
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
// ================================================================ SIGNAL RUN
console.log('\n=== SIGNAL RUN 검증 ===');
const runPilot = (seed) => {
  const rng = G.mulberry(seed);
  return (e) => {
    pilot(e);
    if (rng() < 0.002) e.dash();
  };
};
function playRun(seed, depth, choose, opts = {}) {
  const r = G.Run.create(seed, depth, opts),
    pl = runPilot(seed),
    log = [];
  while (r.state === 'play' || r.state === 'boss') {
    if (opts.tough) {
      r.engine.player.shields = 99;
      r.engine.k.shieldMax = 99;
    }
    G.Run.playSector(r, pl);
    if (r.state === 'pick') {
      const o = G.Run.offers(r);
      log.push(o.map((c) => c.id).join(','));
      const i = choose(r, o);
      if (i < 0) G.Run.skip(r);
      else G.Run.pick(r, i);
    }
    if (r.state === 'shop') {
      G.Run.buy(r, 'repair');
      G.Run.leaveShop(r);
    }
  }
  return { r, s: G.Run.summary(r), log };
}
{
  const first = (r, o) => 0,
    alt = (r, o) => (r.sectorsCleared % 2 ? o.length - 1 : 0);
  const a = playRun(77, 0, alt, { tough: true }),
    b = playRun(77, 0, alt, { tough: true });
  ok(a.s.score === b.s.score && a.log.join('|') === b.log.join('|') && a.s.sectorsCleared === b.s.sectorsCleared,
    `같은 시드 + 같은 선택 → 같은 런 (점수 ${a.s.score}, 섹터 ${a.s.sectorsCleared}, ${a.r.state})`);
  ok(Number.isFinite(a.s.score) && a.s.sectors.length >= 1 && a.s.perks.every((c) => c.name && c.desc), 'run summary 필드');
  // perk picks never change the bullet patterns: idle invulnerable player, sector 2 with/without perks
  const bulletHash = (picks) => {
    const r = G.Run.create(4242, 0, {});
    for (const e of [r.engine]) while (!e.done) {
      e.player.invuln = 1;
      e.step();
      e.consume();
    }
    G.Run.endSector(r);
    for (const id of picks) r.picks.push(id);
    r.offers = [];
    r.state = 'pick';
    G.Run.skip(r);
    const e = r.engine;
    while (e.time < 10) {
      e.player.invuln = 1;
      e.step();
    }
    let h = 0;
    for (const q of e.bullets) h = (h * 31 + Math.round(q.x * 10) * 7 + Math.round(q.y * 10)) % 1e9;
    return `${e.bullets.length}:${h}:${r.sector.features.join('+')}`;
  };
  const h0 = bulletHash([]),
    h1 = bulletHash(['mirror', 'wide', 'amp', 'echo', 'coil', 'crit', 'prism', 'mend', 'reso', 'third', 'cell', 'stasis', 'long']);
  ok(h0 === h1, `퍽 선택이 탄막(10초 시점 해시)을 바꾸지 않음 ${h0}`);
  // draft offers deterministic and separate from bullets
  const o1 = playRun(91, 0, first).log.join('|'),
    o2 = playRun(91, 0, first).log.join('|');
  ok(o1 === o2 && o1.length > 0, `같은 런 시드 → 같은 드래프트 (${o1.split('|')[0]})`);
  // reroll changes offers deterministically, costs shards after the free one
  const r = G.Run.create(5, 0, {});
  while (!r.engine.done) {
    r.engine.player.invuln = 1;
    r.engine.step();
  }
  G.Run.endSector(r);
  const before = G.Run.offers(r).map((c) => c.id).join(),
    cost0 = G.Run.rerollCost(r),
    after = (G.Run.reroll(r) || []).map((c) => c.id).join();
  ok(cost0 === 0 && G.Run.rerollCost(r) === 15 && after && r.offers.length === 3, `리롤 (무료 1회 → 15 파편) ${before} → ${after}`);
  // serialize / restore at the draft
  const snap = G.Run.serialize(r),
    back = G.Run.restore(JSON.parse(JSON.stringify(snap)));
  ok(back && back.state === 'pick' && G.Run.offers(back).map((c) => c.id).join() === after, 'runActive 저장/복원 (드래프트에서 재개)');
  // all perks forced: hitbox untouched, no NaN, idle still hit
  const all = G.Run.create(9, 10, { forced: G.PERKS.map((p) => p.id) }),
    e = all.engine;
  ok(e.player.hit === 5 && !('hit' in e.k) && e.k.grazeR > 27, `모든 퍽 적용: 피격점 5px 유지 (스치기 ${e.k.grazeR}px, 보호막 최대 ${e.k.shieldMax})`);
  e.player.shields = 1e9;
  e.k.shieldMax = 2e9;
  while (!e.done && !e.dead) {
    e.step();
    e.consume();
  }
  ok(e.hits >= 1 && Number.isFinite(e.score), `모든 퍽 + 정지 파일럿도 1섹터에서 피격 (${e.hits}회)`);
  // every sector / depth timeline is valid
  let tlOk = true;
  for (let d = 0; d <= 10; d++) {
    const rr = G.Run.create(1234 + d, d, {});
    for (let i = 0; i < 5; i++) {
      rr.sectorIndex = i;
      rr.carry = rr.carry || { score: 0, shields: 3, combo: 0, energy: 0, dashes: 2 };
      const en = G.Run.startSector(rr),
        tl = en.timeline;
      if (!(tl.events.every((v, j, a) => v.t >= 0 && v.t < en.mission.duration && (!j || v.t >= a[j - 1].t)) &&
          (i === 4 ? tl.spells.length === 4 && tl.bossHp > 0 : tl.events.length > 10))) tlOk = false;
    }
  }
  ok(tlOk, '모든 깊이(0-10) × 섹터(1-5) 타임라인 정렬/보스');
  // shop
  const sh = G.Run.create(3, 0, {});
  sh.state = 'shop';
  sh.carry = { score: 0, shields: 2, combo: 0, energy: 0, dashes: 2 };
  sh.shards = 100;
  sh.picks = ['g_over', 'wide'];
  sh.bought = [];
  const items = G.Run.shopItems(sh).map((x) => x.id);
  ok(items.includes('repair') && items.includes('purge:g_over') && items.includes('upgrade:wide') && items.includes('boost') &&
    G.Run.buy(sh, 'repair') && sh.carry.shields === 3 && sh.shards === 70 && G.Run.buy(sh, 'purge:g_over') && !sh.picks.includes('g_over'),
    `캐시 상품 ${items.join(', ')}`);
}
{
  // save migration: an old v2 save gains every new field; version/key untouched
  const d = G.save.data;
  for (const k of Object.keys(d)) delete d[k];
  Object.assign(d, { version: 2, best: { echo: { score: 100, clear: true, grade: 'A', medals: { clear: 1 } } }, unlocked: 2, totalRuns: 3,
    daily: { streak: 2, last: '20200101' } });
  G.meta.ensure();
  ok(d.version === 2 && d.meta.gems === 0 && d.meta.level === 1 && Array.isArray(d.archive.perks) && d.archive.perks.length === 8 &&
    d.runs.depthMax === 0 && d.runActive === null && d.skins.on === 'default' && d.daily.streak === 2 && d.daily.freezes === 0 &&
    d.daily.run && d.weekly.key && d.stats.nearMiss === 0, '세이브 마이그레이션: 새 필드 기본값 (version 2 유지)');
  // full run through the save-backed API
  const r = G.run.start({ seed: 31 });
  ok(r && r.state === 'play' && r.sector.index === 0 && r.engine instanceof G.Engine && d.runActive, 'G.run.start → 섹터 1 + runActive');
  const pl = runPilot(31);
  while (r.state !== 'over' && r.state !== 'won') {
    if (r.state === 'play' || r.state === 'boss') {
      const e = r.engine;
      while (!e.done && !e.dead) {
        pl(e);
        e.step();
        e.consume();
      }
      G.run.endSector();
    } else if (r.state === 'pick') {
      const o = G.run.offer();
      if (!o.length || !o.every((c) => c.name && c.desc && 'CREL'.includes(c.rarity))) break;
      G.run.pick(0);
    } else if (r.state === 'shop') {
      G.run.shopItems();
      G.run.leaveShop();
    }
  }
  const sum = G.run.finish();
  ok(sum && sum.dataEarned > 0 && d.meta.gems === sum.dataEarned && d.runs.count === 1 && d.runActive === null &&
    typeof sum.share === 'string' && Array.isArray(sum.unlocks),
    `G.run.finish: ◆${sum.dataEarned} · ${sum.sectorsCleared}섹터 · ${sum.share}`);
  ok(G.run.finish() === sum, 'finish 중복 호출 안전');
  d.meta.gems = 1000;
  ok(G.meta.buyPerk('long') && d.archive.perks.includes('long') && d.meta.gems === 940 && !G.meta.buyPerk('long'), 'Archive 퍽 구매');
  ok(!G.meta.buyPerk('g_over') || d.runs.glitchOpen, '글리치는 4섹터 도달 전 잠김');
  ok(G.meta.buySkin('cobalt') && G.meta.equipSkin('cobalt') && G.meta.skin().id === 'cobalt' && !G.meta.equipSkin('void'), '스킨 구매/장착');
  const lv = G.meta.level();
  ok(lv.level >= 1 && lv.need > 0, `파일럿 레벨 Lv${lv.level} (${lv.xp}/${lv.need})`);
  const mr = G.meta.missionReward({ score: 25000 }, G.MISSIONS[0], 'normal', { newMedals: ['clear'], firstClear: true });
  ok(mr.data === 10 + 10 + 25, `훈련 보상 ◆${mr.data}`);
  const w = G.meta.weekly();
  ok(w.bounties.length === 3 && new Set(w.bounties.map((b) => b.id)).size === 3, `주간 현상금 ${w.bounties.map((b) => b.id).join(',')}`);
  // daily run: same seed for everyone, first attempt pays x2
  d.runs.clears = 1;
  const a = G.run.start({ daily: true }),
    seedA = a.seed;
  G.run.current = null;
  const b = G.run.start({ daily: true });
  ok(seedA === b.seed && b.daily === G.meta._dayKey(), '일일 런 시드 고정');
  while (!b.engine.done) {
    b.engine.player.invuln = 1;
    b.engine.step();
  }
  G.run.endSector();
  G.run.skip();
  b.engine.dead = true;
  G.run.endSector();
  const ds = G.run.finish();
  ok(ds.dataEarned === 2 * (Math.floor(ds.score / 1500) + 12 * ds.sectorsCleared) + ds.bounties.length * 80,
    `일일 런 첫 시도 ◆x2 (${ds.dataEarned})`);
  ok(d.daily.last === G.meta._dayKey() && G.meta.streak().days >= 1, `일일 런이 연속 기록에 반영 (${G.meta.streak().days}일)`);
  // streak freeze bridges one missed day
  d.daily.streak = 5;
  d.daily.freezes = 1;
  const dd = new Date();
  d.daily.last = G.meta._dayKey(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - 2));
  G.meta.ensure();
  ok(G.meta.streak().days === 5 && d.daily.freezes === 0, '연속 보호(freeze)가 하루 공백을 메움');
}
console.log(fails ? `\n${fails}개 실패` : '\n모든 엔진 검증 통과');
process.exitCode = fails ? 1 : 0;
