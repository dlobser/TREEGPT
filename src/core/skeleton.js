// ============================================================================
// skeleton.js — the branching structure as flat typed arrays.
//
// The old library represented every joint as three Object3Ds and three meshes;
// a 3000-joint tree meant ~18000 scene-graph nodes updated every frame. Here a
// joint is one row in a handful of typed arrays, and evaluating the whole
// tree is one linear pass of 4x4 multiplies (parents always precede children).
//
// Frame conventions match the old TREE.js exactly so the same numbers give the
// same shapes:
//   joint j sits at (0, len_parent, 0) in its parent's *rotator* frame,
//   rotator_j = T(tx,ty,tz) * R_xyz(rx,ry,rz) * S(sx,sy,sz),
//   the segment runs from the rotator origin to (0, len_j, 0),
//   the ball has radius wid_j, and scale compounds down the chain (that is
//   what the old `sc:.98` taper did).
// ============================================================================

import { makeCtx, fillCtx } from './fields.js';
import { polyline, segmentsFromPolylines } from './curves.js';

export const CH = 11;                                   // channels per joint
export const CHAN = { rx: 0, ry: 1, rz: 2, tx: 3, ty: 4, tz: 5, sx: 6, sy: 7, sz: 8, len: 9, wid: 10 };
export const CHAN_NAMES = Object.keys(CHAN);

const L = new Float32Array(16);
const A = new Float32Array(16);

// column-major 4x4 from Euler XYZ (three.js order), scale, translation
function compose(o, oo, rx, ry, rz, tx, ty, tz, sx, sy, sz) {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  o[oo] = c * e * sx;            o[oo + 4] = -c * f * sy;          o[oo + 8] = d * sz;
  o[oo + 1] = (af + be * d) * sx; o[oo + 5] = (ae - bf * d) * sy;  o[oo + 9] = -b * c * sz;
  o[oo + 2] = (bf - ae * d) * sx; o[oo + 6] = (be + af * d) * sy;  o[oo + 10] = a * c * sz;
  o[oo + 3] = 0; o[oo + 7] = 0; o[oo + 11] = 0;
  o[oo + 12] = tx; o[oo + 13] = ty; o[oo + 14] = tz; o[oo + 15] = 1;
}

// o = a * b (affine, column-major)
export function mul(o, oo, a, ao, b, bo) {
  const a00 = a[ao], a10 = a[ao + 1], a20 = a[ao + 2];
  const a01 = a[ao + 4], a11 = a[ao + 5], a21 = a[ao + 6];
  const a02 = a[ao + 8], a12 = a[ao + 9], a22 = a[ao + 10];
  const a03 = a[ao + 12], a13 = a[ao + 13], a23 = a[ao + 14];
  const b00 = b[bo], b10 = b[bo + 1], b20 = b[bo + 2];
  const b01 = b[bo + 4], b11 = b[bo + 5], b21 = b[bo + 6];
  const b02 = b[bo + 8], b12 = b[bo + 9], b22 = b[bo + 10];
  const b03 = b[bo + 12], b13 = b[bo + 13], b23 = b[bo + 14];
  o[oo] = a00 * b00 + a01 * b10 + a02 * b20;
  o[oo + 1] = a10 * b00 + a11 * b10 + a12 * b20;
  o[oo + 2] = a20 * b00 + a21 * b10 + a22 * b20;
  o[oo + 3] = 0;
  o[oo + 4] = a00 * b01 + a01 * b11 + a02 * b21;
  o[oo + 5] = a10 * b01 + a11 * b11 + a12 * b21;
  o[oo + 6] = a20 * b01 + a21 * b11 + a22 * b21;
  o[oo + 7] = 0;
  o[oo + 8] = a00 * b02 + a01 * b12 + a02 * b22;
  o[oo + 9] = a10 * b02 + a11 * b12 + a12 * b22;
  o[oo + 10] = a20 * b02 + a21 * b12 + a22 * b22;
  o[oo + 11] = 0;
  o[oo + 12] = a00 * b03 + a01 * b13 + a02 * b23 + a03;
  o[oo + 13] = a10 * b03 + a11 * b13 + a12 * b23 + a13;
  o[oo + 14] = a20 * b03 + a21 * b13 + a22 * b23 + a23;
  o[oo + 15] = 1;
}

export function composeMatrix(out, rx, ry, rz, tx, ty, tz, s = 1) {
  compose(out, 0, rx, ry, rz, tx, ty, tz, s, s, s);
  return out;
}

export class Skeleton {
  constructor(cap = 1024) {
    this.buildId = 0;
    this.count = 0;
    this.branches = [];
    this._alloc(cap);
    this._restCount = -1; this._restBuild = -1;
    this._opsRef = null; this._opsFrame = -1;
    this._ctx = makeCtx();
  }

  _alloc(cap) {
    this.cap = cap;
    this.parent = new Int32Array(cap).fill(-1);
    this.branch = new Int32Array(cap);
    this.idx = new Int32Array(cap);
    this.base = new Float32Array(cap * CH);
    this.pose = new Float32Array(cap * CH);
    this.world = new Float32Array(cap * 16);
    this.rest = new Float32Array(cap * 3);
    this._restWorld = null;
  }

