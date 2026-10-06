// Select node: joints of a branch set -> selection { joints, branches, buildId }.
import { resolveSelection, JOINT_MODES, SIB_MODES } from '../core/select.js';
import { runtime } from '../app/runtime.js';
import { LiteGraph, paint, defineParams, getNumber, getParam, fixedInput, fixedData, finish, reserveInfo } from './common.js';

function SelectNode() {
  fixedInput(this, 'skeleton', 'skeleton');
  fixedInput(this, 'scope', 'branches,selection');
  this.addOutput('selection', 'selection');
  this.addOutput('branches', 'branches');
  const dirty = (node) => { node._key = null; };
  defineParams(this, [
    { name: 'joints', type: 'combo', value: 'all', values: JOINT_MODES, onChange: dirty },
    { name: 'from', type: 'int', value: 0, onChange: dirty },
    { name: 'to', type: 'int', value: -1, onChange: dirty },
    { name: 'step', type: 'int', value: 2, min: 1, onChange: dirty },
    { name: 'spokes', type: 'combo', value: 'all', values: SIB_MODES, onChange: dirty },
    { name: 'spoke', type: 'int', value: 0, min: 0, onChange: dirty },
    { name: 'filter', type: 'text', value: '', onChange: dirty },
  ]);
  paint(this, 'select');
  reserveInfo(this, 215);
}
SelectNode.title = 'Select';
SelectNode.desc = 'Pick joints of a branch set';
SelectNode.prototype.onExecute = function () {
  const inp = fixedData(this, 'skeleton');
  if (!inp) { this.setOutputData(0, undefined); this.setOutputData(1, undefined); this._info = 'no input'; return; }
  const skel = inp.skel;
  const scope = fixedData(this, 'scope') || inp.set || null;
  const v = this.properties.values;
  const filter = String(getParam(this, 'filter') || '');
  const key = JSON.stringify([v.joints, getNumber(this, 'from'), getNumber(this, 'to'), getNumber(this, 'step'), v.spokes, getNumber(this, 'spoke'), filter]);
  const usesTime = /\btime\b/.test(filter);
  if (this._builtId !== skel.buildId || this._key !== key || this._scope !== scope || usesTime) {
    this._sel = resolveSelection(skel, scope, {
      joints: v.joints, from: getNumber(this, 'from') | 0, to: getNumber(this, 'to', -1) | 0, step: getNumber(this, 'step', 1) | 0,
      sib: v.spokes, sibIndex: getNumber(this, 'spoke') | 0, filter, time: runtime.time,
    });
    this._builtId = skel.buildId; this._key = key; this._scope = scope;
    this._info = `${this._sel.joints.length} joints in ${this._sel.branches.length} branches`;
  }
  this.setOutputData(0, this._sel);
  this.setOutputData(1, this._sel);
};
finish(SelectNode.prototype, { dirty: true });
LiteGraph.registerNodeType('tree/select', SelectNode);
