(() => {
  'use strict';
  const G = (window.G = window.G || {});
  /*
   * ZERO SIGNAL renderer — art direction "B · Bold & Juicy".
   *
   * Look: flat sticker graphics. Every object = solid ink hard shadow (straight down) + thick ink outline
   * (#1B1233) + one white sheen strip on the top third. No glow / shadowBlur / additive blending, no black,
   * no neon grids. Hostile = warm (coral / sun / pink / lime) with a cream core; player = sky.
   * Eye comfort: no full-screen flashes, nothing blinks faster than ~2 Hz, G.save.data.reduced removes
   * shake, count-up bumps and idle rotations.
   *
   * ─── G.render (game, legacy signatures kept for js/screens.js) ───────────────────────────────────────
   *   bg(c, t, intensity, mission, opt?)   page background over the full visible span (gutters included).
   *                                        mission given → results style (vertical), else title style
   *                                        (diagonal). opt.rays = {x,y} | false (static sunburst centre).
   *   world(c, engine)                     full gameplay frame: arena, lanes, bullets, JAMMER, BLIP, fx, HUD
   *   bullet(c, b, opt?)                   one bullet in its kind look (opt.kind overrides)
   *   bulletIcon(c, x, y, kind, r, angle)  bullet preview for cards / title
   *   demoBullets(c, t, cx, cy, rad)       slow drifting bullet ring (title)
   *   enemyColor(b) · KIND_COLOR · COLORS  kind → body colour
   *   lock(c, x, y, s, color)              lock glyph
   *   gradeRing(c, x, y, k, color)         one-shot dotted ring burst (k 0..1)
   *   fx(ev) · span()                      optional engine-event hook · visible logical span {x0,x1,w}
   *   pill(c,x,y,w,h,label,value,color,align) → rect     label/value chip
   *   panel(c,x,y,w,h,a) · button(c,rect,label,accent,small) · hit(rect,x,y)
   *
   * ─── G.ui (kit for every screen; all coords are logical, scene space) ────────────────────────────────
   *   C                    palette tokens: ink night deep arena plate plateHi cream mute sun sunD coral coralD
   *                        pink pinkD lime limeD sky skyD mint mintD grape grapeD white
   *   FONT · font(size, weight=900)                    font stack (Pretendard first) / CSS font string
   *   ease.backOut(t,s=1.6) · ease.cubicOut(t) · ease.pop(t)  (pop: 0.6 → 1.08 → 1 scale, t 0..1 = 260 ms)
   *   num(n) "34,646" · pad(n,digits) "034,945" · hit(rect,x,y) · reduced()
   *
   *   text(c, s, x, y, size, color, {weight, align, base, ls, alpha, maxW}) → width     plain text
   *   label(c, s, x, y, {size=12, color=mute, align, ls=1.5})                          caps caption
   *   sticker(c, s, x, y, size, {fill=cream, stroke, shadow, align='center', base='middle', rot(deg),
   *           ls, alpha, sx, sy, mono, maxW}) → width       outlined + ink-shadow "sticker" number/text
   *   measure(s, size, weight=900, ls=0)
   *
   *   plate(c, x, y, w, h, {fill=plate, r, sw=4, sh=6, sheen=true, sheenA=.14, lip, tilt(deg), alpha})
   *   panel(c, x, y, w, h, {color, tilt, shadow, r, sw, sheen, lip})   = plate with panel defaults
   *   card(...)                                                        = panel
   *   disc(c, x, y, r, fill, {sw=4, sh=5, sheen=true})
   *   starPath(c, cx, cy, R, r, n, rotDeg)
   *   burst(c, x, y, R, {points=14, inner=.8, fill=sun, disc=coral, discR=.66, text, textSize, tilt=8,
   *         scale=1, sh=6})                                            starburst badge (FLOW ×N, medals)
   *   button(c, rect, label, {variant:'primary'|'secondary'|'ghost'|'share'|'danger'|'mint', icon, pressed,
   *          disabled, size:'sm'|'md'|'lg', sub, color, textColor, r}) → rect   (pressed sinks 6 px)
   *   roundButton(c, cx, cy, r, {color=sun, icon, label, pressed, ring, pips:[n,max], iconColor})
   *   chip(c, x, y, text, {color=plate, textColor, size=14, h, align:'left'|'center'|'right', icon, iconColor,
   *        label, value, valueColor, tilt, sh}) → rect                       pill / label+value chip
   *   toggle(c, rect, options=['NORMAL','HARD'], index, {colors:[mint, coral]}) → [segment rects]
   *   progress(c, x, y, w, h, f, {color=sun, track=ink, notches:[.33,.66], sheen=true})
   *   segments(c, x, y, w, h, n, filled, {labels, check=true, color=mint, partial})   stage bar
   *   ribbon(c, cx, cy, w, text, {color=pink, dark=pinkD, h=64, tilt=-4, k=1, size})  k = unroll 0..1
   *   icon(c, name, x, y, size, {color, ink, sw})  names: play retry share gear lock medal shield star
   *        cardBack skin pause check cross clock bolt eye spark home sound music trophy info back
   *   ICONS                                        list of icon names
   *   RARITY = {common, rare, epic, legendary, glitch} → {fill, dark, label}
   *   cardFrame(c, x, y, w, h, rarity, {tilt, sh, pressed})
   *   cardFace(c, rect, {rarity, title, desc, icon, iconColor, tag, level, tilt})
   *   cardBack(c, rect, {rarity, tilt})
   *   flipCard(c, rect, k, drawFront(c,rect), drawBack(c,rect))  k 0..1 (0 = back, 1 = front)
   *   gradeBadge(c, x, y, grade, {size=1, k=1, tilt=-8, ring=true})  D..SS; k 0..1 drop-in (380 ms backOut)
   *   GRADE = {SS:[fill,disc],...}
   *   countUp(target, t, {dur=.6, delay=0, from=0}) → {value, sx, sy, done}   (bumps 1.12 per 10% step)
   *   toast(c, text, value, {t, life=1.64, x, y, color=mint, w, tilt=-3}) slide in 220 ms, hold, slide out
   *   popup(c, text, x, y, k, {color=sun, size=30})   score popup: rises 36 px, fades in last 200 ms
   *   shield(c, x, y, on, size=30) · spark(c, x, y, R, color)
   *   ship(c, x, y, {scale=1, rot, flame, eyeScale, look:{x,y}, alpha, body, fin})  BLIP (eye = hitbox);
   *                        body/fin = skin colours (G.shipSkin is applied to the in-game BLIP)
   *   boss(c, x, y, {scale=1, t, look:{x,y}, chips=8, squash, sleepy, broken}) JAMMER
   *   bg(c, {kind:'title'|'results'|'arena', rays:{x,y}|false, x0, w})
   */

  // ---- tokens ---------------------------------------------------------------
  const C = {
    ink: '#1B1233',
    night: '#221848',
    deep: '#2A1F5C',
    arena: '#33276E',
    arena2: '#382B78',
    plate: '#4B3B94',
    plateHi: '#5E4DB0',
    cream: '#FFF4DE',
    mute: '#B9ADE6',
    sun: '#FFC83D',
    sunD: '#E59A12',
    coral: '#FF5D4F',
    coralD: '#D63A33',
    pink: '#FF6FBF',
    pinkD: '#D6449A',
    lime: '#B6F03C',
    limeD: '#7DBE19',
    sky: '#4CC9FF',
    skyD: '#1F92D6',
    mint: '#3FE0A5',
    mintD: '#1FAE79',
    grape: '#8A4DFF',
    grapeD: '#5E2BCC',
    white: '#FFFFFF',
  };
  const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Inter Display','Inter',system-ui,sans-serif";
  G.FONT = FONT; // every G.text call picks up the new stack
  const DEG = Math.PI / 180,
    TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = () => !!(G.save && G.save.data && G.save.data.reduced);
  const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const span = () => {
    const ax = Math.max(0, +G.AX || 0);
    return { x0: -ax, x1: G.W + ax, w: G.W + ax * 2 };
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const ease = {
    backOut: (t, s = 1.6) => {
      t = clamp(t, 0, 1) - 1;
      return 1 + (s + 1) * t * t * t + s * t * t;
    },
    cubicOut: (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
    pop: (t) => {
      t = clamp(t, 0, 1);
      return t < 0.6 ? lerp(0.6, 1.08, ease.cubicOut(t / 0.6)) : lerp(1.08, 1, (t - 0.6) / 0.4);
    },
  };
  const num = (n) => Math.round(+n || 0).toLocaleString('en-US');
  const pad = (n, d = 6) =>
    String(Math.max(0, Math.round(+n || 0)))
      .padStart(d, '0')
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const hit = (b, x, y) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  const font = (size, weight = 900) => `${weight} ${size}px ${FONT}`;

  // ---- text -----------------------------------------------------------------
  const setLS = (c, ls) => {
    if ('letterSpacing' in c) c.letterSpacing = `${ls || 0}px`;
  };
  function measure(s, size, weight = 900, ls = 0, c = G.ctx) {
    if (!c) return String(s).length * size * 0.6;
    c.save();
    c.font = font(size, weight);
    setLS(c, ls);
    const w = c.measureText(String(s)).width;
    c.restore();
    return w;
  }
  function text(c, s, x, y, size, color = C.cream, o = {}) {
    s = String(s);
    c.save();
    c.font = font(size, o.weight || 900);
    setLS(c, o.ls);
    c.textAlign = o.align || 'left';
    c.textBaseline = o.base || 'middle';
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.fillStyle = color;
    c.fillText(s, x, y, o.maxW);
    const w = c.measureText(s).width;
    c.restore();
    return w;
  }
  const label = (c, s, x, y, o = {}) =>
    text(c, String(s).toUpperCase(), x, y, o.size || 12, o.color || C.mute, {
      ls: o.ls ?? 1.5,
      align: o.align,
      base: o.base,
      alpha: o.alpha,
      weight: o.weight || 900,
      maxW: o.maxW,
    });
  // outlined text with ink hard shadow. stroke ≈ 13% of size, shadow ≈ 7%.
  function sticker(c, s, x, y, size, o = {}) {
    s = String(s);
    const fill = o.fill || C.cream,
      sw = o.stroke ?? Math.max(3, Math.round(size * 0.13)),
      sh = o.shadow ?? Math.max(2, Math.round(size * 0.07));
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot * DEG);
    if (o.sx || o.sy) c.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.font = font(size, o.weight || 900);
    setLS(c, o.ls);
    if (o.maxW) {
      const mw = c.measureText(s).width;
      if (mw > o.maxW) {
        // squeeze horizontally around the anchor
        c.scale(o.maxW / mw, 1);
      }
    }
    c.textBaseline = o.base || 'middle';
    c.lineJoin = 'round';
    c.miterLimit = 2;
    const align = o.align || 'center';
    let parts;
    // mono: fixed-advance digits so timers don't wobble
    if (o.mono) {
      const adv = c.measureText('0').width,
        ws = [...s].map((ch) => (/\d/.test(ch) ? adv : c.measureText(ch).width)),
        tw = ws.reduce((a, b) => a + b, 0);
      let px = align === 'center' ? -tw / 2 : align === 'right' ? -tw : 0;
      parts = [...s].map((ch, i) => {
        const w = ws[i],
          p = { ch, x: px + w / 2 };
        px += w;
        return p;
      });
      c.textAlign = 'center';
      var width = tw;
    } else {
      c.textAlign = align;
      parts = [{ ch: s, x: 0 }];
      width = c.measureText(s).width;
    }
    const draw = (dy, fn) => parts.forEach((p) => fn(p.ch, p.x, dy));
    if (sh) {
      c.fillStyle = C.ink;
      c.strokeStyle = C.ink;
      c.lineWidth = sw;
      draw(sh, (ch, px, dy) => {
        if (sw) c.strokeText(ch, px, dy);
        c.fillText(ch, px, dy);
      });
    }
    if (sw) {
      c.strokeStyle = o.strokeColor || C.ink;
      c.lineWidth = sw;
      draw(0, (ch, px) => c.strokeText(ch, px, 0));
    }
    c.fillStyle = fill;
    draw(0, (ch, px) => c.fillText(ch, px, 0));
    c.restore();
    return width;
  }

  // ---- primitives -----------------------------------------------------------
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else {
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
  }
  function withTilt(c, x, y, w, h, tilt, fn) {
    if (!tilt) return fn();
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.rotate(tilt * DEG);
    c.translate(-(x + w / 2), -(y + h / 2));
    fn();
    c.restore();
  }
  // chunky plate: hard shadow + ink outline + top sheen (+ optional bottom lip)
  function plate(c, x, y, w, h, o = {}) {
    const r = o.r ?? Math.min(18, h / 2),
      fill = o.fill || C.plate,
      sw = o.sw ?? 4,
      sh = o.sh ?? 6;
    withTilt(c, x, y, w, h, o.tilt, () => {
      c.save();
      if (o.alpha != null) c.globalAlpha *= o.alpha;
      if (sh) {
        rr(c, x, y + sh, w, h, r);
        c.fillStyle = C.ink;
        c.fill();
      }
      rr(c, x, y, w, h, r);
      c.fillStyle = fill;
      c.fill();
      if (o.lip) {
        c.save();
        c.clip();
        c.fillStyle = rgba(C.ink, 0.22);
        c.fillRect(x, y + h - sw / 2 - o.lip, w, o.lip + sw);
        c.restore();
      }
      if (o.sheen !== false) {
        rr(c, x + sw / 2 + 3, y + sw / 2 + 3, w - sw - 6, Math.max(4, h * 0.32), Math.max(2, r - 5));
        c.fillStyle = rgba('#ffffff', o.sheenA ?? 0.14);
        c.fill();
      }
      if (sw) {
        rr(c, x, y, w, h, r);
        c.lineWidth = sw;
        c.strokeStyle = C.ink;
        c.stroke();
      }
      c.restore();
    });
  }
  const panel = (c, x, y, w, h, o = {}) =>
    plate(c, x, y, w, h, {
      fill: o.color || o.fill || C.plate,
      tilt: o.tilt,
      sh: o.shadow ?? o.sh ?? 6,
      r: o.r ?? 20,
      sw: o.sw ?? 5,
      sheen: o.sheen,
      sheenA: o.sheenA,
      lip: o.lip,
      alpha: o.alpha,
    });
  function disc(c, x, y, r, fill, o = {}) {
    const sw = o.sw ?? 4,
      sh = o.sh ?? 5;
    c.save();
    if (sh) {
      c.fillStyle = C.ink;
      c.beginPath();
      c.arc(x, y + sh, r, 0, TAU);
      c.fill();
    }
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fillStyle = fill;
    c.fill();
    if (o.sheen !== false) {
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.beginPath();
      c.ellipse(x, y - r * 0.45, r * 0.62, r * 0.3, 0, 0, TAU);
      c.fill();
    }
    if (sw) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.lineWidth = sw;
      c.strokeStyle = C.ink;
      c.stroke();
    }
    c.restore();
  }
  function starPath(c, cx, cy, R, r, n, rot = 0) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot - 90) * DEG + (i * Math.PI) / n,
        rr2 = i % 2 ? r : R;
      c.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
    }
    c.closePath();
  }
  function spark(c, x, y, R, col = C.sun) {
    starPath(c, x, y, R, R * 0.34, 4, 12);
    c.fillStyle = col;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = 2.5;
    c.strokeStyle = C.ink;
    c.stroke();
  }
  function burst(c, x, y, R, o = {}) {
    const n = o.points || 14,
      inner = o.inner ?? 0.8,
      sh = o.sh ?? 6,
      sc = o.scale ?? 1;
    c.save();
    c.translate(x, y);
    c.rotate((o.tilt ?? 8) * DEG);
    c.scale(sc, sc);
    starPath(c, 0, sh, R, R * inner, n);
    c.fillStyle = C.ink;
    c.fill();
    starPath(c, 0, 0, R, R * inner, n);
    c.fillStyle = o.fill || C.sun;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = o.sw ?? Math.max(3, R * 0.07);
    c.strokeStyle = C.ink;
    c.stroke();
    if (o.disc !== false) {
      c.beginPath();
      c.arc(0, 0, R * (o.discR ?? 0.66), 0, TAU);
      c.fillStyle = o.disc || C.coral;
      c.fill();
      c.lineWidth = Math.max(2.5, R * 0.057);
      c.stroke();
    }
    if (o.text != null)
      sticker(c, o.text, 0, (o.textSize || R * 0.66) * 0.04, o.textSize || R * 0.66, {
        fill: o.textColor || C.cream,
        ...(o.textColor === C.ink ? { stroke: 0, shadow: 0 } : {}),
      });
    c.restore();
  }
  function shield(c, x, y, on = true, sz = 30) {
    const k = sz / 30;
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    const path = () => {
      c.beginPath();
      c.moveTo(0, -14);
      c.lineTo(13, -9);
      c.quadraticCurveTo(13, 9, 0, 17);
      c.quadraticCurveTo(-13, 9, -13, -9);
      c.closePath();
    };
    c.translate(0, 3);
    path();
    c.fillStyle = C.ink;
    c.fill();
    c.translate(0, -3);
    path();
    c.fillStyle = on ? C.sky : C.deep;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = 3.5;
    c.strokeStyle = C.ink;
    c.stroke();
    if (on) {
      c.beginPath();
      c.moveTo(-7, -7);
      c.lineTo(0, -10);
      c.lineTo(0, 8);
      c.quadraticCurveTo(-7, 4, -7, -7);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(-5, -2);
      c.lineTo(5, 6);
      c.moveTo(5, -2);
      c.lineTo(-5, 6);
      c.lineCap = 'round';
      c.lineWidth = 3;
      c.strokeStyle = C.plateHi;
      c.stroke();
    }
    c.restore();
  }

  // ---- icons ----------------------------------------------------------------
  // each icon builds its path(s) in a 100-unit box centred on 0,0; drawn as ink outline (behind) + colour fill
  const ICON = {
    play: (c) => {
      c.beginPath();
      c.moveTo(-26, -36);
      c.lineTo(38, 0);
      c.lineTo(-26, 36);
      c.closePath();
    },
    pause: (c) => {
      c.beginPath();
      rrPath(c, -30, -34, 20, 68, 6);
      rrPath(c, 10, -34, 20, 68, 6);
    },
    star: (c) => starPath(c, 0, 4, 44, 19, 5),
    spark: (c) => starPath(c, 0, 0, 44, 15, 4, 0),
    shield: (c) => {
      c.beginPath();
      c.moveTo(0, -42);
      c.lineTo(36, -28);
      c.quadraticCurveTo(36, 22, 0, 44);
      c.quadraticCurveTo(-36, 22, -36, -28);
      c.closePath();
    },
    lock: (c) => {
      c.beginPath();
      rrPath(c, -32, -8, 64, 50, 10);
      c.moveTo(-20, -8);
      c.lineTo(-20, -18);
      c.arc(0, -18, 20, Math.PI, 0);
      c.lineTo(20, -8);
      c.lineTo(10, -8);
      c.lineTo(10, -18);
      c.arc(0, -18, 10, 0, Math.PI, true);
      c.lineTo(-10, -8);
      c.closePath();
    },
    check: (c) => {
      c.beginPath();
      c.moveTo(-38, 0);
      c.lineTo(-22, -16);
      c.lineTo(-8, -2);
      c.lineTo(24, -36);
      c.lineTo(40, -20);
      c.lineTo(-8, 30);
      c.closePath();
    },
    cross: (c) => {
      c.beginPath();
      const a = 12,
        b = 38;
      c.moveTo(-b + a, -b);
      c.lineTo(0, -a);
      c.lineTo(b - a, -b);
      c.lineTo(b, -b + a);
      c.lineTo(a, 0);
      c.lineTo(b, b - a);
      c.lineTo(b - a, b);
      c.lineTo(0, a);
      c.lineTo(-b + a, b);
      c.lineTo(-b, b - a);
      c.lineTo(-a, 0);
      c.lineTo(-b, -b + a);
      c.closePath();
    },
    bolt: (c) => {
      c.beginPath();
      c.moveTo(10, -46);
      c.lineTo(-26, 6);
      c.lineTo(-4, 6);
      c.lineTo(-12, 46);
      c.lineTo(26, -10);
      c.lineTo(4, -10);
      c.closePath();
    },
    gear: (c) => {
      c.beginPath();
      const n = 8;
      for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * TAU - Math.PI / 2,
          r = i % 4 < 2 ? 44 : 32;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.moveTo(14, 0);
      c.arc(0, 0, 14, 0, TAU, true);
    },
    clock: (c) => {
      c.beginPath();
      c.arc(0, 0, 42, 0, TAU);
    },
    eye: (c) => {
      c.beginPath();
      c.moveTo(-46, 0);
      c.quadraticCurveTo(0, -44, 46, 0);
      c.quadraticCurveTo(0, 44, -46, 0);
      c.closePath();
    },
    medal: (c) => {
      c.beginPath();
      c.moveTo(-24, -46);
      c.lineTo(-8, -46);
      c.lineTo(4, -14);
      c.lineTo(-10, -10);
      c.closePath();
      c.moveTo(24, -46);
      c.lineTo(8, -46);
      c.lineTo(-4, -14);
      c.lineTo(10, -10);
      c.closePath();
      c.moveTo(28, 14);
      c.arc(0, 14, 28, 0, TAU);
    },
    trophy: (c) => {
      c.beginPath();
      c.moveTo(-30, -40);
      c.lineTo(30, -40);
      c.lineTo(26, -2);
      c.quadraticCurveTo(20, 16, 6, 18);
      c.lineTo(6, 28);
      c.lineTo(22, 34);
      c.lineTo(22, 44);
      c.lineTo(-22, 44);
      c.lineTo(-22, 34);
      c.lineTo(-6, 28);
      c.lineTo(-6, 18);
      c.quadraticCurveTo(-20, 16, -26, -2);
      c.closePath();
    },
    cardBack: (c) => {
      c.beginPath();
      rrPath(c, -32, -44, 64, 88, 10);
    },
    skin: (c) => {
      // BLIP body silhouette
      c.beginPath();
      c.moveTo(0, -46);
      c.bezierCurveTo(22, -46, 34, -10, 34, 14);
      c.bezierCurveTo(34, 34, 20, 42, 0, 42);
      c.bezierCurveTo(-20, 42, -34, 34, -34, 14);
      c.bezierCurveTo(-34, -10, -22, -46, 0, -46);
      c.closePath();
    },
    share: (c) => {
      c.beginPath();
      for (const [x, y] of [
        [24, -26],
        [-24, 0],
        [24, 26],
      ]) {
        c.moveTo(x + 15, y);
        c.arc(x, y, 15, 0, TAU);
      }
    },
    retry: (c) => {
      // thick 290° ring + arrow head
      c.beginPath();
      const a0 = -0.55 * Math.PI,
        a1 = a0 + 1.62 * Math.PI;
      c.arc(0, 4, 38, a0, a1);
      c.arc(0, 4, 22, a1, a0, true);
      c.closePath();
      c.moveTo(-30, -34);
      c.lineTo(2, -56);
      c.lineTo(2, -12);
      c.closePath();
    },
    home: (c) => {
      c.beginPath();
      c.moveTo(0, -44);
      c.lineTo(44, -6);
      c.lineTo(32, -6);
      c.lineTo(32, 40);
      c.lineTo(10, 40);
      c.lineTo(10, 14);
      c.lineTo(-10, 14);
      c.lineTo(-10, 40);
      c.lineTo(-32, 40);
      c.lineTo(-32, -6);
      c.lineTo(-44, -6);
      c.closePath();
    },
    sound: (c) => {
      c.beginPath();
      c.moveTo(-40, -14);
      c.lineTo(-20, -14);
      c.lineTo(4, -36);
      c.lineTo(4, 36);
      c.lineTo(-20, 14);
      c.lineTo(-40, 14);
      c.closePath();
      c.moveTo(16, -20);
      c.quadraticCurveTo(32, 0, 16, 20);
      c.lineTo(22, 26);
      c.quadraticCurveTo(44, 0, 22, -26);
      c.closePath();
    },
    music: (c) => {
      c.beginPath();
      c.ellipse(-20, 28, 16, 12, -0.3, 0, TAU);
      c.moveTo(-6, 28);
      c.lineTo(-6, -36);
      c.lineTo(36, -46);
      c.lineTo(36, 18);
      c.lineTo(24, 18);
      c.lineTo(24, -24);
      c.lineTo(6, -20);
      c.lineTo(6, 28);
      c.closePath();
      c.moveTo(38, 18);
      c.ellipse(22, 18, 16, 12, -0.3, 0, TAU);
    },
    info: (c) => {
      c.beginPath();
      c.arc(0, 0, 42, 0, TAU);
    },
    back: (c) => {
      c.beginPath();
      c.moveTo(-40, 0);
      c.lineTo(0, -36);
      c.lineTo(0, -14);
      c.lineTo(38, -14);
      c.lineTo(38, 14);
      c.lineTo(0, 14);
      c.lineTo(0, 36);
      c.closePath();
    },
  };
  function rrPath(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  const ICON_COLOR = {
    play: C.ink,
    pause: C.cream,
    star: C.sun,
    spark: C.sun,
    shield: C.sky,
    lock: C.mute,
    check: C.mint,
    cross: C.coral,
    bolt: C.cream,
    gear: C.cream,
    clock: C.sky,
    eye: C.cream,
    medal: C.sun,
    trophy: C.sun,
    cardBack: C.grape,
    skin: C.sky,
    share: C.cream,
    retry: C.ink,
    home: C.cream,
    sound: C.cream,
    music: C.cream,
    info: C.sky,
    back: C.cream,
  };
  function icon(c, name, x, y, size = 32, o = {}) {
    const f = ICON[name];
    if (!f) return;
    const k = size / 100,
      col = o.color || ICON_COLOR[name] || C.cream,
      sw = (o.sw ?? Math.max(2.5, size * 0.09)) / k;
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot * DEG);
    c.scale(k, k);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (name === 'retry') {
      // stroked ring + arrow head (a filled ring would close up at small sizes)
      const a0 = -0.5 * Math.PI,
        a1 = a0 + 1.6 * Math.PI,
        head = () => {
          c.beginPath();
          c.moveTo(-26, -34);
          c.lineTo(6, -56);
          c.lineTo(6, -12);
          c.closePath();
        };
      c.beginPath();
      c.arc(0, 4, 32, a0, a1);
      if (o.ink !== false && col !== C.ink) {
        c.lineWidth = 13 + sw * 2;
        c.strokeStyle = o.ink || C.ink;
        c.stroke();
        head();
        c.lineWidth = sw * 2;
        c.stroke();
        c.fillStyle = o.ink || C.ink;
        c.fill();
      }
      c.beginPath();
      c.arc(0, 4, 32, a0, a1);
      c.lineWidth = 13;
      c.strokeStyle = col;
      c.stroke();
      head();
      c.fillStyle = col;
      c.fill();
      c.restore();
      return;
    }
    f(c);
    if (o.ink !== false && col !== C.ink) {
      c.lineWidth = sw * 2;
      c.strokeStyle = o.ink || C.ink;
      c.stroke();
    }
    c.fillStyle = col;
    c.fill(name === 'retry' ? 'nonzero' : 'evenodd');
    // details
    const inkCol = o.ink || C.ink;
    if (name === 'share') {
      c.lineWidth = 9;
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(24, -26);
      c.lineTo(-24, 0);
      c.lineTo(24, 26);
      c.stroke();
      c.lineWidth = 9 + sw * 2;
      c.globalCompositeOperation = 'destination-over';
      c.strokeStyle = inkCol;
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    } else if (name === 'clock') {
      c.strokeStyle = inkCol;
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(0, -24);
      c.lineTo(0, 0);
      c.lineTo(16, 10);
      c.stroke();
      c.fillStyle = C.cream;
      c.beginPath();
      c.ellipse(0, -18, 26, 10, 0, Math.PI, TAU);
      c.globalAlpha = 0.35;
      c.fill();
    } else if (name === 'eye') {
      c.fillStyle = inkCol;
      c.beginPath();
      c.arc(0, 0, 14, 0, TAU);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(5, -5, 4.5, 0, TAU);
      c.fill();
    } else if (name === 'medal') {
      starPath(c, 0, 15, 15, 7, 5);
      c.fillStyle = C.cream;
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = inkCol;
      c.stroke();
    } else if (name === 'info') {
      c.fillStyle = inkCol;
      c.fillRect(-6, -6, 12, 30);
      c.beginPath();
      c.arc(0, -20, 7, 0, TAU);
      c.fill();
    } else if (name === 'cardBack') {
      c.beginPath();
      c.moveTo(0, -22);
      c.lineTo(16, 0);
      c.lineTo(0, 22);
      c.lineTo(-16, 0);
      c.closePath();
      c.fillStyle = C.sun;
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = inkCol;
      c.stroke();
    } else if (name === 'skin') {
      c.beginPath();
      c.arc(0, 0, 16, 0, TAU);
      c.fillStyle = C.cream;
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = inkCol;
      c.stroke();
      c.beginPath();
      c.arc(0, -1, 7, 0, TAU);
      c.fillStyle = inkCol;
      c.fill();
    } else if (name === 'lock') {
      c.beginPath();
      c.arc(0, 12, 7, 0, TAU);
      c.fillStyle = inkCol;
      c.fill();
      c.fillRect(-3, 12, 6, 14);
    } else if (name === 'trophy') {
      starPath(c, 0, -14, 12, 5, 5);
      c.fillStyle = C.cream;
      c.fill();
    }
    if (o.sheen !== false && ['shield', 'star', 'skin', 'clock', 'medal', 'trophy'].includes(name)) {
      c.globalAlpha = 0.3;
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(-12, -24, 12, 6, -0.5, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  // ---- buttons / chips / toggles / bars ----------------------------------------
  const VARIANT = {
    primary: { fill: C.sun, text: C.ink, stroked: false },
    secondary: { fill: C.plate, text: C.cream, stroked: true },
    ghost: { fill: C.deep, text: C.mute, stroked: false },
    share: { fill: C.sky, text: C.ink, stroked: false },
    danger: { fill: C.coral, text: C.cream, stroked: true },
    mint: { fill: C.mint, text: C.ink, stroked: false },
    pink: { fill: C.pink, text: C.ink, stroked: false },
  };
  function button(c, b, lab, o = {}) {
    const v = VARIANT[o.variant] || VARIANT.primary,
      size = o.size || (b.h >= 96 ? 'lg' : b.h >= 60 ? 'md' : 'sm'),
      dis = !!o.disabled,
      pressed = !!o.pressed && !dis,
      sh = pressed ? 4 : size === 'sm' ? 6 : 10,
      sink = pressed ? 6 : 0,
      r = o.r ?? (size === 'lg' ? 28 : size === 'md' ? 22 : Math.min(18, b.h / 2)),
      ghost = o.variant === 'ghost',
      fill = dis ? C.plateHi : o.color || v.fill,
      tcol = dis ? C.mute : o.textColor || v.text,
      y = b.y + sink;
    plate(c, b.x, y, b.w, b.h, {
      fill,
      r,
      sw: size === 'sm' ? 4 : 5,
      sh: ghost ? 0 : sh,
      sheen: !ghost,
      sheenA: dis ? 0.08 : 0.22,
      lip: ghost ? 0 : size === 'lg' ? 14 : size === 'md' ? 12 : 8,
      tilt: o.tilt,
      alpha: dis ? 0.85 : 1,
    });
    const fs = o.fontSize || (size === 'lg' ? Math.min(54, b.h * 0.44) : size === 'md' ? Math.min(30, b.h * 0.4) : Math.min(20, b.h * 0.42)),
      ic = o.icon ? fs * 1.15 : 0,
      gap = o.icon ? fs * 0.35 : 0,
      tw = lab ? measure(lab, fs) : 0,
      total = ic + gap + tw,
      cy = y + b.h / 2 - (o.sub ? fs * 0.32 : 0) - (ghost ? 0 : size === 'sm' ? 2 : 4),
      x0 = b.x + b.w / 2 - total / 2;
    c.save();
    if (o.tilt) {
      c.translate(b.x + b.w / 2, y + b.h / 2);
      c.rotate(o.tilt * DEG);
      c.translate(-(b.x + b.w / 2), -(y + b.h / 2));
    }
    if (o.icon)
      icon(c, o.icon, x0 + ic / 2, cy, ic, {
        color: o.iconColor || (v.stroked || dis ? C.cream : tcol),
        sw: Math.max(2.5, fs * 0.1),
      });
    if (lab) {
      if (v.stroked && !dis)
        sticker(c, lab, x0 + ic + gap, cy, fs, { fill: tcol, align: 'left', shadow: Math.round(fs * 0.06) });
      else text(c, lab, x0 + ic + gap, cy, fs, tcol, { align: 'left' });
    }
    if (o.sub)
      label(c, o.sub, b.x + b.w / 2, cy + fs * 0.78, {
        size: Math.max(10, Math.round(fs * 0.36)),
        align: 'center',
        color: v.stroked || dis ? C.mute : rgba(C.ink, 0.7),
      });
    c.restore();
    return b;
  }
  function roundButton(c, x, y, r, o = {}) {
    const pressed = !!o.pressed,
      sh = pressed ? 2 : Math.max(4, r * 0.14),
      dy = pressed ? sh - 2 + 3 : 0,
      col = o.color || C.sun;
    c.save();
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    disc(c, x, y + dy, r, col, { sw: Math.max(4, r * 0.09), sh, sheen: true });
    if (o.ring) {
      c.save();
      c.strokeStyle = typeof o.ring === 'string' ? o.ring : col;
      c.lineWidth = 4;
      c.setLineDash([6, 8]);
      c.lineCap = 'round';
      c.lineDashOffset = o.ringOffset || 0;
      c.globalAlpha *= 0.85;
      c.beginPath();
      c.arc(x, y + dy, r + 10, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (o.progress != null && o.progress < 1) {
      // recharge arc on the rim
      c.save();
      c.lineWidth = Math.max(5, r * 0.1);
      c.lineCap = 'round';
      c.strokeStyle = C.cream;
      c.beginPath();
      c.arc(x, y + dy, r - c.lineWidth, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(o.progress, 0, 1));
      c.stroke();
      c.restore();
    }
    const iy = y + dy - (o.label ? r * 0.18 : 0);
    if (o.icon) icon(c, o.icon, x, iy, r * (o.label ? 0.72 : 0.95), { color: o.iconColor, sw: Math.max(3, r * 0.075) });
    if (o.label) text(c, o.label, x, y + dy + r * 0.48, Math.max(11, r * 0.27), o.labelColor || C.ink, { align: 'center', ls: 1 });
    if (o.pips) {
      const [n, max] = o.pips,
        pw = 28 + max * 16 + (o.pipLabel ? measure(o.pipLabel, 13, 900, 0.5) + 6 : 0),
        py = y + dy + r + 12;
      rr(c, x - pw / 2, py - 13, pw, 26, 13);
      c.fillStyle = C.ink;
      c.fill();
      text(c, o.pipLabel || '', x - pw / 2 + 12, py, 13, C.cream, { ls: 0.5 });
      for (let i = 0; i < max; i++) {
        c.beginPath();
        c.arc(x + pw / 2 - 14 - (max - 1 - i) * 16, py, 6, 0, TAU);
        c.fillStyle = i < n ? C.sun : C.deep;
        c.fill();
        c.lineWidth = 2.5;
        c.strokeStyle = C.ink;
        c.stroke();
      }
    }
    c.restore();
  }
  function chip(c, x, y, s, o = {}) {
    const size = o.size || 14,
      h = o.h || Math.round(size * 2.3),
      padX = o.padX ?? h * 0.42,
      icS = o.icon ? h * 0.62 : 0,
      lab = o.label ? String(o.label).toUpperCase() : '',
      lw = lab ? measure(lab, size * 0.78, 900, 1.5) + 10 : 0,
      val = o.value != null ? String(o.value) : '',
      vs = o.valueSize || size * 1.45,
      vw = val ? measure(val, vs) : 0,
      sw = s ? measure(s, size, 900, o.ls || 0) : 0,
      w = Math.max(o.w || 0, Math.ceil(padX * 2 + icS + (icS ? 8 : 0) + lw + sw + (val ? vw + (sw ? 10 : 0) : 0)));
    if (o.align === 'center') x -= w / 2;
    else if (o.align === 'right') x -= w;
    const fill = o.color || C.plate,
      dark = o.textColor || ([C.sun, C.mint, C.sky, C.lime, C.pink, C.cream].includes(fill) ? C.ink : C.cream);
    plate(c, x, y, w, h, { fill, r: h / 2, sw: o.sw ?? 4, sh: o.sh ?? 5, sheenA: o.sheenA ?? 0.2, tilt: o.tilt, sheen: o.sheen });
    withTilt(c, x, y, w, h, o.tilt, () => {
      let px = x + padX;
      const cy = y + h / 2;
      if (o.icon) {
        icon(c, o.icon, px + icS / 2, cy, icS, { color: o.iconColor });
        px += icS + 8;
      }
      if (lab) {
        label(c, lab, px, cy + 1, { size: size * 0.78, color: o.labelColor || (dark === C.ink ? rgba(C.ink, 0.65) : C.mute) });
        px += lw;
      }
      if (s) text(c, s, px, cy + 1, size, dark, { ls: o.ls });
      if (val) {
        if (o.stickerValue === false) text(c, val, x + w - padX, cy + 1, vs, o.valueColor || dark, { align: 'right' });
        else sticker(c, val, x + w - padX, cy, vs, { fill: o.valueColor || C.sun, align: 'right', shadow: 2 });
      }
    });
    return { x, y, w, h };
  }
  function toggle(c, b, options = ['NORMAL', 'HARD'], idx = 0, o = {}) {
    const n = options.length,
      cols = o.colors || [C.mint, C.coral, C.sun, C.sky],
      pad2 = 7,
      segW = (b.w - pad2 * 2) / n,
      segs = [];
    plate(c, b.x, b.y, b.w, b.h, { fill: C.deep, r: o.r ?? 18, sw: 5, sh: 6, sheen: false });
    options.forEach((opt, i) => {
      const s = { x: b.x + pad2 + i * segW, y: b.y + pad2, w: segW, h: b.h - pad2 * 2, index: i };
      segs.push(s);
      const fs = o.size || Math.min(22, s.h * 0.46);
      if (i === idx) {
        plate(c, s.x + 1, s.y, s.w - 2, s.h - 3, { fill: cols[i % cols.length], r: Math.max(8, (o.r ?? 18) - 6), sw: 4, sh: 3, sheenA: 0.25 });
        text(c, opt, s.x + s.w / 2, s.y + s.h / 2 - 1, fs, C.ink, { align: 'center' });
      } else text(c, opt, s.x + s.w / 2, s.y + s.h / 2, fs, C.mute, { align: 'center' });
    });
    return segs;
  }
  function progress(c, x, y, w, h, f, o = {}) {
    f = clamp(f, 0, 1);
    rr(c, x, y, w, h, h / 2);
    c.fillStyle = o.track || C.ink;
    c.fill();
    const ins = Math.max(2, Math.round(h * 0.18)),
      iw = (w - ins * 2) * f;
    if (iw > 0.5) {
      rr(c, x + ins, y + ins, Math.max(iw, Math.min(h - ins * 2, iw * 4)), h - ins * 2, (h - ins * 2) / 2);
      c.save();
      c.clip();
      c.fillStyle = o.color || C.sun;
      c.fillRect(x + ins, y + ins, iw, h - ins * 2);
      if (o.sheen !== false) {
        c.fillStyle = 'rgba(255,255,255,.35)';
        c.fillRect(x + ins, y + ins, iw, Math.max(1.5, (h - ins * 2) * 0.36));
      }
      c.restore();
    }
    if (o.notches)
      for (const k of o.notches) {
        c.fillStyle = C.ink;
        c.fillRect(x + w * k - 2, y - 1, 4, h + 2);
      }
  }
  function segments(c, x, y, w, h, n, filled, o = {}) {
    const gap = o.gap ?? 6;
    plate(c, x, y, w, h, { fill: C.ink, r: h / 2, sw: 0, sh: 0, sheen: false });
    const sw = (w - 8 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const sx = x + 4 + i * (sw + gap),
        sy = y + 4,
        sh = h - 8,
        done = i < filled;
      rr(c, sx, sy, sw, sh, sh / 2);
      c.fillStyle = done ? o.color || C.mint : C.deep;
      c.fill();
      if (!done && i === filled && o.partial > 0) {
        c.save();
        rr(c, sx, sy, sw, sh, sh / 2);
        c.clip();
        c.fillStyle = C.sun;
        c.fillRect(sx, sy, sw * clamp(o.partial, 0, 1), sh);
        c.restore();
      }
      if (done) {
        c.fillStyle = 'rgba(255,255,255,.25)';
        rr(c, sx + 4, sy + 2, sw - 8, sh * 0.3, sh * 0.15);
        c.fill();
        if (o.check !== false) icon(c, 'check', sx + sw / 2, sy + sh / 2, Math.min(22, sh * 0.8), { color: C.ink, ink: false });
      }
      if (o.labels && o.labels[i] != null)
        text(c, o.labels[i], sx + sw / 2, y + h + 22, o.labelSize || 14, done ? C.cream : C.mute, { align: 'center', weight: 800 });
    }
  }
  function ribbon(c, cx, cy, w, s, o = {}) {
    const h = o.h || 64,
      col = o.color || C.pink,
      dark = o.dark || C.pinkD,
      k = clamp(o.k ?? 1, 0, 1),
      kk = ease.backOut(k, 1.2);
    if (k <= 0) return;
    c.save();
    c.translate(cx, cy);
    c.rotate((o.tilt ?? -4) * DEG);
    const half = (w / 2) * Math.max(0.05, kk),
      tail = h * 0.75;
    // tails (behind)
    if (k > 0.35)
      for (const d of [-1, 1]) {
        c.beginPath();
        const x0 = d * (half - 10);
        c.moveTo(x0, -h * 0.3);
        c.lineTo(x0 + d * tail, -h * 0.3 + 6);
        c.lineTo(x0 + d * tail * 0.7, h * 0.18 + 8);
        c.lineTo(x0 + d * tail, h * 0.62);
        c.lineTo(x0, h * 0.6);
        c.closePath();
        c.fillStyle = dark;
        c.fill();
        c.lineJoin = 'round';
        c.lineWidth = 5;
        c.strokeStyle = C.ink;
        c.stroke();
      }
    plate(c, -half, -h / 2, half * 2, h, { fill: col, r: 14, sw: 5, sh: 7, sheenA: 0.3 });
    if (k > 0.5) {
      c.save();
      rr(c, -half, -h / 2, half * 2, h, 14);
      c.clip();
      sticker(c, s, 0, 2, o.size || h * 0.62, { alpha: clamp((k - 0.5) * 3, 0, 1) });
      c.restore();
    }
    c.restore();
  }

  // ---- cards ----------------------------------------------------------------
  const RARITY = {
    common: { fill: C.plateHi, dark: C.plate, label: 'COMMON' },
    rare: { fill: C.sky, dark: C.skyD, label: 'RARE' },
    epic: { fill: C.grape, dark: C.grapeD, label: 'EPIC' },
    legendary: { fill: C.sun, dark: C.sunD, label: 'LEGENDARY' },
    glitch: { fill: C.pink, dark: C.pinkD, label: 'GLITCH' },
  };
  function cardFrame(c, x, y, w, h, rarity = 'common', o = {}) {
    const R = RARITY[rarity] || RARITY.common,
      r = o.r ?? 20,
      sink = o.pressed ? 5 : 0;
    y += sink;
    withTilt(c, x, y, w, h, o.tilt, () => {
      if (rarity === 'glitch') {
        // static channel-split outline (no animation)
        c.save();
        c.globalAlpha = 0.9;
        rr(c, x - 5, y - 2, w, h, r);
        c.fillStyle = C.sky;
        c.fill();
        rr(c, x + 5, y + 2, w, h, r);
        c.fillStyle = C.lime;
        c.fill();
        c.restore();
      }
      plate(c, x, y, w, h, { fill: R.fill, r, sw: 5, sh: o.pressed ? 3 : o.sh ?? 8, sheenA: 0.25 });
      const ins = Math.max(8, Math.round(w * 0.055));
      rr(c, x + ins, y + ins, w - ins * 2, h - ins * 2, r - 6);
      c.fillStyle = C.deep;
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = C.ink;
      c.stroke();
      if (rarity === 'legendary' || rarity === 'epic') {
        for (const [sx, sy] of [
          [x + ins + 2, y + ins + 2],
          [x + w - ins - 2, y + ins + 2],
          [x + ins + 2, y + h - ins - 2],
          [x + w - ins - 2, y + h - ins - 2],
        ])
          spark(c, sx, sy, rarity === 'legendary' ? 10 : 7, rarity === 'legendary' ? C.cream : C.pink);
      }
      if (rarity === 'glitch') {
        c.save();
        rr(c, x + ins, y + ins, w - ins * 2, h - ins * 2, r - 6);
        c.clip();
        const rnd = G.mulberry ? G.mulberry(Math.round(x * 7 + y)) : Math.random;
        for (let i = 0; i < 7; i++) {
          c.fillStyle = [C.lime, C.sky, C.pink][i % 3];
          c.globalAlpha = 0.35;
          c.fillRect(x + ins + rnd() * (w - ins * 2 - 30), y + ins + (i % 2 ? h * 0.12 : h * 0.86 - ins * 2) * rnd() + (i % 2 ? 0 : h * 0.1), 14 + rnd() * 30, 4);
        }
        c.restore();
      }
    });
    return { x, y, w, h, ins: Math.max(8, Math.round(w * 0.055)) };
  }
  function wrapLines(s, maxW, size, weight = 700) {
    const out = [];
    for (const para of String(s || '').split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const t = line + word;
        if (line && measure(t.trim(), size, weight) > maxW) {
          out.push(line.trim());
          line = word.trimStart();
          // very long words (Korean without spaces): hard split
          while (measure(line, size, weight) > maxW && line.length > 1) {
            let i = line.length - 1;
            while (i > 1 && measure(line.slice(0, i), size, weight) > maxW) i--;
            out.push(line.slice(0, i));
            line = line.slice(i);
          }
        } else line = t;
      }
      if (line.trim()) out.push(line.trim());
    }
    return out;
  }
  function cardFace(c, b, o = {}) {
    const rar = o.rarity || 'common',
      R = RARITY[rar] || RARITY.common,
      f = cardFrame(c, b.x, b.y, b.w, b.h, rar, { tilt: o.tilt, pressed: o.pressed });
    withTilt(c, b.x, b.y, b.w, b.h, o.tilt, () => {
      const cx = b.x + b.w / 2,
        y0 = f.y + f.ins,
        iw = b.w - f.ins * 2,
        icR = Math.min(iw * 0.26, b.h * 0.14);
      // rarity tag
      chip(c, cx, y0 + 10, o.tag || R.label, { color: R.fill, size: Math.max(10, b.w * 0.05), align: 'center', sh: 3, sw: 3, h: Math.max(20, b.w * 0.11) });
      // icon disc
      const iy = y0 + 22 + Math.max(20, b.w * 0.11) + icR;
      disc(c, cx, iy, icR, R.dark, { sw: 4, sh: 4 });
      if (o.icon) icon(c, o.icon, cx, iy, icR * 1.25, { color: o.iconColor || C.cream });
      // title + desc
      const ts = o.titleSize || Math.max(14, Math.min(24, b.w * 0.11)),
        ty = iy + icR + 14 + ts * 0.6;
      sticker(c, o.title || '', cx, ty, ts, { maxW: iw - 12, shadow: 2 });
      const ds = o.descSize || Math.max(11, Math.min(16, b.w * 0.068)),
        lines = wrapLines(o.desc || '', iw - 20, ds, 700);
      lines.slice(0, 4).forEach((ln, i) => text(c, ln, cx, ty + ts * 0.8 + 6 + i * ds * 1.35, ds, C.mute, { align: 'center', weight: 700 }));
      if (o.level != null) {
        const n = o.levelMax || 3,
          py = f.y + b.h - f.ins - 16;
        for (let i = 0; i < n; i++) {
          c.beginPath();
          c.arc(cx + (i - (n - 1) / 2) * 18, py, 6, 0, TAU);
          c.fillStyle = i < o.level ? R.fill : C.ink;
          c.fill();
          c.lineWidth = 2.5;
          c.strokeStyle = C.ink;
          c.stroke();
        }
      }
    });
  }
  function cardBack(c, b, o = {}) {
    const f = cardFrame(c, b.x, b.y, b.w, b.h, o.rarity || 'epic', { tilt: o.tilt, pressed: o.pressed });
    withTilt(c, b.x, b.y, b.w, b.h, o.tilt, () => {
      const x = b.x + f.ins,
        y = f.y + f.ins,
        w = b.w - f.ins * 2,
        h = b.h - f.ins * 2;
      c.save();
      rr(c, x, y, w, h, 14);
      c.clip();
      c.fillStyle = C.grapeD;
      c.fillRect(x, y, w, h);
      // diamond lattice
      c.strokeStyle = 'rgba(255,255,255,.09)';
      c.lineWidth = 6;
      c.beginPath();
      for (let d = -h; d < w + h; d += 26) {
        c.moveTo(x + d, y);
        c.lineTo(x + d + h, y + h);
        c.moveTo(x + d + h, y);
        c.lineTo(x + d, y + h);
      }
      c.stroke();
      c.restore();
      // centre emblem: BLIP eye
      const cx = b.x + b.w / 2,
        cy = f.y + b.h / 2,
        r = Math.min(w, h) * 0.26;
      disc(c, cx, cy, r, C.sun, { sw: 5, sh: 5 });
      disc(c, cx, cy, r * 0.58, C.cream, { sw: 4, sh: 0, sheen: false });
      c.beginPath();
      c.arc(cx, cy - r * 0.04, r * 0.27, 0, TAU);
      c.fillStyle = C.ink;
      c.fill();
      c.beginPath();
      c.arc(cx + r * 0.1, cy - r * 0.14, r * 0.09, 0, TAU);
      c.fillStyle = '#fff';
      c.fill();
    });
  }
  function flipCard(c, b, k, front, back) {
    k = clamp(k, 0, 1);
    const a = k * Math.PI,
      sx = Math.max(0.02, Math.abs(Math.cos(a))),
      lift = Math.sin(a) * 14,
      cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    c.save();
    c.translate(cx, cy - lift);
    c.scale(sx, 1 + Math.sin(a) * 0.04);
    c.translate(-cx, -cy);
    (k < 0.5 ? back : front)(c, b);
    c.restore();
  }

  // ---- grade / count-up / toast / popup ------------------------------------------
  const GRADE = {
    SS: [C.sun, C.pink],
    S: [C.sun, C.coral],
    A: [C.mint, C.sky],
    B: [C.sky, C.plate],
    C: [C.plateHi, C.deep],
    D: [C.deep, C.night],
  };
  function gradeBadge(c, x, y, g, o = {}) {
    const [fill, discCol] = GRADE[g] || GRADE.D,
      k = clamp(o.k ?? 1, 0, 1),
      kk = ease.backOut(Math.min(1, k), 1.6),
      sc = (o.size ?? 1) * lerp(2.2, 1, kk),
      rot = lerp(-20, o.tilt ?? -8, kk),
      R = 150;
    if (k <= 0) return;
    c.save();
    c.globalAlpha *= clamp(k * 4, 0, 1);
    c.translate(x, y);
    c.rotate(rot * DEG);
    c.scale(sc, sc);
    starPath(c, 0, 9, R, R * 0.84, 16);
    c.fillStyle = C.ink;
    c.fill();
    starPath(c, 0, 0, R, R * 0.84, 16);
    c.fillStyle = fill;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = 8;
    c.strokeStyle = C.ink;
    c.stroke();
    c.beginPath();
    c.arc(0, 0, R * 0.74, 0, TAU);
    c.fillStyle = discCol;
    c.fill();
    c.lineWidth = 7;
    c.stroke();
    if (o.ring !== false) {
      c.save();
      c.setLineDash([2, 12]);
      c.lineCap = 'round';
      c.lineWidth = 5;
      c.strokeStyle = C.cream;
      c.globalAlpha *= 0.85;
      c.beginPath();
      c.arc(0, 0, R * 0.64, 0, TAU);
      c.stroke();
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.beginPath();
    c.ellipse(-R * 0.18, -R * 0.42, R * 0.38, R * 0.13, -0.35, 0, TAU);
    c.fill();
    const ls = g.length > 1 ? 136 : 196;
    sticker(c, g, g.length > 1 ? -4 : 0, 10, ls, { stroke: 16, shadow: 10, ls: g.length > 1 ? -10 : 0 });
    c.restore();
  }
  function countUp(target, t, o = {}) {
    const dur = o.dur ?? 0.6,
      from = o.from ?? 0,
      k = clamp((t - (o.delay || 0)) / dur, 0, 1),
      value = Math.round(from + (target - from) * ease.cubicOut(k));
    let sx = 1,
      sy = 1;
    if (!reduced()) {
      if (k > 0 && k < 1) {
        const step = (k * 10) % 1;
        sx = sy = 1 + 0.12 * Math.max(0, 1 - step * 3);
      } else if (k >= 1) {
        const u = clamp((t - (o.delay || 0) - dur) / 0.18, 0, 1);
        if (u < 1) {
          sx = lerp(1.15, 1, ease.backOut(u));
          sy = lerp(0.9, 1, ease.backOut(u));
        }
      }
    }
    return { value, sx, sy, done: k >= 1 };
  }
  function toast(c, s, val, o = {}) {
    const t = o.t ?? 0.5,
      life = o.life ?? 1.64,
      inT = 0.22,
      outT = 0.22;
    if (t < 0 || t > life) return;
    let dx = 0;
    if (t < inT) dx = (1 - ease.backOut(t / inT)) * -260;
    else if (t > life - outT) dx = ease.cubicOut((t - (life - outT)) / outT) * -320;
    const fs = o.size || 17,
      vs = fs * 1.2,
      w = o.w || Math.ceil(measure(s, fs, 900, 1) + (val != null ? measure(val, vs) + 30 : 0) + 44),
      h = o.h || 40,
      x = (o.x ?? 24) + dx,
      y = o.y ?? 92;
    c.save();
    c.globalAlpha *= clamp(1 - Math.abs(dx) / 320, 0, 1);
    plate(c, x, y, w, h, { fill: o.color || C.mint, r: h / 2, sw: 4, sh: 5, sheenA: 0.3, tilt: o.tilt ?? -3 });
    withTilt(c, x, y, w, h, o.tilt ?? -3, () => {
      text(c, s, x + 22, y + h / 2 + 1, fs, C.ink, { ls: 1 });
      if (val != null) sticker(c, val, x + w - 14, y + h / 2, vs, { align: 'right', shadow: 2 });
    });
    c.restore();
  }
  function popup(c, s, x, y, k, o = {}) {
    k = clamp(k, 0, 1);
    const life = o.life || 0.7,
      tt = k * life,
      a = tt > life - 0.2 ? (life - tt) / 0.2 : 1,
      sc = ease.pop(Math.min(1, tt / 0.26));
    sticker(c, s, x, y - 36 * ease.cubicOut(k), o.size || 30, {
      fill: o.color || C.sun,
      rot: o.rot ?? -6,
      alpha: a,
      sx: sc,
      sy: sc,
    });
  }

  // ---- characters -----------------------------------------------------------
  function shipPaths(c, flame, o) {
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // thruster: height animates, never alpha
    c.beginPath();
    c.moveTo(-8, 20);
    c.quadraticCurveTo(0, flame, 8, 20);
    c.closePath();
    c.fillStyle = C.sun;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = C.ink;
    c.stroke();
    c.beginPath();
    c.moveTo(-4, 21);
    c.quadraticCurveTo(0, flame - 10, 4, 21);
    c.closePath();
    c.fillStyle = C.cream;
    c.fill();
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(d * 15, 2);
      c.quadraticCurveTo(d * 30, 10, d * 27, 24);
      c.quadraticCurveTo(d * 18, 22, d * 10, 16);
      c.closePath();
      c.fillStyle = o.fin || C.skyD;
      c.fill();
      c.lineWidth = 3.5;
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, -26);
    c.bezierCurveTo(12, -26, 19, -6, 19, 8);
    c.bezierCurveTo(19, 19, 11, 24, 0, 24);
    c.bezierCurveTo(-11, 24, -19, 19, -19, 8);
    c.bezierCurveTo(-19, -6, -12, -26, 0, -26);
    c.closePath();
    c.fillStyle = o.body || C.sky;
    c.fill();
    c.lineWidth = 4;
    c.stroke();
    c.beginPath();
    c.moveTo(-11, -12);
    c.bezierCurveTo(-8, -20, -4, -22, 0, -22);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.stroke();
    c.beginPath();
    c.moveTo(-12, 14);
    c.quadraticCurveTo(0, 20, 12, 14);
    c.strokeStyle = o.fin || C.skyD;
    c.stroke();
  }
  function ship(c, x, y, o = {}) {
    const sc = o.scale ?? 1,
      flame = o.flame ?? 38,
      es = o.eyeScale ?? 1,
      lx = o.look ? clamp(o.look.x, -1, 1) * 1.6 : 0,
      ly = o.look ? clamp(o.look.y, -1, 1) * 1.6 : 0;
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot * DEG);
    c.scale(sc, sc);
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    if (o.shadow) {
      c.fillStyle = rgba(C.ink, 0.35);
      c.beginPath();
      c.ellipse(0, 40, 22, 5, 0, 0, TAU);
      c.fill();
    }
    shipPaths(c, flame, o);
    // the eye is the hitbox
    c.save();
    c.scale(es, es);
    c.beginPath();
    c.arc(0, 0, 9.5, 0, TAU);
    c.fillStyle = C.cream;
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = C.ink;
    c.stroke();
    c.beginPath();
    c.arc(lx, -1 + ly, 4.2, 0, TAU);
    c.fillStyle = C.ink;
    c.fill();
    c.beginPath();
    c.arc(1.6 + lx, -2.6 + ly, 1.4, 0, TAU);
    c.fillStyle = '#fff';
    c.fill();
    c.restore();
    c.restore();
  }
  function bossChip(c, i, col) {
    rr(c, -12, -14, 24, 28, 9);
    c.fillStyle = col;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = C.ink;
    c.stroke();
    rr(c, -6, -8, 12, 7, 3);
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fill();
  }
  // JAMMER: grape shell, cream face, coral iris whose pupil tracks `look`, orbiting armour chips
  function boss(c, x, y, o = {}) {
    const sc = o.scale ?? 1,
      t = o.t || 0,
      chips = o.chips ?? 8,
      spin = (o.spin ?? (reduced() ? 0 : 40)) * t,
      sq = o.squash || 0, // 0..1
      lk = o.look || { x: 0, y: 0 },
      ll = Math.hypot(lk.x, lk.y) || 1,
      px = (lk.x / ll) * Math.min(1, ll) * 7,
      py = (lk.y / ll) * Math.min(1, ll) * 7;
    c.save();
    c.translate(x, y);
    c.scale(sc * (1 + 0.08 * sq), sc * (1 - 0.06 * sq));
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.fillStyle = rgba(C.ink, 0.35);
    c.beginPath();
    c.ellipse(0, 84, 64, 10, 0, 0, TAU);
    c.fill();
    // chips (rotate 40°/s)
    for (let i = 0; i < Math.min(8, chips); i++) {
      c.save();
      c.rotate((i * 45 + 22 + spin) * DEG);
      c.translate(0, -84 - (o.wobble ? Math.sin(i * 1.7 + t * 30) * o.wobble * 4 : 0));
      bossChip(c, i, i % 2 ? C.sun : C.coral);
      c.restore();
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // antenna
    c.beginPath();
    c.moveTo(0, -58);
    c.lineTo(0, -86);
    c.lineWidth = 7;
    c.strokeStyle = C.ink;
    c.stroke();
    // shell
    c.beginPath();
    c.arc(0, 6, 62, 0, TAU);
    c.fillStyle = C.ink;
    c.fill();
    c.beginPath();
    c.arc(0, 0, 62, 0, TAU);
    c.fillStyle = o.shell || C.grape;
    c.fill();
    c.save();
    c.clip();
    c.beginPath();
    c.moveTo(-70, 10);
    c.quadraticCurveTo(0, 40, 70, 10);
    c.lineTo(70, 80);
    c.lineTo(-70, 80);
    c.closePath();
    c.fillStyle = rgba(C.grapeD, 0.8);
    c.fill();
    c.restore();
    c.lineWidth = 5;
    c.strokeStyle = C.ink;
    c.beginPath();
    c.arc(0, 0, 62, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 56, Math.atan2(-34, -44), Math.atan2(-56, 20));
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.stroke();
    // face
    c.beginPath();
    c.arc(0, 2, 38, 0, TAU);
    c.fillStyle = C.cream;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = C.ink;
    c.stroke();
    if (o.broken) {
      c.lineWidth = 8;
      c.beginPath();
      for (const d of [-1, 1]) {
        c.moveTo(-14, 2 + d * 14);
        c.lineTo(14, 2 - d * 14);
      }
      c.stroke();
    } else {
      c.beginPath();
      c.arc(px * 0.5, 6 + py * 0.5, 22, 0, TAU);
      c.fillStyle = C.coral;
      c.fill();
      c.lineWidth = 4;
      c.stroke();
      c.beginPath();
      c.arc(px, 8 + py, 11, 0, TAU);
      c.fillStyle = C.ink;
      c.fill();
      c.beginPath();
      c.arc(px + 5, 3 + py, 4, 0, TAU);
      c.fillStyle = '#fff';
      c.fill();
      if (o.sleepy) {
        // heavy lid: dormant core before the boss wakes
        c.save();
        c.beginPath();
        c.arc(0, 2, 36, 0, TAU);
        c.clip();
        c.fillStyle = C.grape;
        c.fillRect(-40, -40, 80, 40 + o.sleepy * 6);
        c.beginPath();
        c.moveTo(-40, o.sleepy * 6);
        c.lineTo(40, o.sleepy * 6);
        c.lineWidth = 6;
        c.strokeStyle = C.ink;
        c.stroke();
        c.restore();
      }
    }
    // brows
    c.beginPath();
    if (o.sleepy) {
      c.moveTo(-30, -20);
      c.lineTo(-8, -20);
      c.moveTo(30, -20);
      c.lineTo(8, -20);
    } else {
      c.moveTo(-30, -22);
      c.lineTo(-6, -12);
      c.moveTo(30, -22);
      c.lineTo(6, -12);
    }
    c.lineWidth = 7;
    c.strokeStyle = C.ink;
    c.stroke();
    c.beginPath();
    c.arc(0, -90, 10, 0, TAU);
    c.fillStyle = C.coral;
    c.fill();
    c.lineWidth = 4;
    c.stroke();
    c.restore();
  }

  // ---- backgrounds ------------------------------------------------------------
  function stripes(c, x0, y0, w, h, alpha = 0.025) {
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, h);
    c.clip();
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.beginPath();
    // -24° bands, 60 on / 60 off
    const a = -24 * DEG,
      ca = Math.cos(a),
      sa = Math.sin(a),
      L = w + h + 400;
    for (let d = -L; d < L; d += 120) {
      const cx = x0 + w / 2 + d * -sa,
        cy = y0 + h / 2 + d * ca;
      c.moveTo(cx - ca * L, cy - sa * L);
      c.lineTo(cx + ca * L, cy + sa * L);
      c.lineTo(cx + ca * L - sa * 60, cy + sa * L + ca * 60);
      c.lineTo(cx - ca * L - sa * 60, cy - sa * L + ca * 60);
      c.closePath();
    }
    c.fill();
    c.restore();
  }
  function dots(c, x0, y0, w, h, alpha = 0.07) {
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.beginPath();
    const sx = Math.floor((x0 - 14) / 28) * 28 + 14;
    for (let y = 14; y < y0 + h; y += 28) for (let x = sx; x < x0 + w; x += 28) c.rect(x - 1.5, y - 1.5, 3, 3);
    c.fill();
  }
  function rays(c, cx, cy, n = 24, len = 1400, alpha = 0.032, rot = 0) {
    c.save();
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.beginPath();
    const hw = Math.PI / n / 2;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n + rot;
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a - hw) * len, cy + Math.sin(a - hw) * len);
      c.lineTo(cx + Math.cos(a + hw) * len, cy + Math.sin(a + hw) * len);
      c.closePath();
    }
    c.fill();
    c.restore();
  }
  function uiBg(c, o = {}) {
    const sp = span(),
      x0 = o.x0 ?? sp.x0,
      w = o.w ?? sp.w,
      kind = o.kind || 'title';
    let g;
    if (kind === 'results') {
      g = c.createLinearGradient(0, 0, 0, G.H);
      g.addColorStop(0, '#3A2A86');
      g.addColorStop(1, '#2A1D5E');
    } else if (kind === 'arena') {
      g = C.arena;
    } else {
      g = c.createLinearGradient(x0, 0, x0 + w, G.H);
      g.addColorStop(0, '#3A2A86');
      g.addColorStop(0.55, '#2C2068');
      g.addColorStop(1, '#3B1E62');
    }
    c.fillStyle = g;
    c.fillRect(x0, 0, w, G.H);
    if (o.rays !== false) {
      const r = o.rays || (kind === 'results' ? { x: 250, y: 330 } : { x: 990, y: 430 });
      c.save();
      c.beginPath();
      c.rect(x0, 0, w, G.H);
      c.clip();
      rays(c, r.x, r.y, 24, 1500, kind === 'results' ? 0.035 : 0.03, o.rayRot || 0);
      c.restore();
    }
    stripes(c, x0, 0, w, G.H);
    dots(c, x0, 0, w, G.H);
  }

  // ---- bullets --------------------------------------------------------------
  const KIND_SHAPE = {
    ring: 'orb',
    spiral: 'orb',
    petal: 'orb',
    orbit: 'orb',
    cross: 'orb',
    boss: 'orb',
    orb: 'orb',
    fan: 'diamond',
    converge: 'diamond',
    rain: 'needle',
    laser: 'needle',
    wall: 'block',
  };
  const SHAPE_COLOR = { orb: C.coral, diamond: C.sun, needle: C.pink, block: C.lime };
  const KIND_COLOR = {};
  for (const k in KIND_SHAPE) KIND_COLOR[k] = SHAPE_COLOR[KIND_SHAPE[k]];
  const shapeOf = (b) => (SHAPE_COLOR[b.shape] ? b.shape : KIND_SHAPE[b.kind] || 'orb');
  const enemyColor = (b) => SHAPE_COLOR[shapeOf(b || {})] || C.coral;

  // batched draw of one shape class: ink outline pass → body pass → cream core pass
  function drawBatch(c, list, shape) {
    if (!list.length) return;
    const col = SHAPE_COLOR[shape];
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (shape === 'needle') {
      // capsule = fat round-capped segment
      const seg = (w, k = 0) => {
        c.beginPath();
        for (const b of list) {
          const r = b.r || 8,
            a = Math.atan2(b.vy || 0, b.vx || 1),
            L = r * 3.4,
            W = r * 1.25,
            hl = Math.max(0.5, L / 2 - W / 2 - k),
            ca = Math.cos(a) * hl,
            sa = Math.sin(a) * hl;
          c.moveTo(b.x - ca, b.y - sa);
          c.lineTo(b.x + ca, b.y + sa);
        }
      };
      const W0 = (list[0].r || 8) * 1.25;
      seg(W0);
      c.lineWidth = W0 + 6;
      c.strokeStyle = C.ink;
      c.stroke();
      c.lineWidth = W0;
      c.strokeStyle = col;
      c.stroke();
      seg(0, 3.4);
      c.lineWidth = 3.2;
      c.strokeStyle = C.cream;
      c.stroke();
      return;
    }
    const body = (core) => {
      c.beginPath();
      for (const b of list) {
        const r = (b.r || 8) * 0.95,
          x = b.x,
          y = b.y;
        if (shape === 'orb') {
          const rr2 = core ? r * 0.52 : r;
          c.moveTo(x + rr2, y);
          c.arc(x, y, rr2, 0, TAU);
        } else if (shape === 'diamond') {
          const a = Math.atan2(b.vy || 0, b.vx || 1),
            ca = Math.cos(a),
            sa = Math.sin(a),
            R = r * 1.05,
            f = core ? 0.7 : 1.45,
            s = core ? 0.42 : 1,
            tl = core ? 0.45 : 1.1;
          c.moveTo(x + ca * R * f, y + sa * R * f);
          c.lineTo(x - sa * R * s, y + ca * R * s);
          c.lineTo(x - ca * R * tl, y - sa * R * tl);
          c.lineTo(x + sa * R * s, y - ca * R * s);
          c.closePath();
        } else {
          // block: rounded square, axis-aligned
          const s = (b.r || 8) * 2.75,
            h = core ? s / 2 - 6 : s / 2;
          if (h > 0) rrPath(c, x - h, y - h, h * 2, h * 2, core ? 2 : 5);
        }
      }
    };
    body(false);
    c.lineWidth = shape === 'orb' && list[0].r >= 15 ? 8 : 6;
    c.strokeStyle = C.ink;
    c.stroke();
    c.fillStyle = col;
    c.fill();
    body(true);
    c.fillStyle = C.cream;
    c.fill();
    if (shape === 'orb') {
      c.beginPath();
      for (const b of list)
        if ((b.r || 8) >= 13) {
          const r = b.r * 0.95;
          c.moveTo(b.x - r * 0.42 + r * 0.16, b.y - r * 0.42);
          c.arc(b.x - r * 0.42, b.y - r * 0.42, r * 0.16, 0, TAU);
        }
      c.fillStyle = 'rgba(255,255,255,.75)';
      c.fill();
    }
  }
  function bullet(c, b, opt = {}) {
    const shape = opt.kind ? KIND_SHAPE[opt.kind] || 'orb' : shapeOf(b);
    c.save();
    drawBatch(c, [b], shape);
    c.restore();
  }
  function bulletIcon(c, x, y, kind = 'fan', r = 9, angle = 0) {
    const shape = KIND_SHAPE[kind] || 'orb';
    c.save();
    drawBatch(c, [{ x, y, vx: Math.cos(angle), vy: Math.sin(angle), r, shape, kind }], shape);
    c.restore();
  }
  function demoBullets(c, t, cx = 640, cy = 270, rad = 190) {
    const tt = reduced() ? 0 : t,
      kinds = ['ring', 'fan', 'rain', 'wall', 'spiral', 'converge', 'laser', 'petal'],
      n = 22;
    for (let i = 0; i < n; i++) {
      const k = kinds[i % kinds.length],
        a = tt * 0.06 + (i * TAU) / n,
        r = rad + ((i * 37) % 3) * 22;
      bulletIcon(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62, k, i % 7 === 0 ? 15 : 8, a + Math.PI / 2);
    }
  }
  function lock(c, x, y, s = 16, color = C.mute) {
    icon(c, 'lock', x, y, s * 1.6, { color: color && color.startsWith('#') ? color : C.mute });
  }
  // one-shot dotted ring burst (k 0..1). No flash; plays once.
  function gradeRing(c, x, y, k, color = C.sun) {
    k = clamp(k, 0, 1);
    if (k >= 1 || k <= 0) return;
    const e = ease.cubicOut(k),
      r = 60 + 170 * e;
    c.save();
    c.globalAlpha = 0.8 * (1 - k);
    c.setLineDash([3, 14]);
    c.lineCap = 'round';
    c.lineWidth = 6;
    c.strokeStyle = C.cream;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1 - k;
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3;
      spark(c, x + Math.cos(a) * (r + 18), y + Math.sin(a) * (r + 18), 9 * (1 - k * 0.5), i % 2 ? C.cream : palColor(color));
    }
    c.restore();
  }
  // legacy neon colours (screens, particles) → palette
  const PAL = {
    '#4deeea': C.sky,
    '#3cffc8': C.mint,
    '#ffd166': C.sun,
    '#ff3b6b': C.coral,
    '#ff4d6d': C.coral,
    '#ff5c8a': C.pink,
    '#ff8a3d': C.sun,
    '#ff4fd8': C.pink,
    '#b45cff': C.grape,
    '#a66cff': C.grape,
    '#4b8cff': C.sky,
    '#eef7ff': C.cream,
    '#ffffff': C.cream,
    '#fff': C.cream,
  };
  const palColor = (col) => PAL[String(col || '').toLowerCase()] || col || C.cream;

  // ---- fx state (derived from engine state) ------------------------------------
  const S = { eng: null, last: 0 };
  function resetFx(e) {
    S.eng = e;
    S.fx = [];
    S.ghosts = [];
    S.grazeT = new WeakMap();
    S.shake = 0;
    S.hits = e ? e.hits || 0 : 0;
    S.dashT = e ? e.player.dashT : 0;
    S.od = e ? e.overdrive > 0 : false;
    S.ghostClock = 0;
    S.ghostLeft = 0;
    S.bossHp = null;
    S.grazeRing = 0;
    S.grazeTextT = -9;
    S.grazeText = null;
    S.mult = 1;
    S.multPunch = 0;
    S.shields = e ? e.player.shields : 3;
    S.lostShields = [];
    S.chips = 8;
    S.chipTarget = 8;
    S.chipClock = 0;
    S.squash = 0;
    S.bossHpRaw = null;
    S.lastScore = e ? e.score : 0;
    S.laneSeen = new WeakMap();
  }
  resetFx(null);
  function fxEvent(ev) {
    if (!ev || !S.eng) return;
    const p = S.eng.player;
    if (ev.type === 'hit') {
      S.fx.push({ k: 'ring', x: ev.x ?? p.x, y: ev.y ?? p.y, r0: 16, r1: 90, t: 0, life: 0.35, col: C.coral });
      for (let i = 0; i < 6; i++)
        S.fx.push({ k: 'spark', x: ev.x ?? p.x, y: ev.y ?? p.y, a: (i * TAU) / 6 + 0.4, d: 46, t: 0, life: 0.35, col: i % 2 ? C.cream : C.coral, R: 9 });
      if (!reduced()) S.shake = 0.18;
    } else if (ev.type === 'dash') {
      S.ghostClock = 0;
      S.ghostLeft = 4;
    } else if (ev.type === 'overdrive') {
      S.fx.push({ k: 'ring', x: p.x, y: p.y, r0: 18, r1: 110, t: 0, life: 0.5, col: C.sun, follow: true });
    }
  }
  const mult = (n) => (n >= 100 ? 5 : n >= 50 ? 4 : n >= 25 ? 3 : n >= 10 ? 2 : 1);
  const TIERS = [0, 10, 25, 50, 100];
  function detect(e, dt) {
    const p = e.player;
    if ((e.hits || 0) > S.hits) fxEvent({ type: 'hit', x: p.x, y: p.y });
    S.hits = e.hits || 0;
    if (p.dashT > S.dashT + 0.05) fxEvent({ type: 'dash', x: p.x, y: p.y });
    S.dashT = p.dashT;
    const od = e.overdrive > 0;
    if (od && !S.od) fxEvent({ type: 'overdrive' });
    S.od = od;
    if (p.dashT > 0 && S.ghostLeft > 0) {
      S.ghostClock -= dt;
      if (S.ghostClock <= 0) {
        S.ghosts.push({ x: p.x, y: p.y, t: 0, life: 0.26 });
        S.ghostLeft--;
        S.ghostClock = 0.04;
      }
    }
    for (const list of [S.fx, S.ghosts, S.lostShields])
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
    S.shake = Math.max(0, S.shake - dt);
    S.grazeRing = Math.max(0, S.grazeRing - dt);
    S.multPunch = Math.max(0, S.multPunch - dt);
    S.squash = Math.max(0, S.squash - dt);
    // FLOW tier-up punch
    const m = mult(e.combo || 0) * (od ? 3 : 1);
    if (m > S.mult) S.multPunch = 0.24;
    S.mult = m;
    // shield lost → icon pops off with a spin
    if (p.shields < S.shields) for (let i = p.shields; i < S.shields; i++) S.lostShields.push({ i, t: 0, life: 0.6 });
    S.shields = p.shields;
    // boss damage squash + chip pop-off on phase change
    const B = e.boss;
    if (B && B.active) {
      if (S.bossHpRaw != null && B.hp < S.bossHpRaw) S.squash = 0.12;
      S.bossHpRaw = B.hp;
      const nSpells = (e.timeline && e.timeline.spells && e.timeline.spells.length) || 4;
      S.chipTarget = B.final ? 2 : Math.max(2, 8 - Math.round(((B.phase < 0 ? 0 : B.phase) * 6) / Math.max(1, nSpells - 1)));
    } else if (B && B.broken) S.chipTarget = 0;
    if (S.chips > S.chipTarget) {
      S.chipClock -= dt;
      if (S.chipClock <= 0) {
        S.chips--;
        S.chipClock = 0.15;
        const a = (S.chips * 45 + 22) * DEG;
        S.fx.push({ k: 'chip', x: e.cx, y: e.cy, a, t: 0, life: 0.7, col: S.chips % 2 ? C.sun : C.coral });
      }
    } else if (S.chips < S.chipTarget && !(B && B.active)) S.chips = S.chipTarget;
  }
  function drawFx(c, e) {
    const p = e.player;
    c.save();
    c.lineJoin = 'round';
    for (const f of S.fx) {
      const k = f.t / f.life;
      if (f.k === 'ring') {
        const x = f.follow ? p.x : f.x,
          y = f.follow ? p.y : f.y;
        c.globalAlpha = 1 - k;
        c.lineWidth = 9 * (1 - k) + 3;
        c.strokeStyle = C.ink;
        c.beginPath();
        c.arc(x, y, lerp(f.r0, f.r1, ease.cubicOut(k)), 0, TAU);
        c.stroke();
        c.lineWidth = 5 * (1 - k) + 1;
        c.strokeStyle = f.col;
        c.stroke();
      } else if (f.k === 'spark') {
        const d = (f.d || 26) * ease.cubicOut(k);
        c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        spark(c, f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d, (f.R || 7) * (1 - k * 0.4), f.col);
      } else if (f.k === 'chip') {
        const d = 84 * 0.82 + 160 * ease.cubicOut(k);
        c.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        c.save();
        c.translate(f.x + Math.sin(f.a) * d, f.y - Math.cos(f.a) * d + 220 * k * k);
        c.rotate(f.a + k * 9);
        c.scale(0.82, 0.82);
        bossChip(c, 0, f.col);
        c.restore();
      } else if (f.k === 'text') {
        sticker(c, f.s, f.x, f.y - 20 * ease.cubicOut(k), f.size || 17, {
          fill: f.col || C.sun,
          rot: -8,
          alpha: k > 0.6 ? (1 - k) / 0.4 : 1,
          stroke: 4,
          shadow: 2,
        });
      }
    }
    for (const g of S.ghosts) {
      c.globalAlpha = 0.3 * (1 - g.t / g.life);
      c.save();
      c.translate(g.x, g.y);
      c.beginPath();
      c.ellipse(0, 0, 19, 25, 0, 0, TAU);
      c.fillStyle = C.sky;
      c.fill();
      c.restore();
    }
    c.restore();
  }

  // ---- world pieces ----------------------------------------------------------
  function arena(c, e) {
    const sp = span(),
      tint = { echo: C.arena, fracture: '#35266F', zero: '#38256A' }[e.mission && e.mission.id] || C.arena;
    // gutters
    if (sp.x0 < 0) {
      c.fillStyle = C.night;
      c.fillRect(sp.x0, 0, -sp.x0, G.H);
      c.fillRect(G.W, 0, sp.x1 - G.W, G.H);
      dots(c, sp.x0, 0, -sp.x0, G.H, 0.05);
      dots(c, G.W, 0, sp.x1 - G.W, G.H, 0.05);
    }
    c.fillStyle = tint;
    c.fillRect(0, 0, G.W, G.H);
    stripes(c, 0, 0, G.W, G.H);
    dots(c, 0, 0, G.W, G.H);
    // soft halo rings around the core (static)
    c.fillStyle = 'rgba(255,255,255,.025)';
    c.beginPath();
    c.arc(e.cx, e.cy, 230, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.02)';
    c.beginPath();
    c.arc(e.cx, e.cy, 380, 0, TAU);
    c.fill();
    // play-area: darker margin outside the movable rect + rounded keyline
    c.save();
    c.fillStyle = rgba(C.ink, 0.16);
    c.beginPath();
    c.rect(0, 0, G.W, G.H);
    rrPath(c, e.left - 14, e.top - 14, e.right - e.left + 28, e.bottom - e.top + 28, 26);
    c.fill('evenodd');
    c.beginPath();
    rrPath(c, e.left - 14, e.top - 14, e.right - e.left + 28, e.bottom - e.top + 28, 26);
    c.lineWidth = 3;
    c.strokeStyle = e.overdrive > 0 ? rgba(C.sun, 0.45) : 'rgba(255,255,255,.08)';
    c.stroke();
    c.restore();
  }
  function arenaEdge(c) {
    if (!(G.AX > 0)) return;
    c.save();
    c.strokeStyle = C.ink;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(-1, 0);
    c.lineTo(-1, G.H);
    c.moveTo(G.W + 1, 0);
    c.lineTo(G.W + 1, G.H);
    c.stroke();
    c.restore();
  }
  function core(c, e) {
    const B = e.boss || {},
      bossTime = e.timeline && e.time >= e.timeline.bossStart,
      p = e.player,
      awake = B.active || bossTime,
      t = e.time,
      wake = awake ? 1 : 0;
    const look = { x: (p.x - e.cx) / 300, y: (p.y - e.cy) / 300 };
    if (B.broken && !B.active) {
      boss(c, e.cx, e.cy, { scale: 0.62, t, chips: 0, broken: true, look, spin: 0 });
      return;
    }
    boss(c, e.cx, e.cy, {
      scale: awake ? 0.82 : 0.6,
      t,
      chips: awake ? S.chips : 4,
      spin: reduced() ? 0 : awake ? 40 : 14,
      look,
      squash: S.squash > 0 ? S.squash / 0.12 : 0,
      wobble: S.squash > 0 ? S.squash / 0.12 : 0,
      sleepy: wake ? 0 : 1,
    });
  }
  // telegraph rings at the core: dashed ring contracting, warm colour of the kind, alpha ramps (no blink)
  function telegraphs(c, e) {
    for (const q of e.telegraphs || []) {
      const life = q.life || 0.65,
        k = clamp(1 - q.t / life, 0, 1),
        col = KIND_COLOR[q.kind || q.type] || C.coral;
      c.save();
      c.globalAlpha = 0.35 + 0.5 * k;
      c.lineCap = 'round';
      c.setLineDash([10, 10]);
      const r = lerp(120, 70, ease.cubicOut(k));
      c.lineWidth = 9;
      c.strokeStyle = C.ink;
      c.beginPath();
      c.arc(e.cx, e.cy, r, 0, TAU);
      c.stroke();
      c.lineWidth = 4;
      c.strokeStyle = col;
      c.stroke();
      c.restore();
    }
  }
  function chevron(c, x, y, a, s, col) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.beginPath();
    c.moveTo(-s * 0.4, -s);
    c.lineTo(s * 0.6, 0);
    c.lineTo(-s * 0.4, s);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 8;
    c.strokeStyle = C.ink;
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = col;
    c.stroke();
    c.restore();
  }
  // hatched static lane, fades in over 200 ms, never blinks
  function lane(c, x, y, ang, len, w, alpha) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.globalAlpha = alpha;
    rr(c, 0, -w / 2, len, w, w / 2);
    c.save();
    c.clip();
    c.fillStyle = rgba(C.pink, 0.18);
    c.fillRect(0, -w / 2, len, w);
    c.fillStyle = rgba(C.pink, 0.45);
    c.beginPath();
    for (let d = -w; d < len + w; d += 12) {
      c.moveTo(d, -w / 2);
      c.lineTo(d + 5, -w / 2);
      c.lineTo(d + 5 + w, w / 2);
      c.lineTo(d + w, w / 2);
      c.closePath();
    }
    c.fill();
    c.restore();
    rr(c, 0, -w / 2, len, w, w / 2);
    c.setLineDash([10, 8]);
    c.lineWidth = 2.5;
    c.strokeStyle = C.pink;
    c.stroke();
    c.setLineDash([]);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 4;
    c.beginPath();
    for (let d = 60; d < len - 30; d += 70) {
      c.moveTo(d - 8, -8);
      c.lineTo(d, 0);
      c.lineTo(d - 8, 8);
    }
    c.stroke();
    c.restore();
  }
  function warnings(c, e) {
    const W = e.warnings;
    if (!Array.isArray(W) || !W.length) return;
    c.save();
    c.beginPath();
    c.rect(-20, -20, G.W + 40, G.H + 40);
    c.clip();
    for (const q of W) {
      if (!q) continue;
      const life = q.life || 0.65,
        el = life - (q.t ?? life * 0.5),
        fade = clamp(el / 0.2, 0, 1);
      if (q.kind === 'laser' && q.angle != null) {
        lane(c, q.x, q.y, q.angle, q.h || q.len || 1500, Math.max(30, (q.w || 26) + 8), 0.8 * fade);
      } else if (q.w > 0 && q.h > 0 && q.angle == null) {
        // edge strip; safe gap stays empty with mint brackets
        const horiz = q.w >= q.h;
        c.save();
        c.globalAlpha = 0.8 * fade;
        c.beginPath();
        c.rect(q.x, q.y, q.w, q.h);
        c.fillStyle = rgba(C.pink, 0.3);
        c.fill();
        c.lineWidth = 2.5;
        c.setLineDash([10, 8]);
        c.strokeStyle = C.pink;
        c.stroke();
        c.setLineDash([]);
        if (q.gap != null && q.gapW) {
          const g0 = q.gap - q.gapW / 2;
          c.fillStyle = C.arena;
          if (horiz) c.fillRect(g0, q.y, q.gapW, q.h);
          else c.fillRect(q.x, g0, q.w, q.gapW);
          c.strokeStyle = C.mint;
          c.lineWidth = 4;
          c.lineCap = 'round';
          c.beginPath();
          if (horiz) {
            c.moveTo(g0, q.y - 4);
            c.lineTo(g0, q.y + q.h + 4);
            c.moveTo(g0 + q.gapW, q.y - 4);
            c.lineTo(g0 + q.gapW, q.y + q.h + 4);
          } else {
            c.moveTo(q.x - 4, g0);
            c.lineTo(q.x + q.w + 4, g0);
            c.moveTo(q.x - 4, g0 + q.gapW);
            c.lineTo(q.x + q.w + 4, g0 + q.gapW);
          }
          c.stroke();
        }
        c.restore();
      } else if (q.kind === 'rain' || q.kind === 'tick' || q.kind === 'entry') {
        let a = q.angle;
        if (a == null) {
          const dl = q.x - e.left,
            dr = e.right - q.x,
            dt2 = q.y - e.top,
            db = e.bottom - q.y,
            m = Math.min(dl, dr, dt2, db);
          a = m === dl ? 0 : m === dr ? Math.PI : m === dt2 ? Math.PI / 2 : -Math.PI / 2;
        }
        c.save();
        c.globalAlpha = 0.85 * fade;
        chevron(c, q.x + Math.cos(a) * 10, q.y + Math.sin(a) * 10, a, 9, C.pink);
        c.restore();
      } else if (q.angle != null) {
        const len = q.len || q.w || 300;
        lane(c, q.x, q.y, q.angle, len, 22, 0.6 * fade);
      } else {
        c.save();
        c.globalAlpha = 0.8 * fade;
        c.setLineDash([8, 8]);
        c.lineWidth = 3;
        c.strokeStyle = C.pink;
        c.beginPath();
        c.arc(q.x, q.y, lerp(q.w || 90, 30, ease.cubicOut(clamp(el / life, 0, 1))), 0, TAU);
        c.stroke();
        c.restore();
      }
    }
    c.restore();
  }
  function particles(c) {
    if (!G.particles || !G.particles.length) return;
    c.save();
    c.lineWidth = 2;
    c.strokeStyle = C.ink;
    for (const p of G.particles) {
      c.globalAlpha = clamp(p.life / 0.25, 0, 1);
      const s = (p.size || 3) + 1.5;
      c.fillStyle = palColor(p.color);
      c.beginPath();
      c.moveTo(p.x, p.y - s);
      c.lineTo(p.x + s, p.y);
      c.lineTo(p.x, p.y + s);
      c.lineTo(p.x - s, p.y);
      c.closePath();
      c.stroke();
      c.fill();
    }
    c.restore();
  }
  function player(c, e) {
    const p = e.player,
      focus = !!(e.input && e.input.focus),
      inv = p.invuln > 0 && p.dashT <= 0,
      t = e.time,
      still = reduced();
    c.save();
    c.translate(p.x, p.y);
    if (e.overdrive > 0) {
      c.save();
      c.rotate(still ? 0 : -t * 0.6);
      c.setLineDash([8, 10]);
      c.lineCap = 'round';
      c.lineWidth = 4;
      c.strokeStyle = C.sun;
      c.beginPath();
      c.arc(0, 0, 50, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (focus) {
      c.save();
      c.rotate(still ? 0 : t * 30 * DEG);
      c.setLineDash([3, 9]);
      c.lineCap = 'round';
      c.lineWidth = 3;
      c.strokeStyle = C.sky;
      c.beginPath();
      c.arc(0, 0, p.graze || 27, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (S.grazeRing > 0) {
      c.save();
      c.globalAlpha = 0.7 * clamp(S.grazeRing / 0.1, 0, 1);
      c.setLineDash([3, 9]);
      c.lineCap = 'round';
      c.lineWidth = 3;
      c.strokeStyle = C.cream;
      c.beginPath();
      c.arc(0, 0, (p.graze || 27) + (focus ? 3 : 0), 0, TAU);
      c.stroke();
      c.restore();
    }
    if (inv) {
      // steady sky shield arc: remaining i-frames as arc length (no blinking)
      const f = clamp(p.invuln / 1.4, 0, 1);
      c.save();
      c.lineCap = 'round';
      c.lineWidth = 8;
      c.strokeStyle = C.ink;
      c.beginPath();
      c.arc(0, 2, 26, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      c.stroke();
      c.lineWidth = 4;
      c.strokeStyle = C.sky;
      c.stroke();
      c.restore();
    }
    c.restore();
    const flame = still ? 38 : 38 + 4 * Math.sin(t * TAU * 8),
      l = Math.hypot(p.vx || 0, p.vy || 0) || 1;
    // i-frames: calm translucency with a slow (1.5 Hz) breathing, well under the 2 Hz comfort limit
    const alpha = inv ? 0.55 + (still ? 0 : 0.15 * Math.sin(t * TAU * 1.5)) : 1;
    // 기체는 작게(판정이 아닌 장식), 실제 판정은 가운데 점 하나 — 탄막 게임 관례
    ship(c, p.x, p.y, {
      scale: 0.62,
      flame,
      eyeScale: focus ? 1.15 : 1,
      alpha,
      look: { x: (p.vx || 0) / Math.max(l, 200), y: (p.vy || 0) / Math.max(l, 200) },
      rot: clamp((p.vx || 0) / 40, -8, 8),
      ...(G.shipSkin || {}), // equipped skin {body, fin} (set by screens.js)
    });
    {
      // 판정 점: 항상 표시. 이 점에 닿을 때만 실드가 깎인다(기체 그림은 판정 아님)
      const hr = p.hit || 5;
      c.save();
      c.beginPath();
      c.arc(p.x, p.y, hr + 3.5, 0, TAU);
      c.fillStyle = C.ink;
      c.fill();
      c.beginPath();
      c.arc(p.x, p.y, hr, 0, TAU);
      c.fillStyle = '#ffffff';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = focus ? C.pink || '#ff5fa2' : C.sky;
      c.beginPath();
      c.arc(p.x, p.y, hr + 5.5, 0, TAU);
      c.stroke();
      c.restore();
    }
  }

  // ---- HUD -----------------------------------------------------------------
  function sections(e) {
    const tl = e.timeline || {},
      sec = Array.isArray(tl.sections) && tl.sections.length ? tl.sections : null,
      n = sec ? sec.length : 5,
      i = clamp(e.sectionIndex || 0, 0, n - 1),
      t0 = sec ? sec[i].t : 0,
      t1 = sec && sec[i + 1] ? sec[i + 1].t : (e.mission && e.mission.duration) || 1;
    return { n, i, f: clamp((e.time - t0) / Math.max(0.01, t1 - t0), 0, 1), name: sec ? sec[i].name : '' };
  }
  function timeStr(e) {
    const remain = Math.max(0, ((e.mission && e.mission.duration) || 0) - e.time);
    return `${Math.floor(remain / 60)}:${Math.floor(remain % 60)
      .toString()
      .padStart(2, '0')}`;
  }
  function flowBadge(c, x, y, R, e) {
    const m = S.mult,
      k = S.multPunch > 0 ? S.multPunch / 0.24 : 0,
      sc = 1 + 0.25 * ease.cubicOut(k),
      od = e.overdrive > 0;
    burst(c, x, y, R, {
      points: 14,
      inner: 0.8,
      fill: od ? C.cream : C.sun,
      disc: m > 1 ? C.coral : C.plate,
      discR: 0.66,
      tilt: 8 + 15 * (1 - k) * (k > 0 ? 1 : 0),
      scale: sc,
      sh: 6,
      sw: 5,
      text: `×${m}`,
      textSize: R * (m >= 10 ? 0.5 : 0.62),
    });
  }
  function flowInfo(e) {
    const n = e.combo || 0,
      m = mult(n),
      lo = TIERS[m - 1],
      hi = TIERS[m] ?? null;
    return { n, m, f: hi ? (n - lo) / (hi - lo) : 1, next: hi ? `NEXT ×${m + 1}` : 'MAX FLOW' };
  }
  function bossPlate(c, e, cx, y, w) {
    const B = e.boss;
    if (!B || B.active === false || !(B.max > 0)) return false;
    const f = clamp(B.hp / B.max, 0, 1);
    if (S.bossHp == null || S.bossHp < f) S.bossHp = f;
    S.bossHp = Math.max(f, S.bossHp - 0.006);
    const x = cx - w / 2,
      h = 58;
    plate(c, x, y, w, h, { fill: C.deep, r: 18, sw: 5, sh: 6, sheen: false });
    sticker(c, B.name || 'JAMMER', x + 22, y + 22, 19, { align: 'left', stroke: 4, shadow: 2, maxW: w * 0.4 });
    const tag = B.final ? 'FINAL' : `PHASE ${Math.max(0, B.phase) + 1}`,
      tw = measure(tag, 13, 900, 1) + 26;
    plate(c, x + w - tw - 14, y + 9, tw, 26, { fill: B.final ? C.pink : C.coral, r: 13, sw: 3.5, sh: 0, sheenA: 0.25 });
    sticker(c, tag, x + w - 14 - tw / 2, y + 22, 13, { stroke: 3, shadow: 0, ls: 1 });
    if (w > 420) label(c, B.final ? 'LAST SIGNAL' : `SPELL ${Math.max(0, B.phase) + 1}`, x + w * 0.4 + 10, y + 24, { size: 12, color: C.sun, ls: 2 });
    const tx = x + 16,
      tw2 = w - 32;
    rr(c, tx, y + 38, tw2, 12, 6);
    c.fillStyle = C.ink;
    c.fill();
    if (S.bossHp > f) {
      rr(c, tx + 2, y + 40, (tw2 - 4) * S.bossHp, 8, 4);
      c.fillStyle = C.cream;
      c.fill();
    }
    if (f > 0) {
      rr(c, tx + 2, y + 40, (tw2 - 4) * f, 8, 4);
      c.fillStyle = C.coral;
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)';
      rr(c, tx + 2, y + 40, (tw2 - 4) * f, 3, 1.5);
      c.fill();
    }
    c.fillStyle = C.ink;
    c.fillRect(tx + 2 + (tw2 - 4) / 3 - 2, y + 37, 4, 14);
    c.fillRect(tx + 2 + ((tw2 - 4) * 2) / 3 - 2, y + 37, 4, 14);
    return true;
  }
  function shieldsRow(c, x, y, e, size = 30, gap = 36) {
    const p = e.player;
    for (let i = 0; i < 3; i++) shield(c, x + i * gap, y, i < p.shields, size);
    for (const L of S.lostShields) {
      const k = L.t / L.life;
      c.save();
      c.globalAlpha = 1 - k;
      c.translate(x + L.i * gap + 30 * k, y - 50 * k + 60 * k * k);
      c.rotate(k * 6);
      shield(c, 0, 0, true, size * (1 + 0.2 * k));
      c.restore();
    }
  }
  function hudGutter(c, e) {
    const s = e.stats(),
      ax = G.AX,
      SA = G.SAFE || { l: 0, r: 0, t: 0, b: 0 },
      L0 = -ax + SA.l,
      Lc = (L0 + 0) / 2,
      pw = Math.min(128, -L0 - 32),
      px = Lc - pw / 2,
      R1 = G.W + ax - SA.r,
      Rc = (G.W + R1) / 2;
    // TIME
    plate(c, px, 16, pw, 92, { fill: C.plate, r: 20, sw: 5, sh: 6 });
    label(c, 'TIME', px + 16, 34, { size: 11 });
    sticker(c, timeStr(e), Lc, 76, 42, { stroke: 8, shadow: 4, mono: true, maxW: pw - 12 });
    // shields
    plate(c, px, 124, pw, 56, { fill: C.deep, r: 20, sw: 5, sh: 6, sheen: false });
    shieldsRow(c, Lc - 36, 150, e);
    // STAGE pips
    const st = sections(e);
    label(c, 'STAGE', Lc, 214, { size: 11, align: 'center' });
    const ph = Math.min(40, (440 - 236) / st.n - 10);
    for (let i = 0; i < st.n; i++) {
      const y = 232 + i * (ph + 10);
      rr(c, Lc - 12, y, 24, ph, 12);
      c.fillStyle = C.ink;
      c.fill();
      rr(c, Lc - 9, y + 3, 18, ph - 6, 9);
      c.fillStyle = i < st.i ? C.mint : i === st.i ? C.deep : C.deep;
      c.fill();
      if (i === st.i) {
        c.save();
        rr(c, Lc - 9, y + 3, 18, ph - 6, 9);
        c.clip();
        const fh = (ph - 6) * Math.max(0.12, st.f);
        c.fillStyle = C.sun;
        c.fillRect(Lc - 9, y + 3 + (ph - 6) - fh, 18, fh);
        c.restore();
      }
      if (i < st.i) {
        c.fillStyle = 'rgba(255,255,255,.3)';
        rr(c, Lc - 6, y + 6, 5, ph - 14, 2.5);
        c.fill();
      }
    }
    sticker(c, `${st.i + 1}/${st.n}`, Lc, 232 + st.n * (ph + 10) + 12, 15, { stroke: 4, shadow: 2 });
    // GRAZE
    plate(c, px, 604 - 0, pw, 92, { fill: C.deep, r: 20, sw: 5, sh: 6, sheen: false });
    spark(c, px + 24, 626, 11);
    label(c, 'GRAZE', px + 42, 627, { size: 11 });
    sticker(c, num(s.grazes ?? e.grazes ?? 0), Lc, 668, 36, { fill: C.sun, stroke: 7, shadow: 3 });
    // ---- right gutter: FLOW
    const fi = flowInfo(e),
      rw = Math.min(116, R1 - G.W - 28);
    flowBadge(c, Rc, 156, Math.min(54, rw / 2), e);
    chip(c, Rc, 222, '', { label: 'FLOW', value: String(fi.n), w: rw, h: 44, align: 'center', size: 15, valueSize: 24, padX: 14 });
    progress(c, Rc - 50, 280, 100, 12, fi.f, { color: C.sun });
    label(c, fi.next, Rc, 304, { size: 10, align: 'center' });
    const od = e.overdrive > 0;
    progress(c, Rc - 50, 318, 100, 10, od ? e.overdrive / 5 : (e.energy || 0) / 100, { color: od ? C.sun : C.sky });
    label(c, od ? 'OVERDRIVE ×3' : 'ENERGY', Rc, 340, { size: 10, align: 'center', color: od ? C.sun : C.mute });
    // top-centre boss / section chip
    if (!bossPlate(c, e, 640, 14, 600))
      if (st.name) chip(c, 640, 18, st.name, { color: C.deep, size: 15, h: 38, align: 'center', label: `STAGE ${st.i + 1}`, sh: 5, sheen: false });
    // SCORE (top-right inside arena)
    plate(c, 1036, 14, 226, 66, { fill: C.plate, r: 20, sw: 5, sh: 6 });
    label(c, 'SCORE', 1054, 30, { size: 11 });
    sticker(c, pad(s.score), 1244, 57, 36, { align: 'right', stroke: 7, shadow: 4, mono: true });
  }
  function hudCompact(c, e) {
    const s = e.stats(),
      st = sections(e),
      fi = flowInfo(e),
      SA = G.SAFE || { l: 0, r: 0, t: 0, b: 0 },
      x0 = 12 + SA.l;
    plate(c, x0, 10, 112, 60, { fill: C.plate, r: 18, sw: 4, sh: 5 });
    label(c, 'TIME', x0 + 14, 24, { size: 10 });
    sticker(c, timeStr(e), x0 + 56, 49, 28, { stroke: 6, shadow: 3, mono: true });
    plate(c, x0 + 124, 10, 118, 46, { fill: C.deep, r: 18, sw: 4, sh: 5, sheen: false });
    shieldsRow(c, x0 + 148, 33, e, 26, 34);
    // stage pips (horizontal)
    for (let i = 0; i < st.n; i++) {
      const x = x0 + 128 + i * 22;
      rr(c, x, 64, 18, 10, 5);
      c.fillStyle = C.ink;
      c.fill();
      rr(c, x + 2, 66, 14, 6, 3);
      c.fillStyle = i < st.i ? C.mint : C.deep;
      c.fill();
      if (i === st.i) {
        rr(c, x + 2, 66, 14 * Math.max(0.15, st.f), 6, 3);
        c.fillStyle = C.sun;
        c.fill();
      }
    }
    chip(c, x0 + 254, 14, '', { label: 'GRAZE', value: num(s.grazes ?? 0), h: 38, size: 13, valueSize: 20, icon: 'spark', padX: 12, sh: 4 });
    const scW = 196,
      scX = 1280 - 74 - scW;
    if (!bossPlate(c, e, 640, 10, 400) && st.name)
      chip(c, 640, 14, st.name, { color: C.deep, size: 14, h: 34, align: 'center', sh: 4, sheen: false });
    plate(c, scX, 10, scW, 56, { fill: C.plate, r: 18, sw: 4, sh: 5 });
    label(c, 'SCORE', scX + 14, 24, { size: 10 });
    sticker(c, pad(s.score), scX + scW - 14, 47, 28, { align: 'right', stroke: 6, shadow: 3, mono: true });
    flowBadge(c, scX - 44, 44, 34, e);
    if (fi.n > 0) chip(c, scX - 44, 84, '', { label: 'FLOW', value: String(fi.n), h: 30, size: 11, valueSize: 16, align: 'center', padX: 10, sh: 3 });
  }
  function hud(c, e) {
    if ((G.AX || 0) >= 120) hudGutter(c, e);
    else hudCompact(c, e);
  }

  // ---- world ----------------------------------------------------------------
  const buckets = { block: [], orb: [], needle: [], diamond: [] };
  function world(c, e) {
    if (S.eng !== e) resetFx(e);
    const t = nowS(),
      dt = S.last ? clamp(t - S.last, 0, 0.05) : 0;
    S.last = t;
    detect(e, dt);
    const sp = span();
    c.fillStyle = C.night;
    c.fillRect(sp.x0, 0, sp.w, G.H);
    c.save();
    if (S.shake > 0 && !reduced()) {
      const a = 6 * (S.shake / 0.18);
      c.translate((Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a);
    }
    arena(c, e);
    c.save();
    c.beginPath();
    c.rect(0, 0, G.W, G.H);
    c.clip();
    warnings(c, e);
    telegraphs(c, e);
    core(c, e);
    // bullets by kind: blocks → orbs → needles → diamonds (aimed stuff on top)
    for (const k in buckets) buckets[k].length = 0;
    const p = e.player;
    let fresh = 0;
    for (const b of e.bullets) {
      (buckets[shapeOf(b)] || buckets.orb).push(b);
      if (b.grazed && !S.grazeT.has(b)) {
        S.grazeT.set(b, e.time);
        S.grazeRing = 0.3;
        if (fresh++ < 1) {
          const a0 = Math.atan2(b.y - p.y, b.x - p.x);
          for (let i = 0; i < 3; i++)
            S.fx.push({ k: 'spark', x: p.x + Math.cos(a0) * 16, y: p.y + Math.sin(a0) * 16, a: a0 + (i - 1) * 0.7, d: 20 + i * 5, t: 0, life: 0.3, col: i === 1 ? C.sun : C.cream, R: i === 1 ? 8 : 5 });
          if (e.time - S.grazeTextT > 0.5) {
            S.grazeTextT = e.time;
            S.fx.push({ k: 'text', s: 'GRAZE!', x: p.x + 58, y: p.y - 40, t: 0, life: 0.5, col: C.sun, size: 17 });
          }
        }
      }
    }
    c.save();
    drawBatch(c, buckets.block, 'block');
    drawBatch(c, buckets.orb, 'orb');
    drawBatch(c, buckets.needle, 'needle');
    drawBatch(c, buckets.diamond, 'diamond');
    c.restore();
    drawFx(c, e);
    player(c, e);
    particles(c);
    c.restore();
    c.restore();
    arenaEdge(c);
    hud(c, e);
  }
  function bg(c, t = 0, intensity = 0, mission = null, opt = {}) {
    uiBg(c, { kind: mission ? 'results' : 'title', rays: opt.rays, rayRot: 0 });
  }

  // ---- legacy kit wrappers (signatures used by screens.js) ----------------------
  function pill(c, x, y, w, h, lab, value, color, align = 'left') {
    const need = 28 + measure(lab, 12, 900, 1.5) + 14 + measure(value, h * 0.5) + 6;
    w = Math.max(w, Math.ceil(need));
    if (align === 'right') x -= w;
    return chip(c, x, y, '', { label: lab, value, w, h, size: 13, valueSize: h * 0.5, valueColor: palColor(color) });
  }
  function legacyButton(c, b, lab, accent = false, small = '') {
    if (lab === 'Ⅱ' || lab === 'II') {
      const r = Math.min(b.w, b.h) / 2;
      roundButton(c, b.x + b.w / 2, b.y + b.h / 2 - 2, r - 2, { color: C.plate, icon: 'pause', iconColor: C.cream });
      return b;
    }
    return button(c, b, lab, { variant: accent ? 'primary' : 'secondary', sub: small || undefined });
  }

  G.ui = {
    C,
    FONT,
    font,
    ease,
    num,
    pad,
    hit,
    reduced,
    rgba,
    text,
    label,
    sticker,
    measure,
    wrapLines,
    rr,
    plate,
    panel,
    card: panel,
    disc,
    starPath,
    burst,
    spark,
    shield,
    button,
    roundButton,
    chip,
    pill: chip,
    toggle,
    progress,
    segments,
    ribbon,
    icon,
    ICONS: Object.keys(ICON),
    RARITY,
    cardFrame,
    cardFace,
    cardBack,
    flipCard,
    GRADE,
    gradeBadge,
    countUp,
    toast,
    popup,
    ship,
    boss,
    bg: uiBg,
    rays,
    bullet: bulletIcon,
  };

  G.render = {
    bg,
    world,
    bullet,
    bulletIcon,
    enemyColor,
    lock,
    demoBullets,
    gradeRing,
    fx: fxEvent,
    span,
    pill,
    COLORS: {
      key: C.ink,
      cyan: C.sky,
      mint: C.mint,
      gold: C.sun,
      red: C.coral,
      orange: C.sun,
      magenta: C.pink,
      violet: C.grape,
      ...C,
    },
    KIND_COLOR,
    panel(c, x, y, w, h, a = 0.86) {
      panel(c, x, y, w, h, { color: C.plate, alpha: Math.max(0.9, a) });
    },
    button: legacyButton,
    hit,
  };
})();