  _grow(min) {
    let cap = this.cap;
    while (cap < min) cap *= 2;
    const o = { parent: this.parent, branch: this.branch, idx: this.idx, base: this.base, pose: this.pose, world: this.world, rest: this.rest };
    this._alloc(cap);
    this.parent.set(o.parent); this.branch.set(o.branch); this.idx.set(o.idx);
    this.base.set(o.base); this.pose.set(o.pose); this.world.set(o.world); this.rest.set(o.rest);
  }

  clear(buildId) {
    this.count = 0;
    this.branches.length = 0;
    this.buildId = buildId;
    this._restCount = -1; this._restBuild = -1;
    this._opsRef = null; this._opsFrame = -1;
  }

  /**
   * Append one branch (a chain of n joints).
   * at:    joint index the branch sprouts from, or -1 for a trunk
   * root:  Float32Array(16) world matrix for trunks (null = identity)
   * rx,ry,rz: base rotation of joint 0 (the sprout angle)
   * scale: uniform scale of joint 0; taper: scale of every following joint (compounds)
   */
  addBranch(o) {
    const n = Math.max(1, o.n | 0);
    if (this.count + n > this.cap) this._grow(this.count + n);
    const start = this.count;
    const bid = this.branches.length;
    const at = o.at ?? -1;
    const parentBranch = at >= 0 ? this.branch[at] : -1;
    const pb = parentBranch >= 0 ? this.branches[parentBranch] : null;
    const rec = {
      id: bid, start, n, at,
      parentBranch,
      pj: at >= 0 ? this.idx[at] : -1,
      pfrac: at >= 0 && pb && pb.n > 1 ? this.idx[at] / (pb.n - 1) : 0,
      ppj: pb && pb.at >= 0 ? this.idx[pb.at] : -1,
      depth: pb ? pb.depth + 1 : 0,
      sib: o.sib | 0, rads: Math.max(1, o.rads | 0 || 1),
      ord: o.ord | 0, nord: Math.max(1, o.nord | 0 || 1),
      root: o.root || null,
      creator: o.creator ?? null,
    };
    this.branches.push(rec);
    const base = this.base, len = o.len ?? 1, wid = o.wid ?? 1, taper = o.taper ?? 1, s0 = o.scale ?? 1;
    for (let k = 0; k < n; k++) {
      const j = start + k, q = j * CH;
      this.parent[j] = k === 0 ? at : j - 1;
      this.branch[j] = bid;
      this.idx[j] = k;
      const first = k === 0;
      base[q] = first ? (o.rx || 0) : 0;
      base[q + 1] = first ? (o.ry || 0) : 0;
      base[q + 2] = first ? (o.rz || 0) : 0;
      base[q + 3] = first ? (o.tx || 0) : 0;
      base[q + 4] = first ? (o.ty || 0) : 0;
      base[q + 5] = first ? (o.tz || 0) : 0;
      const s = first ? s0 : taper;
      base[q + 6] = s; base[q + 7] = s; base[q + 8] = s;
      base[q + 9] = len;
      base[q + 10] = wid;
    }
    this.pose.set(base.subarray(start * CH, (start + n) * CH), start * CH);
    this.count += n;
    this._restCount = -1;
    return rec;
  }

  // World (rotator) matrices for every joint from a pose array.
  evaluate(pose = this.pose, world = this.world) {
    const parent = this.parent, branch = this.branch, branches = this.branches, n = this.count;
    for (let j = 0; j < n; j++) {
      const q = j * CH;
      compose(L, 0, pose[q], pose[q + 1], pose[q + 2], pose[q + 3], pose[q + 4], pose[q + 5], pose[q + 6], pose[q + 7], pose[q + 8]);
      const p = parent[j], wo = j * 16;
      if (p < 0) {
        const root = branches[branch[j]].root;
        if (root) mul(world, wo, root, 0, L, 0);
        else for (let k = 0; k < 16; k++) world[wo + k] = L[k];
      } else {
        const po = p * 16;
        for (let k = 0; k < 16; k++) A[k] = world[po + k];
        const len = pose[p * CH + 9];
        A[12] += len * A[4]; A[13] += len * A[5]; A[14] += len * A[6];
        mul(world, wo, A, 0, L, 0);
      }
    }
  }

  // Rest positions (base pose) for the x/y/z field attributes. Cheap, cached per build.
  ensureRest() {
    if (this._restCount === this.count && this._restBuild === this.buildId) return;
    if (!this._restWorld || this._restWorld.length < this.cap * 16) this._restWorld = new Float32Array(this.cap * 16);
    this.evaluate(this.base, this._restWorld);
    const w = this._restWorld, r = this.rest;
    for (let j = 0; j < this.count; j++) { r[j * 3] = w[j * 16 + 12]; r[j * 3 + 1] = w[j * 16 + 13]; r[j * 3 + 2] = w[j * 16 + 14]; }
    this._restCount = this.count; this._restBuild = this.buildId;
  }

