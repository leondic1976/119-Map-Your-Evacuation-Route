/**
 * 껍데기 층 — 앱이 브라우저·Electron 어느 쪽에서 도는지 몰라도 되게 하는 자리.
 * `core/**` 는 여기조차 부르지 않는다(순수 함수만 담는다).
 */
export { host, setHost, webHost, type Host, type Installer, type InstallOutcome } from './host';
export { svgToPng } from './raster';
