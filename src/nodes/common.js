// ============================================================================
// common.js — shared node helpers.
//
// Parameters follow the shader-forge model: every parameter is a widget by
// default and can be flipped to an input pin, either from the node's right-click
// "Inputs" menu or by dropping a link straight onto the widget row. Values live
// in node.properties.values, so widgets are only a view of them and the order
// never drifts across a save/load.
// ============================================================================

import { runtime } from '../app/runtime.js';

export const LiteGraph = window.LiteGraph;

// Drop litegraph's stock nodes before any of ours register (this module is
// evaluated before every node module, since they all import it).
LiteGraph.clearRegisteredTypes();

export const COLORS = {
  structure: ['#2f5a2f', '#243f24'],
  select:    ['#6b5a1e', '#4a3f15'],
  transform: ['#2f4a6b', '#22364d'],
  field:     ['#5a3b6b', '#40294d'],
  value:     ['#6b4a2f', '#4d3522'],
  surface:   ['#1e5c5c', '#164343'],
  output:    ['#6b2f2f', '#4d2222'],
};

export function paint(node, cat) {
  node.color = COLORS[cat][0];
  node.bgcolor = COLORS[cat][1];
  node.serialize_widgets = false;     // values live in properties.values
}

export const TAU = Math.PI * 2;
const PIN_TYPES = new Set(['number', 'int', 'slider']);

// ---------------------------------------------------------------------------
// Parameter declaration
// ---------------------------------------------------------------------------
/**
 * defs: [{ name, type, value, label?, min?, max?, step?, precision?, values?,
 *          pin?: false, onClick?, onChange? }]
 * type: number | int | slider | combo | toggle | text | button
 */
export function defineParams(node, defs) {
  node._params = defs;
  node._paramByName = {};
  node.properties = node.properties || {};
  node.properties.values = node.properties.values || {};
  node.properties.pins = node.properties.pins || {};
  for (const d of defs) {
    d.label = d.label || d.name;
    d.canPin = d.pin !== false && PIN_TYPES.has(d.type);
    node._paramByName[d.name] = d;
    if (d.type !== 'button' && node.properties.values[d.name] === undefined) node.properties.values[d.name] = d.value;
  }
  buildParamWidgets(node);
}

export function buildParamWidgets(node) {
  node.widgets = [];
  const pins = node.properties.pins;
  for (const d of node._params) {
    if (d.canPin && pins[d.name]) continue;          // shown as an input instead
    addParamWidget(node, d);
  }
}

function addParamWidget(node, d) {
  const set = (v) => {
    node.properties.values[d.name] = v;
    if (d.onChange) d.onChange(node, v);
    if (node.graph) node.graph.setDirtyCanvas(true, false);
  };
  const cur = node.properties.values[d.name];
  let w;
  switch (d.type) {
    case 'int':
      w = node.addWidget('number', d.label, cur, (v) => set(Math.round(v)), { step: d.step ?? 10, precision: 0, min: d.min, max: d.max });
      break;
    case 'slider':
      w = node.addWidget('slider', d.label, cur, set, { min: d.min ?? 0, max: d.max ?? 1 });
      break;
    case 'combo':
      w = node.addWidget('combo', d.label, cur, set, { values: d.values });
      break;
    case 'toggle':
      w = node.addWidget('toggle', d.label, !!cur, set);
      break;
    case 'text':
      w = node.addWidget('text', d.label, String(cur ?? ''), set);
      break;
    case 'button':
      w = node.addWidget('button', d.label, null, () => d.onClick(node));
      break;
    default:
      w = node.addWidget('number', d.label, cur, set, { step: d.step ?? 5, precision: d.precision ?? 3, min: d.min, max: d.max });
  }
  if (w) w._param = d.name;
  return w;
}

/** Value of a parameter: the pin if it is connected, otherwise the stored value. */
export function getParam(node, name) {
  if (node.properties.pins && node.properties.pins[name]) {
    const inputs = node.inputs || [];
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i]._pin === name) {
        const v = node.getInputData(i);
        if (v !== undefined && v !== null) return v;
        break;
      }
    }
  }
  return node.properties.values[name];
}

/** Plain number (never a field) — for structure params that cannot vary per joint. */
export function getNumber(node, name, fallback = 0) {
  const v = getParam(node, name);
  if (typeof v === 'number' && v === v) return v;
  if (typeof v === 'function') { const r = v(EMPTY_CTX); return r === r ? r : fallback; }
  return fallback;
}
const EMPTY_CTX = {};

export function setPin(node, name, on) {
  const d = node._paramByName[name];
  if (!d || !d.canPin) return;
  node.properties.pins[name] = !!on;
  if (!on) removePinInput(node, d);
  else ensurePinInput(node, d);
  buildParamWidgets(node);
  resize(node);
  runtime.markDirty();
  if (node.graph) node.graph.setDirtyCanvas(true, true);
}

export function togglePin(node, name) { setPin(node, name, !node.properties.pins[name]); }

function ensurePinInput(node, d) {
  const inputs = node.inputs || [];
  for (let i = 0; i < inputs.length; i++) if (inputs[i]._pin === d.name) return i;
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].name === d.label && !inputs[i]._fixed) { inputs[i]._pin = d.name; return i; }
  }
  node.addInput(d.label, d.type === 'toggle' ? 'number' : 'number,field');
  const i = node.inputs.length - 1;
  node.inputs[i]._pin = d.name;
  return i;
}

