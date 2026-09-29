const mountedJourneys = new WeakMap<HTMLElement, () => void>();
const sceneNames = ["START", "CORTICO", "COOPANION", "CORTINA", "CO-BUILD"];
const aliases: Record<string, string> = {
  cortico: "projects",
  philosophy: "join",
};

/** Enhance the readable document into a five-scene, fixed-background journey. */
export function initPixelJourney(
  main = document.querySelector<HTMLElement>("main[data-journey]"),
): () => void {
  if (!main) return () => {};
  const stage = main;
  mountedJourneys.get(stage)?.();
  const scenes = Array.from(
    stage.querySelectorAll<HTMLElement>("[data-scene]"),
  );
  if (scenes.length < 2) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("[data-scene-link]"),
  );
  const previousButtons =
    document.querySelectorAll<HTMLButtonElement>("[data-scene-prev]");
  const nextButtons =
    document.querySelectorAll<HTMLButtonElement>("[data-scene-next]");
  let activeIndex = 0;
  let transitionTimer: number | undefined;
  let wheelTotal = 0;
  let lastWheelTime = -Infinity;
  let lastWheelMagnitude = 0;
  let lastWheelDirection = 0;
  let lastWheelNavigation = -Infinity;
  let wheelPeak = 0;
  let wheelDecaySteps = 0;
  let wheelTrough = Infinity;
  let wheelActiveDistance = 0;
  let wheelConsumed = false;
  let paused = root.dataset.paused === "true";
  let touch:
    | { x: number; y: number; target: EventTarget | null; canScroll: boolean }
    | undefined;

  const indexForHash = (hash: string): number => {
    let id: string;
    try {
      id = decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
      return -1;
    }
    if (!id) return 0;
    return scenes.findIndex((scene) => scene.id === (aliases[id] ?? id));
  };

  const setMotion = () => {
    root.dataset.paused = String(paused);
    document
      .querySelectorAll<HTMLButtonElement>("[data-motion-toggle]")
      .forEach((button) => {
        button.setAttribute("aria-pressed", String(paused));
        button.setAttribute("aria-label", paused ? "继续动画" : "暂停动画");
      });
    document
      .querySelectorAll<HTMLElement>("[data-motion-label]")
      .forEach((label) => {
        label.textContent = paused ? "继续动画" : "暂停动画";
      });
  };

  const updateControls = () => {
    const current = scenes[activeIndex];
    stage.dataset.activeScene = String(activeIndex);
    links.forEach((link) => {
      if (
        indexForHash(new URL(link.href, location.href).hash) === activeIndex
      ) {
        link.setAttribute("aria-current", "step");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    previousButtons.forEach((button) => {
      button.disabled = activeIndex === 0;
    });
    nextButtons.forEach((button) => {
      button.disabled = activeIndex === scenes.length - 1;
    });
    document
      .querySelectorAll<HTMLElement>("[data-scene-number]")
      .forEach((label) => {
        label.textContent = String(activeIndex + 1).padStart(2, "0");
      });
    document
      .querySelectorAll<HTMLElement>("[data-scene-label]")
      .forEach((label) => {
        label.textContent =
          current?.dataset.sceneLabel ?? sceneNames[activeIndex] ?? "";
      });
  };

  const focusScene = (scene: HTMLElement) => {
    const heading =
      scene.querySelector<HTMLElement>("[data-scene-heading], h1, h2") ?? scene;
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };

  const goTo = (
    index: number,
    options: { history?: boolean; focus?: boolean; initial?: boolean } = {},
  ): boolean => {
    const next = scenes[index];
    if (!next) return false;
    if (!options.initial && index === activeIndex) {
      if (options.focus) {
        next.scrollTop = 0;
        focusScene(next);
      }
      return false;
    }
    const previous = scenes[activeIndex];
    const focusWasInside = previous?.contains(document.activeElement) ?? false;
    window.clearTimeout(transitionTimer);
    scenes.forEach((scene) => scene.classList.remove("is-leaving"));
    stage.dataset.direction = index >= activeIndex ? "forward" : "backward";
    if (!options.initial && previous && previous !== next)
      previous.classList.add("is-leaving");
    activeIndex = index;

    // Reveal and focus the destination before hiding an outgoing focused control.
    next.inert = false;
    next.removeAttribute("aria-hidden");
    next.classList.add("is-active");
    next.scrollTop = 0;
    if (options.focus || focusWasInside) focusScene(next);
    scenes.forEach((scene) => {
      if (scene === next) return;
      scene.classList.remove("is-active");
      scene.inert = true;
      scene.setAttribute("aria-hidden", "true");
    });
    updateControls();
    if (options.history !== false && location.hash !== `#${next.id}`) {
      history.pushState(null, "", `#${next.id}`);
    }
    if (!options.initial) {
      transitionTimer = window.setTimeout(
        () => {
          scenes.forEach((scene) => scene.classList.remove("is-leaving"));
        },
        reducedMotion.matches ? 0 : 500,
      );
    }
    return true;
  };

  const canScroll = (element: HTMLElement, direction: number): boolean => {
    const overflow = getComputedStyle(element).overflowY;
    if (
      !/(auto|scroll)/.test(overflow) ||
      element.scrollHeight <= element.clientHeight + 2
    )
      return false;
    return direction < 0
      ? element.scrollTop > 1
      : element.scrollTop + element.clientHeight < element.scrollHeight - 2;
  };

  const scrollableFor = (
    target: EventTarget | null,
    direction: number,
  ): HTMLElement | undefined => {
    const scene = scenes[activeIndex];
    if (!scene) return undefined;
    let element = target instanceof Element ? target : null;
    if (!element || !scene.contains(element)) element = scene;
    while (element && scene.contains(element)) {
      if (element instanceof HTMLElement && canScroll(element, direction))
        return element;
      if (element === scene) break;
      element = element.parentElement;
    }
    return undefined;
  };

  document.addEventListener(
    "click",
    (event) => {
      if (
        !(event.target instanceof Element) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const skipLink = event.target.closest<HTMLAnchorElement>("a.skip-link");
      if (
        skipLink &&
        new URL(skipLink.href, location.href).hash === `#${stage.id}`
      ) {
        // Keep the current chapter's deep link and history when skipping the header.
        event.preventDefault();
        const scene = scenes[activeIndex];
        if (scene) {
          scene.scrollTop = 0;
          focusScene(scene);
        }
        return;
      }
      const link =
        event.target.closest<HTMLAnchorElement>("a[data-scene-link]");
      if (link) {
        const url = new URL(link.href, location.href);
        if (
          url.origin !== location.origin ||
          url.pathname !== location.pathname
        )
          return;
        const index = indexForHash(url.hash);
        if (index < 0) return;
        event.preventDefault();
        goTo(index, { focus: true });
      }
      if (event.target.closest("[data-scene-prev]")) goTo(activeIndex - 1);
      if (event.target.closest("[data-scene-next]")) goTo(activeIndex + 1);
      if (event.target.closest("[data-motion-toggle]")) {
        paused = !paused;
        setMotion();
      }
    },
    { signal },
  );

  document.addEventListener(
    "wheel",
    (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        event.deltaY === 0
      )
        return;
      if (document.querySelector(".site-header.menu-open")) {
        event.preventDefault();
        wheelTotal = 0;
        wheelConsumed = false;
        lastWheelTime = -Infinity;
        return;
      }
      const now = performance.now();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      const magnitude = Math.abs(delta);
      const direction = Math.sign(delta);
      const gap = now - lastWheelTime;
      const reversed = lastWheelDirection !== 0 && direction !== lastWheelDirection;
      const canStartSameDirection = now - lastWheelNavigation >= 80;
      // Continued finger pressure can be one uninterrupted stream. Accumulate
      // stable/rising input, while each meaningful decrease discards momentum.
      wheelActiveDistance = magnitude >= 8 && magnitude >= lastWheelMagnitude - 0.1
        ? wheelActiveDistance + Math.min(magnitude, 120)
        : 0;
      const sustainedForce =
        wheelConsumed && now - lastWheelNavigation >= 280 && wheelActiveDistance >= 480;
      // Browser wheel events do not identify new gestures. A direction reversal,
      // a separate strong pulse, or renewed force after a decaying tail is intent
      // to move again; the outgoing scene's animation does not lock navigation.
      const separatePulse = gap >= 60 && magnitude >= lastWheelMagnitude * 0.98;
      const renewedForce =
        wheelTrough < Infinity &&
        magnitude >= Math.max(24, wheelTrough * 1.8) &&
        magnitude - wheelTrough >= 18;
      if (
        reversed ||
        (canStartSameDirection && (gap >= 120 || separatePulse || renewedForce || sustainedForce))
      ) {
        // Small wheel notches can add up until they actually cross a chapter.
        if (wheelConsumed || reversed || gap >= 120) wheelTotal = 0;
        wheelConsumed = false;
        wheelPeak = magnitude;
        wheelDecaySteps = 0;
        wheelTrough = Infinity;
        wheelActiveDistance = 0;
      } else {
        wheelPeak = Math.max(wheelPeak, magnitude);
        if (magnitude < lastWheelMagnitude - 1) wheelDecaySteps += 1;
        else if (magnitude > lastWheelMagnitude + 1) wheelDecaySteps = 0;
        if (wheelDecaySteps >= 2 && magnitude <= wheelPeak * 0.65) {
          wheelTrough = Math.min(wheelTrough, magnitude);
        }
      }
      lastWheelTime = now;
      lastWheelMagnitude = magnitude;
      lastWheelDirection = direction;
      if (wheelConsumed) {
        event.preventDefault();
        return;
      }
      const scroller = scrollableFor(event.target, delta);
      if (scroller) {
        wheelTotal = 0;
        if (
          !(event.target instanceof Node) ||
          !scroller.contains(event.target)
        ) {
          event.preventDefault();
          scroller.scrollTop += delta;
        }
        return;
      }
      event.preventDefault();
      if (Math.sign(wheelTotal) !== Math.sign(delta)) wheelTotal = 0;
      wheelTotal += Math.max(-90, Math.min(90, delta));
      if (Math.abs(wheelTotal) < 70) return;
      wheelConsumed = true;
      lastWheelNavigation = now;
      goTo(activeIndex + Math.sign(wheelTotal));
      wheelTotal = 0;
    },
    { passive: false, signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider']",
        )
      )
        return;
      const direction =
        event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        (event.key === " " && !event.shiftKey)
          ? 1
          : event.key === "ArrowUp" ||
              event.key === "PageUp" ||
              (event.key === " " && event.shiftKey)
            ? -1
            : 0;
      if (direction) {
        const scroller = scrollableFor(event.target, direction);
        event.preventDefault();
        if (scroller) {
          scroller.scrollTop +=
            direction *
            (event.key.startsWith("Arrow") ? 60 : scroller.clientHeight * 0.8);
        } else if (!event.repeat) {
          goTo(activeIndex + direction, { focus: true });
        }
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        goTo(event.key === "Home" ? 0 : scenes.length - 1, { focus: true });
      }
    },
    { signal },
  );

  document.addEventListener(
    "touchstart",
    (event) => {
      if (document.querySelector(".site-header.menu-open")) {
        touch = undefined;
        return;
      }
      const point = event.touches.length === 1 ? event.touches[0] : undefined;
      touch = point
        ? {
            x: point.clientX,
            y: point.clientY,
            target: event.target,
            canScroll: false,
          }
        : undefined;
    },
    { passive: true, signal },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      const point = event.touches.length === 1 ? event.touches[0] : undefined;
      if (!touch || !point) return;
      const dy = touch.y - point.clientY;
      const dx = touch.x - point.clientX;
      if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < 8) return;
      // A swipe that begins by scrolling a tall scene stays native for its duration.
      if (scrollableFor(touch.target, dy)) touch.canScroll = true;
      if (!touch.canScroll) event.preventDefault();
    },
    { passive: false, signal },
  );
  document.addEventListener(
    "touchend",
    (event) => {
      const start = touch;
      touch = undefined;
      const point = event.changedTouches[0];
      if (
        !start ||
        !point ||
        start.canScroll ||
        document.querySelector(".site-header.menu-open")
      )
        return;
      const dy = start.y - point.clientY;
      if (
        Math.abs(dy) < 55 ||
        Math.abs(dy) < Math.abs(start.x - point.clientX) * 1.2
      )
        return;
      goTo(activeIndex + Math.sign(dy));
    },
    { passive: true, signal },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      touch = undefined;
    },
    { passive: true, signal },
  );

  const syncHash = () => {
    const index = indexForHash(location.hash);
    if (index >= 0) goTo(index, { history: false });
  };
  window.addEventListener("hashchange", syncHash, { signal });
  window.addEventListener("popstate", syncHash, { signal });

  const syncVisibility = () => {
    root.dataset.documentHidden = String(document.hidden);
  };
  document.addEventListener("visibilitychange", syncVisibility, { signal });

  root.dataset.journey = "ready";
  syncVisibility();
  setMotion();
  goTo(Math.max(0, indexForHash(location.hash)), {
    history: false,
    initial: true,
  });
  window.scrollTo(0, 0);

  const destroy = () => {
    controller.abort();
    window.clearTimeout(transitionTimer);
    scenes.forEach((scene) => {
      scene.inert = false;
      scene.removeAttribute("aria-hidden");
      scene.classList.remove("is-leaving");
    });
    delete root.dataset.journey;
    delete root.dataset.documentHidden;
    mountedJourneys.delete(stage);
  };
  document.addEventListener("astro:before-swap", destroy, {
    once: true,
    signal,
  });
  mountedJourneys.set(stage, destroy);
  return destroy;
}
