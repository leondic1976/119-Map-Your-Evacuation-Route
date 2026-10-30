'use client';

/**
 * 불·연기 셰이더가 함께 쓰는 노이즈 — 설계서 v1.19 §4.1.
 * 텍스처 없이 값 노이즈를 겹쳐(fbm) 불꽃의 혀와 연기의 소용돌이를 만든다.
 * 옥타브 수는 화질이 정한다 — 가벼움은 2, 고급은 4.
 */
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    sum += vnoise(p) * amp;
    total += amp;
    p = p * 2.03 + vec2(17.1, 9.7);
    amp *= 0.5;
  }
  return sum / total;
}
`;
