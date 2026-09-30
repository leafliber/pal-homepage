import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { organization, projects } from "../src/data/projects";

const artifacts = path.resolve("artifacts");
const sceneIds = ["home", "projects", "coopanion", "cortina", "join"] as const;
const projectRoles = ["智能体框架", "桌面伙伴", "扩展工具"] as const;

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
  await assertNavigationHierarchy(page, index);
}

async function assertNavigationHierarchy(page: Page, index: number) {
  const group = index === 0 ? "intro" : index === 4 ? "join" : "projects";
  const groupName = index === 0 ? "简介" : index === 4 ? "共建" : "项目";
  await expect(page.locator("main[data-journey]")).toHaveAttribute("data-active-group", group);
  await expect(page.locator(`#${sceneIds[index]}`)).toHaveAttribute("data-scene-group", group);
  const stages = page.getByRole("navigation", { name: "章节导航", exact: true });
  await expect(stages.getByRole("link")).toHaveCount(3);
  for (const name of ["简介", "项目", "共建"]) {
    await expect(stages.getByRole("link", { name, exact: true })).toHaveCount(1);
  }
  await expect(stages.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(stages.locator('[aria-current="step"]')).toHaveAccessibleName(groupName);

  const visibleProjectNavigation = page.getByRole("navigation", { name: "项目选择", exact: true });
  await expect(visibleProjectNavigation).toHaveCount(group === "projects" ? 1 : 0);
  if (group === "projects") {
    await expect(visibleProjectNavigation.getByRole("link")).toHaveCount(projects.length);
    for (const project of projects) {
      await expect(visibleProjectNavigation.getByRole("link", { name: project.name, exact: true })).toHaveCount(1);
    }
    await expect(visibleProjectNavigation.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(visibleProjectNavigation.locator('[aria-current="step"]')).toHaveAccessibleName(projects[index - 1]!.name);
  }
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

async function wheelStream(page: Page, impulses: { delta: number; after: number; mode?: 0 | 1 | 2 }[]) {
  return page.evaluate(async (events) => {
    const samples: { index: number; time: number; leaving: number }[] = [];
    for (const event of events) {
      if (event.after) await new Promise((resolve) => setTimeout(resolve, event.after));
      const active = document.querySelector<HTMLElement>(".scene.is-active")!;
      active.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true, cancelable: true, deltaY: event.delta, deltaMode: event.mode ?? 0,
      }));
      samples.push({
        index: Number(document.querySelector<HTMLElement>("main[data-journey]")!.dataset.activeScene),
        time: performance.now(),
        leaving: document.querySelectorAll(".scene.is-leaving").length,
      });
    }
    return samples;
  }, impulses);
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
      /做最好的\s*开源人格 AI。/,
    );
    await expect(scene.locator("[data-pixel-world='hero']")).toBeVisible();
    await expect(scene.locator(".scene-actions").getByRole("link", { name: "了解开源项目", exact: true })).toBeVisible();
  } else if (index <= projects.length) {
    const project = projects[index - 1]!;
    await expect(
      scene.getByRole("heading", { level: 2, name: project.name, exact: true }),
    ).toBeVisible();
    const projectLink = scene.locator(`a[href="${project.href}"]`).first();
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toBeInViewport();
    await expect(scene).toContainText(project.description);
    const panel = scene.locator(".project-panel");
    await expect(panel.locator(".project-section-label")).toHaveText("开源项目");
    await expect(panel.locator(".project-role")).toHaveText(projectRoles[index - 1]!);
    await expect(panel.locator(".project-role")).toBeInViewport();
    await expect(panel.getByRole("heading", { level: 2, name: project.name, exact: true })).toBeVisible();
    await assertProjectLayout(page, index);
  } else {
    await expect(scene.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(
      scene.locator(`a[href="${organization.contributionHref}"]`),
    ).toBeVisible();
    await expect(scene.locator(`a[href="${organization.href}"]`)).toBeVisible();
  }
}

