/**
 * 3D Geometry Theorems: 10 Interactive Demonstrations
 * Data structure for Geometry mode's "TRY A THEOREM" gallery
 */

export interface Theorem3D {
  id: string;
  title: string;
  solids: string[];
  planes?: {
    name: string;
    normal?: [number, number, number];
    offset?: number;
  }[];
  parameter: {
    name: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
  };
  quantities: {
    name: string;
    format: (paramValue: number) => number | string;
    unit?: string;
  }[];
  statement: string;
  ahaSentence: string;
}

/**
 * 1. Euler's Polyhedron Formula (V - E + F = 2)
 * Demonstrates that all convex polyhedra satisfy this invariant
 */
export const eulerFormula: Theorem3D = {
  id: 'euler-polyhedron',
  title: "Euler's Polyhedron Formula (V − E + F = 2)",
  solids: ['Tetrahedron', 'Pyramid', 'Cube', 'Prism', 'Octahedron', 'Dodecahedron', 'Icosahedron'],
  parameter: {
    name: 'shape',
    min: 0,
    max: 6,
    step: 1,
    default: 2,
    unit: 'selector',
  },
  quantities: [
    {
      name: 'V (vertices)',
      format: (idx) => {
        const vValues = [4, 5, 8, 6, 6, 20, 12];
        return vValues[Math.floor(idx)];
      },
    },
    {
      name: 'E (edges)',
      format: (idx) => {
        const eValues = [6, 8, 12, 9, 12, 30, 30];
        return eValues[Math.floor(idx)];
      },
    },
    {
      name: 'F (faces)',
      format: (idx) => {
        const fValues = [4, 5, 6, 5, 8, 12, 20];
        return fValues[Math.floor(idx)];
      },
    },
    {
      name: 'V − E + F',
      format: (idx) => {
        const vValues = [4, 5, 8, 6, 6, 20, 12];
        const eValues = [6, 8, 12, 9, 12, 30, 30];
        const fValues = [4, 5, 6, 5, 8, 12, 20];
        const i = Math.floor(idx);
        return vValues[i] - eValues[i] + fValues[i];
      },
    },
  ],
  statement: 'For any convex polyhedron, V − E + F = 2, where V is vertices, E is edges, and F is faces.',
  ahaSentence: 'Every convex polyhedron, no matter how complex, always yields exactly 2 when you calculate vertices minus edges plus faces.',
};

/**
 * 2. Pythagoras in 3-D (Space Diagonal of a Cuboid)
 * Shows that space diagonal satisfies D = √(a² + b² + c²)
 */
export const pythagorasSpace: Theorem3D = {
  id: 'pythagoras-3d',
  title: 'Pythagoras in 3-D (Space Diagonal)',
  solids: ['Cuboid'],
  parameter: {
    name: 'size index',
    min: 0,
    max: 2,
    step: 1,
    default: 0,
    unit: 'selector',
  },
  quantities: [
    {
      name: 'a',
      format: (idx) => {
        const sizes = [3, 4, 2];
        return sizes[Math.floor(idx)];
      },
      unit: 'u',
    },
    {
      name: 'b',
      format: (idx) => {
        const sizes = [4, 5, 3];
        return sizes[Math.floor(idx)];
      },
      unit: 'u',
    },
    {
      name: 'c',
      format: (idx) => {
        const sizes = [5, 6, 6];
        return sizes[Math.floor(idx)];
      },
      unit: 'u',
    },
    {
      name: 'Floor diagonal (a² + b²)',
      format: (idx) => {
        const a = [3, 4, 2][Math.floor(idx)];
        const b = [4, 5, 3][Math.floor(idx)];
        return Math.sqrt(a * a + b * b);
      },
      unit: 'u',
    },
    {
      name: 'Space diagonal (√(a² + b² + c²))',
      format: (idx) => {
        const a = [3, 4, 2][Math.floor(idx)];
        const b = [4, 5, 3][Math.floor(idx)];
        const c = [5, 6, 6][Math.floor(idx)];
        return Math.sqrt(a * a + b * b + c * c);
      },
      unit: 'u',
    },
  ],
  statement: 'The space diagonal of a cuboid with sides a, b, c is D = √(a² + b² + c²).',
  ahaSentence: 'The 2D Pythagorean theorem applies twice in sequence: once on the floor, then vertically to reach the opposite corner.',
};

