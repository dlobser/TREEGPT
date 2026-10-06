// Field nodes: per-joint functions. Output type "field" (a function of ctx).
// Every numeric parameter can be flipped to a pin, so fields nest.
import { ATTRS, ATTR_HELP, val, noise, hash01, compileExpr, clamp } from '../core/fields.js';
import { LiteGraph, paint, defineParams, getParam, fixedInput, fixedData, finish, reserveInfo } from './common.js';

const SCALE_BY = ['none', 'joint', 'along', 'order', 'across', 'depth', 'joints'];

// tooltip for the attr dropdown
function attrHelp(node) {
  const a = node.properties.values.attr;
  return ATTR_HELP[a] ? `${a}: ${ATTR_HELP[a]}` : '';
}

// ---------------------------------------------------------------------------
function SineNode() {
  this.addOutput('field', 'field');
  defineParams(this, [
    { name: 'attr', type: 'combo', value: 'joint', values: ATTRS },
    { name: 'freq', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'amp', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'phase', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'speed', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'scale by', type: 'combo', value: 'none', values: SCALE_BY },
  ]);
  paint(this, 'field');
  reserveInfo(this, 190);
}
SineNode.title = 'Sine';
SineNode.desc = 'amp x sin(freq x attr + phase + speed x time) + offset';
SineNode.prototype.onExecute = function () {
  const attr = this.properties.values.attr, scaleBy = this.properties.values['scale by'];
  const freq = getParam(this, 'freq'), amp = getParam(this, 'amp'), phase = getParam(this, 'phase'), offset = getParam(this, 'offset');
  const speed = getParam(this, 'speed');
  const sb = scaleBy === 'none' ? null : scaleBy;
  this._info = attrHelp(this);
  this.setOutputData(0, (c) => {
    const v = val(amp, c) * Math.sin(val(freq, c) * c[attr] + val(phase, c) + val(speed, c) * c.time) + val(offset, c);
    return sb ? v * c[sb] : v;
  });
};
finish(SineNode.prototype);
LiteGraph.registerNodeType('field/sine', SineNode);

// ---------------------------------------------------------------------------
function NoiseNode() {
  this.addOutput('field', 'field');
  defineParams(this, [
    { name: 'mode', type: 'combo', value: 'attr', values: ['attr', 'rest xyz'] },
    { name: 'attr', type: 'combo', value: 'joint', values: ATTRS },
    { name: 'freq', type: 'number', value: 0.3, step: 2, precision: 3 },
    { name: 'amp', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'speed', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'per branch', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'seed', type: 'int', value: 0, step: 10 },
    { name: 'scale by', type: 'combo', value: 'none', values: SCALE_BY },
  ]);
  paint(this, 'field');
  reserveInfo(this, 190);
}
NoiseNode.title = 'Noise';
NoiseNode.desc = 'Perlin noise along an attribute or through space';
NoiseNode.prototype.onExecute = function () {
  const v = this.properties.values;
  const attr = v.attr, mode = v.mode, sb = v['scale by'] === 'none' ? null : v['scale by'];
  const freq = getParam(this, 'freq'), amp = getParam(this, 'amp'), offset = getParam(this, 'offset');
  const speed = getParam(this, 'speed'), per = getParam(this, 'per branch'), seed = (v.seed | 0) * 17.31;
  this._info = mode === 'attr' ? attrHelp(this) : 'noise sampled at the rest position';
  if (mode === 'attr') {
    this.setOutputData(0, (c) => {
      const r = val(amp, c) * noise(val(freq, c) * c[attr] + val(offset, c) + val(speed, c) * c.time + c.order * val(per, c) + seed, seed * 0.37, 0);
      return sb ? r * c[sb] : r;
    });
  } else {
    this.setOutputData(0, (c) => {
      const f = val(freq, c), o = val(offset, c) + val(speed, c) * c.time + c.order * val(per, c);
      const r = val(amp, c) * noise(c.x * f + seed, c.y * f + o, c.z * f + seed * 0.5);
      return sb ? r * c[sb] : r;
    });
  }
};
finish(NoiseNode.prototype);
LiteGraph.registerNodeType('field/noise', NoiseNode);

