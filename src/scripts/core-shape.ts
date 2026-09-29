/** Shared original surfaces: the still render and WebGL use exactly this shape. */
export type Point3 = [number, number, number];
export type ShellSpec = {
  start: number;
  length: number;
  radius: number;
  width: number;
  depth: number;
  tilt: Point3;
  offset: Point3;
  color: string;
};

export const CORE_VIEW = {
  rotation: [-0.19, -0.32, -0.1] as Point3,
  camera: 8,
  scale: 121,
};

// A broad, open C, built from three soft independent laminae.
export const SHELLS: ShellSpec[] = [
  {
    start: 0.46,
    length: 1.65,
    radius: 1.36,
    width: 0.31,
    depth: 0.2,
    tilt: [0.03, 0.04, 0],
    offset: [0, 0.02, 0.08],
    color: "#eaf0e6",
  },
  {
    start: 2.2,
    length: 1.41,
    radius: 1.36,
    width: 0.33,
    depth: 0.22,
    tilt: [-0.04, 0, 0],
    offset: [-0.015, 0, -0.045],
    color: "#a5d7bf",
  },
  {
    start: 3.7,
    length: 2.09,
    radius: 1.36,
    width: 0.32,
    depth: 0.21,
    tilt: [0.02, -0.03, 0],
    offset: [0, -0.02, 0.05],
    color: "#eef1e8",
  },
];

export const FOCUS_CENTERS: Point3[] = [
  [-0.31, 0.13, 0.28],
  [0.34, 0.13, 0.28],
];

export function rotatePoint(point: Point3, angles: Point3): Point3 {
  let [x, y, z] = point;
  const [a, b, c] = angles;
  [y, z] = [
    y * Math.cos(a) - z * Math.sin(a),
    y * Math.sin(a) + z * Math.cos(a),
  ];
  [x, z] = [
    x * Math.cos(b) + z * Math.sin(b),
    -x * Math.sin(b) + z * Math.cos(b),
  ];
  [x, y] = [
    x * Math.cos(c) - y * Math.sin(c),
    x * Math.sin(c) + y * Math.cos(c),
  ];
  return [x, y, z];
}

/** A closed, gently twisted ribbon with a softly rounded rectangular section. */
export function shellPoint(spec: ShellSpec, u: number, v: number): Point3 {
  const clamped = Math.max(0.00001, Math.min(0.99999, u));
  const end = Math.min(clamped / 0.13, (1 - clamped) / 0.13, 1);
  const cap = Math.sqrt(1 - (1 - end) ** 2);
  const angle = spec.start + spec.length * clamped;
  const section = v * Math.PI;
  const rounded = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), 0.78);
  const width = spec.width * cap * (1 + 0.08 * Math.sin(clamped * Math.PI));
  const radial = spec.radius + rounded(Math.cos(section)) * width;
  const local: Point3 = [
    radial * Math.cos(angle),
    radial * Math.sin(angle),
    0.15 * Math.sin(angle + 0.5) +
      rounded(Math.sin(section)) * spec.depth * cap +
      0.055 * Math.cos(section) * Math.sin(angle * 1.3),
  ];
  return rotatePoint(local, spec.tilt).map(
    (n, i) => n + spec.offset[i]!,
  ) as Point3;
}

export function shellNormal(spec: ShellSpec, u: number, v: number): Point3 {
  const a = shellPoint(spec, u + 0.0001, v);
  const b = shellPoint(spec, u - 0.0001, v);
  const c = shellPoint(spec, u, v + 0.0001);
  const d = shellPoint(spec, u, v - 0.0001);
  const du = a.map((n, i) => n - b[i]!) as Point3;
  const dv = c.map((n, i) => n - d[i]!) as Point3;
  const normal: Point3 = [
    du[1] * dv[2] - du[2] * dv[1],
    du[2] * dv[0] - du[0] * dv[2],
    du[0] * dv[1] - du[1] * dv[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return normal.map((n) => n / length) as Point3;
}

/** Paired, slightly flattened green lenses give the abstract structure a face. */
export function focusPoint(
  u: number,
  v: number,
  center: Point3 = [0, 0, 0],
): Point3 {
  const latitude = (u - 0.5) * Math.PI;
  const longitude = v * Math.PI * 2;
  const shape = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), 0.82);
  return [
    center[0] + 0.175 * shape(Math.cos(latitude) * Math.cos(longitude)),
    center[1] + 0.27 * shape(Math.sin(latitude)),
    center[2] + 0.13 * Math.cos(latitude) * Math.sin(longitude),
  ];
}
