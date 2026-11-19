'use strict';
// 게임 데이터: 영웅, 무기, 월드/스테이지, 몬스터, 보스, 미션, 업적, 강화
(() => {
  const MD = window.MD;

  // ===== 영웅 =====
  // dmg/rate: 공격력/연사 배율, skill: 스킬 종류
  MD.HEROES = [
    { id: 'soldier', name: '솔저', sprite: 'soldier1', cost: 0, dmg: 1.0, rate: 1.0, skill: 'volley', skillName: '일제 사격', desc: '5초간 연사 속도 3배' },
    { id: 'survivor', name: '서바이버', sprite: 'survivor1', cost: 400, dmg: 1.08, rate: 1.0, skill: 'grenade', skillName: '수류탄', desc: '전방에 큰 폭발을 일으켜요' },
    { id: 'ranger', name: '레인저', sprite: 'womanGreen', cost: 900, dmg: 1.0, rate: 1.12, skill: 'heal', skillName: '응급 처치', desc: '잃은 병력의 50%를 되살려요' },
    { id: 'guardian', name: '가디언', sprite: 'manBlue', cost: 1600, dmg: 1.12, rate: 1.0, skill: 'shield', skillName: '방어막', desc: '7초간 모든 피해를 막아요' },
    { id: 'pyro', name: '파이로', sprite: 'manBrown', cost: 2800, dmg: 1.18, rate: 1.05, skill: 'flame', skillName: '화염 폭풍', desc: '화면의 모든 적을 불태워요' },
    { id: 'sniper', name: '스나이퍼', sprite: 'hitman1', cost: 4500, dmg: 1.35, rate: 0.9, skill: 'snipe', skillName: '헤드샷', desc: '가장 강한 적에게 치명타' },
    { id: 'chrono', name: '크로노', sprite: 'manOld', cost: 7000, dmg: 1.25, rate: 1.1, skill: 'slow', skillName: '시간 정지', desc: '6초간 적을 거의 멈춰요' },
    { id: 'mecha', name: '메카', sprite: 'robot1', cost: 11000, dmg: 1.45, rate: 1.15, skill: 'laser', skillName: '메가 레이저', desc: '4초간 관통 레이저 발사' },
  ];
  MD.heroById = id => MD.HEROES.find(h => h.id === id) || MD.HEROES[0];
  MD.heroUpCost = lv => Math.round(60 * Math.pow(1.32, lv - 1));
  MD.HERO_MAX = 30;

  // ===== 무기 =====
  MD.WEAPONS = [
    { id: 'pistol', name: '권총', pose: 'gun', cost: 0, dmg: 1.0, rate: 1.0, bullets: 1.0, spread: 0, pierce: 0, sfx: 'shoot_pistol', desc: '균형 잡힌 기본 무기' },
    { id: 'smg', name: '기관단총', pose: 'machine', cost: 700, dmg: 0.6, rate: 2.0, bullets: 1.0, spread: 1, pierce: 0, sfx: 'shoot_smg', desc: '빠른 연사, 넓은 탄막' },
    { id: 'shotgun', name: '샷건', pose: 'hold', cost: 1800, dmg: 0.62, rate: 0.75, bullets: 2.4, spread: 3, pierce: 0, sfx: 'shoot_shotgun', desc: '한 번에 여러 발, 넓게 퍼짐' },
    { id: 'rifle', name: '저격총', pose: 'silencer', cost: 3500, dmg: 3.0, rate: 0.45, bullets: 0.8, spread: 0, pierce: 2, sfx: 'shoot_rifle', desc: '강력한 한 발, 적을 관통' },
  ];
  MD.weaponById = id => MD.WEAPONS.find(w => w.id === id) || MD.WEAPONS[0];
  MD.weaponUpCost = lv => Math.round(50 * Math.pow(1.3, lv - 1));
  MD.WEAPON_MAX = 30;

  // ===== 영구 강화 =====
  MD.UPGRADES = [
    { key: 'troops', name: '시작 병력', max: 30, eff: l => `${5 + l * 3}명`, cost: l => Math.round(30 * Math.pow(1.45, l)) },
    { key: 'power', name: '기본 화력', max: 40, eff: l => `+${l * 15}%`, cost: l => Math.round(40 * Math.pow(1.38, l)) },
    { key: 'charge', name: '스킬 충전', max: 20, eff: l => `+${l * 8}%`, cost: l => Math.round(60 * Math.pow(1.5, l)) },
    { key: 'bonus', name: '코인 보너스', max: 20, eff: l => `+${l * 10}%`, cost: l => Math.round(80 * Math.pow(1.6, l)) },
  ];

  // 현재 장비 기준 배율들
  MD.stats = () => {
    const s = MD.save;
    const h = MD.heroById(s.hero), w = MD.weaponById(s.weapon);
    const hl = (s.heroes[h.id] || { lv: 1 }).lv, wl = (s.weapons[w.id] || { lv: 1 }).lv;
    const dmgMul = h.dmg * (1 + (hl - 1) * 0.1) * w.dmg * (1 + (wl - 1) * 0.1) * (1 + s.up.power * 0.15);
    return {
      hero: h, weapon: w, heroLv: hl, weaponLv: wl,
      dmgMul, rateMul: h.rate * w.rate,
      startN: 5 + s.up.troops * 3,
      coinMul: 1 + s.up.bonus * 0.1,
      chargeMul: 1 + s.up.charge * 0.08,
    };
  };
  // 전투력 (표시용)
  MD.power = () => {
    const st = MD.stats();
    return Math.round(100 * st.dmgMul * st.rateMul * Math.pow(st.startN / 5, 0.35));
  };

  // ===== 월드 / 스테이지 =====
  MD.WORLDS = [
    {
      name: '초록 초원', sub: 'Green Meadow', tiles: ['tile_01', 'tile_02', 'tile_03', 'tile_04'], ground: '#4cae62',
      deco: ['deco_183', 'deco_235', 'deco_210', 'deco_134', 'deco_237', 'deco_240'], side: ['deco_183', 'deco_235', 'deco_183'],
      colors: { grunt: 'green', runner: 'blue', tank: 'green', splitter: 'yellow', boss: 'green' },
      music: 'w1', ambient: null, sky: '#1d3b2a',
    },
    {
      name: '모래 사막', sub: 'Dune Desert', tiles: ['tile_05', 'tile_06'], ground: '#c98a4a',
      deco: ['deco_186', 'deco_236', 'deco_238', 'deco_156', 'deco_157', 'deco_129'], side: ['deco_186', 'deco_236', 'deco_157'],
      colors: { grunt: 'yellow', runner: 'red', tank: 'yellow', splitter: 'red', boss: 'red' },
      music: 'w2', ambient: 'dust', sky: '#3b2a1d',
    },
    {
      name: '얼음 설원', sub: 'Frost Field', tiles: ['tile_07', 'tile_08', 'tile_09', 'tile_10'], ground: '#a9c4c9',
      deco: ['deco_237', 'deco_238', 'deco_239', 'deco_262', 'deco_263'], side: ['deco_239', 'deco_237', 'deco_238'],
      colors: { grunt: 'white', runner: 'blue', tank: 'white', splitter: 'blue', boss: 'blue' },
      music: 'w3', ambient: 'snow', sky: '#1d2a3b',
    },
    {
      name: '용암 요새', sub: 'Lava Fortress', tiles: ['tile_127', 'tile_128', 'tile_154', 'tile_155'], ground: '#3a3a44',
      deco: ['deco_239', 'deco_264', 'deco_157', 'deco_237'], side: ['deco_239', 'deco_157', 'deco_238'],
      colors: { grunt: 'red', runner: 'dark', tank: 'dark', splitter: 'red', boss: 'dark' },
      music: 'w4', ambient: 'ember', sky: '#2a1414', tint: 'rgba(255,60,20,0.12)',
    },
  ];
  MD.STAGES_PER_WORLD = 5;
  MD.STAGE_COUNT = MD.WORLDS.length * MD.STAGES_PER_WORLD;
  MD.stageInfo = i => {
    const w = Math.floor(i / MD.STAGES_PER_WORLD), sub = i % MD.STAGES_PER_WORLD;
    const world = MD.WORLDS[w];
    const isWorldBoss = sub === MD.STAGES_PER_WORLD - 1;
    const boss = MD.BOSSES[isWorldBoss ? w : (w + sub) % 3];
    return {
      index: i, world: w, sub, worldData: world, label: `${w + 1}-${sub + 1}`,
      isWorldBoss, boss, bossScale: isWorldBoss ? 1 : 0.55,
      len: 28 + sub * 3 + w * 2,
      recommended: Math.round(100 * Math.pow(1.215, i)),
    };
  };

  // ===== 몬스터 (부품 조합) =====
  // 위치/크기는 몸통 크기 기준 비율
  MD.MON_RECIPES = {
    grunt: {
      body: 'B', legs: 'C', arms: null,
      eyes: [{ k: 'eye_cute_light', x: -0.2, y: -0.12, s: 0.55 }, { k: 'eye_cute_light', x: 0.2, y: -0.12, s: 0.55 }],
      mouth: { k: 'mouthH', x: 0, y: 0.18, s: 0.7 }, detail: { k: 'ear_round', x: 0.3, y: -0.38, s: 0.9 },
    },
    runner: {
      body: 'A', legs: 'A', arms: null,
      eyes: [{ k: 'eye_psycho_light', x: 0, y: -0.1, s: 0.8 }],
      mouth: { k: 'mouth_closed_teeth', x: 0, y: 0.22, s: 0.8 }, detail: { k: 'antenna_small', x: 0.22, y: -0.45, s: 1.0 },
    },
    tank: {
      body: 'D', legs: 'E', arms: 'E',
      eyes: [{ k: 'eye_angry_red', x: -0.2, y: -0.15, s: 0.55 }, { k: 'eye_angry_red', x: 0.2, y: -0.15, s: 0.55 }],
      mouth: { k: 'mouthB', x: 0, y: 0.15, s: 0.8 }, detail: { k: 'horn_large', x: 0.3, y: -0.42, s: 1.0 },
    },
    splitter: {
      body: 'F', legs: 'B', arms: 'B',
      eyes: [{ k: 'eye_yellow', x: -0.2, y: -0.2, s: 0.4 }, { k: 'eye_yellow', x: 0.2, y: -0.2, s: 0.4 }, { k: 'eye_yellow', x: 0, y: -0.02, s: 0.4 }],
      mouth: { k: 'mouthC', x: 0, y: 0.2, s: 0.65 }, detail: { k: 'antenna_large', x: 0.18, y: -0.47, s: 0.9 },
    },
  };

  MD.ENEMY = {
    grunt: { name: '말랑이', hp: 1.0, sp: 44, r: 20, coin: 1, leak: 0.07 },
    runner: { name: '날쌘돌이', hp: 0.45, sp: 82, r: 16, coin: 1, leak: 0.05, zig: true },
    tank: { name: '뿔통이', hp: 3.2, sp: 25, r: 28, coin: 3, leak: 0.18 },
    splitter: { name: '세눈이', hp: 1.4, sp: 38, r: 23, coin: 2, leak: 0.1, split: true },
  };

  // ===== 보스 =====
  MD.BOSSES = [
    {
      kind: 'king', name: '킹 말랑', title: '슬라임 군주',
      recipe: {
        body: 'B', legs: 'C', arms: 'A',
        eyes: [{ k: 'eye_human_green', x: -0.2, y: -0.12, s: 0.55 }, { k: 'eye_human_green', x: 0.2, y: -0.12, s: 0.55 }],
        mouth: { k: 'mouthG', x: 0, y: 0.2, s: 0.8 }, detail: { k: 'horn_small', x: 0.28, y: -0.42, s: 1.2 }, crown: true,
      },
    },
    {
      kind: 'demon', name: '플레임 혼', title: '사막의 화염술사',
      recipe: {
        body: 'D', legs: 'E', arms: 'C',
        eyes: [{ k: 'eye_angry_red', x: -0.22, y: -0.14, s: 0.5 }, { k: 'eye_angry_red', x: 0.22, y: -0.14, s: 0.5 }, { k: 'eye_red', x: 0, y: -0.34, s: 0.35 }],
        mouth: { k: 'mouthE', x: 0, y: 0.18, s: 0.85 }, detail: { k: 'horn_large', x: 0.32, y: -0.4, s: 1.4 },
      },
    },
    {
      kind: 'titan', name: '프로스트 골렘', title: '얼음 거인',
      recipe: {
        body: 'A', legs: 'E', arms: 'E',
        eyes: [{ k: 'eye_psycho_dark', x: -0.2, y: -0.15, s: 0.5 }, { k: 'eye_psycho_dark', x: 0.2, y: -0.15, s: 0.5 }],
        mouth: { k: 'mouthF', x: 0, y: 0.2, s: 0.85 }, detail: { k: 'antenna_large', x: 0.3, y: -0.45, s: 1.2 },
      },
    },
    {
      kind: 'overlord', name: '다크 오버로드', title: '용암 요새의 지배자',
      recipe: {
        body: 'F', legs: 'E', arms: 'D',
        eyes: [{ k: 'eye_angry_red', x: -0.22, y: -0.22, s: 0.45 }, { k: 'eye_angry_red', x: 0.22, y: -0.22, s: 0.45 }, { k: 'eye_angry_red', x: 0, y: -0.02, s: 0.45 }],
        mouth: { k: 'mouthE', x: 0, y: 0.25, s: 0.85 }, detail: { k: 'horn_large', x: 0.3, y: -0.46, s: 1.5 },
      },
    },
  ];

  // ===== 전투 보급 상자 (스테이지 내 임시 강화) =====
  MD.CRATES = {
    rate: { label: '연사', color: '#4fc3ff', max: 5 },
    dmg: { label: '화력', color: '#ff7a45', max: 6 },
    spread: { label: '확산', color: '#b48cff', max: 4 },
    pierce: { label: '관통', color: '#7dff8a', max: 3 },
  };

  // ===== 일일 보상 =====
  MD.DAILY = [100, 150, 200, 300, 400, 600, 1200];

  // ===== 일일 미션 =====
  MD.MISSION_POOL = [
    { id: 'kills', stat: 'kills', goal: 300, text: n => `몬스터 ${n}마리 처치`, reward: 120 },
    { id: 'kills2', stat: 'kills', goal: 800, text: n => `몬스터 ${n}마리 처치`, reward: 250 },
    { id: 'clears', stat: 'clears', goal: 3, text: n => `스테이지 ${n}번 클리어`, reward: 150 },
    { id: 'bosses', stat: 'bosses', goal: 3, text: n => `보스 ${n}마리 처치`, reward: 150 },
    { id: 'gatesX', stat: 'gatesX', goal: 15, text: n => `× 게이트 ${n}번 통과`, reward: 120 },
    { id: 'skills', stat: 'skills', goal: 6, text: n => `스킬 ${n}번 사용`, reward: 120 },
    { id: 'crates', stat: 'crates', goal: 5, text: n => `보급 상자 ${n}개 부수기`, reward: 130 },
    { id: 'perfect', stat: 'perfect', goal: 1, text: n => `별 3개로 클리어 ${n}번`, reward: 200 },
  ];

  // ===== 업적 =====
  MD.ACHIEVEMENTS = [
    { id: 'kills', name: '몬스터 사냥꾼', stat: () => MD.save.stats.kills, tiers: [100, 1000, 5000, 20000, 100000], reward: [50, 150, 400, 1000, 3000], text: n => `몬스터 ${MD.fmt(n)}마리 처치` },
    { id: 'bosses', name: '보스 슬레이어', stat: () => MD.save.stats.bosses, tiers: [1, 10, 30, 100], reward: [80, 300, 800, 2500], text: n => `보스 ${n}마리 처치` },
    { id: 'stars', name: '별 수집가', stat: () => Object.values(MD.save.stars).reduce((a, b) => a + b, 0), tiers: [5, 15, 30, 45, 60], reward: [100, 300, 600, 1200, 3000], text: n => `별 ${n}개 모으기` },
    { id: 'troops', name: '대군 지휘관', stat: () => MD.save.stats.maxTroops, tiers: [1000, 1e5, 1e7, 1e9], reward: [80, 250, 700, 2000], text: n => `병력 ${MD.fmt(n)}명 달성` },
    { id: 'heroes', name: '영웅 모집', stat: () => Object.keys(MD.save.heroes).length, tiers: [2, 4, 6, 8], reward: [150, 400, 900, 2000], text: n => `영웅 ${n}명 보유` },
    { id: 'perfect', name: '완벽주의자', stat: () => MD.save.stats.perfect, tiers: [1, 5, 10, 20], reward: [100, 300, 700, 2000], text: n => `별 3개 클리어 ${n}번` },
    { id: 'skills', name: '스킬 마스터', stat: () => MD.save.stats.skills, tiers: [10, 50, 200], reward: [100, 300, 1000], text: n => `스킬 ${n}번 사용` },
    { id: 'gatesX', name: '곱셈의 달인', stat: () => MD.save.stats.gatesX, tiers: [20, 100, 500], reward: [80, 250, 800], text: n => `× 게이트 ${n}번 통과` },
  ];

  // 미션 진행 갱신 (stats 증가 시 호출)
  MD.addStat = (key, n) => {
    const s = MD.save;
    if (key === 'maxTroops') { s.stats.maxTroops = Math.max(s.stats.maxTroops, n); return; }
    s.stats[key] = (s.stats[key] || 0) + n;
    for (const m of s.missions.list) {
      const def = MD.MISSION_POOL.find(p => p.id === m.id);
      if (def && def.stat === key && !m.claimed) m.prog = Math.min(def.goal, (m.prog || 0) + n);
    }
  };

  MD.refreshMissions = () => {
    const s = MD.save, today = MD.today();
    if (s.missions.date === today && s.missions.list.length) return;
    const pool = MD.MISSION_POOL.slice();
    const list = [];
    while (list.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      const m = pool.splice(i, 1)[0];
      if (list.some(x => MD.MISSION_POOL.find(p => p.id === x.id).stat === m.stat)) continue;
      list.push({ id: m.id, prog: 0, claimed: false });
    }
    s.missions = { date: today, list };
    MD.persist();
  };

  MD.dailyAvailable = () => MD.save.daily.last !== MD.today();
  MD.claimDaily = () => {
    const s = MD.save, today = MD.today();
    if (s.daily.last === today) return 0;
    const gap = s.daily.last ? MD.dayDiff(s.daily.last, today) : 1;
    s.daily.day = gap === 1 ? (s.daily.day % MD.DAILY.length) + 1 : 1;
    s.daily.last = today;
    const amt = MD.DAILY[s.daily.day - 1];
    s.coins += amt;
    MD.persist();
    return amt;
  };

  MD.achState = a => {
    const tier = MD.save.ach[a.id] || 0; // 받은 단계 수
    const val = a.stat();
    const goal = a.tiers[Math.min(tier, a.tiers.length - 1)];
    return { tier, val, goal, done: tier >= a.tiers.length, claimable: tier < a.tiers.length && val >= goal, reward: a.reward[Math.min(tier, a.reward.length - 1)] };
  };
  MD.pendingRewards = () => {
    let n = 0;
    for (const a of MD.ACHIEVEMENTS) if (MD.achState(a).claimable) n++;
    for (const m of MD.save.missions.list) {
      const def = MD.MISSION_POOL.find(p => p.id === m.id);
      if (def && !m.claimed && m.prog >= def.goal) n++;
    }
    if (MD.dailyAvailable()) n++;
    return n;
  };
})();
