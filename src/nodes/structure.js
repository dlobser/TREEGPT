// Structure nodes: Root (trunks) and Branch (sprout from joints).
//
// Bundles flow along "skeleton" links: { skel, ops, set }.
//   skel — the shared Skeleton (structure is global; every connected Branch adds to it)
//   ops  — the transform ops on the path so far (pose is path-dependent)
//   set  — the branch set made by the nearest upstream structure node
//          (the default target for Branch/Select/transform nodes)
import { Skeleton, composeMatrix } from '../core/skeleton.js';
import { jointsOfBranches, allBranchIds } from '../core/select.js';
import { runtime } from '../app/runtime.js';
import { LiteGraph, paint, defineParams, getNumber, fixedInput, fixedData, finish, reserveInfo, structuralKeyChanged, TAU } from './common.js';

const EMPTY_OPS = [];

// ---------------------------------------------------------------------------
function RootNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  this.addOutput('skeleton', 'skeleton');
  this.addOutput('branches', 'branches');
  defineParams(this, [
    { name: 'trunks', type: 'int', value: 1, min: 1, max: 500 },
    { name: 'joints', type: 'int', value: 10, min: 1, max: 5000 },
    { name: 'length', type: 'number', value: 5, min: 0, step: 5 },
    { name: 'width', type: 'number', value: 1, min: 0, step: 2 },
    { name: 'angle', type: 'number', value: 0, step: 2 },
    { name: 'spread', type: 'number', value: 0, step: 2 },
    { name: 'taper', type: 'number', value: 1, step: 1 },
    { name: 'x', type: 'number', value: 0, step: 10 },
    { name: 'y', type: 'number', value: 0, step: 10 },
    { name: 'z', type: 'number', value: 0, step: 10 },
    { name: 'rot x', type: 'number', value: 0, step: 2 },
    { name: 'rot y', type: 'number', value: 0, step: 2 },
    { name: 'rot z', type: 'number', value: 0, step: 2 },
  ]);
  paint(this, 'structure');
  reserveInfo(this, 190);
}
RootNode.title = 'Root';
RootNode.desc = 'Trunks growing from a point';
RootNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  let skel;
  if (inp) skel = inp.skel;
  else {
    if (!this._skel) this._skel = new Skeleton();
    if (this._skel.buildId !== runtime.buildId) this._skel.clear(runtime.buildId);
    skel = this._skel;
  }
  const p = {
    rads: Math.max(1, getNumber(this, 'trunks', 1) | 0),
    joints: Math.max(1, getNumber(this, 'joints', 1) | 0),
    length: getNumber(this, 'length'), width: getNumber(this, 'width'), angle: getNumber(this, 'angle'),
    spread: getNumber(this, 'spread'), taper: getNumber(this, 'taper', 1),
    x: getNumber(this, 'x'), y: getNumber(this, 'y'), z: getNumber(this, 'z'),
    rx: getNumber(this, 'rot x'), ry: getNumber(this, 'rot y'), rz: getNumber(this, 'rot z'),
  };
  structuralKeyChanged(this, JSON.stringify(p));
  if (this._builtId !== skel.buildId) {
    const root = composeMatrix(new Float32Array(16), p.rx, p.ry, p.rz, p.x, p.y, p.z, 1);
    const ids = [];
    for (let k = 0; k < p.rads; k++) {
      const rec = skel.addBranch({ at: -1, n: p.joints, len: p.length, wid: p.width, rz: p.angle, ry: p.spread + k * TAU / p.rads,
        taper: p.taper, root, sib: k, rads: p.rads, ord: k, nord: p.rads, creator: this.id });
      ids.push(rec.id);
    }
    this._set = { branches: ids, buildId: skel.buildId };
    this._builtId = skel.buildId;
    this._info = `${p.rads} trunk${p.rads > 1 ? 's' : ''} × ${p.joints} joints`;
  }
  this.setOutputData(0, { skel, ops: inp ? inp.ops : EMPTY_OPS, set: this._set });
  this.setOutputData(1, this._set);
};
finish(RootNode.prototype, { dirty: true });
LiteGraph.registerNodeType('tree/root', RootNode);

// ---------------------------------------------------------------------------
function BranchNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  fixedInput(this, 'at', 'branches,selection');
  this.addOutput('skeleton', 'skeleton');
  this.addOutput('branches', 'branches');
  defineParams(this, [
    { name: 'joints', type: 'int', value: 5, min: 1, max: 5000 },
    { name: 'rads', type: 'int', value: 2, min: 1, max: 200 },
    { name: 'angle', type: 'number', value: 1, step: 2 },
    { name: 'spread', type: 'number', value: 0, step: 2 },
    { name: 'length', type: 'number', value: 2, min: 0, step: 2 },
    { name: 'width', type: 'number', value: 0.5, min: 0, step: 1 },
    { name: 'taper', type: 'number', value: 1, step: 1 },
    { name: 'every', type: 'int', value: 1, min: 1 },
    { name: 'start', type: 'int', value: 0 },
    { name: 'end', type: 'int', value: -1 },
  ]);
  paint(this, 'structure');
  reserveInfo(this, 190);
}
BranchNode.title = 'Branch';
BranchNode.desc = 'Sprout branches from joints';
BranchNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  if (!inp) { this.setOutputData(0, undefined); this.setOutputData(1, undefined); this._info = 'no input'; return; }
  const skel = inp.skel;
  const at = fixedData(this, 'at') || inp.set || null;
  const p = {
    joints: Math.max(1, getNumber(this, 'joints', 1) | 0),
    rads: Math.max(1, getNumber(this, 'rads', 1) | 0),
    angle: getNumber(this, 'angle'), spread: getNumber(this, 'spread'),
    length: getNumber(this, 'length'), width: getNumber(this, 'width'), taper: getNumber(this, 'taper', 1),
    every: Math.max(1, getNumber(this, 'every', 1) | 0), start: getNumber(this, 'start') | 0, end: getNumber(this, 'end', -1) | 0,
  };
  structuralKeyChanged(this, JSON.stringify(p));
  if (this._builtId !== skel.buildId) {
    let joints;
    if (at && at.joints) joints = at.joints;
    else joints = jointsOfBranches(skel, at && at.branches ? at.branches : allBranchIds(skel), p.every, p.start, p.end);
    const ids = [];
    const total = joints.length * p.rads;
    let ord = 0;
    for (let k = 0; k < joints.length; k++) {
      const j = joints[k];
      if (j < 0 || j >= skel.count) continue;
      for (let s = 0; s < p.rads; s++) {
        const rec = skel.addBranch({ at: j, n: p.joints, len: p.length, wid: p.width, rz: p.angle, ry: p.spread + s * TAU / p.rads,
          taper: p.taper, sib: s, rads: p.rads, ord: ord++, nord: total, creator: this.id });
        ids.push(rec.id);
      }
    }
    this._set = { branches: ids, buildId: skel.buildId };
    this._builtId = skel.buildId;
    this._info = `${ids.length} branches × ${p.joints} joints`;
  }
  this.setOutputData(0, { skel, ops: inp.ops, set: this._set });
  this.setOutputData(1, this._set);
};
finish(BranchNode.prototype, { dirty: true });
LiteGraph.registerNodeType('tree/branch', BranchNode);
