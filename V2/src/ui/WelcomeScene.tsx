/**
 * 첫 화면 배경 — 구름이 흐르고 소방차가 지나가고, 가족이 만나는 곳까지 걸어간다.
 * 전부 SVG 와 CSS 움직임이라 바깥 자산이 없다. 깜박이는 빛은 넣지 않는다.
 * 움직임을 줄이도록 설정한 기기에서는 멈춘 그림으로 보인다(`app.css`).
 *
 * 자리를 둘로 나눈다(대장 #136). 하늘 것(해·새·구름)은 위쪽 띠에, 땅 것(집·나무·길)은 아래쪽 띠에만 있고
 * 가운데는 글과 표지와 캐릭터의 자리다. 아래쪽 띠의 높이는 `HILL` 이 정하고 `app.css` 가 그만큼 비운다.
 * 띠 안에서도 서로 겹치지 않는다 — 집·나무·깃발은 언덕 위, 소방차와 가족은 그 아래 길에 있고,
 * 소방차가 다 지나간 뒤에 가족이 걷는다.
 */

/** 언덕 마루(viewBox 900 가운데). 땅 것의 맨 위는 여기서 46 위인 684 이고, `app.css` 의 `--scene`(216)이 그만큼 비운다 */
const HILL = 730;

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
    <g className="sc-bob" style={{ animationDelay: `${d}s` }}>
      <path className="sc-leg" style={{ animationDelay: `${d}s` }} d="M-6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <path className="sc-leg back" style={{ animationDelay: `${d}s` }} d="M6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <rect x="-13" y="-52" width="26" height="34" rx="11" fill={shirt} stroke="#33363b" strokeWidth="4" />
      <circle cy="-64" r="13" fill="#f6d3b0" stroke="#33363b" strokeWidth="4" />
      <path d="M-13-66A13 13 0 0 1 13-66Z" fill={hair} />
    </g>
  </g>
);

const CLOUD = 'M30 62C4 62-6 34 18 26 20 4 54-6 70 14 84-4 124 0 126 26 150 26 156 62 128 62Z';

/** 위쪽 띠 — 화면 위에 붙어 있어 창 크기가 바뀌어도 표지와 글에 닿지 않는다 */
function Sky() {
  return (
    <div className="welcome-sky sc-sky" aria-hidden="true">
      <svg className="sky-birds" viewBox="-22 -40 128 62" focusable="false">
        {[[0, 0, 0], [46, -22, 0.2], [84, 8, 0.4]].map(([x, y, d]) => (
          <g key={`${x}`} transform={`translate(${x} ${y})`}>
            <path className="sc-wing" style={{ animationDelay: `${d}s` }} d="M-18-6Q-8-14 0 0Q8-14 18-6" fill="none" stroke="#33363b" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
      </svg>
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
    </div>
  );
}

export function WelcomeScene() {
  return (
    <>
      <Sky />
      <svg className="welcome-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <g className="sc-far">
          <path d={`M-120 960V${HILL + 2}C120 ${HILL - 6} 330 ${HILL + 6} 560 ${HILL}S1010 ${HILL + 6} 1240 ${HILL}S1560 ${HILL - 4} 1720 ${HILL + 2}V960Z`} fill="#cfe9ba" stroke="#a5cc8c" strokeWidth="4" />
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

        <g className="sc-near">
          <path d="M-120 960V756C200 748 520 758 820 760S1380 750 1720 756V960Z" fill="#b4dc96" stroke="#8fbe72" strokeWidth="4" />
          <path className="sc-road" d="M-120 768H1720V822H-120Z" fill="#ece5d2" stroke="#33363b" strokeWidth="4" />
          <path className="sc-lane" d="M-120 795H1720" stroke="#fffdf6" strokeWidth="5" strokeDasharray="40 32" />

          {/* 만나는 곳 — 언덕 위에 서 있어 소방차가 지나가도 닿지 않는다 */}
          <g className="sc-meet" transform={`translate(1262 ${HILL + 4}) scale(.5)`}>
            <path d="M0 0V-92" stroke="#33363b" strokeWidth="8" strokeLinecap="round" />
            <path className="sc-flag" d="M4-90 62-74 4-56Z" fill="#3e9d5d" stroke="#33363b" strokeWidth="5" strokeLinejoin="round" />
          </g>

          {/* 소방차가 다 지나간 뒤에, 만나는 곳까지 걸어가는 가족 */}
          <g className="sc-family">
            <g transform="translate(0 797)">
              <Walker x={0} h={0.66} shirt="#4f8fa8" hair="#2b211b" d={0} />
              <Walker x={30} h={0.52} shirt="#f59a23" hair="#4a2d2d" d={0.18} />
              <Walker x={56} h={0.46} shirt="#7b6fb0" hair="#2b211b" d={0.34} />
            </g>
          </g>

          {/* 지나가는 소방차 */}
          <g className="sc-truck">
            <g transform="translate(0 811) scale(.62)">
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
      </svg>
    </>
  );
}