// ---------------------------------------------------------------------------
function RampNode() {
  this.addOutput('field', 'field');
  defineParams(this, [
    { name: 'attr', type: 'combo', value: 'joint', values: ATTRS },
    { name: 'slope', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
  ]);
  paint(this, 'field');
  reserveInfo(this, 190);
}
RampNode.title = 'Ramp';
RampNode.desc = 'slope x attr + offset';
RampNode.prototype.onExecute = function () {
  const attr = this.properties.values.attr, slope = getParam(this, 'slope'), offset = getParam(this, 'offset');
  this._info = attrHelp(this);
  this.setOutputData(0, (c) => val(slope, c) * c[attr] + val(offset, c));
};
finish(RampNode.prototype);
LiteGraph.registerNodeType('field/ramp', RampNode);

// ---------------------------------------------------------------------------
function AttrNode() {
  this.addOutput('field', 'field');
  defineParams(this, [{ name: 'attr', type: 'combo', value: 'along', values: ATTRS }]);
  paint(this, 'field');
  reserveInfo(this, 190);
}
AttrNode.title = 'Attribute';
AttrNode.desc = 'A joint attribute as a field';
AttrNode.prototype.onExecute = function () {
  const attr = this.properties.values.attr;
  this._info = attrHelp(this);
  this.setOutputData(0, (c) => c[attr]);
};
finish(AttrNode.prototype);
LiteGraph.registerNodeType('field/attribute', AttrNode);

// ---------------------------------------------------------------------------
function RandomNode() {
  this.addOutput('field', 'field');
  defineParams(this, [
    { name: 'per', type: 'combo', value: 'joint', values: ['joint', 'branch', 'order', 'spoke'] },
    { name: 'amp', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'offset', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'seed', type: 'int', value: 1, step: 10 },
  ]);
  paint(this, 'field');
}
RandomNode.title = 'Random';
RandomNode.desc = 'Stable per-joint random in [-amp, amp]';
RandomNode.prototype.onExecute = function () {
  const per = this.properties.values.per;
  const amp = getParam(this, 'amp'), offset = getParam(this, 'offset'), seed = (this.properties.values.seed | 0) * 7919;
  const key = per === 'joint' ? 'id' : per === 'branch' ? 'branch' : per === 'order' ? 'order' : 'rad';
  this.setOutputData(0, (c) => (hash01(c[key] * 31 + seed) * 2 - 1) * val(amp, c) + val(offset, c));
};
finish(RandomNode.prototype, { info: false });
LiteGraph.registerNodeType('field/random', RandomNode);

// ---------------------------------------------------------------------------
const OPS = {
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => b === 0 ? 0 : a / b,
  min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => b === 0 ? 0 : a % b, avg: (a, b) => (a + b) * 0.5,
  atan2: Math.atan2,
};
function MathNode() {
  this.addOutput('out', 'number,field');
  defineParams(this, [
    { name: 'op', type: 'combo', value: 'mul', values: Object.keys(OPS) },
    { name: 'a', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'b', type: 'number', value: 1, step: 2, precision: 3 },
  ]);
  paint(this, 'field');
}
MathNode.title = 'Math';
MathNode.desc = 'a op b (numbers or fields)';
MathNode.prototype.onExecute = function () {
  const f = OPS[this.properties.values.op] || OPS.add;
  const a = getParam(this, 'a'), b = getParam(this, 'b');
  if (typeof a === 'function' || typeof b === 'function') this.setOutputData(0, (c) => f(val(a, c), val(b, c)));
  else this.setOutputData(0, f(Number(a) || 0, Number(b) || 0));
};
finish(MathNode.prototype, { info: false });
LiteGraph.registerNodeType('field/math', MathNode);

// ---------------------------------------------------------------------------
const FUNCS = {
  sin: Math.sin, cos: Math.cos, abs: Math.abs, sqrt: (x) => Math.sqrt(Math.max(0, x)), floor: Math.floor, round: Math.round,
  sign: Math.sign, neg: (x) => -x, square: (x) => x * x, exp: Math.exp, 'one minus': (x) => 1 - x,
  smooth: (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); },
};
function FuncNode() {
  this.addOutput('out', 'number,field');
  defineParams(this, [
    { name: 'fn', type: 'combo', value: 'sin', values: Object.keys(FUNCS) },
    { name: 'x', type: 'number', value: 0, step: 2, precision: 3 },
  ]);
  paint(this, 'field');
}
FuncNode.title = 'Function';
FuncNode.desc = 'f(x)';
FuncNode.prototype.onExecute = function () {
  const f = FUNCS[this.properties.values.fn] || Math.sin;
  const x = getParam(this, 'x');
  if (typeof x === 'function') this.setOutputData(0, (c) => f(x(c))); else this.setOutputData(0, f(Number(x) || 0));
};
finish(FuncNode.prototype, { info: false });
LiteGraph.registerNodeType('field/function', FuncNode);

