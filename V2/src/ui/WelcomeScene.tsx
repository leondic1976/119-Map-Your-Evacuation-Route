/**
 * 첫 화면 배경 — 구름이 흐르고 소방차가 지나가고, 가족이 안전한 곳까지 걸어간다.
 * 전부 SVG 와 CSS 움직임이라 바깥 자산이 없다. 깜박이는 빛은 넣지 않는다.
 * 움직임을 줄이도록 설정한 기기에서는 멈춘 그림으로 보인다(`app.css`).
 *
 * 그림을 앞뒤로 세운다(대장 #151). 뒤에 있는 것부터 그리므로 겹치면 앞의 것이 보인다.
 *
 *   하늘:  해 → 구름 → 새
 *   땅:    먼 언덕 → 마을(집 · 나무) → 인도(깃발 · 걸어가는 가족) → 찻길(소방차) → 앞 풀밭(풀 · 꽃)
 *
 * 멀수록 작고 연하며 손을 따라 덜 움직인다. 가족은 찻길이 아니라 인도를 걷고, 소방차는 그 앞 찻길을 지나가며
 * 가족과 깃대를 잠깐 가린다. 글과 표지와 캐릭터는 이 그림보다 앞에 있고, 글은 어떤 그림과도 겹치지 않는다 —
 * 땅 그림의 맨 위는 `HILL` 에서 46 위이고 `app.css` 의 `--scene` 이 그만큼 비운다.
 */

/** 마을 언덕 마루(viewBox 900 가운데). 땅 그림의 맨 위는 여기서 46 위인 684 다 */
const HILL = 730;
/** 인도 · 찻길 · 앞 풀밭이 시작하는 높이 */
const WALK = 760;
const ROAD = 773;
const LAWN = 825;

const Tree = ({ x, d }: { x: number; d: number }) => (
  <g transform={`translate(${x} ${HILL + 2}) scale(.5)`}>
    <g className="sc-tree" style={{ animationDelay: `${d}s` }}>
      <rect x="-6" y="-34" width="12" height="36" fill="#9a7a55" stroke="#33363b" strokeWidth="4" />
      <circle cx="0" cy="-58" r="30" fill="#7fbf6a" stroke="#33363b" strokeWidth="5" />
      <circle cx="-14" cy="-46" r="16" fill="#8fcb78" />
    </g>
  </g>
);

const House = ({ x, roof, d }: { x: number; roof: string; d: number }) => (
  <g transform={`translate(${x} ${HILL + 2}) scale(.5)`}>
    <path d="M-50 0V-52H50V0Z" fill="#fffdf6" stroke="#33363b" strokeWidth="6" strokeLinejoin="round" />
    <path d="M-60-50 0-86 60-50Z" fill={roof} stroke="#33363b" strokeWidth="6" strokeLinejoin="round" />
    <rect x="-12" y="-30" width="24" height="30" fill="#9a5b2a" stroke="#33363b" strokeWidth="4" />
    <rect className="sc-window" style={{ animationDelay: `${d}s` }} x="-40" y="-40" width="20" height="18" fill="#ffd98a" stroke="#33363b" strokeWidth="4" />
    <rect className="sc-window" style={{ animationDelay: `${d + 1.4}s` }} x="20" y="-40" width="20" height="18" fill="#ffd98a" stroke="#33363b" strokeWidth="4" />
  </g>
);

const Walker = ({ x, h, shirt, hair, d }: { x: number; h: number; shirt: string; hair: string; d: number }) => (
  <g transform={`translate(${x} 0) scale(${h})`}>
    <ellipse cx="0" cy="1" rx="15" ry="4" fill="#33363b" opacity=".16" />
    <g className="sc-bob" style={{ animationDelay: `${d}s` }}>
      <path className="sc-leg" style={{ animationDelay: `${d}s` }} d="M-6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <path className="sc-leg back" style={{ animationDelay: `${d}s` }} d="M6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <rect x="-13" y="-52" width="26" height="34" rx="11" fill={shirt} stroke="#33363b" strokeWidth="4" />
      <circle cy="-64" r="13" fill="#f6d3b0" stroke="#33363b" strokeWidth="4" />
      <path d="M-13-66A13 13 0 0 1 13-66Z" fill={hair} />
    </g>
  </g>
);

