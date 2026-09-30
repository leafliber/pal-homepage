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
  if (!main) return () => {};
  const stage = main;
  const traveler = stage.querySelector<HTMLElement>("[data-traveler]");
  if (!traveler) return () => {};
  mountedStories.get(stage)?.();

  const root = document.documentElement;
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const travelPose = traveler.querySelector<SVGGElement>("[data-traveler-travel]");
  let travelAnimation: Animation | undefined;
  let lastScene = stage.dataset.activeScene;
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

  const stopTravel = () => {
    travelAnimation?.cancel();
    travelAnimation = undefined;
  };
  const hopToScene = () => {
    stopTravel();
    if (!travelPose || reducedMotion.matches || isHidden() || root.dataset.paused === "true") return;
    const lean = stage.dataset.direction === "backward" ? -3 : 3;
    // The outer actor follows its anchor; this inner layer adds anticipation,
    // a short arc and a soft landing without moving the layout or its outfits.
    travelAnimation = travelPose.animate([
      { transform: "translateY(0) scale(1, 1) rotate(0deg)", offset: 0 },
      { transform: `translateY(2px) scale(1.03, .95) rotate(${lean}deg)`, offset: .12, easing: "ease-out" },
      { transform: `translateY(-15px) scale(.98, 1.03) rotate(${lean}deg)`, offset: .42, easing: "ease-in" },
      { transform: "translateY(2px) scale(1.04, .94) rotate(0deg)", offset: .82, easing: "ease-out" },
      { transform: "translateY(0) scale(1, 1) rotate(0deg)", offset: 1 },
    ], { duration: 850, easing: "linear" });
  };

  const positionTraveler = () => {
    if (signal.aborted) return false;
    const anchor = currentScene()?.querySelector<SVGGraphicsElement>(
      "rect[data-traveler-anchor]",
    );
    if (!anchor) return false;
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width <= 0 || anchorRect.height <= 0) return false;
    const stageRect = stage.getBoundingClientRect();
    const values = {
      "--traveler-x":
        anchorRect.left - stageRect.left - stage.clientLeft + stage.scrollLeft,
      "--traveler-y":
        anchorRect.top - stageRect.top - stage.clientTop + stage.scrollTop,
      "--traveler-width": anchorRect.width,
    };
    let changed = false;
    for (const [name, value] of Object.entries(values)) {
      const pixels = `${Math.round(value * 100) / 100}px`;
      if (stage.style.getPropertyValue(name) !== pixels) {
        stage.style.setProperty(name, pixels);
        changed = true;
      }
    }
    return changed;
  };

  const followSceneScroll = (event: Event) => {
    const scene = currentScene();
    if (!(event.target instanceof Node) || !scene?.contains(event.target)) return;
    // Resetting a chapter's scrollTop during navigation may dispatch a later
    // scroll event. If scene activation already measured it, preserve the trip.
    if (!positionTraveler() || root.dataset.intro === "playing") return;
    // Scroll correction follows the island immediately. Only finish the outer
    // actor's position transitions; SVG animation and future chapter travel stay.
    for (const animation of traveler.getAnimations()) {
      if (
        animation instanceof CSSTransition &&
        ["transform", "width", "left", "top"].includes(animation.transitionProperty)
      ) animation.finish();
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
    if (root.dataset.paused === "true" || reducedMotion.matches || isHidden()) stopTravel();
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
    if (stage.dataset.activeScene !== lastScene) {
      lastScene = stage.dataset.activeScene;
      hopToScene();
    }
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
  stage.addEventListener("scroll", followSceneScroll, {
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
    stopTravel();
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
