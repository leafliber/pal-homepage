// Node strips types; build-time original geometry is shared with the enhancement.
import sharp from "sharp";
import {
  CORE_VIEW,
  SHELLS,
  FOCUS_CENTERS,
  rotatePoint,
  shellPoint,
  shellNormal,
  focusPoint,
} from "../src/scripts/core-shape.ts";
const faces = [];
const project = (point) => {
  const [x, y, z] = rotatePoint(point, CORE_VIEW.rotation);
  const perspective = CORE_VIEW.camera / (CORE_VIEW.camera - z);
  return [
    300 + x * CORE_VIEW.scale * perspective,
    274 - y * CORE_VIEW.scale * perspective,
    z,
  ];
};
const light = [-0.42, 0.65, 0.63];
const color = (hex, normal, green = false) => {
  const n = rotatePoint(normal, CORE_VIEW.rotation);
  const diffuse = Math.max(
    0,
    n.reduce((sum, x, i) => sum + x * light[i], 0),
  );
  const specular =
    Math.pow(Math.max(0, n[0] * -0.22 + n[1] * 0.34 + n[2] * 0.91), 18) * 0.16;
  const shade = 0.36 + 0.64 * diffuse;
  const rgb = hex.match(/[a-f\d]{2}/gi).map((x) => parseInt(x, 16));
  return `rgb(${rgb.map((x, i) => Math.round(Math.min(255, x * shade + 255 * specular + (green ? [0, 18, 10][i] : 0))))})`;
};
for (const spec of SHELLS) {
  const rows = 220,
    cols = 128;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const u = i / rows,
        v = (j / cols) * 2 - 1;
      const normal = shellNormal(spec, u + 0.5 / rows, v + 1 / cols);
      const rotatedNormal = rotatePoint(normal, CORE_VIEW.rotation);
      if (rotatedNormal[2] < -0.08) continue;
      const points = [
        [u, v],
        [u + 1 / rows, v],
        [u + 1 / rows, v + 2 / cols],
        [u, v + 2 / cols],
      ].map(([a, b]) => project(shellPoint(spec, a, b)));
      faces.push({
        points,
        z: points.reduce((sum, p) => sum + p[2], 0) / 4,
        fill: color(spec.color, normal),
      });
    }
}
for (const center of FOCUS_CENTERS) {
  for (let i = 0; i < 48; i++)
    for (let j = 0; j < 80; j++) {
      const points = [
        [i / 48, j / 80],
        [(i + 1) / 48, j / 80],
        [(i + 1) / 48, (j + 1) / 80],
        [i / 48, (j + 1) / 80],
      ].map(([u, v]) => project(focusPoint(u, v, center)));
      const p = focusPoint((i + 0.5) / 48, (j + 0.5) / 80);
      const n = [p[0] / 0.175 ** 2, p[1] / 0.27 ** 2, p[2] / 0.13 ** 2];
      const length = Math.hypot(...n);
      faces.push({
        points,
        z: points.reduce((sum, p) => sum + p[2], 0) / 4,
        fill: color(
          "#00d294",
          n.map((x) => x / length),
          true,
        ),
      });
    }
}
faces.sort((a, b) => a.z - b.z);
const paths = faces
  .map(
    ({ points, fill }) =>
      `<path d="M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L")}Z" fill="${fill}" stroke="${fill}" stroke-width=".55"/>`,
  )
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="560" viewBox="0 0 600 560"><title>由三片柔润弧面围合的开放 C 形生命核心，中心有两个绿色感知焦点。原创概念视觉。</title>${paths}</svg>`;
await sharp(Buffer.from(svg), { density: 192 })
  .resize(1200, 1120)
  .blur(0.55)
  .webp({ quality: 85, alphaQuality: 100 })
  .toFile(
    new URL("../public/images/living-core.webp", import.meta.url).pathname,
  );
console.log(
  `Generated living-core.webp from ${faces.length} shared mesh faces.`,
);
