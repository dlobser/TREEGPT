// Output nodes: Preview (instanced skeleton), Tubes, Isosurface, Export.
import { buildTubes, CAP_MODES } from '../core/tubes.js';
import { MAX_RES } from '../core/iso.js';
import { toOBJ, toSTL, download } from '../core/export.js';
import { segmentsFromPolylines, gridRows, gridCols } from '../core/curves.js';
import { runtime } from '../app/runtime.js';
import { LiteGraph, paint, defineParams, getNumber, fixedInput, fixedData, finish, reserveInfo } from './common.js';

function applyBundle(bundle) {
  bundle.skel.applyOps(bundle.ops, runtime.time, runtime.frame);
  return bundle.skel;
}
const safeColor = (s, fb = '#e8e8e8') => (/^#[0-9a-fA-F]{6}$/.test(s || '') ? s : fb);

// ---------------------------------------------------------------------------
function PreviewNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  defineParams(this, [
    { name: 'show', type: 'toggle', value: true, pin: false },
    { name: 'balls', type: 'toggle', value: true, pin: false },
    { name: 'segments', type: 'toggle', value: true, pin: false },
    { name: 'color', type: 'text', value: '#e8e8e8', pin: false },
  ]);
  paint(this, 'output');
  reserveInfo(this, 185);
}
PreviewNode.title = 'Preview';
PreviewNode.desc = 'Draw the skeleton as instanced balls and segments';
PreviewNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  const viewer = runtime.viewer;
  if (!inp || !viewer) { if (viewer) viewer.removeSkeletonView(this); this._info = 'no input'; return; }
  const v = this.properties.values;
  const skel = applyBundle(inp);
  viewer.updateSkeletonView(this, skel, { visible: !!v.show, balls: !!v.balls, segments: !!v.segments, color: safeColor(v.color) });
  runtime.stats.joints = skel.count; runtime.stats.branches = skel.branches.length;
  this._info = `${skel.count} joints · ${skel.branches.length} branches`;
};
PreviewNode.prototype.onRemoved = function () { runtime.viewer && runtime.viewer.removeSkeletonView(this); };
finish(PreviewNode.prototype);
LiteGraph.registerNodeType('out/preview', PreviewNode);

// ---------------------------------------------------------------------------
function TubesNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  this.addOutput('mesh', 'mesh');
  defineParams(this, [
    { name: 'live', type: 'toggle', value: true, pin: false },
    { name: 'show', type: 'toggle', value: true, pin: false },
    { name: 'radial segs', type: 'int', value: 8, min: 3, max: 64 },
    { name: 'subdivide', type: 'int', value: 3, min: 1, max: 16 },
    { name: 'caps', type: 'combo', value: 'ball', values: CAP_MODES },
    { name: 'cap rings', type: 'int', value: 4, min: 1, max: 32 },
    { name: 'radius x', type: 'number', value: 1, min: 0, step: 1, precision: 3 },
    { name: 'min radius', type: 'number', value: 0, min: 0, step: 1, precision: 3 },
    { name: 'joint balls', type: 'toggle', value: false, pin: false },
    { name: 'color', type: 'text', value: '#d9d3c7', pin: false },
    { name: 'Build now', type: 'button', onClick: (n) => { n._pending = true; } },
  ]);
  paint(this, 'output');
  reserveInfo(this, 205);
  this._geo = null;
}
TubesNode.title = 'Tubes';
TubesNode.desc = 'Extrude closed tubes along every branch';
TubesNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  const viewer = runtime.viewer;
  const v = this.properties.values;
  if (!inp) { this._info = 'no input'; this.setOutputData(0, undefined); return; }
  if (v.live || this._pending) {
    const skel = applyBundle(inp);
    this._geo = buildTubes(skel, {
      radial: getNumber(this, 'radial segs', 8) | 0, subdiv: getNumber(this, 'subdivide', 1) | 0,
      caps: v.caps, capRings: getNumber(this, 'cap rings', 4) | 0,
      radiusMul: getNumber(this, 'radius x', 1), minRadius: getNumber(this, 'min radius'), jointBalls: !!v['joint balls'],
    }, this._geo);
    this._geo.name = 'tubes';
    this._pending = false;
    if (viewer) viewer.updateMesh(this, this._geo, { color: safeColor(v.color, '#d9d3c7'), visible: !!v.show });
    runtime.stats.tubeVerts = this._geo.vertexCount;
    this._info = `${this._geo.vertexCount} verts · ${(this._geo.indexCount / 3) | 0} tris`;
  } else if (viewer && this._geo) viewer.setMeshVisible(this, !!v.show);
  this.setOutputData(0, this._geo || undefined);
};
TubesNode.prototype.onRemoved = function () { runtime.viewer && runtime.viewer.removeMesh(this); };
finish(TubesNode.prototype);
LiteGraph.registerNodeType('out/tubes', TubesNode);

