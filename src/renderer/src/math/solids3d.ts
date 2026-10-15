import { Vector3 } from 'three';

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const SQRT2 = Math.sqrt(2);
const SQRT3 = Math.sqrt(3);
const SQRT5 = Math.sqrt(5);

export interface Polyhedron {
  name: string;
  vertices: Vector3[];
  faces: number[][];
  volume: number;
  surfaceArea: number;
  v: number;
  e: number;
  f: number;
}

// Cube with side a = 4.0
export function createCube(a: number = 4.0): Polyhedron {
  const vertices = [
    new Vector3(0, 0, 0),
    new Vector3(a, 0, 0),
    new Vector3(a, a, 0),
    new Vector3(0, a, 0),
    new Vector3(0, 0, a),
    new Vector3(a, 0, a),
    new Vector3(a, a, a),
    new Vector3(0, a, a),
  ];
  const faces = [
    [0, 1, 2, 3], // bottom
    [4, 7, 6, 5], // top
    [0, 4, 5, 1], // front
    [1, 5, 6, 2], // right
    [2, 6, 7, 3], // back
    [3, 7, 4, 0], // left
  ];
  return {
    name: 'Cube',
    vertices,
    faces,
    volume: a * a * a,
    surfaceArea: 6 * a * a,
    v: 8,
    e: 12,
    f: 6,
  };
}

