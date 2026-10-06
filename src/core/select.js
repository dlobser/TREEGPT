// ============================================================================
// select.js — turn "which joints" into an Int32Array of joint indices.
//
// The old library addressed joints with nested arrays like [0,-1,-1,-1,-2]
// (root, all branches, all joints-with-limbs, all their branches, all but the
// first joint). Here a selection is scoped to a *branch set* (what a Branch
// node produced) and filtered by joint position, sibling index, and an
// optional expression over the same attributes fields see.
// ============================================================================

import { compileExpr, makeCtx, fillCtx, EMPTY_INPUTS } from './fields.js';

// 'range' walks every joint from `from` to `to`; use 'every N' when you want it
// to skip, since `step` applies only to that mode.
export const JOINT_MODES = ['all', 'all but first', 'first', 'last', 'range', 'every N', 'all but last'];
export const SIB_MODES = ['all', 'index', 'even', 'odd', 'not index'];

/**
 * @param skel   Skeleton
 * @param scope  null (all branches) | { branches: number[] } | { joints: Int32Array, branches }
 * @param o      { joints, from, to, step, sib, sibIndex, filter, time }
 */
export function resolveSelection(skel, scope, o) {
  const bids = scope && scope.branches ? scope.branches : allBranchIds(skel);
  const out = [];
  const outBranches = [];
  let filterFn = null;
  if (o.filter && o.filter.trim()) filterFn = compileExpr(o.filter);
  const c = filterFn ? makeCtx() : null;
  if (filterFn) skel.ensureRest();
  const mode = o.joints || 'all';
  const sibMode = o.sib || 'all';
  const sibIndex = o.sibIndex | 0;

  for (let bi = 0; bi < bids.length; bi++) {
    const br = skel.branches[bids[bi]];
    if (!br) continue;
    if (sibMode === 'index' && br.sib !== sibIndex) continue;
    if (sibMode === 'not index' && br.sib === sibIndex) continue;
    if (sibMode === 'even' && (br.sib & 1) !== 0) continue;
    if (sibMode === 'odd' && (br.sib & 1) !== 1) continue;
    const n = br.n;
    let k0 = 0, k1 = n - 1, step = 1;
    switch (mode) {
      case 'all but first': k0 = 1; break;
      case 'all but last': k1 = n - 2; break;
      case 'first': k1 = 0; break;
      case 'last': k0 = n - 1; break;
      case 'range': k0 = wrap(o.from | 0, n); k1 = wrap(o.to ?? -1, n); break;
      case 'every N': k0 = wrap(o.from | 0, n); k1 = wrap(o.to ?? -1, n); step = Math.max(1, o.step | 0); break;
    }
    if (k0 < 0) k0 = 0; if (k1 > n - 1) k1 = n - 1;
    let any = false;
    for (let k = k0; k <= k1; k += step) {
      const j = br.start + k;
      if (filterFn) {
        fillCtx(c, skel, j, o.time || 0);
        if (!filterFn(c, EMPTY_INPUTS)) continue;
      }
      out.push(j); any = true;
    }
    if (any) outBranches.push(br.id);
  }
  return { joints: Int32Array.from(out), branches: outBranches, buildId: skel.buildId };
}

// negative indices count from the end (-1 = last), like Python
function wrap(k, n) { return k < 0 ? n + k : k; }

export function allBranchIds(skel) {
  const ids = new Array(skel.branches.length);
  for (let i = 0; i < ids.length; i++) ids[i] = i;
  return ids;
}

// Joints of a branch set, honouring every/start/end (used by Branch nodes when
// attaching to a set rather than an explicit selection).
export function jointsOfBranches(skel, bids, every = 1, start = 0, end = -1) {
  const out = [];
  every = Math.max(1, every | 0);
  for (const bid of bids) {
    const br = skel.branches[bid];
    if (!br) continue;
    const n = br.n;
    let k0 = wrap(start | 0, n), k1 = wrap(end, n);
    if (k0 < 0) k0 = 0; if (k1 > n - 1) k1 = n - 1;
    for (let k = k0; k <= k1; k += every) out.push(br.start + k);
  }
  return out;
}
