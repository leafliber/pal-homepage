import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { organization, projects } from "../src/data/projects";

const artifacts = path.resolve("artifacts");
const sceneIds = ["home", "projects", "coopanion", "cortina", "join"] as const;

async function waitForJourney(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-journey", "ready");
  await expect(page.locator("main[data-journey]")).toHaveCount(1);
  await expect(page.locator("[data-scene]")).toHaveCount(sceneIds.length);
}

async function assertActiveScene(page: Page, index: number) {
  const scene = page.locator(`#${sceneIds[index]}[data-scene]`);
  await expect(page.locator("main[data-journey]")).toHaveAttribute(
    "data-active-scene",
    String(index),
  );
  await expect(scene).toBeVisible();
  await expect(scene).not.toHaveAttribute("aria-hidden", "true");
  await expect(scene).toHaveJSProperty("inert", false);
  await expect(scene.getByRole("heading").first()).toBeInViewport();
  for (const [otherIndex, id] of sceneIds.entries()) {
    if (otherIndex === index) continue;
    const other = page.locator(`#${id}[data-scene]`);
    await expect(other).toHaveAttribute("aria-hidden", "true");
    await expect(other).toHaveJSProperty("inert", true);
  }
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

async function nextScene(page: Page, index: number) {
  await page.locator("[data-scene-next]").click();
  await assertActiveScene(page, index);
}

async function swipeUp(page: Page, sceneId: string) {
  // Space distinct gestures so they are not interpreted as one inertial swipe.
  await page.waitForTimeout(300);
  const start = { identifier: 1, clientX: 150, clientY: 380 };
  const end = { identifier: 1, clientX: 150, clientY: 180 };
  await page.dispatchEvent(`#${sceneId}`, "touchstart", {
    touches: [start],
    changedTouches: [start],
  });
  await page.dispatchEvent(`#${sceneId}`, "touchmove", {
    touches: [end],
    changedTouches: [end],
  });
  await page.dispatchEvent(`#${sceneId}`, "touchend", {
    touches: [],
    changedTouches: [end],
  });
}

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

async function assertSceneContent(page: Page, index: number) {
  const scene = page.locator(`#${sceneIds[index]}[data-scene]`);
  if (index === 0) {
    await expect(scene.getByRole("heading", { level: 1 })).toHaveText(
      /让\s*AI，\s*走进你的世界。/,
    );
    await expect(scene.locator("[data-pixel-world='hero']")).toBeVisible();
  } else if (index <= projects.length) {
    const project = projects[index - 1]!;
    await expect(
      scene.getByRole("heading", { level: 2, name: project.name, exact: true }),
    ).toBeVisible();
    const projectLink = scene.locator(`a[href="${project.href}"]`).first();
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toBeInViewport();
    await expect(scene).toContainText(project.description);
  } else {
    await expect(scene.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(
      scene.locator(`a[href="${organization.contributionHref}"]`),
    ).toBeVisible();
    await expect(scene.locator(`a[href="${organization.href}"]`)).toBeVisible();
  }
}

async function expectPainted(locator: Locator, painted: boolean) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        let current: Element | null = element;
        while (current) {
          const style = getComputedStyle(current);
          if (
            Number(style.opacity) <= 0.05 ||
            style.visibility === "hidden" ||
            style.display === "none"
          ) return false;
          current = current.parentElement;
        }
        return true;
      }),
    )
    .toBe(painted);
}

async function assertTravelerAtAnchor(page: Page) {
  await expect.poll(async () => {
    const actor = await page.locator("[data-traveler]").boundingBox();
    const anchor = await page.locator(".scene.is-active [data-traveler-anchor]").boundingBox();
    if (!actor || !anchor) return Infinity;
    return Math.max(
      Math.abs(actor.x - anchor.x),
      Math.abs(actor.y - anchor.y),
      Math.abs(actor.width - anchor.width),
      Math.abs(actor.height - anchor.height),
    );
  }, { message: "the shared traveler must settle onto the active SVG anchor" }).toBeLessThanOrEqual(1);
}

