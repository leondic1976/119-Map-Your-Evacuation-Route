/**
 * Tailwind 는 3D 리플레이의 유리판 패널에만 쓴다 (설계서 v1.4 §1.1).
 * 나머지 화면은 ui/kids.css 한 벌로 간다.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
