// ============================================================================
// iso.js — implicit surface from capsule segments, polygonised by marching cubes.
//
// The old metaBalls put a point blob at every joint and needed many joints
// (or a huge resolution) to read as tubes. Here each joint segment is a
// capsule with the joint's radius, written into a signed-distance grid only
// inside its own bounding box, so cost scales with the sculpture's volume
// rather than with resolution^3 x joints.
//
// Combination rule (this is what keeps the print clean):
//   - segments of the *same branch* are joined with an exact min: a bent
//     capsule chain, no bulge at the joints;
//   - different branches are joined with a polynomial smooth-min, so a child
//     grows out of its parent with a fillet of size `blend` x radius.
//
// Pure typed arrays in and out, so it runs identically in a Web Worker.
// ============================================================================

import { edgeTable, triTable } from './mctables.js';

export const MAX_RES = 320;

/**
 * @param segs  Float32Array [ax,ay,az,ra, bx,by,bz,rb] * N
 * @param opts  { res, blend (fillet, in radii), branchOf: Int32Array(N), minPart (drop components below this many triangles) }
 * @returns { positions, normals, indices, cells:[nx,ny,nz], time }
 */
export function buildIso(segs, opts = {}) {
  const t0 = performance.now();
  const res = Math.max(8, Math.min(MAX_RES, opts.res | 0 || 64));
  const blend = Math.max(0, opts.blend ?? 1);
  const N = segs.length / 8;
  const branchOf = opts.branchOf && opts.branchOf.length === N ? opts.branchOf : null;

  // ---- bounds + average radius -------------------------------------------
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity, maxR = 0, sumR = 0;
  for (let i = 0; i < N; i++) {
    const q = i * 8;
    for (let e = 0; e < 2; e++) {
      const x = segs[q + e * 4], y = segs[q + e * 4 + 1], z = segs[q + e * 4 + 2], r = segs[q + e * 4 + 3];
      if (x - r < minx) minx = x - r; if (x + r > maxx) maxx = x + r;
      if (y - r < miny) miny = y - r; if (y + r > maxy) maxy = y + r;
      if (z - r < minz) minz = z - r; if (z + r > maxz) maxz = z + r;
      if (r > maxR) maxR = r; sumR += r;
    }
  }
  if (N === 0 || !isFinite(minx)) return empty();
  const k = blend * (sumR / (2 * N));              // fillet size in world units
  const pad = k + maxR * 0.1 + 1e-6;
  minx -= pad; miny -= pad; minz -= pad; maxx += pad; maxy += pad; maxz += pad;
  const ex = maxx - minx, ey = maxy - miny, ez = maxz - minz;
  const cs = Math.max(ex, ey, ez) / res;                // cell size
  const nx = Math.max(2, Math.ceil(ex / cs) + 3), ny = Math.max(2, Math.ceil(ey / cs) + 3), nz = Math.max(2, Math.ceil(ez / cs) + 3);
  const ox = minx - cs, oy = miny - cs, oz = minz - cs;  // sample (0,0,0) position
  const total = nx * ny * nz;
  const FAR = Math.fround(k + 3 * cs);                // fround: the grids are Float32, the sentinel must compare equal
  const field = new Float32Array(total).fill(FAR);     // signed distance, positive outside
  const scratch = new Float32Array(total).fill(FAR);   // exact-union distance of the current branch
  let touched = new Int32Array(1 << 16), nt = 0;
  const reach = k + cs * 1.75;                          // how far outside a capsule we still need values

  const flushBranch = () => {
    if (k > 0) {
      for (let i = 0; i < nt; i++) {
        const idx = touched[i];
        const a = field[idx], b = scratch[idx];
        const h = Math.max(k - Math.abs(a - b), 0) / k;
        field[idx] = Math.min(a, b) - h * h * k * 0.25;
        scratch[idx] = FAR;
      }
    } else {
      for (let i = 0; i < nt; i++) { const idx = touched[i]; if (scratch[idx] < field[idx]) field[idx] = scratch[idx]; scratch[idx] = FAR; }
    }
    nt = 0;
  };

  // ---- splat capsules -----------------------------------------------------
  let curBranch = branchOf ? branchOf[0] : -1;
  for (let i = 0; i < N; i++) {
    const q = i * 8;
    const b = branchOf ? branchOf[i] : i;
    if (b !== curBranch) { flushBranch(); curBranch = b; }
    const ax = segs[q], ay = segs[q + 1], az = segs[q + 2], Ra = segs[q + 3];
    const bx = segs[q + 4], by = segs[q + 5], bz = segs[q + 6], Rb = segs[q + 7];
    const Rm = Math.max(Ra, Rb) + reach;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - Rm - ox) / cs)), x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + Rm - ox) / cs));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - Rm - oy) / cs)), y1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + Rm - oy) / cs));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - Rm - oz) / cs)), z1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + Rm - oz) / cs));
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dd = dx * dx + dy * dy + dz * dz;
    const inv = dd > 1e-20 ? 1 / dd : 0;
    for (let z = z0; z <= z1; z++) {
      const pz = oz + z * cs;
      for (let y = y0; y <= y1; y++) {
        const py = oy + y * cs;
        let idx = x0 + nx * (y + ny * z);
        for (let x = x0; x <= x1; x++, idx++) {
          const px = ox + x * cs;
          let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) * inv;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const cx = ax + dx * t - px, cy = ay + dy * t - py, cz = az + dz * t - pz;
          const d = Math.sqrt(cx * cx + cy * cy + cz * cz) - (Ra + (Rb - Ra) * t);
          if (d < scratch[idx]) {
            if (scratch[idx] === FAR) { if (nt === touched.length) { const g = new Int32Array(nt * 2); g.set(touched); touched = g; } touched[nt++] = idx; }
            scratch[idx] = d;
          }
        }
      }
    }
  }
  flushBranch();

  // inside = distance < 0; marching cubes below treats value > iso as inside, so negate
  for (let i = 0; i < total; i++) field[i] = -field[i];

  // ---- marching cubes -----------------------------------------------------
  let mc = marchingCubes(field, nx, ny, nz, 0, ox, oy, oz, cs);
  const minPart = opts.minPart ?? 64;
  if (minPart > 0) mc = dropSmallParts(mc, minPart);
  const normals = new Float32Array(mc.positions.length);
  accumulateNormals(mc.positions, mc.indices, normals);
  return { positions: mc.positions, normals, indices: mc.indices, parts: mc.parts,
    cells: [nx, ny, nz], time: performance.now() - t0 };
}

