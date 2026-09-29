import * as THREE from "three";

export const CORE_VIEW = {
  rotation: [-0.1, -0.29, -0.07] as const,
  camera: 8,
  scale: 121,
};

/** Rounded rectangular surfaces, with continuous planar faces rather than spheres. */
export function roundedPath(
  width: number,
  height: number,
  radius: number,
): THREE.Shape {
  const x = -width / 2,
    y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const path = new THREE.Shape();
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.quadraticCurveTo(x + width, y, x + width, y + r);
  path.lineTo(x + width, y + height - r);
  path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  path.lineTo(x + r, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/** Fast closing, a brief closed beat, then a softer reopening. */
export function blinkAmount(
  time: number,
  start: number,
  duration = 0.42,
): number {
  const progress = (time - start) / duration;
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (progress <= 0 || progress >= 1) return 0;
  if (progress < 0.3) return ease(progress / 0.3);
  if (progress < 0.44) return 1;
  return 1 - ease((progress - 0.44) / 0.56);
}
