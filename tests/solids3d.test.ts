import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  createCube,
  createCuboid,
  createTriangularPrism,
  createSquarePyramid,
  createRegularTetrahedron,
  createRegularOctahedron,
  createRegularDodecahedron,
  createRegularIcosahedron,
  createCylinder,
  createCone,
  createFrustum,
  createSphere,
  createHemisphere,
  Polyhedron,
  getSolidByName,
} from '../src/renderer/src/math/solids3d';

const SQRT2 = Math.sqrt(2);
const SQRT3 = Math.sqrt(3);
const EPSILON = 1e-9;
const VOL_AREA_EPSILON = 1e-6;

function getEdgeLength(v1: Vector3, v2: Vector3): number {
  return v1.distanceTo(v2);
}

function isFaceCoplanar(vertices: Vector3[], faceIndices: number[], tolerance: number = 1e-9): boolean {
  if (faceIndices.length < 3) return true;

  const p0 = vertices[faceIndices[0]];
  const p1 = vertices[faceIndices[1]];
  const p2 = vertices[faceIndices[2]];

  const v1 = new Vector3().subVectors(p1, p0);
  const v2 = new Vector3().subVectors(p2, p0);
  const normal = new Vector3().crossVectors(v1, v2).normalize();

  const d = normal.dot(p0);

  for (let i = 3; i < faceIndices.length; i++) {
    const p = vertices[faceIndices[i]];
    const distance = Math.abs(normal.dot(p) - d);
    if (distance > tolerance) {
      return false;
    }
  }

  return true;
}

function testEulerFormula(name: string) {
  it(`${name}: Euler formula V - E + F = 2`, () => {
    const solid = (() => {
      switch (name) {
        case 'Cube': return createCube();
        case 'Cuboid': return createCuboid();
        case 'Triangular Prism': return createTriangularPrism();
        case 'Square Pyramid': return createSquarePyramid();
        case 'Regular Tetrahedron': return createRegularTetrahedron();
        case 'Regular Octahedron': return createRegularOctahedron();
        case 'Regular Dodecahedron': return createRegularDodecahedron();
        case 'Regular Icosahedron': return createRegularIcosahedron();
        case 'Cylinder': return createCylinder();
        case 'Cone': return createCone();
        case 'Conical Frustum': return createFrustum();
        case 'Sphere': return createSphere();
        case 'Hemisphere': return createHemisphere();
        default: throw new Error(`Unknown solid: ${name}`);
      }
    })();

    expect(solid.v - solid.e + solid.f).toBe(2);
  });
}

function testFacesPlanar(name: string) {
  it(`${name}: All faces planar within ${EPSILON}`, () => {
    const solid = (() => {
      switch (name) {
        case 'Cube': return createCube();
        case 'Cuboid': return createCuboid();
        case 'Triangular Prism': return createTriangularPrism();
        case 'Square Pyramid': return createSquarePyramid();
        case 'Regular Tetrahedron': return createRegularTetrahedron();
        case 'Regular Octahedron': return createRegularOctahedron();
        case 'Regular Dodecahedron': return createRegularDodecahedron();
        case 'Regular Icosahedron': return createRegularIcosahedron();
        case 'Cylinder': return createCylinder();
        case 'Cone': return createCone();
        case 'Conical Frustum': return createFrustum();
        case 'Sphere': return createSphere();
        case 'Hemisphere': return createHemisphere();
        default: throw new Error(`Unknown solid: ${name}`);
      }
    })();

    for (const face of solid.faces) {
      const isPlanar = isFaceCoplanar(solid.vertices, face, EPSILON);
      expect(isPlanar).toBe(true);
    }
  });
}