/**
 * 3. Archimedes' Sphere & Cylinder
 * Shows V_sphere = (2/3) × V_cylinder for a sphere inscribed in a cylinder
 */
export const archimedes: Theorem3D = {
  id: 'archimedes-sphere-cylinder',
  title: "Archimedes' Sphere & Cylinder",
  solids: ['Sphere', 'Cylinder'],
  parameter: {
    name: 'radius',
    min: 1.5,
    max: 4.0,
    step: 0.5,
    default: 3.0,
    unit: 'u',
  },
  quantities: [
    {
      name: 'V_cylinder',
      format: (r) => Math.PI * r * r * (2 * r),
      unit: 'u³',
    },
    {
      name: 'V_sphere',
      format: (r) => (4 / 3) * Math.PI * r * r * r,
      unit: 'u³',
    },
    {
      name: 'V_sphere / V_cylinder',
      format: () => 2 / 3,
      unit: 'ratio',
    },
    {
      name: 'A_sphere (curved)',
      format: (r) => 4 * Math.PI * r * r,
      unit: 'u²',
    },
    {
      name: 'A_cylinder (curved)',
      format: (r) => 2 * Math.PI * r * (2 * r),
      unit: 'u²',
    },
  ],
  statement: 'A sphere inscribed in a cylinder has volume exactly 2/3 of the cylinder, and curved surface area equal to the cylinder\'s curved wall.',
  ahaSentence: 'Archimedes proved this 2,200 years ago and asked to have it carved on his tombstone: 2/3 is the eternal ratio.',
};

/**
 * 4. Cone vs. Cylinder
 * Shows V_cone = (1/3) × V_cylinder for a cone and cylinder of equal base and height
 */
export const coneVsCylinder: Theorem3D = {
  id: 'cone-vs-cylinder',
  title: 'Cone vs. Cylinder (V = 1/3 × V_cylinder)',
  solids: ['Cone', 'Cylinder'],
  parameter: {
    name: 'fill level',
    min: 0,
    max: 3,
    step: 1,
    default: 0,
    unit: 'cones',
  },
  quantities: [
    {
      name: 'Cylinder volume',
      format: () => Math.PI * 3 * 3 * 5,
      unit: 'u³',
    },
    {
      name: 'One cone volume',
      format: () => (1 / 3) * Math.PI * 3 * 3 * 5,
      unit: 'u³',
    },
    {
      name: 'Cones poured',
      format: (level) => Math.floor(level),
    },
    {
      name: 'Total volume poured',
      format: (level) => Math.floor(level) * (1 / 3) * Math.PI * 3 * 3 * 5,
      unit: 'u³',
    },
  ],
  statement: 'A cone with base radius r and height h has volume V = (1/3)πr²h, which is exactly one-third of a cylinder with the same base and height.',
  ahaSentence: 'No matter how you stretch r or h, it takes exactly 3 cones to fill the cylinder to the brim.',
};

/**
 * 5. Cavalieri's Principle (Sheared Stack)
 * Shows two stacks with same cross-sectional area at every height have equal volume
 */
export const cavalieri: Theorem3D = {
  id: 'cavalieri-principle',
  title: "Cavalieri's Principle (Equal Cross-Sections = Equal Volume)",
  solids: ['Cylinder'],
  parameter: {
    name: 'shear offset',
    min: -4.0,
    max: 4.0,
    step: 0.5,
    default: 0,
    unit: 'u',
  },
  quantities: [
    {
      name: 'Cylinder height',
      format: () => 6.0,
      unit: 'u',
    },
    {
      name: 'Cross-section area (straight)',
      format: () => Math.PI * 2.5 * 2.5,
      unit: 'u²',
    },
    {
      name: 'Cross-section area (sheared)',
      format: () => Math.PI * 2.5 * 2.5,
      unit: 'u²',
    },
    {
      name: 'Volume (straight)',
      format: () => Math.PI * 2.5 * 2.5 * 6.0,
      unit: 'u³',
    },
    {
      name: 'Volume (sheared)',
      format: () => Math.PI * 2.5 * 2.5 * 6.0,
      unit: 'u³',
    },
  ],
  statement: 'If two solids have the same height and identical cross-sectional area at every height, their volumes are equal.',
  ahaSentence: 'Shearing a cylinder sideways makes it lean dramatically, but every horizontal slice stays the same size, so the volume never changes.',
};