// Cuboid with l, w, h
export function createCuboid(l: number = 5.0, w: number = 3.0, h: number = 4.0): Polyhedron {
  const vertices = [
    new Vector3(0, 0, 0),
    new Vector3(l, 0, 0),
    new Vector3(l, w, 0),
    new Vector3(0, w, 0),
    new Vector3(0, 0, h),
    new Vector3(l, 0, h),
    new Vector3(l, w, h),
    new Vector3(0, w, h),
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  return {
    name: 'Cuboid',
    vertices,
    faces,
    volume: l * w * h,
    surfaceArea: 2 * (l * w + l * h + w * h),
    v: 8,
    e: 12,
    f: 6,
  };
}

// Triangular Prism (equilateral base)
export function createTriangularPrism(b: number = 4.0, l: number = 6.0): Polyhedron {
  const h = (SQRT3 / 2) * b;
  const vertices = [
    new Vector3(0, 0, 0),
    new Vector3(b, 0, 0),
    new Vector3(b / 2, h, 0),
    new Vector3(0, 0, l),
    new Vector3(b, 0, l),
    new Vector3(b / 2, h, l),
  ];
  const faces = [
    [0, 1, 2],
    [3, 5, 4],
    [0, 3, 4, 1],
    [1, 4, 5, 2],
    [2, 5, 3, 0],
  ];
  return {
    name: 'Triangular Prism',
    vertices,
    faces,
    volume: (SQRT3 / 4) * b * b * l,
    surfaceArea: (SQRT3 / 2) * b * b + 3 * b * l,
    v: 6,
    e: 9,
    f: 5,
  };
}

// Square Pyramid
export function createSquarePyramid(b: number = 4.0, h: number = 6.0): Polyhedron {
  const vertices = [
    new Vector3(0, 0, 0),
    new Vector3(b, 0, 0),
    new Vector3(b, b, 0),
    new Vector3(0, b, 0),
    new Vector3(b / 2, b / 2, h),
  ];
  const faces = [
    [0, 3, 2, 1],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ];
  const slantHeight = Math.sqrt((b / 2) ** 2 + h * h);
  return {
    name: 'Square Pyramid',
    vertices,
    faces,
    volume: (1 / 3) * b * b * h,
    surfaceArea: b * b + 2 * b * slantHeight,
    v: 5,
    e: 8,
    f: 5,
  };
}

// Regular Tetrahedron
export function createRegularTetrahedron(a: number = 5.0): Polyhedron {
  const height = Math.sqrt(2 / 3) * a;
  const vertices = [
    new Vector3(0, 0, 0),
    new Vector3(a, 0, 0),
    new Vector3(a / 2, (SQRT3 / 2) * a, 0),
    new Vector3(a / 2, (SQRT3 / 6) * a, height),
  ];
  const faces = [
    [0, 2, 1],
    [0, 1, 3],
    [1, 2, 3],
    [2, 0, 3],
  ];
  return {
    name: 'Regular Tetrahedron',
    vertices,
    faces,
    volume: (a * a * a) / (6 * SQRT2),
    surfaceArea: SQRT3 * a * a,
    v: 4,
    e: 6,
    f: 4,
  };
}

// Regular Octahedron
export function createRegularOctahedron(a: number = 4.0): Polyhedron {
  const d = (a / SQRT2);
  const vertices = [
    new Vector3(d, 0, 0),
    new Vector3(-d, 0, 0),
    new Vector3(0, d, 0),
    new Vector3(0, -d, 0),
    new Vector3(0, 0, d),
    new Vector3(0, 0, -d),
  ];
  const faces = [
    [4, 0, 2],
    [4, 2, 1],
    [4, 1, 3],
    [4, 3, 0],
    [5, 2, 0],
    [5, 1, 2],
    [5, 3, 1],
    [5, 0, 3],
  ];
  return {
    name: 'Regular Octahedron',
    vertices,
    faces,
    volume: (SQRT2 / 3) * a * a * a,
    surfaceArea: 2 * SQRT3 * a * a,
    v: 6,
    e: 12,
    f: 8,
  };
}

// Regular Dodecahedron
export function createRegularDodecahedron(a: number = 2.5): Polyhedron {
  const phi = GOLDEN_RATIO;
  const t = 1 / phi;
  // 3D-3B: the corners (±1, ±1, ±1), (0, ±1/φ, ±φ), (±1/φ, ±φ, 0), (±φ, 0, ±1/φ) have an edge of 2/φ; scaled by aφ/2 the
  // edge is a. Before, they were scaled by a (an edge of 2a/φ) and the face list joined corners that are no face's: 35
  // edges of four lengths, faces not flat.
  const s = (a * phi) / 2;

  const vertices = [
    new Vector3(s, s, s),
    new Vector3(-s, s, s),
    new Vector3(s, -s, s),
    new Vector3(s, s, -s),
    new Vector3(-s, -s, s),
    new Vector3(-s, s, -s),
    new Vector3(s, -s, -s),
    new Vector3(-s, -s, -s),
    new Vector3(0, s * t, s * phi),
    new Vector3(0, -s * t, s * phi),
    new Vector3(0, s * t, -s * phi),
    new Vector3(0, -s * t, -s * phi),
    new Vector3(s * t, s * phi, 0),
    new Vector3(-s * t, s * phi, 0),
    new Vector3(s * t, -s * phi, 0),
    new Vector3(-s * t, -s * phi, 0),
    new Vector3(s * phi, 0, s * t),
    new Vector3(s * phi, 0, -s * t),
    new Vector3(-s * phi, 0, s * t),
    new Vector3(-s * phi, 0, -s * t),
  ];

  // Each face is the five corners farthest along one of its twelve outward normals, (0, ±φ, ±1) and their cyclic turns,
  // in order round the normal.
  const normals: Vector3[] = [];
  for (const p of [1, -1]) {
    for (const q of [1, -1]) {
      normals.push(new Vector3(0, p * phi, q), new Vector3(p * phi, q, 0), new Vector3(q, 0, p * phi));
    }
  }
  const faces = normals.map((n) => {
    const most = Math.max(...vertices.map((v) => v.dot(n)));
    const ring = vertices.map((v, i) => ({ v, i })).filter(({ v }) => most - v.dot(n) < most * 1e-6);
    const centre = ring.reduce((c, { v }) => c.add(v), new Vector3()).divideScalar(ring.length);
    const u = ring[0].v.clone().sub(centre).normalize();
    const w = n.clone().normalize().cross(u);
    return ring
      .map(({ v, i }) => ({ i, turn: Math.atan2(v.clone().sub(centre).dot(w), v.clone().sub(centre).dot(u)) }))
      .sort((x, y) => x.turn - y.turn)
      .map((x) => x.i);
  });

  const vol = (15 + 7 * SQRT5) / 4;
  const surfArea = 3 * Math.sqrt(25 + 10 * SQRT5);

  return {
    name: 'Regular Dodecahedron',
    vertices,
    faces,
    volume: vol * a * a * a,
    surfaceArea: surfArea * a * a,
    v: 20,
    e: 30,
    f: 12,
  };
}

// Regular Icosahedron
export function createRegularIcosahedron(a: number = 3.5): Polyhedron {
  const phi = GOLDEN_RATIO;
  const scale = 1;

  const unscaledVertices = [
    new Vector3(-scale, scale * phi, 0),
    new Vector3(scale, scale * phi, 0),
    new Vector3(-scale, -scale * phi, 0),
    new Vector3(scale, -scale * phi, 0),
    new Vector3(0, -scale, scale * phi),
    new Vector3(0, scale, scale * phi),
    new Vector3(0, -scale, -scale * phi),
    new Vector3(0, scale, -scale * phi),
    new Vector3(scale * phi, 0, -scale),
    new Vector3(scale * phi, 0, scale),
    new Vector3(-scale * phi, 0, -scale),
    new Vector3(-scale * phi, 0, scale),
  ];
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const s = a / 2;
  const vertices = unscaledVertices.map(v => v.clone().multiplyScalar(s));

  return {
    name: 'Regular Icosahedron',
    vertices,
    faces,
    volume: (5 * (3 + SQRT5)) / 12 * a * a * a,
    surfaceArea: 5 * SQRT3 * a * a,
    v: 12,
    e: 30,
    f: 20,
  };
}

// Cylinder (parametric)
export function createCylinder(r: number = 2.5, h: number = 5.0, segmentsU: number = 32): Polyhedron {
  const vertices: Vector3[] = [];
  const angleStep = (2 * Math.PI) / segmentsU;

  for (let i = 0; i < segmentsU; i++) {
    const angle = i * angleStep;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    vertices.push(new Vector3(x, y, 0));
  }

  for (let i = 0; i < segmentsU; i++) {
    const angle = i * angleStep;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    vertices.push(new Vector3(x, y, h));
  }

  const faces: number[][] = [];

  for (let i = 0; i < segmentsU; i++) {
    const next = (i + 1) % segmentsU;
    faces.push([i, segmentsU + i, segmentsU + next, next]);
  }

  const faces_top: number[] = [];
  for (let i = segmentsU - 1; i >= 0; i--) {
    faces_top.push(segmentsU + i);
  }
  faces.push(faces_top);

  const faces_bottom: number[] = [];
  for (let i = 0; i < segmentsU; i++) {
    faces_bottom.push(i);
  }
  faces.push(faces_bottom);

  return {
    name: 'Cylinder',
    vertices,
    faces,
    volume: Math.PI * r * r * h,
    surfaceArea: 2 * Math.PI * r * r + 2 * Math.PI * r * h,
    v: 2 * segmentsU,
    e: 3 * segmentsU,
    f: segmentsU + 2,
  };
}

// Cone (parametric)
export function createCone(r: number = 3.0, h: number = 4.0, segments: number = 32): Polyhedron {
  const vertices: Vector3[] = [new Vector3(0, 0, h)];
  const angleStep = (2 * Math.PI) / segments;

  for (let i = 0; i < segments; i++) {
    const angle = i * angleStep;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    vertices.push(new Vector3(x, y, 0));
  }

  const faces: number[][] = [];

  for (let i = 1; i < segments; i++) {
    faces.push([0, i + 1, i]);
  }
  faces.push([0, 1, segments]);

  const base_face: number[] = [];
  for (let i = segments; i >= 1; i--) {
    base_face.push(i);
  }
  faces.push(base_face);

  return {
    name: 'Cone',
    vertices,
    faces,
    volume: (1 / 3) * Math.PI * r * r * h,
    surfaceArea: Math.PI * r * r + Math.PI * r * Math.sqrt(r * r + h * h),
    v: segments + 1,
    e: 2 * segments,
    f: segments + 1,
  };
}

// Conical Frustum (parametric)
export function createFrustum(R: number = 3.5, r: number = 1.5, h: number = 4.0, segments: number = 32): Polyhedron {
  const angleStep = (2 * Math.PI) / segments;
  const vertices: Vector3[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = i * angleStep;
    vertices.push(new Vector3(R * Math.cos(angle), R * Math.sin(angle), 0));
  }

  for (let i = 0; i < segments; i++) {
    const angle = i * angleStep;
    vertices.push(new Vector3(r * Math.cos(angle), r * Math.sin(angle), h));
  }

  const faces: number[][] = [];

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    faces.push([i, segments + i, segments + next, next]);
  }

  const bottom_face: number[] = [];
  for (let i = 0; i < segments; i++) {
    bottom_face.push(i);
  }
  faces.push(bottom_face);

  const top_face: number[] = [];
  for (let i = segments - 1; i >= 0; i--) {
    top_face.push(segments + i);
  }
  faces.push(top_face);

  const l = Math.sqrt((R - r) ** 2 + h * h);
  return {
    name: 'Conical Frustum',
    vertices,
    faces,
    volume: (Math.PI * h / 3) * (R * R + R * r + r * r),
    surfaceArea: Math.PI * (R * R + r * r) + Math.PI * (R + r) * l,
    v: 2 * segments,
    e: 3 * segments,
    f: segments + 2,
  };
}

