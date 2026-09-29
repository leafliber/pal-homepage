const mountedStories = new WeakMap<HTMLElement, () => void>();

const introSequence = [
  { phase: "blank", at: 0 },
  { phase: "wake", at: 450 },
  { phase: "look", at: 1350 },
  { phase: "landing", at: 2250 },
  { phase: "build", at: 3100 },
  { phase: "meet", at: 6800 },
  { phase: "ready", at: 8600 },
] as const;

/** Run the opening once and keep the shared character inside each story world. */
export function initPixelStory(
  main = document.querySelector<HTMLElement>("main[data-journey]"),
): () => void {
  if (!main || !main.querySelector("[data-traveler]")) return () => {};
  const stage = main;
  mountedStories.get(stage)?.();

  const root = document.documentElement;
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let completed = false;
  let phaseIndex = 0;
  let timer: number | undefined;
  let startedAt = 0;
  let remaining: number = introSequence[1].at;
  let observedArt: Element | null = null;
  let observedSVG: Element | null = null;

  const currentScene = () =>
    stage.querySelector<HTMLElement>(".scene.is-active");
  const isHome = () => currentScene()?.id === "home";
  const isHidden = () =>
    document.hidden || root.dataset.documentHidden === "true";

  const positionTraveler = () => {
    if (signal.aborted) return;
    const anchor = currentScene()?.querySelector<SVGGraphicsElement>(
      "rect[data-traveler-anchor]",
    );
    if (!anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width <= 0 || anchorRect.height <= 0) return;
    const stageRect = stage.getBoundingClientRect();
    const values = {
      "--traveler-x":
        anchorRect.left - stageRect.left - stage.clientLeft + stage.scrollLeft,
      "--traveler-y":
        anchorRect.top - stageRect.top - stage.clientTop + stage.scrollTop,
      "--traveler-width": anchorRect.width,
    };
    for (const [name, value] of Object.entries(values)) {
      const pixels = `${Math.round(value * 100) / 100}px`;
      if (stage.style.getPropertyValue(name) !== pixels)
        stage.style.setProperty(name, pixels);
    }
  };

  const resizeObserver = new ResizeObserver(positionTraveler);
  resizeObserver.observe(stage);

  const observeScene = () => {
    const art = currentScene()?.querySelector(".scene-art") ?? null;
    const svg = art?.querySelector("svg") ?? null;
    if (art !== observedArt) {
      if (observedArt) resizeObserver.unobserve(observedArt);
      observedArt = art;
      if (art) resizeObserver.observe(art);
    }
    if (svg !== observedSVG) {
      if (observedSVG) resizeObserver.unobserve(observedSVG);
      observedSVG = svg;
      if (svg) resizeObserver.observe(svg);
    }
    positionTraveler();
  };

  const clearTimer = () => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  };

  const finishIntro = () => {
    if (completed) return;
    completed = true;
    clearTimer();
    root.dataset.intro = "done";
    root.dataset.introPhase = "ready";
    positionTraveler();
  };

  const schedulePhase = () => {
    if (completed || signal.aborted || isHidden() || timer !== undefined)
      return;
    startedAt = performance.now();
    timer = window.setTimeout(() => {
      timer = undefined;
      phaseIndex += 1;
      const step = introSequence[phaseIndex];
      const next = introSequence[phaseIndex + 1];
      if (!step || !next) {
        finishIntro();
        return;
      }
      root.dataset.introPhase = step.phase;
      remaining = next.at - step.at;
      schedulePhase();
    }, remaining);
  };

  const syncPlayback = () => {
    if (root.dataset.paused === "true" || reducedMotion.matches) {
      // Pausing must reveal the page rather than leave essential content mid-intro.
      finishIntro();
      return;
    }
    if (completed) return;
    if (isHidden()) {
      if (timer !== undefined) {
        remaining = Math.max(0, remaining - (performance.now() - startedAt));
        clearTimer();
      }
    } else {
      schedulePhase();
    }
  };

  const sceneObserver = new MutationObserver((records) => {
    // Even a quick away-and-back sequence should count as skipping the opening.
    if (!isHome() || records.some((record) => record.oldValue !== "0"))
      finishIntro();
    observeScene();
  });
  sceneObserver.observe(stage, {
    attributes: true,
    attributeFilter: ["data-active-scene"],
    attributeOldValue: true,
  });

  const playbackObserver = new MutationObserver(syncPlayback);
  playbackObserver.observe(root, {
    attributes: true,
    attributeFilter: ["data-paused", "data-document-hidden"],
  });
  reducedMotion.addEventListener("change", syncPlayback, { signal });
  document.addEventListener("visibilitychange", syncPlayback, { signal });
  window.addEventListener("resize", positionTraveler, {
    passive: true,
    signal,
  });
  window.addEventListener("load", positionTraveler, { once: true, signal });
  stage.addEventListener("scroll", positionTraveler, {
    capture: true,
    passive: true,
    signal,
  });
  document.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".skip-link"))
        finishIntro();
    },
    { signal },
  );
  void document.fonts.ready.then(positionTraveler);

  observeScene();
  if (
    !isHome() ||
    reducedMotion.matches ||
    root.dataset.paused === "true" ||
    root.dataset.intro === "done"
  ) {
    finishIntro();
  } else {
    root.dataset.intro = "playing";
    root.dataset.introPhase = introSequence[0].phase;
    schedulePhase();
  }

  const destroy = () => {
    finishIntro();
    controller.abort();
    clearTimer();
    sceneObserver.disconnect();
    playbackObserver.disconnect();
    resizeObserver.disconnect();
    mountedStories.delete(stage);
  };
  document.addEventListener("astro:before-swap", destroy, {
    once: true,
    signal,
  });
  mountedStories.set(stage, destroy);
  return destroy;
}
