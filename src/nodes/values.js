// Value nodes: Slider, Number, Time, LFO.
import { runtime } from '../app/runtime.js';
import { LiteGraph, paint, defineParams, getParam, finish, restoreParams } from './common.js';

// ---------------------------------------------------------------------------
function SliderNode() {
  this.addOutput('value', 'number');
  defineParams(this, [
    { name: 'name', type: 'text', value: 'slider', onChange: (node, v) => { node.title = v || 'Slider'; runtime.onSlidersChanged && runtime.onSlidersChanged(); } },
    { name: 'value', type: 'slider', value: 0.5, min: 0, max: 1, pin: false, onChange: () => runtime.onSlidersChanged && runtime.onSlidersChanged() },
    { name: 'min', type: 'number', value: 0, step: 5, precision: 3, pin: false, onChange: (node) => node.syncRange() },
    { name: 'max', type: 'number', value: 1, step: 5, precision: 3, pin: false, onChange: (node) => node.syncRange() },
  ]);
  paint(this, 'value');
  this.size = [210, this.computeSize()[1]];
}
SliderNode.title = 'Slider';
SliderNode.desc = 'A value you can drive from the preview drawer';
SliderNode.prototype.syncRange = function () {
  const v = this.properties.values;
  if (v.max <= v.min) v.max = v.min + 1e-6;
  v.value = Math.min(v.max, Math.max(v.min, v.value));
  const w = (this.widgets || []).find((w) => w._param === 'value');
  if (w) { w.options.min = v.min; w.options.max = v.max; w.value = v.value; }
  runtime.onSlidersChanged && runtime.onSlidersChanged();
};
SliderNode.prototype.setValue = function (x) {
  const v = this.properties.values;
  v.value = Math.min(v.max, Math.max(v.min, x));
  const w = (this.widgets || []).find((w) => w._param === 'value');
  if (w) w.value = v.value;
  if (this.graph) this.graph.setDirtyCanvas(true, false);
};
SliderNode.prototype.getValue = function () { return this.properties.values.value; };
SliderNode.prototype.getRange = function () { return [this.properties.values.min, this.properties.values.max]; };
SliderNode.prototype.getName = function () { return this.properties.values.name || 'slider'; };
SliderNode.prototype.onAdded = function () { runtime.registerSlider(this); };
SliderNode.prototype.onRemoved = function () { runtime.unregisterSlider(this); };
SliderNode.prototype.onConfigure = function () {
  restoreParams(this);
  this.title = this.getName();
  this.syncRange();
};
SliderNode.prototype.onExecute = function () { this.setOutputData(0, this.properties.values.value); };
finish(SliderNode.prototype, { info: false });
LiteGraph.registerNodeType('value/slider', SliderNode);

// ---------------------------------------------------------------------------
function NumberNode() {
  this.addOutput('value', 'number');
  defineParams(this, [{ name: 'value', type: 'number', value: 1, step: 2, precision: 3, pin: false }]);
  paint(this, 'value');
}
NumberNode.title = 'Number';
NumberNode.desc = 'A constant';
NumberNode.prototype.onExecute = function () { this.setOutputData(0, this.properties.values.value); };
finish(NumberNode.prototype, { info: false });
LiteGraph.registerNodeType('value/number', NumberNode);

// ---------------------------------------------------------------------------
function TimeNode() {
  this.addOutput('time', 'number');
  this.addOutput('sin', 'number');
  this.addOutput('cos', 'number');
  this.addOutput('frame', 'number');
  defineParams(this, [
    { name: 'speed', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
  ]);
  paint(this, 'value');
}
TimeNode.title = 'Time';
TimeNode.desc = 'Seconds (scaled), plus sin and cos of it';
TimeNode.prototype.onExecute = function () {
  const t = runtime.time * (Number(getParam(this, 'speed')) || 0) + (Number(getParam(this, 'offset')) || 0);
  this.setOutputData(0, t); this.setOutputData(1, Math.sin(t)); this.setOutputData(2, Math.cos(t)); this.setOutputData(3, runtime.frame);
};
finish(TimeNode.prototype, { info: false });
LiteGraph.registerNodeType('value/time', TimeNode);

// ---------------------------------------------------------------------------
const WAVES = {
  sine: (p) => Math.sin(p * Math.PI * 2),
  triangle: (p) => { const f = p - Math.floor(p); return 1 - 4 * Math.abs(f - 0.5); },
  saw: (p) => { const f = p - Math.floor(p); return f * 2 - 1; },
  square: (p) => (p - Math.floor(p) < 0.5 ? 1 : -1),
};
function LfoNode() {
  this.addOutput('value', 'number');
  defineParams(this, [
    { name: 'wave', type: 'combo', value: 'sine', values: Object.keys(WAVES) },
    { name: 'freq', type: 'number', value: 0.25, step: 2, precision: 3 },
    { name: 'amp', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'phase', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
  ]);
  paint(this, 'value');
}
LfoNode.title = 'LFO';
LfoNode.desc = 'An oscillating number, in Hz';
LfoNode.prototype.onExecute = function () {
  const f = WAVES[this.properties.values.wave] || WAVES.sine;
  const freq = Number(getParam(this, 'freq')) || 0, amp = Number(getParam(this, 'amp')) || 0;
  const phase = Number(getParam(this, 'phase')) || 0, offset = Number(getParam(this, 'offset')) || 0;
  this.setOutputData(0, f(runtime.time * freq + phase) * amp + offset);
};
finish(LfoNode.prototype, { info: false });
LiteGraph.registerNodeType('value/lfo', LfoNode);
