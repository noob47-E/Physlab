type CurveKind = 'surface' | 'parametricSurface' | 'curve';

interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
}

interface DomainRange {
  min: number;
  max: number;
}

interface Slider {
  name: string;
  min: number;
  max: number;
  default: number;
  step?: number;
}

export interface Graph3D {
  id: string;
  title: string;
  kind: CurveKind;
  expressions?: {
    x?: (x: number, y: number, params: Record<string, number>) => number;
    y?: (x: number, y: number, params: Record<string, number>) => number;
    z: (x: number, y: number, params: Record<string, number>) => number;
  };
  parametricCurve?: {
    x: (t: number, params: Record<string, number>) => number;
    y: (t: number, params: Record<string, number>) => number;
    z: (t: number, params: Record<string, number>) => number;
  };
  parametricSurface?: {
    x: (u: number, v: number, params: Record<string, number>) => number;
    y: (u: number, v: number, params: Record<string, number>) => number;
    z: (u: number, v: number, params: Record<string, number>) => number;
  };
  domain?: DomainRange;
  rangeU?: DomainRange;
  rangeV?: DomainRange;
  rangeZ?: DomainRange;
  rangeT?: DomainRange;
  camera: CameraConfig;
  meshDensity?: {
    u?: number;
    v?: number;
    radial?: number;
    tubular?: number;
  };
  colorScheme: string;
  caption: string;
  slider: Slider;
}

