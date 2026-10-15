interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface VectorScene {
  id: string;
  title: string;
  caption: string;
  vectors: { name: string; components: Vector3; units: string }[];
  compute: string;
  expectedResult: Vector3 | number | string;
}

export const vectorScenes3d: VectorScene[] = [
  {
    id: 'equilibrium',
    title: 'Three Forces in 3-D Equilibrium',
    caption:
      'Three forces pull on a central ring in 3D space; because their x, y, and z components all add to zero, the ring stays in static equilibrium.',
    vectors: [
      { name: 'F₁', components: { x: 3, y: 4, z: 2 }, units: 'N' },
      { name: 'F₂', components: { x: -5, y: -1, z: 3 }, units: 'N' },
      { name: 'F₃', components: { x: 2, y: -3, z: -5 }, units: 'N' },
    ],
    compute: 'Resultant: F₁ + F₂ + F₃',
    expectedResult: { x: 0, y: 0, z: 0 },
  },

  {
    id: 'torque',
    title: 'Torque on a Spanner',
    caption:
      'Pushing on a wrench at position r with force F creates a rotational torque vector τ = r × F perpendicular to both.',
    vectors: [
      { name: 'r', components: { x: 3, y: 4, z: 0 }, units: 'm' },
      { name: 'F', components: { x: -2, y: 3, z: 5 }, units: 'N' },
    ],
    compute: 'Cross Product: τ = r × F',
    expectedResult: { x: 20, y: -15, z: 17 },
  },

  {
    id: 'plane-normal',
    title: "Plane's Normal Vector from Two Edge Vectors",
    caption:
      'Taking the cross product of any two non-parallel vectors in a plane gives a normal vector n that stands at 90° to the entire plane.',
    vectors: [
      { name: 'A', components: { x: 4, y: 1, z: 0 }, units: 'u' },
      { name: 'B', components: { x: 1, y: 3, z: 2 }, units: 'u' },
    ],
    compute: 'Normal Vector: n = A × B',
    expectedResult: { x: 2, y: -8, z: 11 },
  },

  {
    id: 'work',
    title: 'Work Done by a 3-D Force',
    caption:
      'Only the component of force F parallel to the displacement s does mechanical work: W = F · s = |F| |s| cos θ.',
    vectors: [
      { name: 'F', components: { x: 4, y: 2, z: 3 }, units: 'N' },
      { name: 's', components: { x: 5, y: 3, z: 0 }, units: 'm' },
    ],
    compute: 'Dot Product: W = F · s',
    expectedResult: 26.0,
  },

  {
    id: 'direction-cosines',
    title: "Direction Cosines & Angles of a 3-D Strut",
    caption:
      "A 3D vector's orientation is fixed by the three angles α, β, γ it makes with the x, y, and z axes, where cos²α + cos²β + cos²γ = 1.",
    vectors: [
      { name: 'A', components: { x: 3, y: 4, z: 5 }, units: 'm' },
    ],
    compute: 'Direction Angles (α, β, γ) and verification of identity',
    expectedResult: 'cos²α + cos²β + cos²γ = 1.00',
  },

  {
    id: 'tripod',
    title: 'Resultant of Three Tripod Leg Forces',
    caption:
      'Three symmetrical tripod legs push downward; their horizontal x and y thrusts cancel out while their vertical z loads add together.',
    vectors: [
      { name: 'T₁', components: { x: 2, y: 0, z: -4 }, units: 'kN' },
      { name: 'T₂', components: { x: -1, y: 2, z: -4 }, units: 'kN' },
      { name: 'T₃', components: { x: -1, y: -2, z: -4 }, units: 'kN' },
    ],
    compute: 'Resultant: R = T₁ + T₂ + T₃',
    expectedResult: { x: 0, y: 0, z: -12 },
  },

  {
    id: 'relative-velocity',
    title: 'Relative Velocity of Two Aircraft',
    caption:
      "Subtracting Jet A's velocity from Jet B's velocity gives the velocity of Jet B as seen from Jet A's cockpit.",
    vectors: [
      { name: 'v_A', components: { x: 4, y: 2, z: 1 }, units: '×100 km/h' },
      { name: 'v_B', components: { x: 1, y: 6, z: 3 }, units: '×100 km/h' },
    ],
    compute: 'Subtract: v_B − v_A',
    expectedResult: { x: -3, y: 4, z: 2 },
  },

  {
    id: 'parallelepiped',
    title: 'Parallelepiped Volume via Scalar Triple Product',
    caption:
      'Three vectors starting at the origin span a slanted 3D box (parallelepiped) whose volume equals the scalar triple product |A · (B × C)|.',
    vectors: [
      { name: 'A', components: { x: 4, y: 0, z: 0 }, units: 'u' },
      { name: 'B', components: { x: 1, y: 3, z: 0 }, units: 'u' },
      { name: 'C', components: { x: 1, y: 1, z: 5 }, units: 'u' },
    ],
    compute: 'Scalar Triple Product: A · (B × C)',
    expectedResult: 60.0,
  },
];

export function magnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function add(v1: Vector3, v2: Vector3, v3?: Vector3): Vector3 {
  const sum = { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
  if (v3) {
    return { x: sum.x + v3.x, y: sum.y + v3.y, z: sum.z + v3.z };
  }
  return sum;
}

export function subtract(v1: Vector3, v2: Vector3): Vector3 {
  return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
}

export function dotProduct(v1: Vector3, v2: Vector3): number {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

export function crossProduct(v1: Vector3, v2: Vector3): Vector3 {
  return {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };
}

export function scalarTripleProduct(
  v1: Vector3,
  v2: Vector3,
  v3: Vector3
): number {
  const cross = crossProduct(v2, v3);
  return Math.abs(dotProduct(v1, cross));
}
