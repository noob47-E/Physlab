export type Tier = 'low' | 'medium' | 'high';

export interface Bounds {
    min: [number, number, number];
    max: [number, number, number];
}

export const TIER_STAGE: Record<Tier, { shadows: boolean; mapSize: number; softness: number; environment: boolean; blobShadows: boolean }> = {
    low: { shadows: false, mapSize: 0, softness: 0, environment: false, blobShadows: true },
    medium: { shadows: true, mapSize: 1024, softness: 2, environment: true, blobShadows: false },
    high: { shadows: true, mapSize: 2048, softness: 3, environment: true, blobShadows: false }
};

export function boundsOf(points: [number, number, number][], radius: number[]): Bounds {
    if (points.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const r = radius[i];
        for (let j = 0; j < 3; j++) {
            if (p[j] - r < min[j]) min[j] = p[j] - r;
            if (p[j] + r > max[j]) max[j] = p[j] + r;
        }
    }
    return { min, max };
}

export function shadowCamera(b: Bounds, lightDir: [number, number, number], margin = 1): { left: number; right: number; top: number; bottom: number; near: number; far: number; target: [number, number, number] } {
    const target: [number, number, number] = [
        (b.min[0] + b.max[0]) / 2,
        (b.min[1] + b.max[1]) / 2,
        (b.min[2] + b.max[2]) / 2
    ];

    const len = Math.hypot(lightDir[0], lightDir[1], lightDir[2]);
    const zDir = len === 0 ? [0, 0, 1] : [lightDir[0] / len, lightDir[1] / len, lightDir[2] / len];

    const lz: [number, number, number] = [-zDir[0], -zDir[1], -zDir[2]];

    let up: [number, number, number] = [0, 1, 0];
    if (Math.abs(lz[1]) > 0.999) up = [0, 0, 1];

    let lx: [number, number, number] = [
        up[1] * lz[2] - up[2] * lz[1],
        up[2] * lz[0] - up[0] * lz[2],
        up[0] * lz[1] - up[1] * lz[0]
    ];
    const xLen = Math.hypot(lx[0], lx[1], lx[2]);
    lx = [lx[0] / xLen, lx[1] / xLen, lx[2] / xLen];

    let ly: [number, number, number] = [
        lz[1] * lx[2] - lz[2] * lx[1],
        lz[2] * lx[0] - lz[0] * lx[2],
        lz[0] * lx[1] - lz[1] * lx[0]
    ];
    const yLen = Math.hypot(ly[0], ly[1], ly[2]);
    ly = [ly[0] / yLen, ly[1] / yLen, ly[2] / yLen];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                const cx = i === 0 ? b.min[0] : b.max[0];
                const cy = j === 0 ? b.min[1] : b.max[1];
                const cz = k === 0 ? b.min[2] : b.max[2];

                const vx = cx - target[0];
                const vy = cy - target[1];
                const vz = cz - target[2];

                const px = vx * lx[0] + vy * lx[1] + vz * lx[2];
                const py = vx * ly[0] + vy * ly[1] + vz * ly[2];
                const pz = vx * lz[0] + vy * lz[1] + vz * lz[2];

                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
                if (pz < minZ) minZ = pz;
                if (pz > maxZ) maxZ = pz;
            }
        }
    }

    return {
        left: minX - margin,
        right: maxX + margin,
        bottom: minY - margin,
        top: maxY + margin,
        near: -maxZ - margin,
        far: -minZ + margin,
        target
    };
}

export function needsRefit(old: Bounds, now: Bounds, slack = 2): boolean {
    for (let i = 0; i < 3; i++) {
        if (now.min[i] < old.min[i] - slack) return true;
        if (now.max[i] > old.max[i] + slack) return true;
    }
    return false;
}

export function gridStep(pixelsPerMetre: number): { minor: number; major: number } {
    const target = 12 / pixelsPerMetre;
    const exp = Math.ceil(Math.log10(target));
    const minor = Number(`1e${exp}`);
    return { minor, major: 10 * minor };
}

export function horizonFade(distance: number, start: number, end: number): number {
    if (start === end) return distance < start ? 1 : 0;
    if (distance <= start) return 1;
    if (distance >= end) return 0;
    const t = (distance - start) / (end - start);
    return 1 - t * t * (3 - 2 * t);
}

function normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len === 0 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

export const LIGHT_RIG = {
    key: {
        dir: normalize([0.45, 0.85, 0.35]),
        intensity: 2.2
    },
    fill: {
        dir: normalize([-1, 0, -1]),
        intensity: 0.5
    },
    hemi: {
        intensity: 0.6
    },
    ambientLow: 0.55
};