async function startControlledIntro(page: Page) {
  const now = new Date("2026-09-29T12:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1_000));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForJourney(page);
}

async function screenshot(page: Page, name: string, animations: "disabled" | "allow" = "disabled") {
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: path.join(artifacts, `pixel-${name}.png`),
    fullPage: true,
    animations,
  });
}

for (const viewport of [
  { width: 1440, height: 1000, name: "desktop-1440" },
  { width: 1024, height: 900, name: "tablet-1024" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 320, height: 740, name: "narrow-320" },
]) {
  test(`${viewport.width}px: every scene has readable content and fits the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    for (let index = 0; index < sceneIds.length; index += 1) {
      if (index > 0) await nextScene(page, index);
      await assertActiveScene(page, index);
      await assertSceneContent(page, index);
      await assertNoOverflow(page);
      await screenshot(page, `${viewport.name}-${sceneIds[index]}`);
    }
  });
}

test("paging moves through the game world while its background and document stay fixed", async ({
  page,
}) => {
  await page.goto("/");
  await waitForJourney(page);
  await assertActiveScene(page, 0);
  await expect(page.locator("[data-scene-prev]")).toBeDisabled();
  const background = page.locator("[data-world-background]");
  await expect(background).toHaveCSS("position", "fixed");
  const initialBackground = await background.boundingBox();
  expect(initialBackground).not.toBeNull();

  await page.keyboard.press("PageDown", { delay: 750 });
  await assertActiveScene(page, 1);
  await expect(page).toHaveURL(/\/#projects$/);
  await page.keyboard.press("ArrowDown", { delay: 750 });
  await assertActiveScene(page, 2);
  await page.keyboard.press("PageUp", { delay: 750 });
  await assertActiveScene(page, 1);
  await page.keyboard.press("ArrowUp", { delay: 750 });
  await assertActiveScene(page, 0);

  // A single wheel gesture advances one complete scene, never a partial scroll.
  await page.mouse.move(100, 400);
  await page.mouse.wheel(0, 650);
  await assertActiveScene(page, 1);
  // Leave enough time for the gesture lock and inertial wheel stream to settle.
  await page.waitForTimeout(800);
  await page.mouse.wheel(0, -650);
  await assertActiveScene(page, 0);
  expect(await background.boundingBox()).toEqual(initialBackground);

  for (let index = 1; index < sceneIds.length; index += 1) {
    await nextScene(page, index);
  }
  await expect(page.locator("[data-scene-next]")).toBeDisabled();
  await expect(page.locator("[data-scene-prev]")).toBeEnabled();
  await page.locator("[data-scene-prev]").click();
  await assertActiveScene(page, 3);
  expect(await background.boundingBox()).toEqual(initialBackground);
});

test("scene links support keyboard navigation, direct URLs and browser history", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#cortina");
  await waitForJourney(page);
  await assertActiveScene(page, 3);
  const projectsLink = page
    .getByRole("navigation", { name: "主要导航" })
    .locator('a[data-scene-link][href$="#projects"]');
  await projectsLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#projects$/);
  await assertActiveScene(page, 1);
  await nextScene(page, 2);
  await expect(page).toHaveURL(/\/#coopanion$/);
  await page.goBack();
  await assertActiveScene(page, 1);
  await page.goBack();
  await assertActiveScene(page, 3);
  await page.goForward();
  await assertActiveScene(page, 1);
  for (const link of await page.locator('a[target="_blank"]').all()) {
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("inactive scenes cannot receive keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#projects");
  await waitForJourney(page);
  await assertActiveScene(page, 1);
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    const hiddenScene = await page.evaluate(
      () =>
        document.activeElement?.closest('[data-scene][aria-hidden="true"]')?.id,
    );
    expect(hiddenScene, "Tab must skip inactive game scenes").toBeUndefined();
  }
});

test("the skip link focuses the current chapter without changing its deep link or history", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#cortina");
  await waitForJourney(page);
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "跳到主要内容" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator("#cortina").getByRole("heading", { level: 2 }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/#cortina$/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await assertActiveScene(page, 3);
});

test("touch swipes change scenes, respect tall content, and reset scroll when returning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForJourney(page);
  await expect
    .poll(
      () =>
        page
          .locator("#home")
          .evaluate((scene) => scene.scrollHeight - scene.clientHeight),
      {
        message:
          "the standard mobile hero fits without a preliminary inner scroll",
      },
    )
    .toBeLessThanOrEqual(2);
  await swipeUp(page, "home");
  await assertActiveScene(page, 1);

  await page.setViewportSize({ width: 390, height: 500 });
  const projectScene = page.locator("#projects");
  expect(
    await projectScene.evaluate(
      (scene) => scene.scrollHeight - scene.clientHeight,
    ),
  ).toBeGreaterThan(2);
  await swipeUp(page, "projects");
  await expect(page.locator("main[data-journey]")).toHaveAttribute(
    "data-active-scene",
    "1",
  );
  // A synthetic swipe checks event routing; a real wheel scroll verifies native overflow.
  await page.mouse.move(150, 300);
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => projectScene.evaluate((scene) => scene.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      projectScene.evaluate(
        (scene) => scene.scrollHeight - scene.clientHeight - scene.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(2);
  await expect(page.locator("main[data-journey]")).toHaveAttribute(
    "data-active-scene",
    "1",
  );
  await swipeUp(page, "projects");
  await assertActiveScene(page, 2);
  await page.locator("[data-scene-prev]").click();
  await assertActiveScene(page, 1);
  await expect(projectScene).toHaveJSProperty("scrollTop", 0);
});

test("mobile navigation opens by keyboard, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForJourney(page);
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
  await page.mouse.wheel(0, 650);
  await swipeUp(page, "home");
  await assertActiveScene(page, 0);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await nav.locator('a[data-scene-link][href$="#projects"]').click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/#projects$/);
  await assertActiveScene(page, 1);
});

test("without JavaScript, all scenes, anchors and project links remain available", async ({
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
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-journey",
      "ready",
    );
    await expect(page.locator("[data-scene]")).toHaveCount(sceneIds.length);
    const fallbackImage = await page.locator('[data-pixel-world="hero"]').evaluate(
      (element) => getComputedStyle(element, "::after").backgroundImage,
    );
    expect(fallbackImage).toContain("/images/pixel-pal.svg");
    const fallbackSize = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/images/pixel-pal.svg";
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
    expect(fallbackSize.width).toBeGreaterThan(0);
    expect(fallbackSize.height).toBeGreaterThan(0);
    for (const id of sceneIds) {
      const scene = page.locator(`#${id}[data-scene]`);
      await expect(scene).toBeVisible();
      await expect(scene).not.toHaveAttribute("inert");
      await expect(scene).not.toHaveAttribute("aria-hidden", "true");
    }
    for (const [index, project] of projects.entries()) {
      const scene = page.locator(`#${sceneIds[index + 1]}`);
      await expect(
        scene.getByRole("heading", { name: project.name, exact: true }),
      ).toBeVisible();
      await expect(scene.locator(`a[href="${project.href}"]`)).toBeVisible();
    }
    const nav = page.getByRole("navigation", { name: "主要导航" });
    await expect(nav).toBeVisible();
    await expect(page.locator('[aria-controls="main-nav"]')).toBeHidden();
    await expect(page.locator("[data-motion-toggle]")).toBeHidden();
    await expect(page.locator("[data-scene-next]")).toBeHidden();
    await assertNoOverflow(page);
    await nav.locator('a[data-scene-link][href$="#projects"]').click();
    await expect(page).toHaveURL(/\/#projects$/);
    await expect(
      page.locator("#projects").getByRole("heading").first(),
    ).toBeInViewport();
    await screenshot(page, `no-js-${width}`);
    await context.close();
  }
});

