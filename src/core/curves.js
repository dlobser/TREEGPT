// ============================================================================
// curves.js — polylines, Catmull-Rom resampling, rotation-minimising frames,
// and lofted grids.
//
// Everything that used to live inside the old library's SplineCurve3 /
// nurbsishSurface / insertLerpVerts / removeZeroLength lives here, as plain
// typed-array maths with no three.js and no DOM.
//
// Two shapes travel between functions:
//   Polyline  { pts: Float64Array(n*3), rads: Float64Array(n), n }
//   Grid      { pts: Float64Array(nu*nv*3), rads: Float64Array(nu*nv), nu, nv }
//             row-major: vertex (u, v) is at index (v * nu + u).
//             u runs along the ribs, v runs across them.
// ============================================================================

export function polyline(n) {
  return { pts: new Float64Array(n * 3), rads: new Float64Array(n), n };
}

export function grid(nu, nv) {
  return { pts: new Float64Array(nu * nv * 3), rads: new Float64Array(nu * nv), nu, nv };
}

/** Drop points closer together than `min`, keeping the largest radius of the pair. */
export function dedupe(line, min = 1e-5) {
  const { pts, rads, n } = line;
  const min2 = min * min;
  const op = [], or = [];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    const m = op.length;
    if (m >= 3) {
      const dx = x - op[m - 3], dy = y - op[m - 2], dz = z - op[m - 1];
      if (dx * dx + dy * dy + dz * dz < min2) { or[or.length - 1] = Math.max(or[or.length - 1], rads[i]); continue; }
    }
    op.push(x, y, z); or.push(rads[i]);
  }
  const out = polyline(or.length);
  out.pts.set(op); out.rads.set(or);
  return out;
}

// centripetal Catmull-Rom through p1..p2, with p0/p3 as neighbours
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Point at parameter u in [0,1] over a polyline's control points (not arc length). */
export function pointAt(line, u, out = [0, 0, 0]) {
  const { pts, n } = line;
  if (n === 1) { out[0] = pts[0]; out[1] = pts[1]; out[2] = pts[2]; return out; }
  const f = Math.min(0.999999999, Math.max(0, u)) * (n - 1);
  const k = Math.floor(f), t = f - k;
  const a = Math.max(0, k - 1), b = k, c = Math.min(n - 1, k + 1), d = Math.min(n - 1, k + 2);
  for (let ax = 0; ax < 3; ax++) out[ax] = cr(pts[a * 3 + ax], pts[b * 3 + ax], pts[c * 3 + ax], pts[d * 3 + ax], t);
  return out;
}

export function radiusAt(line, u) {
  const { rads, n } = line;
  if (n === 1) return rads[0];
  const f = Math.min(0.999999999, Math.max(0, u)) * (n - 1);
  const k = Math.floor(f), t = f - k;
  return rads[k] + (rads[Math.min(n - 1, k + 1)] - rads[k]) * t;
}

/** Subdivide a polyline `mul`x, keeping the original control points. */
export function subdivide(line, mul) {
  mul = Math.max(1, mul | 0);
  if (mul === 1 || line.n < 2) return line;
  const n = (line.n - 1) * mul + 1;
  const out = polyline(n);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    pointAt(line, u, p);
    out.pts[i * 3] = p[0]; out.pts[i * 3 + 1] = p[1]; out.pts[i * 3 + 2] = p[2];
    out.rads[i] = radiusAt(line, u);
  }
  return out;
}

/**
 * Resample to exactly `n` points spaced evenly by arc length. This is what the
 * old code got from SplineCurve3.getPointAt, and it is what makes a loft between
 * two ribs of different lengths line up.
 */
export function resample(line, n) {
  n = Math.max(2, n | 0);
  if (line.n < 2) { const o = polyline(n); for (let i = 0; i < n; i++) { o.pts[i * 3] = line.pts[0]; o.pts[i * 3 + 1] = line.pts[1]; o.pts[i * 3 + 2] = line.pts[2]; o.rads[i] = line.rads[0]; } return o; }
  // walk a dense sampling to build an arc-length table
  const dense = Math.max(64, (line.n - 1) * 12);
  const len = new Float64Array(dense + 1);
  const p = [0, 0, 0];
  let px = 0, py = 0, pz = 0, total = 0;
  for (let i = 0; i <= dense; i++) {
    pointAt(line, i / dense, p);
    if (i > 0) total += Math.hypot(p[0] - px, p[1] - py, p[2] - pz);
    len[i] = total;
    px = p[0]; py = p[1]; pz = p[2];
  }
  const out = polyline(n);
  if (total < 1e-12) { for (let i = 0; i < n; i++) { pointAt(line, 0, p); out.pts[i * 3] = p[0]; out.pts[i * 3 + 1] = p[1]; out.pts[i * 3 + 2] = p[2]; out.rads[i] = line.rads[0]; } return out; }
  let seek = 0;
  for (let i = 0; i < n; i++) {
    const target = total * i / (n - 1);
    while (seek < dense && len[seek + 1] < target) seek++;
    const span = len[seek + 1] - len[seek];
    const frac = span > 1e-12 ? (target - len[seek]) / span : 0;
    const u = (seek + frac) / dense;
    pointAt(line, u, p);
    out.pts[i * 3] = p[0]; out.pts[i * 3 + 1] = p[1]; out.pts[i * 3 + 2] = p[2];
    out.rads[i] = radiusAt(line, u);
  }
  return out;
}

