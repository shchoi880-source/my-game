# NEON JUMP 「네온 점프」 (구 가칭 NEON DASH) — 개발 설계서 v1

원작 게임을 따라 하지 않은 **오리지널** 자동 러너. 이름·캐릭터·레벨은 모두 새로 만든다.

## 0. 게임 한 줄
캐릭터(네온 큐브)가 자동으로 오른쪽으로 달린다. **탭 = 점프, 공중에서 한 번 더 탭 = 2단 점프.**
가시·톱날·구멍에 닿으면 즉사, **0.3초 만에 처음부터 재시작**. 장애물은 음악 박자에 맞춰 배치. 난이도 극악이지만 공정하게.

## 1. 기술 규칙 (전원 필수)
- 순수 JavaScript + Canvas 2D, 빌드 도구 없음. 각 파일은 `(() => { ... })();` IIFE이고 전역은 `window.G` 하나만 쓴다.
- 스크립트 로드 순서: `core.js → audio.js → levels.js → engine.js → render.js → screens.js → main.js`
- **자기 파일만 수정**한다. 다른 사람 파일에 필요한 게 있으면 보고서에 적는다.
- 논리 해상도 **960×540 가로 화면**. 화면에 맞춰 레터박스. 세로로 들면 "가로로 돌려주세요" 안내(screens.js).
- 모바일 성능: `shadowBlur`·`ctx.filter` 금지(대신 `G.spr`의 가산 글로우 스프라이트). 프레임 내 큰 할당 피하기.
- 한국어 UI. 숫자/영문은 `G.FONT`(Kenney Future + 한글 폴백).

## 2. 소유 파일
| 담당 | 파일 |
|---|---|
| 총괄 | `index.html`, `js/core.js`, `js/main.js`, `sw.js`, `manifest.webmanifest` |
| 엔진 | `js/engine.js`, `tools/verify.js` |
| 레벨 디자인 | `js/levels.js` |
| 사운드 | `js/audio.js` |
| 연출·UI | `js/render.js`, `js/screens.js` |

## 3. core.js 가 제공하는 것 (총괄 작성, 이미 존재)
- `G.W=960, G.H=540`, `G.canvas`, `G.ctx`, `G.TAU`
- 유틸: `G.rand(a,b)`, `G.randi(a,b)`, `G.pick(arr)`, `G.clamp(v,a,b)`, `G.lerp(a,b,t)`, `G.easeOutBack(t)`, `G.easeOutCubic(t)`, `G.mulberry(seed)`(→ 0~1 난수 함수)
- 그리기: `G.rr(x,y,w,h,r)`(둥근 사각형 path), `G.circle(x,y,r)`(path), `G.text(str,x,y,size,color,{align,weight,stroke,strokeColor,maxW})`, `G.textW(str,size)`, `G.FONT`
- 글로우 스프라이트: `G.spr(name, x, y, {scale, rot, tint:'#rrggbb', add:true, alpha, w, h})` — `assets/fx.png` 파티클(흰색, 투명 배경). 사용 가능한 이름:
  `smoke_01 smoke_02 smoke_04 smoke_07 fire_01 fire_02 flame_01 flame_03 flare_01 light_01 light_02 light_03 magic_01 magic_02 magic_04 magic_05 muzzle_01 muzzle_02 muzzle_04 scorch_01 scorch_02 spark_01 spark_02 spark_04 spark_05 spark_06 star_01 star_04 star_06 star_08 circle_01 circle_02 circle_03 circle_05 slash_01 slash_03 twirl_01 twirl_02 trace_01 trace_02 dirt_01 dirt_02 symbol_01 scratch_01 window_01` (원본 128px 내외)
  - 특히 `light_01`(둥근 글로우), `flare_01`, `spark_04`, `star_04`, `circle_02`(링)이 유용
