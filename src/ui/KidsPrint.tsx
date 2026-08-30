'use client';

/**
 * A4 세로 한 장 — docs/DESIGN-v1.1-changes.md §6.8.
 *
 *   머리  → 메인 지도(주 경로 실선 + 보조 경로 파선)
 *   → [못 나갈 때 미니맵 | 우리 가족 약속 체크리스트]
 *   → 손글씨 칸 · 119 → 가족과 함께 확인할 것
 *
 * 시트 전체를 SVG 하나로 만든다. 그래야 PNG 로 그대로 바꿀 수 있고(FR-6.4),
 * 편집기와 같은 PlanSvg 를 그대로 끼워 넣을 수 있다.
 * 흑백 인쇄에서도 읽히도록 방은 해칭, 경로는 색+선종류+번호로 그린다 (P4).
 */
import React from 'react';
import { RULE_MESSAGES, cardById } from '../content';
import { useKids } from '../store/kidsStore';
import { PlanSvg, SLOT_STYLE } from './PlanSvg';

/** 300dpi A4 */
export const SHEET_W = 2480;
export const SHEET_H = 3508;

const M = 120;
const INK = '#111';
const FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

const PROMISES = ['문을 닫고 나가기', '낮은 자세로 이동하기', '엘리베이터 안 타기', '만나는 곳으로 모이기'];

interface Props {
  svgRef?: React.Ref<SVGSVGElement>;
  /** 화면 미리보기에서 흑백으로 확인할 때 */
  grayscale?: boolean;
}