function testPlatonicEdgesEqual(name: string, expectedEdgeLength: number) {
  it(`${name}: All edges equal length (${expectedEdgeLength.toFixed(4)})`, () => {
    const solid = (() => {
      switch (name) {
        case 'Regular Tetrahedron': return createRegularTetrahedron();
        case 'Regular Octahedron': return createRegularOctahedron();
        case 'Regular Dodecahedron': return createRegularDodecahedron();
        case 'Regular Icosahedron': return createRegularIcosahedron();
        default: throw new Error(`${name} is not a Platonic solid`);
      }
    })();

    const edges = new Set<string>();
    for (const face of solid.faces) {
      for (let i = 0; i < face.length; i++) {
        const v1 = face[i];
        const v2 = face[(i + 1) % face.length];
        const edge = [Math.min(v1, v2), Math.max(v1, v2)].join('-');
        edges.add(edge);
      }
    }

    for (const edge of edges) {
      const [i1, i2] = edge.split('-').map(Number);
      const length = getEdgeLength(solid.vertices[i1], solid.vertices[i2]);
      expect(Math.abs(length - expectedEdgeLength)).toBeLessThan(VOL_AREA_EPSILON);
    }
  });
}

function testVolumeSurfaceArea(name: string, volume: number, area: number) {
  it(`${name}: Volume = ${volume.toFixed(2)}, Surface Area = ${area.toFixed(2)}`, () => {
    const solid = (() => {
      switch (name) {
        case 'Cube': return createCube();
        case 'Cuboid': return createCuboid();
        case 'Triangular Prism': return createTriangularPrism();
        case 'Square Pyramid': return createSquarePyramid();
        case 'Regular Tetrahedron': return createRegularTetrahedron();
        case 'Regular Octahedron': return createRegularOctahedron();
        case 'Regular Dodecahedron': return createRegularDodecahedron();
        case 'Regular Icosahedron': return createRegularIcosahedron();
        case 'Cylinder': return createCylinder();
        case 'Cone': return createCone();
        case 'Conical Frustum': return createFrustum();
        case 'Sphere': return createSphere();
        case 'Hemisphere': return createHemisphere();
        default: throw new Error(`Unknown solid: ${name}`);
      }
    })();

    expect(Math.abs(solid.volume - volume)).toBeLessThan(VOL_AREA_EPSILON);
    expect(Math.abs(solid.surfaceArea - area)).toBeLessThan(VOL_AREA_EPSILON);
  });
}

describe('3D Solids - Euler Formula', () => {
  testEulerFormula('Cube');
  testEulerFormula('Cuboid');
  testEulerFormula('Triangular Prism');
  testEulerFormula('Square Pyramid');
  testEulerFormula('Regular Tetrahedron');
  testEulerFormula('Regular Octahedron');
  testEulerFormula('Regular Dodecahedron');
  testEulerFormula('Regular Icosahedron');
  testEulerFormula('Cylinder');
  testEulerFormula('Cone');
  testEulerFormula('Conical Frustum');
  testEulerFormula('Sphere');
  testEulerFormula('Hemisphere');
});

describe('3D Solids - Face Planarity', () => {
  testFacesPlanar('Cube');
  testFacesPlanar('Cuboid');
  testFacesPlanar('Triangular Prism');
  testFacesPlanar('Square Pyramid');
  testFacesPlanar('Regular Tetrahedron');
  testFacesPlanar('Regular Octahedron');
  testFacesPlanar('Regular Icosahedron');
  testFacesPlanar('Cylinder');
  testFacesPlanar('Cone');
  testFacesPlanar('Conical Frustum');
  // Sphere and Hemisphere: faces are inherently non-planar due to curved surface
  // (radius 3, error ~0.054 >> tolerance 1e-9)
  // 3D-3B: the dodecahedron's corners and faces rebuilt (its edge is a, every face flat)
  testFacesPlanar('Regular Dodecahedron');
});

describe('Platonic Solids - Equal Edge Lengths', () => {
  testPlatonicEdgesEqual('Regular Tetrahedron', 5.0);
  testPlatonicEdgesEqual('Regular Octahedron', 4.0);
  testPlatonicEdgesEqual('Regular Dodecahedron', 2.5);
  testPlatonicEdgesEqual('Regular Icosahedron', 3.5);
});

