// Transform nodes: Rotate / Translate / Scale / Size. Each records an op on the
// bundle; consumers apply the ops in path order. Every channel is a widget by
// default and can be flipped to a pin (right-click > Inputs, or drop a link on
// the widget), so a slider or a field can drive it.
import { CHAN } from '../core/skeleton.js';
import { jointsOfBranches } from '../core/select.js';
import { LiteGraph, paint, defineParams, getParam, fixedInput, fixedData, finish, reserveInfo } from './common.js';

const MODES = ['add', 'set', 'mul'];

// all joints of a branch set, cached on the set object
function setJoints(skel, set) {
  if (!set) return null;
  if (!set._all || set._allBuild !== skel.buildId) { set._all = Int32Array.from(jointsOfBranches(skel, set.branches)); set._allBuild = skel.buildId; }
  return set._all;
}

function defineTransform(type, title, desc, chans, defaults = {}) {
  function T() {
    fixedInput(this, 'skeleton', 'skeleton');
    fixedInput(this, 'selection', 'selection');
    this.addOutput('skeleton', 'skeleton');
    defineParams(this, [
      { name: 'mode', type: 'combo', value: defaults.mode || 'add', values: MODES },
      ...chans.map((c) => ({ name: c.name, type: 'number', value: c.value, step: c.step ?? 2, precision: 3 })),
    ]);
    paint(this, 'transform');
    reserveInfo(this, 180);
  }
  T.title = title; T.desc = desc;
  T.prototype.onExecute = function () {
    const inp = fixedData(this, 'skeleton');
    if (!inp) { this.setOutputData(0, undefined); this._info = 'no input'; return; }
    const skel = inp.skel;
    const sel = fixedData(this, 'selection');
    const mode = this.properties.values.mode;
    const op = { sel: null, buildId: skel.buildId, mode, chans: [] };
    if (sel && sel.joints) { op.sel = sel.joints; op.buildId = sel.buildId; }
    else if (inp.set) { op.sel = setJoints(skel, inp.set); op.buildId = inp.set.buildId; }
    // A channel takes part only if it is driven by a pin or its value has been
    // moved off the node's default. Without this, `set` mode would write every
    // channel — so a Size node meant to set only `length` would also set `width`
    // to zero, which silently collapses whatever it touches.
    const pins = this.properties.pins || {};
    for (const c of chans) {
      const v = getParam(this, c.name);
      if (typeof v === 'function') {
        for (const ch of c.channels) op.chans.push({ ch: CHAN[ch], v });
        continue;
      }
      if (typeof v !== 'number' || v !== v) continue;
      if (!pins[c.name] && v === this._paramByName[c.name].value) continue;
      for (const ch of c.channels) op.chans.push({ ch: CHAN[ch], v });
    }
    this._info = `${op.sel ? op.sel.length : skel.count} joints · ${mode}`;
    this.setOutputData(0, { skel, ops: op.chans.length ? inp.ops.concat([op]) : inp.ops, set: inp.set });
  };
  finish(T.prototype);
  LiteGraph.registerNodeType(type, T);
  return T;
}

defineTransform('tree/rotate', 'Rotate', 'Rotate joints (radians)', [
  { name: 'rx', value: 0, channels: ['rx'] },
  { name: 'ry', value: 0, channels: ['ry'] },
  { name: 'rz', value: 0, channels: ['rz'] },
]);
defineTransform('tree/translate', 'Translate', 'Offset joints', [
  { name: 'tx', value: 0, channels: ['tx'], step: 5 },
  { name: 'ty', value: 0, channels: ['ty'], step: 5 },
  { name: 'tz', value: 0, channels: ['tz'], step: 5 },
]);
defineTransform('tree/scale', 'Scale', 'Scale joints (compounds down the chain)', [
  { name: 'scale', value: 1, channels: ['sx', 'sy', 'sz'], step: 1 },
  { name: 'sx', value: 1, channels: ['sx'], step: 1 },
  { name: 'sy', value: 1, channels: ['sy'], step: 1 },
  { name: 'sz', value: 1, channels: ['sz'], step: 1 },
], { mode: 'mul' });
defineTransform('tree/size', 'Size', 'Joint length and width', [
  { name: 'length', value: 0, channels: ['len'], step: 2 },
  { name: 'width', value: 0, channels: ['wid'], step: 1 },
]);
