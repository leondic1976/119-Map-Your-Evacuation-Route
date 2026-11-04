/**
 * 첫 화면 배경 — 구름이 흐르고 소방차가 지나가고, 가족이 만나는 곳까지 걸어간다.
 * 전부 SVG 와 CSS 움직임이라 바깥 자산이 없다. 깜박이는 빛은 넣지 않는다.
 * 움직임을 줄이도록 설정한 기기에서는 멈춘 그림으로 보인다(`app.css`).
 */
const Cloud = ({ x, y, s, cls }: { x: number; y: number; s: number; cls: string }) => (
  <g className={`sc-cloud ${cls}`}>
    <path transform={`translate(${x} ${y}) scale(${s})`} d="M30 62C4 62-6 34 18 26 20 4 54-6 70 14 84-4 124 0 126 26 150 26 156 62 128 62Z" fill="#fff" stroke="#bcd8e4" strokeWidth="4" strokeLinejoin="round" />
  </g>
);

const Tree = ({ x, y, s, d }: { x: number; y: number; s: number; d: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g className="sc-tree" style={{ animationDelay: `${d}s` }}>
      <rect x="-6" y="-34" width="12" height="36" fill="#9a7a55" stroke="#33363b" strokeWidth="3" />
      <circle cx="0" cy="-58" r="32" fill="#7fbf6a" stroke="#33363b" strokeWidth="3.5" />
      <circle cx="-16" cy="-44" r="18" fill="#8fcb78" />
    </g>
  </g>
);

const House = ({ x, y, s, roof, d }: { x: number; y: number; s: number; roof: string; d: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-50 0V-52H50V0Z" fill="#fffdf6" stroke="#33363b" strokeWidth="4" strokeLinejoin="round" />
    <path d="M-62-50 0-92 62-50Z" fill={roof} stroke="#33363b" strokeWidth="4" strokeLinejoin="round" />
    <rect x="-12" y="-30" width="24" height="30" fill="#9a5b2a" stroke="#33363b" strokeWidth="3" />
    <rect className="sc-window" style={{ animationDelay: `${d}s` }} x="-40" y="-40" width="20" height="18" fill="#ffd98a" stroke="#33363b" strokeWidth="3" />
    <rect className="sc-window" style={{ animationDelay: `${d + 1.4}s` }} x="20" y="-40" width="20" height="18" fill="#ffd98a" stroke="#33363b" strokeWidth="3" />
  </g>
);

const Walker = ({ x, h, shirt, hair, d }: { x: number; h: number; shirt: string; hair: string; d: number }) => (
  <g transform={`translate(${x} 0) scale(${h})`}>
    <g className="sc-bob" style={{ animationDelay: `${d}s` }}>
      <path className="sc-leg" style={{ animationDelay: `${d}s` }} d="M-6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <path className="sc-leg back" style={{ animationDelay: `${d}s` }} d="M6-22V0" stroke="#37455a" strokeWidth="8" strokeLinecap="round" />
      <rect x="-13" y="-52" width="26" height="34" rx="11" fill={shirt} stroke="#33363b" strokeWidth="3" />
      <circle cy="-66" r="14" fill="#f6d3b0" stroke="#33363b" strokeWidth="3" />
      <path d="M-14-68A14 14 0 0 1 14-68Z" fill={hair} />
    </g>
  </g>
);

export function WelcomeScene() {
  return (
    <svg className="welcome-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <g className="sc-sky">
        <g transform="translate(730 112)">
          <g className="sc-rays">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} transform={`rotate(${i * 30})`} d="M0-74V-98" stroke="#f3b63f" strokeWidth="9" strokeLinecap="round" />
            ))}
          </g>
          <circle className="sc-sun" r="58" fill="#ffd98a" stroke="#33363b" strokeWidth="4" />
        </g>
        {[[150, 80], [430, 210], [905, 60], [1120, 40], [1490, 110], [320, 44], [1010, 150], [1560, 40]].map(([x, y], i) => (
          <circle key={i} className="sc-dot" style={{ animationDelay: `${i * 0.55}s` }} cx={x} cy={y} r="6" fill="#ffffff" stroke="#9cc4d6" strokeWidth="3" />
        ))}
      </g>

      <Cloud x={0} y={70} s={1.15} cls="c1" />
      <Cloud x={0} y={190} s={0.8} cls="c2" />
      <Cloud x={0} y={28} s={0.65} cls="c3" />
      <Cloud x={0} y={280} s={1} cls="c4" />

      <g className="sc-birds">
        {[[0, 0, 0], [46, -22, 0.2], [84, 8, 0.4]].map(([x, y, d]) => (
          <g key={`${x}`} transform={`translate(${x} ${y})`}>
            <path className="sc-wing" style={{ animationDelay: `${d}s` }} d="M-18-6Q-8-14 0 0Q8-14 18-6" fill="none" stroke="#33363b" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
      </g>

      <g className="sc-far">
        <path d="M-120 900V712C120 640 330 660 560 706S1010 760 1240 690 1560 650 1720 700V900Z" fill="#cfe9ba" stroke="#a5cc8c" strokeWidth="4" />
        <House x={560} y={720} s={0.72} roof="#e8a15c" d={0} />
        <House x={1560} y={694} s={0.8} roof="#7fa3c7" d={1.8} />
        <House x={60} y={724} s={0.6} roof="#c98fb5" d={3.2} />
        <Tree x={110} y={704} s={0.9} d={0} />
        <Tree x={450} y={722} s={0.8} d={0.8} />
        <Tree x={1110} y={726} s={0.85} d={1.6} />
        <Tree x={1400} y={696} s={0.7} d={0.4} />
      </g>

      <g className="sc-near">
        <g transform="translate(0 -22)">
        <path d="M-120 960V786C200 746 520 776 820 790S1380 762 1720 780V960Z" fill="#b4dc96" stroke="#8fbe72" strokeWidth="4" />
        <path d="M-120 806H1720V872H-120Z" fill="#ece5d2" stroke="#33363b" strokeWidth="4" />
        <path className="sc-lane" d="M-120 840H1720" stroke="#fffdf6" strokeWidth="6" strokeDasharray="44 36" />

        {/* 만나는 곳 */}
        <g transform="translate(1440 824)">
          <path d="M0 0V-92" stroke="#33363b" strokeWidth="6" strokeLinecap="round" />
          <path className="sc-flag" d="M3-90 62-74 3-56Z" fill="#3e9d5d" stroke="#33363b" strokeWidth="3.5" strokeLinejoin="round" />
        </g>

        {/* 만나는 곳까지 걸어가는 가족 */}
        <g className="sc-family">
          <g transform="translate(0 830)">
            <Walker x={0} h={1.2} shirt="#4f8fa8" hair="#2b211b" d={0} />
            <Walker x={50} h={0.92} shirt="#f59a23" hair="#4a2d2d" d={0.18} />
            <Walker x={92} h={0.82} shirt="#7b6fb0" hair="#2b211b" d={0.34} />
          </g>
        </g>

        {/* 지나가는 소방차 */}
        <g className="sc-truck">
          <g transform="translate(260 855) scale(.8)">
            <g className="sc-truck-body">
              <rect x="0" y="-92" width="166" height="74" rx="8" fill="#d6402f" stroke="#33363b" strokeWidth="4" />
              <path d="M166-18V-76H204L236-44V-18Z" fill="#d6402f" stroke="#33363b" strokeWidth="4" strokeLinejoin="round" />
              <path d="M178-68H200L222-46H178Z" fill="#c6e8f8" stroke="#33363b" strokeWidth="3.5" strokeLinejoin="round" />
              <path d="M6-104H152M6-114H152M22-114V-104M52-114V-104M82-114V-104M112-114V-104M142-114V-104" stroke="#33363b" strokeWidth="4" strokeLinecap="round" />
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
      </g>
    </svg>
  );
}
