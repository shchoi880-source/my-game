'use strict';
// 레벨 디자인 (docs/SPEC.md §6). 모든 오브젝트는 박(beat) 단위 도우미로 생성 → 음악 박자에 정렬.
// 좌표: x 오른쪽 +, y 위쪽 + (지면 0). 1박 = speed*60/bpm px.
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const G = root.G = root.G || {};

  const SW = 40;     // 가시 폭/높이
  const TOP = 400;   // 천장 블록 윗면(화면 위쪽 한계)

  // 레벨 빌더: build(api)에서 박 단위로 배치하고, 정렬된 레벨 객체를 돌려준다.
  function makeLevel(cfg, build) {
    const B = cfg.speed * 60 / cfg.bpm;            // 1박 px
    const objs = [], sections = [];
    const X = (b) => Math.round(b * B * 10) / 10;  // 박 → x
    const api = {
      B, X,
      sec(b, name) { sections.push({ x: X(b), name }); },
      // n개 연속 가시 (위쪽). y = 놓일 면 높이
      spikes(b, n = 1, y = 0) {
        for (let i = 0; i < n; i++) objs.push({ t: 'spike', x: X(b) + i * SW, y, w: SW, h: SW, dir: 'up' });
      },
      // 천장: 끝(꼭짓점) 높이 tipY 인 아래쪽 가시 n개 + 그 위를 채우는 블록
      ceiling(b, n, tipY) {
        const x = X(b);
        objs.push({ t: 'block', x, y: tipY + SW, w: n * SW, h: TOP - (tipY + SW) });
        for (let i = 0; i < n; i++) objs.push({ t: 'spike', x: x + i * SW, y: tipY, w: SW, h: SW, dir: 'down' });
      },
      block(b, w, h, y = 0) { objs.push({ t: 'block', x: X(b), y, w, h }); },
      // 윗면에 가시가 박힌 발판: spikeAt = 발판 시작 기준 박 오프셋 배열
      plat(b, w, h, spikeAt = [], y = 0) {
        objs.push({ t: 'block', x: X(b), y, w, h });
        for (const s of spikeAt) {
          const [o, n] = Array.isArray(s) ? s : [s, 1];
          for (let i = 0; i < n; i++) objs.push({ t: 'spike', x: X(b + o) + i * SW, y: y + h, w: SW, h: SW, dir: 'up' });
        }
      },
      gap(b, w) { objs.push({ t: 'gap', x: X(b), w }); },
      pad(b, y = 0) { objs.push({ t: 'pad', x: X(b), y }); },
      orb(b, y) { objs.push({ t: 'orb', x: X(b), y }); },
      coin(b, y) { objs.push({ t: 'coin', x: X(b), y }); },
      // 톱날. 움직이는 톱날은 sin(2π·t/period) — t = 런 경과 시간 ≈ x/speed.
      // periodBeats 박 주기로 맞추면 b ≡ periodBeats/4 (mod periodBeats) 지점에서 +진폭 최대.
      saw(b, y, r = 30, ax = 0, ay = 0, periodBeats = 0) {
        const o = { t: 'saw', x: X(b), y, r, ax, ay, period: periodBeats ? +(periodBeats * 60 / cfg.bpm).toFixed(4) : 2 };
        objs.push(o);
      },
    };
    build(api);
    objs.sort((a, b) => a.x - b.x || (a.t < b.t ? -1 : 1));
    const lv = Object.assign({}, cfg, { length: X(cfg.beats), objects: objs, sections });
    delete lv.beats;
    return lv;
  }

  const LEVELS = [];

  // ───────────────────────── LV1 첫 박자 (120bpm, 380px/s, 1박 190px) ─────────────────────────
  LEVELS.push(makeLevel({
    id: 'lv1', name: '첫 박자', track: 'lv1', bpm: 120, speed: 380, beats: 90,
    theme: { bg: '#0b0f2a', bg2: '#1b0f3a', accent: '#29f0ff', accent2: '#ff3df2', ground: '#121a44', scene: 'city' },
  }, (L) => {
    L.sec(0, '출발');
    L.sec(5, '첫 가시');
    L.spikes(6); L.spikes(8); L.spikes(10);
    L.spikes(12, 2); L.spikes(14);
    L.spikes(16, 2); L.spikes(18, 2);
    L.spikes(20, 3);

    L.sec(23, '작은 블록');
    L.block(24, 60, 40);
    L.block(26, 190, 40); L.spikes(27); L.block(27.5, 190, 40);
    L.plat(30, 190, 40, [0.4]);
    // 계단 → 꼭대기에서 뛰어내리기
    L.block(33, 190, 40); L.block(34, 190, 80); L.block(35, 190, 120);
    L.spikes(36, 3);

    L.sec(38, '점프대');
    L.pad(40); L.block(40.75, 380, 160);
    L.spikes(44.5, 2);
    L.pad(47); L.spikes(47.5, 4);
    L.coin(47.75, 330);          // 코인1: 점프대 꼭대기에서 2단 점프
    L.spikes(49.5, 2);           //   └ 욕심내면 착지 직후 바로 점프해야 함

    L.sec(52, '두 번 뛰기');
    L.block(54, 60, 150);
    L.spikes(57, 5);
    L.block(60, 60, 170);
    L.coin(60.15, 250);          // 코인2: 높은 기둥 위, 정점 2단 점프

    L.sec(64, '리듬 타기');
    L.spikes(66); L.spikes(68, 2); L.spikes(70); L.spikes(71.5); L.spikes(73, 3);

    L.sec(76, '피날레');
    L.spikes(77);
    L.pad(79); L.spikes(79.5, 3);
    L.block(82, 190, 60); L.spikes(83, 3);
    L.coin(83.3, 250);           // 코인3: 블록 끝에서 2단 점프 → 착지 직후 가시
    L.spikes(85.5); L.spikes(87.5, 2);
  }));

  // ───────────────────────── LV2 빛의 계단 (128bpm, 400px/s, 1박 187.5px) ─────────────────────────
  LEVELS.push(makeLevel({
    id: 'lv2', name: '빛의 계단', track: 'lv2', bpm: 128, speed: 400, beats: 118,
    theme: { bg: '#04141a', bg2: '#082a2c', accent: '#3dff9e', accent2: '#ffe23d', ground: '#0b2b2a', scene: 'ziggurat' },
  }, (L) => {
    L.sec(0, '출발');
    L.sec(5, '발판 건너기');
    L.block(6, 300, 50); L.spikes(7.8, 2);
    L.block(8.6, 300, 80); L.spikes(10.4, 2);
    L.plat(11.2, 375, 50, [0.8]);
    L.spikes(14);

    L.sec(16, '구멍');
    L.gap(17, 150); L.gap(19, 150); L.gap(20.5, 180);
    L.spikes(22.5);
    L.gap(24, 250);
    L.coin(24.6, 220);           // 코인1: 긴 구멍 위 2단 점프 정점
    L.gap(27, 520); L.block(27.8, 150, 40);

    L.sec(32, '가시 지붕');
    L.plat(33, 1125, 60, [1, [2.5, 2], 4]);
    L.gap(39, 200);
    L.block(41, 185, 50); L.block(42, 185, 100); L.block(43, 185, 150);
    L.spikes(44, 3);

    L.sec(47, '첫 오브');
    L.spikes(49, 6); L.orb(49.6, 150);
    L.spikes(52, 10); L.orb(52.6, 150);

    L.sec(57, '오브 다리');
    L.gap(59, 760);
    L.orb(59.8, 130); L.orb(61.05, 172); L.orb(62.3, 214);
    L.coin(61.7, 320);           // 코인2: 오브 다리 위쪽, 2단 점프로만

    L.sec(67, '계단 탑');
    L.block(68, 185, 60); L.spikes(69, 2);
    L.block(69.5, 185, 120); L.spikes(70.5, 2);
    L.block(71, 185, 180);
    L.coin(72.2, 330);           // 코인3: 탑 꼭대기에서 2단 점프
    L.plat(73, 560, 90, [1]);
    L.spikes(76, 4);

    L.sec(79, '질주');
    L.spikes(81); L.spikes(82.5, 2);
    L.gap(84, 160);
    L.plat(86, 375, 60, [1]);
    L.gap(88.2, 200);
    L.spikes(90.7, 6);
    L.orb(91.3, 150);

    L.sec(96, '피날레');
    L.block(98, 185, 50); L.block(99.5, 185, 100); L.block(101, 185, 150);
    L.gap(102, 300);
    L.spikes(105); L.spikes(107, 2); L.spikes(109);
    L.gap(111, 160);
  }));

  // ───────────────────────── LV3 톱니 정원 (136bpm, 420px/s, 1박 185.3px) ─────────────────────────
  LEVELS.push(makeLevel({
    id: 'lv3', name: '톱니 정원', track: 'lv3', bpm: 136, speed: 420, beats: 136,
    theme: { bg: '#170806', bg2: '#2a1206', accent: '#ff8a1f', accent2: '#ff2d6b', ground: '#2b140b', scene: 'gears' },
  }, (L) => {
    L.sec(0, '출발');
    L.sec(5, '톱니 입구');
    L.saw(6, 0, 30); L.saw(8, 0, 30); L.saw(9.5, 0, 34);
    L.spikes(11, 2); L.saw(12.5, 0, 30);
    L.spikes(14); L.saw(15.8, 110, 28);   // 공중 톱날: 그 아래에선 뛰지 말 것
    L.spikes(17.5, 2);

    L.sec(20, '흔들 톱니');
    // 주기 4박, b≡1(mod 4)에서 +진폭 → 통과 순간 위로 올라가 있음
    L.spikes(21, 1); L.saw(21, 150, 28, 0, 60, 4);
    L.spikes(25, 2); L.saw(25.3, 160, 28, 0, 60, 4);
    L.saw(27, 0, 30, 0, 0); L.saw(28.5, 0, 30);
    L.spikes(29, 1); L.saw(29.2, 150, 28, 0, 70, 4);

    L.sec(32, '점프대 연쇄');
    L.pad(33); L.spikes(33.6, 5);
    L.pad(36); L.spikes(36.6, 5);
    L.block(39, 375, 80); L.pad(39.8, 80);
    L.coin(40.4, 360);           // 코인1: 블록 위 점프대 + 2단 점프
    L.spikes(41.1, 4);

    L.sec(44, '공중 오브');
    // 오르는 오브 사슬: 1.25박 간격, 매번 +68px → 오브에 느리게 내려오며 닿음(넓은 판정 창)
    L.gap(45.5, 800);
    L.orb(46, 130); L.orb(47.25, 198); L.orb(48.5, 266);
    L.saw(51.5, 0, 30); L.saw(52.5, 0, 30);

    L.sec(54, '반박 리듬');
    L.spikes(56); L.spikes(56.5);
    L.spikes(58); L.spikes(58.5);
    L.saw(60, 0, 30); L.saw(60.5, 0, 30);
    L.spikes(62, 2); L.spikes(63.5); L.spikes(64);

    L.sec(67, '톱니 계단');
    L.block(68, 185, 60); L.saw(69.2, 0, 30);
    L.block(69.6, 185, 120); L.saw(70.8, 0, 30);
    L.block(71.2, 280, 180);
    L.saw(72.2, 300, 30);
    L.coin(72.45, 240);          // 코인2: 톱날 바로 뒤 아래 — 톱날 밑에서 짧게 한 번 뛰기 (허용 약 0.18초)
    L.spikes(73.8, 3);

    L.sec(77, '흔들 회랑');
    L.spikes(79, 2); L.saw(79.2, 170, 28, 0, 50, 4);
    L.spikes(81); L.saw(83, 120, 28, 0, 60, 4);
    L.spikes(85, 3); L.saw(85.4, 180, 28, 0, 50, 4);
    L.saw(87, 0, 30);

    L.sec(90, '오브 톱니');
    L.spikes(91, 8); L.orb(91.5, 150); L.saw(92.6, 320, 30);
    L.pad(95); L.saw(96, 150, 30); L.spikes(95.6, 4);
    L.orb(98, 150); L.spikes(97.8, 6);

    L.sec(103, '압박');
    L.saw(104, 0, 30); L.saw(105, 0, 30); L.saw(106.5, 0, 34);
    L.plat(108, 370, 60, [[0.6, 1], [1.4, 1]]);
    L.gap(110, 230);
    L.spikes(112, 2); L.saw(113.5, 0, 30); L.saw(114, 0, 30);

    L.sec(118, '피날레');
    L.pad(119); L.spikes(119.6, 4);
    L.orb(122, 140); L.spikes(121.8, 7);
    L.coin(122.6, 320);          // 코인3: 마지막 오브 위 2단 점프
    L.saw(126, 0, 30); L.saw(127.5, 0, 30); L.spikes(129, 2); L.spikes(130.5);
  }));

  // ───────────────────────── LV4 거꾸로 내리는 비 (146bpm, 450px/s, 1박 184.9px) ─────────────────────────
  LEVELS.push(makeLevel({
    id: 'lv4', name: '거꾸로 내리는 비', track: 'lv4', bpm: 146, speed: 450, beats: 170,
    theme: { bg: '#0c0620', bg2: '#22083a', accent: '#b46bff', accent2: '#3dfff0', ground: '#1a0e38', scene: 'spires' },
  }, (L) => {
    L.sec(0, '출발');
    L.sec(5, '낮은 하늘');
    L.ceiling(7, 10, 200); L.spikes(7.8); L.spikes(9.2);
    L.spikes(11, 2);
    L.ceiling(13, 10, 120);
    L.spikes(16, 2);

    L.sec(19, '좁은 통로');
    L.ceiling(20, 24, 190);
    L.spikes(20.8); L.spikes(22); L.spikes(23.2, 2); L.spikes(24.6);
    L.ceiling(27, 6, 120); L.spikes(28.9); L.ceiling(29.8, 6, 120);
    L.spikes(31.8, 2);

    L.sec(34, '이중 도약');
    L.block(35, 50, 200);
    L.spikes(37, 6);
    L.block(41, 50, 200);
    L.coin(41.13, 285);          // 코인1: 가장 높은 기둥 위 정점
    L.spikes(43.3, 3); L.ceiling(43.3, 3, 210);

    L.sec(45, '흔들 톱니');
    L.saw(47, 120, 30, 0, 70, 4);
    L.saw(49, 60, 30, 0, 50, 2);
    L.spikes(51, 2); L.saw(51.3, 190, 30, 0, 60, 4);
    L.saw(53, 0, 30, 60, 0, 4);
    L.saw(55, 150, 30, 0, 80, 4);

    L.sec(58, '거꾸로 비');
    L.ceiling(59, 6, 130); L.spikes(60.7, 2); L.ceiling(61.3, 6, 130);
    L.spikes(63, 2); L.ceiling(63.6, 6, 130);
    L.spikes(65.5, 3);
    L.block(67, 280, 60); L.ceiling(67, 7, 235); L.spikes(68.4, 1, 60);

    L.sec(71, '톱니 문');
    L.ceiling(72, 4, 220); L.saw(72.4, 110, 28, 0, 80, 4);
    L.spikes(74, 2);
    L.ceiling(76, 4, 220); L.saw(76.4, 110, 28, 0, 80, 4);
    L.pad(78); L.spikes(78.6, 4);
    L.saw(79.5, 330, 30, 0, 0);

    L.sec(82, '공중 회랑');
    L.gap(83, 560);
    L.orb(83.8, 150); L.orb(85.05, 242);
    L.coin(84.6, 340);           // 코인2: 두 오브 사이 정점에서 2단 점프 (그러면 두 번째 오브를 놓칠 수도)
    L.ceiling(87.3, 4, 200);
    L.spikes(89.5, 2);

    L.sec(92, '빗속 질주');
    L.ceiling(93, 20, 180);
    L.spikes(93.5); L.spikes(94.5); L.spikes(95.5, 2); L.spikes(96.8); L.spikes(97.6);
    L.spikes(99.5, 3);
    L.block(101, 185, 60); L.block(102.3, 185, 120); L.ceiling(102.3, 5, 260);
    L.spikes(103.3, 4);

    L.sec(106, '톱니 계단');
    L.block(107, 185, 70); L.saw(108.25, 0, 30);
    L.block(108.6, 185, 140); L.saw(109.85, 120, 28, 0, 40, 2);
    L.block(110.2, 185, 210);
    L.spikes(111.2, 5);
    L.saw(112.5, 260, 30, 0, 50, 4);

    L.sec(115, '쌍둥이 비');
    L.ceiling(116, 5, 150); L.spikes(117.3, 2); L.ceiling(118, 5, 150);
    L.spikes(119.3, 2); L.ceiling(120, 5, 150);
    L.spikes(121.5); L.spikes(122);
    L.pad(123.5); L.ceiling(124.5, 6, 330); L.spikes(124, 6);

    L.sec(128, '폭풍');
    L.saw(129, 0, 30); L.saw(129.5, 0, 30);
    L.saw(131, 150, 30, 0, 60, 2);
    L.spikes(133, 5); L.orb(133.5, 150); L.ceiling(134.5, 3, 300);
    L.saw(136.5, 0, 30, 50, 0, 2);
    L.spikes(138, 2); L.spikes(139.5);

    L.sec(142, '마지막 비');
    L.ceiling(143, 30, 190);
    L.spikes(144); L.spikes(145); L.spikes(146, 2); L.spikes(147.3); L.spikes(148.3); L.spikes(149.5, 2);
    L.coin(150.6, 140);          // 코인3: 천장 회랑 안, 가시 바로 위
    L.spikes(151);
    L.spikes(153, 3); L.spikes(155); L.spikes(156.5, 2);

    L.sec(159, '피날레');
    L.pad(160); L.spikes(160.6, 4);
    L.spikes(163); L.spikes(164.5, 2); L.spikes(166);
  }));

  // ───────────────────────── LV5 임계점 (160bpm, 480px/s, 1박 180px) ─────────────────────────
  LEVELS.push(makeLevel({
    id: 'lv5', name: '임계점', track: 'lv5', bpm: 160, speed: 480, beats: 213,
    theme: { bg: '#12000a', bg2: '#2a0016', accent: '#ff4fd8', accent2: '#fff23d', ground: '#2e0014', scene: 'ruins' },
  }, (L) => {
    L.sec(0, '출발');
    L.sec(6, '점화');
    L.spikes(7); L.spikes(8.5); L.spikes(9, 2); L.spikes(10.5);
    L.saw(12, 0, 30); L.saw(12.5, 0, 30); L.spikes(14, 3);
    L.spikes(16); L.spikes(16.5); L.spikes(18, 2);

    L.sec(21, '톱니 문');
    L.saw(23, 130, 30, 0, 80, 4);
    L.saw(25, 130, 30, 0, -80, 4);
    L.spikes(27, 2); L.saw(27.3, 200, 30, 0, 60, 4);
    L.saw(29, 0, 30); L.saw(29.5, 0, 30); L.saw(30, 0, 30);

    L.sec(33, '오브 사슬');
    // 오르는 오브 사슬: 1.5박 간격, 매번 +60px
    L.gap(34, 990);
    L.orb(34.6, 130); L.orb(36.1, 190); L.orb(37.6, 250);
    L.saw(36.1, 360, 30);
    L.coin(36.85, 330);          // 코인1: 오브 사이 2단 점프 — 세 번째 오브를 놓치기 쉬움
    L.spikes(40.5, 2);

    L.sec(43, '바늘 회랑');
    L.ceiling(44, 30, 185);
    L.spikes(44.7); L.spikes(46.2); L.spikes(47.7, 2); L.spikes(49.4);
    L.spikes(50.9, 2); L.spikes(52.6);
    L.spikes(54.3, 3);

    L.sec(56, '이중 도약');
    L.block(57, 40, 210); L.spikes(58, 4);
    L.block(60, 40, 230); L.ceiling(60.6, 4, 320);
    L.spikes(62, 6);
    L.coin(62.6, 290);           // 코인2: 가시 숲 위 정점 2단 점프
    L.spikes(65); L.spikes(65.5);

    L.sec(68, '점프대 톱니');
    L.pad(69); L.saw(70, 220, 30, 0, 0); L.spikes(69.6, 5);
    L.pad(72); L.spikes(72.6, 5); L.saw(73.3, 330, 30);
    L.block(75, 360, 80); L.pad(75.8, 80); L.ceiling(77, 4, 300);
    L.spikes(77, 4);

    L.sec(80, '반박 폭주');
    L.spikes(81); L.spikes(81.5); L.spikes(83); L.spikes(83.5);
    L.saw(85, 0, 30); L.saw(85.5, 0, 30); L.spikes(87, 2); L.spikes(88.5); L.spikes(89);
    L.plat(90.5, 540, 60, [[1, 1], [1.5, 1], [2.5, 1]]);
    L.spikes(93.6, 3);

    L.sec(96, '움직이는 벽');
    L.saw(97, 100, 32, 0, 70, 4); L.saw(97.5, 260, 32, 0, 70, 4);
    L.saw(101, 100, 32, 0, -70, 4); L.saw(101.5, 260, 32, 0, -70, 4);
    L.spikes(103, 3);
    L.saw(105, 0, 30, 70, 0, 4);

    L.sec(108, '오브 톱니');
    L.spikes(109, 9); L.orb(109.5, 150); L.saw(110.6, 330, 30); L.orb(111.3, 160);
    L.gap(114, 700); L.orb(114.8, 140); L.orb(116.3, 150);
    L.saw(115.6, 20, 30, 0, 0);

    L.sec(120, '거꾸로 비');
    L.ceiling(121, 5, 130); L.spikes(122.5, 2); L.ceiling(123.3, 5, 130);
    L.spikes(124.8, 2); L.ceiling(125.6, 5, 130);
    L.spikes(127.2); L.spikes(127.7);
    L.block(128.3, 270, 60); L.ceiling(128.3, 7, 235); L.spikes(129.2, 1, 60);
    L.spikes(130.5, 3);

    L.sec(133, '톱니 계단');
    L.block(134, 180, 70); L.saw(135.2, 0, 30);
    L.block(135.5, 180, 140); L.saw(136.7, 110, 28, 0, 40, 2);
    L.block(137, 180, 210); L.saw(138.2, 280, 30, 0, 40, 4);
    L.spikes(138, 6);
    L.spikes(141); L.spikes(141.5);

    L.sec(144, '임계 질주');
    L.spikes(145); L.spikes(146, 2); L.spikes(147); L.spikes(147.5);
    L.saw(149.5, 150, 30, 0, -70, 2); L.spikes(149, 1);
    L.gap(151, 250);
    L.spikes(153.5, 2); L.saw(155, 0, 30); L.saw(155.5, 0, 30);
    L.pad(157); L.spikes(157.6, 5); L.saw(158.6, 340, 30);
    L.orb(160.8, 150); L.spikes(160.5, 6);

    L.sec(164, '숨 고르기');
    L.sec(168, '극점');
    L.ceiling(169, 22, 190);
    L.spikes(169.6); L.spikes(170.5); L.spikes(171.2); L.spikes(172.1, 2); L.spikes(173.4); L.spikes(174.1);
    L.gap(176, 200);
    L.saw(178, 120, 30, 0, 80, 4);
    L.spikes(179.5, 2); L.spikes(181); L.spikes(181.5);
    L.gap(183, 700); L.orb(183.8, 130); L.orb(185.3, 190); L.saw(184.55, 360, 30);
    L.coin(186.3, 390);          // 코인3: 마지막 오브 뒤 2단 점프 — 착지가 늦어 가시가 코앞
    L.spikes(188, 2);

    L.sec(191, '피날레');
    L.spikes(192); L.spikes(192.5); L.spikes(194, 2); L.saw(195.5, 0, 30); L.saw(196, 0, 30);
    L.pad(198); L.spikes(198.6, 5);
    L.spikes(201.5); L.spikes(203, 2); L.spikes(204.5); L.spikes(205);
    L.spikes(207, 3);
  }));

  G.LEVELS = LEVELS;

  // ───────────── 하드 모드 ─────────────
  // 1) 같은 맵을 tscale배 빠르게: 속도·BPM·중력·점프가 모두 비례 → 점프 궤적은 노말과 같고 반응 시간만 짧아짐
  // 2) 노말에서 장애물 없이 달리던 평지 구간에 박자에 맞춰 가시를 추가(쉬는 구간 없이 계속 점프)
  //    앞뒤로 충분한 빈 땅이 있는 곳에만 넣어서 항상 넘을 수 있게 한다. tools/verify.js --hard 로 검증.
  const HARD_SCALE = { lv1: 1.3, lv2: 1.3, lv3: 1.25, lv4: 1.2, lv5: 1.15 };
  // 레벨별 추가 가시 패턴(가시 개수 순환)과 최소 간격(박)
  const HARD_EXTRA = {
    lv1: { grow: 2, pat: [1, 2], every: 2 },
    lv2: { grow: 2, pat: [1, 2, 1], every: 2 },
    lv3: { grow: 2, pat: [2, 1, 2], every: 2 },
    lv4: { grow: 1, pat: [2, 1], every: 2 },
    lv5: { grow: 1, pat: [1, 2], every: 2.5 },
  };
  const hardCache = {};
  G.HARD_SCALE = HARD_SCALE;
  function extent(o) {
    if (o.t === 'gem' || o.t === 'coin') return null;     // 먹는 것은 장애물 아님
    if (o.t === 'saw') { const r = (o.r || 30) + Math.abs(o.ax || 0); return [o.x - r, o.x + r]; }
    if (o.t === 'orb') return [o.x - 26, o.x + 26];
    if (o.t === 'pad') return [o.x, o.x + 40];
    return [o.x, o.x + (o.w || 40)];
  }
  function hardExtras(lv) {
    const cfg = HARD_EXTRA[lv.id];
    if (!cfg) return [];
    const B = lv.speed * 60 / lv.bpm;
    const spans = [];
    for (const o of lv.objects) { const e = extent(o); if (e) spans.push(e); }
    const free = (x0, x1) => { for (const e of spans) if (e[1] > x0 && e[0] < x1) return false; return true; };
    // 천장(공중 블록) 구간 바로 앞에는 넣지 않음: 착지 직후 낮은 통로로 들어가면 타이밍이 너무 빡빡해짐
    const ceil = lv.objects.filter(o => o.t === 'block' && o.y > 0).map(o => o.x);
    const nearCeil = (x0, x1) => ceil.some(cx => cx >= x0 && cx < x1);
    const out = [];
    let n = 0, nextB = 8;
    const endB = lv.length / B - 4;
    for (let b = 8; b <= endB; b += 0.5) {
      if (b < nextB) continue;
      const cnt = cfg.pat[n % cfg.pat.length];
      const x = Math.round(b * B * 10) / 10, w = cnt * SW;
      // 도약 구간(앞 1.3박) + 착지 구간(뒤 1.8박)이 모두 빈 땅일 때만
      if (!free(x - B * 1.1, x + w + B * 1.5) || nearCeil(x - B * 0.5, x + w + B * 3)) continue;
      for (let i = 0; i < cnt; i++) out.push({ t: 'spike', x: x + i * SW, y: 0, w: SW, h: SW, dir: 'up', extra: true });
      spans.push([x, x + w]);
      n++; nextB = b + cfg.every;
    }
    // 기존 가시 묶음(지면, 1~2개)을 한 칸 늘림: 뒤쪽 착지 공간이 비어 있을 때만
    const grp = [];
    const ups = lv.objects.filter(o => o.t === 'spike' && (o.dir || 'up') === 'up' && !(o.y > 0)).sort((a, b) => a.x - b.x);
    for (let i = 0; i < ups.length;) {
      let j = i; while (j + 1 < ups.length && Math.abs(ups[j + 1].x - ups[j].x - SW) < 0.5) j++;
      grp.push({ x0: ups[i].x, n: j - i + 1 }); i = j + 1;
    }
    const ext = [];
    for (const g of grp) {
      if (g.n > cfg.grow) continue;
      const nx = g.x0 + g.n * SW;
      // 이 묶음 자신은 빼고 검사
      const others = spans.filter(e => !(e[0] >= g.x0 - 0.5 && e[1] <= nx + 0.5));
      let ok = true; for (const e of others) if (e[1] > nx && e[0] < nx + SW + B * 1.5) { ok = false; break; }
      if (!ok || nearCeil(nx - B * 0.5, nx + SW + B * 3)) continue;
      ext.push({ t: 'spike', x: nx, y: 0, w: SW, h: SW, dir: 'up', extra: true });
      spans.push([nx, nx + SW]);
    }
    return out.concat(ext);
  }
  G.hardLevel = lv => {
    if (!lv || lv.hard) return lv;
    const c0 = hardCache[lv.id];
    if (c0 && c0.baseCount === lv.objects.length && c0.tscale === (HARD_SCALE[lv.id] || 1.25)) return c0;
    const k = HARD_SCALE[lv.id] || 1.25;
    const extras = hardExtras(lv);
    // 추가 가시와 겹치는 낮은 젬은 치움(가시 위에 먹이가 겹쳐 보이지 않게)
    const hit = o => o.t === 'gem' && o.y < 90 && extras.some(e => o.x > e.x - 30 && o.x < e.x + e.w + 30);
    const objects = lv.objects.filter(o => !hit(o)).map(o => {
      const c = Object.assign({}, o);
      if (c.t === 'saw' && c.period) c.period = +(c.period / k).toFixed(4);
      delete c._gi;
      return c;
    }).concat(extras);
    objects.sort((a, b) => a.x - b.x || (a.t < b.t ? -1 : 1));
    const h = Object.assign({}, lv, {
      id: lv.id + 'h', baseId: lv.id, hard: true, tscale: k, baseCount: lv.objects.length,
      spikeScale: 0.7, sawScale: 0.85, hurtInset: 2,
      speed: lv.speed * k, bpm: lv.bpm * k, objects, extraCount: extras.length,
      name: lv.name,
    });
    hardCache[lv.id] = h;
    return h;
  };

})();
