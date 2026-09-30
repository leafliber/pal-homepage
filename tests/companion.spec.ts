import { expect, test, type Page } from "@playwright/test";

const greeting = "嗨，你好呀！\n欢迎来到 Pal 的小世界。";
const shyMessage = "怎么一直看着我呀…\n我会害羞的啦 >///<";

async function startCompanion(page: Page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  const now = new Date("2026-09-30T12:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1_000));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-journey", "ready");
  await expect(page.locator("[data-traveler-companion]")).toHaveCount(1);
}

async function startWalking(page: Page) {
  const traveler = page.locator("[data-traveler]");
  // A randomly chosen destination can be too close to justify a step.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.mouse.move(40 + attempt, 150);
    await page.clock.runFor(6_000);
    if (await traveler.getAttribute("data-walking") === "true") return;
  }
  await expect(traveler).toHaveAttribute("data-walking", "true");
}

test("the companion greets after the opening, types progressively and dismisses its bubble", async ({ page }) => {
  await startCompanion(page);
  const bubble = page.locator("[data-traveler-bubble]");
  const text = page.locator("[data-bubble-text]");
  const announcement = page.getByRole("status");

  await page.clock.runFor(8_400);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await expect(bubble).toBeHidden();
  await page.clock.runFor(300);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expect(bubble).toBeHidden();
  await page.clock.runFor(1_400);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-tone", "hello");
  const partial = await text.textContent();
  expect(partial!.length).toBeGreaterThan(0);
  expect(partial!.length).toBeLessThan(greeting.length);
  expect(greeting.startsWith(partial!)).toBe(true);
  await expect(announcement).toHaveText(greeting.replace("\n", " "));
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("[data-traveler]")).toHaveAttribute("data-walking", "false");

  for (let elapsed = 0; elapsed < 4_000 && await bubble.getAttribute("data-state") !== "holding"; elapsed += 100) {
    await page.clock.runFor(100);
  }
  await expect(text).toHaveText(greeting);
  await expect(bubble).toHaveAttribute("data-state", "holding");
  await page.clock.runFor(4_300);
  await expect(bubble).toHaveAttribute("data-state", "leaving");
  await page.clock.runFor(300);
  await expect(bubble).toBeHidden();
  await expect(announcement).toBeEmpty();
});

test("inactivity resets on input and the shy message is limited to one per quiet stretch", async ({ page }) => {
  await startCompanion(page, true);
  const bubble = page.locator("[data-traveler-bubble]");
  await page.clock.runFor(6_500);
  await expect(bubble).toBeHidden();
  await page.mouse.move(80, 150);
  await page.clock.runFor(24_000);
  await expect(bubble).toBeHidden();
  await page.mouse.move(90, 150);
  await page.clock.runFor(24_000);
  await expect(bubble).toBeHidden();
  await page.clock.runFor(1_100);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-tone", "shy");
  await expect(page.locator("[data-bubble-text]")).toHaveText(shyMessage);
  await expect(page.getByRole("status")).toHaveText(shyMessage.replace("\n", " "));
  await page.clock.runFor(5_000);
  await expect(bubble).toBeHidden();
  await page.clock.runFor(70_000);
  await expect(bubble).toBeHidden();

  await page.keyboard.press("Shift");
  await page.clock.runFor(25_100);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-tone", "shy");
  await page.mouse.move(100, 150);
  await page.clock.runFor(10);
  await expect(bubble).toBeHidden();
  await page.clock.runFor(30_000);
  await expect(bubble).toBeHidden();
});

test("home wandering stays close to the island and stops on navigation, pause and reduced motion", async ({ page }) => {
  await startCompanion(page);
  const companion = page.locator("[data-traveler-companion]");
  const traveler = page.locator("[data-traveler]");
  const bubble = page.locator("[data-traveler-bubble]");
  const noWalk = async () => {
    await expect(traveler).toHaveAttribute("data-walking", "false");
    expect(await companion.evaluate((element) => element.getAnimations().length)).toBe(0);
  };
  await page.clock.runFor(17_000);
  await expect(bubble).toBeHidden();
  await startWalking(page);
  // The virtual clock advances scheduling; let the browser render the actual step.
  await expect(traveler).toHaveAttribute("data-walking", "false");
  const position = await companion.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.e / (element as HTMLElement).offsetWidth * 144,
      y: matrix.f / (element as HTMLElement).offsetHeight * 156 };
  });
  expect(Math.abs(position.x)).toBeLessThanOrEqual(24.1);
  expect(Math.abs(position.y)).toBeLessThanOrEqual(9.1);
  expect(Math.hypot(position.x, position.y)).toBeGreaterThan(1);

  await startWalking(page);
  await page.keyboard.press("PageDown");
  await expect(page.locator("main[data-journey]")).toHaveAttribute("data-active-scene", "1");
  await noWalk();
  expect(await companion.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).isIdentity)).toBe(true);
  await page.clock.runFor(60_000);
  await expect(bubble).toBeHidden();
  await noWalk();

  await page.keyboard.press("Home");
  await page.clock.runFor(1_000);
  await startWalking(page);
  await page.locator("[data-motion-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-paused", "true");
  await noWalk();
  await page.clock.runFor(60_000);
  await expect(bubble).toBeHidden();
  await noWalk();

  await page.locator("[data-motion-toggle]").click();
  await startWalking(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await noWalk();
  await page.clock.runFor(12_000);
  await noWalk();
});

test("reduced-motion greetings show complete text and fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await startCompanion(page, true);
  await page.clock.runFor(1_200);
  const bubble = page.locator("[data-traveler-bubble]");
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-state", "holding");
  await expect(page.locator("[data-bubble-text]")).toHaveText(greeting);
  await expect(page.locator("[data-traveler]")).toHaveAttribute("data-walking", "false");
  const bounds = await bubble.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
  const actions = await page.locator("#home .scene-actions").boundingBox();
  expect(bounds!.y, "the greeting must leave the homepage actions unobscured").toBeGreaterThanOrEqual(actions!.y + actions!.height);
  expect(await bubble.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
  await page.clock.runFor(5_000);
  await expect(bubble).toBeHidden();
});