// Sphere (parametric)
export function createSphere(r: number = 3.0, segmentsU: number = 32, segmentsV: number = 16): Polyhedron {
  const vertices: Vector3[] = [];

  // North pole
  vertices.push(new Vector3(0, 0, r));

  // Middle rings (v from 1 to segmentsV-1)
  for (let v = 1; v < segmentsV; v++) {
    const theta = (v / segmentsV) * Math.PI;
    for (let u = 0; u < segmentsU; u++) {
      const phi = (u / segmentsU) * 2 * Math.PI;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);
      vertices.push(new Vector3(x, y, z));
    }
  }

  // South pole
  vertices.push(new Vector3(0, 0, -r));

  const faces: number[][] = [];

  // North pole triangles
  for (let u = 0; u < segmentsU; u++) {
    const next_u = (u + 1) % segmentsU;
    const a = 0;
    const b = 1 + u;
    const c = 1 + next_u;
    faces.push([a, b, c]);
  }

  // Middle quad faces
  for (let v = 1; v < segmentsV - 1; v++) {
    for (let u = 0; u < segmentsU; u++) {
      const next_u = (u + 1) % segmentsU;
      const a = 1 + (v - 1) * segmentsU + u;
      const b = 1 + v * segmentsU + u;
      const c = 1 + v * segmentsU + next_u;
      const d = 1 + (v - 1) * segmentsU + next_u;
      faces.push([a, b, c, d]);
    }
  }

  // South pole triangles
  const lastRingStart = 1 + (segmentsV - 2) * segmentsU;
  const southPole = vertices.length - 1;
  for (let u = 0; u < segmentsU; u++) {
    const next_u = (u + 1) % segmentsU;
    const a = lastRingStart + u;
    const b = lastRingStart + next_u;
    const c = southPole;
    faces.push([a, b, c]);
  }

  const V = 2 + (segmentsV - 1) * segmentsU;
  const E = segmentsU * segmentsV + segmentsU * (segmentsV - 1);
  const F = segmentsU + (segmentsV - 2) * segmentsU + segmentsU;

  return {
    name: 'Sphere',
    vertices,
    faces,
    volume: (4 / 3) * Math.PI * r * r * r,
    surfaceArea: 4 * Math.PI * r * r,
    v: V,
    e: E,
    f: F,
  };
}