  /**
   * pose = base, then apply the ops list in order, then evaluate world matrices.
   * ops: [{ sel: Int32Array|null, buildId, mode: 'add'|'set'|'mul', chans: [{ch, v}] }]
   * Skipped when the same ops array was already applied this frame.
   */
  applyOps(ops, time, frame) {
    if (this._opsRef === ops && this._opsFrame === frame) return;
    this._opsRef = ops; this._opsFrame = frame;
    const n = this.count, pose = this.pose;
    pose.set(this.base.subarray(0, n * CH));
    const c = this._ctx;
    for (let oi = 0; oi < ops.length; oi++) {
      const op = ops[oi];
      const chans = op.chans;
      if (!chans.length) continue;
      const sel = op.sel;
      if (sel && op.buildId !== this.buildId) continue;         // stale selection, skip
      const cnt = sel ? sel.length : n;
      let needCtx = false;
      for (let k = 0; k < chans.length; k++) if (typeof chans[k].v === 'function') { needCtx = true; break; }
      if (needCtx) this.ensureRest();
      const mode = op.mode === 'set' ? 1 : op.mode === 'mul' ? 2 : 0;
      for (let k = 0; k < cnt; k++) {
        const j = sel ? sel[k] : k;
        if (j >= n) continue;
        if (needCtx) fillCtx(c, this, j, time);
        const q = j * CH;
        for (let m = 0; m < chans.length; m++) {
          const ch = chans[m];
          const v = typeof ch.v === 'function' ? ch.v(c) : ch.v;
          if (v !== v) continue;                                   // NaN guard
          const o = q + ch.ch;
          if (mode === 0) pose[o] += v; else if (mode === 1) pose[o] = v; else pose[o] *= v;
        }
      }
    }
    this.evaluate();
  }

  // Radius of joint j's ball/segment in world units.
  radius(j) {
    const w = this.world, o = j * 16;
    return this.pose[j * CH + 10] * Math.hypot(w[o], w[o + 1], w[o + 2]);
  }

  // Capsule segments for the isosurface: [ax,ay,az,ra, bx,by,bz,rb] per segment,
  // plus the branch id of each, so the isosurface can union a branch exactly and
  // only fillet where different branches meet.
  //
  // `smooth` subdivides each branch with the same Catmull-Rom the tubes use, so
  // the blob follows the same curve instead of cutting the corners.
  collectSegments({ radiusMul = 1, minRadius = 0, smooth = 1 } = {}) {
    const lines = skeletonPolylines(this, { radiusMul, minRadius });
    for (const l of lines) l.group = l.branch.id;
    const r = segmentsFromPolylines(lines, { smooth, groupBase: 0 });
    return { segs: r.segs, branchOf: r.groups, nextGroup: r.nextGroup };
  }

  bounds() {
    const w = this.world, pose = this.pose, n = this.count;
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let j = 0; j < n; j++) {
      const o = j * 16, len = pose[j * CH + 9];
      const r = this.radius(j);
      const x = w[o + 12], y = w[o + 13], z = w[o + 14];
      const tx = x + w[o + 4] * len, ty = y + w[o + 5] * len, tz = z + w[o + 6] * len;
      if (x - r < minx) minx = x - r; if (x + r > maxx) maxx = x + r;
      if (y - r < miny) miny = y - r; if (y + r > maxy) maxy = y + r;
      if (z - r < minz) minz = z - r; if (z + r > maxz) maxz = z + r;
      if (tx - r < minx) minx = tx - r; if (tx + r > maxx) maxx = tx + r;
      if (ty - r < miny) miny = ty - r; if (ty + r > maxy) maxy = ty + r;
      if (tz - r < minz) minz = tz - r; if (tz + r > maxz) maxz = tz + r;
    }
    if (n === 0) return { min: [-1, -1, -1], max: [1, 1, 1] };
    return { min: [minx, miny, minz], max: [maxx, maxy, maxz] };
  }
}

/** Branch chains of an evaluated skeleton as polylines (joints + the final tip). */
export function skeletonPolylines(skel, { radiusMul = 1, minRadius = 0 } = {}) {
  const world = skel.world, pose = skel.pose;
  const out = [];
  for (let b = 0; b < skel.branches.length; b++) {
    const br = skel.branches[b];
    const line = polyline(br.n + 1);
    for (let k = 0; k < br.n; k++) {
      const j = br.start + k, o = j * 16;
      line.pts[k * 3] = world[o + 12]; line.pts[k * 3 + 1] = world[o + 13]; line.pts[k * 3 + 2] = world[o + 14];
      line.rads[k] = Math.max(minRadius, pose[j * CH + 10] * Math.hypot(world[o], world[o + 1], world[o + 2]) * radiusMul);
    }
    const j = br.start + br.n - 1, o = j * 16, len = pose[j * CH + 9], k = br.n;
    line.pts[k * 3] = world[o + 12] + world[o + 4] * len;
    line.pts[k * 3 + 1] = world[o + 13] + world[o + 5] * len;
    line.pts[k * 3 + 2] = world[o + 14] + world[o + 6] * len;
    line.rads[k] = line.rads[k - 1];
    line.branch = br;
    out.push(line);
  }
  return out;
}
