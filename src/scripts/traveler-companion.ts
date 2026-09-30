const mountedCompanions = new WeakMap<HTMLElement, () => void>();

const messages = {
  hello: "嗨，你好呀！\n欢迎来到 Pal 的小世界。",
  shy: "怎么一直看着我呀…\n我会害羞的啦 >///<",
} as const;
const idleDelay = 25_000;
const shyCooldown = 60_000;

/** A quiet, home-only companion. All recurring work stops off-screen. */
export function initTravelerCompanion(
  stage = document.querySelector<HTMLElement>("main[data-journey]"),
): () => void {
  if (!stage) return () => {};
  mountedCompanions.get(stage)?.();
  const traveler = stage.querySelector<HTMLElement>("[data-traveler]");
  const companion = stage.querySelector<HTMLElement>("[data-traveler-companion]");
  const bubble = stage.querySelector<HTMLElement>("[data-traveler-bubble]");
  const text = stage.querySelector<HTMLElement>("[data-bubble-text]");
  const announcement = stage.querySelector<HTMLElement>("[data-traveler-announcement]");
  if (!traveler || !companion || !bubble || !text || !announcement) return () => {};

  const root = document.documentElement;
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const timers = new Map<string, number>();
  let active = false;
  let greeted = false;
  let idleSpoken = false;
  let lastActivity = 0;
  let lastShyAt = -Infinity;
  let walk: Animation | undefined;
  let offset = { x: 0, y: 0 };
  let message = "";
  let letters: string[] = [];
  let letterIndex = 0;

  const isHome = () => stage.dataset.activeScene === "0";
  const isAvailable = () => isHome() && root.dataset.intro === "done" &&
    root.dataset.paused !== "true" && root.dataset.documentHidden !== "true" && !document.hidden;
  const clearTimer = (name: string) => {
    window.clearTimeout(timers.get(name));
    timers.delete(name);
  };
  const later = (name: string, delay: number, callback: () => void) => {
    clearTimer(name);
    timers.set(name, window.setTimeout(() => {
      timers.delete(name);
      if (!signal.aborted && active) callback();
    }, delay));
  };
  const transform = (point: typeof offset) =>
    `translate(${point.x / 144 * 100}%, ${point.y / 156 * 100}%)`;
  const stopWalk = (reset = false) => {
    clearTimer("walk");
    if (walk && !reset) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(companion).transform);
      offset = {
        x: companion.offsetWidth ? matrix.e / companion.offsetWidth * 144 : 0,
        y: companion.offsetHeight ? matrix.f / companion.offsetHeight * 156 : 0,
      };
    }
    walk?.cancel();
    walk = undefined;
    if (reset) offset = { x: 0, y: 0 };
    companion.style.transform = transform(offset);
    traveler.dataset.walking = "false";
  };

  const scheduleWalk = () => {
    if (!active || reducedMotion.matches || !bubble.hidden) return;
    later("walk", 3_200 + Math.random() * 2_800, () => {
      if (reducedMotion.matches || !bubble.hidden) return;
      // Quantized points inside a small ellipse keep every step on the island.
      const angle = Math.random() * Math.PI * 2;
      const radius = .45 + Math.random() * .55;
      const destination = {
        x: Math.round(Math.cos(angle) * 24 * radius / 3) * 3,
        y: Math.round(Math.sin(angle) * 9 * radius / 3) * 3,
      };
      if (Math.hypot(destination.x - offset.x, destination.y - offset.y) < 6) {
        scheduleWalk();
        return;
      }
      traveler.dataset.walkDirection = destination.x < offset.x ? "left" : "right";
      traveler.dataset.walking = "true";
      const animation = companion.animate([
        { transform: transform(offset) },
        { transform: transform(destination) },
      ], { duration: 1_000 + Math.random() * 350, easing: "steps(12, end)", fill: "forwards" });
      walk = animation;
      void animation.finished.then(() => {
        if (walk !== animation || signal.aborted) return;
        offset = destination;
        companion.style.transform = transform(offset);
        animation.cancel();
        walk = undefined;
        traveler.dataset.walking = "false";
        scheduleWalk();
      }).catch(() => { /* Cancellation is expected on navigation or pause. */ });
    });
  };

  const hideBubble = () => {
    clearTimer("bubble");
    bubble.hidden = true;
    bubble.dataset.state = "hidden";
    traveler.dataset.mood = "quiet";
    text.textContent = "";
    announcement.textContent = "";
  };
  const dismissBubble = () => {
    clearTimer("bubble");
    bubble.dataset.state = "leaving";
    later("bubble", reducedMotion.matches ? 0 : 240, () => {
      hideBubble();
      scheduleWalk();
    });
  };
  const holdBubble = () => {
    text.textContent = message;
    bubble.dataset.state = "holding";
    later("bubble", 4_200, dismissBubble);
  };
  const typeLetter = () => {
    if (reducedMotion.matches) {
      holdBubble();
      return;
    }
    bubble.dataset.state = "typing";
    letterIndex += 1;
    text.textContent = letters.slice(0, letterIndex).join("");
    if (letterIndex === letters.length) {
      holdBubble();
      return;
    }
    const punctuation = /[，。！…\n]/.test(letters[letterIndex - 1]!);
    later("bubble", punctuation ? 200 : 85, typeLetter);
  };
  const showBubble = (tone: keyof typeof messages) => {
    if (!active) return;
    stopWalk();
    clearTimer("bubble");
    bubble.dataset.tone = tone;
    traveler.dataset.mood = tone;
    message = messages[tone];
    letters = Array.from(message);
    letterIndex = 0;
    text.textContent = "";
    // Announce the complete sentence once; never every typewriter character.
    announcement.textContent = message.replace("\n", " ");
    bubble.hidden = false;
    bubble.dataset.state = "entering";
    if (reducedMotion.matches) holdBubble();
    else later("bubble", 240, typeLetter);
  };

  const scheduleIdle = () => {
    clearTimer("idle");
    if (!active || idleSpoken) return;
    const due = Math.max(lastActivity + idleDelay, lastShyAt + shyCooldown);
    later("idle", Math.max(0, due - performance.now()), () => {
      if (!bubble.hidden) {
        later("idle", 1_000, scheduleIdle);
        return;
      }
      idleSpoken = true;
      lastShyAt = performance.now();
      showBubble("shy");
    });
  };
  const activity = () => {
    if (!active) return;
    lastActivity = performance.now();
    idleSpoken = false;
    if (!bubble.hidden && bubble.dataset.tone === "shy" && bubble.dataset.state !== "leaving") dismissBubble();
    scheduleIdle();
  };
  const sync = () => {
    const available = isAvailable();
    if (!available) {
      active = false;
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      hideBubble();
      stopWalk(!isHome());
      return;
    }
    if (active) return;
    active = true;
    lastActivity = performance.now();
    idleSpoken = false;
    scheduleIdle();
    if (!greeted) {
      // Also allow the 850ms chapter trip to settle when home is visited later.
      later("hello", 1_100, () => {
        greeted = true;
        showBubble("hello");
      });
    } else {
      scheduleWalk();
    }
  };
  const motionChanged = () => {
    if (reducedMotion.matches) {
      stopWalk();
      if (!bubble.hidden && bubble.dataset.state !== "leaving") {
        clearTimer("bubble");
        holdBubble();
      }
    } else if (active && bubble.hidden) scheduleWalk();
    sync();
  };

  const rootObserver = new MutationObserver(sync);
  rootObserver.observe(root, { attributes: true, attributeFilter: ["data-intro", "data-paused", "data-document-hidden"] });
  const sceneObserver = new MutationObserver(sync);
  sceneObserver.observe(stage, { attributes: true, attributeFilter: ["data-active-scene"] });
  for (const name of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const) {
    window.addEventListener(name, activity, { passive: true, signal });
  }
  document.addEventListener("scroll", activity, { capture: true, passive: true, signal });
  document.addEventListener("visibilitychange", sync, { signal });
  reducedMotion.addEventListener("change", motionChanged, { signal });

  const destroy = () => {
    active = false;
    controller.abort();
    for (const timer of timers.values()) window.clearTimeout(timer);
    timers.clear();
    stopWalk(true);
    hideBubble();
    rootObserver.disconnect();
    sceneObserver.disconnect();
    mountedCompanions.delete(stage);
  };
  document.addEventListener("astro:before-swap", destroy, { once: true, signal });
  mountedCompanions.set(stage, destroy);
  sync();
  return destroy;
}
