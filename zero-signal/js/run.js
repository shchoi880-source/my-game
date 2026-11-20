(() => {
  'use strict';
  /*
   * ZERO SIGNAL — SIGNAL RUN (roguelite run + meta progression). DOM-free: runs in the browser and in node
   * (tools/verify.js, tools/balance.js). Needs core.js (G.save, G.mulberry, G.hash), patterns.js (G.PERKS,
   * G.SECTORS, G.depthRules, G.makeTimeline) and engine.js (G.Engine). screens.js only renders this.
   *
   * ============================== API for the UI (G.run = the current run, G.meta = progression) ===========
   *
   * G.run.start({ daily?: bool, weekly?: bool, depth?: n }) -> run      (starts sector 1; persists runActive;
   *                                  replaces any saved unfinished run — offer G.run.active()/resume() first).
   *                                  depth is clamped to G.meta.depthMax(). daily: seed = hash('ZSR'+day), Depth 0,
   *                                  gate it on G.meta.dailyRun().open. weekly: Depth 3 + 2 glitches + 1 forced
   *                                  perk, gate on G.meta.weekly().open.
   * G.run.current                    the run object or null.  G.run.active() -> saved unfinished run info or null
   * G.run.resume() -> run | null     restore a run killed by the OS (resumes at its draft/cache, or restarts
   *                                  the sector that was being played with the carry it started with)
   * run fields (read-only for the UI):
   *   run.state        'play' (sectors 1-4) | 'boss' (sector 5) | 'pick' (draft) | 'shop' (cache) | 'over' | 'won'
   *   run.sector       { index 0..4, n 1..5, name, duration, difficulty, features[], featureNames[], laser,
   *                      pressure, boss, elite, color, seed }  (the sector being played / next to play)
   *   run.engine       G.Engine for the current sector (carry-over state already applied). Drive it exactly like
   *                    the training play screen (setInput/dash/update/consume). When engine.done || engine.dead
   *                    (after your outro) call G.run.endSector().
   *   run.depth, run.rules (G.depthRules), run.daily ('' | dayKey), run.weekly ('' | weekKey), run.seed
   *   run.shards       in-run currency.  run.picks [perk ids] (copies = stacks).  run.resonance [tags]
   *   run.sectorsCleared, run.score, run.sectors [{name, score, gained, hits, grazes, shards, clear, time}]
   *   run.notices[]    UI cues; take with G.run.takeNotices(): {type:'resonance',tag,name,desc}
   *                    {type:'repair',shields} (between-sector repair)  {type:'pity'} (guaranteed rare slot)
   * G.run.endSector() -> { state, sector (last sector summary), shards }   state 'pick' | 'over' | 'won'
   * G.run.offer() -> [card x3 (x4 with the cache preview)]  card = { id, name, desc, rarity 'C'|'R'|'E'|'L'|'G',
   *                    rarityName, color, tag, icon, glitch, stack (copies owned), maxStack, completes (bool: this
   *                    pick lights a resonance) }   (same run seed + same picks = same offers)
   * G.run.pick(i)    take card i -> next state ('play' | 'boss' | 'shop'); new run.engine is created
   * G.run.skip()     take no card, +8 shards
   * G.run.reroll() -> new cards | null (cannot afford).  G.run.rerollCost() -> 0 when a free reroll is left
   * G.run.shopItems() -> [{ id, name, desc, price, can, icon }]   (state 'shop', after sector 3)
   * G.run.buy(id) -> bool.  G.run.leaveShop() -> starts sector 4.  G.run.shards() -> balance
   * G.run.preview() -> next sector spec if Calibration 'preview' is owned, else null
   * G.run.finish() -> summary (call on 'over' / 'won', or to abandon a run; idempotent):
   *   { score, sectorsCleared, clear, bossBroken, depth, daily, weekly, seed, shardsEarned, dataEarned (◆),
   *     xpEarned, levelUps [{level, reward:{type,id,label}}], unlocks [KO strings], newBest, perks [cards],
   *     resonance [tags], grazes, hits, nearMisses, maxCombo, time, sectors [...], deathSector (1-5 | 0),
   *     bounties [{id,label}] completed now, share (string for clipboard/navigator.share), nextUnlock }
   * G.run.shareText(summary) -> 'ZERO SIGNAL 11/20 ▰▰▰▰▱ D2 · 48,210 · 🟦🟦🟪🟥'
   *
   * G.meta (all reads repair missing save fields first):
   *   gems() / currency() ◆ balance, unlockedPerks() [ids in the draft pool], level() {level, xp, need, pct}, stars() mission medals (max 30)
   *   perks() -> [{ id, name, desc, rarity, tag, icon, price, owned, canBuy, locked (glitch tab closed) }]
   *   buyPerk(id) -> bool (◆ or a voucher), vouchers()
   *   skins() -> [{ id, name, price, owned, equipped, cond (KO, earned skins), hull, trail }]
   *   buySkin(id) -> bool, equipSkin(id) -> bool, skin() -> equipped skin object
   *   calib() -> [{ id, name, desc, price, owned, locked }] (needs 10 stars), buyCalib(id) -> bool
   *   depths() -> [{ n, name, desc, unlocked, cleared }], depthMax()
   *   streak() -> { days, freezes, lit (played today), next reward {days,label} }
   *   dailyRun() -> { open, date, best, tries, firstBonus }
   *   weekly() -> { key, open, endsIn (ms), bounties [{id,label,done,reward}] }
   *   missionReward(stats, mission, mode, { newMedals, firstClear }) -> { data, xp, levelUps } — call from
   *     the training results (missions keep their grades/medals; this only adds ◆/XP)
   *   takeNotices() -> [{type:'streak'|'skin'|'level', label}]   one-off rewards granted outside a run
   *   runs() -> { count, clears, best{score,depth}, bestSector, depthMax }
   * Save: G.save.data keeps key 'zero-signal-save' and version 2; new fields are filled by G.meta.ensure().
   *
   * Pure core (no save access; used by balance/verify): G.Run.create(seed, depth, opts), G.Run.startSector,
   * G.Run.endSector, G.Run.offers, G.Run.pick, G.Run.skip, G.Run.reroll, G.Run.shopItems, G.Run.buy,
   * G.Run.leaveShop, G.Run.tunables, G.Run.summary, G.Run.serialize / G.Run.restore.
   * Rules: perks never touch the 5px hitbox; draft RNG (run seed ^ draft index) is separate from the bullet RNG
   * (sector seeds derive from the run seed only), so a pick never changes the patterns.
   */
  const G = (window.G = window.G || {});
  const RAR = ['C', 'R', 'E', 'L'];
  const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');

  // ------------------------------------------------------------------ pure run core
  const SECTOR_SHARDS = 6; // shards for every cleared sector (on top of the engine's graze/no-hit/spell shards)
  const sectorSeed = (seed, i) => G.hash(`ZSR-sector:${seed >>> 0}:${i}`);
  function sectorSpec(run, i) {
    const S = G.SECTORS[i],
      seed = sectorSeed(run.seed, i),
      rng = G.mulberry(seed ^ 0x51ed27),
      pool = (S.pool || []).filter((f) => !(S.fixed || []).includes(f)),
      features = [...(S.fixed || [])];
    while (features.length < (S.fixed || []).length + (S.pick || 0) && pool.length)
      features.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const elite = i === 2 && run.rules.elite,
      names = features.map((f) => G.FEATURE_NAMES[f]);
    if (S.laser) names.push(G.FEATURE_NAMES.laser);
    if (S.pressure) names.push(G.FEATURE_NAMES.pressure);
    return {
      index: i,
      n: i + 1,
      name: S.name,
      duration: S.dur,
      difficulty: S.diff,
      features,
      featureNames: S.boss ? ['보스 · 스펠 카드 3장 + 제로 시그널'] : names,
      laser: !!S.laser,
      pressure: !!S.pressure,
      boss: !!S.boss,
      elite,
      color: S.color,
      seed,
    };
  }
  const count = (picks) => {
    const c = {};
    for (const id of picks) c[id] = (c[id] || 0) + 1;
    return c;
  };
  function tunables(run) {
    const k = { ...G.ENGINE_K0, tiers: G.ENGINE_K0.tiers.map((t) => [...t]) },
      c = count(run.picks);
    for (const id in c) {
      const d = G.perkDef(id);
      if (d && d.mod) d.mod(k, Math.min(c[id], d.stack || 1));
    }
    for (const t of run.resonance) G.RESONANCE[t].mod && G.RESONANCE[t].mod(k);
    k.shields0 = run.rules.shields0;
    k.repairs = [];
    k.speedMul *= run.rules.speedMul;
    k.clearBonus = 1000;
    return k;
  }
  const hookIds = (run) =>
    [...new Set(run.picks)].filter((id) => G.perkDef(id) && G.perkDef(id).hooks).concat(run.resonance.map((t) => 'res:' + t));
  function startSector(run) {
    const i = run.sectorIndex,
      sp = sectorSpec(run, i),
      S = G.SECTORS[i],
      R = run.rules,
      k = tunables(run);
    run.sector = sp;
    if (i === 2 && R.repair && run.carry && !run.repaired) {
      run.repaired = true;
      if (run.carry.shields < k.shieldMax) {
        run.carry.shields++;
        run.notices.push({ type: 'repair', shields: run.carry.shields });
      }
    }
    const mission = {
      id: `run-${i + 1}`,
      name: sp.name,
      duration: sp.duration,
      difficulty: sp.difficulty,
      seed: sp.seed,
      color: sp.color,
      bossHp: S.bossHp || 0,
      bulletCap: sp.difficulty >= 2.5 ? 420 : sp.difficulty >= 2 ? 360 : 320,
      run: true,
    };
    const timeline = G.makeTimeline(mission, 'normal', {
      features: sp.boss ? undefined : sp.features,
      boss: sp.boss ? undefined : false,
      bossOnly: sp.boss,
      laser: sp.laser,
      pressure: sp.pressure,
      elite: sp.elite,
      densMul: R.densMul * (S.densMul || 1),
      teleDelta: R.teleDelta,
      bossHpMul: R.bossHpMul,
      hardSpells: R.hardSpells,
      name: sp.name,
    });
    run.engine = new G.Engine(mission, {
      mode: 'normal',
      seed: sp.seed,
      timeline,
      mods: k,
      carry: run.carry,
      perks: hookIds(run),
      perkSeed: G.hash(`ZSR-perk:${run.seed}:${i}`),
    });
    run.sectorCarry = run.carry ? JSON.parse(JSON.stringify(run.carry)) : null;
    run.state = sp.boss ? 'boss' : 'play';
    return run.engine;
  }
  function endSector(run) {
    const e = run.engine;
    if (!e || !(e.done || e.dead) || (run.state !== 'play' && run.state !== 'boss')) return null;
    const st = e.stats(),
      before = run.carry ? run.carry.score : 0,
      T = run.totals;
    T.grazes += st.grazes;
    T.hits += st.hits;
    T.nearMisses += st.nearMisses;
    T.dashes += st.dashes;
    T.overdrives += st.overdrives;
    T.phased += st.phased;
    T.time += st.time;
    T.maxCombo = Math.max(T.maxCombo, st.maxCombo);
    for (const id in st.perkProcs) T.procs[id] = (T.procs[id] || 0) + st.perkProcs[id];
    const got = st.shards + (st.clear ? SECTOR_SHARDS : 0);
    run.shards += got;
    run.shardsEarned += got;
    run.score = st.score;
    run.carry = st.carryOut;
    run.flags = st.carryOut.flags;
    const sec = {
      name: run.sector.name,
      score: st.score,
      gained: Math.floor(st.score - before),
      hits: st.hits,
      grazes: st.grazes,
      shards: got,
      clear: st.clear,
      time: st.time,
      bossBroken: st.bossBroken,
    };
    run.sectors.push(sec);
    if (run.sector.boss) run.bossBroken = st.bossBroken;
    if (e.dead) run.state = 'over';
    else {
      run.sectorsCleared = run.sectorIndex + 1;
      if (run.sectorIndex >= G.SECTORS.length - 1) run.state = 'won';
      else {
        run.sectorIndex++;
        run.sector = sectorSpec(run, run.sectorIndex);
        run.state = 'pick';
        run.offers = null;
      }
    }
    return { state: run.state, sector: sec, shards: got };
  }

  // ---- draft
  const available = (run, id) => {
    const d = G.perkDef(id);
    if (!d) return false;
    const n = run.picks.filter((x) => x === id).length;
    return n < (d.stack || 1);
  };
  function card(run, id) {
    const d = G.perkDef(id),
      R = G.RARITY[d.rar],
      n = run.picks.filter((x) => x === id).length,
      tagN = run.picks.filter((x) => G.perkDef(x).tag === d.tag).length;
    return {
      id,
      name: d.name,
      desc: d.desc,
      rarity: d.rar,
      rarityName: R.name,
      color: R.color,
      tag: d.tag,
      icon: d.icon,
      glitch: !!d.glitch,
      stack: n,
      maxStack: d.stack || 1,
      completes: !d.glitch && !!G.RESONANCE[d.tag] && !run.resonance.includes(d.tag) && tagN + 1 >= 3,
    };
  }
  function rarityOdds(run, di) {
    let o = { C: 62, R: 27, E: 9 + 2 * di, L: 2 + di };
    o.C = 100 - o.R - o.E - o.L;
    const pen = run.rules.rarityRPenalty;
    if (pen) {
      const hi = o.R + o.E + o.L;
      for (const r of ['R', 'E', 'L']) o[r] -= (pen * o[r]) / hi;
      o.C += pen;
    }
    return o;
  }
  function offers(run) {
    if (run.state !== 'pick') return [];
    if (run.offers) return run.offers;
    const di = run.sectorsCleared - 1,
      rng = G.mulberry((G.hash(`ZSR-draft:${run.seed}:${di}:${run.rerolls}`) ^ 0x7f4a7c15) >>> 0),
      odds = rarityOdds(run, di),
      pool = run.pool.filter((id) => !G.perkDef(id).glitch && available(run, id)),
      glitches = run.pool.filter((id) => G.perkDef(id).glitch && available(run, id)),
      nCards = run.extraCard ? 4 : 3,
      out = [];
    const roll = () => {
      let x = rng() * 100;
      for (const r of RAR) if ((x -= odds[r]) < 0) return RAR.indexOf(r);
      return 0;
    };
    const take = (rank, min = 0) => {
      rank = Math.max(min, Math.min(3, rank));
      const order = [rank];
      for (let s = 1; s < 4; s++) order.push(rank + s, rank - s);
      for (const r of order) {
        if (r < min || r > 3) continue;
        const c = pool.filter((id) => G.perkDef(id).rar === RAR[r] && !out.includes(id));
        if (c.length) return c[Math.floor(rng() * c.length)];
      }
      const any = pool.filter((id) => !out.includes(id));
      return any.length ? any[Math.floor(rng() * any.length)] : null;
    };
    for (let s = 0; s < nCards; s++) {
      let rank = roll() + (run.rarityBoost ? 1 : 0),
        min = 0;
      if (s === 0 && ((di === 2 && !run.seenRplus) || (di === 0 && run.opts.rigFirst))) {
        min = 1;
        if (di === 2) run.notices.push({ type: 'pity' });
      }
      if (s === nCards - 1 && di === 0 && run.opts.forceL && !run.seenL) rank = 3;
      if (s === 2 && di >= 1 && glitches.length && rng() < 0.35) {
        out.push(glitches[Math.floor(rng() * glitches.length)]);
        continue;
      }
      const id = take(rank, min);
      if (id) out.push(id);
    }
    run.offers = out.map((id) => card(run, id));
    if (run.offers.some((c) => G.RARITY[c.rarity].rank >= 1)) run.seenRplus = true;
    if (run.offers.some((c) => c.rarity === 'L')) run.seenL = true;
    return run.offers;
  }
  function advance(run) {
    run.offers = null;
    run.rarityBoost = 0;
    run.extraCard = false;
    if (run.sectorsCleared === 3 && !run.shopDone) {
      run.state = 'shop';
      run.bought = [];
      return;
    }
    startSector(run);
  }
  function addPerk(run, id) {
    const d = G.perkDef(id);
    run.picks.push(id);
    if (d.now && d.now.shields && run.carry) {
      const k = tunables(run);
      run.carry.shields = Math.min(k.shieldMax, run.carry.shields + d.now.shields);
    }
    if (!d.glitch && G.RESONANCE[d.tag] && !run.resonance.includes(d.tag)) {
      const n = run.picks.filter((x) => G.perkDef(x).tag === d.tag).length;
      if (n >= 3) {
        run.resonance.push(d.tag);
        const R = G.RESONANCE[d.tag];
        run.notices.push({ type: 'resonance', tag: d.tag, name: R.name, desc: R.desc });
      }
    }
  }
  function pick(run, i) {
    if (run.state !== 'pick') return false;
    const c = offers(run)[i];
    if (!c) return false;
    addPerk(run, c.id);
    run.log.push(c.id);
    advance(run);
    return true;
  }
  function skip(run) {
    if (run.state !== 'pick') return false;
    run.shards += 8;
    run.shardsEarned += 8;
    run.log.push('-');
    advance(run);
    return true;
  }
  const rerollCost = (run) => (run.rerolls < run.opts.freeRerolls ? 0 : 15 + 5 * (run.rerolls - run.opts.freeRerolls));
  function reroll(run) {
    if (run.state !== 'pick') return null;
    const cost = rerollCost(run);
    if (cost > run.shards) return null;
    run.shards -= cost;
    run.rerolls++;
    run.offers = null;
    return offers(run);
  }

  // ---- cache (shop after sector 3)
  function shopItems(run) {
    if (run.state !== 'shop') return [];
    const m = run.rules.cacheMul,
      P = (v) => Math.round(v * m),
      k = tunables(run),
      out = [],
      bought = (id) => run.bought.includes(id);
    out.push({ id: 'repair', name: '보호막 수리', desc: '보호막 +1', icon: 'shield', price: P(30),
      can: !bought('repair') && run.carry.shields < k.shieldMax });
    for (const id of [...new Set(run.picks)]) {
      const d = G.perkDef(id);
      if (d.glitch)
        out.push({ id: 'purge:' + id, name: `${d.name} 제거`, desc: '글리치를 지웁니다 (점수 배율도 사라짐)',
          icon: 'purge', price: P(25), can: !bought('purge:' + id) });
      else if ((d.stack || 1) > 1 && available(run, id))
        out.push({ id: 'upgrade:' + id, name: `${d.name} 강화`, desc: `${d.name} 1단계 중첩 (${d.desc})`,
          icon: d.icon, price: P(40), can: !bought('upgrade:' + id) });
    }
    out.push({ id: 'boost', name: '희귀도 증폭', desc: '다음 드래프트 카드 등급 +1', icon: 'boost', price: P(35),
      can: !bought('boost') });
    if (run.opts.cache4)
      out.push({ id: 'fourth', name: '네 번째 카드', desc: '다음 드래프트에 카드 4장', icon: 'card', price: 0,
        can: !bought('fourth') });
    for (const it of out) it.can = it.can && it.price <= run.shards;
    return out;
  }
  function buy(run, id) {
    const it = shopItems(run).find((x) => x.id === id);
    if (!it || !it.can) return false;
    run.shards -= it.price;
    run.bought.push(id);
    if (id === 'repair') run.carry.shields++;
    else if (id === 'boost') run.rarityBoost = 1;
    else if (id === 'fourth') run.extraCard = true;
    else if (id.startsWith('purge:')) {
      const g = id.slice(6);
      run.picks = run.picks.filter((x) => x !== g);
      const k = tunables(run);
      run.carry.shields = Math.min(run.carry.shields, k.shieldMax);
    } else if (id.startsWith('upgrade:')) addPerk(run, id.slice(8));
    return true;
  }
  function leaveShop(run) {
    if (run.state !== 'shop') return false;
    run.shopDone = true;
    const boost = run.rarityBoost,
      extra = run.extraCard;
    startSector(run);
    run.rarityBoost = boost;
    run.extraCard = extra;
    return true;
  }

  function create(seed, depth = 0, opts = {}) {
    seed = seed >>> 0;
    const run = {
      v: 1,
      seed,
      depth,
      rules: G.depthRules(depth),
      opts: { freeRerolls: 1, ...opts },
      pool: opts.pool || G.PERKS.map((p) => p.id),
      daily: opts.daily || '',
      weekly: opts.weekly || '',
      sectorIndex: 0,
      sector: null,
      state: 'play',
      picks: [],
      log: [],
      resonance: [],
      shards: 0,
      shardsEarned: 0,
      rerolls: 0,
      offers: null,
      rarityBoost: 0,
      extraCard: false,
      seenRplus: false,
      seenL: false,
      shopDone: false,
      bought: [],
      repaired: false,
      carry: null,
      flags: {},
      score: 0,
      sectorsCleared: 0,
      bossBroken: false,
      sectors: [],
      notices: [],
      totals: { grazes: 0, hits: 0, nearMisses: 0, dashes: 0, overdrives: 0, phased: 0, time: 0, maxCombo: 0, procs: {} },
      engine: null,
    };
    for (const id of opts.forced || []) addPerk(run, id);
    startSector(run);
    return run;
  }
  function summary(run) {
    return {
      score: Math.floor(run.score),
      sectorsCleared: run.sectorsCleared,
      clear: run.state === 'won',
      bossBroken: run.bossBroken,
      depth: run.depth,
      daily: run.daily,
      weekly: run.weekly,
      seed: run.seed,
      shardsEarned: run.shardsEarned,
      perks: run.picks.map((id) => card({ picks: [], resonance: [] }, id)),
      resonance: [...run.resonance],
      grazes: run.totals.grazes,
      hits: run.totals.hits,
      nearMisses: run.totals.nearMisses,
      maxCombo: run.totals.maxCombo,
      dashes: run.totals.dashes,
      time: run.totals.time,
      rerolls: run.rerolls,
      sectors: run.sectors.map((s) => ({ ...s })),
      deathSector: run.state === 'over' ? run.sectorIndex + 1 : 0,
    };
  }
  const SKIP = ['engine', 'sector'];
  const serialize = (run) => JSON.parse(JSON.stringify(run, (k, v) => (SKIP.includes(k) ? undefined : v)));
  // Restore a serialized run. A run saved mid-sector restarts that sector from the carry it began with.
  function restore(o) {
    if (!o || o.v !== 1 || typeof o.seed !== 'number') return null;
    if (o.state === 'over' || o.state === 'won') return null;
    const run = { ...o, rules: G.depthRules(o.depth), engine: null, notices: [] };
    if (run.state === 'play' || run.state === 'boss') {
      run.carry = run.sectorCarry ? JSON.parse(JSON.stringify(run.sectorCarry)) : null;
      startSector(run);
    } else run.sector = sectorSpec(run, run.sectorIndex);
    return run;
  }
  // Headless helper (balance/verify): play the current sector to the end with pilot(engine) each step.
  function playSector(run, pilot) {
    const e = run.engine;
    while (!e.done && !e.dead) {
      if (pilot) pilot(e);
      e.step();
      e.consume();
    }
    return endSector(run);
  }
  G.Run = {
    create,
    sectorSpec,
    startSector,
    endSector,
    offers,
    pick,
    skip,
    reroll,
    rerollCost,
    shopItems,
    buy,
    leaveShop,
    tunables,
    summary,
    serialize,
    restore,
    playSector,
    card,
    rarityOdds,
  };

  // ------------------------------------------------------------------ meta (save-backed)
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const dayOffset = (n) => {
    const d = new Date();
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  };
  const isoWeek = (d = new Date()) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
      day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)),
      w = Math.ceil(((t - y0) / 864e5 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
  };
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  const SKINS = [
    { id: 'default', name: '기본 신호', price: 0, hull: '#eef7ff', trail: '#4deeea' },
    { id: 'cobalt', name: '코발트', price: 200, hull: '#7fb2ff', trail: '#4b8cff' },
    { id: 'ember', name: '잔불', price: 300, hull: '#ffb38a', trail: '#ff7a45' },
    { id: 'aurora', name: '오로라', price: 450, hull: '#b6ffdf', trail: '#5cffb0' },
    { id: 'void', name: '공허', price: 600, hull: '#d6c2ff', trail: '#7d4dff' },
    { id: 'breaker', name: '코어 브레이커', cond: '런에서 코어 첫 격파', hull: '#ffe08a', trail: '#ffd166' },
    { id: 'medal', name: '훈장', cond: '훈련 메달 15개', hull: '#ffd6a0', trail: '#ffb347' },
    { id: 'abyss', name: '심연', cond: '깊이 5 클리어', hull: '#9ad0ff', trail: '#2a6bff' },
    { id: 'frost', name: '서리', cond: '7일 연속 수신', hull: '#e0fbff', trail: '#9ff3ff' },
    { id: 'prism', name: '프리즘', cond: '아무 임무 SS 등급', hull: '#ffffff', trail: '#ff8af0' },
    { id: 'ace', name: '에이스', cond: '파일럿 레벨 30', hull: '#fff4c2', trail: '#ff5c8a' },
    { id: 'solar', name: '태양풍', cond: '30일 연속 수신 (전설)', hull: '#fff1b8', trail: '#ffae00' },
  ];
  const CALIB = [
    { id: 'reroll', name: '추가 리롤', desc: '런마다 무료 리롤 +1', price: 300 },
    { id: 'preview', name: '섹터 미리보기', desc: '드래프트 전에 다음 섹터 패턴 표시', price: 150 },
    { id: 'cache4', name: '네 번째 카드', desc: '캐시에서 다음 드래프트 카드 4장 선택 가능', price: 250 },
  ];
  const TITLES = { 5: '수신병', 10: '신호 추적자', 15: '간섭 해독가', 20: '균열 항해사', 25: '폭풍 돌파자',
    35: '코어 브레이커', 40: '영점 조율사', 45: '신호의 주인', 50: '제로 시그널' };
  const HUD = ['시안', '바이올렛', '골드', '코발트', '민트', '로즈', '앰버', '화이트'];
  const STREAK = [
    { days: 3, label: '◆100' },
    { days: 7, label: '서리 스킨 + 연속 보호 1개' },
    { days: 14, label: '칭호 「끊기지 않는 신호」' },
    { days: 30, label: '전설 스킨 「태양풍」' },
  ];
  const BOUNTIES = [
    { id: 'dashcore', label: 'DASH 퍽 2개 이상으로 코어 격파', test: (s, r) => s.bossBroken && r.picks.filter((x) => G.perkDef(x).tag === 'DASH').length >= 2 },
    { id: 'graze120', label: '4섹터에서 스치기 120회', test: (s) => s.sectors[3] && s.sectors[3].grazes >= 120 },
    { id: 'noreroll', label: '리롤 없이 클리어', test: (s) => s.clear && s.rerolls === 0 },
    { id: 'nohit3', label: '3섹터 무피격 통과', test: (s) => s.sectors[2] && s.sectors[2].clear && s.sectors[2].hits === 0 },
    { id: 'glitch2', label: '글리치 2개를 지닌 채 클리어', test: (s, r) => s.clear && r.picks.filter((x) => G.perkDef(x).glitch).length >= 2 },
    { id: 'combo150', label: '런에서 최대 콤보 150', test: (s) => s.maxCombo >= 150 },
    { id: 'reso2', label: '공명 2종 달성', test: (s) => s.resonance.length >= 2 },
    { id: 'near25', label: '런에서 아슬아슬 25회', test: (s) => s.nearMisses >= 25 },
  ];
  const need = (L) => 100 + 40 * L;

  function ensure() {
    const d = G.save.data;
    if (!obj(d.meta)) d.meta = {};
    const M = d.meta;
    M.gems = num(M.gems);
    M.gemsTotal = num(M.gemsTotal);
    M.xp = num(M.xp);
    M.level = Math.max(1, num(M.level, 1));
    M.vouchers = num(M.vouchers);
    if (!Array.isArray(M.titles)) M.titles = [];
    if (typeof M.title !== 'string') M.title = '';
    if (!Array.isArray(M.hud)) M.hud = [];
    if (!Array.isArray(M.notices)) M.notices = [];
    if (!obj(d.archive)) d.archive = {};
    const A = d.archive;
    if (!Array.isArray(A.perks)) A.perks = [...G.STARTER_PERKS];
    for (const id of G.STARTER_PERKS) if (!A.perks.includes(id)) A.perks.push(id);
    if (!obj(A.calib)) A.calib = {};
    A.seenL = num(A.seenL);
    if (!obj(d.runs)) d.runs = {};
    const R = d.runs;
    for (const k of ['depthMax', 'count', 'clears', 'bestSector', 'pityL', 'bossBreaks', 'depthCleared']) R[k] = num(R[k], k === 'depthCleared' ? -1 : 0);
    if (!obj(R.best)) R.best = { score: 0, depth: 0, seed: 0 };
    R.glitchOpen = !!R.glitchOpen;
    if (d.runActive !== null && !obj(d.runActive)) d.runActive = null;
    if (!obj(d.skins)) d.skins = {};
    if (!Array.isArray(d.skins.owned)) d.skins.owned = ['default'];
    if (!d.skins.owned.includes('default')) d.skins.owned.unshift('default');
    if (typeof d.skins.on !== 'string' || !d.skins.owned.includes(d.skins.on)) d.skins.on = 'default';
    if (!obj(d.daily)) d.daily = { streak: 0, last: '' };
    const D = d.daily;
    D.freezes = Math.min(2, num(D.freezes));
    if (!obj(D.rewards)) D.rewards = {};
    if (!obj(D.run)) D.run = { date: '', best: 0, tries: 0 };
    if (!obj(d.weekly)) d.weekly = {};
    const W = d.weekly,
      wk = isoWeek();
    if (W.key !== wk) Object.assign(W, { key: wk, best: 0, bounties: {} });
    if (!obj(W.bounties)) W.bounties = {};
    if (!obj(d.stats)) d.stats = {};
    d.stats.nearMiss = num(d.stats.nearMiss);
    if (!obj(d.stats.picks)) d.stats.picks = {};
    if (!obj(d.stats.resonance)) d.stats.resonance = {};
    applyFreezes(D);
    checkRewards();
    return d;
  }
  // Streak freezes (Duolingo): a missed day is bridged automatically while freezes remain.
  function applyFreezes(D) {
    if (!D.last || !D.streak || D.last === dayKey() || D.last === dayOffset(-1)) return;
    for (let miss = 1; miss <= D.freezes; miss++)
      if (D.last === dayOffset(-1 - miss)) {
        D.freezes -= miss;
        D.last = dayOffset(-1);
        G.save.data.meta.notices.push({ type: 'streak', label: `연속 보호 ${miss}개 사용 · 연속 ${D.streak}일 유지` });
        return;
      }
  }
  const streakDays = () => {
    const D = G.save.data.daily;
    return D.last === dayKey() || D.last === dayOffset(-1) ? D.streak || 0 : 0;
  };
  function grantSkin(id, out) {
    const S = G.save.data.skins;
    if (S.owned.includes(id)) return;
    S.owned.push(id);
    const sk = SKINS.find((s) => s.id === id),
      label = `스킨 「${sk.name}」 획득`;
    if (out) out.push(label);
    else G.save.data.meta.notices.push({ type: 'skin', label });
  }
  function medalStars() {
    let n = 0;
    const B = G.save.data.best || {};
    for (const k in B) if (obj(B[k]) && obj(B[k].medals)) n += Object.keys(B[k].medals).length;
    return n;
  }
  function checkRewards(out) {
    const d = G.save.data,
      R = d.runs,
      D = d.daily,
      st = streakDays();
    if (R.bossBreaks >= 1) grantSkin('breaker', out);
    if (medalStars() >= 15) grantSkin('medal', out);
    if (R.depthCleared >= 5) grantSkin('abyss', out);
    if (d.meta.level >= 30) grantSkin('ace', out);
    const B = d.best || {};
    if (Object.values(B).some((r) => obj(r) && r.grade === 'SS')) grantSkin('prism', out);
    for (const s of STREAK)
      if (st >= s.days && !D.rewards[s.days]) {
        D.rewards[s.days] = 1;
        const lab = `연속 ${s.days}일 보상: ${s.label}`;
        if (out) out.push(lab);
        else d.meta.notices.push({ type: 'streak', label: lab });
        if (s.days === 3) addGems(100);
        if (s.days === 7) {
          grantSkin('frost', out);
          D.freezes = Math.min(2, D.freezes + 1);
        }
        if (s.days === 14 && !d.meta.titles.includes('끊기지 않는 신호')) d.meta.titles.push('끊기지 않는 신호');
        if (s.days === 30) grantSkin('solar', out);
      }
  }
  function levelReward(L) {
    if (L === 30) return { type: 'skin', id: 'ace', label: '스킨 「에이스」' };
    if (TITLES[L]) return { type: 'title', id: TITLES[L], label: `칭호 「${TITLES[L]}」` };
    if (L % 3 === 0) return { type: 'voucher', id: 'voucher', label: '퍽 해금권 1장' };
    const h = HUD[L % HUD.length];
    return { type: 'hud', id: h, label: `HUD 색상 「${h}」` };
  }
  function addGems(n) {
    const M = G.save.data.meta;
    M.gems += n;
    M.gemsTotal += n;
  }
  function addXp(n) {
    const M = G.save.data.meta,
      ups = [];
    M.xp += n;
    while (M.level < 50 && M.xp >= need(M.level)) {
      M.xp -= need(M.level);
      M.level++;
      const r = levelReward(M.level);
      if (r.type === 'title') M.titles.push(r.id);
      if (r.type === 'voucher') M.vouchers++;
      if (r.type === 'hud' && !M.hud.includes(r.id)) M.hud.push(r.id);
      if (r.type === 'skin') grantSkin(r.id, []);
      ups.push({ level: M.level, reward: r });
    }
    return ups;
  }
  const meta = {
    ensure,
    SKINS,
    CALIB,
    gems: () => ensure().meta.gems,
    currency: () => ensure().meta.gems, // alias of gems() (신호 데이터 ◆)
    unlockedPerks: () => [...ensure().archive.perks],
    vouchers: () => ensure().meta.vouchers,
    level() {
      const M = ensure().meta,
        n = M.level >= 50 ? 0 : need(M.level);
      return { level: M.level, xp: M.xp, need: n, pct: n ? M.xp / n : 1, title: M.title, titles: [...M.titles] };
    },
    stars: () => (ensure(), medalStars()),
    runs() {
      const R = ensure().runs;
      return { count: R.count, clears: R.clears, best: { ...R.best }, bestSector: R.bestSector, depthMax: R.depthMax, glitchOpen: R.glitchOpen };
    },
    perks() {
      const d = ensure();
      return G.PERKS.map((p) => {
        const owned = d.archive.perks.includes(p.id),
          locked = !!p.glitch && !d.runs.glitchOpen;
        return { id: p.id, name: p.name, desc: p.desc, rarity: p.rar, tag: p.tag, icon: p.icon, price: p.price, owned, locked,
          canBuy: !owned && !locked && (d.meta.gems >= p.price || d.meta.vouchers > 0) };
      });
    },
    buyPerk(id, useVoucher) {
      const d = ensure(),
        p = G.perkDef(id);
      if (!p || !G.PERKS.includes(p) || d.archive.perks.includes(id)) return false;
      if (p.glitch && !d.runs.glitchOpen) return false;
      if ((useVoucher || d.meta.gems < p.price) && d.meta.vouchers > 0) d.meta.vouchers--;
      else if (d.meta.gems >= p.price) d.meta.gems -= p.price;
      else return false;
      d.archive.perks.push(id);
      G.save.persist();
      return true;
    },
    skins() {
      const S = ensure().skins;
      return SKINS.map((s) => ({ ...s, price: s.price || 0, buyable: !!s.price, owned: S.owned.includes(s.id), equipped: S.on === s.id }));
    },
    skin() {
      const S = ensure().skins;
      return SKINS.find((s) => s.id === S.on) || SKINS[0];
    },
    buySkin(id) {
      const d = ensure(),
        s = SKINS.find((x) => x.id === id);
      if (!s || !s.price || d.skins.owned.includes(id) || d.meta.gems < s.price) return false;
      d.meta.gems -= s.price;
      d.skins.owned.push(id);
      G.save.persist();
      return true;
    },
    equipSkin(id) {
      const d = ensure();
      if (!d.skins.owned.includes(id)) return false;
      d.skins.on = id;
      G.save.persist();
      return true;
    },
    setTitle(t) {
      const M = ensure().meta;
      if (t && !M.titles.includes(t)) return false;
      M.title = t || '';
      G.save.persist();
      return true;
    },
    calib() {
      const d = ensure(),
        locked = medalStars() < 10;
      return CALIB.map((c) => ({ ...c, owned: !!d.archive.calib[c.id], locked }));
    },
    buyCalib(id) {
      const d = ensure(),
        c = CALIB.find((x) => x.id === id);
      if (!c || d.archive.calib[id] || medalStars() < 10 || d.meta.gems < c.price) return false;
      d.meta.gems -= c.price;
      d.archive.calib[id] = 1;
      G.save.persist();
      return true;
    },
    depthMax: () => ensure().runs.depthMax,
    depths() {
      const R = ensure().runs;
      return G.DEPTHS.map((x) => ({ ...x, unlocked: x.n <= R.depthMax, cleared: x.n <= R.depthCleared }));
    },
    streak() {
      const D = ensure().daily,
        days = streakDays(),
        next = STREAK.find((s) => !D.rewards[s.days]) || null;
      return { days, freezes: D.freezes, lit: D.last === dayKey(), next };
    },
    dailyRun() {
      const d = ensure(),
        R = d.daily.run,
        k = dayKey(),
        today = R.date === k;
      return { open: d.runs.clears >= 1, date: k, best: today ? R.best : 0, tries: today ? R.tries : 0, firstBonus: !today || !R.tries };
    },
    weekly() {
      const d = ensure(),
        W = d.weekly,
        h = G.hash('ZSW' + W.key),
        ids = [],
        now = new Date(),
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (8 - (now.getDay() || 7)));
      for (let i = 0; ids.length < 3 && i < 20; i++) {
        const b = BOUNTIES[(h + i * 7) % BOUNTIES.length];
        if (!ids.includes(b)) ids.push(b);
      }
      return {
        key: W.key,
        open: d.runs.depthMax >= 2,
        best: W.best,
        endsIn: end - now,
        forced: G.STARTER_PERKS[h % G.STARTER_PERKS.length],
        bounties: ids.map((b) => ({ id: b.id, label: b.label, done: !!W.bounties[b.id], reward: 80, test: b.test })),
      };
    },
    missionReward(stats, mission, mode, o = {}) {
      ensure();
      let n = Math.floor((stats.score || 0) / 2500) + 10 * (o.newMedals ? o.newMedals.length : 0) + (o.firstClear ? 25 : 0);
      addGems(n);
      const levelUps = addXp(n);
      checkRewards();
      G.save.persist();
      return { data: n, xp: n, levelUps };
    },
    takeNotices() {
      const M = ensure().meta;
      return M.notices.splice(0);
    },
    // test/debug helpers
    _dayKey: dayKey,
    _isoWeek: isoWeek,
  };
  G.meta = meta;

  // ------------------------------------------------------------------ G.run (current run, save-backed)
  function persistActive(run) {
    const d = G.save.data;
    d.runActive = run && !run.finished && run.state !== 'over' && run.state !== 'won' ? serialize(run) : null;
    G.save.persist();
  }
  function nextUnlock() {
    const d = G.save.data,
      cands = G.PERKS.filter((p) => !d.archive.perks.includes(p.id) && (!p.glitch || d.runs.glitchOpen)).sort((a, b) => a.price - b.price);
    if (!cands.length) return null;
    const p = cands[0];
    return { id: p.id, name: p.name, price: p.price, missing: Math.max(0, p.price - d.meta.gems) };
  }
  const BAR = (n) => '▰'.repeat(n) + '▱'.repeat(5 - n);
  const SQ = { C: '⬜', R: '🟦', E: '🟪', L: '🟨', G: '🟥' };
  function shareText(s) {
    const k = s.daily || dayKey(),
      date = `${+k.slice(4, 6)}/${+k.slice(6)}`;
    return `ZERO SIGNAL ${s.daily ? date + ' ' : ''}${BAR(s.sectorsCleared)} D${s.depth} · ${fmt(s.score)} · ${s.perks.map((p) => SQ[p.rarity]).join('') || '—'}`;
  }
  const run = {
    current: null,
    start(o = {}) {
      const d = ensure();
      let seed, depth, opts;
      if (o.daily) {
        const k = dayKey();
        seed = G.hash('ZSR' + k);
        depth = 0;
        opts = { daily: k, pool: G.PERKS.filter((p) => !p.glitch).map((p) => p.id) };
      } else if (o.weekly) {
        const W = meta.weekly();
        seed = G.hash('ZSRW' + W.key);
        depth = 3;
        opts = { weekly: W.key, pool: [...new Set([...d.archive.perks, W.forced])], forced: ['g_over', 'g_glass', W.forced] };
      } else {
        seed = (G.hash('ZSR-free:' + Date.now() + ':' + d.runs.count) ^ ((Math.random() * 4294967296) >>> 0)) >>> 0;
        depth = Math.max(0, Math.min(d.runs.depthMax, o.depth | 0));
        opts = {
          pool: d.archive.perks.filter((id) => G.perkDef(id) && (!G.perkDef(id).glitch || d.runs.glitchOpen)),
          rigFirst: d.runs.count === 0,
          forceL: d.runs.pityL >= 8,
        };
      }
      opts.freeRerolls = 1 + (d.archive.calib.reroll ? 1 : 0);
      opts.cache4 = !!d.archive.calib.cache4;
      if (o.seed != null) seed = o.seed >>> 0; // tests
      const r = create(seed, depth, opts);
      this.current = r;
      persistActive(r);
      return r;
    },
    active() {
      const a = ensure().runActive;
      return a ? { state: a.state, sector: a.sectorIndex + 1, depth: a.depth, score: Math.floor(a.score), daily: a.daily, weekly: a.weekly } : null;
    },
    resume() {
      const r = restore(ensure().runActive);
      if (!r) {
        G.save.data.runActive = null;
        return null;
      }
      this.current = r;
      return r;
    },
    takeNotices() {
      return this.current ? this.current.notices.splice(0) : [];
    },
    endSector() {
      const r = this.current;
      if (!r) return null;
      const out = endSector(r);
      if (out) {
        if (r.sectorsCleared >= 4) G.save.data.runs.glitchOpen = true;
        persistActive(r);
      }
      return out;
    },
    offer() {
      const r = this.current;
      if (!r) return [];
      const had = !!r.offers,
        o = offers(r);
      if (!had && o.length) persistActive(r);
      return o;
    },
    pick(i) {
      const r = this.current,
        ok = !!r && pick(r, i);
      if (ok) persistActive(r);
      return ok;
    },
    skip() {
      const r = this.current,
        ok = !!r && skip(r);
      if (ok) persistActive(r);
      return ok;
    },
    reroll() {
      const r = this.current,
        o = r ? reroll(r) : null;
      if (o) persistActive(r);
      return o;
    },
    rerollCost() {
      return this.current ? rerollCost(this.current) : 0;
    },
    shopItems() {
      return this.current ? shopItems(this.current) : [];
    },
    buy(id) {
      const r = this.current,
        ok = !!r && buy(r, id);
      if (ok) persistActive(r);
      return ok;
    },
    leaveShop() {
      const r = this.current,
        ok = !!r && leaveShop(r);
      if (ok) persistActive(r);
      return ok;
    },
    shards() {
      return this.current ? this.current.shards : 0;
    },
    preview() {
      const r = this.current;
      return r && ensure().archive.calib.preview ? sectorSpec(r, r.sectorIndex) : null;
    },
    shareText,
    finish() {
      const r = this.current;
      if (!r) return null;
      if (r.finished) return r.finished;
      if (r.state !== 'won') r.state = 'over';
      const d = ensure(),
        s = summary(r),
        R = d.runs,
        unlocks = [];
      // meta currency: ⌊score/1500⌋ + 12/sector + 40 boss + 15×depth on clear; daily first attempt ×2
      let gems = Math.floor(s.score / 1500) + 12 * s.sectorsCleared + (s.bossBroken ? 40 : 0) + (s.clear ? 15 * s.depth : 0);
      let newBest = false;
      if (s.daily) {
        const DR = d.daily.run;
        if (DR.date !== s.daily) Object.assign(DR, { date: s.daily, best: 0, tries: 0 });
        if (!DR.tries) gems *= 2;
        DR.tries++;
        if (s.score > DR.best) (DR.best = s.score), (newBest = true);
        // the daily run counts for the streak like the daily mission
        const D = d.daily,
          k = dayKey();
        if (D.last !== k) {
          D.streak = D.last === dayOffset(-1) ? (D.streak || 0) + 1 : 1;
          D.last = k;
        }
      }
      if (s.weekly && s.score > d.weekly.best) d.weekly.best = s.score;
      // weekly bounties (any run counts)
      const bounties = [];
      for (const b of meta.weekly().bounties)
        if (!b.done && b.test(s, r)) {
          d.weekly.bounties[b.id] = 1;
          gems += b.reward;
          bounties.push({ id: b.id, label: b.label });
        }
      R.count++;
      if (s.score > R.best.score) {
        if (!s.daily) newBest = true;
        R.best = { score: s.score, depth: s.depth, seed: s.seed };
      }
      R.bestSector = Math.max(R.bestSector, s.sectorsCleared + (s.clear ? 0 : 1));
      if (s.sectorsCleared >= 4 && !R.glitchOpen) {
        R.glitchOpen = true;
        unlocks.push('글리치 카드 아카이브 개방');
      }
      if (s.bossBroken) R.bossBreaks++;
      if (r.seenL) R.pityL = 0;
      else R.pityL++;
      if (s.clear) {
        if (R.clears === 0) unlocks.push('일일 런 해제');
        R.clears++;
        R.depthCleared = Math.max(R.depthCleared, s.depth);
        if (s.depth === R.depthMax && R.depthMax < 10) {
          R.depthMax++;
          unlocks.push(`깊이 ${R.depthMax} 해제 · ${G.DEPTHS[R.depthMax].desc}`);
          if (R.depthMax === 2) unlocks.push('주간 변조 해제');
        }
      }
      d.stats.nearMiss += s.nearMisses;
      for (const id of r.picks) d.stats.picks[id] = (d.stats.picks[id] || 0) + 1;
      for (const t of r.resonance) d.stats.resonance[t] = (d.stats.resonance[t] || 0) + 1;
      addGems(gems);
      const levelUps = addXp(gems);
      for (const u of levelUps) unlocks.push(`파일럿 Lv ${u.level} · ${u.reward.label}`);
      checkRewards(unlocks);
      d.runActive = null;
      r.finished = {
        ...s,
        dataEarned: gems,
        xpEarned: gems,
        levelUps,
        unlocks,
        newBest,
        bounties,
        share: shareText(s),
        nextUnlock: nextUnlock(),
      };
      G.save.persist();
      return r.finished;
    },
  };
  G.run = run;
  try {
    if (G.save && G.save.data) ensure();
  } catch (e) {
    if (typeof console !== 'undefined') console.warn(e);
  }
})();