// Hemisphere
export function createHemisphere(r: number = 3.0, segmentsU: number = 32, segmentsV: number = 8): Polyhedron {
  const vertices: Vector3[] = [];

  // North pole
  vertices.push(new Vector3(0, 0, r));

  // Middle rings (v from 1 to segmentsV-1)
  for (let v = 1; v < segmentsV; v++) {
    const theta = (v / segmentsV) * (Math.PI / 2);
    for (let u = 0; u < segmentsU; u++) {
      const phi = (u / segmentsU) * 2 * Math.PI;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);
      vertices.push(new Vector3(x, y, z));
    }
  }

  // Base ring (v = segmentsV)
  for (let u = 0; u < segmentsU; u++) {
    const phi = (u / segmentsU) * 2 * Math.PI;
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    vertices.push(new Vector3(x, y, 0));
  }

  const base_center_idx = vertices.length;
  vertices.push(new Vector3(0, 0, 0));

  const faces: number[][] = [];

  // North pole triangles
  for (let u = 0; u < segmentsU; u++) {
    const next_u = (u + 1) % segmentsU;
    const a = 0;
    const b = 1 + u;
    const c = 1 + next_u;
    faces.push([a, b, c]);
  }

  // Middle quad faces
  for (let v = 1; v < segmentsV - 1; v++) {
    for (let u = 0; u < segmentsU; u++) {
      const next_u = (u + 1) % segmentsU;
      const a = 1 + (v - 1) * segmentsU + u;
      const b = 1 + v * segmentsU + u;
      const c = 1 + v * segmentsU + next_u;
      const d = 1 + (v - 1) * segmentsU + next_u;
      faces.push([a, b, c, d]);
    }
  }

  // Quads connecting middle to base
  for (let u = 0; u < segmentsU; u++) {
    const next_u = (u + 1) % segmentsU;
    const a = 1 + (segmentsV - 2) * segmentsU + u;
    const b = 1 + (segmentsV - 1) * segmentsU + u;
    const c = 1 + (segmentsV - 1) * segmentsU + next_u;
    const d = 1 + (segmentsV - 2) * segmentsU + next_u;
    faces.push([a, b, c, d]);
  }

  // Base center triangles
  const baseRingStart = 1 + (segmentsV - 1) * segmentsU;
  for (let u = 0; u < segmentsU; u++) {
    const next_u = (u + 1) % segmentsU;
    faces.push([baseRingStart + u, base_center_idx, baseRingStart + next_u]);
  }

  const V = 1 + (segmentsV - 1) * segmentsU + segmentsU + 1;
  const E = 3 * segmentsU + (segmentsV - 1) * (segmentsU * 2);
  const F = segmentsU + (segmentsV - 1) * segmentsU + segmentsU;

  return {
    name: 'Hemisphere',
    vertices,
    faces,
    volume: (2 / 3) * Math.PI * r * r * r,
    surfaceArea: 3 * Math.PI * r * r,
    v: V,
    e: E,
    f: F,
  };
}