describe('3D Solids - Volume and Surface Area', () => {
  testVolumeSurfaceArea('Cube', 64.0, 96.0);
  testVolumeSurfaceArea('Cuboid', 60.0, 94.0);
  testVolumeSurfaceArea('Triangular Prism', (SQRT3 / 4) * 4 * 4 * 6, (SQRT3 / 2) * 4 * 4 + 3 * 4 * 6);
  testVolumeSurfaceArea('Square Pyramid', 32.0, 16 + 16 * Math.sqrt(10));
  testVolumeSurfaceArea('Regular Tetrahedron', 5 ** 3 / (6 * SQRT2), SQRT3 * 5 * 5);
  testVolumeSurfaceArea('Regular Octahedron', (SQRT2 / 3) * 4 ** 3, 2 * SQRT3 * 4 * 4);
  testVolumeSurfaceArea('Cylinder', Math.PI * 2.5 * 2.5 * 5, 2 * Math.PI * 2.5 * 2.5 + 2 * Math.PI * 2.5 * 5);
  testVolumeSurfaceArea('Cone', (1 / 3) * Math.PI * 3 * 3 * 4, Math.PI * 3 * 3 + Math.PI * 3 * 5);
  testVolumeSurfaceArea('Sphere', (4 / 3) * Math.PI * 3 * 3 * 3, 4 * Math.PI * 3 * 3);
  testVolumeSurfaceArea('Hemisphere', (2 / 3) * Math.PI * 3 * 3 * 3, 3 * Math.PI * 3 * 3);
});

describe('3D Solids - Space Diagonal', () => {
  it('Cube space diagonal = a√3', () => {
    const a = 4.0;
    const cube = createCube(a);
    const diag = cube.vertices[0].distanceTo(cube.vertices[6]);
    expect(Math.abs(diag - a * SQRT3)).toBeLessThan(VOL_AREA_EPSILON);
  });

  it('Cuboid space diagonal = √(l² + w² + h²)', () => {
    const l = 5.0, w = 3.0, h = 4.0;
    const cuboid = createCuboid(l, w, h);
    const diag = cuboid.vertices[0].distanceTo(cuboid.vertices[6]);
    const expected = Math.sqrt(l * l + w * w + h * h);
    expect(Math.abs(diag - expected)).toBeLessThan(VOL_AREA_EPSILON);
  });
});

describe('3D Solids - Scaling Relations', () => {
  it('Scale factor k=2 on cube: area = 4×, volume = 8×', () => {
    const cube1 = createCube(2.0);
    const cube2 = createCube(4.0);

    const areaRatio = cube2.surfaceArea / cube1.surfaceArea;
    const volRatio = cube2.volume / cube1.volume;

    expect(Math.abs(areaRatio - 4)).toBeLessThan(VOL_AREA_EPSILON);
    expect(Math.abs(volRatio - 8)).toBeLessThan(VOL_AREA_EPSILON);
  });

  it('Sphere vs Cylinder: V_sphere = (2/3) × V_cylinder', () => {
    const r = 3.0, h = 2 * r;
    const sphere = createSphere(r);
    const cylinder = createCylinder(r, h);

    const ratio = sphere.volume / cylinder.volume;
    expect(Math.abs(ratio - 2 / 3)).toBeLessThan(VOL_AREA_EPSILON);
  });

  it('Cone vs Cylinder: V_cone = (1/3) × V_cylinder', () => {
    const r = 3.0, h = 5.0;
    const cone = createCone(r, h);
    const cylinder = createCylinder(r, h);

    const ratio = cone.volume / cylinder.volume;
    expect(Math.abs(ratio - 1 / 3)).toBeLessThan(VOL_AREA_EPSILON);
  });

  it('Cube: type annotation with Polyhedron', () => {
    const cube: Polyhedron = createCube(2.0);
    expect(cube.v).toBe(8);
  });
});

describe('3D Solids - getSolidByName Helper', () => {
  it('getSolidByName retrieves solids by name', () => {
    const cube = getSolidByName('cube');
    expect(cube).not.toBeNull();
    expect(cube?.name).toBe('Cube');

    const sphere = getSolidByName('sphere');
    expect(sphere).not.toBeNull();
    expect(sphere?.name).toBe('Sphere');
  });

  it('getSolidByName returns null for unknown solid', () => {
    const unknown = getSolidByName('unknown');
    expect(unknown).toBeNull();
  });
});
