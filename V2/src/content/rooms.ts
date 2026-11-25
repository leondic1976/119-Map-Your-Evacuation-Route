/**
 * 방 넣기의 처음 크기(대장 #175) — 처음 네모로 센 [가로, 세로]다. 크레용(`names.ts`)마다 하나씩 있다.
 * 놓은 뒤에 키우고 줄이므로 흔한 집의 어림값이면 된다.
 */
export const ROOM_SIZE: Record<string, readonly [number, number]> = {
  room: [3, 2],
  myroom: [3, 2],
  main: [3, 3],
  other: [3, 2],
  kitchen: [3, 2],
  bath: [2, 2],
  utility: [2, 1],
  veranda: [4, 1],
  refuge: [2, 1],
  pass: [3, 1],
  living: [4, 3],
  entry: [2, 1],
  stairs: [2, 2],
  hall: [4, 1],
  vestibule: [2, 1],
};

export const roomBaseSize = (id: string): readonly [number, number] => ROOM_SIZE[id] ?? [3, 2];

/** 트인 쪽을 고를 수 있는 방 — 부엌은 문 없이 거실과 이어진 집이 많다(대장 #176) */
export const canOpenSide = (id: string): boolean => id === 'kitchen';
