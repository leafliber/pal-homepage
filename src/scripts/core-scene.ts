import * as THREE from "three";
import { CORE_VIEW, roundedPath } from "./core-shape";

/** Shared by the interactive renderer and both open/closed static portraits. */
export function createCoreScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    (2 * Math.atan(560 / (2 * CORE_VIEW.scale * CORE_VIEW.camera)) * 180) /
      Math.PI,
    600 / 560,
    0.1,
    30,
  );
  camera.position.z = CORE_VIEW.camera;
  const group = new THREE.Group();
  group.rotation.order = "ZYX";
  scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const material = (options: THREE.MeshPhysicalMaterialParameters) => {
    const result = new THREE.MeshPhysicalMaterial(options);
    materials.push(result);
    return result;
  };
  const ceramic = material({
    color: "#f1f3e9",
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.24,
    clearcoatRoughness: 0.4,
  });
  const bezel = material({
    color: "#141e1b",
    roughness: 0.32,
    metalness: 0.18,
  });
  const glass = material({
    color: "#111c19",
    roughness: 0.34,
    metalness: 0.12,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  });
  const green = material({
    color: "#00bc80",
    emissive: "#00b978",
    emissiveIntensity: 0.72,
    roughness: 0.4,
    metalness: 0.08,
  });
  const plate = (
    width: number,
    height: number,
    radius: number,
    depth: number,
    bevel: number,
    surface: THREE.Material,
    z: number,
  ) => {
    const geometry = new THREE.ExtrudeGeometry(
      roundedPath(width, height, radius),
      {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 6,
        curveSegments: 20,
        steps: 1,
      },
    );
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  };
  // One broad ceramic enclosure with a visibly recessed, flat expression panel.
  plate(3.04, 2.65, 0.68, 0.48, 0.17, ceramic, -0.36);
  plate(2.72, 2.32, 0.56, 0.075, 0.035, bezel, 0.17);
  plate(2.59, 2.19, 0.51, 0.035, 0.025, glass, 0.257);

  const shape = roundedPath(0.53, 0.93, 0.2);
  // Hollow eye outlines keep the reference's friendly pair of eyes, without eyeballs.
  const hole = roundedPath(0.31, 0.69, 0.11);
  shape.holes.push(hole);
  const eyeGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 16,
  });
  geometries.push(eyeGeometry);
  const eyes = [-0.58, 0.58].map((x) => {
    const mesh = new THREE.Mesh(eyeGeometry, green);
    mesh.position.set(x, 0.12, 0.325);
    group.add(mesh);
    return mesh;
  });

  scene.add(new THREE.HemisphereLight("#faf8f1", "#45665a", 2.1));
  const key = new THREE.DirectionalLight("#fffdf5", 3.6);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#b6edcf", 2.5);
  rim.position.set(4, 1, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight("#eff4ef", 0.65);
  fill.position.set(-4, -2, 2);
  scene.add(fill);

  const update = (
    elapsed: number,
    blink: number,
    gazeX: number,
    gazeY: number,
    greeting: number,
  ) => {
    group.rotation.set(
      CORE_VIEW.rotation[0] +
        gazeY * 0.07 +
        Math.sin(greeting * Math.PI) * 0.095,
      CORE_VIEW.rotation[1] + gazeX * 0.14 + Math.sin(elapsed * 0.35) * 0.035,
      CORE_VIEW.rotation[2] - Math.sin(greeting * Math.PI) * 0.055,
      "ZYX",
    );
    group.position.y = 0.04 + Math.sin(elapsed * 0.8) * 0.025;
    eyes.forEach((eye, index) => {
      eye.scale.y = Math.max(0.055, 1 - blink);
      eye.position.x = (index ? 0.58 : -0.58) + gazeX * 0.055;
      eye.position.y = 0.12 - gazeY * 0.045 - blink * 0.045;
    });
  };
  update(0, 0, 0, 0, 0);
  return {
    scene,
    camera,
    update,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      scene.clear();
    },
  };
}
