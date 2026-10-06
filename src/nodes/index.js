// Registers every node type and describes the palette.
import { COLORS } from './common.js';

export function registerNodes() {
  // common.js (imported by every node module) clears litegraph's stock nodes first
  return Promise.all([
    import('./structure.js'),
    import('./select.js'),
    import('./transform.js'),
    import('./fields.js'),
    import('./values.js'),
    import('./surface.js'),
    import('./output.js'),
  ]);
}

export const PALETTE = [
  { name: 'Structure', color: COLORS.structure[0], items: [['tree/root', 'Root'], ['tree/branch', 'Branch']] },
  { name: 'Select', color: COLORS.select[0], items: [['tree/select', 'Select']] },
  { name: 'Transform', color: COLORS.transform[0], items: [['tree/rotate', 'Rotate'], ['tree/translate', 'Translate'], ['tree/scale', 'Scale'], ['tree/size', 'Size']] },
  { name: 'Fields', color: COLORS.field[0], items: [['field/sine', 'Sine'], ['field/noise', 'Noise'], ['field/ramp', 'Ramp'], ['field/random', 'Random'], ['field/attribute', 'Attribute'], ['field/math', 'Math'], ['field/function', 'Function'], ['field/map', 'Map range'], ['field/expression', 'Expression']] },
  { name: 'Values', color: COLORS.value[0], items: [['value/slider', 'Slider'], ['value/number', 'Number'], ['value/time', 'Time'], ['value/lfo', 'LFO']] },
  { name: 'Surface', color: COLORS.surface[0], items: [['surface/loft', 'Loft'], ['surface/warp', 'Warp'], ['surface/tubes', 'Curve Tubes'], ['surface/mesh', 'Surface'], ['surface/join', 'Join Curves']] },
  { name: 'Output', color: COLORS.output[0], items: [['out/preview', 'Preview'], ['out/tubes', 'Tubes'], ['out/isosurface', 'Isosurface'], ['out/merge', 'Merge'], ['out/export', 'Export']] },
];