async function assertProjectLayout(page: Page, index: number) {
  const layout = await page.locator(`#${sceneIds[index]}`).evaluate((scene) => {
    const panel = scene.querySelector<HTMLElement>(".project-panel")!;
    const switcher = scene.querySelector<HTMLElement>(".project-switcher")!;
    const heading = panel.querySelector<HTMLElement>("h2")!;
    const action = panel.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    const footer = scene.querySelector<HTMLElement>(".scene-bottom")!;
    const bar = document.querySelector<HTMLElement>(".journey-bar")!;
    const art = scene.querySelector<HTMLElement>(".scene-art")!;
    const copy = panel.querySelector<HTMLElement>(".scene-copy")!;
    const copyBox = copy.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const switcherBox = switcher.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();
    const overlaps: string[] = [];
    for (const [name, element] of [["project selection", switcher], ["project heading", heading], ["project action", action]] as const) {
      const box = element.getBoundingClientRect();
      for (const [obstacleName, obstacle] of [["chapter footer", footer], ["fixed journey bar", bar]] as const) {
        const obstacleBox = obstacle.getBoundingClientRect();
        if (Math.min(box.right, obstacleBox.right) - Math.max(box.left, obstacleBox.left) > 1 &&
            Math.min(box.bottom, obstacleBox.bottom) - Math.max(box.top, obstacleBox.top) > 1) {
          overlaps.push(`${name} overlaps ${obstacleName}`);
        }
      }
    }
    return {
      overlaps,
      switcherInsidePanel: switcherBox.left >= panelBox.left - 1 && switcherBox.right <= panelBox.right + 1 &&
        switcherBox.top >= panelBox.top - 1 && switcherBox.bottom <= panelBox.bottom + 1,
      artCenter: artBox.left + artBox.width / 2,
      copyCenter: copyBox.left + copyBox.width / 2,
      width: innerWidth,
    };
  });
  expect(layout.overlaps, "project navigation and actions must remain clear of fixed navigation").toEqual([]);
  expect(layout.switcherInsidePanel, "project selection belongs to its project panel").toBe(true);
  if (layout.width >= 1_024) {
    expect(layout.artCenter, "desktop project art is on the left and its description is on the right").toBeLessThan(layout.copyCenter);
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
  // A deliberate reversal remains responsive while the previous move is active.
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

test("rapid chapter changes never paint an outgoing chapter footer", async ({ page }) => {
  await page.goto("/#projects");
  await waitForJourney(page);
  const samples = await page.evaluate(async () => {
    const results: { active: string; leaving: number; painted: string[] }[] = [];
    const readFrame = () => {
      const painted = [...document.querySelectorAll<HTMLElement>("[data-scene] .scene-bottom")]
        .filter((footer) => {
          let node: Element | null = footer;
          while (node) {
            const style = getComputedStyle(node);
            if (Number(style.opacity) <= 0.01 || style.visibility === "hidden" || style.display === "none") return false;
            node = node.parentElement;
          }
          return true;
        })
        .map((footer) => footer.closest("[data-scene]")!.id);
      results.push({
        active: document.querySelector(".scene.is-active")!.id,
        leaving: document.querySelectorAll(".scene.is-leaving").length,
        painted,
      });
    };
    for (const direction of ["next", "prev", "next", "next", "prev"]) {
      document.querySelector<HTMLButtonElement>(`[data-scene-${direction}]`)!.click();
      readFrame();
      const until = performance.now() + 80;
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame);
        readFrame();
      }
    }
    return results;
  });
  expect(samples.some((sample) => sample.leaving > 0)).toBe(true);
  for (const sample of samples) {
    expect(sample.painted, `outgoing footer must disappear immediately while ${sample.active} is active`).toEqual([sample.active]);
  }
  await assertActiveScene(page, 2);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width}px: project frame and header remain stationary during rapid project switches`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/#projects");
    await waitForJourney(page);
    await assertActiveScene(page, 1);
    const sequence = await page.evaluate(async () => {
      await document.fonts.ready;
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const painted = (element: Element) => {
        let node: Element | null = element;
        while (node) {
          const style = getComputedStyle(node);
          if (Number(style.opacity) <= 0.01 || style.visibility === "hidden" || style.display === "none") return false;
          node = node.parentElement;
        }
        return true;
      };
      const readFrame = () => {
        const active = document.querySelector(".scene.is-active")!;
        const frame = active.querySelector(".project-panel")!;
        const header = active.querySelector(".project-section-header")!;
        return {
          active: active.id,
          frame: rect(frame),
          header: rect(header),
          paintedFrames: [...document.querySelectorAll(".project-panel")].filter(painted).map((element) => element.closest("[data-scene]")!.id),
          paintedHeaders: [...document.querySelectorAll(".project-section-header")].filter(painted).map((element) => element.closest("[data-scene]")!.id),
        };
      };
      const baseline = readFrame();
      const samples: ReturnType<typeof readFrame>[] = [];
      for (const direction of ["next", "next", "prev", "prev", "next", "next", "prev"]) {
        document.querySelector<HTMLButtonElement>(`[data-scene-${direction}]`)!.click();
        samples.push(readFrame());
        const until = performance.now() + 80;
        while (performance.now() < until) {
          await new Promise(requestAnimationFrame);
          samples.push(readFrame());
        }
      }
      return { baseline, samples };
    });
    expect(new Set(sequence.samples.map((sample) => sample.active)).size).toBe(3);
    for (const sample of sequence.samples) {
      expect(sample.paintedFrames, "the outgoing project must not paint a second outer frame").toEqual([sample.active]);
      expect(sample.paintedHeaders, "only the current project header may be painted").toEqual([sample.active]);
      for (const part of ["frame", "header"] as const) {
        for (const property of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(sample[part][property] - sequence.baseline[part][property]),
            `${part} ${property} must stay fixed while switching to ${sample.active}`).toBeLessThanOrEqual(1);
        }
      }
    }
    await assertActiveScene(page, 2);

    // Leaving the project collection still changes the whole scene; returning
    // restores the same frame rather than leaving an overlay above other stages.
    const stages = page.getByRole("navigation", { name: "章节导航", exact: true });
    for (const [name, index] of [["共建", 4], ["简介", 0], ["项目", 1]] as const) {
      await stages.getByRole("link", { name, exact: true }).click();
      await assertActiveScene(page, index);
      await expect(page.locator(".scene.is-active .project-panel")).toHaveCount(index === 1 ? 1 : 0);
    }
    await expect.poll(async () => {
      const box = await page.locator(".scene.is-active .project-panel").boundingBox();
      if (!box) return Infinity;
      return Math.max(...(["x", "y", "width", "height"] as const).map((property) =>
        Math.abs(box[property] - sequence.baseline.frame[property]),
      ));
    }).toBeLessThanOrEqual(1);
  });
}

test("fresh wheel input and a reversal interrupt an unfinished chapter transition", async ({ page }) => {
  await page.goto("/#projects");
  await waitForJourney(page);
  const samples = await wheelStream(page, [
    { delta: 120, after: 0 },
    { delta: 120, after: 250 },
    { delta: -120, after: 50 },
  ]);
  expect(samples.map((sample) => sample.index)).toEqual([2, 3, 2]);
  expect(samples[1]!.time - samples[0]!.time).toBeLessThan(700);
  expect(samples.every((sample) => sample.leaving > 0)).toBe(true);
  await assertActiveScene(page, 2);
});

test("continuous deliberate wheel input advances without waiting for a quiet gap", async ({ page }) => {
  await page.goto("/#projects");
  await waitForJourney(page);
  // Two ordinary three-line mouse notches must accumulate enough intent,
  // followed by sustained input without a pause between chapter changes.
  const samples = await wheelStream(page, [
    { delta: 3, mode: 1, after: 0 },
    { delta: 3, mode: 1, after: 90 },
    ...Array.from({ length: 5 }, () => ({ delta: 120, after: 90 })),
  ]);
  expect(samples.slice(0, 2).map((sample) => sample.index)).toEqual([1, 2]);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]!.time - samples[index - 1]!.time).toBeLessThan(200);
  }
  expect(samples.at(-1)!.index).toBe(4);
  await assertActiveScene(page, 4);

  await page.goto("/#projects");
  await waitForJourney(page);
  const sustained = await wheelStream(page, Array.from({ length: 42 }, (_, index) => ({
    delta: 120, after: index ? 16 : 0,
  })));
  expect(sustained.at(-1)!.index, "a sustained trackpad gesture must keep responding without a quiet interval").toBeGreaterThanOrEqual(3);
  expect(sustained.at(-1)!.time - sustained[0]!.time).toBeLessThan(1_200);
});

test("a decaying wheel tail does not skip chapters but renewed intent advances again", async ({ page }) => {
  await page.goto("/#projects");
  await waitForJourney(page);
  const samples = await wheelStream(page, [120, 90, 65, 44, 29, 18, 10, 5, 100].map((delta, index) => ({
    delta, after: index ? 45 : 0,
  })));
  expect(samples.slice(0, -1).map((sample) => sample.index)).toEqual(Array(8).fill(2));
  expect(samples.at(-1)!.index).toBe(3);
  await assertActiveScene(page, 3);
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

test("macro stages and project selection stay distinct through deep links, keyboard use and history", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#cortina");
  await waitForJourney(page);
  await assertActiveScene(page, 3);
  const selectProject = async (name: string, index: number) => {
    await page.getByRole("navigation", { name: "项目选择", exact: true })
      .getByRole("link", { name, exact: true }).focus();
    await page.keyboard.press("Enter");
    await assertActiveScene(page, index);
    await expect(page).toHaveURL(new RegExp(`/#${sceneIds[index]}$`));
  };
  await selectProject("Cortico", 1);
  await selectProject("Coopanion", 2);
  await page.goBack();
  await assertActiveScene(page, 1);
  await page.goBack();
  await assertActiveScene(page, 3);
  await page.goForward();
  await assertActiveScene(page, 1);

  const stages = page.getByRole("navigation", { name: "章节导航", exact: true });
  for (const [name, index] of [["共建", 4], ["简介", 0], ["项目", 1]] as const) {
    await stages.getByRole("link", { name, exact: true }).focus();
    await page.keyboard.press("Enter");
    await assertActiveScene(page, index);
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
  // Enable normal motion for the native-scroll segment: reduced motion would
  // hide a regression where the actor takes 850 ms to catch up with its island.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await assertTravelerAtAnchor(page);
  await page.evaluate(() => {
    const observed = window as Window & {
      __palFirstScrollFrame?: { scrollTop: number; offset: number };
    };
    const scene = document.querySelector<HTMLElement>("#projects")!;
    scene.addEventListener("scroll", () => {
      requestAnimationFrame(() => {
        const actor = document.querySelector<HTMLElement>("[data-traveler]")!.getBoundingClientRect();
        const anchor = scene.querySelector<SVGGraphicsElement>("[data-traveler-anchor]")!.getBoundingClientRect();
        observed.__palFirstScrollFrame = {
          scrollTop: scene.scrollTop,
          offset: Math.max(
            Math.abs(actor.x - anchor.x), Math.abs(actor.y - anchor.y),
            Math.abs(actor.width - anchor.width), Math.abs(actor.height - anchor.height),
          ),
        };
      });
    }, { once: true, passive: true });
  });
  // A synthetic swipe checks event routing; a real wheel scroll verifies native overflow.
  await page.mouse.move(150, 300);
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __palFirstScrollFrame?: { scrollTop: number } }).__palFirstScrollFrame?.scrollTop ?? 0,
  )).toBeGreaterThan(0);
  const firstScrollOffset = await page.evaluate(() =>
    (window as Window & { __palFirstScrollFrame?: { offset: number } }).__palFirstScrollFrame!.offset,
  );
  expect(firstScrollOffset, "the traveler must follow native inner scrolling by the first rendered frame").toBeLessThanOrEqual(1);
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