/** 앞 풀밭의 풀 한 포기. 꽃 색을 주면 꽃이 핀다 */
const Tuft = ({ x, y, d, flower }: { x: number; y: number; d: number; flower?: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <g className="sc-tuft" style={{ animationDelay: `${d}s` }}>
      <path d="M-12 0Q-13-12-18-18M-4 0Q-4-16-2-24M5 0Q7-13 14-19" fill="none" stroke="#5f9d4a" strokeWidth="4" strokeLinecap="round" />
      {flower && (
        <>
          <circle cx="-2" cy="-27" r="7" fill={flower} stroke="#33363b" strokeWidth="2.5" />
          <circle cx="-2" cy="-27" r="2.4" fill="#fffdf6" />
        </>
      )}
    </g>
  </g>
);

const CLOUD = 'M30 62C4 62-6 34 18 26 20 4 54-6 70 14 84-4 124 0 126 26 150 26 156 62 128 62Z';

/** 위쪽 띠 — 화면 위에 붙어 있어 창 크기가 바뀌어도 표지와 글에 닿지 않는다. 해가 가장 뒤, 새가 가장 앞이다 */
function Sky() {
  return (
    <div className="welcome-sky sc-sky" aria-hidden="true">
      <svg className="sky-sun" viewBox="-104 -104 208 208" focusable="false">
        <g className="sc-rays">
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} transform={`rotate(${i * 30})`} d="M0-74V-96" stroke="#f3b63f" strokeWidth="10" strokeLinecap="round" />
          ))}
        </g>
        <circle className="sc-sun" r="58" fill="#ffd98a" stroke="#33363b" strokeWidth="5" />
      </svg>
      <svg className="sky-clouds sc-cloud" viewBox="-4 -8 300 76" focusable="false">
        <path d={CLOUD} fill="#fff" stroke="#bcd8e4" strokeWidth="5" strokeLinejoin="round" />
        <path transform="translate(182 18) scale(.7)" d={CLOUD} fill="#fff" stroke="#bcd8e4" strokeWidth="7" strokeLinejoin="round" />
      </svg>
      <svg className="sky-birds" viewBox="-22 -40 128 62" focusable="false">
        {[[0, 0, 0], [46, -22, 0.2], [84, 8, 0.4]].map(([x, y, d]) => (
          <g key={`${x}`} transform={`translate(${x} ${y})`}>
            <path className="sc-wing" style={{ animationDelay: `${d}s` }} d="M-18-6Q-8-14 0 0Q8-14 18-6" fill="none" stroke="#33363b" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function WelcomeScene() {
  return (
    <>
      <Sky />
      <svg className="welcome-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        {/* 1. 먼 언덕 — 가장 뒤라 연하고 테두리가 없다 */}
        <g className="sc-back">
          <path d={`M-120 960V${HILL - 16}C40 ${HILL - 34} 210 ${HILL - 36} 380 ${HILL - 20}S700 ${HILL - 38} 900 ${HILL - 24}S1250 ${HILL - 40} 1420 ${HILL - 22}S1640 ${HILL - 30} 1720 ${HILL - 18}V960Z`} fill="#e0f0da" />
        </g>

        {/* 2. 마을 — 언덕 위의 집과 나무 */}
        <g className="sc-far">
          <path className="sc-hill" d={`M-120 960V${HILL + 2}C120 ${HILL - 6} 330 ${HILL + 6} 560 ${HILL}S1010 ${HILL + 6} 1240 ${HILL}S1560 ${HILL - 4} 1720 ${HILL + 2}V960Z`} fill="#cfe9ba" stroke="#a5cc8c" strokeWidth="4" />
          <House x={90} roof="#c98fb5" d={3.2} />
          <Tree x={170} d={0} />
          <Tree x={270} d={1.2} />
          <House x={360} roof="#e8a15c" d={0} />
          <Tree x={450} d={0.8} />
          <Tree x={640} d={0.3} />
          <House x={730} roof="#7fa3c7" d={2.4} />
          <Tree x={930} d={1.6} />
          <House x={1020} roof="#e8a15c" d={1.1} />
          <Tree x={1110} d={0.5} />
          <Tree x={1380} d={0.4} />
          <House x={1470} roof="#7fa3c7" d={1.8} />
          <Tree x={1560} d={1} />
        </g>

        {/* 3. 인도 — 마을 앞, 찻길 뒤. 안전한 곳 깃발이 서 있고 가족이 걸어온다 */}
        <g className="sc-mid">
          <path d={`M-120 960V${WALK - 6}C200 ${WALK - 12} 520 ${WALK - 4} 820 ${WALK - 2}S1380 ${WALK - 10} 1720 ${WALK - 6}V960Z`} fill="#bfe2a4" />
          <path className="sc-walk" d={`M-120 ${WALK}H1720V${ROAD}H-120Z`} fill="#f7f2e4" stroke="#b9b29c" strokeWidth="3" />
          <g className="sc-meet" transform={`translate(1262 ${ROAD - 3}) scale(.5)`}>
            <ellipse cx="2" cy="1" rx="16" ry="4" fill="#33363b" opacity=".16" />
            <path d="M0 0V-92" stroke="#33363b" strokeWidth="8" strokeLinecap="round" />
            <path className="sc-flag" d="M4-90 62-74 4-56Z" fill="#3e9d5d" stroke="#33363b" strokeWidth="5" strokeLinejoin="round" />
          </g>
          <g className="sc-family">
            <g transform={`translate(0 ${ROAD - 3})`}>
              <Walker x={0} h={0.56} shirt="#4f8fa8" hair="#2b211b" d={0} />
              <Walker x={26} h={0.45} shirt="#f59a23" hair="#4a2d2d" d={0.18} />
              <Walker x={48} h={0.4} shirt="#7b6fb0" hair="#2b211b" d={0.34} />
            </g>
          </g>
        </g>

        {/* 4. 찻길 — 인도 앞. 소방차가 지나가며 뒤의 가족과 깃대를 잠깐 가린다 */}
        <g className="sc-near">
          <path className="sc-road" d={`M-120 ${ROAD}H1720V${LAWN}H-120Z`} fill="#ece5d2" stroke="#33363b" strokeWidth="4" />
          <path className="sc-lane" d={`M-120 ${(ROAD + LAWN) / 2}H1720`} stroke="#fffdf6" strokeWidth="5" strokeDasharray="40 32" />
          <g className="sc-truck">
            <g transform={`translate(0 ${LAWN - 10}) scale(.62)`}>
              <ellipse cx="118" cy="4" rx="126" ry="7" fill="#33363b" opacity=".18" />
              <g className="sc-truck-body">
                <rect x="0" y="-92" width="166" height="74" rx="8" fill="#d6402f" stroke="#33363b" strokeWidth="5" />
                <path d="M166-18V-76H204L236-44V-18Z" fill="#d6402f" stroke="#33363b" strokeWidth="5" strokeLinejoin="round" />
                <path d="M178-68H200L222-46H178Z" fill="#c6e8f8" stroke="#33363b" strokeWidth="4" strokeLinejoin="round" />
                <path d="M6-104H152M6-112H152M22-112V-104M52-112V-104M82-112V-104M112-112V-104M142-112V-104" stroke="#33363b" strokeWidth="4" strokeLinecap="round" />
                <path d="M12-92V-104M146-92V-104" stroke="#33363b" strokeWidth="5" />
                <rect x="176" y="-88" width="26" height="11" rx="5" fill="#ffd98a" stroke="#33363b" strokeWidth="3" />
                <rect x="0" y="-44" width="166" height="10" fill="#fffdf6" />
                <text className="sc-119" x="82" y="-54">119</text>
              </g>
              {[42, 192].map((x) => (
                <g key={x} transform={`translate(${x} -16)`}>
                  <g className="sc-wheel">
                    <circle r="20" fill="#33363b" />
                    <circle r="9" fill="#fffdf6" />
                    <path d="M0-9V9M-9 0H9" stroke="#33363b" strokeWidth="3" />
                  </g>
                </g>
              ))}
            </g>
          </g>
        </g>

        {/* 5. 앞 풀밭 — 가장 앞. 풀과 꽃은 아래 문구가 놓이는 가운데를 비우고 양쪽에만 있다 */}
        <g className="sc-front">
          <path d={`M-120 960V${LAWN}H1720V960Z`} fill="#b4dc96" stroke="#8fbe72" strokeWidth="4" />
          <g className="sc-tufts">
            <Tuft x={70} y={872} d={0} flower="#f59a23" />
            <Tuft x={150} y={858} d={0.6} />
            <Tuft x={236} y={878} d={1.1} flower="#d9558c" />
            <Tuft x={318} y={862} d={0.3} />
            <Tuft x={1290} y={864} d={0.8} />
            <Tuft x={1372} y={878} d={0.2} flower="#e3a62a" />
            <Tuft x={1456} y={860} d={1.3} />
            <Tuft x={1534} y={874} d={0.5} flower="#8a5fc4" />
          </g>
        </g>
      </svg>
    </>
  );
}
