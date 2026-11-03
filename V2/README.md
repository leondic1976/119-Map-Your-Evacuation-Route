# 우리집 대피지도 V2

점과 점을 이어 집을 그리면 칸이 저절로 생긴다. 칸을 「방」과 「지나가는 곳」으로 나누고, 벽에 문을 달고,
칸을 차례로 눌러 나가는 길을 고른다. 그 길로 대피 연습을 하고 3D 로 다시 본다. 1~6학년을 세 단계로 나눈다.

- 주소: <https://leondic1976.github.io/119-Map-Your-Evacuation-Route/> (열면 `/V2/` 로 간다)
- 설계: [`docs/DESIGN.md`](docs/DESIGN.md)
- 음성 대본: [`VOICE-SCRIPT.md`](VOICE-SCRIPT.md)

```bash
npm install
npm run dev      # 개발 서버
npm run verify   # 타입 → 음성 대조 → 빌드 → 로직·점검 → 브라우저 시나리오
```

| 검증 | 수 |
|---|---|
| 로직·배포 전 점검 (`npm test`) | 61개 |
| 브라우저 시나리오 (`npm run smoke`) | 7개 — 세 학년 단계 끝까지, 설정, 막지 않기, 음성, 작은 화면 |

소방청 캐릭터 영이·일구·웅이는 공공누리 제1유형(출처표시)으로 공개된 그림이다. 글꼴은 주아체(SIL OFL)다.