/**
 * Loft a grid across an ordered list of ribs.
 * Every rib is resampled to nu points, then nv rows are interpolated across the
 * ribs with the same Catmull-Rom, so a two-rib loft is a smooth ruled strip and
 * a many-rib loft is a smooth surface.
 */
export function loft(ribs, nu, nv, closed = false) {
  const R = ribs.length;
  if (R < 2) return null;
  nu = Math.max(2, nu | 0); nv = Math.max(2, nv | 0);
  const rs = ribs.map((r) => resample(r, nu));
  const g = grid(nu, nv);
  const idx = (k) => closed ? ((k % R) + R) % R : Math.min(R - 1, Math.max(0, k));
  for (let v = 0; v < nv; v++) {
    const f = closed ? (v / nv) * R : (v / (nv - 1)) * (R - 1);
    const k = Math.floor(f), t = f - k;
    const a = rs[idx(k - 1)], b = rs[idx(k)], c = rs[idx(k + 1)], d = rs[idx(k + 2)];
    for (let u = 0; u < nu; u++) {
      const o = (v * nu + u) * 3, q = u * 3;
      for (let ax = 0; ax < 3; ax++) g.pts[o + ax] = cr(a.pts[q + ax], b.pts[q + ax], c.pts[q + ax], d.pts[q + ax], t);
      g.rads[v * nu + u] = b.rads[u] + (c.rads[u] - b.rads[u]) * t;
    }
  }
  return g;
}

/** Per-vertex normals of a grid, from the cross product of its two tangents. */
export function gridNormals(g, out = new Float64Array(g.nu * g.nv * 3)) {
  const { pts, nu, nv } = g;
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const i = v * nu + u;
      const uA = v * nu + Math.max(0, u - 1), uB = v * nu + Math.min(nu - 1, u + 1);
      const vA = Math.max(0, v - 1) * nu + u, vB = Math.min(nv - 1, v + 1) * nu + u;
      const tx = pts[uB * 3] - pts[uA * 3], ty = pts[uB * 3 + 1] - pts[uA * 3 + 1], tz = pts[uB * 3 + 2] - pts[uA * 3 + 2];
      const sx = pts[vB * 3] - pts[vA * 3], sy = pts[vB * 3 + 1] - pts[vA * 3 + 1], sz = pts[vB * 3 + 2] - pts[vA * 3 + 2];
      let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
      out[i * 3] = nx; out[i * 3 + 1] = ny; out[i * 3 + 2] = nz;
    }
  }
  return out;
}

/** Rows of a grid as polylines (constant v, u varying) — the lofted cross curves. */
export function gridRows(g) {
  const out = [];
  for (let v = 0; v < g.nv; v++) {
    const line = polyline(g.nu);
    for (let u = 0; u < g.nu; u++) {
      const i = v * g.nu + u;
      line.pts[u * 3] = g.pts[i * 3]; line.pts[u * 3 + 1] = g.pts[i * 3 + 1]; line.pts[u * 3 + 2] = g.pts[i * 3 + 2];
      line.rads[u] = g.rads[i];
    }
    out.push(line);
  }
  return out;
}

/** Columns of a grid as polylines (constant u, v varying) — the ribs' direction. */
export function gridCols(g) {
  const out = [];
  for (let u = 0; u < g.nu; u++) {
    const line = polyline(g.nv);
    for (let v = 0; v < g.nv; v++) {
      const i = v * g.nu + u;
      line.pts[v * 3] = g.pts[i * 3]; line.pts[v * 3 + 1] = g.pts[i * 3 + 1]; line.pts[v * 3 + 2] = g.pts[i * 3 + 2];
      line.rads[v] = g.rads[i];
    }
    out.push(line);
  }
  return out;
}

