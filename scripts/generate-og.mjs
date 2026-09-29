/**
 * Generate the share image from the same pixel world as the homepage.
 * Run `pnpm build` before `node scripts/generate-og.mjs`.
 * Rendering uses SVG + sharp only, without browser or network dependencies.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const palette = {
  background: "#242522",
  white: "#e9e8df",
  muted: "#a6a79e",
  dark: "#252622",
  platform: "#2e302a",
  accent: "#d5f58c",
};

const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const hero = html.match(
  /<div\b[^>]*data-pixel-world="hero"[^>]*>([\s\S]*?)<\/div>/,
)?.[1];
const heroSvg = hero?.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
if (!heroSvg) {
  throw new Error(
    "Hero pixel SVG not found in dist/index.html. Run pnpm build first.",
  );
}

// Resolve browser-only inherited colors before passing the SVG to librsvg.
const pal = (
  await readFile(
    new URL("../public/images/pixel-pal.svg", import.meta.url),
    "utf8",
  )
).replace(
  /<svg\b[^>]*>/,
  '<svg x="290" y="165" width="144" height="156" viewBox="0 0 144 156" fill="none">',
);

const world = heroSvg
  .replace(
    /<svg\b[^>]*>/,
    '<svg x="500" y="44" width="720" height="540" viewBox="0 0 720 540" fill="none">',
  )
  .replace(/\sdata-[\w-]+(?:="[^"]*")?/g, "")
  .replaceAll("var(--world-white)", palette.white)
  .replaceAll("var(--world-dark)", palette.dark)
  .replaceAll("var(--world-platform)", palette.platform)
  .replaceAll("var(--world-accent)", palette.accent)
  .replaceAll("currentColor", palette.white)
  .replace(/<\/svg>$/, `${pal}</svg>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="page-dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="${palette.white}" opacity=".11"/>
    </pattern>
  </defs>
  <style>
    text { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
    .mono, .world-annotation text { font-family: "Courier New", monospace; }
    .world-annotation { font-size: 9px; letter-spacing: 1.2px; }
    .world-annotation text:not([fill]) { fill: ${palette.white}; }
    .story-transient { opacity: 0; }
  </style>
  <rect width="1200" height="630" fill="${palette.background}"/>
  <rect width="1200" height="630" fill="url(#page-dots)"/>

  <g transform="translate(64 60)" fill="${palette.white}">
    <path d="M3 0h12v3h3v21h-3v3H3v-3H0V3h3Zm0 3v21h12V3Zm30-3h12v3h3v21h-3v3H33v-3h-3V3h3Zm0 3v21h12V3Zm24-6h3v6h3v15h-3v6h-3v-6h3V3h-3Z"/>
  </g>
  <text x="147" y="81" class="mono" fill="${palette.white}" font-size="20" font-weight="bold" letter-spacing="1">PAL AI LAB</text>

  <rect x="64" y="161" width="6" height="6" fill="${palette.accent}"/>
  <text x="61" y="244" fill="${palette.white}" font-size="60" font-weight="600" letter-spacing="-2">做最好的</text>
  <text x="61" y="321" fill="${palette.accent}" font-size="57" font-weight="600" letter-spacing="-2">开源人格 AI。</text>
  <text x="64" y="370" class="mono" fill="${palette.white}" font-size="18">Bring your AI to the world!</text>
  <text x="64" y="402" fill="${palette.muted}" font-size="16">把最新的 AI 技术，变成你身边触手可及的伙伴。</text>
  <path d="M64 435h34v6H64Z" fill="${palette.accent}"/>

  ${world}

  <path d="M64 528h1072" stroke="${palette.white}" opacity=".15"/>
  <text x="64" y="568" class="mono" fill="${palette.white}" font-size="15" letter-spacing=".5">CORTICO</text>
  <rect x="160" y="559" width="4" height="4" fill="${palette.accent}"/>
  <text x="185" y="568" class="mono" fill="${palette.white}" font-size="15" letter-spacing=".5">COOPANION</text>
  <rect x="300" y="559" width="4" height="4" fill="${palette.accent}"/>
  <text x="325" y="568" class="mono" fill="${palette.white}" font-size="15" letter-spacing=".5">CORTINA</text>
</svg>`;

const output = new URL("../public/images/og.png", import.meta.url);
await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, palette: true })
  .toFile(output.pathname);
console.log(`Generated ${output.pathname} (1200 × 630).`);