- 저장: `G.save.data`, `G.save.persist()`, `G.save.level(id)` → 레벨 기록 객체(없으면 생성)
  ```js
  G.save.data = { v:1, sfx:true, music:true, haptics:true, practiceHint:false,
    totalAttempts:0, totalJumps:0, levels:{} }
  G.save.level('lv1') = { best:0 /*0~100 정수%*/, done:false, attempts:0, coins:[false,false,false], bestTime:null /*초*/, practiceBest:0 }
  ```
- `G.vibrate(ms|pattern)` (설정 haptics 존중)

## 4. main.js (총괄 작성)
- 로딩(fx 아틀라스, 폰트, `G.audio.preload()`), 메인 루프(requestAnimationFrame, dt 최대 0.05초), 입력 라우팅.
- **장면 인터페이스** — screens.js가 `G.scenes[name] = { enter(params), update(dt), draw(ctx), down(x,y), up(x,y), key(code, isDown) }` 를 등록.
  `G.go(name, params)` 로 전환. 시작은 `G.go('title')`.
- 입력: `pointerdown` → 현재 장면 `down(x,y)`(논리 좌표), `pointerup` → `up(x,y)`, 키보드 → `key(e.code, true/false)`.
  첫 입력 때 `G.audio.init()`·`G.audio.resume()` 호출.
- 매 프레임: `ctx.setTransform` 설정 후 `scene.update(dt)` → `scene.draw(ctx)`.

## 5. audio.js (사운드)
```js
G.audio = {
  preload(): Promise,          // assets/sfx/*.ogg 미리 받기(실패해도 OK)
  init(), resume(),            // 첫 사용자 입력 때 호출됨
  sfx(name, opts?),            // 아래 이름. 설정 sfx=false면 무음
  // 'jump','djump','land','die','coin','orb','pad','nearmiss','checkpoint','complete','click','back','newbest','tick'
  music: {
    start(trackId, fromSec = 0), // 곡을 fromSec 지점부터 재생 (재시작마다 0부터)
    stop(), duck(on),            // duck: 일시정지/사망 연출 때 볼륨·필터 낮춤
    time(),                      // 곡 시작 후 경과 초 (오디오 시계 기준, 재생 중 아니면 마지막 값)
    beat(),                      // { beat: 실수 박 번호, phase: 0~1 박 안 위치, bar: 정수 } — 연출 맥동용
    setLayer(n),                 // 0~3 강도(진행률/콤보에 따라 레이어 추가)
    playing(): boolean,
  },
  TRACKS: { menu:{bpm:100}, lv1:{bpm:120}, lv2:{bpm:128}, lv3:{bpm:136}, lv4:{bpm:146}, lv5:{bpm:160} },
}
```
- 음악은 **WebAudio 절차적 생성**(오실레이터·노이즈·필터, 룩어헤드 스케줄러). 레벨마다 다른 곡(조성·리듬·음색). 일렉트로닉/신스웨이브 느낌, 반복이 지겹지 않게 8~16마디 진행 + 변주.
- 재시작 때 `start(id, 0)`이 즉시(지연 없이) 첫 박부터 시작해야 함. 박 0 = 레벨 시작 순간.
- 사용 가능한 효과음 파일(`assets/sfx/이름.ogg`): `back bigboom book chop click coin confirm door draw equip error explode fire gold hit hurt kill laser latch open page potion shield slash slash2 step`. 어울리는 것만 쓰고 나머지는 합성. ogg 디코드 실패(일부 iOS) 시 합성음으로 대체.