/**
 * 6. Cross-Sections of a Cube
 * Shows a plane slicing a cube produces 3, 4, 5, or 6-sided polygons
 */
export const cubeCrossSection: Theorem3D = {
  id: 'cube-cross-section',
  title: 'Cross-Sections of a Cube',
  solids: ['Cube'],
  planes: [
    { name: 'Square (flat)', normal: [0, 0, 1], offset: 0 },
    { name: 'Triangle (corner)', normal: [1, 1, 1], offset: -4 },
    { name: 'Hexagon (diagonal)', normal: [1, 1, 1], offset: 0 },
  ],
  parameter: {
    name: 'plane position',
    min: -3.4,
    max: 3.4,
    step: 0.1,
    default: 0,
    unit: 'u',
  },
  quantities: [
    {
      name: 'Polygon sides',
      format: (d) => {
        const aDist = Math.abs(d);
        if (aDist < 0.1) return 6;
        if (aDist < 2.5) return 6;
        if (aDist <= 3.4) return 3;
        return 0;
      },
    },
    {
      name: 'Polygon type',
      format: (d) => {
        const aDist = Math.abs(d);
        if (aDist < 0.1) return 'Regular Hexagon';
        if (aDist < 2.5) return 'Rectangle/Hexagon';
        if (aDist <= 3.4) return 'Triangle';
        return 'None';
      },
    },
    {
      name: 'Slice area',
      format: (d) => {
        const aDist = Math.abs(d);
        const sqr3 = Math.sqrt(3);
        const a = 4;
        if (aDist < 0.1) return 2 * sqr3 * a * a / 2;
        if (aDist < 2.5) return Math.max(0, a * a * (1 - aDist / (a * Math.sqrt(3))));
        if (aDist < 3.4) return Math.max(0, a * a * sqr3 / 4 * Math.pow(1 - aDist / (a * Math.sqrt(3) / 2), 2));
        return 0;
      },
      unit: 'u²',
    },
  ],
  statement: 'A plane slicing a cube can produce a triangle, square, pentagon, or regular hexagon polygon.',
  ahaSentence: 'Tilt the plane to normal (1,1,1) and watch an equilateral triangle grow into a regular hexagon at the cube\'s exact center, then shrink back to a triangle.',
};

/**
 * 7. 3-D Nets Unfolding into 2-D
 * Shows how solid surface area equals sum of unfolded net faces
 */
export const netUnfolding: Theorem3D = {
  id: 'nets-unfold',
  title: '3-D Nets Unfolding into 2-D',
  solids: ['Cube', 'Square Pyramid', 'Triangular Prism', 'Tetrahedron', 'Octahedron'],
  parameter: {
    name: 'unfold progress',
    min: 0,
    max: 100,
    step: 5,
    default: 0,
    unit: '%',
  },
  quantities: [
    {
      name: 'Shape',
      format: () => 'Selected',
    },
    {
      name: '3D surface area',
      format: () => 54.0,
      unit: 'u²',
    },
    {
      name: 'Flattened net area',
      format: () => 54.0,
      unit: 'u²',
    },
    {
      name: 'Unfold animation',
      format: (progress) => `${Math.floor(progress as number)}%`,
    },
  ],
  statement: 'The total surface area of a polyhedron equals the sum of the 2D areas of its unfolded net faces.',
  ahaSentence: 'Watching the pyramid\'s four walls hinge flat into a star shape reveals why the slant height (not vertical height) appears in the formula.',
};

/**
 * 8. Angle Between a Line and a Plane
 * Shows θ is the angle between line and its orthogonal projection on plane
 */
export const lineToPlane: Theorem3D = {
  id: 'line-plane-angle',
  title: 'Angle Between a Line and a Plane',
  solids: [],
  planes: [{ name: 'Horizontal (z = 0)', normal: [0, 0, 1] }],
  parameter: {
    name: 'point rotation',
    min: 0,
    max: 360,
    step: 15,
    default: 0,
    unit: '°',
  },
  quantities: [
    {
      name: 'Line length |AB|',
      format: () => Math.sqrt(16 + 9 + 25),
      unit: 'u',
    },
    {
      name: 'Shadow length |AB\'|',
      format: () => Math.sqrt(16 + 9),
      unit: 'u',
    },
    {
      name: 'Height |BB\'|',
      format: () => 5.0,
      unit: 'u',
    },
    {
      name: 'Angle θ',
      format: () => {
        const lineLen = Math.sqrt(16 + 9 + 25);
        const height = 5;
        return (Math.asin(height / lineLen) * 180) / Math.PI;
      },
      unit: '°',
    },
  ],
  statement: 'The angle θ between a line and a plane is given by sin(θ) = h/|line|, where h is the perpendicular distance from line endpoint to plane.',
  ahaSentence: 'Rotating point B in a circle around the z-axis changes x and y, but the shadow length stays constant, locking the angle at 45°.',
};

