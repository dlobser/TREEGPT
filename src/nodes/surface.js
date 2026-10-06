// Surface nodes: Loft, Warp, Curve Tubes, Surface Mesh.
//
// Together these cover what the old `weave()` did for the moth wings: take the
// vein chains, loft a surface between them, resample it into curves, push the
// curves around, then either extrude tubes along them (a veined membrane) or
// mesh them into a solid sheet.
//
// The link type "curves" carries { grids: [Grid], skel }.
import { loft, gridNormals, gridRows, gridCols, polyline } from '../core/curves.js';
import { skeletonPolylines } from '../core/skeleton.js';
import { sweepTubes, CAP_MODES } from '../core/tubes.js';
import { buildSurface } from '../core/surface.js';
import { compileExpr } from '../core/fields.js';
import { runtime } from '../app/runtime.js';
import { LiteGraph, paint, defineParams, getParam, getNumber, fixedInput, fixedData, finish, reserveInfo } from './common.js';

function applyBundle(bundle) {
  bundle.skel.applyOps(bundle.ops, runtime.time, runtime.frame);
  return bundle.skel;
}
const safeColor = (s) => (/^#[0-9a-fA-F]{6}$/.test(s || '') ? s : '#d9d3c7');

// ---------------------------------------------------------------------------
function LoftNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  fixedInput(this, 'ribs', 'branches,selection');
  this.addOutput('curves', 'curves');
  defineParams(this, [
    { name: 'span', type: 'combo', value: 'pairs', values: ['pairs', 'whole set'] },
    { name: 'spacing', type: 'number', value: 0, min: 0, step: 0.5, precision: 3 },
    { name: 'divide u', type: 'int', value: 12, min: 2, max: 400 },
    { name: 'divide v', type: 'int', value: 6, min: 2, max: 400 },
    { name: 'every', type: 'int', value: 1, min: 1 },
    { name: 'skip base', type: 'int', value: 0, min: 0 },
    { name: 'skip tip', type: 'int', value: 0, min: 0 },
    { name: 'closed', type: 'toggle', value: false, pin: false },
    { name: 'group by', type: 'combo', value: 'none', values: ['none', 'parent branch'] },
  ]);
  paint(this, 'surface');
  reserveInfo(this, 200);
}
LoftNode.title = 'Loft';
LoftNode.desc = 'Build a surface spanning a set of branches (the ribs)';
LoftNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  if (!inp) { this.setOutputData(0, undefined); this._info = 'no input'; return; }
  const skel = applyBundle(inp);
  const scope = fixedData(this, 'ribs') || inp.set || null;
  const ids = scope && scope.branches ? scope.branches : skel.branches.map((b) => b.id);
  const every = Math.max(1, getNumber(this, 'every', 1) | 0);
  const skipBase = Math.max(0, getNumber(this, 'skip base') | 0);
  const skipTip = Math.max(0, getNumber(this, 'skip tip') | 0);
  let nu = Math.max(2, getNumber(this, 'divide u', 12) | 0);
  let nv = Math.max(2, getNumber(this, 'divide v', 6) | 0);
  const closed = !!this.properties.values.closed;
  // `spacing` > 0 picks the grid density from the geometry instead: the loft is
  // sampled so no grid edge is longer than this. An isosurface built from these
  // curves only reads as a smooth sheet when the spacing is under one curve
  // radius — merely touching (two radii) leaves the capsules visibly corrugated.
  const spacing = Math.max(0, getNumber(this, 'spacing', 0));
  const lengthOf = (line) => {
    let L = 0;
    for (let i = 1; i < line.n; i++) {
      L += Math.hypot(line.pts[i * 3] - line.pts[(i - 1) * 3],
                      line.pts[i * 3 + 1] - line.pts[(i - 1) * 3 + 1],
                      line.pts[i * 3 + 2] - line.pts[(i - 1) * 3 + 2]);
    }
    return L;
  };
  const gap = (a, b, t) => {
    const ia = Math.round(t * (a.n - 1)), ib = Math.round(t * (b.n - 1));
    return Math.hypot(a.pts[ia * 3] - b.pts[ib * 3], a.pts[ia * 3 + 1] - b.pts[ib * 3 + 1], a.pts[ia * 3 + 2] - b.pts[ib * 3 + 2]);
  };
  const autoGrid = (ribs) => {
    let along = 0;
    for (const r of ribs) along = Math.max(along, lengthOf(r));
    let across = 0;
    for (const t of [0, 0.5, 1]) {
      let run = 0;
      for (let i = 1; i < ribs.length; i++) run += gap(ribs[i - 1], ribs[i], t);
      if (closed && ribs.length > 2) run += gap(ribs[ribs.length - 1], ribs[0], t);
      across = Math.max(across, run);
    }
    nu = Math.max(2, Math.min(400, Math.ceil(along / spacing) + 1));
    nv = Math.max(2, Math.min(400, Math.ceil(across / spacing) + 1));
  };

  // Partition before sampling so each arm keeps its own every/closed behavior.
  // Map preserves incoming rib order within each parent group.
  const groups = new Map();
  const byParent = this.properties.values['group by'] === 'parent branch';
  for (const id of ids) {
    const branch = skel.branches[id];
    if (!branch) continue;
    const key = byParent ? branch.parentBranch : 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  const all = skeletonPolylines(skel);
  const grids = [];
  let ribCount = 0, groupCount = 0;
  for (const group of groups.values()) {
    const ribs = [];
    for (let k = 0; k < group.length; k += every) {
      const line = all[group[k]];
      if (!line) continue;
      const a = Math.min(skipBase, line.n - 2), b = Math.max(a + 2, line.n - skipTip);
      if (b - a < 2) continue;
      const cut = polyline(b - a);
      for (let i = a; i < b; i++) {
        cut.pts[(i - a) * 3] = line.pts[i * 3]; cut.pts[(i - a) * 3 + 1] = line.pts[i * 3 + 1]; cut.pts[(i - a) * 3 + 2] = line.pts[i * 3 + 2];
        cut.rads[i - a] = line.rads[i];
      }
      ribs.push(cut);
    }
    if (ribs.length < 2) continue;
    ribCount += ribs.length;
    groupCount++;
    if (spacing > 0) autoGrid(ribs);
    if (this.properties.values.span === 'pairs') {
      const last = closed ? ribs.length : ribs.length - 1;
      for (let i = 0; i < last; i++) {
        const g = loft([ribs[i], ribs[(i + 1) % ribs.length]], nu, nv, false);
        if (g) grids.push(g);
      }
    } else {
      const g = loft(ribs, nu, nv, closed);
      if (g) grids.push(g);
    }
  }
  if (!grids.length) {
    this.setOutputData(0, undefined);
    this._info = byParent ? 'needs 2+ ribs in a parent group' : 'needs 2+ ribs';
    return;
  }
  this._info = `${grids.length} patch${grids.length === 1 ? '' : 'es'} · ${nu}×${nv}${spacing > 0 ? ' auto' : ''} from ${ribCount} ribs${byParent ? ' · ' + groupCount + ' parent groups' : ''}`;
  this.setOutputData(0, { grids, skel });
};
finish(LoftNode.prototype, { dirty: true });
LiteGraph.registerNodeType('surface/loft', LoftNode);

