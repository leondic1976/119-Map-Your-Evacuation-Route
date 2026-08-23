/**
 * UI 아이콘 — 전부 벡터 자체 제작.
 * 이모지를 쓰지 않는다(인쇄 품질·기관 표기 일관성).
 */
import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

function Svg({ size = 18, children, className }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconSelect = (p: Props) => (
  <Svg {...p}>
    <path d="M5 3l6.5 16 2.3-6.6 6.7-2.4z" />
  </Svg>
);

/** 자유 그리기 — 삐뚤빼뚤한 선이 반듯해진다 */
export const IconSketch = (p: Props) => (
  <Svg {...p}>
    <path d="M3 8.5c1.6-2 3.2 1.6 4.8-.4S11 5.4 12.6 7s3.2-2.2 4.8-.6" />
    <path d="M3 15.5h18" />
    <path d="M18.4 13.2l2.6 2.3-2.6 2.3" />
  </Svg>
);

export const IconRoom = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="1" />
    <path d="M3 12h9M12 4.5v15" />
  </Svg>
);

export const IconDoor = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h5M20 20h-5" />
    <path d="M9 20V6a1 1 0 0 1 1.2-1l4 -1A1 1 0 0 1 15.4 5v15" />
    <path d="M13 12.6v1.4" />
  </Svg>
);

export const IconWindow = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="6" width="17" height="12" rx="1" />
    <path d="M3.5 12h17M12 6v12" />
  </Svg>
);

export const IconFacility = (p: Props) => (
  <Svg {...p}>
    <path d="M10 3h4v2.2h-4z" />
    <path d="M8.5 5.2h7A1.5 1.5 0 0 1 17 6.7V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6.7a1.5 1.5 0 0 1 1.5-1.5z" />
    <path d="M7 10h10" />
  </Svg>
);

export const IconRoute = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20V9a2 2 0 0 1 2-2h7" strokeDasharray="3 2.5" />
    <path d="M13 7l-3-3M13 7l-3 3" />
    <circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconText = (p: Props) => (
  <Svg {...p}>
    <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />
  </Svg>
);

export const IconRuler = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="8.5" width="19" height="7" rx="1" transform="rotate(-12 12 12)" />
    <path d="M7 9.4v2.4M11 8.6v3.2M15 7.8v2.4M19 7v3.2" />
  </Svg>
);

export const IconHand = (p: Props) => (
  <Svg {...p}>
    <path d="M8 12V5.6a1.3 1.3 0 0 1 2.6 0V11M10.6 11V4.4a1.3 1.3 0 0 1 2.6 0V11M13.2 11V5.6a1.3 1.3 0 0 1 2.6 0V13M15.8 9.4a1.3 1.3 0 0 1 2.6 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.4-3.3a1.3 1.3 0 0 1 2-1.6L8 15.4" />
  </Svg>
);

export const IconUndo = (p: Props) => (
  <Svg {...p}>
    <path d="M4 8h9a5.5 5.5 0 0 1 0 11H8" />
    <path d="M7.5 4.5L4 8l3.5 3.5" />
  </Svg>
);

export const IconRedo = (p: Props) => (
  <Svg {...p}>
    <path d="M20 8h-9a5.5 5.5 0 0 0 0 11h5" />
    <path d="M16.5 4.5L20 8l-3.5 3.5" />
  </Svg>
);

export const IconPrint = (p: Props) => (
  <Svg {...p}>
    <path d="M7 9V3.5h10V9" />
    <rect x="3.5" y="9" width="17" height="7.5" rx="1.2" />
    <rect x="7" y="14" width="10" height="6.5" rx="0.8" />
    <path d="M17.2 11.6h.8" />
  </Svg>
);

export const IconSave = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 4.5h11L20 9v10.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 .5-1z" />
    <path d="M8 4.5v5h7v-5M8 20v-6h8v6" />
  </Svg>
);

export const IconOpen = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 19V6a1 1 0 0 1 1-1h5l2 2.4h7.5a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
  </Svg>
);

export const IconImage = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.6-4.4 3.2 3 3-2.6 4.2 4" />
  </Svg>
);

export const IconEye = (p: Props) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const IconPlus = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconFit = (p: Props) => (
  <Svg {...p}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </Svg>
);

export const IconCheck = (p: Props) => (
  <Svg {...p} >
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
);

export const IconPlay = (p: Props) => (
  <Svg {...p}>
    <path d="M7 4.8l12 7.2-12 7.2z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPause = (p: Props) => (
  <Svg {...p}>
    <path d="M8 5h2.6v14H8zM13.4 5H16v14h-2.6z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconTrash = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13" />
    <path d="M10 10.5v6M14 10.5v6" />
  </Svg>
);

export const IconWarn = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5l9.2 16H2.8z" />
    <path d="M12 9.5v4.4M12 16.6v.6" />
  </Svg>
);

export const IconDownload = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5v11.5M7.8 11l4.2 4 4.2-4M4.5 19.5h15" />
  </Svg>
);

export const IconRefresh = (p: Props) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 0-1.6 5.6" />
    <path d="M20.5 5v5h-5" />
  </Svg>
);

export const IconClose = (p: Props) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconInfo = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 11v5.5M12 7.8v.6" />
  </Svg>
);

export const IconFire = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.2s5.4 4 5.4 9.1a5.4 5.4 0 0 1-10.8 0c0-2 1-3.4 1-3.4s.6 1.6 1.8 1.6c1.6 0 1.4-3.2 2.6-7.3z" />
  </Svg>
);

export const IconShield = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.4l7.5 2.8v5.4c0 4.4-3 7.6-7.5 9.2-4.5-1.6-7.5-4.8-7.5-9.2V6.2z" />
    <path d="M9 12.2l2.2 2.2 4-4.4" />
  </Svg>
);

export const IconGrid = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    <path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
  </Svg>
);

/** 뒤로 가기 */
export const IconBack = (p: Props) => (
  <Svg {...p}>
    <path d="M20 12H5" />
    <path d="M11 5.5L4.5 12l6.5 6.5" />
  </Svg>
);

export const IconChevron = (p: Props) => (
  <Svg {...p}>
    <path d="M9 5.5l6.5 6.5L9 18.5" />
  </Svg>
);
