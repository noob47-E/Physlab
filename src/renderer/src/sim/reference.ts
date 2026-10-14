export type Deriv = (t: number, y: number[]) => number[];

export function rk4(f: Deriv, y0: number[], t0: number, t1: number, dt: number): number[] {
  let y = [...y0];
  let t = t0;
  
  while (t < t1) {
    const step = Math.min(dt, t1 - t);
    if (step <= 1e-14) break;
    
    const k1 = f(t, y);
    const y2 = y.map((v, i) => v + 0.5 * step * k1[i]);
    
    const k2 = f(t + 0.5 * step, y2);
    const y3 = y.map((v, i) => v + 0.5 * step * k2[i]);
    
    const k3 = f(t + 0.5 * step, y3);
    const y4 = y.map((v, i) => v + step * k3[i]);
    
    const k4 = f(t + step, y4);
    
    y = y.map((v, i) => v + (step / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += step;
  }
  return y;
}

const a21 = 1/5;
const a31 = 3/40, a32 = 9/40;
const a41 = 44/45, a42 = -56/15, a43 = 32/9;
const a51 = 19372/6561, a52 = -25360/2187, a53 = 64448/6561, a54 = -212/729;
const a61 = 9017/3168, a62 = -355/33, a63 = 46732/5247, a64 = 49/176, a65 = -5103/18656;
const a71 = 35/384, a73 = 500/1113, a74 = 125/192, a75 = -2187/6784, a76 = 11/84;
const e1 = 71/57600, e3 = -71/16695, e4 = 71/1920, e5 = -17253/339200, e6 = 22/525, e7 = -1/40;

export function rk45(f: Deriv, y0: number[], t0: number, t1: number, tol: number): { y: number[]; steps: number } {
  let y = [...y0];
  let t = t0;
  let dt = (t1 - t0) * 0.1;
  let steps = 0;
  let k1 = f(t, y);
  
  while (t < t1) {
    if (t + dt > t1) {
      dt = t1 - t;
    }
    
    const y2 = y.map((v, i) => v + dt * a21 * k1[i]);
    const k2 = f(t + a21 * dt, y2);
    
    const y3 = y.map((v, i) => v + dt * (a31 * k1[i] + a32 * k2[i]));
    const k3 = f(t + (a31 + a32) * dt, y3);
    
    const y4 = y.map((v, i) => v + dt * (a41 * k1[i] + a42 * k2[i] + a43 * k3[i]));
    const k4 = f(t + (a41 + a42 + a43) * dt, y4);
    
    const y5 = y.map((v, i) => v + dt * (a51 * k1[i] + a52 * k2[i] + a53 * k3[i] + a54 * k4[i]));
    const k5 = f(t + (a51 + a52 + a53 + a54) * dt, y5);
    
    const y6 = y.map((v, i) => v + dt * (a61 * k1[i] + a62 * k2[i] + a63 * k3[i] + a64 * k4[i] + a65 * k5[i]));
    const k6 = f(t + dt, y6);
    
    const y_new = y.map((v, i) => v + dt * (a71 * k1[i] + a73 * k3[i] + a74 * k4[i] + a75 * k5[i] + a76 * k6[i]));
    const k7 = f(t + dt, y_new);
    
    let err = 0;
    for (let i = 0; i < y.length; i++) {
      const e = Math.abs(dt * (e1 * k1[i] + e3 * k3[i] + e4 * k4[i] + e5 * k5[i] + e6 * k6[i] + e7 * k7[i]));
      const scale = tol + tol * Math.abs(y[i]);
      err = Math.max(err, e / scale);
    }
    
    // eslint-disable-next-line no-restricted-syntax -- solver specific numerical limit
    if (err <= 1.0 || dt < 1e-12) {
      y = y_new;
      t += dt;
      k1 = k7;
      steps++;
    }
    
    const dt_opt = dt * Math.pow(1.0 / (err + 1e-15), 0.2);
    dt = Math.max(0.1 * dt, Math.min(5.0 * dt, 0.9 * dt_opt));
    
    if (t >= t1 - 1e-14) break;
  }
  
  return { y, steps };
}

export function verlet(accel: (x: number[]) => number[], x0: number[], v0: number[], dt: number, steps: number): { x: number[]; v: number[] } {
  let x = [...x0];
  let vel = [...v0];
  let a = accel(x);
  
  for (let step = 0; step < steps; step++) {
    x = x.map((xi, idx) => xi + vel[idx] * dt + 0.5 * a[idx] * dt * dt);
    const a_new = accel(x);
    vel = vel.map((v_i, idx) => v_i + 0.5 * (a[idx] + a_new[idx]) * dt);
    a = a_new;
  }
  
  return { x, v: vel };
}

export function rk45Until(f: Deriv, y0: number[], t0: number, tMax: number, tol: number, stop: (t: number, y: number[]) => number): { t: number; y: number[] } | null {
  let y = [...y0];
  let t = t0;
  let dt = (tMax - t0) * 0.1;
  let k1 = f(t, y);
  
  let s0 = stop(t, y);
  let onStart = s0 === 0;
  
  while (t < tMax) {
    if (t + dt > tMax) {
      dt = tMax - t;
    }
    
    const y2 = y.map((val, idx) => val + dt * a21 * k1[idx]);
    const k2 = f(t + a21 * dt, y2);
    
    const y3 = y.map((val, idx) => val + dt * (a31 * k1[idx] + a32 * k2[idx]));
    const k3 = f(t + (a31 + a32) * dt, y3);
    
    const y4 = y.map((val, idx) => val + dt * (a41 * k1[idx] + a42 * k2[idx] + a43 * k3[idx]));
    const k4 = f(t + (a41 + a42 + a43) * dt, y4);
    
    const y5 = y.map((val, idx) => val + dt * (a51 * k1[idx] + a52 * k2[idx] + a53 * k3[idx] + a54 * k4[idx]));
    const k5 = f(t + (a51 + a52 + a53 + a54) * dt, y5);
    
    const y6 = y.map((val, idx) => val + dt * (a61 * k1[idx] + a62 * k2[idx] + a63 * k3[idx] + a64 * k4[idx] + a65 * k5[idx]));
    const k6 = f(t + dt, y6);
    
    const y_new = y.map((val, idx) => val + dt * (a71 * k1[idx] + a73 * k3[idx] + a74 * k4[idx] + a75 * k5[idx] + a76 * k6[idx]));
    const k7 = f(t + dt, y_new);
    
    let err = 0;
    for (let idx = 0; idx < y.length; idx++) {
      const e = Math.abs(dt * (e1 * k1[idx] + e3 * k3[idx] + e4 * k4[idx] + e5 * k5[idx] + e6 * k6[idx] + e7 * k7[idx]));
      const scale = tol + tol * Math.abs(y[idx]);
      err = Math.max(err, e / scale);
    }
    
    // eslint-disable-next-line no-restricted-syntax -- solver specific numerical limit
    if (err <= 1.0 || dt < 1e-12) {
      const s1 = stop(t + dt, y_new);
      if (onStart) {
        // Start on the event: the side the run leaves towards decides the next crossing (JM, 13 Oct 2026). The
        // curve just after t0 is this step's cubic Hermite, read a thousandth of the step in; a flat start
        // (zero first derivative) is decided by its curvature the same way.
        onStart = false;
        const sf = 1e-3;
        const h00 = 2 * sf ** 3 - 3 * sf ** 2 + 1, h10 = sf ** 3 - 2 * sf ** 2 + sf;
        const h01 = -2 * sf ** 3 + 3 * sf ** 2, h11 = sf ** 3 - sf ** 2;
        const yAfter = y.map((_v, idx) => h00 * y[idx] + h10 * dt * k1[idx] + h01 * y_new[idx] + h11 * dt * k7[idx]);
        const leave = stop(t + sf * dt, yAfter);
        if (leave > 0) s0 = Number.MIN_VALUE;
        else if (leave < 0) s0 = -Number.MIN_VALUE;
      }
      
      if ((s0 > 0 && s1 <= 0) || (s0 < 0 && s1 >= 0)) {
        let t_left = t;
        let t_right = t + dt;
        let y_right = y_new;
        let t_mid: number;
        let y_mid: number[];
        
        for (let iter = 0; iter < 50; iter++) {
          t_mid = (t_left + t_right) / 2;
          const s_frac = (t_mid - t) / dt;
          
          const h00 = 2 * Math.pow(s_frac, 3) - 3 * Math.pow(s_frac, 2) + 1;
          const h10 = Math.pow(s_frac, 3) - 2 * Math.pow(s_frac, 2) + s_frac;
          const h01 = -2 * Math.pow(s_frac, 3) + 3 * Math.pow(s_frac, 2);
          const h11 = Math.pow(s_frac, 3) - Math.pow(s_frac, 2);
          
          y_mid = y.map((_val, idx) => 
            h00 * y[idx] + h10 * dt * k1[idx] + h01 * y_new[idx] + h11 * dt * k7[idx]
          );
          
          const s_mid = stop(t_mid, y_mid);
          if (s_mid === 0) {
            t_right = t_mid;
            y_right = y_mid;
          }
          
          if (s_mid === 0 || t_right - t_left < 1e-14) {
            break;
          }
          
          if ((s0 > 0 && s_mid <= 0) || (s0 < 0 && s_mid >= 0)) {
            t_right = t_mid;
            y_right = y_mid;
          } else {
            t_left = t_mid;
          }
        }
        
        return { t: t_right, y: y_right };
      }
      
      y = y_new;
      t += dt;
      k1 = k7;
      s0 = s1;
    }
    
    const dt_opt = dt * Math.pow(1.0 / (err + 1e-15), 0.2);
    dt = Math.max(0.1 * dt, Math.min(5.0 * dt, 0.9 * dt_opt));
    
    if (t >= tMax - 1e-14) break;
  }
  
  return null;
}

export const systems = {
  pendulum(L: number, g: number): Deriv {
    return (_t: number, yy: number[]) => {
      return [yy[1], -(g / L) * Math.sin(yy[0])];
    };
  },
  
  doublePendulum(m1: number, m2: number, L1: number, L2: number, g: number): Deriv {
    return (_t: number, yy: number[]) => {
      const th1 = yy[0], th2 = yy[1], w1 = yy[2], w2 = yy[3];
      
      // The standard mass-matrix form (JM, 13 Oct 2026: the earlier form divided a2 by m2, so it was wrong for m2 != 1):
      //   M11 a1 + M12 a2 = F1 ;  M12 a1 + M22 a2 = F2
      const c = Math.cos(th1 - th2), s = Math.sin(th1 - th2);
      const M = m1 + m2;
      const M11 = M * L1 * L1, M12 = m2 * L1 * L2 * c, M22 = m2 * L2 * L2;
      const F1 = -M * g * L1 * Math.sin(th1) - m2 * L1 * L2 * w2 * w2 * s;
      const F2 = -m2 * g * L2 * Math.sin(th2) + m2 * L1 * L2 * w1 * w1 * s;
      const det = M11 * M22 - M12 * M12;
      const a1 = (M22 * F1 - M12 * F2) / det;
      const a2 = (M11 * F2 - M12 * F1) / det;
      
      return [w1, w2, a1, a2];
    };
  },
  
  springMass(m: number, k: number): Deriv {
    return (_t: number, yy: number[]) => {
      return [yy[1], -(k / m) * yy[0]];
    };
  },
  
  dragProjectile(m: number, r: number, cd: number, rho: number, g: number): Deriv {
    const A = Math.PI * r * r;
    const coeff = 0.5 * rho * cd * A / m;
    
    return (_t: number, yy: number[]) => {
      const vx = yy[2];
      const vy = yy[3];
      const v_mag = Math.sqrt(vx * vx + vy * vy);
      
      const ax = -coeff * v_mag * vx;
      const ay = -g - coeff * v_mag * vy;
      
      return [vx, vy, ax, ay];
    };
  }
};
