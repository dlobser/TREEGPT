// Example graphs, built programmatically. The "Basics" set are ports of the old
// sketches; the flower and insect packs live in ../../examples/.
import { mk, link, drive, at, HALF, PI } from './graph-build.js';
import { runtime } from './runtime.js';
import { FLOWERS } from '../../examples/flowers.js';
import { INSECTS } from '../../examples/insects.js';

const BASICS = [
  {
    name: 'Simple sway',
    build(g) {
      const root = mk(g, 'tree/root', [40, 60], { trunks: 1, joints: 15, length: 5, width: 1 });
      const br = mk(g, 'tree/branch', [300, 60], { joints: 7, rads: 3, angle: 1, length: 1, width: 1 });
      link(root, 'skeleton', br, 'skeleton');
      const selT = mk(g, 'tree/select', [300, 430], { joints: 'all but first' }, 'Select trunk');
      link(root, 'skeleton', selT, 'skeleton'); link(root, 'branches', selT, 'scope');
      const sineT = mk(g, 'field/sine', [40, 430], { attr: 'joint', freq: 0.6, amp: 0.04, phase: 1, speed: 2, 'scale by': 'joint' });
      const rotT = mk(g, 'tree/rotate', [580, 60]);
      link(br, 'skeleton', rotT, 'skeleton'); link(selT, 'selection', rotT, 'selection'); drive(sineT, 'field', rotT, 'rz');
      const sclT = mk(g, 'tree/scale', [580, 260], { mode: 'set', scale: 0.98 });
      link(rotT, 'skeleton', sclT, 'skeleton'); link(selT, 'selection', sclT, 'selection');
      const selB = mk(g, 'tree/select', [580, 500], { joints: 'all but first' }, 'Select branches');
      link(br, 'skeleton', selB, 'skeleton'); link(br, 'branches', selB, 'scope');
      const tilt = mk(g, 'value/slider', [40, 700], { name: 'tilt', min: -1, max: 1, value: 0 });
      const ramp = mk(g, 'field/ramp', [40, 840], { attr: 'order', slope: 0.4 });
      const sineB = mk(g, 'field/sine', [300, 840], { attr: 'joint', freq: 0.2, amp: 0.4, speed: -0.9 });
      drive(ramp, 'field', sineB, 'phase');
      const add = mk(g, 'field/math', [580, 840], { op: 'add' });
      drive(tilt, 'value', add, 'a'); drive(sineB, 'field', add, 'b');
      const rotB = mk(g, 'tree/rotate', [860, 60]);
      link(sclT, 'skeleton', rotB, 'skeleton'); link(selB, 'selection', rotB, 'selection'); drive(add, 'out', rotB, 'rx');
      const grow = mk(g, 'value/slider', [580, 1010], { name: 'grow', min: 0.9, max: 1.3, value: 1.12 });
      const sclB = mk(g, 'tree/scale', [860, 260], { mode: 'set' });
      link(rotB, 'skeleton', sclB, 'skeleton'); link(selB, 'selection', sclB, 'selection'); drive(grow, 'value', sclB, 'scale');
      const prev = mk(g, 'out/preview', [1140, 60]);
      link(sclB, 'skeleton', prev, 'skeleton');
      const tubes = mk(g, 'out/tubes', [1140, 230], { show: false });
      link(sclB, 'skeleton', tubes, 'skeleton');
    },
  },
  {
    name: 'Starfish',
    build(g) {
      const root = mk(g, 'tree/root', [40, 60], { trunks: 5, joints: 10, angle: HALF, length: 10, width: 1, 'rot x': HALF });
      const br = mk(g, 'tree/branch', [300, 60], { joints: 10, rads: 2, angle: 0.2, length: 1, width: 1 });
      link(root, 'skeleton', br, 'skeleton');
      const selT = mk(g, 'tree/select', [300, 430], { joints: 'all but first' }, 'Select arms');
      link(root, 'skeleton', selT, 'skeleton'); link(root, 'branches', selT, 'scope');
      const curl = mk(g, 'value/slider', [40, 430], { name: 'curl', min: -1, max: 1, value: 0.36 });
      const rotT = mk(g, 'tree/rotate', [580, 60]);
      link(br, 'skeleton', rotT, 'skeleton'); link(selT, 'selection', rotT, 'selection'); drive(curl, 'value', rotT, 'rx');
      const grow = mk(g, 'value/slider', [40, 570], { name: 'grow', min: 0.8, max: 1.3, value: 1.05 });
      const sclT = mk(g, 'tree/scale', [580, 260], { mode: 'set' });
      link(rotT, 'skeleton', sclT, 'skeleton'); link(selT, 'selection', sclT, 'selection'); drive(grow, 'value', sclT, 'scale');
      const selB = mk(g, 'tree/select', [580, 500], { joints: 'all but first' }, 'Select feathers');
      link(br, 'skeleton', selB, 'skeleton'); link(br, 'branches', selB, 'scope');
      const ramp = mk(g, 'field/ramp', [40, 760], { attr: 'order', slope: 1 });
      const sine = mk(g, 'field/sine', [300, 760], { attr: 'joint', freq: 0.2, amp: 0.5, phase: 1, speed: 1 });
      drive(ramp, 'field', sine, 'phase');
      const rotB = mk(g, 'tree/rotate', [860, 60]);
      link(sclT, 'skeleton', rotB, 'skeleton'); link(selB, 'selection', rotB, 'selection'); drive(sine, 'field', rotB, 'rx');
      const sclB = mk(g, 'tree/scale', [860, 260], { mode: 'set', scale: 1.1 });
      link(rotB, 'skeleton', sclB, 'skeleton'); link(selB, 'selection', sclB, 'selection');
      const prev = mk(g, 'out/preview', [1140, 60]);
      link(sclB, 'skeleton', prev, 'skeleton');
      const tubes = mk(g, 'out/tubes', [1140, 230], { show: false });
      link(sclB, 'skeleton', tubes, 'skeleton');
    },
  },
  {
    name: 'Tentacles',
    build(g) {
      const root = mk(g, 'tree/root', [40, 60], { trunks: 1, joints: 1, length: 0.1, width: 2 });
      const b2 = mk(g, 'tree/branch', [300, 60], { joints: 10, rads: 10, angle: HALF, length: 10, width: 2 }, 'Arms');
      link(root, 'skeleton', b2, 'skeleton');
      const b3 = mk(g, 'tree/branch', [560, 60], { joints: 5, rads: 1, angle: 0, length: 5, width: 2 }, 'Tips');
      link(b2, 'skeleton', b3, 'skeleton');
      const sel2 = mk(g, 'tree/select', [560, 420], { joints: 'all' }, 'Select arms');
      link(b2, 'skeleton', sel2, 'skeleton'); link(b2, 'branches', sel2, 'scope');
      const ramp2 = mk(g, 'field/ramp', [40, 420], { attr: 'order', slope: 2.3 });
      const sine2 = mk(g, 'field/sine', [300, 420], { attr: 'joint', freq: 0.8, amp: 0.1, phase: 1, speed: 1, offset: -0.35 });
      drive(ramp2, 'field', sine2, 'phase');
      const rot2 = mk(g, 'tree/rotate', [840, 60]);
      link(b3, 'skeleton', rot2, 'skeleton'); link(sel2, 'selection', rot2, 'selection'); drive(sine2, 'field', rot2, 'rz');
      const scl2 = mk(g, 'tree/scale', [840, 260], { mode: 'set', scale: 0.9 });
      link(rot2, 'skeleton', scl2, 'skeleton'); link(sel2, 'selection', scl2, 'selection');
      const sel3 = mk(g, 'tree/select', [840, 500], { joints: 'all but first' }, 'Select tips');
      link(b3, 'skeleton', sel3, 'skeleton'); link(b3, 'branches', sel3, 'scope');
      const wave = mk(g, 'value/slider', [40, 720], { name: 'wave', min: -1.5, max: 1.5, value: 0.35 });
      const ramp3 = mk(g, 'field/ramp', [40, 860], { attr: 'order', slope: 2.3 });
      const sine3 = mk(g, 'field/sine', [300, 860], { attr: 'joint', freq: 0.7, amp: 0.5, phase: 1, speed: 3 });
      drive(ramp3, 'field', sine3, 'phase');
      const add3 = mk(g, 'field/math', [560, 860], { op: 'add' });
      drive(wave, 'value', add3, 'a'); drive(sine3, 'field', add3, 'b');
      const rot3 = mk(g, 'tree/rotate', [1120, 60]);
      link(scl2, 'skeleton', rot3, 'skeleton'); link(sel3, 'selection', rot3, 'selection'); drive(add3, 'out', rot3, 'rz');
      const scl3 = mk(g, 'tree/scale', [1120, 260], { mode: 'set', scale: 0.8 });
      link(rot3, 'skeleton', scl3, 'skeleton'); link(sel3, 'selection', scl3, 'selection');
      const prev = mk(g, 'out/preview', [1400, 60]);
      link(scl3, 'skeleton', prev, 'skeleton');
      const tubes = mk(g, 'out/tubes', [1400, 230], { show: false });
      link(scl3, 'skeleton', tubes, 'skeleton');
    },
  },
  {
    name: 'Wing (lofted)',
    build(g) {
      // one short stem, a fan of veins, then a membrane woven between them
      const root = mk(g, 'tree/root', [40, 60], { trunks: 1, joints: 1, length: 1, width: 1 });
      const veins = mk(g, 'tree/branch', [300, 60], { joints: 8, rads: 9, angle: 0.9, spread: 0, length: 7, width: 0.7, taper: 0.97 }, 'Veins');
      link(root, 'skeleton', veins, 'skeleton');
      const selV = mk(g, 'tree/select', [300, 430], { joints: 'all but first' }, 'Select veins');
      link(veins, 'skeleton', selV, 'skeleton'); link(veins, 'branches', selV, 'scope');
      // fan the veins out and curve them
      const fan = mk(g, 'field/expression', [40, 430], { expr: '(across - 0.5) * 2.2' }, 'Fan');
      const rotFan = mk(g, 'tree/rotate', [580, 60], { mode: 'add' }, 'Fan out');
      link(veins, 'skeleton', rotFan, 'skeleton'); link(veins, 'branches', rotFan, 'selection'); drive(fan, 'field', rotFan, 'ry');
      const curve = mk(g, 'field/sine', [40, 650], { attr: 'joint', freq: 0.25, amp: 0.09, phase: 1, speed: 0.6 }, 'Curve');
      const rotV = mk(g, 'tree/rotate', [580, 260]);
      link(rotFan, 'skeleton', rotV, 'skeleton'); link(selV, 'selection', rotV, 'selection'); drive(curve, 'field', rotV, 'rz');
      // shorten the outer veins so the wing gets a shaped edge
      const shape = mk(g, 'field/expression', [40, 860], { expr: '7 * (0.45 + 0.55 * sin(across * PI))' }, 'Vein length');
      const size = mk(g, 'tree/size', [580, 470], { mode: 'set' });
      link(rotV, 'skeleton', size, 'skeleton'); link(selV, 'selection', size, 'selection'); drive(shape, 'field', size, 'length');

      const loft = mk(g, 'surface/loft', [880, 60], { span: 'pairs', 'divide u': 14, 'divide v': 5, 'skip base': 1 });
      link(size, 'skeleton', loft, 'skeleton'); link(veins, 'branches', loft, 'ribs');
      const warp = mk(g, 'surface/warp', [880, 400], {
        normal: 'sin(u * PI) * sin(v * PI) * 1.5',
        'along u': 'noise(x * 0.15, y * 0.15, z * 0.15) * u * 1.2',
        'along v': '0',
        radius: '0.25 + 0.75 * (1 - u)',
      });
      link(loft, 'curves', warp, 'curves');
      const ctubes = mk(g, 'surface/tubes', [1180, 400], { direction: 'both', 'radial segs': 5, 'radius x': 0.5, 'min radius': 0.08 });
      link(warp, 'curves', ctubes, 'curves');
      const prev = mk(g, 'out/preview', [1180, 60], { show: false });
      link(size, 'skeleton', prev, 'skeleton');
      const tubes = mk(g, 'out/tubes', [1180, 190], { 'radial segs': 6 });
      link(size, 'skeleton', tubes, 'skeleton');
      const merge = mk(g, 'out/merge', [1460, 190]);
      link(tubes, 'mesh', merge, 'mesh 1'); link(ctubes, 'mesh', merge, 'mesh 2');
      const iso = mk(g, 'out/isosurface', [1460, 420], { resolution: 180, blend: 1.2, smooth: 2, 'curve radius': 0.3, show: false });
      link(size, 'skeleton', iso, 'skeleton'); link(warp, 'curves', iso, 'curves');
      const exp = mk(g, 'out/export', [1740, 300], { format: 'stl', name: 'wing' });
      link(merge, 'mesh', exp, 'mesh');
    },
  },
  {
    name: 'Sierpinski',
    build(g) {
      const root = mk(g, 'tree/root', [40, 60], { trunks: 3, joints: 1, angle: 1, length: 10, width: 0.8 });
      let prevNode = root;
      const x = 300;
      for (let lvl = 0; lvl < 4; lvl++) {
        const spread = mk(g, 'value/slider', [x + lvl * 520, 380], { name: 'level ' + (lvl + 1), min: -1.5, max: 1.5, value: 0 });
        const rot = mk(g, 'tree/rotate', [x + lvl * 520, 60]);
        link(prevNode, 'skeleton', rot, 'skeleton'); drive(spread, 'value', rot, 'rz');
        const br = mk(g, 'tree/branch', [x + 260 + lvl * 520, 60], { joints: 1, rads: 3, angle: 1, length: 10 - lvl * 2, width: 0.8 - lvl * 0.15 });
        link(rot, 'skeleton', br, 'skeleton');
        prevNode = br;
      }
      const lfo = mk(g, 'value/lfo', [x + 4 * 520, 380], { freq: 0.1, amp: 0.6 });
      const rot = mk(g, 'tree/rotate', [x + 4 * 520, 60]);
      link(prevNode, 'skeleton', rot, 'skeleton'); drive(lfo, 'value', rot, 'rz');
      const prev = mk(g, 'out/preview', [x + 4 * 520 + 260, 60]);
      link(rot, 'skeleton', prev, 'skeleton');
    },
  },
  {
    name: 'Print: isosurface',
    build(g) {
      const root = mk(g, 'tree/root', [40, 60], { trunks: 1, joints: 30, length: 4, width: 1.2 });
      const br = mk(g, 'tree/branch', [300, 60], { joints: 15, rads: 2, angle: 0.2, length: 2, width: 0.8, every: 6 });
      link(root, 'skeleton', br, 'skeleton');
      const selT = mk(g, 'tree/select', [300, 430], { joints: 'all but first' }, 'Select trunk');
      link(root, 'skeleton', selT, 'skeleton'); link(root, 'branches', selT, 'scope');
      const sineT = mk(g, 'field/sine', [40, 430], { attr: 'joint', freq: 0.3, amp: 0.04, phase: 1, speed: 2, 'scale by': 'joint' });
      const rotT = mk(g, 'tree/rotate', [580, 60]);
      link(br, 'skeleton', rotT, 'skeleton'); link(selT, 'selection', rotT, 'selection'); drive(sineT, 'field', rotT, 'rz');
      const sclT = mk(g, 'tree/scale', [580, 260], { mode: 'set', scale: 0.98 });
      link(rotT, 'skeleton', sclT, 'skeleton'); link(selT, 'selection', sclT, 'selection');
      const selB = mk(g, 'tree/select', [580, 500], { joints: 'all but first' }, 'Select branches');
      link(br, 'skeleton', selB, 'skeleton'); link(br, 'branches', selB, 'scope');
      const ramp = mk(g, 'field/ramp', [40, 760], { attr: 'order', slope: 0.4 });
      const sineB = mk(g, 'field/sine', [300, 760], { attr: 'joint', freq: 0.25, amp: 0.4, speed: -0.5 });
      drive(ramp, 'field', sineB, 'phase');
      const rotB = mk(g, 'tree/rotate', [860, 60]);
      link(sclT, 'skeleton', rotB, 'skeleton'); link(selB, 'selection', rotB, 'selection'); drive(sineB, 'field', rotB, 'rx');
      const sclB = mk(g, 'tree/scale', [860, 260], { mode: 'set', scale: 1.04 });
      link(rotB, 'skeleton', sclB, 'skeleton'); link(selB, 'selection', sclB, 'selection');
      const prev = mk(g, 'out/preview', [1140, 60], { show: false });
      link(sclB, 'skeleton', prev, 'skeleton');
      const iso = mk(g, 'out/isosurface', [1140, 230], { resolution: 96, blend: 1, smooth: 3 });
      link(sclB, 'skeleton', iso, 'skeleton');
      const exp = mk(g, 'out/export', [1420, 230], { format: 'stl', scale: 1, name: 'tree' });
      link(iso, 'mesh', exp, 'mesh');
    },
  },
];

for (const p of BASICS) p.group = p.group || 'Basics';

export const PRESETS = [...BASICS, ...FLOWERS, ...INSECTS];

export function buildPreset(graph, preset) {
  graph.clear();
  preset.build(graph);
  if (runtime.viewer) runtime.viewer.prune(graph);
}
