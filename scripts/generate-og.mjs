import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const [core, brand] = await Promise.all(
  ["living-core.webp", "pal-ai.png"].map(async (name) =>
    (
      await readFile(new URL(`../public/images/${name}`, import.meta.url))
    ).toString("base64"),
  ),
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#262626;color:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    .frame{width:1200px;height:630px;padding:34px 64px;position:relative;overflow:hidden}
    .brand{width:88px;height:88px;image-rendering:pixelated}h1{position:relative;z-index:2;font-size:50px;line-height:1.48;font-weight:550;letter-spacing:-2px;margin:96px 0 22px}
    h1 em{font-style:normal;color:#63e5b6}.note{font-size:18px;color:#bec3ba;margin:22px 0 0}
    .core{position:absolute;right:2px;top:62px;width:550px;height:513px;object-fit:contain}
    .bottom{position:absolute;left:64px;bottom:43px;font-size:12px;color:#b8bbb6}
    </style><div class="frame"><img class="brand" src="data:image/png;base64,${brand}" alt="Pal AI"><h1>让 AI 走出聊天框，<br>成为身边的<em>伙伴</em>。</h1><p class="note">我们用开源，让 AI 更接近日常。</p><img class="core" src="data:image/webp;base64,${core}" alt=""><span class="bottom">Cortico · Coopanion · Cortina</span></div></html>`);
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await page.screenshot({
    path: new URL("../public/images/og.png", import.meta.url).pathname,
  });
  console.log("Generated public/images/og.png (1200 × 630).");
} finally {
  await browser.close();
}
