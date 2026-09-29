import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const artifacts = path.resolve("artifacts");
const projectLinks = [
  {
    id: "cortico",
    name: "Cortico",
    href: "https://github.com/Pal-AI-Lab/Cortico",
  },
  {
    id: "coopanion",
    name: "Coopanion",
    href: "https://github.com/Pal-AI-Lab/Coopanion",
  },
  {
    id: "cortina",
    name: "Cortina",
    href: "https://github.com/Pal-AI-Lab/Cortina",
  },
];

async function assertNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(sizes.document, "document must fit the viewport").toBeLessThanOrEqual(
    sizes.viewport + 1,
  );
  expect(sizes.body, "body must fit the viewport").toBeLessThanOrEqual(
    sizes.viewport + 1,
  );
}

async function assertContent(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "让 AI 走出聊天框",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const project of projectLinks) {
    const article = page.locator(`article#${project.id}`);
    await expect(
      article.getByRole("heading", { name: project.name, exact: true }),
    ).toBeVisible();
    await expect(article.locator("a")).toHaveAttribute("href", project.href);
    await expect(article.locator(".project-description")).not.toBeEmpty();
  }
  await expect(page.locator("[data-core-still]")).toHaveAttribute("alt", /\S+/);
}

async function screenshot(page: Page, name: string) {
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: path.join(artifacts, `simplified-${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function assertSignalCycle(page: Page, keyboard = false) {
  const core = page.locator("[data-living-core]");
  const signal = page.locator("[data-core-signal]");
  const description = page.locator("[data-core-description]");
  if (keyboard) {
    await signal.focus();
    await page.keyboard.press("Enter");
  } else {
    await signal.click();
  }
  let previousDescription: string | null | undefined;
  for (const phase of ["sense", "connect", "respond"]) {
    await expect(core).toHaveAttribute("data-core-phase", phase);
    await expect(description).not.toBeEmpty();
    const currentDescription = await description.textContent();
    expect(currentDescription, `${phase} must explain the visible stage`).not.toBe(
      previousDescription,
    );
    previousDescription = currentDescription;
  }
  await expect(core).toHaveAttribute("data-core-phase", "rest");
  await expect(description).not.toHaveText(previousDescription!);
}

for (const viewport of [
  { width: 1440, height: 1000, name: "desktop-1440" },
  { width: 1024, height: 900, name: "tablet-1024" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 320, height: 740, name: "narrow-320" },
]) {
  test(`${viewport.width}px layout: real content, no overflow, local images and screenshot`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await assertContent(page);
    await page.waitForLoadState("networkidle");
    await assertNoOverflow(page);
    const images = page.locator("img");
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("complete", true);
      expect(
        await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
      ).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const pause = page.locator("[data-core-pause]");
    if (await pause.isVisible()) await pause.click();
    if (viewport.width < 768) {
      await expect(page.locator("[data-core-still]")).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(0);
    }
    await screenshot(page, viewport.name);
  });
}

test("primary links, keyboard anchor navigation and accessible landmarks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const explore = page.getByRole("link", { name: "探索项目", exact: true });
  await explore.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#projects$/);
  await expect(page.locator("#projects-title")).toBeInViewport();
  const position = await page
    .locator("#projects-title")
    .evaluate((heading) => ({
      headingTop: heading.getBoundingClientRect().top,
      headerBottom: document.querySelector("header")!.getBoundingClientRect()
        .bottom,
    }));
  expect(
    position.headingTop,
    "fixed navigation must not cover the anchor title",
  ).toBeGreaterThanOrEqual(position.headerBottom);
  await expect(
    page.getByRole("link", { name: /^访问 GitHub/ }),
  ).toHaveAttribute("href", "https://github.com/Pal-AI-Lab");
  await expect(page.getByRole("link", { name: /^参与构建/ })).toHaveAttribute(
    "href",
    "https://github.com/Pal-AI-Lab/Cortico/blob/main/CONTRIBUTING.md",
  );
  for (const link of await page.locator('a[target="_blank"]').all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("mobile menu opens by keyboard, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator('[aria-controls="main-nav"]');
  const nav = page.getByRole("navigation", { name: "主要导航" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link").first()).toBeFocused();
  await screenshot(page, "mobile-menu-390");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await nav.getByRole("link", { name: /^项目/ }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/#projects$/);
  await expect(page.locator("#projects-title")).toBeInViewport();
});

test("without JavaScript, desktop and mobile navigation and project content remain usable", async ({
  browser,
  baseURL,
}) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await assertContent(page);
    await expect(
      page.getByRole("navigation", { name: "主要导航" }),
    ).toBeVisible();
    await expect(page.locator('[aria-controls="main-nav"]')).toBeHidden();
    await expect(page.locator("[data-core-still]")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-core-signal]")).toBeHidden();
    await expect(page.locator("[data-core-pause]")).toBeHidden();
    await assertNoOverflow(page);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /^项目/ })
      .click();
    await expect(page).toHaveURL(/\/#projects$/);
    await screenshot(page, `no-js-${width}`);
    await context.close();
  }
});

test("reduced motion keeps the matching static visual and avoids loading the 3D module", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-core-still]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-core-pause]")).toBeHidden();
  expect(scripts.filter((url) => /core-webgl|three(?:[.-])/.test(url))).toEqual(
    [],
  );
  const core = page.locator("[data-living-core]");
  const initialDescription = await page.locator("[data-core-description]").textContent();
  await page.locator("[data-core-signal]").focus();
  await page.keyboard.press("Enter");
  await expect(core).toHaveAttribute("data-core-phase", "respond");
  await expect(page.locator("[data-core-description]")).not.toHaveText(initialDescription!);
  await expect(page.locator("[data-core-pause]")).toBeHidden();
  // Reduced-motion users get the result directly, without a timed phase loop.
  await page.waitForTimeout(200);
  await expect(core).toHaveAttribute("data-core-phase", "respond");
  await screenshot(page, "reduced-motion-1440");
});

test("without WebGL, the matching static visual still explains a complete signal cycle", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-core-still]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-core-pause]")).toBeHidden();
  await assertSignalCycle(page, true);
  await expect(page.locator("[data-core-pause]")).toBeHidden();
  expect(errors).toEqual([]);
  await screenshot(page, "no-webgl-1440");
});

test("desktop enhancement has one canvas, a meaningful signal cycle and a working pause/resume control", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scope = window as unknown as Window & {
      __palAnimationFrames: number;
    };
    scope.__palAnimationFrames = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        scope.__palAnimationFrames += 1;
        callback(time);
      });
  });
  await page.goto("/");
  const core = page.locator("[data-living-core]");
  await expect(core).toHaveAttribute("data-webgl", "ready", {
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toHaveCount(1);
  await assertSignalCycle(page, true);
  const pause = page.locator("[data-core-pause]");
  await expect(pause).toBeVisible();
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(pause).toHaveAccessibleName("恢复核心动画");
  const frameCount = () =>
    page.evaluate(
      () =>
        (window as unknown as Window & { __palAnimationFrames: number })
          .__palAnimationFrames,
    );
  const pausedFrames = await frameCount();
  // This interval checks an animation stopping over time, rather than delaying page readiness.
  await page.waitForTimeout(300);
  expect(await frameCount()).toBe(pausedFrames);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: path.join(artifacts, "simplified-hero-webgl-1440.png"),
    animations: "disabled",
  });
  await expect(core).toHaveAttribute("data-webgl", "ready");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect.poll(frameCount).toBeGreaterThan(pausedFrames);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const offscreenFrames = await frameCount();
  await page.waitForTimeout(200);
  expect(await frameCount()).toBe(offscreenFrames);
  await core.scrollIntoViewIfNeeded();
  await expect.poll(frameCount).toBeGreaterThan(offscreenFrames);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenFrames = await frameCount();
  await page.waitForTimeout(200);
  expect(await frameCount()).toBe(hiddenFrames);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(frameCount).toBeGreaterThan(hiddenFrames);
});

test("a lost WebGL context disposes the canvas and reveals the matching fallback", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-living-core]")).toHaveAttribute(
    "data-webgl",
    "ready",
    { timeout: 15_000 },
  );
  await page.locator("canvas").evaluate((canvas) => {
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-core-still]")).toBeVisible();
  await expect(page.locator("[data-core-pause]")).toBeHidden();
  await assertSignalCycle(page);
});

test("touch-sized fallback animates a signal on demand and can pause the active sequence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const core = page.locator("[data-living-core]");
  const pause = page.locator("[data-core-pause]");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-core-still]")).toBeVisible();
  await expect(pause).toBeHidden();
  await page.locator("[data-core-signal]").click();
  await expect(core).toHaveAttribute("data-core-phase", "sense");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(core).toHaveAttribute("data-core-paused", "true");
  const pausedPhase = await core.getAttribute("data-core-phase");
  // Longer than the first phase: the timeline must stay stopped until resumed.
  await page.waitForTimeout(1600);
  await expect(core).toHaveAttribute("data-core-phase", pausedPhase!);
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect(core).toHaveAttribute("data-core-phase", "connect");
  await expect(core).toHaveAttribute("data-core-phase", "respond");
  await expect(core).toHaveAttribute("data-core-phase", "rest");
  await expect(pause).toBeHidden();
});

test("page has no unhandled errors, console errors or missing local resources", async ({
  page,
  baseURL,
}) => {
  const failures: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on("pageerror", (error) => failures.push(`Unhandled: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`Console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400)
      failures.push(`${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(origin))
      failures.push(`Failed: ${request.url()} ${request.failure()?.errorText}`);
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("footer").scrollIntoViewIfNeeded();
  for (const image of await page.locator("img").all()) {
    await expect(image).toHaveJSProperty("complete", true);
    expect(
      await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
    ).toBeGreaterThan(0);
  }
  expect(failures).toEqual([]);
});

test("unknown paths return a real HTTP 404 and the useful 404 page", async ({
  page,
}) => {
  const response = await page.goto("/this-page-does-not-exist-pal-acceptance/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "没有足迹",
  );
  await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
});

for (const width of [1440, 390]) {
  test(`${width}px WCAG accessibility scan`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (width < 700) await page.locator('[aria-controls="main-nav"]').click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await testInfo.attach(`axe-${width}`, {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
}