test("the hero tells an automatic story: wake, landing, island, growth and a new friend", async ({
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
  const movement = await traveler.evaluate((element) => {
    const style = getComputedStyle(element);
    return { properties: style.transitionProperty, timing: style.transitionTimingFunction };
  });
  expect(movement.properties).toContain("transform");
  expect(movement.timing).toContain("cubic-bezier(");
  expect(movement.timing).not.toContain("steps(");
  const gazeTiming = await eyes.evaluate((element) => getComputedStyle(element).animationTimingFunction);
  expect(gazeTiming).not.toContain("steps(");
  await expectPainted(island, false);
  await at(2_600);
  await expect(root).toHaveAttribute("data-intro-phase", "landing");
  await expectPainted(world.locator("[data-story-landing]"), true);
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
  await expect(page.locator("[data-story-seed], .traveler-signal, .garden-seed")).toHaveCount(0);
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

test("the shared traveler changes gear in sequence and respects interrupted navigation and motion preferences", async ({ page }) => {
  const variants = [null, "cortico", "coopanion", "cortina", "join"] as const;
  const readGear = () => page.locator("[data-traveler] [data-traveler-gear]").evaluateAll((groups) =>
    groups.map((group) => {
      const style = getComputedStyle(group);
      let visible = true;
      let node: Element | null = group;
      while (node) {
        const ancestor = getComputedStyle(node);
        if (ancestor.display === "none" || ancestor.visibility === "hidden" || Number(ancestor.opacity) <= 0.01) visible = false;
        node = node.parentElement;
      }
      return { variant: group.getAttribute("data-traveler-gear"), visible, opacity: Number(style.opacity), transform: style.transform };
    }),
  );
  const assertGear = async (index: number) => {
    await expect(page.locator("[data-traveler]")).toHaveCount(1);
    await expect(page.locator("[data-traveler] [data-traveler-gear]")).toHaveCount(4);
    await expect.poll(async () => (await readGear()).every((gear) =>
      gear.variant === variants[index] ? gear.visible && gear.opacity >= 0.98 : !gear.visible,
    )).toBe(true);
  };
  const recordChanges = (steps: { action: "next" | "prev" | "home"; observeFor: number }[]) => page.evaluate(async (changes) => {
    const capture = () => ({
      index: Number(document.querySelector<HTMLElement>("main[data-journey]")!.dataset.activeScene),
      gears: [...document.querySelectorAll("[data-traveler] [data-traveler-gear]")].map((group) => {
        const style = getComputedStyle(group);
        return {
          variant: group.getAttribute("data-traveler-gear"),
          visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01,
          opacity: Number(style.opacity), transform: style.transform,
        };
      }),
    });
    const initial = capture();
    const samples: ReturnType<typeof capture>[] = [];
    const destinations: number[] = [];
    for (const step of changes) {
      if (step.action === "home") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      else document.querySelector<HTMLButtonElement>(`[data-scene-${step.action}]`)!.click();
      samples.push(capture());
      destinations.push(samples.at(-1)!.index);
      const deadline = performance.now() + step.observeFor;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        samples.push(capture());
      }
    }
    return { initial, samples, destinations };
  }, steps);
  const assertNoRunningActorAnimation = async () => {
    // Intentional chapter travel may continue while ambient motion is paused.
    await assertTravelerAtAnchor(page);
    await expect.poll(() => page.locator("[data-traveler]").evaluate((actor) =>
      actor.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
    )).toBe(0);
  };

  for (let index = 1; index < sceneIds.length; index += 1) {
    await page.goto(`/#${sceneIds[index]}`);
    await waitForJourney(page);
    await assertGear(index);
  }
  await page.goto("/#projects");
  await waitForJourney(page);
  await assertGear(1);
  const transition = await recordChanges([{ action: "next", observeFor: 750 }]);
  expect(transition.destinations).toEqual([2]);
  for (const sample of transition.samples) {
    expect(sample.gears.filter((gear) => gear.visible).length, "old and new accessories must not be painted together").toBeLessThanOrEqual(1);
  }
  for (const variant of ["cortico", "coopanion"]) {
    expect(transition.samples.some((sample) => sample.gears.some((gear) =>
      gear.variant === variant && gear.visible && gear.opacity > 0.05 && gear.opacity < 0.95,
    )), `${variant} must have a visible intermediate fade, not an abrupt replacement`).toBe(true);
  }
  const incomingStart = transition.initial.gears.find((gear) => gear.variant === "coopanion")!.transform;
  const incomingEnd = transition.samples.at(-1)!.gears.find((gear) => gear.variant === "coopanion")!.transform;
  expect(incomingStart).not.toBe(incomingEnd);
  expect(transition.samples.some((sample) => sample.gears.some((gear) =>
    gear.variant === "coopanion" && gear.visible && gear.transform !== incomingStart && gear.transform !== incomingEnd,
  )), "incoming gear must move through an intermediate pose").toBe(true);
  const firstIncoming = transition.samples.findIndex((sample) => sample.gears.some((gear) => gear.variant === "coopanion" && gear.visible));
  const lastOutgoing = transition.samples.findLastIndex((sample) => sample.gears.some((gear) => gear.variant === "cortico" && gear.visible));
  expect(firstIncoming).toBeGreaterThan(lastOutgoing);
  await assertGear(2);

  // Each new intent arrives before the preceding transition can finish.
  const interrupted = await recordChanges([
    { action: "next", observeFor: 90 }, { action: "prev", observeFor: 90 },
    { action: "next", observeFor: 90 }, { action: "home", observeFor: 750 },
  ]);
  expect(interrupted.destinations).toEqual([3, 2, 3, 0]);
  for (const sample of interrupted.samples) {
    expect(sample.gears.filter((gear) => gear.visible).length, "interruptions must not leave overlapping gear").toBeLessThanOrEqual(1);
  }
  await assertActiveScene(page, 0);
  await assertGear(0);
  expect(interrupted.samples.at(-1)!.gears.filter((gear) => gear.visible)).toEqual([]);

  await page.locator("[data-motion-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-paused", "true");
  for (const mode of ["paused", "reduced"] as const) {
    if (mode === "reduced") {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await waitForJourney(page);
    }
    for (let index = 0; index < sceneIds.length; index += 1) {
      if (index) {
        const immediate = await recordChanges([{ action: "next", observeFor: 0 }]);
        const shown = immediate.samples[0]!.gears.filter((gear) => gear.visible);
        expect(shown.map((gear) => gear.variant), `${mode} switches directly to the target gear`).toEqual([variants[index]]);
        expect(shown[0]!.opacity).toBe(1);
      }
      await assertActiveScene(page, index);
      await assertGear(index);
      await assertNoRunningActorAnimation();
    }
  }
});

test("chapter hops settle, replace interrupted motion and clear when motion is disabled", async ({ page }) => {
  await page.goto("/#projects");
  await waitForJourney(page);
  const travel = page.locator("[data-traveler-travel]");
  const toggle = page.locator("[data-motion-toggle]");
  const readTravel = () => travel.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
    return {
      animations: element.getAnimations().length,
      atRest: matrix.isIdentity,
      // Count a visible change in position, scale or lean, not merely a running timer.
      moving: Math.max(Math.abs(matrix.f), Math.abs(matrix.b) * 144, Math.abs(matrix.a - 1) * 144) > 1,
    };
  });
  const assertRest = () => expect.poll(readTravel).toEqual({ animations: 0, atRest: true, moving: false });
  const assertMoving = () => expect.poll(readTravel, { intervals: [16, 33, 50] })
    .toEqual({ animations: 1, atRest: false, moving: true });
  const assertNoTransientPixels = () => expect.poll(() =>
    page.locator("[data-traveler] .gear-transient").evaluateAll((effects) =>
      effects.length > 0 && effects.every((effect) => Number(getComputedStyle(effect).opacity) === 0),
    ),
  ).toBe(true);

  await assertRest();
  await page.locator("[data-scene-next]").click();
  await assertMoving();
  await assertRest();
  await assertActiveScene(page, 2);
  await assertTravelerAtAnchor(page);

  // Exercise real chapter controls within a few frames, before any hop can finish.
  const reversals = await page.evaluate(async () => {
    const samples: { scene: string | undefined; animations: number }[] = [];
    for (const direction of ["prev", "next", "prev"]) {
      document.querySelector<HTMLButtonElement>(`[data-scene-${direction}]`)!.click();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      samples.push({
        scene: document.querySelector<HTMLElement>("main[data-journey]")!.dataset.activeScene,
        animations: document.querySelector<SVGGElement>("[data-traveler-travel]")!.getAnimations().length,
      });
    }
    return samples;
  });
  expect(reversals.map((sample) => sample.scene)).toEqual(["1", "2", "1"]);
  expect(reversals.map((sample) => sample.animations), "a reversal must replace the previous hop, never stack poses").toEqual([1, 1, 1]);
  await assertMoving();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-paused", "true");
  await assertRest();
  await assertNoTransientPixels();

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-paused", "false");
  await page.locator("[data-scene-next]").click();
  await assertMoving();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await assertRest();
  await assertNoTransientPixels();
  await nextScene(page, 3);
  await assertRest();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("[data-scene-prev]").click();
  await assertMoving();
  // The app uses this root state for its background-page playback policy.
  await page.evaluate(() => { document.documentElement.dataset.documentHidden = "true"; });
  await assertRest();
  await assertNoTransientPixels();
  await nextScene(page, 3);
  await assertRest();
  await page.evaluate(() => { document.documentElement.dataset.documentHidden = "false"; });
  await assertRest();
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
    "页面未找到。",
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
