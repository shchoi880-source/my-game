(() => {
  'use strict';
  /*
   * ZERO SIGNAL engine — fixed 120Hz step.
   *
   * new G.Engine(mission, { mode: 'normal' | 'hard', seed })   (mode defaults to 'normal'; a bare string = mode)
   *
   * Public state read by the renderer / screens:
   *   engine.mode            'normal' | 'hard'
   *   engine.bullets[]       { x, y, px, py, vx, vy, r, color, curve, age, grazed, shape, kind }
   *                          kind: 'ring' | 'fan' | 'spiral' | 'cross' | 'rain' | 'wall' | 'orbit' |
   *                                'petal' | 'converge' | 'laser' (+ any custom string); colour by kind.
   *   engine.telegraphs[]    { t, life, type, x, y, color }    ring pulse at the core before a feature volley
   *                          (t counts down from life; life = 0.65s Normal / 0.45s Hard)
   *   engine.warnings[]      { kind, x, y, w, h, angle, t, life, color }
   *                          kind 'laser': a lane starting at (x,y) pointing along `angle`, `w` px wide and
   *                          `h` px long. t counts down from life (seconds); bullets fire down the lane at t = 0.
   *                          (internal `fire` callback on the object — ignore it when drawing)
   *   engine.boss            { hp, max, phase, name, active, broken, cardT, cardDur, final }
   *                          active = boss section running and core not yet broken; name is Korean
   *                          ('제로 시그널' for the final desperation card); phase = card index.
   *   engine.timeline        { events, bossStart, bossHp, spells, sections[{t,name}] }
   *   engine.sectionIndex, engine.time, engine.cx/cy (core), score/combo/energy/overdrive, player
   *
   * Events from consume():
   *   graze{x,y,combo} phase{x,y,color} dash{x,y} dashReady hit{x,y,shields} overdrive section{name}
   *   repair{shields} complete dead
   *   bossPhase{name, phase, captured}   a spell card starts (captured = previous card broken by damage)
   *   bossBreak{x,y,bonus}                boss HP reached 0
   *   bonus{label,value}                  score bonus (no-hit section, spell capture, clear)
   *   clearScreen{}                       bullets wiped (card change / break)
   *
   * Scoring: passive 10/s x mult, graze 60 x mult (x2 in overdrive), dash-phase 80 x mult.
   * Combo timer 2.5s; when it lapses the combo halves instead of resetting (a hit resets it).
   * Boss takes 1 damage per graze and 3 per dash-phased bullet while active.
   *
   * ---- SIGNAL RUN extensions (all optional; a bare mission behaves exactly as before) ----
   * new G.Engine(mission, { mode, seed, timeline, mods, carry, perks, perkSeed })
   *   timeline  prebuilt timeline (G.makeTimeline(m, mode, o)); default G.makeTimeline(mission, mode)
   *   mods      overrides for the tunables object this.k (defaults G.ENGINE_K0, see below)
   *   carry     { score, shields, combo, energy, dashes, maxCombo, breakdown, flags } from a previous
   *             sector's stats().carryOut (sector continuation)
   *   perks     ids of perks / resonances with hooks (G.perkDef(id).hooks); see patterns.js G.PERKS
   *   perkSeed  seed of this.prng — perk randomness never touches this.rng (bullet RNG)
   * Extra events: nearMiss{x,y} shard{n,why} perkProc{id} revive{} (resonance{tag} is emitted by run.js)
   * stats() adds: nearMisses, shards, perkProcs{id:n}, phased, carryOut{...}
   * The hitbox (player.hit = 5) is never modified by tunables.
   */
  const G = (window.G = window.G || {}),
    STEP = 1 / 120;
  // Tunables. mods={} reproduces the pre-run engine exactly (verified by tools/verify.js).
  const K0 = {
    grazeR: 27, // graze radius (px)
    comboT: 2.5, // combo timer (s)
    comboKeep: 0.5, // fraction of combo kept when the timer lapses
    dashMax: 2,
    dashRegenMul: 1,
    shieldMax: 3,
    shields0: 3, // starting shields when there is no carry
    eGraze: 3.5, // overdrive energy per graze
    ePhase: 2.5, // ... per dash-phased bullet
    odDur: 5, // overdrive length (s)
    odSlow: 0.78, // bullet speed factor during overdrive
    odGrazeMul: 2, // graze score factor during overdrive
    grazeMul: 1, // graze score factor
    scoreMul: 1, // factor on every score source (glitches)
    speedMul: 1, // bullet speed factor
    teleDelta: 0, // added to the core telegraph length
    bossDmgGraze: 1,
    bossDmgPhase: 3,
    tiers: [[100, 5], [50, 4], [25, 3], [10, 2]], // [combo, multiplier], descending
    repairs: null, // section indices that repair a shield (null = mode default)
    clearBonus: 2000, // survival bonus per remaining shield
    capRepairHits: 0, // a captured spell card repairs if cardHits <= this
  };
  G.ENGINE_K0 = K0;
  class Engine {
    constructor(mission, opts = {}) {
      if (typeof opts === 'string') opts = { mode: opts };
      this.mission = mission;
      this.mode = G.MODES && G.MODES[opts.mode] ? opts.mode : 'normal';
      this.md = G.modeOf(this.mode);
      this.seed = opts.seed ?? mission.seed;
      this.rng = G.mulberry(this.seed);
      this.k = { ...K0, ...(opts.mods || {}) };
      const k = this.k,
        c = opts.carry || null;
      this.prng = G.mulberry(opts.perkSeed ?? (this.seed ^ 0x2545f491));
      this.flags = c && c.flags ? { ...c.flags } : {};
      this.perkState = {};
      this.perkProcs = {};
      this.hooks = [];
      for (const id of opts.perks || []) {
        const d = G.perkDef && G.perkDef(id);
        if (d && d.hooks) this.hooks.push({ id, h: d.hooks });
      }
      this.timeline = opts.timeline || G.makeTimeline(mission, this.mode);
      this.eventIndex = 0;
      this.sectionIndex = 0;
      this.left = 74;
      this.right = 1206;
      this.top = 82;
      this.bottom = 660;
      this.cx = 640;
      this.cy = 190;
      this.player = {
        x: 640,
        y: 560,
        vx: 0,
        vy: 0,
        r: 12,
        hit: 5,
        graze: k.grazeR,
        shields: Math.max(1, Math.min(k.shieldMax, c ? c.shields : k.shields0)),
        invuln: 0,
        dashT: 0,
        dashes: c && c.dashes != null ? Math.min(k.dashMax, c.dashes) : k.dashMax,
        dashRegen: 0,
        lastDx: 0,
        lastDy: -1,
      };
      this.input = { x: 0, y: 0, focus: false };
      this.bullets = [];
      this.telegraphs = [];
      this.warnings = [];
      this.events = [];
      this.acc = 0;
      this.time = 0;
      this.patternClock = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboT = 0;
      this.grazes = 0;
      this.hits = 0;
      this.dashCount = 0;
      this.energy = 0;
      this.overdrive = 0;
      this.overdrives = 0;
      this.done = false;
      this.dead = false;
      this.dashQueued = false;
      this.sectionHits = 0;
      this.cardHits = 0;
      this.breakdown = { passive: 0, graze: 0, phase: 0, bonus: 0 };
      this.nearMisses = 0;
      this.shards = 0;
      this.phased = 0;
      if (c) {
        this.score = c.score || 0;
        this.combo = c.combo || 0;
        this.maxCombo = c.maxCombo || 0;
        this.comboT = this.combo > 0 ? k.comboT : 0;
        this.energy = c.energy || 0;
        if (c.breakdown) Object.assign(this.breakdown, c.breakdown);
      }
      this.boss = {
        hp: this.timeline.bossHp,
        max: this.timeline.bossHp,
        phase: -1,
        name: '',
        active: false,
        broken: false,
        cardT: 0,
        cardDur: 0,
        final: false,
      };
      this.emitters = [];
      this.bulletCap =
        mission.bulletCap || (mission.difficulty === 3 ? 420 : mission.difficulty === 2 ? 360 : 320);
    }
    mult(c) {
      for (const t of this.k.tiers) if (c >= t[0]) return t[1];
      return 1;
    }
    // run perk hooks; returns true if any hook returned true
    hook(name, a) {
      let r = false;
      for (const p of this.hooks) {
        const fn = p.h[name];
        if (fn && fn(this, a, this.perkState[p.id] || (this.perkState[p.id] = {}))) r = true;
      }
      return r;
    }
    proc(id) {
      this.perkProcs[id] = (this.perkProcs[id] || 0) + 1;
      this.events.push({ type: 'perkProc', id });
    }
    shard(n, why) {
      this.shards += n;
      this.events.push({ type: 'shard', n, why });
    }
    repair() {
      const p = this.player;
      if (p.shields >= this.k.shieldMax) return false;
      p.shields++;
      this.events.push({ type: 'repair', shields: p.shields });
      return true;
    }
    clearAround(x, y, r) {
      for (let i = this.bullets.length - 1; i >= 0; i--)
        if (Math.hypot(this.bullets[i].x - x, this.bullets[i].y - y) < r) this.bullets.splice(i, 1);
    }
    setInput(x, y, focus = false) {
      const l = Math.hypot(x, y) || 1;
      this.input.x = Math.abs(x) > 1 || Math.abs(y) > 1 ? x / l : x;
      this.input.y = Math.abs(x) > 1 || Math.abs(y) > 1 ? y / l : y;
      this.input.focus = focus;
    }
    dash() {
      this.dashQueued = true;
    }
    warn(w) {
      this.warnings.push(w);
    }
    spawn(x, y, a, s, opt = {}) {
      if (this.bullets.length >= this.bulletCap) return;
      const r = opt.r || 8;
      this.bullets.push({
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(a) * s * this.k.speedMul,
        vy: Math.sin(a) * s * this.k.speedMul,
        r,
        color: opt.color || '#ff4d6d',
        curve: opt.curve || 0,
        age: 0,
        grazed: false,
        shape: opt.shape || 'orb',
        kind: opt.kind || 'orb',
      });
    }
    addScore(kind, v) {
      v *= this.k.scoreMul;
      this.score += v;
      this.breakdown[kind] += v;
    }
    bonus(label, value) {
      value = Math.round(value * this.k.scoreMul);
      this.score += value;
      this.breakdown.bonus += value;
      this.events.push({ type: 'bonus', label, value });
    }
    fire(type, opt) {
      const fn = G.Patterns[type];
      if (!fn) return;
      if (opt && opt.warn) {
        const life = Math.max(0.15, this.md.tele + this.k.teleDelta);
        this.telegraphs.push({ t: life, life, type, x: this.cx, y: this.cy, color: opt.color });
      }
      fn(this, this.player, opt);
    }
    clearScreen() {
      this.bullets.length = 0;
      this.warnings.length = 0;
      this.events.push({ type: 'clearScreen' });
    }
    damage(n) {
      const b = this.boss;
      if (!b.active) return;
      b.hp = Math.max(0, b.hp - n);
      if (b.hp <= 0) {
        b.active = false;
        b.broken = true;
        this.clearScreen();
        this.emitters = [{ ...this.timeline.afterglow, next: 2.5 }];
        const v = 5000 * this.md.bonus * this.mission.difficulty;
        this.events.push({ type: 'bossBreak', x: this.cx, y: this.cy, bonus: v });
        this.bonus('코어 격파', v);
      }
    }
    startCard(k, captured) {
      const b = this.boss,
        sp = this.timeline.spells[k],
        p = this.player;
      if (k > 0) {
        if (captured) {
          this.bonus('스펠 격파', 2000 * k * this.md.bonus);
          this.shard(3, 'spell');
          if (this.cardHits <= this.k.capRepairHits) this.repair();
        }
        this.clearScreen();
      }
      this.cardHits = 0;
      b.phase = k;
      b.name = sp.name;
      b.final = !!sp.final;
      b.cardDur = sp.final ? Math.max(0.01, this.mission.duration - this.time) : sp.dur;
      b.cardT = b.cardDur;
      this.emitters = sp.emit.map((em, i) => ({ ...em, next: 1 + i * 0.35 }));
      this.events.push({ type: 'bossPhase', name: sp.name, phase: k, captured: !!captured });
    }
    update(dt) {
      if (this.done || this.dead) return;
      this.acc += Math.min(0.05, dt);
      while (this.acc >= STEP) {
        this.step();
        this.acc -= STEP;
        if (this.done || this.dead) break;
      }
    }
    step() {
      if (this.done || this.dead) return;
      const dt = STEP,
        p = this.player,
        i = this.input,
        tl = this.timeline,
        b0 = this.boss;
      this.time += dt;
      this.patternClock += dt;
      if (this.time < tl.bossStart) {
        this.cx = 640 + Math.sin(this.time * 0.47) * 250;
        this.cy = 175 + Math.sin(this.time * 0.71) * 55;
      } else {
        // core settles at the top centre for the boss fight
        const k = 1 - Math.pow(0.02, dt);
        this.cx += (640 - this.cx) * k;
        this.cy += (190 - this.cy) * k;
      }
      while (this.sectionIndex + 1 < tl.sections.length && this.time >= tl.sections[this.sectionIndex + 1].t) {
        if (this.sectionHits === 0) this.bonus('무피격 구간', 500 * (this.sectionIndex + 1));
        this.sectionHits = 0;
        this.sectionIndex++;
        this.events.push({ type: 'section', name: tl.sections[this.sectionIndex].name });
        if ((this.k.repairs || this.md.repairs).includes(this.sectionIndex)) this.repair();
      }
      // boss start / spell cards
      if (!b0.active && !b0.broken && b0.phase < 0 && this.time >= tl.bossStart) {
        b0.active = true;
        this.startCard(0, false);
      }
      if (b0.active && !b0.final) {
        b0.cardT -= dt;
        const n = tl.spells.length,
          threshold = b0.max * (1 - (b0.phase + 1) / n);
        if (b0.hp <= threshold || b0.cardT <= 0) this.startCard(b0.phase + 1, b0.hp <= threshold);
      } else if (b0.active) b0.cardT = Math.max(0, b0.cardT - dt);
      // pre-boss timeline
      while (this.eventIndex < tl.events.length && tl.events[this.eventIndex].t <= this.time) {
        const ev = tl.events[this.eventIndex++];
        this.fire(ev.type, ev.opt);
      }
      // boss / afterglow emitters
      for (const em of this.emitters) {
        em.next -= dt;
        if (em.next <= 0) {
          em.next += em.every;
          this.fire(em.type, em.opt);
        }
      }
      for (let k = this.telegraphs.length - 1; k >= 0; k--) {
        this.telegraphs[k].t -= dt;
        if (this.telegraphs[k].t <= 0) this.telegraphs.splice(k, 1);
      }
      for (let k = this.warnings.length - 1; k >= 0; k--) {
        const w = this.warnings[k];
        w.t -= dt;
        if (w.t <= 0) {
          this.warnings.splice(k, 1);
          if (w.fire) w.fire(this);
        }
      }
      let ix = i.x,
        iy = i.y,
        il = Math.hypot(ix, iy);
      if (il > 1) {
        ix /= il;
        iy /= il;
      }
      if (il > 0.08) {
        p.lastDx = ix;
        p.lastDy = iy;
      }
      if (this.dashQueued && p.dashes > 0) {
        p.dashes--;
        this.dashCount++;
        p.dashT = 0.2;
        p.invuln = Math.max(p.invuln, 0.24);
        p.vx = p.lastDx * 850;
        p.vy = p.lastDy * 850;
        this.events.push({ type: 'dash', x: p.x, y: p.y });
        this.hook('onDash');
      }
      this.dashQueued = false;
      if (p.dashes < this.k.dashMax) {
        p.dashRegen += dt;
        if (p.dashRegen >= this.md.dashRegen * this.k.dashRegenMul) {
          p.dashes++;
          p.dashRegen = 0;
          this.events.push({ type: 'dashReady' });
        }
      } else p.dashRegen = 0;
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx *= 0.992;
        p.vy *= 0.992;
        if (p.dashT <= 0) this.hook('onDashEnd');
      } else {
        const max = i.focus ? 210 : 350,
          accel = i.focus ? 2300 : 2900,
          damp = Math.pow(0.0008, dt);
        p.vx = p.vx * damp + ix * accel * dt;
        p.vy = p.vy * damp + iy * accel * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > max) {
          p.vx = (p.vx / sp) * max;
          p.vy = (p.vy / sp) * max;
        }
      }
      p.x = G.clamp(p.x + p.vx * dt, this.left + p.r, this.right - p.r);
      p.y = G.clamp(p.y + p.vy * dt, this.top + p.r, this.bottom - p.r);
      p.invuln = Math.max(0, p.invuln - dt);
      const od = this.overdrive > 0,
        slow = od ? this.k.odSlow : 1,
        k = this.k;
      for (let b = this.bullets.length - 1; b >= 0; b--) {
        const q = this.bullets[b];
        if (!q) continue; // the screen may have been cleared by a boss break mid-loop
        q.px = q.x;
        q.py = q.y;
        q.age += dt;
        if (q.curve) {
          const a = q.curve * dt,
            cs = Math.cos(a),
            sn = Math.sin(a),
            vx = q.vx * cs - q.vy * sn;
          q.vy = q.vx * sn + q.vy * cs;
          q.vx = vx;
        }
        q.x += q.vx * dt * slow;
        q.y += q.vy * dt * slow;
        if (
          q.age > 10 ||
          q.x < this.left - q.r ||
          q.x > this.right + q.r ||
          q.y < this.top - q.r ||
          q.y > this.bottom + q.r
        ) {
          this.bullets.splice(b, 1);
          continue;
        }
        const dx = q.x - p.x,
          dy = q.y - p.y,
          d = Math.hypot(dx, dy);
        if (p.dashT > 0 && d < q.r + p.r + 5) {
          this.bullets.splice(b, 1);
          this.addScore('phase', 80 * this.mult(this.combo));
          this.energy = Math.min(100, this.energy + k.ePhase);
          this.events.push({ type: 'phase', x: q.x, y: q.y, color: q.color });
          this.damage(k.bossDmgPhase);
          if (++this.phased % 4 === 0) this.shard(1, 'phase');
          this.hook('onPhase', q);
          continue;
        }
        if (p.invuln <= 0 && d < q.r + p.hit) {
          this.hit();
          if (this.dead) return;
          this.bullets.splice(b, 1);
          continue;
        }
        if (!q.near && p.invuln <= 0 && d < q.r + p.hit + 3) {
          q.near = true;
          this.nearMisses++;
          this.events.push({ type: 'nearMiss', x: q.x, y: q.y });
        }
        if (!q.grazed && d < q.r + p.graze) {
          q.grazed = true;
          this.grazes++;
          this.combo++;
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.comboT = k.comboT;
          this.addScore('graze', 60 * this.mult(this.combo) * (od ? k.odGrazeMul : 1) * k.grazeMul);
          this.energy = Math.min(100, this.energy + k.eGraze);
          this.events.push({ type: 'graze', x: q.x, y: q.y, combo: this.combo });
          this.damage(k.bossDmgGraze);
          if (this.grazes % 10 === 0) this.shard(1, 'graze');
          this.hook('onGraze', q);
          if (this.dead) return;
        }
      }
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) {
          this.combo = Math.floor(this.combo * this.k.comboKeep);
          if (this.combo > 0) this.comboT = this.k.comboT;
        }
      }
      if (this.energy >= 100 && this.overdrive <= 0) {
        this.energy = 0;
        this.overdrive = this.k.odDur;
        this.overdrives++;
        this.events.push({ type: 'overdrive' });
        this.hook('onOverdrive');
      }
      this.overdrive = Math.max(0, this.overdrive - dt);
      this.addScore('passive', dt * 10 * this.mult(this.combo));
      if (this.time >= this.mission.duration) {
        this.time = this.mission.duration;
        if (this.sectionHits === 0) this.bonus('무피격 구간', 500 * (this.sectionIndex + 1));
        this.bonus('생존 보너스', p.shields * this.k.clearBonus * this.md.bonus);
        if (this.hits === 0) this.shard(6, 'nohit');
        this.hook('onSectorEnd');
        this.done = true;
        this.boss.active = false;
        this.bullets.length = 0;
        this.warnings.length = 0;
        this.events.push({ type: 'complete' });
      }
    }
    hit() {
      const p = this.player;
      p.shields--;
      p.invuln = 1.4;
      p.dashT = 0;
      this.hits++;
      this.sectionHits++;
      this.cardHits++;
      this.combo = 0;
      this.comboT = 0;
      this.energy = Math.max(0, this.energy - 25);
      this.events.push({ type: 'hit', x: p.x, y: p.y, shields: p.shields });
      for (let i = this.bullets.length - 1; i >= 0; i--)
        if (Math.hypot(this.bullets[i].x - p.x, this.bullets[i].y - p.y) < 190) this.bullets.splice(i, 1);
      if (p.shields <= 0 && this.hook('onLethal')) {
        this.events.push({ type: 'revive', shields: p.shields });
        return;
      }
      if (p.shields <= 0) {
        this.dead = true;
        this.boss.active = false;
        this.events.push({ type: 'dead' });
      }
    }
    consume() {
      return this.events.splice(0);
    }
    stats() {
      const s = {
        score: Math.floor(this.score),
        time: this.time,
        combo: this.combo,
        maxCombo: this.maxCombo,
        grazes: this.grazes,
        hits: this.hits,
        clear: this.done,
        section: this.sectionIndex + 1,
        mode: this.mode,
        bossBroken: this.boss.broken,
        dashes: this.dashCount,
        deathSection: this.dead ? this.sectionIndex : -1,
        sectionTimes: this.timeline.sections.map((q) => q.t),
        overdrives: this.overdrives,
        breakdown: { ...this.breakdown },
        nearMisses: this.nearMisses,
        shards: this.shards,
        phased: this.phased,
        perkProcs: { ...this.perkProcs },
        carryOut: {
          score: this.score,
          shields: this.player.shields,
          combo: this.combo,
          maxCombo: this.maxCombo,
          energy: this.energy,
          dashes: this.player.dashes,
          breakdown: { ...this.breakdown },
          flags: { ...this.flags },
        },
      };
      s.grade = G.gradeRun(s, this.mission, this.mode);
      return s;
    }
  }
  G.Engine = Engine;
  G.ENGINE_STEP = STEP;
})();