// ---------------------------------------------------------------------------
// Warp: expressions over the patch parameters.
const GRID_VARS = ['u', 'v', 'iu', 'iv', 'nu', 'nv', 'x', 'y', 'z', 'r', 'patch', 'patches', 'time'];
export const GRID_VAR_HELP = {
  u: '0 to 1 along the ribs', v: '0 to 1 across the ribs', iu: 'column index', iv: 'row index',
  nu: 'columns', nv: 'rows', x: 'point x', y: 'point y', z: 'point z', r: 'radius carried from the ribs',
  patch: 'index of this patch', patches: 'how many patches', time: 'seconds',
};

function WarpNode() {
  fixedInput(this, 'curves', 'curves');
  fixedInput(this, 'a', 'number,field');
  fixedInput(this, 'b', 'number,field');
  fixedInput(this, 'c', 'number,field');
  fixedInput(this, 'd', 'number,field');
  this.addOutput('curves', 'curves');
  defineParams(this, [
    { name: 'normal', type: 'text', value: '0' },
    { name: 'along u', type: 'text', value: '0' },
    { name: 'along v', type: 'text', value: '0' },
    { name: 'radius', type: 'text', value: '1' },
  ]);
  paint(this, 'surface');
  reserveInfo(this, 250);
}
WarpNode.title = 'Warp';
WarpNode.desc = 'Push the lofted points along the surface normal and the two surface directions';
WarpNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'curves');
  if (!inp || !inp.grids) { this.setOutputData(0, undefined); this._info = 'no input'; return; }
  let fN, fU, fV, fR;
  try {
    fN = compileExpr(this.properties.values.normal, GRID_VARS);
    fU = compileExpr(this.properties.values['along u'], GRID_VARS);
    fV = compileExpr(this.properties.values['along v'], GRID_VARS);
    fR = compileExpr(this.properties.values.radius, GRID_VARS);
    this.boxcolor = null;
  } catch (e) { this._info = 'error: ' + e.message; this.boxcolor = '#e55'; this.setOutputData(0, inp); return; }

  const num = (v) => (typeof v === 'number' && v === v ? v : 0);
  const p = { a: num(fixedData(this, 'a')), b: num(fixedData(this, 'b')), c: num(fixedData(this, 'c')), d: num(fixedData(this, 'd')) };
  const ctx = {};
  const out = [];
  const patches = inp.grids.length;
  for (let gi = 0; gi < patches; gi++) {
    const g = inp.grids[gi];
    const N = gridNormals(g);
    const dst = { pts: new Float64Array(g.pts.length), rads: new Float64Array(g.rads.length), nu: g.nu, nv: g.nv };
    ctx.nu = g.nu; ctx.nv = g.nv; ctx.time = runtime.time; ctx.patch = gi; ctx.patches = patches;
    for (let iv = 0; iv < g.nv; iv++) {
      for (let iu = 0; iu < g.nu; iu++) {
        const i = iv * g.nu + iu, o = i * 3;
        // surface tangents
        const uA = iv * g.nu + Math.max(0, iu - 1), uB = iv * g.nu + Math.min(g.nu - 1, iu + 1);
        const vA = Math.max(0, iv - 1) * g.nu + iu, vB = Math.min(g.nv - 1, iv + 1) * g.nu + iu;
        let tx = g.pts[uB * 3] - g.pts[uA * 3], ty = g.pts[uB * 3 + 1] - g.pts[uA * 3 + 1], tz = g.pts[uB * 3 + 2] - g.pts[uA * 3 + 2];
        let tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let sx = g.pts[vB * 3] - g.pts[vA * 3], sy = g.pts[vB * 3 + 1] - g.pts[vA * 3 + 1], sz = g.pts[vB * 3 + 2] - g.pts[vA * 3 + 2];
        let sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        ctx.iu = iu; ctx.iv = iv;
        ctx.u = g.nu > 1 ? iu / (g.nu - 1) : 0;
        ctx.v = g.nv > 1 ? iv / (g.nv - 1) : 0;
        ctx.x = g.pts[o]; ctx.y = g.pts[o + 1]; ctx.z = g.pts[o + 2]; ctx.r = g.rads[i];
        const dn = Number(fN(ctx, p)) || 0, du = Number(fU(ctx, p)) || 0, dv = Number(fV(ctx, p)) || 0;
        const rr = Number(fR(ctx, p));
        dst.pts[o] = ctx.x + N[o] * dn + tx * du + sx * dv;
        dst.pts[o + 1] = ctx.y + N[o + 1] * dn + ty * du + sy * dv;
        dst.pts[o + 2] = ctx.z + N[o + 2] * dn + tz * du + sz * dv;
        dst.rads[i] = rr === rr ? ctx.r * rr : ctx.r;
      }
    }
    out.push(dst);
  }
  this._info = `${patches} patch${patches === 1 ? '' : 'es'} warped`;
  this.setOutputData(0, { grids: out, skel: inp.skel });
};
finish(WarpNode.prototype);
LiteGraph.registerNodeType('surface/warp', WarpNode);

