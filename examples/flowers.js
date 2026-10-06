// ============================================================================
// flowers.js — twelve flowers, each trying a different idea.
//
// The shared recipe: a petal is a *spine* with *ribs* crossing it. Rib length is
// an expression over `pfrac` (how far along the spine the rib sprouts), so the
// petal grows and shrinks along its length. Ribs sit at spread = PI/2 so they lie
// across the petal rather than edge-on, and their curl is mirrored between the
// two spokes so the petal cups instead of twisting. Each petal's ribs are lofted
// on their own thanks to `group by: parent branch`.
//
// Everything ends at an Isosurface so it comes out as one watertight print.
// ============================================================================

import { mk, link, drive, at, expr, slider, select, xform, attach, petals, outputs, PI, HALF, TAU, GOLDEN } from '../src/app/graph-build.js';

// golden-angle spin that cancels the Branch node's own even spacing
const PHYLLO = `order * ${GOLDEN.toFixed(9)} - order * 2 * PI / orders`;

export const FLOWERS = [

// ---------------------------------------------------------------------------
{
  name: 'Lily',
  slug: '01-moonlit-lily',
  color: '#e8e2d6',
  desc: 'Six recurved tepals over six drooping stamens with heavy anthers.',
  group: 'Flowers',
  build(g) {
    // Six recurved tepals, a green ovary, and six stamens with heavy anthers.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 7, length: 1.7, width: 0.34, taper: 0.98 }, 'Stem');
    const p = petals(g, 1, stem, {
      name: 'Tepals', count: 6, tilt: 0.75, joints: 10, len: 0.85, wid: 0.2, taper: 0.985,
      ribJoints: 3, ribLen: 0.7, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.7) * PI) * 1.55',
      curve: '0.055 + along * 0.13',          // recurves harder toward the tip
      cup: '0.3 * (1 - along)',
      nu: 9, nv: 36,
    });

    // stamens: a filament that droops, tipped with a fat anther
    const top = select(g, at(p.col, 3), p.head, stem, { joints: 'last' }, 'stem top');
    const fil = mk(g, 'tree/branch', at(p.col, 0), { joints: 7, rads: 6, angle: 0.28, spread: 0.5, length: 0.55, width: 0.11 }, 'Stamens');
    link(p.head, 'skeleton', fil, 'skeleton'); attach(top, fil);
    const selFil = select(g, at(p.col, 1), fil, fil, { joints: 'all but first' }, 'filament');
    const droop = xform(g, at(p.col + 1, 0), 'tree/rotate', fil, selFil, { rz: 'along * 0.22' }, 'add', at(p.col + 1, 1), 'Droop');
    const selTip = select(g, at(p.col + 1, 2), droop, fil, { joints: 'last' }, 'anther');
    const anther = xform(g, at(p.col + 2, 0), 'tree/size', droop, selTip, { width: 0.34, length: 0.75 }, 'set', null, 'Anthers');

    // ovary at the throat
    const ovary = xform(g, at(p.col + 3, 0), 'tree/size', anther, top, { width: 0.75 }, 'set', null, 'Ovary');

    outputs(g, p.col + 4, ovary, p.join, { name: 'lily', res: 230, curveRadius: 0.14, blend: 1.15, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Rose',
  slug: '02-spiral-rose',
  color: '#e0b3bd',
  desc: 'Twenty-four petals on the golden angle, opening and growing outward from a furled core.',
  group: 'Flowers',
  build(g) {
    // Phyllotaxis: 24 petals on the golden angle, opening and growing outward.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 4, length: 0.8, width: 0.5 }, 'Stem');
    const p = petals(g, 1, stem, {
      name: 'Petals', count: 24, tilt: 0.15, joints: 8, len: 0.6, wid: 0.16, taper: 0.99,
      ribJoints: 3, ribLen: 0.6, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.55) * PI) * 1.6',
      spinExpr: PHYLLO,
      curve: '0.06 + along * 0.055',
      cup: '0.55 * (1 - along * 0.6)',        // deep cup, relaxing toward the edge
      nu: 12, nv: 36,
    });

    // outer petals open out and grow; inner ones stay furled and small
    const selBase = select(g, at(p.col, 1), p.head, p.spines, { joints: 'first' }, 'petal base');
    const open = xform(g, at(p.col, 0), 'tree/rotate', p.head, selBase, { rz: 'pow(across, 1.4) * 0.85' }, 'add', at(p.col, 2), 'Open out');
    const selAll = select(g, at(p.col + 1, 1), open, p.spines, { joints: 'all' }, 'petal joints');
    const grow = xform(g, at(p.col + 1, 0), 'tree/scale', open, selBase, { scale: 'mix(0.42, 1.15, pow(across, 0.8))' }, 'set', at(p.col + 1, 2), 'Grow outward');

    // lift the inner petals so the bud has a centre
    const lift = xform(g, at(p.col + 2, 0), 'tree/translate', grow, selBase, { ty: '(1 - across) * 0.5' }, 'add', at(p.col + 2, 1), 'Centre lift');

    outputs(g, p.col + 3, lift, p.join, { name: 'rose', res: 250, curveRadius: 0.15, blend: 1.2, minRadius: 0 , specks: 400});
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Daisy',
  slug: '03-disc-daisy',
  color: '#f0ead8',
  desc: 'Flat ray florets around a domed phyllotactic disc of pollen knobs.',
  group: 'Flowers',
  build(g) {
    // A composite: flat ray florets round a domed phyllotactic disc.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 8, length: 1.5, width: 0.3 }, 'Stem');

    const p = petals(g, 1, stem, {
      name: 'Rays', count: 26, tilt: 1.42, joints: 9, len: 0.72, wid: 0.12, taper: 0.995,
      ribJoints: 2, ribLen: 0.45, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.45) * PI) * 0.72 * (1 - 0.35 * pfrac)',
      spinExpr: PHYLLO,
      curve: '-0.035 - along * 0.05',
      cup: '0.18',
      nu: 6, nv: 36,
    });

    // disc florets: a dome of stubby tubes, each a little deeper toward the rim
    const top = select(g, at(p.col, 3), p.head, stem, { joints: 'last' }, 'stem top');
    const disc = mk(g, 'tree/branch', at(p.col, 0), { joints: 2, rads: 90, angle: 0.02, length: 0.3, width: 0.13 }, 'Disc florets');
    link(p.head, 'skeleton', disc, 'skeleton'); attach(top, disc);
    const selDisc = select(g, at(p.col, 1), disc, disc, { joints: 'first' }, 'floret base');
    const dome = xform(g, at(p.col + 1, 0), 'tree/rotate', disc, selDisc, { rz: 'pow(across, 0.62) * 1.42', ry: PHYLLO }, 'add', at(p.col + 1, 1), 'Dome');
    const selAllDisc = select(g, at(p.col + 2, 1), dome, disc, { joints: 'all' }, 'floret joints');
    const florets = xform(g, at(p.col + 2, 0), 'tree/size', dome, selAllDisc, { length: 'mix(0.32, 0.8, across)' }, 'set', at(p.col + 2, 2), 'Floret depth');
    const selTips = select(g, at(p.col + 3, 1), florets, disc, { joints: 'last' }, 'floret tips');
    const knobs = xform(g, at(p.col + 3, 0), 'tree/size', florets, selTips, { width: 0.2 }, 'set', null, 'Pollen knobs');

    outputs(g, p.col + 4, knobs, p.join, { name: 'daisy', res: 250, curveRadius: 0.13, blend: 1.1, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Foxglove',
  slug: '04-bell-foxglove',
  color: '#d8b7dd',
  desc: 'A raceme of nodding bells, each a closed loft flared at the mouth.',
  group: 'Flowers',
  build(g) {
    // A raceme of hanging bells. Each bell is a *closed* loft: eight ribs from one
    // point, splayed, wrapped round by `closed`, flaring at the mouth.
    const stalk = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 16, length: 1.3, width: 0.34, taper: 0.99 }, 'Spike');
    const selStalk = select(g, at(0, 1), stalk, stalk, { joints: 'all but first' }, 'spike joints');
    const lean = xform(g, at(1, 0), 'tree/rotate', stalk, selStalk, { rz: '0.035' }, 'add', at(1, 1), 'Lean');

    // pedicels: one short stem per flower, alternating round the spike
    const ped = mk(g, 'tree/branch', at(2, 0), { joints: 2, rads: 1, angle: 1.15, length: 0.6, width: 0.12, every: 1, start: 3 }, 'Pedicels');
    link(lean, 'skeleton', ped, 'skeleton');
    const selPed = select(g, at(2, 1), ped, ped, { joints: 'first' }, 'pedicel base');
    const spiral = xform(g, at(3, 0), 'tree/rotate', ped, selPed, { ry: 'order * 2.39996' }, 'add', at(3, 1), 'Spiral round spike');
    const selPedAll = select(g, at(4, 1), spiral, ped, { joints: 'all but first' }, 'pedicel joints');
    const nod = xform(g, at(4, 0), 'tree/rotate', spiral, selPedAll, { rz: '0.55' }, 'add', at(4, 2), 'Nod over');

    // the bell: ribs from the pedicel tip, splayed into a cone
    const bell = mk(g, 'tree/branch', at(5, 0), { joints: 6, rads: 9, angle: 0.2, length: 0.42, width: 0.06, start: -1, end: -1 }, 'Bell ribs');
    link(nod, 'skeleton', bell, 'skeleton');
    const selBell = select(g, at(5, 1), bell, bell, { joints: 'all but first' }, 'bell joints');
    const flare = xform(g, at(6, 0), 'tree/rotate', bell, selBell, { rz: 'pow(along, 2.2) * 0.55' }, 'add', at(6, 1), 'Flare the mouth');
    const belly = xform(g, at(7, 0), 'tree/size', flare, selBell, { length: '0.42 * (1 + sin(along * PI) * 0.55)' }, 'set', at(7, 1), 'Belly');

    const loft = mk(g, 'surface/loft', at(8, 0), { span: 'whole set', closed: true, 'divide u': 16, 'divide v': 26, 'group by': 'parent branch' }, 'Bell surfaces');
    link(belly, 'skeleton', loft, 'skeleton'); link(bell, 'branches', loft, 'ribs');

    outputs(g, 9, belly, loft, { name: 'foxglove', res: 250, curveRadius: 0.1, blend: 1.15, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Orchid',
  slug: '05-lip-orchid',
  color: '#e6c7e8',
  desc: 'Bilateral, not radial: one tepal becomes a broad lip and the column twists in the throat.',
  group: 'Flowers',
  build(g) {
    // Bilateral, not radial: one petal in five becomes the lip, using `order` to
    // single it out, and the whole flower faces forward.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 5, length: 1.4, width: 0.3, 'rot z': 0.5 }, 'Stem');
    const p = petals(g, 1, stem, {
      name: 'Tepals', count: 5, tilt: 1.25, spin: 0.35, joints: 8, len: 0.72, wid: 0.15, taper: 0.99,
      ribJoints: 3, ribLen: 0.7, ribWid: 0.02,
      // order 0 is the lip: much broader and blunter than the other four
      outline: 'order == 0 ? sin(pow(pfrac, 0.45) * PI) * 2.6 : sin(pow(pfrac, 0.85) * PI) * 1.2',
      curve: 'order == 0 ? 0.14 + along * 0.12 : -0.03',
      cup: 'order == 0 ? 0.62 * (1 - along) : 0.12',
      nu: 12, nv: 34,
    });
    // the lip hangs, the others stand back
    const selBase = select(g, at(p.col, 1), p.head, p.spines, { joints: 'first' }, 'tepal base');
    const pose = xform(g, at(p.col, 0), 'tree/rotate', p.head, selBase, { rz: 'order == 0 ? 0.5 : -0.25' }, 'add', at(p.col, 2), 'Lip forward');
    const sizeUp = xform(g, at(p.col + 1, 0), 'tree/scale', pose, selBase, { scale: 'order == 0 ? 1.25 : 1' }, 'set', at(p.col + 1, 1), 'Lip larger');

    // the column: a short twisted spike in the throat
    const top = select(g, at(p.col + 2, 2), sizeUp, stem, { joints: 'last' }, 'stem top');
    const col = mk(g, 'tree/branch', at(p.col + 2, 0), { joints: 5, rads: 1, angle: 0.55, length: 0.38, width: 0.24 }, 'Column');
    link(sizeUp, 'skeleton', col, 'skeleton'); attach(top, col);
    const selCol = select(g, at(p.col + 2, 1), col, col, { joints: 'all but first' }, 'column joints');
    const twist = xform(g, at(p.col + 3, 0), 'tree/rotate', col, selCol, { ry: '0.5', rz: '-0.2' }, 'add', at(p.col + 3, 1), 'Twist');

    outputs(g, p.col + 4, twist, p.join, { name: 'orchid', res: 250, curveRadius: 0.14, blend: 1.2, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Iris',
  slug: '06-parity-iris',
  color: '#b9b6e0',
  desc: 'Six tepals from one branch, split by parity into arching falls and upright standards.',
  group: 'Flowers',
  build(g) {
    // Six tepals from one Branch, split by parity: the even ones fall and flare,
    // the odd ones stand up and close over the centre.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 6, length: 1.6, width: 0.36 }, 'Stem');
    const p = petals(g, 1, stem, {
      name: 'Tepals', count: 6, tilt: 0.8, joints: 10, len: 0.78, wid: 0.19, taper: 0.99,
      ribJoints: 3, ribLen: 0.8, ribWid: 0.02,
      outline: 'order % 2 == 0 ? sin(pow(pfrac, 0.5) * PI) * 2.2 : sin(pow(pfrac, 0.9) * PI) * 1.45',
      // falls arch over and hang; standards curl inward
      curve: 'order % 2 == 0 ? 0.02 + pow(along, 1.6) * 0.3 : -0.16 * along',
      cup: 'order % 2 == 0 ? 0.2 : 0.45',
      nu: 12, nv: 42,
    });
    const selBase = select(g, at(p.col, 1), p.head, p.spines, { joints: 'first' }, 'tepal base');
    const split = xform(g, at(p.col, 0), 'tree/rotate', p.head, selBase, { rz: 'order % 2 == 0 ? 0.45 : -0.72' }, 'add', at(p.col, 2), 'Falls / standards');

    // the beard: a fuzzy ridge of short hairs along each fall's midrib
    const selFalls = select(g, at(p.col + 1, 1), split, p.spines, { joints: 'range', from: 1, to: 5, filter: 'order % 2 == 0' }, 'fall midribs');
    const beard = mk(g, 'tree/branch', at(p.col + 1, 0), { joints: 2, rads: 3, angle: 0.9, spread: HALF, length: 0.2, width: 0.075 }, 'Beard');
    link(split, 'skeleton', beard, 'skeleton'); link(selFalls, 'selection', beard, 'at');
    const selBeard = select(g, at(p.col + 2, 1), beard, beard, { joints: 'all' }, 'beard hairs');
    const fuzz = xform(g, at(p.col + 2, 0), 'tree/size', beard, selBeard, { length: '0.12 + hash(branch) * 0.16' }, 'set', at(p.col + 2, 2), 'Ragged');

    outputs(g, p.col + 3, fuzz, p.join, { name: 'iris', res: 250, curveRadius: 0.14, blend: 1.2, minRadius: 0 , specks: 400});
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Datura trumpet',
  slug: '07-frilled-datura',
  color: '#efe7dc',
  desc: 'One closed trumpet whose rim is ruffled by a high-frequency warp.',
  group: 'Flowers',
  build(g) {
    // One big closed trumpet. The rim is frilled by a Warp running a high
    // frequency around the loft's v direction, which is what `weave` never did.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 4, length: 1.1, width: 0.4, 'rot z': 0.8 }, 'Stem');
    const ribs = mk(g, 'tree/branch', at(1, 0), { joints: 12, rads: 16, angle: 0.06, length: 0.4, width: 0.02, start: -1, end: -1 }, 'Trumpet ribs');
    link(stem, 'skeleton', ribs, 'skeleton');
    const selRib = select(g, at(1, 1), ribs, ribs, { joints: 'all but first' }, 'rib joints');
    // the classic trumpet profile: narrow throat, then an accelerating flare
    const flare = xform(g, at(2, 0), 'tree/rotate', ribs, selRib, { rz: 'pow(along, 2.6) * 0.62' }, 'add', at(2, 1), 'Flare');
    const waist = xform(g, at(3, 0), 'tree/size', flare, selRib, { length: '0.3 + pow(along, 2) * 0.55' }, 'set', at(3, 1), 'Lengthen outward');

    const loft = mk(g, 'surface/loft', at(4, 0), { span: 'whole set', closed: true, 'divide u': 26, 'divide v': 46, 'group by': 'parent branch' }, 'Trumpet');
    link(waist, 'skeleton', loft, 'skeleton'); link(ribs, 'branches', loft, 'ribs');

    const frill = slider(g, at(4, 2), 'frill', 0, 1.2, 0.55);
    const warp = mk(g, 'surface/warp', at(5, 0), {
      normal: 'sin(v * PI * 12) * pow(u, 5) * a',        // ruffles only near the rim
      'along u': 'pow(u, 4) * sin(v * PI * 6) * 0.22',
      'along v': '0',
      radius: '1',
    }, 'Frill the rim');
    link(loft, 'curves', warp, 'curves');
    link(frill, 'value', warp, 'a');

    outputs(g, 6, waist, warp, { name: 'datura', res: 240, curveRadius: 0.16, blend: 1.1, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Poppy',
  slug: '08-crumpled-poppy',
  color: '#e2766a',
  desc: 'Four broad tissue-paper petals crumpled by 3D noise, around a domed seed capsule.',
  group: 'Flowers',
  build(g) {
    // Four broad tissue-paper petals, crumpled by 3D noise in the Warp rather
    // than by anything in the skeleton.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 9, length: 1.15, width: 0.22, taper: 0.99 }, 'Stem');
    const wobble = xform(g, at(1, 0), 'tree/rotate',
      stem,
      select(g, at(1, 1), stem, stem, { joints: 'all but first' }, 'stem joints'),
      { rz: 'noise(joint * 0.55, 3.1, 0) * 0.14' }, 'add', at(1, 2), 'Hairy stem wobble');

    const p = petals(g, 2, wobble, {
      name: 'Petals', count: 4, tilt: 0.95, joints: 8, len: 0.72, wid: 0.13, taper: 0.99,
      ribJoints: 3, ribLen: 1, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.42) * PI) * 2.5',        // very broad, almost circular
      curve: '0.06 + along * 0.08',
      cup: '0.34 * (1 - along * 0.3)',
      nu: 14, nv: 40,
    });

    const crumple = slider(g, at(p.col, 2), 'crumple', 0, 1.2, 0.4);
    const warp = mk(g, 'surface/warp', at(p.col, 0), {
      normal: 'noise(x * 2.2, y * 2.2, z * 2.2) * a * sin(u * PI) * 0.6',
      'along u': 'noise(x * 1.5 + 9, y * 1.5, z * 1.5) * a * 0.28',
      'along v': 'noise(x * 1.5, y * 1.5 + 4, z * 1.5) * a * 0.28',
      radius: '0.55 + 0.45 * sin(u * PI)',
    }, 'Crumple');
    link(p.join, 'curves', warp, 'curves');
    link(crumple, 'value', warp, 'a');

    // the seed capsule and its ring of stigma rays
    const selTop = select(g, at(p.col + 1, 1), p.head, stem, { joints: 'last' }, 'stem top');
    const cap = mk(g, 'tree/branch', at(p.col + 1, 0), { joints: 3, rads: 1, angle: 0, length: 0.3, width: 0.75 }, 'Capsule');
    link(p.head, 'skeleton', cap, 'skeleton'); attach(selTop, cap);
    const selCap = select(g, at(p.col + 2, 1), cap, cap, { joints: 'all' }, 'capsule joints');
    const dome = xform(g, at(p.col + 2, 0), 'tree/size', cap, selCap, { width: '0.8 * sin((0.35 + along * 0.6) * PI)' }, 'set', at(p.col + 2, 2), 'Dome it');
    const rays = mk(g, 'tree/branch', at(p.col + 3, 0), { joints: 2, rads: 12, angle: 1.5, length: 0.22, width: 0.06, start: -1, end: -1 }, 'Stigma rays');
    link(dome, 'skeleton', rays, 'skeleton');

    outputs(g, p.col + 4, rays, warp, { name: 'poppy', res: 250, curveRadius: 0.17, blend: 1.15, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Protea',
  slug: '09-whorled-protea',
  color: '#dba68c',
  desc: 'Three concentric whorls of stiff pointed bracts around a seventy-style pincushion.',
  group: 'Flowers',
  build(g) {
    // Three concentric whorls of stiff pointed bracts, each shorter and steeper
    // than the last, around a dense pincushion.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 5, length: 1.0, width: 0.6 }, 'Stem');

    let top = null;
    const ring = (col, prev, o) => petals(g, col, prev, {
      ribJoints: 3, ribWid: 0.02, nu: 12, nv: 40,
      cup: '0.42', at: top, ...o,
    });

    const a = ring(1, stem, {
      name: 'Outer bracts', count: 13, tilt: 1.15, joints: 9, len: 0.62, wid: 0.16, ribLen: 0.5,
      outline: 'pow(sin(pow(pfrac, 0.5) * PI), 1.4) * 2.5 * (1 - pfrac * 0.5)',
      curve: '-0.02 - along * 0.03',
    });
    top = select(g, at(a.col, 4), a.head, stem, { joints: 'last' }, 'stem top');
    const b = ring(a.col, a.head, {
      name: 'Mid bracts', count: 11, tilt: 0.8, joints: 8, len: 0.6, wid: 0.15, ribLen: 0.45,
      outline: 'pow(sin(pow(pfrac, 0.5) * PI), 1.5) * 2.0 * (1 - pfrac * 0.55)',
      curve: '-0.01',
      spinExpr: '0.24',
    });
    const c = ring(b.col, b.head, {
      name: 'Inner bracts', count: 9, tilt: 0.45, joints: 7, len: 0.58, wid: 0.14, ribLen: 0.4,
      outline: 'pow(sin(pow(pfrac, 0.5) * PI), 1.6) * 1.6 * (1 - pfrac * 0.6)',
      curve: '0.02',
      spinExpr: '0.48',
    });

    // pincushion of styles
    const pins = mk(g, 'tree/branch', at(c.col, 0), { joints: 7, rads: 70, angle: 0.05, length: 0.42, width: 0.055 }, 'Styles');
    link(c.head, 'skeleton', pins, 'skeleton'); attach(top, pins);
    const selPin = select(g, at(c.col, 1), pins, pins, { joints: 'first' }, 'style base');
    const cushion = xform(g, at(c.col + 1, 0), 'tree/rotate', pins, selPin, { rz: 'pow(across, 0.62) * 0.95', ry: PHYLLO }, 'add', at(c.col + 1, 1), 'Cushion');
    const selPinTip = select(g, at(c.col + 2, 1), cushion, pins, { joints: 'last' }, 'style tips');
    const tips = xform(g, at(c.col + 2, 0), 'tree/size', cushion, selPinTip, { width: 0.13 }, 'set', null, 'Knobbed tips');

    const join = mk(g, 'surface/join', at(c.col + 3, 1), {}, 'All bracts');
    link(a.join, 'curves', join, 'curves 1');
    link(b.join, 'curves', join, 'curves 2');
    link(c.join, 'curves', join, 'curves 3');

    outputs(g, c.col + 4, tips, join, { name: 'protea', res: 200, curveRadius: 0.14, blend: 1.15, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Fuchsia',
  slug: '10-pendant-fuchsia',
  color: '#d98fb0',
  desc: 'A hanging lantern: reflexed sepals, an inner corolla and long weighted stamens.',
  group: 'Flowers',
  build(g) {
    // A pendant flower: everything droops. The droop accumulates with `along`,
    // so each joint adds a little more fall, like weight down a chain.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 6, length: 0.95, width: 0.28, 'rot z': PI }, 'Hanging stem');

    // four reflexed sepals that flip right back up
    const sep = petals(g, 1, stem, {
      name: 'Sepals', count: 4, tilt: 0.95, joints: 9, len: 0.62, wid: 0.12, taper: 0.99,
      ribJoints: 3, ribLen: 0.55, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.6) * PI) * 1.45',
      curve: '-0.02 - pow(along, 1.5) * 0.34',       // reflexes hard backward
      cup: '0.22',
      nu: 10, nv: 34,
    });

    // the skirt: a shorter closed whorl inside the sepals
    const tip = select(g, at(sep.col, 4), sep.head, stem, { joints: 'last' }, 'stem tip');
    const skirt = petals(g, sep.col, sep.head, {
      at: tip,
      name: 'Corolla', count: 8, tilt: 0.28, joints: 8, len: 0.5, wid: 0.1, taper: 0.99,
      ribJoints: 3, ribLen: 0.5, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.7) * PI) * 1.1',
      curve: '0.075',
      cup: '0.35',
      spinExpr: '0.4',
      nu: 9, nv: 30,
      start: -1, end: -1,
    });

    // long stamens and a longer style, hanging below everything
    const sta = mk(g, 'tree/branch', at(skirt.col, 0), { joints: 9, rads: 9, angle: 0.14, length: 0.42, width: 0.07 }, 'Stamens');
    link(skirt.head, 'skeleton', sta, 'skeleton'); attach(tip, sta);
    const selSta = select(g, at(skirt.col, 1), sta, sta, { joints: 'all but first' }, 'stamen joints');
    const hang = xform(g, at(skirt.col + 1, 0), 'tree/rotate', sta, selSta,
      { rz: '(order % 3 == 0 ? 0.045 : 0.075) * joint' }, 'add', at(skirt.col + 1, 1), 'Weight');
    const selStaTip = select(g, at(skirt.col + 2, 1), hang, sta, { joints: 'last' }, 'anthers');
    const anth = xform(g, at(skirt.col + 2, 0), 'tree/size', hang, selStaTip, { width: 0.2 }, 'set', null, 'Anthers');

    const join = mk(g, 'surface/join', at(skirt.col + 3, 1), {}, 'Sepals + corolla');
    link(sep.join, 'curves', join, 'curves 1');
    link(skirt.join, 'curves', join, 'curves 2');

    outputs(g, skirt.col + 4, anth, join, { name: 'fuchsia', res: 250, curveRadius: 0.13, blend: 1.2, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Passionflower',
  slug: '11-corona-passionflower',
  color: '#c6b9e2',
  desc: 'A corona of one hundred and fifty banded filaments over ten flat tepals.',
  group: 'Flowers',
  build(g) {
    // The corona: 160 fine filaments in a flat ring, banded along their length.
    // Broad tepals sit under them and a raised gynophore rises through the middle.
    const stem = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 5, length: 1.0, width: 0.32 }, 'Stem');

    const p = petals(g, 1, stem, {
      name: 'Tepals', count: 10, tilt: 1.5, joints: 8, len: 0.62, wid: 0.13, taper: 0.995,
      ribJoints: 2, ribLen: 0.6, ribWid: 0.02,
      outline: 'sin(pow(pfrac, 0.55) * PI) * 0.95',
      curve: '-0.02',
      cup: '0.12',
      nu: 7, nv: 34,
    });

    const top = select(g, at(p.col, 3), p.head, stem, { joints: 'last' }, 'stem top');
    const fil = mk(g, 'tree/branch', at(p.col, 0), { joints: 10, rads: 150, angle: 1.42, length: 0.22, width: 0.045 }, 'Corona');
    link(p.head, 'skeleton', fil, 'skeleton'); attach(top, fil);
    const selFil = select(g, at(p.col, 1), fil, fil, { joints: 'all' }, 'filaments');
    // each filament waves a little, and they thicken in bands along their length
    const wave = xform(g, at(p.col + 1, 0), 'tree/rotate', fil, selFil,
      { rz: 'sin(joint * 0.9 + order * 0.7) * 0.09' }, 'add', at(p.col + 1, 1), 'Wave');
    const band = xform(g, at(p.col + 2, 0), 'tree/size', wave, selFil,
      { width: '0.045 + 0.06 * pow(abs(sin(along * PI * 3.5)), 3)' }, 'set', at(p.col + 2, 1), 'Bands');
    const curlUp = xform(g, at(p.col + 3, 0), 'tree/rotate', band,
      select(g, at(p.col + 3, 1), band, fil, { joints: 'range', from: 6, to: -1 }, 'filament tips'),
      { rz: '-0.16' }, 'add', at(p.col + 3, 2), 'Tips up');

    // gynophore: a column with five anthers and three styles
    const gyn = mk(g, 'tree/branch', at(p.col + 4, 0), { joints: 4, rads: 1, angle: 0, length: 0.34, width: 0.18 }, 'Gynophore');
    link(curlUp, 'skeleton', gyn, 'skeleton'); attach(top, gyn);
    const anthers = mk(g, 'tree/branch', at(p.col + 5, 0), { joints: 3, rads: 5, angle: 1.9, length: 0.3, width: 0.085, start: -1, end: -1 }, 'Anthers');
    link(gyn, 'skeleton', anthers, 'skeleton');
    const selAnth = select(g, at(p.col + 5, 1), anthers, anthers, { joints: 'last' }, 'anther tips');
    const pads = xform(g, at(p.col + 6, 0), 'tree/size', anthers, selAnth, { width: 0.22, length: 0.34 }, 'set', null, 'Anther pads');
    const gynTop = select(g, at(p.col + 7, 1), pads, gyn, { joints: 'last' }, 'gynophore top');
    const styles = mk(g, 'tree/branch', at(p.col + 7, 0), { joints: 3, rads: 3, angle: 1.2, length: 0.3, width: 0.09 }, 'Styles');
    link(pads, 'skeleton', styles, 'skeleton'); attach(gynTop, styles);

    outputs(g, p.col + 8, styles, p.join, { name: 'passionflower', res: 250, curveRadius: 0.12, blend: 1.1, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Echeveria',
  slug: '12-rosette-echeveria',
  color: '#b8cfa8',
  desc: 'A Fibonacci succulent rosette output as solid sheets rather than an isosurface.',
  group: 'Flowers',
  build(g) {
    // A succulent rosette. This one prints as a *solid sheet* from the Surface
    // node rather than as a blob of lofted curves, so the leaves have real
    // thickness and a crisp edge.
    const base = mk(g, 'tree/root', at(0, 0), { trunks: 1, joints: 2, length: 0.4, width: 0.8 }, 'Base');
    const p = petals(g, 1, base, {
      name: 'Leaves', count: 34, tilt: 0.2, joints: 9, len: 0.5, wid: 0.2, taper: 0.99,
      ribJoints: 3, ribLen: 0.6, ribWid: 0.02,
      outline: 'pow(sin(pow(pfrac, 0.5) * PI), 1.25) * 1.25 * (1 - pfrac * 0.45)',
      spinExpr: PHYLLO,
      curve: '0.04 + along * 0.045',
      cup: '0.4 * (1 - along * 0.5)',
      nu: 9, nv: 26,
    });
    const selBase = select(g, at(p.col, 1), p.head, p.spines, { joints: 'first' }, 'leaf base');
    // the rosette: outer leaves lie flat and long, inner ones stand up small
    const open = xform(g, at(p.col, 0), 'tree/rotate', p.head, selBase, { rz: 'pow(across, 1.25) * 1.5' }, 'add', at(p.col, 2), 'Open');
    const grow = xform(g, at(p.col + 1, 0), 'tree/scale', open, selBase, { scale: 'mix(0.3, 1.25, pow(across, 0.85))' }, 'set', at(p.col + 1, 1), 'Grow');
    const lift = xform(g, at(p.col + 2, 0), 'tree/translate', grow, selBase, { ty: '(1 - across) * 0.45' }, 'add', at(p.col + 2, 1), 'Stack');

    const thick = slider(g, at(p.col + 3, 2), 'leaf thickness', 0.03, 0.4, 0.13);
    const surf = mk(g, 'surface/mesh', at(p.col + 3, 0), { mode: 'solid', thickness: 0.13, color: '#b8cfa8' }, 'Solid leaves');
    link(p.join, 'curves', surf, 'curves');
    drive(thick, 'value', surf, 'thickness');

    const prev = mk(g, 'out/preview', at(p.col + 4, 0), { show: false }, 'Preview');
    link(lift, 'skeleton', prev, 'skeleton');
    const tubes = mk(g, 'out/tubes', at(p.col + 4, 1), { show: true, 'radial segs': 7, subdivide: 2, 'min radius': 0 }, 'Midribs');
    link(lift, 'skeleton', tubes, 'skeleton');
    const merge = mk(g, 'out/merge', at(p.col + 5, 0), {}, 'Merge');
    link(surf, 'mesh', merge, 'mesh 1'); link(tubes, 'mesh', merge, 'mesh 2');
    const exp = mk(g, 'out/export', at(p.col + 6, 0), { format: 'stl', name: 'echeveria' }, 'Export');
    link(merge, 'mesh', exp, 'mesh');
  },
},

];