/**
 * 9. Shortest Distance from a Point to a Plane
 * Shows D_perp = |n·P - d| / |n| is the minimum distance
 */
export const pointToPlane: Theorem3D = {
  id: 'point-plane-distance',
  title: 'Shortest Distance from a Point to a Plane',
  solids: [],
  planes: [{ name: 'Tilted plane (x + 2y + 2z = 6)', normal: [1, 2, 2], offset: 6 }],
  parameter: {
    name: 'test point angle',
    min: 0,
    max: 360,
    step: 15,
    default: 0,
    unit: '°',
  },
  quantities: [
    {
      name: 'Point P',
      format: () => 'Fixed at (4, 5, 6)',
    },
    {
      name: 'Perpendicular foot F',
      // 3D-3B: the foot is P − (20/9)(1, 2, 2) = (16/9, 5/9, 14/9); the (2, 1, 2) given before is not on the plane (2 + 2 + 4 = 8).
      format: () => '(16/9, 5/9, 14/9)',
    },
    {
      name: 'Shortest distance D_perp',
      format: (_angle) => {
        const num = Math.abs(1 * 4 + 2 * 5 + 2 * 6 - 6);
        const den = Math.sqrt(1 + 4 + 4);
        return num / den;
      },
      unit: 'u',
    },
    {
      name: 'Formula: D = |n·P - d| / |n|',
      format: () => 'Applied',
    },
  ],
  statement: 'The shortest distance from point P to plane ax + by + cz = d is D = |ax₀ + by₀ + cz₀ - d| / √(a² + b² + c²).',
  ahaSentence: 'Dragging test point Q around the plane watches |PQ| shrink to exactly 6.67u when Q lands on the perpendicular foot F.',
};

/**
 * 10. Similar Solids: Scale Factor k → Area k², Volume k³
 * Shows scaling laws for surface area and volume
 */
export const similarSolids: Theorem3D = {
  id: 'similar-solids-scaling',
  title: 'Similar Solids: Scale Factor k (Area k², Volume k³)',
  solids: ['Cube', 'Sphere', 'Square Pyramid'],
  parameter: {
    name: 'scale factor',
    min: 0.5,
    max: 3.0,
    step: 0.5,
    default: 1.0,
    unit: 'k',
  },
  quantities: [
    {
      name: 'Reference length L₀',
      format: () => 2.0,
      unit: 'u',
    },
    {
      name: 'Scaled length L',
      format: (k) => 2.0 * k,
      unit: 'u',
    },
    {
      name: 'Length ratio L/L₀',
      format: (k) => k,
    },
    {
      name: 'Reference area A₀',
      format: () => 24.0,
      unit: 'u²',
    },
    {
      name: 'Scaled area A',
      format: (k) => 24.0 * k * k,
      unit: 'u²',
    },
    {
      name: 'Area ratio A/A₀',
      format: (k) => k * k,
    },
    {
      name: 'Reference volume V₀',
      format: () => 8.0,
      unit: 'u³',
    },
    {
      name: 'Scaled volume V',
      format: (k) => 8.0 * k * k * k,
      unit: 'u³',
    },
    {
      name: 'Volume ratio V/V₀',
      format: (k) => k * k * k,
    },
  ],
  statement: 'Scaling every linear dimension of any 3D solid by factor k multiplies surface area by k² and volume by k³.',
  ahaSentence: 'At k = 2, ghost grid lines divide the cube into 2 × 2 × 2 = 8 small cubes and each face into 4 squares—seeing why doubling one dimension cubes the volume.',
};

/**
 * Export all theorems as an array
 */
export const theorems3D: Theorem3D[] = [
  eulerFormula,
  pythagorasSpace,
  archimedes,
  coneVsCylinder,
  cavalieri,
  cubeCrossSection,
  netUnfolding,
  lineToPlane,
  pointToPlane,
  similarSolids,
];