// ---------------------------------------------------------------------------
let worker = null, workerSeq = 0;
const workerJobs = new Map();
function getWorker() {
  if (worker) return worker;
  // Neocities only allows workers from blob: URLs (Content-Security-Policy worker-src blob:), and
  // that rule also covers a worker's static imports, so a blob loader dynamic-import()s the real
  // script instead. Messages that arrive while it loads are queued and replayed to the handler
  // worker.js installs; a failed load is rethrown so worker.onerror below sees it.
  const src = new URL('../iso/worker.js', import.meta.url).href;
  const boot = `const queue = [];
self.onmessage = (e) => queue.push(e);
import(${JSON.stringify(src)}).then(
  () => { for (const e of queue) self.onmessage(e); },
  (err) => setTimeout(() => { throw err; }));`;
  worker = new Worker(URL.createObjectURL(new Blob([boot], { type: 'text/javascript' })), { type: 'module' });
  worker.onmessage = (e) => {
    const job = workerJobs.get(e.data.id);
    workerJobs.delete(e.data.id);
    if (job) job(e.data);
  };
  worker.onerror = (e) => {
    console.error('iso worker', e.message || e);
    for (const job of workerJobs.values()) job({ ok: false, error: 'worker error' });
    workerJobs.clear();
  };
  return worker;
}

function IsoNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  fixedInput(this, 'curves', 'curves');
  fixedInput(this, 'points', 'mesh');
  this.addOutput('mesh', 'mesh');
  defineParams(this, [
    { name: 'live', type: 'toggle', value: false, pin: false },
    { name: 'show', type: 'toggle', value: true, pin: false },
    { name: 'resolution', type: 'int', value: 64, min: 8, max: MAX_RES },
    { name: 'smooth', type: 'int', value: 3, min: 1, max: 16 },
    { name: 'blend', type: 'number', value: 1, min: 0, max: 4, step: 1, precision: 3 },
    { name: 'drop specks', type: 'int', value: 64, min: 0, max: 100000, step: 100 },
    { name: 'radius x', type: 'number', value: 1, min: 0, step: 1, precision: 3 },
    { name: 'min radius', type: 'number', value: 0, min: 0, step: 1, precision: 3 },
    { name: 'curve dir', type: 'combo', value: 'both', values: ['rows', 'columns', 'both'], pin: false },
    { name: 'curve radius', type: 'number', value: 0, min: 0, step: 1, precision: 3 },
    { name: 'point radius', type: 'number', value: 0, min: 0, step: 1, precision: 3 },
    { name: 'color', type: 'text', value: '#cfd6e0', pin: false },
    { name: 'Build now', type: 'button', onClick: (n) => { n._pending = true; } },
  ]);
  paint(this, 'output');
  reserveInfo(this, 205);
  this._busy = false; this._geo = null; this._pending = true;
}
IsoNode.title = 'Isosurface';
IsoNode.desc = 'One watertight mesh from the joints, the lofted curves, or a mesh’s vertices';
IsoNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  const curves = fixedData(this, 'curves');
  const pts = fixedData(this, 'points');
  const viewer = runtime.viewer;
  const v = this.properties.values;
  if (!inp && !curves && !pts) { this._info = 'no input'; this.setOutputData(0, undefined); return; }
  if ((v.live || this._pending) && !this._busy) {
    const smooth = getNumber(this, 'smooth', 1) | 0;
    const radiusMul = getNumber(this, 'radius x', 1), minRadius = getNumber(this, 'min radius');
    const chunks = [];
    let group = 0;

    if (inp) {
      const skel = applyBundle(inp);
      const r = skel.collectSegments({ radiusMul, minRadius, smooth });
      chunks.push({ segs: r.segs, groups: r.branchOf });
      group = r.nextGroup;
    }
    // lofted curves become capsule chains too, so the membrane blobs as cleanly
    // as the branches do rather than as a cloud of vertex blobs
    if (curves && curves.grids) {
      const dir = v['curve dir'];
      const fixedR = getNumber(this, 'curve radius');
      const lines = [];
      for (const g of curves.grids) {
        if (dir !== 'columns') lines.push(...gridRows(g));
        if (dir !== 'rows') lines.push(...gridCols(g));
      }
      for (let i = 0; i < lines.length; i++) {
        lines[i].group = i;
        if (fixedR > 0) lines[i].rads.fill(fixedR);
      }
      const r = segmentsFromPolylines(lines, { smooth, radiusMul, minRadius, groupBase: group });
      chunks.push({ segs: r.segs, groups: r.groups });
      group = r.nextGroup;
    }
    // a mesh on `points` puts a blob at every one of its vertices, the way the
    // old sketches shrink-wrapped already-built tube geometry
    const pr = getNumber(this, 'point radius');
    if (pts && pts.positions && pr > 0) {
      const nvp = pts.vertexCount ?? pts.positions.length / 3;
      const segs = new Float32Array(nvp * 8), groups = new Int32Array(nvp).fill(group);
      for (let i = 0; i < nvp; i++) {
        const q = i * 8, o = i * 3;
        segs[q] = segs[q + 4] = pts.positions[o];
        segs[q + 1] = segs[q + 5] = pts.positions[o + 1];
        segs[q + 2] = segs[q + 6] = pts.positions[o + 2];
        segs[q + 3] = segs[q + 7] = pr;
      }
      chunks.push({ segs, groups });
      group++;
    }

    let segs, branchOf;
    if (chunks.length === 1) { segs = chunks[0].segs; branchOf = chunks[0].groups; }
    else {
      let n = 0;
      for (const c of chunks) n += c.groups.length;
      segs = new Float32Array(n * 8); branchOf = new Int32Array(n);
      let o = 0;
      for (const c of chunks) { segs.set(c.segs, o * 8); branchOf.set(c.groups, o); o += c.groups.length; }
    }
    if (!branchOf.length) { this._info = 'nothing to build'; this.setOutputData(0, this._geo || undefined); return; }

    const id = ++workerSeq;
    this._busy = true; this._pending = false;
    const t0 = performance.now();
    workerJobs.set(id, (r) => {
      this._busy = false;
      if (!r.ok) { this._info = 'error: ' + r.error; this.boxcolor = '#e55'; return; }
      this.boxcolor = null;
      this._geo = { name: 'isosurface', positions: r.positions, normals: r.normals, indices: r.indices, vertexCount: r.positions.length / 3, indexCount: r.indices.length };
      runtime.stats.isoVerts = this._geo.vertexCount; runtime.stats.isoMs = performance.now() - t0;
      this._info = `${this._geo.vertexCount} verts · ${r.parts ?? '?'} part${r.parts === 1 ? '' : 's'} · ${(r.time | 0)} ms`;
      if (runtime.viewer) runtime.viewer.updateMesh(this, this._geo, { color: safeColor(v.color, '#cfd6e0'), visible: !!v.show });
    });
    getWorker().postMessage({ id, segs, opts: { res: getNumber(this, 'resolution', 64) | 0, blend: getNumber(this, 'blend', 1),
      minPart: getNumber(this, 'drop specks', 64) | 0, branchOf } }, [segs.buffer, branchOf.buffer]);
  } else if (viewer && this._geo) viewer.setMeshVisible(this, !!v.show);
  this.setOutputData(0, this._geo || undefined);
};
IsoNode.prototype.onRemoved = function () { runtime.viewer && runtime.viewer.removeMesh(this); };
finish(IsoNode.prototype);
LiteGraph.registerNodeType('out/isosurface', IsoNode);

