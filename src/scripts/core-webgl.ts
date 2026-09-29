import * as THREE from "three";
import {
  CORE_VIEW,
  SHELLS,
  FOCUS_CENTERS,
  shellPoint,
  focusPoint,
  type ShellSpec,
  type Point3,
} from "./core-shape";
import type { CorePhase } from "./core";

function surfaceGeometry(
  point: (u: number, v: number) => Point3,
  rows: number,
  columns: number,
): THREE.BufferGeometry {
  const positions: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++)
      positions.push(...point(row / rows, column / columns));
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column,
        b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** One 30 fps renderer. A signal is received, connected, then returned, with a rest between cycles. */
export function mountCore(element: HTMLElement): () => void {
  const stage = element.querySelector<HTMLElement>("[data-core-stage]");
  const host = element.querySelector<HTMLElement>("[data-core-canvas]");
  const pause = element.querySelector<HTMLButtonElement>("[data-core-pause]");
  if (!stage || !host || !pause) return () => {};
  const abort = new AbortController();
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  let renderer: THREE.WebGLRenderer | undefined;
  let context: WebGL2RenderingContext | null = null;
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
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    renderer?.dispose();
    renderer?.domElement.remove();
    if (context && !context.isContextLost())
      context.getExtension("WEBGL_lose_context")?.loseContext();
    delete element.dataset.webgl;
    pause.hidden = true;
    element.dispatchEvent(new CustomEvent("core:phase", { detail: "rest" }));
  };
  try {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      (2 * Math.atan(560 / (2 * CORE_VIEW.scale * CORE_VIEW.camera)) * 180) /
        Math.PI,
      600 / 560,
      0.1,
      30,
    );
    camera.position.z = CORE_VIEW.camera;
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
    view.toneMappingExposure = 1.08;
    const group = new THREE.Group();
    group.rotation.order = "ZYX";
    group.position.y = 6 / CORE_VIEW.scale;
    scene.add(group);
    const shells: THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshPhysicalMaterial
    >[] = [];
    for (const spec of SHELLS) {
      const geometry = surfaceGeometry(
        (u, v) => shellPoint(spec as ShellSpec, u, v * 2 - 1),
        96,
        40,
      );
      const material = new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: 0.39,
        metalness: 0.04,
        clearcoat: 0.15,
        clearcoatRoughness: 0.48,
        emissive: "#006b46",
        emissiveIntensity: 0,
        side: THREE.DoubleSide,
      });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      shells.push(mesh);
      group.add(mesh);
    }
    const eyeGeometry = surfaceGeometry((u, v) => focusPoint(u, v), 26, 40);
    geometries.push(eyeGeometry);
    const eyes = FOCUS_CENTERS.map((center) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: "#00c88a",
        roughness: 0.22,
        metalness: 0.12,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        emissive: "#00ba77",
        emissiveIntensity: 0.28,
        side: THREE.DoubleSide,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(eyeGeometry, material);
      mesh.position.set(...center);
      group.add(mesh);
      return mesh;
    });
    scene.add(new THREE.HemisphereLight("#faf7ef", "#203e31", 2.0));
    const key = new THREE.DirectionalLight("#ffffff", 3.5);
    key.position.set(-3, 5, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#b5f7d6", 1.8);
    fill.position.set(4, 1, -3);
    scene.add(fill);
    const edge = new THREE.DirectionalLight("#ffffff", 1.2);
    edge.position.set(-4, -2, 2);
    scene.add(edge);
    const innerLight = new THREE.PointLight("#34ffaf", 0.5, 3.5, 2);
    innerLight.position.set(0, 0.1, 0.6);
    group.add(innerLight);

    const curve = (points: Point3[]) =>
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const incoming = curve([
      [2.65, 0.8, 0.3],
      [1.7, 0.55, 0.7],
      [0.55, 0.3, 0.65],
      [-0.31, 0.13, 0.45],
    ]);
    const connection = curve([
      [-0.31, 0.13, 0.45],
      [-0.6, 0.73, 0.5],
      [0.05, 1.3, 0.46],
      [-1.0, 0.87, 0.38],
      [-1.3, -0.28, 0.26],
      [-0.65, -1.19, 0.27],
      [0.6, -1.1, 0.4],
      [0.9, -0.35, 0.5],
      [0.34, 0.13, 0.45],
    ]);
    const response = curve([
      [0.34, 0.13, 0.45],
      [1.15, 0.1, 0.55],
      [2.05, -0.2, 0.4],
      [2.7, -0.66, 0.3],
    ]);
    const dotGeometry = new THREE.IcosahedronGeometry(0.066, 2);
    geometries.push(dotGeometry);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: "#00b982",
      transparent: true,
      opacity: 0,
    });
    materials.push(dotMaterial);
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    group.add(dot);
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(25 * 3);
    trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trailPositions, 3),
    );
    geometries.push(trailGeometry);
    const trailMaterial = new THREE.LineBasicMaterial({
      color: "#00bf86",
      transparent: true,
      opacity: 0,
    });
    materials.push(trailMaterial);
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    group.add(trail);
    const haloGeometry = new THREE.RingGeometry(0.2, 0.22, 48);
    geometries.push(haloGeometry);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: "#5bf0b4",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    materials.push(haloMaterial);
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.set(0.34, 0.13, 0.47);
    group.add(halo);

    let paused = element.dataset.corePaused === "true",
      visible = true,
      elapsed = 0,
      previous = 0;
    let phase: CorePhase = "rest",
      pointerX = 0,
      pointerY = 0,
      currentX = 0,
      currentY = 0;
    const signal = (
      path: THREE.CatmullRomCurve3,
      progress: number,
      opacity: number,
    ) => {
      dot.position.copy(path.getPoint(Math.min(1, Math.max(0, progress))));
      dotMaterial.opacity = opacity;
      for (let i = 0; i < 25; i++) {
        const p = path.getPoint(
          Math.max(0, Math.min(1, progress - 0.1 + (0.1 * i) / 24)),
        );
        trailPositions.set([p.x, p.y, p.z], i * 3);
      }
      trailGeometry.attributes.position!.needsUpdate = true;
      trailMaterial.opacity = opacity * 0.7;
    };
    const render = () => {
      const t = elapsed % 12;
      const nextPhase: CorePhase =
        t >= 2 && t < 4
          ? "sense"
          : t >= 4 && t < 7
            ? "connect"
            : t >= 7 && t < 9
              ? "respond"
              : "rest";
      if (nextPhase !== phase) {
        phase = nextPhase;
        element.dispatchEvent(new CustomEvent("core:phase", { detail: phase }));
      }
      const engaged = smooth((t - 3.7) / 0.6) * (1 - smooth((t - 8.5) / 0.8));
      const open = phase === "sense" ? Math.sin(((t - 2) / 2) * Math.PI) : 0;
      group.rotation.set(
        CORE_VIEW.rotation[0] + currentY + Math.sin(elapsed * 0.42) * 0.025,
        CORE_VIEW.rotation[1] + currentX + Math.sin(elapsed * 0.3) * 0.09,
        CORE_VIEW.rotation[2] + Math.sin(elapsed * 0.2) * 0.018,
        "ZYX",
      );
      group.position.y = 6 / CORE_VIEW.scale + Math.sin(elapsed * 0.65) * 0.025;
      shells.forEach((shell, i) => {
        const direction = i === 0 ? 1 : i === 2 ? -1 : 0;
        shell.rotation.z = direction * (open * 0.11 - engaged * 0.025);
        shell.position.x = i === 1 ? -open * 0.035 : open * 0.025;
        shell.position.z =
          Math.sin(elapsed * 0.5 + i) * 0.018 + engaged * 0.025;
        shell.scale.setScalar(1 - engaged * 0.026);
        const pulse =
          phase === "connect"
            ? Math.exp(-Math.pow(((t - 4) / 3) * 3 - i - 0.2, 2) * 5)
            : 0;
        shell.material.emissiveIntensity = 0.015 + pulse * 0.2;
      });
      eyes.forEach((eye, i) => {
        const wake =
          smooth((t - (i ? 6.3 : 3.35)) / 0.5) * (1 - smooth((t - 9) / 0.9));
        eye.material.emissiveIntensity = 0.25 + wake * 0.8;
        eye.scale.setScalar(1 + wake * 0.1);
      });
      innerLight.intensity = 0.3 + engaged * 1.3;
      dotMaterial.opacity = 0;
      trailMaterial.opacity = 0;
      haloMaterial.opacity = 0;
      if (phase === "sense") {
        const p = (t - 2) / 2;
        signal(
          incoming,
          smooth(p),
          Math.min(1, p * 6) * (1 - smooth((p - 0.9) / 0.1)),
        );
      } else if (phase === "connect") {
        const p = (t - 4) / 3;
        signal(
          connection,
          p,
          Math.min(1, p * 8) * (1 - smooth((p - 0.88) / 0.12)) * 0.95,
        );
      } else if (phase === "respond") {
        const p = (t - 7) / 2;
        signal(response, smooth(p), 1 - smooth((p - 0.55) / 0.45));
        halo.scale.setScalar(1 + p * 3.2);
        haloMaterial.opacity =
          Math.sin((Math.min(1, p * 2) * Math.PI) / 2) * (1 - p) * 0.5;
      }
      try {
        view.render(scene, camera);
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
        currentX += (pointerX * 0.12 - currentX) * ease;
        currentY += (pointerY * 0.08 - currentY) * ease;
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
        camera.aspect = stage.clientWidth / stage.clientHeight;
        camera.updateProjectionMatrix();
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
      "core:signal",
      () => {
        elapsed = Math.floor(elapsed / 12) * 12 + 2;
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