function empty() {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), cells: [0, 0, 0], time: 0 };
}

// growable typed arrays
class Grow {
  constructor(Type, n) { this.a = new Type(n); this.n = 0; this.Type = Type; }
  push3(x, y, z) {
    if (this.n + 3 > this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z;
  }
  done() { return this.a.slice(0, this.n); }
}

// Bourke edge -> (dx, dy, dz, axis) of the sample the edge starts at
const EDGE_OFF = [
  [0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1],
  [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1],
  [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2],
];

/** Indexed marching cubes; value > iso is inside; outward-facing triangles. */
export function marchingCubes(field, nx, ny, nz, iso, ox, oy, oz, cs) {
  const verts = new Grow(Float32Array, 3 * 4096);
  const tris = new Grow(Uint32Array, 3 * 4096);
  const slice = nx * ny;
  // edge vertex caches for two z-slices (x and y edges) and one (z edges)
  const exA = new Int32Array(slice), exB = new Int32Array(slice);
  const eyA = new Int32Array(slice), eyB = new Int32Array(slice);
  const ez = new Int32Array(slice);
  let exCur = exA, exNext = exB, eyCur = eyA, eyNext = eyB;
  exCur.fill(-1); eyCur.fill(-1);
  const edgeVerts = new Int32Array(12);

  const makeVert = (x, y, z, axis) => {
    const i0 = x + nx * (y + ny * z);
    const i1 = axis === 0 ? i0 + 1 : axis === 1 ? i0 + nx : i0 + slice;
    const v0 = field[i0], v1 = field[i1];
    let t = (iso - v0) / (v1 - v0);
    if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
    const px = ox + (x + (axis === 0 ? t : 0)) * cs;
    const py = oy + (y + (axis === 1 ? t : 0)) * cs;
    const pz = oz + (z + (axis === 2 ? t : 0)) * cs;
    const id = verts.n / 3;
    verts.push3(px, py, pz);
    return id;
  };

  for (let z = 0; z < nz - 1; z++) {
    exNext.fill(-1); eyNext.fill(-1); ez.fill(-1);
    for (let y = 0; y < ny - 1; y++) {
      let base = nx * (y + ny * z);
      for (let x = 0; x < nx - 1; x++, base++) {
        const i0 = base;
        const v0 = field[i0], v1 = field[i0 + 1], v2 = field[i0 + 1 + nx], v3 = field[i0 + nx];
        const v4 = field[i0 + slice], v5 = field[i0 + 1 + slice], v6 = field[i0 + 1 + nx + slice], v7 = field[i0 + nx + slice];
        let cube = 0;
        if (v0 > iso) cube |= 1; if (v1 > iso) cube |= 2; if (v2 > iso) cube |= 4; if (v3 > iso) cube |= 8;
        if (v4 > iso) cube |= 16; if (v5 > iso) cube |= 32; if (v6 > iso) cube |= 64; if (v7 > iso) cube |= 128;
        const edges = edgeTable[cube];
        if (edges === 0) continue;
        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue;
          const eo = EDGE_OFF[e];
          const exx = x + eo[0], eyy = y + eo[1], ezz = z + eo[2], axis = eo[3];
          const key = exx + nx * eyy;
          let cache;
          if (axis === 0) cache = eo[2] ? exNext : exCur;
          else if (axis === 1) cache = eo[2] ? eyNext : eyCur;
          else cache = ez;
          let id = cache[key];
          if (id < 0) { id = makeVert(exx, eyy, ezz, axis); cache[key] = id; }
          edgeVerts[e] = id;
        }
        const to = cube * 16;
        for (let kk = 0; kk < 16; kk += 3) {
          const a = triTable[to + kk];
          if (a < 0) break;
          // "value > iso is inside" flips Bourke's orientation, so swap to keep normals outward
          tris.push3(edgeVerts[a], edgeVerts[triTable[to + kk + 2]], edgeVerts[triTable[to + kk + 1]]);
        }
      }
    }
    let t = exCur; exCur = exNext; exNext = t;
    t = eyCur; eyCur = eyNext; eyNext = t;
  }
  return { positions: verts.done(), indices: tris.done() };
}

