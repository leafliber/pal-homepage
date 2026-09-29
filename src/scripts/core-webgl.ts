import * as THREE from "three";
import { createCoreScene } from "./core-scene";
import { blinkAmount } from "./core-shape";
import type { CorePhase } from "./core";

/** A single, capped renderer for blinking and a small greeting gesture. */
export function mountCore(element: HTMLElement): () => void {
  const stage = element.querySelector<HTMLElement>("[data-core-stage]");
  const host = element.querySelector<HTMLElement>("[data-core-canvas]");
  const pause = element.querySelector<HTMLButtonElement>("[data-core-pause]");
  if (!stage || !host || !pause) return () => {};
  const abort = new AbortController();
  let renderer: THREE.WebGLRenderer | undefined;
  let context: WebGL2RenderingContext | null = null;
  let portrait: ReturnType<typeof createCoreScene> | undefined;
  let observer: IntersectionObserver | undefined,
    resizeObserver: ResizeObserver | undefined;
  let frame = 0,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    resizeObserver?.disconnect();
    abort.abort();
    portrait?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    if (context && !context.isContextLost())
      context.getExtension("WEBGL_lose_context")?.loseContext();
    delete element.dataset.webgl;
    delete element.dataset.eyeOpenness;
    pause.hidden = true;
    element.dispatchEvent(new CustomEvent("core:phase", { detail: "rest" }));
  };
  try {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const canvas = document.createElement("canvas");
    context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!context) {
      dispose();
      return dispose;
    }
    const view = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer = view;
    view.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    view.setClearColor(0x000000, 0);
    view.outputColorSpace = THREE.SRGBColorSpace;
    view.toneMapping = THREE.ACESFilmicToneMapping;
    view.toneMappingExposure = 1.05;
    const scene = createCoreScene();
    portrait = scene;
    let paused = element.dataset.corePaused === "true",
      visible = true;
    let elapsed = 0,
      previous = 0,
      greetingStarted = -10;
    let phase: CorePhase = "rest";
    let pointerX = 0,
      pointerY = 0,
      currentX = 0,
      currentY = 0;
    const render = () => {
      const greetingTime = elapsed - greetingStarted;
      const greeting = greetingTime >= 0 && greetingTime < 1.6;
      const cycle = elapsed % 7.2;
      const blink = greeting
        ? Math.max(
            blinkAmount(greetingTime, 0.15, 0.38),
            blinkAmount(greetingTime, 0.73, 0.42),
          )
        : Math.max(blinkAmount(cycle, 2.7), blinkAmount(cycle, 6.1, 0.36));
      const next: CorePhase = greeting
        ? "greet"
        : blink > 0.03
          ? "blink"
          : "rest";
      scene.update(
        elapsed,
        blink,
        currentX,
        currentY,
        greeting ? greetingTime / 1.6 : 0,
      );
      element.dataset.eyeOpenness = (1 - blink).toFixed(3);
      if (next !== phase) {
        phase = next;
        element.dispatchEvent(new CustomEvent("core:phase", { detail: phase }));
      }
      try {
        view.render(scene.scene, scene.camera);
      } catch {
        dispose();
      }
    };
    const running = () => !disposed && visible && !document.hidden && !paused;
    const loop = (time: number) => {
      frame = 0;
      if (!running()) return;
      if (time - previous >= 1000 / 30) {
        const delta = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
        previous = time;
        elapsed += delta;
        const ease = Math.min(1, delta * 3);
        currentX += (pointerX - currentX) * ease;
        currentY += (pointerY - currentY) * ease;
        render();
      }
      if (running()) frame = requestAnimationFrame(loop);
    };
    const sync = () => {
      if (running() && !frame) {
        previous = 0;
        frame = requestAnimationFrame(loop);
      } else if (!running() && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const resize = () => {
      if (disposed || !stage.clientWidth || !stage.clientHeight) return;
      try {
        view.setSize(stage.clientWidth, stage.clientHeight, false);
        scene.camera.aspect = stage.clientWidth / stage.clientHeight;
        scene.camera.updateProjectionMatrix();
        render();
      } catch {
        dispose();
      }
    };
    observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        sync();
      },
      { threshold: 0.02 },
    );
    resizeObserver = new ResizeObserver(resize);
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        dispose();
      },
      { signal: abort.signal },
    );
    element.addEventListener(
      "core:greet",
      () => {
        greetingStarted = elapsed;
        render();
        sync();
      },
      { signal: abort.signal },
    );
    element.addEventListener(
      "core:pause",
      (event) => {
        paused = (event as CustomEvent<boolean>).detail;
        sync();
      },
      { signal: abort.signal },
    );
    stage.addEventListener(
      "pointermove",
      (event) => {
        const rect = stage.getBoundingClientRect();
        pointerX = (event.clientX - rect.left) / rect.width - 0.5;
        pointerY = (event.clientY - rect.top) / rect.height - 0.5;
      },
      { passive: true, signal: abort.signal },
    );
    stage.addEventListener(
      "pointerleave",
      () => {
        pointerX = 0;
        pointerY = 0;
      },
      { signal: abort.signal },
    );
    document.addEventListener("visibilitychange", sync, {
      signal: abort.signal,
    });
    window.addEventListener("pagehide", dispose, {
      once: true,
      signal: abort.signal,
    });
    reduced.addEventListener(
      "change",
      () => {
        if (reduced.matches) dispose();
      },
      { signal: abort.signal },
    );
    mobile.addEventListener(
      "change",
      () => {
        if (mobile.matches) dispose();
      },
      { signal: abort.signal },
    );
    host.append(canvas);
    resize();
    if (disposed) return dispose;
    observer.observe(stage);
    resizeObserver.observe(stage);
    element.dataset.webgl = "ready";
    pause.hidden = false;
    sync();
    return dispose;
  } catch {
    dispose();
    return dispose;
  }
}