// ---------------------------------------------------------------------------
function MergeNode() {
  for (let i = 0; i < 4; i++) fixedInput(this, 'mesh ' + (i + 1), 'mesh');
  this.addOutput('mesh', 'mesh');
  defineParams(this, []);
  paint(this, 'output');
  reserveInfo(this, 150);
}
MergeNode.title = 'Merge';
MergeNode.desc = 'Combine meshes into one, for export or for the isosurface';
MergeNode.prototype.onExecute = function () {
  const parts = [];
  for (let i = 0; i < 4; i++) { const m = fixedData(this, 'mesh ' + (i + 1)); if (m && m.positions) parts.push(m); }
  if (!parts.length) { this._info = 'no input'; this.setOutputData(0, undefined); return; }
  let nv = 0, ni = 0;
  for (const p of parts) { nv += (p.vertexCount ?? p.positions.length / 3); ni += (p.indexCount ?? p.indices.length); }
  if (!this._geo || this._geo.positions.length !== nv * 3 || this._geo.indices.length !== ni) {
    this._geo = { name: 'merged', positions: new Float32Array(nv * 3), normals: new Float32Array(nv * 3), indices: nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni) };
  }
  let vo = 0, io = 0;
  for (const p of parts) {
    const pv = p.vertexCount ?? p.positions.length / 3, pi = p.indexCount ?? p.indices.length;
    this._geo.positions.set(p.positions.subarray(0, pv * 3), vo * 3);
    if (p.normals) this._geo.normals.set(p.normals.subarray(0, pv * 3), vo * 3);
    for (let k = 0; k < pi; k++) this._geo.indices[io + k] = p.indices[k] + vo;
    vo += pv; io += pi;
  }
  this._geo.vertexCount = nv; this._geo.indexCount = ni;
  this._info = `${parts.length} meshes · ${nv} verts`;
  this.setOutputData(0, this._geo);
};
finish(MergeNode.prototype);
LiteGraph.registerNodeType('out/merge', MergeNode);

// ---------------------------------------------------------------------------
function ExportNode() {
  fixedInput(this, 'mesh', 'mesh');
  defineParams(this, [
    { name: 'format', type: 'combo', value: 'stl', values: ['stl', 'obj'] },
    { name: 'scale', type: 'number', value: 1, min: 0, step: 2, precision: 4 },
    { name: 'name', type: 'text', value: 'tree', pin: false },
    { name: 'Export', type: 'button', onClick: (n) => n.exportNow() },
  ]);
  paint(this, 'output');
  reserveInfo(this, 190);
}
ExportNode.title = 'Export';
ExportNode.desc = 'Download the connected mesh as STL or OBJ';
ExportNode.prototype.onExecute = function () {
  this._mesh = fixedData(this, 'mesh');
  this._info = this._mesh ? `${this._mesh.vertexCount ?? this._mesh.positions.length / 3} verts ready` : 'no mesh';
};
ExportNode.prototype.exportNow = function () {
  if (!this._mesh) { runtime.toast && runtime.toast('Export: nothing connected'); return; }
  exportMeshes([this._mesh], this.properties.values.format, getNumber(this, 'scale', 1), this.properties.values.name || 'tree');
};
finish(ExportNode.prototype);
LiteGraph.registerNodeType('out/export', ExportNode);

export function exportMeshes(meshes, format, scale, name) {
  const parts = meshes.map((m) => {
    const vc = m.vertexCount ?? m.positions.length / 3;
    return {
      name: m.name || 'part',
      positions: m.positions.subarray(0, vc * 3),
      normals: m.normals ? m.normals.subarray(0, vc * 3) : null,
      indices: m.indices.subarray(0, m.indexCount ?? m.indices.length),
    };
  });
  if (format === 'obj') download(toOBJ(parts, { scale }), name + '.obj', 'text/plain');
  else download(toSTL(parts, { scale }), name + '.stl', 'application/octet-stream');
  runtime.toast && runtime.toast(`Exported ${name}.${format}`);
}