export const graph3dGallery: Graph3D[] = [
  {
    id: 'saddle-surface',
    title: 'Saddle Surface',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => params.a * (x * x - y * y) / 4,
    },
    domain: { min: -4, max: 4 },
    rangeZ: { min: -4, max: 4 },
    camera: {
      position: [10, -11, 8],
      target: [0, 0, 0],
    },
    meshDensity: { u: 64, v: 64 },
    colorScheme: 'cool-to-warm',
    caption: 'A hyperbolic paraboloid curves up along x and down along y, creating a saddle point right at the origin.',
    slider: { name: 'a', min: -2.0, max: 2.0, default: 1.0, step: 0.1 },
  },
  {
    id: 'water-ripple',
    title: 'Water Ripple',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => {
        const r = Math.sqrt(x * x + y * y + 0.001);
        return (2.5 * Math.sin(params.k * r)) / Math.sqrt(x * x + y * y + 1);
      },
    },
    domain: { min: -6, max: 6 },
    rangeZ: { min: -1.5, max: 2.5 },
    camera: {
      position: [12, -12, 10],
      target: [0, 0, 0],
    },
    meshDensity: { u: 96, v: 96 },
    colorScheme: 'ocean',
    caption: 'Circular waves spread out from the centre and lose height as they travel further away.',
    slider: { name: 'k', min: 0.5, max: 4.0, default: 2.0, step: 0.1 },
  },
  {
    id: 'gaussian-bell',
    title: 'Gaussian Bell',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => 4 * Math.exp(-(x * x + y * y) / (2 * params.s * params.s)),
    },
    domain: { min: -5, max: 5 },
    rangeZ: { min: 0, max: 4 },
    camera: {
      position: [10, -10, 7],
      target: [0, 0, 1.5],
    },
    meshDensity: { u: 72, v: 72 },
    colorScheme: 'viridis',
    caption: 'The 3D normal distribution bell curve shows probability clustered tightly around the mean at (0,0).',
    slider: { name: 's', min: 0.5, max: 3.0, default: 1.4, step: 0.1 },
  },
  {
    id: 'paraboloid-bowl',
    title: 'Paraboloid Bowl',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => (params.a * (x * x + y * y)) / 5 - 3,
    },
    domain: { min: -4, max: 4 },
    rangeZ: { min: -3, max: 3.4 },
    camera: {
      position: [11, -11, 8],
      target: [0, 0, 0],
    },
    meshDensity: { u: 64, v: 64 },
    colorScheme: 'sunset',
    caption: 'Rotating a parabola around the z-axis makes a dish shape used in satellite receivers and telescope mirrors.',
    slider: { name: 'a', min: -1.5, max: 2.0, default: 1.0, step: 0.1 },
  },
  {
    id: 'monkey-saddle',
    title: 'Monkey Saddle',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => (params.a * (x * x * x - 3 * x * y * y)) / 10,
    },
    domain: { min: -3, max: 3 },
    rangeZ: { min: -3, max: 3 },
    camera: {
      position: [9, -10, 7],
      target: [0, 0, 0],
    },
    meshDensity: { u: 72, v: 72 },
    colorScheme: 'tri-tone',
    caption: 'A saddle with three downward dips—two for a monkey\'s legs and a third for its tail!',
    slider: { name: 'a', min: 0.2, max: 2.0, default: 1.0, step: 0.1 },
  },
  {
    id: '3d-helix-spring',
    title: '3D Helix Spring',
    kind: 'curve',
    parametricCurve: {
      x: (t, _params) => 3 * Math.cos(t),
      y: (t, _params) => 3 * Math.sin(t),
      z: (t, params) => params.c * t - 4,
    },
    rangeT: { min: 0, max: 6 * Math.PI },
    camera: {
      position: [11, -11, 6],
      target: [0, 0, 0],
    },
    meshDensity: { tubular: 240, radial: 12 },
    colorScheme: 'rainbow',
    caption: 'A point moving in a circle on the xy-plane while rising steadily along z traces a spiral helix.',
    slider: { name: 'c', min: 0.1, max: 0.8, default: 0.45, step: 0.05 },
  },
  {
    id: 'torus-doughnut',
    title: 'Torus Doughnut',
    kind: 'parametricSurface',
    parametricSurface: {
      x: (u, v, params) => (params.R + 1.2 * Math.cos(v)) * Math.cos(u),
      y: (u, v, params) => (params.R + 1.2 * Math.cos(v)) * Math.sin(u),
      z: (_u, v, _params) => 1.2 * Math.sin(v),
    },
    rangeU: { min: 0, max: 2 * Math.PI },
    rangeV: { min: 0, max: 2 * Math.PI },
    camera: {
      position: [10, -10, 8],
      target: [0, 0, 0],
    },
    meshDensity: { u: 64, v: 32 },
    colorScheme: 'torus-gradient',
    caption: 'Sweeping a small circle of radius r around a larger circle of radius R builds a torus.',
    slider: { name: 'R', min: 1.2, max: 4.0, default: 3.0, step: 0.2 },
  },
  {
    id: 'parametric-sphere',
    title: 'Parametric Sphere',
    kind: 'parametricSurface',
    parametricSurface: {
      x: (u, v, params) => params.R * Math.sin(v) * Math.cos(u),
      y: (u, v, params) => params.R * Math.sin(v) * Math.sin(u),
      z: (_u, v, params) => params.R * Math.cos(v),
    },
    rangeU: { min: 0, max: 2 * Math.PI },
    rangeV: { min: 0, max: Math.PI },
    camera: {
      position: [10, -10, 7],
      target: [0, 0, 0],
    },
    meshDensity: { u: 48, v: 24 },
    colorScheme: 'latitude-bands',
    caption: 'Spherical coordinates use longitude angle u and polar tilt angle v to map every point on a globe.',
    slider: { name: 'R', min: 1.0, max: 4.5, default: 3.5, step: 0.25 },
  },
  {
    id: 'mobius-strip',
    title: 'Möbius Strip',
    kind: 'parametricSurface',
    parametricSurface: {
      x: (u, v, params) => (3 + v * Math.cos((params.n * u) / 2)) * Math.cos(u),
      y: (u, v, params) => (3 + v * Math.cos((params.n * u) / 2)) * Math.sin(u),
      z: (u, v, params) => v * Math.sin((params.n * u) / 2),
    },
    rangeU: { min: 0, max: 2 * Math.PI },
    rangeV: { min: -1, max: 1 },
    camera: {
      position: [9, -9, 7],
      target: [0, 0, 0],
    },
    meshDensity: { u: 96, v: 16 },
    colorScheme: 'cyclic-gradient',
    caption: 'A ribbon given a half-twist before joining its ends has only one continuous side and one boundary edge.',
    slider: { name: 'n', min: 0, max: 4, default: 1, step: 1 },
  },
  {
    id: 'quantum-wave-packet',
    title: 'Quantum Wave Packet',
    kind: 'surface',
    expressions: {
      z: (x, y, params) => 3 * Math.exp(-(x * x + y * y) / 6) * Math.cos(params.k * x),
    },
    domain: { min: -5, max: 5 },
    rangeZ: { min: -3, max: 3 },
    camera: {
      position: [10, -11, 8],
      target: [0, 0, 0],
    },
    meshDensity: { u: 96, v: 96 },
    colorScheme: 'diverging-phase',
    caption: 'Multiplying a cosine wave by a Gaussian bell traps the oscillation inside a localized wave packet.',
    slider: { name: 'k', min: 1.0, max: 6.0, default: 3.0, step: 0.2 },
  },
  {
    id: 'double-cone',
    title: 'Double Cone',
    kind: 'parametricSurface',
    parametricSurface: {
      x: (u, v, params) => v * Math.tan(params.a) * Math.cos(u),
      y: (u, v, params) => v * Math.tan(params.a) * Math.sin(u),
      z: (_u, v, _params) => v,
    },
    rangeU: { min: 0, max: 2 * Math.PI },
    rangeV: { min: -4, max: 4 },
    camera: {
      position: [11, -11, 6],
      target: [0, 0, 0],
    },
    meshDensity: { u: 64, v: 48 },
    colorScheme: 'double-cone-gradient',
    caption: 'Two cones meeting tip-to-tip at the origin form the double cone that generates all conic sections.',
    slider: { name: 'a', min: 0.25, max: 1.1, default: 0.65, step: 0.05 },
  },
  {
    id: 'tangent-plane-on-hill',
    title: 'Tangent Plane on a Hill',
    kind: 'surface',
    expressions: {
      z: (x, y, _params) => 3 - (x * x + y * y) / 4,
    },
    domain: { min: -4, max: 4 },
    rangeZ: { min: -1, max: 3 },
    camera: {
      position: [11, -10, 8],
      target: [0, 0, 0.5],
    },
    meshDensity: { u: 64, v: 64 },
    colorScheme: 'hill-gradient',
    caption: 'The flat tangent plane touches the curved hill at exactly point P and matches its partial-derivative slopes.',
    slider: { name: 'a', min: -3.0, max: 3.0, default: 1.5, step: 0.1 },
  },
];
