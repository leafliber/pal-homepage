/**
 * Render both static fallbacks from the exact Three.js scene used at runtime.
 * Run with `node scripts/generate-core.mjs`; requires Chrome or Playwright Chromium.
 * The locked Astro dependency supplies esbuild only for this authoring command.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const requireFromAstro = createRequire(require.resolve("astro/package.json"));
const { build } = requireFromAstro("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const width = 600;
const height = 560;
const pixelRatio = 2;

const { outputFiles } = await build({
  stdin: {
    contents: `
      import * as THREE from "three";
      import { createCoreScene } from "./src/scripts/core-scene.ts";
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(${pixelRatio});
      renderer.setSize(${width}, ${height});
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      document.body.append(renderer.domElement);
      const core = createCoreScene();
      core.camera.aspect = ${width} / ${height};
      core.camera.updateProjectionMatrix();
      window.renderCore = (blink) => {
        core.update(0, blink, 0, 0, 0);
        renderer.render(core.scene, core.camera);
      };
      window.disposeCore = () => {
        core.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      };
      window.renderCore(0);
      window.coreReady = true;
    `,
    resolveDir: root,
    sourcefile: "generate-core-fixture.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
});

const bundle = outputFiles[0].text;
const html = `<!doctype html><html><meta charset="utf-8"><style>
  html,body{margin:0;width:${width}px;height:${height}px;background:transparent;overflow:hidden}
  canvas{display:block;width:${width}px;height:${height}px}
  </style><body><script type="module" src="/core-fixture.js"></script></body></html>`;
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  } else if (request.url === "/core-fixture.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    response.end(bundle);
  } else {
    response.writeHead(request.url === "/favicon.ico" ? 204 : 404);
    response.end();
  }
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const channel = process.env.PLAYWRIGHT_CHANNEL ||
    (existsSync(chromePath) ? "chrome" : undefined);
  browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: pixelRatio,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => window.coreReady === true);

  for (const [filename, blink] of [
    ["living-core.webp", 0],
    ["living-core-blink.webp", 1],
  ]) {
    await page.evaluate((value) => window.renderCore(value), blink);
    const png = await page.locator("canvas").screenshot({ omitBackground: true });
    const metadata = await sharp(png).metadata();
    if (metadata.width !== width * pixelRatio ||
        metadata.height !== height * pixelRatio || !metadata.hasAlpha) {
      throw new Error(`Unexpected canvas capture format for ${filename}.`);
    }
    await sharp(png)
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(fileURLToPath(new URL(`../public/images/${filename}`, import.meta.url)));
    console.log(`Generated public/images/${filename} (${metadata.width} × ${metadata.height}, alpha).`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await page.evaluate(() => window.disposeCore());
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