// ---------------------------------------------------------------------------
function MapNode() {
  this.addOutput('out', 'number,field');
  defineParams(this, [
    { name: 'x', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'in min', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'in max', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'out min', type: 'number', value: 0, step: 2, precision: 3 },
    { name: 'out max', type: 'number', value: 1, step: 2, precision: 3 },
    { name: 'clamp', type: 'combo', value: 'no', values: ['no', 'yes'] },
  ]);
  paint(this, 'field');
}
MapNode.title = 'Map range';
MapNode.desc = 'Remap x from one range to another';
MapNode.prototype.onExecute = function () {
  const x = getParam(this, 'x');
  const i0 = getParam(this, 'in min'), i1 = getParam(this, 'in max'), o0 = getParam(this, 'out min'), o1 = getParam(this, 'out max');
  const cl = this.properties.values.clamp === 'yes';
  const m = (v, c) => {
    const a = val(i0, c), b = val(i1, c);
    let t = b === a ? 0 : (v - a) / (b - a);
    if (cl) t = clamp(t, 0, 1);
    return val(o0, c) + (val(o1, c) - val(o0, c)) * t;
  };
  const anyField = [x, i0, i1, o0, o1].some((v) => typeof v === 'function');
  if (anyField) this.setOutputData(0, (c) => m(val(x, c), c));
  else this.setOutputData(0, m(Number(x) || 0, null));
};
finish(MapNode.prototype, { info: false });
LiteGraph.registerNodeType('field/map', MapNode);

// ---------------------------------------------------------------------------
function ExprNode() {
  fixedInput(this, 'a', 'number,field');
  fixedInput(this, 'b', 'number,field');
  fixedInput(this, 'c', 'number,field');
  fixedInput(this, 'd', 'number,field');
  this.addOutput('field', 'field');
  defineParams(this, [{ name: 'expr', type: 'text', value: 'sin(joint * 0.5 + time) * 0.2' }]);
  paint(this, 'field');
  reserveInfo(this, 270);
}
ExprNode.title = 'Expression';
ExprNode.desc = 'A JS expression over joint attributes and the inputs a b c d';
ExprNode.prototype.onExecute = function () {
  const src = String(this.properties.values.expr || '0');
  let f;
  try { f = compileExpr(src); this._info = ''; this.boxcolor = null; }
  catch (e) { this._info = 'error: ' + e.message; this.boxcolor = '#e55'; this.setOutputData(0, () => 0); return; }
  const a = fixedData(this, 'a'), b = fixedData(this, 'b'), c = fixedData(this, 'c'), d = fixedData(this, 'd');
  const p = { a: 0, b: 0, c: 0, d: 0 };
  this.setOutputData(0, (ctx) => {
    p.a = val(a, ctx); p.b = val(b, ctx); p.c = val(c, ctx); p.d = val(d, ctx);
    const r = f(ctx, p);
    return typeof r === 'number' ? r : Number(r) || 0;
  });
};
finish(ExprNode.prototype);
LiteGraph.registerNodeType('field/expression', ExprNode);