// ---------------------------------------------------------------------------
function CurveTubesNode() {
  fixedInput(this, 'curves', 'curves');
  this.addOutput('mesh', 'mesh');
  defineParams(this, [
    { name: 'live', type: 'toggle', value: true, pin: false },
    { name: 'show', type: 'toggle', value: true, pin: false },
    { name: 'direction', type: 'combo', value: 'rows', values: ['rows', 'columns', 'both'] },
    { name: 'radial segs', type: 'int', value: 6, min: 3, max: 64 },
    { name: 'subdivide', type: 'int', value: 1, min: 1, max: 16 },
    { name: 'caps', type: 'combo', value: 'ball', values: CAP_MODES },
    { name: 'cap rings', type: 'int', value: 3, min: 1, max: 32 },
    { name: 'radius', type: 'number', value: 0, min: 0, step: 1, precision: 3 },
    { name: 'radius x', type: 'number', value: 1, min: 0, step: 1, precision: 3 },
    { name: 'min radius', type: 'number', value: 0.02, min: 0, step: 1, precision: 3 },
    { name: 'color', type: 'text', value: '#d9d3c7', pin: false },
    { name: 'Build now', type: 'button', onClick: (n) => { n._pending = true; } },
  ]);
  paint(this, 'surface');
  reserveInfo(this, 210);
  this._geo = null;
}
CurveTubesNode.title = 'Curve Tubes';
CurveTubesNode.desc = 'Extrude tubes along the lofted curves (the woven membrane)';
CurveTubesNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'curves');
  const viewer = runtime.viewer;
  const show = !!this.properties.values.show;
  if (!inp || !inp.grids) { this.setOutputData(0, undefined); this._info = 'no input'; return; }
  if (this.properties.values.live || this._pending) {
    const dir = this.properties.values.direction;
    const fixed = getNumber(this, 'radius'), mulR = getNumber(this, 'radius x', 1), minR = getNumber(this, 'min radius');
    const lines = [];
    for (const g of inp.grids) {
      if (dir !== 'columns') lines.push(...gridRows(g));
      if (dir !== 'rows') lines.push(...gridCols(g));
    }
    for (const l of lines) for (let i = 0; i < l.n; i++) l.rads[i] = Math.max(minR, (fixed > 0 ? fixed : l.rads[i]) * mulR);
    this._geo = sweepTubes(lines, {
      radial: getNumber(this, 'radial segs', 6) | 0, subdiv: getNumber(this, 'subdivide', 1) | 0,
      caps: this.properties.values.caps, capRings: getNumber(this, 'cap rings', 3) | 0,
    }, this._geo);
    this._geo.name = 'curve-tubes';
    this._pending = false;
    if (viewer) viewer.updateMesh(this, this._geo, { color: safeColor(this.properties.values.color), visible: show });
    this._info = `${lines.length} curves · ${this._geo.vertexCount} verts`;
  } else if (viewer && this._geo) viewer.setMeshVisible(this, show);
  this.setOutputData(0, this._geo || undefined);
};
CurveTubesNode.prototype.onRemoved = function () { runtime.viewer && runtime.viewer.removeMesh(this); };
finish(CurveTubesNode.prototype);
LiteGraph.registerNodeType('surface/tubes', CurveTubesNode);