function removePinInput(node, d) {
  const inputs = node.inputs || [];
  for (let i = inputs.length - 1; i >= 0; i--) {
    if (inputs[i]._pin === d.name || (inputs[i].name === d.label && !inputs[i]._fixed)) {
      node.disconnectInput(i);
      node.removeInput(i);
    }
  }
}

/** Slot index of the pin for a param, creating it if the user is about to connect. */
export function pinSlotFor(node, name) {
  const d = node._paramByName[name];
  if (!d || !d.canPin) return -1;
  if (!node.properties.pins[name]) {
    node.properties.pins[name] = true;
    const i = ensurePinInput(node, d);
    buildParamWidgets(node);
    resize(node);
    return i;
  }
  return ensurePinInput(node, d);
}

/** Restore pins after a graph load: litegraph brings the slots back untagged. */
export function restoreParams(node) {
  if (!node._params) return;
  node.properties.values = node.properties.values || {};
  node.properties.pins = node.properties.pins || {};
  for (const d of node._params) {
    if (d.type !== 'button' && node.properties.values[d.name] === undefined) node.properties.values[d.name] = d.value;
    if (!d.canPin) continue;
    if (node.properties.pins[d.name]) ensurePinInput(node, d);
    else removePinInput(node, d);
  }
  buildParamWidgets(node);
  resize(node);
}

function resize(node) {
  const s = node.computeSize();
  node.size[0] = Math.max(node.size[0], s[0], node._minWidth || 0);
  node.size[1] = s[1] + (node._infoRow ? 14 : 0);
}

/** The param whose widget row sits under a node-local y, for drop-to-pin. */
export function paramAtLocalY(node, localY) {
  if (node.flags.collapsed || !node.widgets) return null;
  const H = LiteGraph.NODE_WIDGET_HEIGHT;
  for (const w of node.widgets) {
    if (!w._param || w.last_y === undefined) continue;
    if (localY >= w.last_y && localY <= w.last_y + H) {
      const d = node._paramByName[w._param];
      if (d && d.canPin) return d.name;
    }
  }
  return null;
}

/** Adds the "Inputs" submenu that flips parameters between widget and pin. */
export function pinMenu(proto) {
  const inner = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function (canvas, options) {
    const items = inner ? (inner.call(this, canvas, options) || []) : [];
    const pinnables = (this._params || []).filter((d) => d.canPin);
    if (pinnables.length) {
      const node = this;
      items.push({
        content: 'Inputs',
        has_submenu: true,
        callback: (_v, _o, e, menu) => {
          const sub = pinnables.map((d) => ({
            content: (node.properties.pins[d.name] ? '● ' : '○ ') + d.label + (node.properties.pins[d.name] ? '  (pin)' : '  (widget)'),
            callback: () => togglePin(node, d.name),
          }));
          new LiteGraph.ContextMenu(sub, { event: e, parentMenu: menu, title: 'Inputs' });
        },
      });
    }
    return items;
  };
}

// ---------------------------------------------------------------------------
// Fixed (structural) inputs — never pinnable, never removed
// ---------------------------------------------------------------------------
export function fixedInput(node, name, type) {
  node.addInput(name, type);
  node.inputs[node.inputs.length - 1]._fixed = true;
  return node.inputs.length - 1;
}

export function fixedSlot(node, name) {
  const inputs = node.inputs || [];
  for (let i = 0; i < inputs.length; i++) if (inputs[i]._fixed && inputs[i].name === name) return i;
  return -1;
}

export function fixedData(node, name) {
  const i = fixedSlot(node, name);
  return i < 0 ? undefined : node.getInputData(i);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Wrap onExecute so one broken node does not stop the graph; the node turns red. */
export function safeExec(proto) {
  const inner = proto.onExecute;
  proto.onExecute = function () {
    try {
      inner.call(this);
      if (this._err) { this._err = null; this.boxcolor = null; }
    } catch (e) {
      if (this._err !== String(e)) { this._err = String(e); console.error(this.title, e); }
      this.boxcolor = '#e55';
    }
  };
}

/** Draw a small status line below the widgets. */
export function infoLine(proto) {
  proto.onDrawForeground = function (ctx) {
    if (this.flags.collapsed || !this._info) return;
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#9aa0aa';
    ctx.textAlign = 'left';
    ctx.fillText(this._info, 10, this.size[1] - 6);
    ctx.restore();
  };
}

export function reserveInfo(node, minW = 200) {
  node._infoRow = true;
  node._minWidth = minW;
  const s = node.computeSize();
  node.size = [Math.max(s[0], minW), s[1] + 14];
}

/** Structural nodes: any change of the structural key rebuilds every skeleton. */
export function structuralKeyChanged(node, key) {
  if (node._skey === key) return false;
  const first = node._skey === undefined;
  node._skey = key;
  if (!first) runtime.markDirty();
  return !first;
}

export function markDirtyOnConnect(proto) {
  const inner = proto.onConnectionsChange;
  proto.onConnectionsChange = function (...args) {
    runtime.markDirty();
    if (inner) inner.apply(this, args);
  };
}

/** Standard onConfigure for any node using defineParams. */
export function configurable(proto) {
  const inner = proto.onConfigure;
  proto.onConfigure = function (info) {
    restoreParams(this);
    if (inner) inner.call(this, info);
  };
}

/** Everything a parameterised node needs, in one call. */
export function finish(proto, { info = true, dirty = false } = {}) {
  if (info) infoLine(proto);
  pinMenu(proto);
  configurable(proto);
  safeExec(proto);
  if (dirty) markDirtyOnConnect(proto);
}