test("the hero tells an automatic story: wake, seed, island, growth and a new friend", async ({
  page,
}) => {
  // Use real time for this visual test: JavaScript fake clocks cannot advance
  // CSS keyframes in lockstep. Record intro start before application code runs.
  await page.addInitScript(() => {
    const clock = window as Window & { __palIntroStartedAt?: number };
    const observer = new MutationObserver(() => {
      if (document.documentElement?.dataset.intro === "playing") {
        clock.__palIntroStartedAt = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["data-intro"] });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForJourney(page);
  const at = (milliseconds: number) => page.waitForFunction((deadline) => {
    const startedAt = (window as Window & { __palIntroStartedAt?: number }).__palIntroStartedAt;
    return startedAt !== undefined && performance.now() - startedAt >= deadline;
  }, milliseconds);
  const root = page.locator("html");
  const world = page.locator('[data-pixel-world="hero"]');
  const traveler = page.locator("[data-traveler]");
  const eyes = traveler.locator("[data-traveler-eyes]");
  const shell = traveler.locator(".traveler-shell");
  const island = world.locator('[data-story-part="island"]');
  const sprouts = world.locator('[data-story-part="sprouts"]');
  const friend = world.locator('[data-story-part="friend"]');

  await at(100);
  await expect(root).toHaveAttribute("data-intro", "playing");
  await expect(root).toHaveAttribute("data-intro-phase", "blank");
  await expectPainted(traveler, false);
  await expectPainted(island, false);
  await expectPainted(friend, false);
  await expectPainted(page.locator(".hero-copy"), false);
  await expectPainted(page.locator(".site-header"), false);
  await screenshot(page, "story-0100-blank", "allow");

  await at(1_000);
  await expect(root).toHaveAttribute("data-intro-phase", "wake");
  await expectPainted(eyes, true);
  await expectPainted(shell, false);
  await expectPainted(island, false);
  await expectPainted(friend, false);
  await expectPainted(page.locator(".hero-copy"), false);
  await screenshot(page, "story-1000-eyes", "allow");

  await at(1_600);
  await expect(root).toHaveAttribute("data-intro-phase", "look");
  await expectPainted(island, false);
  await at(2_600);
  await expect(root).toHaveAttribute("data-intro-phase", "signal");
  await expectPainted(world.locator("[data-story-seed]"), true);
  await expectPainted(island, false);
  await expectPainted(friend, false);

  await at(3_900);
  await expect(root).toHaveAttribute("data-intro-phase", "build");
  await expectPainted(island, true);
  await expectPainted(sprouts, false);
  await expectPainted(friend, false);
  await screenshot(page, "story-4000-island", "allow");
  await at(5_000);
  await expectPainted(sprouts, true);
  await expectPainted(friend, false);

  await at(7_500);
  await expect(root).toHaveAttribute("data-intro-phase", "meet");
  await expectPainted(friend, true);
  await at(8_800);
  await expect(root).toHaveAttribute("data-intro-phase", "ready");
  await expect(root).toHaveAttribute("data-intro", "done");
  await expectPainted(island, true);
  await expectPainted(friend, true);
  await expectPainted(page.locator(".hero-copy"), true);
  await expectPainted(page.locator(".site-header"), true);
  await expect(world.locator("text, button, input, [role='button']")).toHaveCount(0);
  await expect(page.locator(".build-sequence, .art-topline, .world-caption, .chapter-label, .hero-pixel-heading, .hero-footnote, .world-coordinate, .traveler-name")).toHaveCount(0);
  await assertActiveScene(page, 0);
  await assertTravelerAtAnchor(page);
  await screenshot(page, "story-8800-ready", "allow");
});

test("leaving the opening early completes it and returning never hides the page again", async ({
  page,
}) => {
  await startControlledIntro(page);
  await page.clock.runFor(1_000);
  await expect(page.locator("html")).toHaveAttribute("data-intro-phase", "wake");
  await page.keyboard.press("PageDown");
  await page.clock.runFor(800);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await assertActiveScene(page, 1);
  await assertTravelerAtAnchor(page);
  await page.keyboard.press("PageUp");
  await page.clock.runFor(800);
  await assertActiveScene(page, 0);
  await expectPainted(page.locator(".hero-copy"), true);
  await expectPainted(page.locator(".site-header"), true);
  await expect(page.locator("html")).toHaveAttribute("data-intro-phase", "ready");
  await assertTravelerAtAnchor(page);
});

test("a project deep link skips the opening even with motion enabled", async ({
  page,
}) => {
  await page.goto("/#cortina");
  await waitForJourney(page);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expect(page.locator("html")).toHaveAttribute("data-intro-phase", "ready");
  await assertActiveScene(page, 3);
  await expectPainted(page.locator(".site-header"), true);
});

test("the motion control stops the world and resumes its automatic animation", async ({
  page,
}) => {
  await page.goto("/");
  await waitForJourney(page);
  const world = page.locator('[data-pixel-world="hero"]');
  const toggle = page.locator("[data-motion-toggle]");
  const runningAnimations = () =>
    page.locator('[data-pixel-world="hero"], [data-traveler]').evaluateAll(
      (elements) => elements.flatMap((element) =>
        element.getAnimations({ subtree: true }),
      ).filter((animation) => animation.playState === "running").length,
    );
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(runningAnimations).toBeGreaterThan(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-paused", "true");
  await expect(page.locator("[data-motion-label]")).toHaveText("继续动画");
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expectPainted(page.locator(".hero-copy"), true);
  await expectPainted(world.locator('[data-story-part="friend"]'), true);
  await expect.poll(runningAnimations).toBe(0);
  const pose = () => page.locator("[data-traveler] .traveler-sprite").boundingBox();
  const pausedPose = await pose();
  // Verify the paused visual remains stationary over time.
  await page.waitForTimeout(350);
  expect(await pose()).toEqual(pausedPose);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-paused", "false");
  await expect(page.locator("[data-motion-label]")).toHaveText("暂停动画");
  await expect.poll(runningAnimations).toBeGreaterThan(0);
});

test("reduced motion shows complete worlds without automatic movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForJourney(page);
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expect(page.locator("html")).toHaveAttribute("data-intro-phase", "ready");
  await expectPainted(page.locator(".hero-copy"), true);
  await expectPainted(page.locator('[data-pixel-world="hero"] [data-story-part="friend"]'), true);
  for (let index = 0; index < sceneIds.length; index += 1) {
    if (index > 0) await nextScene(page, index);
    const world = page.locator(`#${sceneIds[index]} [data-pixel-world]`);
    await expect(world).toBeVisible();
    expect(
      await world
        .locator(".assembly")
        .evaluateAll((stages) =>
          stages.every(
            (stage) => Number(getComputedStyle(stage).opacity) === 1,
          ),
        ),
    ).toBe(true);
    expect(
      await world.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    ).toBe(0);
  }
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
  await waitForJourney(page);
  await page.waitForLoadState("networkidle");
  for (let index = 0; index < sceneIds.length; index += 1) {
    if (index > 0) await nextScene(page, index);
    for (const image of await page.locator("img:visible").all()) {
      await expect(image).toHaveJSProperty("complete", true);
      expect(
        await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
      ).toBeGreaterThan(0);
    }
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
  test(`${width}px: every scene passes WCAG accessibility checks`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await waitForJourney(page);
    for (let index = 0; index < sceneIds.length; index += 1) {
      if (index > 0) await nextScene(page, index);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      await testInfo.attach(`axe-${width}-${sceneIds[index]}`, {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
    }
    if (width < 700) {
      await page.locator('[aria-controls="main-nav"]').click();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
    }
  });
}