## 6. levels.js (레벨 디자인)
`G.LEVELS = [ level, ... ]` 5개, 쉬움→극악.
```js
{
  id:'lv1', name:'첫 박자', track:'lv1', bpm:120, speed:380,     // speed: px/s
  theme:{ bg:'#0b0f2a', bg2:'#1b0f3a', accent:'#29f0ff', accent2:'#ff3df2', ground:'#121a44' },
  length: 23000,               // 결승선 x (px)
  objects:[
    {t:'block', x, y, w, h},   // 단단한 블록. y=아랫면 높이(0=바닥 위). 윗면에 착지 가능, 옆/아래에 부딪히면 사망
    {t:'spike', x, y, w:40, h:40, dir:'up'},   // 삼각 가시. up: 밑변이 y, 꼭짓점이 y+h. down: 천장형(밑변이 y+h)
    {t:'saw', x, y, r:30, ax:0, ay:0, period:2}, // 원형 톱날(중심 x,y). ax/ay 진폭으로 사인 왕복(주기 period초, 시간=런 경과)
    {t:'pad', x, y},           // 점프대(폭 40). 닿으면 높이 점프(padV) + 2단 점프 회복
    {t:'orb', x, y},           // 공중 링(반지름 26). 겹친 상태에서 탭하면 점프(orbV), 2단 점프 소모 안 함
    {t:'coin', x, y},          // 비밀 코인, 레벨당 정확히 3개 (위험한 경로에 배치)
    {t:'gap', x, w},           // 바닥 구멍 x~x+w (떨어지면 사망)
  ]
}
```
- 좌표: x 오른쪽 +, **y 위쪽 + (지면 = 0)**. 플레이어 히트박스 34×34, 시작 x=0, 시작 후 약 2초는 빈 길.
- **박자 정렬**: 1박 = `speed*60/bpm` px. 장애물의 x를 박 단위(또는 반박)에 맞춰 놓아 음악과 리듬이 맞게.
- 물리 상수(엔진과 동일, §7)로 점프 높이/거리를 계산해서 **반드시 깰 수 있게** 설계. 최종 검증은 `tools/verify.js`.
- 레벨 길이: lv1 약 45초, lv2 55초, lv3 60초, lv4 70초, lv5 80초 (length ≈ speed × 초).
- 난이도 곡선: 레벨 안에서도 구간(섹션)마다 새 요소를 소개 → 조합 → 시험. 쉬어가는 숨 구간 필수. lv5는 극악(2단 점프 타이밍 + 오브 + 움직이는 톱날 연속).
- 레벨마다 `G.LEVELS[i].sections = [{x, name}]` 로 구간 이름(예: '가시 숲')을 넣어 연출이 표시할 수 있게.

## 7. engine.js (엔진)
물리 상수 `G.PHYS` (모두 px, 초 단위):
```js
{ size:34, gravity:3000, jumpV:900, djumpV:800, padV:1250, orbV:950, maxFall:1600,
  coyote:0.07, buffer:0.1, step:1/240 }
```
- 점프 높이 ≈ 135px, 체공 0.6초 / 2단 점프 추가 ≈ 107px / 점프대 ≈ 260px.
- 규칙: 지면(바닥·블록 윗면)에서 탭 → 점프, 2단 점프 1회 충전. 공중 탭 → (오브와 겹치면 오브 점프, 아니면) 2단 점프 소모. 착지 시 회복. 코요테 타임 0.07초, 착지 직전 0.1초 안 탭은 착지 즉시 점프(버퍼).
- API:
```js
const run = G.Engine.create(level, { startX: 0 });  // 연습 모드면 체크포인트 x에서 시작
run.press();          // 탭 (입력 즉시 호출, 다음 스텝에서 처리)
run.update(dt);       // 내부적으로 1/240초 고정 스텝 반복
run.state = { x, y, vy, t, grounded, jumpsLeft, dead, done, progress /*0~1*/, coins:[bool×3], rot /*연출용 회전*/ }
run.events            // 소비자가 읽고 비우는 배열: {type, x, y, ...}
//  type: 'jump' | 'djump' | 'land' | 'orb' | 'pad' | 'coin'(i) | 'nearmiss' | 'die' | 'complete'
run.objects           // 레벨 오브젝트(런 시간 기준 톱날 현재 위치 포함: o.cx, o.cy)
G.Engine.sawPos(o, t) // 톱날 중심 계산
```
- 판정은 **공정하게**: 가시는 시각 삼각형보다 안쪽(약 70%) 판정, 톱날은 반지름 85%. 블록 윗면 착지는 아래로 떨어지는 중 + 발이 윗면 근처일 때.
- 'nearmiss': 가시/톱날을 판정 바깥 12px 이내로 스쳐 지나가면 오브젝트당 1회.
- 순수 로직(DOM 금지) → Node에서도 실행.
- `tools/verify.js`: Node로 `core.js 유틸 없이` engine.js와 levels.js를 로드(간단한 window 스텁), 각 레벨에 대해 탭 시퀀스를 탐색(BFS/빔 서치, 탭 시점 1/60초 격자)해 **완주 가능 여부, 가장 빡빡한 구간의 허용 오차(프레임 수)**를 출력. 사용법: `node tools/verify.js` (프로젝트 루트에서).

