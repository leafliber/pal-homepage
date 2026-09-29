export type CorePhase = "rest" | "blink" | "greet";
const descriptions: Record<CorePhase, string> = {
  rest: "眨眨眼，打个招呼。",
  blink: "眨眨眼，打个招呼。",
  greet: "你好，很高兴见到你。",
};
const active = new WeakMap<HTMLElement, AbortController>();
const greetingDuration = 1400;

export function initCore(element: HTMLElement): void {
  active.get(element)?.abort();
  const controller = new AbortController();
  active.set(element, controller);
  const description = element.querySelector<HTMLElement>(
    "[data-core-description]",
  );
  const controls = element.querySelector<HTMLElement>("[data-core-controls]");
  const greet = element.querySelector<HTMLButtonElement>("[data-core-greet]");
  const pause = element.querySelector<HTMLButtonElement>("[data-core-pause]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(pointer: coarse), (max-width: 767px)");
  if (controls) controls.hidden = false;
  let requested = false;
  let requestVersion = 0;
  let paused = element.dataset.corePaused === "true";
  let idle: number | undefined, timer: number | undefined;
  let fallbackTimer: number | undefined;
  let fallbackActive = false;
  let fallbackRemaining = 0,
    fallbackStarted = 0;
  let visible = true;
  let disposeVisual: (() => void) | undefined;

  const setPhase = (phase: CorePhase) => {
    element.dataset.corePhase = phase;
    if (description) description.textContent = descriptions[phase];
    if (phase === "rest") description?.removeAttribute("aria-live");
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
    if (fallbackTimer !== undefined) {
      fallbackRemaining = Math.max(
        0,
        fallbackRemaining - (performance.now() - fallbackStarted),
      );
      window.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
  };
  const resumeFallback = () => {
    if (
      !fallbackActive ||
      fallbackTimer !== undefined ||
      paused ||
      document.hidden ||
      !visible
    )
      return;
    fallbackStarted = performance.now();
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = undefined;
      fallbackActive = false;
      setPhase("rest");
      if (pause) pause.hidden = true;
      schedule();
    }, fallbackRemaining);
  };
  greet?.addEventListener(
    "click",
    () => {
      paused = false;
      updatePause();
      if (description) description.setAttribute("aria-live", "polite");
      if (element.dataset.webgl === "ready") {
        element.dispatchEvent(new CustomEvent("core:pause", { detail: false }));
        element.dispatchEvent(new CustomEvent("core:greet"));
      } else if (reduced.matches) {
        clearFallbackTimer();
        fallbackActive = false;
        setPhase("greet");
      } else {
        clearFallbackTimer();
        fallbackActive = true;
        fallbackRemaining = greetingDuration;
        // Reset the finite CSS gesture before a repeated greeting.
        element.dataset.corePhase = "rest";
        void element.offsetWidth;
        setPhase("greet");
        if (pause) pause.hidden = false;
        resumeFallback();
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
      else resumeFallback();
    },
    { signal: controller.signal },
  );
  element.addEventListener(
    "core:phase",
    (event) => {
      const phase = (event as CustomEvent<CorePhase>).detail;
      if (phase in descriptions) setPhase(phase);
    },
    { signal: controller.signal },
  );

  const canEnhance = () =>
    !controller.signal.aborted &&
    element.isConnected &&
    !document.hidden &&
    visible &&
    !fallbackActive &&
    !reduced.matches &&
    !mobile.matches;
  const enhance = () => {
    idle = undefined;
    timer = undefined;
    if (requested || !canEnhance()) return;
    requested = true;
    const version = requestVersion;
    import("./core-webgl")
      .then(({ mountCore }) => {
        if (version !== requestVersion) return;
        if (canEnhance()) disposeVisual = mountCore(element);
        else requested = false;
      })
      .catch(() => {
        if (version === requestVersion) delete element.dataset.webgl;
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
      resumeFallback();
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
  const mediaChange = () => {
    requestVersion++;
    disposeVisual?.();
    disposeVisual = undefined;
    requested = false;
    clearFallbackTimer();
    fallbackActive = false;
    setPhase("rest");
    if (pause) pause.hidden = true;
    schedule();
  };
  reduced.addEventListener("change", mediaChange, {
    signal: controller.signal,
  });
  mobile.addEventListener("change", mediaChange, { signal: controller.signal });
  controller.signal.addEventListener(
    "abort",
    () => {
      requestVersion++;
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
  setPhase("rest");
  updatePause();
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted)
    document
      .querySelectorAll<HTMLElement>("[data-living-core]")
      .forEach(initCore);
});