/**
 * Remove connected components smaller than `minTris`. A field made of many
 * capsules can leave crumbs a few triangles across where a chain tapers to
 * nothing; they are invisible on screen and a nuisance in a slicer.
 * Returns the kept geometry and how many components remain.
 */
export function dropSmallParts(mesh, minTris) {
  const { positions, indices } = mesh;
  const vc = positions.length / 3, ic = indices.length;
  if (!ic) return { ...mesh, parts: 0 };
  const parent = new Int32Array(vc);
  for (let i = 0; i < vc; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let i = 0; i < ic; i += 3) { union(indices[i], indices[i + 1]); union(indices[i + 1], indices[i + 2]); }
  const count = new Map();
  for (let i = 0; i < ic; i += 3) { const r = find(indices[i]); count.set(r, (count.get(r) || 0) + 1); }
  let parts = 0, dropped = 0;
  for (const n of count.values()) { if (n >= minTris) parts++; else dropped++; }
  if (!dropped) return { ...mesh, parts };

  const remap = new Int32Array(vc).fill(-1);
  const outIdx = new (indices.constructor)(ic);
  let ii = 0, vi = 0;
  const keepPos = new Float32Array(positions.length);
  for (let i = 0; i < ic; i += 3) {
    if (count.get(find(indices[i])) < minTris) continue;
    for (let k = 0; k < 3; k++) {
      const v = indices[i + k];
      if (remap[v] < 0) {
        remap[v] = vi;
        keepPos[vi * 3] = positions[v * 3]; keepPos[vi * 3 + 1] = positions[v * 3 + 1]; keepPos[vi * 3 + 2] = positions[v * 3 + 2];
        vi++;
      }
      outIdx[ii++] = remap[v];
    }
  }
  return { positions: keepPos.slice(0, vi * 3), indices: outIdx.slice(0, ii), parts };
}

export function accumulateNormals(pos, idx, out) {
  out.fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
}