// ---------------------------------------------------------------------------
function SurfaceMeshNode() {
  fixedInput(this, 'curves', 'curves');
  this.addOutput('mesh', 'mesh');
  defineParams(this, [
    { name: 'live', type: 'toggle', value: true, pin: false },
    { name: 'show', type: 'toggle', value: true, pin: false },
    { name: 'mode', type: 'combo', value: 'solid', values: ['solid', 'open'] },
    { name: 'thickness', type: 'number', value: 1, min: 0, step: 1, precision: 3 },
    { name: 'color', type: 'text', value: '#cfd6e0', pin: false },
    { name: 'Build now', type: 'button', onClick: (n) => { n._pending = true; } },
  ]);
  paint(this, 'surface');
  reserveInfo(this, 200);
  this._geo = null;
}
SurfaceMeshNode.title = 'Surface';
SurfaceMeshNode.desc = 'Mesh the lofted patches as a sheet, optionally given thickness';
SurfaceMeshNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'curves');
  const viewer = runtime.viewer;
  const show = !!this.properties.values.show;
  if (!inp || !inp.grids) { this.setOutputData(0, undefined); this._info = 'no input'; return; }
  if (this.properties.values.live || this._pending) {
    this._geo = buildSurface(inp.grids, { mode: this.properties.values.mode, thickness: getNumber(this, 'thickness', 1) }, this._geo);
    this._geo.name = 'surface';
    this._pending = false;
    if (viewer) viewer.updateMesh(this, this._geo, { color: safeColor(this.properties.values.color), visible: show });
    this._info = `${inp.grids.length} patches · ${this._geo.vertexCount} verts`;
  } else if (viewer && this._geo) viewer.setMeshVisible(this, show);
  this.setOutputData(0, this._geo || undefined);
};
SurfaceMeshNode.prototype.onRemoved = function () { runtime.viewer && runtime.viewer.removeMesh(this); };
finish(SurfaceMeshNode.prototype);
LiteGraph.registerNodeType('surface/mesh', SurfaceMeshNode);

// ---------------------------------------------------------------------------
// Join: several curve sets into one, so a petal's two halves (or a dozen
// lofted parts) can feed a single Surface or Isosurface.
function JoinCurvesNode() {
  for (let i = 0; i < 4; i++) fixedInput(this, 'curves ' + (i + 1), 'curves');
  this.addOutput('curves', 'curves');
  defineParams(this, []);
  paint(this, 'surface');
  reserveInfo(this, 160);
}
JoinCurvesNode.title = 'Join Curves';
JoinCurvesNode.desc = 'Combine curve sets into one';
JoinCurvesNode.prototype.onExecute = function () {
  const grids = [];
  let skel = null;
  for (let i = 0; i < 4; i++) {
    const c = fixedData(this, 'curves ' + (i + 1));
    if (c && c.grids) { grids.push(...c.grids); skel = skel || c.skel; }
  }
  if (!grids.length) { this._info = 'no input'; this.setOutputData(0, undefined); return; }
  this._info = `${grids.length} patches`;
  this.setOutputData(0, { grids, skel });
};
finish(JoinCurvesNode.prototype);
LiteGraph.registerNodeType('surface/join', JoinCurvesNode);