## 8. render.js + screens.js (연출·UI)
- `render.js`: 월드 그리기(`G.render.world(ctx, run, level, cam, fx)`), 파티클/이펙트 시스템(`G.fx`).
  - 배경: 테마색 그라데이션 + 패럴랙스 네온 그리드/산/별, **박자 맥동**(`G.audio.music.beat()`), 결승선, 구간 이름 표시.
  - 바닥: 네온 라인. 블록/가시/톱날/점프대/오브/코인 네온 스타일(가산 글로우).
  - 플레이어: 네온 큐브(눈 있는 얼굴), 점프 중 회전, 착지 찌그러짐, 잔상 트레일.
  - 이펙트: 점프 링, 2단 점프 별빛, 착지 먼지, 니어미스 스파크+"아슬!", 사망 시 조각 폭발+흰 섬광+화면 흔들림, 코인 획득, 클리어 불꽃놀이.
  - 카메라: 플레이어를 화면 x=280 근처, 지면 화면 y=430. 높이 차이에 따라 부드럽게 따라감.
- `screens.js`: 장면들
  - `title`: 로고 + 배경 데모(자동 달리기) + "화면을 터치해서 시작"
  - `select`: 레벨 5개 카드(이름, 난이도 별, 최고 %, 시도 횟수, 코인 3개, 잠금), 연습 모드 토글, 설정(효과음/음악/진동)
    - 다음 레벨은 이전 레벨 클리어 시 해금. 연습 모드는 해금된 레벨 모두 가능
  - `play`: 상단 진행 바 + %, "ATTEMPT 37", 일시정지 버튼(오른쪽 위, 이 영역 탭은 점프 아님)
    - 입력: 화면 탭/스페이스/↑/W/클릭 = `run.press()` (pointerdown 즉시)
    - run.events → `G.audio.sfx` + `G.fx` + `G.vibrate`
    - 사망: 0.06초 히트스톱 → 폭발 → 0.35초 후 자동 재시작(곡도 0부터). 사망 순간 "87%"와 최고기록 갱신 시 "NEW BEST!" 크게
    - 연습 모드: 바닥에 있을 때 3초마다 자동 체크포인트(다이아몬드 표시), 사망 시 마지막 체크포인트부터. 기록은 practiceBest에만
    - 클리어: 슬로모션 + 불꽃놀이 → `complete` 장면
    - 일시정지: 계속 / 처음부터 / 연습 모드 전환 / 레벨 선택
  - `complete`: 클리어 축하, 시도 횟수, 시간, 코인, 다음 레벨, **기록 카드 이미지 저장/공유**(오프스크린 캔버스 → `navigator.share` 가능하면 공유, 아니면 다운로드)
- 기록 저장: 사망/클리어 때 `G.save.level(id)` 갱신 후 `G.save.persist()`.

## 9. 품질 기준
- 첫 플레이어는 lv1에서 10~20번 죽고 깸. lv5는 수백 번.
- 죽음이 항상 "내 탓"이어야 함(보이지 않는 위험 금지, 화면 밖에서 갑자기 나타나는 톱날 금지).
- 60fps (중급 폰), 재시작 0.4초 이내.
