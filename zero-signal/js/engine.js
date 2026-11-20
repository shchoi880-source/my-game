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
   */
  const G = (window.G = window.G || {}),
    STEP = 1 / 120;
  const mult = (c) => (c >= 100 ? 5 : c >= 50 ? 4 : c >= 25 ? 3 : c >= 10 ? 2 : 1);
  class Engine {
    constructor(mission, opts = {}) {
      if (typeof opts === 'string') opts = { mode: opts };
      this.mission = mission;
      this.mode = G.MODES && G.MODES[opts.mode] ? opts.mode : 'normal';
      this.md = G.modeOf(this.mode);
      this.seed = opts.seed ?? mission.seed;
      this.rng = G.mulberry(this.seed);
      this.timeline = G.makeTimeline(mission, this.mode);
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
        graze: 27,
        shields: 3,
        invuln: 0,
        dashT: 0,
        dashes: 2,
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
      this.bulletCap = mission.difficulty === 3 ? 420 : mission.difficulty === 2 ? 360 : 320;
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
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
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
      this.score += v;
      this.breakdown[kind] += v;
    }
    bonus(label, value) {
      value = Math.round(value);
      this.addScore('bonus', value);
      this.events.push({ type: 'bonus', label, value });
    }
    fire(type, opt) {
      const fn = G.Patterns[type];
      if (!fn) return;
      if (opt && opt.warn) {
        const life = this.md.tele;
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
          if (this.cardHits === 0 && p.shields < 3) {
            p.shields++;
            this.events.push({ type: 'repair', shields: p.shields });
          }
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
        if (this.md.repairs.includes(this.sectionIndex) && p.shields < 3) {
          p.shields++;
          this.events.push({ type: 'repair', shields: p.shields });
        }
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
      }
      this.dashQueued = false;
      if (p.dashes < 2) {
        p.dashRegen += dt;
        if (p.dashRegen >= this.md.dashRegen) {
          p.dashes++;
          p.dashRegen = 0;
          this.events.push({ type: 'dashReady' });
        }
      } else p.dashRegen = 0;
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx *= 0.992;
        p.vy *= 0.992;
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
        slow = od ? 0.78 : 1;
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
          this.addScore('phase', 80 * mult(this.combo));
          this.energy = Math.min(100, this.energy + 2.5);
          this.events.push({ type: 'phase', x: q.x, y: q.y, color: q.color });
          this.damage(3);
          continue;
        }
        if (p.invuln <= 0 && d < q.r + p.hit) {
          this.hit();
          if (this.dead) return;
          this.bullets.splice(b, 1);
          continue;
        }
        if (!q.grazed && d < q.r + p.graze) {
          q.grazed = true;
          this.grazes++;
          this.combo++;
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.comboT = 2.5;
          this.addScore('graze', 60 * mult(this.combo) * (od ? 2 : 1));
          this.energy = Math.min(100, this.energy + 3.5);
          this.events.push({ type: 'graze', x: q.x, y: q.y, combo: this.combo });
          this.damage(1);
        }
      }
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) {
          this.combo = Math.floor(this.combo / 2);
          if (this.combo > 0) this.comboT = 2.5;
        }
      }
      if (this.energy >= 100 && this.overdrive <= 0) {
        this.energy = 0;
        this.overdrive = 5;
        this.overdrives++;
        this.events.push({ type: 'overdrive' });
      }
      this.overdrive = Math.max(0, this.overdrive - dt);
      this.addScore('passive', dt * 10 * mult(this.combo));
      if (this.time >= this.mission.duration) {
        this.time = this.mission.duration;
        if (this.sectionHits === 0) this.bonus('무피격 구간', 500 * (this.sectionIndex + 1));
        this.bonus('생존 보너스', p.shields * 2000 * this.md.bonus);
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
      };
      s.grade = G.gradeRun(s, this.mission, this.mode);
      return s;
    }
  }
  G.Engine = Engine;
  G.ENGINE_STEP = STEP;
})();