export function getSolidByName(name: string, defaultParams?: Record<string, number>): Polyhedron | null {
  const params = defaultParams || {};

  switch (name.toLowerCase()) {
    case 'cube':
      return createCube(params.a ?? 4.0);
    case 'cuboid':
      return createCuboid(params.l ?? 5.0, params.w ?? 3.0, params.h ?? 4.0);
    case 'triangular prism':
      return createTriangularPrism(params.b ?? 4.0, params.l ?? 6.0);
    case 'square pyramid':
      return createSquarePyramid(params.b ?? 4.0, params.h ?? 6.0);
    case 'tetrahedron':
      return createRegularTetrahedron(params.a ?? 5.0);
    case 'octahedron':
      return createRegularOctahedron(params.a ?? 4.0);
    case 'dodecahedron':
      return createRegularDodecahedron(params.a ?? 2.5);
    case 'icosahedron':
      return createRegularIcosahedron(params.a ?? 3.5);
    case 'cylinder':
      return createCylinder(params.r ?? 2.5, params.h ?? 5.0);
    case 'cone':
      return createCone(params.r ?? 3.0, params.h ?? 4.0);
    case 'frustum':
      return createFrustum(params.R ?? 3.5, params.r ?? 1.5, params.h ?? 4.0);
    case 'sphere':
      return createSphere(params.r ?? 3.0);
    case 'hemisphere':
      return createHemisphere(params.r ?? 3.0);
    default:
      return null;
  }
}