/** Rotation-minimising frames along a polyline. Returns {T, N, B} Float64Arrays. */
export function frames(line) {
  const { pts, n } = line;
  const T = new Float64Array(n * 3), N = new Float64Array(n * 3), B = new Float64Array(n * 3);
  let pTx = 0, pTy = 1, pTz = 0, pNx = 1, pNy = 0, pNz = 0;
  for (let i = 0; i < n; i++) {
    const i0 = i === 0 ? 0 : i - 1, i1 = i === n - 1 ? n - 1 : i + 1;
    let tx = pts[i1 * 3] - pts[i0 * 3], ty = pts[i1 * 3 + 1] - pts[i0 * 3 + 1], tz = pts[i1 * 3 + 2] - pts[i0 * 3 + 2];
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-12) { tx = pTx; ty = pTy; tz = pTz; tl = 1; }
    tx /= tl; ty /= tl; tz /= tl;
    let nx, ny, nz;
    if (i === 0) {
      const ux = Math.abs(ty) < 0.9 ? 0 : 1, uy = Math.abs(ty) < 0.9 ? 1 : 0;
      const d = ux * tx + uy * ty;
      nx = ux - tx * d; ny = uy - ty * d; nz = -tz * d;
    } else {
      // double reflection
      const v1x = pts[i * 3] - pts[(i - 1) * 3], v1y = pts[i * 3 + 1] - pts[(i - 1) * 3 + 1], v1z = pts[i * 3 + 2] - pts[(i - 1) * 3 + 2];
      const c1 = v1x * v1x + v1y * v1y + v1z * v1z;
      let rlx = pNx, rly = pNy, rlz = pNz, tlx = pTx, tly = pTy, tlz = pTz;
      if (c1 > 1e-14) {
        const k1 = 2 / c1 * (v1x * pNx + v1y * pNy + v1z * pNz);
        rlx -= v1x * k1; rly -= v1y * k1; rlz -= v1z * k1;
        const k2 = 2 / c1 * (v1x * pTx + v1y * pTy + v1z * pTz);
        tlx -= v1x * k2; tly -= v1y * k2; tlz -= v1z * k2;
      }
      const v2x = tx - tlx, v2y = ty - tly, v2z = tz - tlz;
      const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
      nx = rlx; ny = rly; nz = rlz;
      if (c2 > 1e-14) {
        const k3 = 2 / c2 * (v2x * rlx + v2y * rly + v2z * rlz);
        nx -= v2x * k3; ny -= v2y * k3; nz -= v2z * k3;
      }
      const d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d; ny -= ty * d; nz -= tz * d;
    }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    T[i * 3] = tx; T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
    N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
    B[i * 3] = ty * nz - tz * ny; B[i * 3 + 1] = tz * nx - tx * nz; B[i * 3 + 2] = tx * ny - ty * nx;
    pTx = tx; pTy = ty; pTz = tz; pNx = nx; pNy = ny; pNz = nz;
  }
  return { T, N, B };
}

/**
 * Capsule segments for the isosurface: [ax,ay,az,ra, bx,by,bz,rb] per segment,
 * plus a group id per segment. Segments sharing a group id are unioned exactly
 * (no bulge along a chain); different groups get the smooth-min fillet.
 *
 * `smooth` subdivides with the same Catmull-Rom the tubes use, so the blob
 * follows the same curve instead of cutting the corners.
 */
export function segmentsFromPolylines(lines, { smooth = 1, radiusMul = 1, minRadius = 0, groupBase = 0 } = {}) {
  const sub = Math.max(1, smooth | 0);
  const ready = [];
  let total = 0;
  for (const raw of lines) {
    if (!raw || raw.n < 2) continue;
    const clean = dedupe(raw, 1e-6);
    if (clean.n < 2) continue;
    const line = sub > 1 ? subdivide(clean, sub) : clean;
    line.group = raw.group;
    ready.push(line);
    total += line.n - 1;
  }
  const segs = new Float32Array(total * 8);
  const groups = new Int32Array(total);
  let q = 0, k = 0, maxG = groupBase - 1;
  for (const line of ready) {
    const g = groupBase + (line.group !== undefined ? line.group : k);
    if (g > maxG) maxG = g;
    for (let i = 0; i < line.n - 1; i++) {
      const ra = Math.max(minRadius, line.rads[i] * radiusMul);
      const rb = Math.max(minRadius, line.rads[i + 1] * radiusMul);
      segs[q] = line.pts[i * 3]; segs[q + 1] = line.pts[i * 3 + 1]; segs[q + 2] = line.pts[i * 3 + 2]; segs[q + 3] = ra;
      segs[q + 4] = line.pts[(i + 1) * 3]; segs[q + 5] = line.pts[(i + 1) * 3 + 1]; segs[q + 6] = line.pts[(i + 1) * 3 + 2]; segs[q + 7] = rb;
      groups[q / 8] = g;
      q += 8;
    }
    k++;
  }
  return { segs, groups, nextGroup: maxG + 1 };
}
