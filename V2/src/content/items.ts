/**
 * 놓을 수 있는 가구와 장비. 놓지 않아도 된다. 크기는 처음 네모 한 칸을 1 로 잰다.
 * `parts` 는 3D 모양이고 [폭, 높이, 깊이, 색, x, y, z] 이다. 등이 -z 이고 가운데가 원점이다.
 */
import type { ItemKind } from '../core/types';

export interface ItemSpec {
  id: ItemKind;
  label: string;
  w: number;
  d: number;
  /** 지도에 그리는 색 */
  color: string;
  parts: [number, number, number, number, number, number, number][];
}

export interface ItemGroup {
  label: string;
  items: ItemKind[];
}

export const ITEMS: Record<ItemKind, ItemSpec> = {
  bed: { id: 'bed', label: '침대', w: 0.62, d: 0.9, color: '#f4f0e4', parts: [[0.62, 0.2, 0.85, 0xf4f0e4, 0, 0.12, 0.025], [0.62, 0.1, 0.34, 0x8cb7d9, 0, 0.26, -0.195], [0.62, 0.3, 0.05, 0x9a7a55, 0, 0.17, -0.425]] },
  desk: { id: 'desk', label: '책상', w: 0.7, d: 0.4, color: '#c79a6b', parts: [[0.7, 0.05, 0.4, 0xc79a6b, 0, 0.3, 0], [0.05, 0.28, 0.36, 0x9a7a55, -0.3, 0.14, 0], [0.05, 0.28, 0.36, 0x9a7a55, 0.3, 0.14, 0]] },
  closet: { id: 'closet', label: '옷장', w: 0.8, d: 0.3, color: '#b98a5e', parts: [[0.8, 0.62, 0.3, 0xb98a5e, 0, 0.31, 0]] },
  sofa: { id: 'sofa', label: '소파', w: 0.85, d: 0.38, color: '#7fa3c7', parts: [[0.85, 0.22, 0.34, 0x7fa3c7, 0, 0.11, 0.02], [0.85, 0.34, 0.1, 0x6f93b6, 0, 0.17, -0.14]] },
  table: { id: 'table', label: '탁자', w: 0.5, d: 0.32, color: '#b98a5e', parts: [[0.5, 0.14, 0.32, 0xb98a5e, 0, 0.07, 0]] },
  tv: { id: 'tv', label: 'TV', w: 0.7, d: 0.14, color: '#33363b', parts: [[0.7, 0.1, 0.14, 0x9a7a55, 0, 0.05, 0], [0.62, 0.34, 0.03, 0x33363b, 0, 0.27, 0]] },
  dining: { id: 'dining', label: '식탁', w: 0.7, d: 0.55, color: '#b98a5e', parts: [[0.7, 0.05, 0.55, 0xb98a5e, 0, 0.28, 0], [0.06, 0.26, 0.45, 0x9a7a55, 0, 0.13, 0]] },
  fridge: { id: 'fridge', label: '냉장고', w: 0.36, d: 0.36, color: '#dfe6ea', parts: [[0.36, 0.64, 0.36, 0xdfe6ea, 0, 0.32, 0]] },
  sink: { id: 'sink', label: '싱크대', w: 0.85, d: 0.32, color: '#e8e2d0', parts: [[0.85, 0.42, 0.32, 0xe8e2d0, 0, 0.21, 0]] },
  toilet: { id: 'toilet', label: '변기', w: 0.28, d: 0.42, color: '#ffffff', parts: [[0.26, 0.2, 0.3, 0xffffff, 0, 0.1, 0.06], [0.28, 0.34, 0.12, 0xf1f1f1, 0, 0.17, -0.15]] },
  basin: { id: 'basin', label: '세면대', w: 0.36, d: 0.26, color: '#ffffff', parts: [[0.36, 0.34, 0.26, 0xffffff, 0, 0.17, 0]] },
  bathtub: { id: 'bathtub', label: '욕조', w: 0.42, d: 0.8, color: '#d6edf5', parts: [[0.42, 0.24, 0.8, 0xd6edf5, 0, 0.12, 0]] },
  washer: { id: 'washer', label: '세탁기', w: 0.36, d: 0.36, color: '#dfe6ea', parts: [[0.36, 0.44, 0.36, 0xdfe6ea, 0, 0.22, 0]] },
  plant: { id: 'plant', label: '화분', w: 0.28, d: 0.28, color: '#6aa76a', parts: [[0.2, 0.14, 0.2, 0xb98a5e, 0, 0.07, 0], [0.28, 0.26, 0.28, 0x6aa76a, 0, 0.27, 0]] },
  shoes: { id: 'shoes', label: '신발장', w: 0.6, d: 0.24, color: '#c79a6b', parts: [[0.6, 0.5, 0.24, 0xc79a6b, 0, 0.25, 0]] },
  partition: { id: 'partition', label: '경량칸막이', w: 0.8, d: 0.1, color: '#f1eadb', parts: [[0.8, 0.68, 0.06, 0xf1eadb, 0, 0.34, 0]] },
  hatch: { id: 'hatch', label: '아래층 문', w: 0.5, d: 0.5, color: '#d9dfe3', parts: [[0.5, 0.03, 0.5, 0xd9dfe3, 0, 0.015, 0], [0.34, 0.035, 0.34, 0xe0603f, 0, 0.018, 0]] },
};

export const ITEM_GROUPS: ItemGroup[] = [
  { label: '방', items: ['bed', 'desk', 'closet'] },
  { label: '거실', items: ['sofa', 'table', 'tv'] },
  { label: '주방', items: ['dining', 'fridge', 'sink'] },
  { label: '화장실', items: ['toilet', 'basin', 'bathtub'] },
  { label: '베란다와 현관', items: ['washer', 'plant', 'shoes'] },
  { label: '현관으로 못 나갈 때 쓰는 곳', items: ['partition', 'hatch'] },
];
