export type CorePhase = "rest" | "sense" | "connect" | "respond";
const descriptions: Record<CorePhase, string> = {
  rest: "从感知，到连接，再到回应。",
  sense: "感知 · 让一个事件，被看见。",
  connect: "连接 · 把线索，串成理解。",
  respond: "回应 · 将理解，变成行动。",
};
const active = new WeakMap<HTMLElement, AbortController>();

export function initCore(element: HTMLElement): void {
  active.get(element)?.abort();
  const controller = new AbortController();
  active.set(element, controller);
  const description = element.querySelector<HTMLElement>(
    "[data-core-description]",
  );
  const controls = element.querySelector<HTMLElement>("[data-core-controls]");
  const send = element.querySelector<HTMLButtonElement>("[data-core-signal]");
  const pause = element.querySelector<HTMLButtonElement>("[data-core-pause]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(pointer: coarse), (max-width: 767px)");
  if (controls) controls.hidden = false;
  let requested = false,
    paused = element.dataset.corePaused === "true";
  let idle: number | undefined, timer: number | undefined;
  let fallbackTimer: number | undefined;
  let fallbackStep = -1;
  let fallbackRemaining = 0,
    fallbackStarted = 0;
  const phaseDurations = [1400, 1600, 1800];
  let visible = true;
  let disposeVisual: (() => void) | undefined;
  const setPhase = (phase: CorePhase) => {
    element.dataset.corePhase = phase;
    if (description) description.textContent = descriptions[phase];
  };
  const updatePause = () => {
    element.dataset.corePaused = String(paused);
    pause?.setAttribute("aria-pressed", String(paused));
    pause?.setAttribute("aria-label", paused ? "恢复核心动画" : "暂停核心动画");
    const label = pause?.querySelector("span");
    if (label) label.textContent = paused ? "继续" : "暂停";
    pause
      ?.querySelector("path")
      ?.setAttribute("d", paused ? "M3 1l8 5-8 5z" : "M3 2h2v8H3zm4 0h2v8H7z");
  };
  const clearFallbackTimer = () => {
    if (fallbackTimer !== undefined)
      fallbackRemaining = Math.max(
        0,
        fallbackRemaining - (performance.now() - fallbackStarted),
      );
    window.clearTimeout(fallbackTimer);
    fallbackTimer = undefined;
  };
  const advanceFallback = () => {
    clearFallbackTimer();
    if (fallbackStep < 0 || paused || document.hidden || !visible) return;
    const phases: CorePhase[] = ["sense", "connect", "respond", "rest"];
    setPhase(phases[fallbackStep] ?? "rest");
    if (fallbackStep >= 3) {
      fallbackStep = -1;
      if (pause) pause.hidden = true;
      description?.removeAttribute("aria-live");
      schedule();
      return;
    }
    fallbackStarted = performance.now();
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = undefined;
      fallbackStep++;
      fallbackRemaining = phaseDurations[fallbackStep] ?? 0;
      advanceFallback();
    }, fallbackRemaining);
  };
  send?.addEventListener(
    "click",
    () => {
      paused = false;
      updatePause();
      if (description) description.setAttribute("aria-live", "polite");
      if (element.dataset.webgl === "ready") {
        element.dispatchEvent(new CustomEvent("core:pause", { detail: false }));
        element.dispatchEvent(new CustomEvent("core:signal"));
      } else if (reduced.matches) {
        clearFallbackTimer();
        setPhase("respond");
      } else {
        clearFallbackTimer();
        fallbackStep = 0;
        fallbackRemaining = phaseDurations[0]!;
        // Restart even when the previous request is in the same CSS phase.
        element.dataset.corePhase = "rest";
        void element.offsetWidth;
        if (pause) pause.hidden = false;
        advanceFallback();
      }
    },
    { signal: controller.signal },
  );
  pause?.addEventListener(
    "click",
    () => {
      paused = !paused;
      updatePause();
      element.dispatchEvent(new CustomEvent("core:pause", { detail: paused }));
      if (paused) clearFallbackTimer();
      else advanceFallback();
    },
    { signal: controller.signal },
  );
  element.addEventListener(
    "core:phase",
    (event) => {
      const phase = (event as CustomEvent<CorePhase>).detail;
      setPhase(phase);
      if (phase === "rest") description?.removeAttribute("aria-live");
    },
    { signal: controller.signal },
  );

  const canEnhance = () =>
    !controller.signal.aborted &&
    element.isConnected &&
    !document.hidden &&
    visible &&
    fallbackStep < 0 &&
    !reduced.matches &&
    !mobile.matches;
  const enhance = () => {
    idle = undefined;
    timer = undefined;
    if (requested || !canEnhance()) return;
    requested = true;
    import("./core-webgl")
      .then(({ mountCore }) => {
        if (canEnhance()) {
          clearFallbackTimer();
          disposeVisual = mountCore(element);
        } else requested = false;
      })
      .catch(() => {
        delete element.dataset.webgl;
      });
  };
  const schedule = () => {
    if (requested || idle !== undefined || timer !== undefined || !canEnhance())
      return;
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(enhance, { timeout: 1500 });
    else timer = window.setTimeout(enhance, 120);
  };
  const visibility = () => {
    element.dataset.coreSuspended = String(document.hidden || !visible);
    if (document.hidden || !visible) clearFallbackTimer();
    else {
      advanceFallback();
      schedule();
    }
  };
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      visibility();
    },
    { threshold: 0.02 },
  );
  observer.observe(element);
  if (document.readyState === "complete") schedule();
  else
    window.addEventListener("load", schedule, {
      once: true,
      signal: controller.signal,
    });
  document.addEventListener("visibilitychange", visibility, {
    signal: controller.signal,
  });
  reduced.addEventListener(
    "change",
    () => {
      if (reduced.matches) {
        clearFallbackTimer();
        fallbackStep = -1;
        setPhase("rest");
        if (pause) pause.hidden = true;
      }
    },
    { signal: controller.signal },
  );
  controller.signal.addEventListener(
    "abort",
    () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
      clearFallbackTimer();
      observer.disconnect();
      disposeVisual?.();
    },
    { once: true },
  );
  window.addEventListener("pagehide", () => controller.abort(), {
    once: true,
    signal: controller.signal,
  });
  updatePause();
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted)
    document
      .querySelectorAll<HTMLElement>("[data-living-core]")
      .forEach(initCore);
});