export default function KidsPrint({ svgRef, grayscale }: Props) {
  const plan = useKids((s) => s.plan);
  const routes = useKids((s) => s.routes);
  const hazardId = useKids((s) => s.hazardId);
  const profile = useKids((s) => s.profile);
  const missions = useKids((s) => s.missions);
  const pair = routes[hazardId] ?? {};
  const todo = missions
    .filter((m) => !m.done)
    .map((m) => RULE_MESSAGES.guardianMissions[m.id]?.ask ?? cardById(m.id)?.title ?? m.id);
  const checks = todo.length
    ? todo
    : ['소화기는 어디에 있나요?', '가스 중간밸브는 어디에 있나요?', '경량칸막이·대피공간·하향식 피난구 가운데 무엇이 있나요?'];

  const mainY = M + 330;
  const mainH = 1360;
  const midY = mainY + mainH + 110;
  const midH = 640;
  const halfW = (SHEET_W - M * 2 - 40) / 2;
  const writeY = midY + midH + 120;
  const footY = writeY + 470;

  return (
    <svg
      ref={svgRef}
      className="k-sheet"
      viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: FONT, filter: grayscale ? 'grayscale(1)' : undefined, display: 'block', background: '#fff' }}
      role="img"
      aria-label="우리집 대피 지도 A4"
    >
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill="#fff" />

      {/* 머리 */}
      <text x={M} y={M + 110} fontSize={96} fontWeight={800} fill={INK}>
        우리집 대피 지도
      </text>
      <text x={M} y={M + 180} fontSize={36} fill="#444">
        불이 났을 때 우리 가족이 가는 길
      </text>
      <g transform={`translate(${SHEET_W - M - 300} ${M + 40})`}>
        <rect width={300} height={120} rx={10} fill="none" stroke="#888" strokeWidth={3} strokeDasharray="12 8" />
        <text x={150} y={72} textAnchor="middle" fontSize={30} fill="#888">
          소방청 로고 자리
        </text>
      </g>
      <line x1={M} y1={M + 220} x2={SHEET_W - M} y2={M + 220} stroke={INK} strokeWidth={4} />

      {/* 메인 — 주 경로 + 보조 경로 */}
      <text x={M} y={M + 300} fontSize={44} fontWeight={700} fill={INK}>
        {SLOT_STYLE.primary.no}. {SLOT_STYLE.primary.label}
        {pair.alternate ? `   ${SLOT_STYLE.alternate.no}. ${SLOT_STYLE.alternate.label} (파선)` : ''}
      </text>
      <rect x={M} y={mainY} width={SHEET_W - M * 2} height={mainH} fill="none" stroke="#999" strokeWidth={2} />
      <PlanSvg
        plan={plan}
        routePair={pair}
        showSlots={['primary', 'alternate']}
        style="blueprint"
        gradeMode={profile.gradeMode}
        printMode
        showGrid={false}
        frame={{ x: M + 10, y: mainY + 10, width: SHEET_W - M * 2 - 20, height: mainH - 20 }}
      />

      {/* 가운데 왼쪽 — 못 나갈 때 */}
      <text x={M} y={midY - 20} fontSize={36} fontWeight={700} fill={INK}>
        현관으로 못 나갈 때
      </text>
      <rect x={M} y={midY} width={halfW} height={midH} fill="none" stroke="#999" strokeWidth={2} />
      {pair.alternate ? (
        <PlanSvg
          plan={plan}
          routePair={pair}
          showSlots={['alternate']}
          style="blueprint"
          gradeMode={profile.gradeMode}
          printMode
          showGrid={false}
          frame={{ x: M + 8, y: midY + 8, width: halfW - 16, height: midH - 90 }}
        />
      ) : (
        <text x={M + halfW / 2} y={midY + midH / 2} textAnchor="middle" fontSize={34} fill="#666">
          못 나갈 때 갈 곳을 아직 안 정했어요
        </text>
      )}
      <text x={M + 20} y={midY + midH - 30} fontSize={28} fill="#333">
        억지로 나가지 않는다 · 대피공간·경량칸막이로 · 없으면 욕실에서 물 틀고 구조 요청
      </text>

      {/* 가운데 오른쪽 — 우리 가족 약속 */}
      <text x={M + halfW + 40} y={midY - 20} fontSize={36} fontWeight={700} fill={INK}>
        우리 가족 약속
      </text>
      <rect x={M + halfW + 40} y={midY} width={halfW} height={midH} fill="none" stroke="#999" strokeWidth={2} />
      {PROMISES.map((p, i) => (
        <g key={p} transform={`translate(${M + halfW + 90} ${midY + 110 + i * 125})`}>
          <rect x={0} y={-44} width={56} height={56} rx={8} fill="none" stroke={INK} strokeWidth={4} />
          <text x={84} y={0} fontSize={40} fill="#222">
            {p}
          </text>
        </g>
      ))}

      {/* 선 구분표 — 색이 없어도 읽힌다 */}
      <g transform={`translate(${M} ${writeY - 70})`}>
        {(['primary', 'alternate'] as const).map((k, i) => {
          const s = SLOT_STYLE[k];
          return (
            <g key={k} transform={`translate(${i * 700} 0)`}>
              <line x1={0} y1={0} x2={140} y2={0} stroke={s.color} strokeWidth={8} strokeDasharray={s.dash || undefined} strokeLinecap="round" />
              <circle cx={0} cy={0} r={24} fill="#fff" stroke={s.color} strokeWidth={5} />
              <text x={0} y={10} textAnchor="middle" fontSize={28} fontWeight={800} fill={s.ink}>
                {s.no}
              </text>
              <text x={160} y={10} fontSize={30} fill={INK}>
                {s.short}
              </text>
            </g>
          );
        })}
      </g>

      {/* 손글씨 칸 — 개인정보는 앱에 저장하지 않는다 (CON-8) */}
      <line x1={M} y1={writeY} x2={SHEET_W - M} y2={writeY} stroke={INK} strokeWidth={3} />
      <text x={M} y={writeY + 90} fontSize={40} fontWeight={700} fill={INK}>
        우리 가족 만나는 곳
      </text>
      <line x1={M + 460} y1={writeY + 100} x2={SHEET_W - M} y2={writeY + 100} stroke="#666" strokeWidth={3} />
      <text x={M} y={writeY + 210} fontSize={40} fontWeight={700} fill={INK}>
        보호자 연락처
      </text>
      <line x1={M + 460} y1={writeY + 220} x2={SHEET_W - M} y2={writeY + 220} stroke="#666" strokeWidth={3} />
      <g transform={`translate(${M} ${writeY + 300})`}>
        <rect width={SHEET_W - M * 2} height={110} rx={16} fill="#111" />
        <text x={(SHEET_W - M * 2) / 2} y={74} textAnchor="middle" fontSize={54} fontWeight={800} fill="#fff">
          불이 나면 · 다치면 · 갇히면 — 119
        </text>
      </g>

      {/* 가족과 함께 확인할 것 */}
      <line x1={M} y1={footY} x2={SHEET_W - M} y2={footY} stroke={INK} strokeWidth={3} />
      <text x={M} y={footY + 70} fontSize={38} fontWeight={700} fill={INK}>
        가족과 함께 확인할 것
      </text>
      {checks.slice(0, 3).map((c, i) => (
        <g key={i} transform={`translate(${M} ${footY + 130 + i * 62})`}>
          <rect x={0} y={-30} width={38} height={38} rx={6} fill="none" stroke={INK} strokeWidth={3} />
          <text x={60} y={0} fontSize={30} fill="#222">
            {c}
          </text>
        </g>
      ))}
      <text x={SHEET_W - M} y={SHEET_H - 60} textAnchor="end" fontSize={24} fill="#777">
        이 지도는 교육용이다. 실제 상황에서는 어른의 안내와 119 의 지시를 따른다.
      </text>
    </svg>
  );
}
