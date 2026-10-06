// ============================================================================
// insects.js — twelve insects, built like skeletons.
//
// The body plan: a *spine* runs the length of a body part, and hoop *ribs*
// spring from its dorsal midline and sweep down both flanks, so each
// cross-section is a closed ring. Rib length is an expression over `pfrac` —
// how far along the spine that rib sits — which is what gives a thorax its
// bulge and an abdomen its taper. The two flanks are lofted separately
// (`group by: parent branch` keeps one body's ribs together) and joined.
//
// Wings reuse the petal recipe: a spine with ribs across it is a vein with a
// membrane, whichever kingdom you are in.
//
// Legs are plain joint chains whose bend is a function of `joint`, so femur,
// tibia and tarsus come from one expression rather than three nodes. Which way
// they point is the fiddly part — the body runs along -X with the head at +X, so
// a leg pair wants `spin: HALF` to reach the flanks, and a knee needs the limb
// rolled a quarter turn before `rz` becomes a vertical hinge. `limb()` handles
// both; see its comment in src/app/graph-build.js.
//
// Sizing rule that matters: the isosurface closes a lofted sheet only when the
// grid spacing is under twice the `curve radius`, so broad panels want a fine
// grid. See the README.
// ============================================================================

import { mk, link, drive, at, expr, slider, select, xform, attach, petals, ribbedBody, limb, outputs, PI, HALF, TAU, GOLDEN } from '../src/app/graph-build.js';

// A wing plan. The old outlines were half a sine wave, which comes to a point
// at the tip the way a dagger does; a real wing is blunt there. This is a
// superellipse instead — `round` sets how square the ends are — multiplied by a
// ramp that keeps the hinge narrow where it meets the thorax. `w` is the wing's
// half-width in world units, `sweep` trims the outer half so the wing rakes back.
function wing(w, { base = 2.6, round = 6, sweep = 0 } = {}) {
  const ramp = `min(1, ${(1 / base).toFixed(3)} + pfrac * ${base})`;
  const plan = `pow(max(0, 1 - pow(2 * pfrac - 1, ${round})), 0.5)`;
  return `${plan} * ${ramp} * ${w}${sweep ? ` * (1 - ${sweep} * pfrac)` : ''}`;
}

// A body silhouette as three overlapping lobes along `pfrac` — head, thorax,
// abdomen — with pinches between them. One smooth bulge reads as a blimp; the
// pinches are what make a shape read as an insect.
function lobes({ neck = 0.1, head = [0, 0.18, 0.55], thorax = [0.2, 0.5, 0.8], abdomen = [0.5, 1, 1] } = {}) {
  const lobe = ([a, b, r], p) => `${r} * pow(sin(clamp((pfrac - ${a}) / ${(b - a).toFixed(4)}, 0, 1) * PI), ${p})`;
  return `${neck} + ${lobe(head, 0.6)} + ${lobe(thorax, 0.55)} + ${lobe(abdomen, 0.5)}`;
}

export const INSECTS = [

// ---------------------------------------------------------------------------
{
  name: 'Beetle',
  slug: '01-domed-beetle',
  color: '#8c7c68',
  desc: 'A ribbed thorax and abdomen under two domed elytra, with clubbed antennae.',
  group: 'Insects',
  build(g) {
    // A ribbed thorax and abdomen under two domed elytra. The elytra are petals
    // with a very blunt outline, which is what a wing case is.
    const body = ribbedBody(g, 0, mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.3, 'rot z': HALF }, 'Origin'), {
      name: 'Body', joints: 14, len: 0.62, wid: 0.1, ribJoints: 7, ribWid: 0.02,
      profile: lobes({ neck: 0.12, head: [0, 0.17, 0.5], thorax: [0.13, 0.42, 0.78], abdomen: [0.38, 1, 0.95] }),
      nu: 18, nv: 42,
    });

    // elytra: two long domes hinged at the thorax
    const head0 = body.head;
    const atThorax = select(g, at(body.col, 4), head0, body.spine, { joints: 'range', from: 4, to: 4 }, 'wing base');
    // One shell, not two paddles. The elytra spine runs *along* the back rather
    // than out to the side, and its rib pair wraps down both flanks, so the wing
    // cases read as a dome over the abdomen instead of a pair of wings.
    const el = petals(g, body.col, head0, {
      name: 'Elytra', count: 1, tilt: 0.12, spin: HALF, joints: 11, len: 0.46, wid: 0.05, taper: 0.99,
      ribJoints: 4, ribLen: 0.5, ribWid: 0.02, at: atThorax,
      outline: wing(1.35, { base: 5, round: 8 }),
      curve: '0.012',
      cup: '0.62',
      nu: 11, nv: 30,
    });

    const atHead = select(g, at(el.col, 4), el.head, body.spine, { joints: 'first' }, 'head end');
    const ant = mk(g, 'tree/branch', at(el.col, 0), { joints: 6, rads: 2, angle: 0.8, spread: HALF, length: 0.34, width: 0.13, taper: 0.9 }, 'Antennae');
    link(el.head, 'skeleton', ant, 'skeleton'); attach(atHead, ant);
    const selAnt = select(g, at(el.col, 1), ant, ant, { joints: 'all but first' }, 'antenna joints');
    const club = xform(g, at(el.col + 1, 0), 'tree/size', ant, selAnt, { width: '0.1 + pow(along, 3) * 0.22' }, 'set', at(el.col + 1, 1), 'Clubbed tips');

    const atLegs = select(g, at(el.col + 2, 3), club, body.spine, { joints: 'range', from: 3, to: 5 }, 'leg sockets');
    const lg = limb(g, el.col + 2, club, atLegs, {
      name: 'Legs', joints: 5, count: 2, tilt: HALF, len: 1.0, wid: 0.3, taper: 0.92,
      bend: 'joint == 1 ? 0.95 : (joint == 2 ? -1.9 : -0.06)',
      lift: '0.3', rake: '(1 - floor(ord / 2)) * 0.6',
    });

    const shell = mk(g, 'surface/join', at(lg.col, 2), {}, 'Body + elytra');
    link(body.join, 'curves', shell, 'curves 1');
    link(el.join, 'curves', shell, 'curves 2');

    outputs(g, lg.col + 1, lg.head, shell, { name: 'beetle', res: 230, curveRadius: 0.16, blend: 0.55, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Moth',
  slug: '02-plumed-moth',
  color: '#bfae95',
  desc: 'Four veined wings and a furred body, with feathered antennae built as chains of chains.',
  group: 'Insects',
  build(g) {
    // Four veined wings. The membrane comes from the loft, the veins from the
    // spines showing through it, exactly as in the old moth sketch.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.25, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 13, len: 0.5, wid: 0.1, ribJoints: 7, ribWid: 0.02,
      profile: lobes({ neck: 0.09, head: [0, 0.16, 0.4], thorax: [0.12, 0.42, 0.72], abdomen: [0.38, 1, 0.6] }),
      nu: 15, nv: 36,
    });

    const atFore = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 3, to: 3 }, 'forewing base');
    const fore = petals(g, body.col, body.head, {
      name: 'Forewings', count: 2, tilt: 1.5, spin: HALF, joints: 9, len: 0.7, wid: 0.05, taper: 0.99,
      ribJoints: 3, ribLen: 0.7, ribWid: 0.015, at: atFore,
      outline: wing(1.8, { base: 2.2, round: 5, sweep: 0.2 }),
      curve: '-0.03',
      cup: '0.1',
      nu: 16, nv: 44,
    });

    const atHind = select(g, at(fore.col, 4), fore.head, body.spine, { joints: 'range', from: 5, to: 5 }, 'hindwing base');
    const hind = petals(g, fore.col, fore.head, {
      name: 'Hindwings', count: 2, tilt: 1.75, spin: HALF, joints: 7, len: 0.62, wid: 0.05, taper: 0.99,
      ribJoints: 3, ribLen: 0.6, ribWid: 0.015, at: atHind,
      outline: wing(1.5, { base: 2.6, round: 5 }),
      curve: '-0.02',
      cup: '0.12',
      nu: 14, nv: 38,
    });

    const atHead = select(g, at(hind.col, 4), hind.head, body.spine, { joints: 'first' }, 'head');
    // feathered antennae: a chain of chains
    const ant = mk(g, 'tree/branch', at(hind.col, 0), { joints: 9, rads: 2, angle: 1.0, spread: HALF, length: 0.24, width: 0.1, taper: 0.95 }, 'Antennae');
    link(hind.head, 'skeleton', ant, 'skeleton'); attach(atHead, ant);
    const selAnt = select(g, at(hind.col, 1), ant, ant, { joints: 'all but first' }, 'antenna joints');
    const sweep = xform(g, at(hind.col + 1, 0), 'tree/rotate', ant, selAnt, { rz: '-0.1' }, 'add', at(hind.col + 1, 1), 'Sweep back');
    const barbs = mk(g, 'tree/branch', at(hind.col + 2, 0), { joints: 2, rads: 2, angle: 1.2, spread: 0, length: 0.16, width: 0.07 }, 'Barbs');
    link(sweep, 'skeleton', barbs, 'skeleton'); attach(selAnt, barbs);

    const join = mk(g, 'surface/join', at(hind.col + 3, 2), {}, 'All wings');
    link(fore.join, 'curves', join, 'curves 1');
    link(hind.join, 'curves', join, 'curves 2');
    link(body.join, 'curves', join, 'curves 3');

    outputs(g, hind.col + 4, barbs, join, { name: 'moth', res: 230, curveRadius: 0.13, blend: 0.8, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Dragonfly',
  slug: '03-glass-dragonfly',
  color: '#a9c4cc',
  desc: 'A long rippled abdomen and four narrow wings over huge compound eyes.',
  group: 'Insects',
  build(g) {
    // A very long segmented abdomen: the profile expression carries a ripple so
    // each segment bulges, and four long narrow wings sit on a short thorax.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 26, len: 0.44, wid: 0.1, ribJoints: 6, ribWid: 0.015,
      profile: '(0.28 + 0.5 * pow(max(0, 1 - pfrac * 4), 1.4)) * (1 + 0.13 * sin(pfrac * PI * 13))',
      nu: 20, nv: 66,
    });

    const atFore = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 3, to: 3 }, 'forewing base');
    const fore = petals(g, body.col, body.head, {
      name: 'Forewings', count: 2, tilt: 1.5, spin: HALF, joints: 12, len: 0.62, wid: 0.04, taper: 0.995,
      ribJoints: 2, ribLen: 0.5, ribWid: 0.012, at: atFore,
      outline: wing(0.8, { base: 2.2, round: 10, sweep: 0.1 }),
      curve: '-0.012', cup: '0.05',
      nu: 9, nv: 54,
    });
    const atHind = select(g, at(fore.col, 4), fore.head, body.spine, { joints: 'range', from: 5, to: 5 }, 'hindwing base');
    const hind = petals(g, fore.col, fore.head, {
      name: 'Hindwings', count: 2, tilt: 1.62, spin: HALF, joints: 11, len: 0.6, wid: 0.04, taper: 0.995,
      ribJoints: 2, ribLen: 0.5, ribWid: 0.012, at: atHind,
      outline: wing(0.95, { base: 2.2, round: 10, sweep: 0.08 }),
      curve: '-0.012', cup: '0.05',
      nu: 10, nv: 50,
    });

    // huge compound eyes
    const atHead = select(g, at(hind.col, 4), hind.head, body.spine, { joints: 'first' }, 'head');
    const eyes = mk(g, 'tree/branch', at(hind.col, 0), { joints: 1, rads: 2, angle: 1.1, spread: HALF, length: 0.25, width: 0.62 }, 'Eyes');
    link(hind.head, 'skeleton', eyes, 'skeleton'); attach(atHead, eyes);

    const atLegs = select(g, at(hind.col + 1, 3), eyes, body.spine, { joints: 'range', from: 2, to: 4 }, 'leg sockets');
    const lg = limb(g, hind.col + 1, eyes, atLegs, {
      name: 'Legs', joints: 4, count: 2, tilt: HALF, len: 0.78, wid: 0.22, taper: 0.92,
      bend: 'joint == 1 ? 1.05 : (joint == 2 ? -1.95 : -0.1)',
      lift: '0.4', rake: '(1 - floor(ord / 2)) * 0.75',
    });

    const join = mk(g, 'surface/join', at(lg.col, 2), {}, 'Wings + body');
    link(fore.join, 'curves', join, 'curves 1');
    link(hind.join, 'curves', join, 'curves 2');
    link(body.join, 'curves', join, 'curves 3');

    outputs(g, lg.col + 1, lg.head, join, { name: 'dragonfly', res: 260, curveRadius: 0.105, blend: 0.8, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Ant',
  slug: '04-waisted-ant',
  color: '#7a5544',
  desc: 'Three lobes on one spine; the waists fall out of the profile expression for free.',
  group: 'Insects',
  build(g) {
    // Three lobes on one spine. The waist comes free: the profile expression
    // pinches to almost nothing between the lobes.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 22, len: 0.34, wid: 0.1, ribJoints: 7, ribWid: 0.015,
      // head | waist | mesosoma | waist | gaster
      profile: '0.1 + 0.62 * pow(abs(sin(pfrac * PI * 3.0 + 0.12)), 2.6) * (pfrac > 0.62 ? 1.45 : (pfrac < 0.25 ? 1.05 : 0.95))',
      bend: '-0.035',
      nu: 18, nv: 56,
    });

    const atHead = select(g, at(body.col, 4), body.head, body.spine, { joints: 'first' }, 'head');
    const ant = mk(g, 'tree/branch', at(body.col, 0), { joints: 5, rads: 2, angle: 0.95, spread: HALF, length: 0.38, width: 0.14, taper: 0.95 }, 'Antennae');
    link(body.head, 'skeleton', ant, 'skeleton'); attach(atHead, ant);
    const selAnt = select(g, at(body.col, 1), ant, ant, { joints: 'all but first' }, 'antenna joints');
    // the elbow: antennae bend sharply after the long first segment
    const elbow = xform(g, at(body.col + 1, 0), 'tree/rotate', ant, selAnt, { rz: 'joint == 1 ? 0.95 : 0.12' }, 'add', at(body.col + 1, 1), 'Elbow');

    const mand = mk(g, 'tree/branch', at(body.col + 2, 0), { joints: 4, rads: 2, angle: 1.45, spread: HALF, length: 0.2, width: 0.14, taper: 0.85 }, 'Mandibles');
    link(elbow, 'skeleton', mand, 'skeleton'); attach(atHead, mand);
    const selMand = select(g, at(body.col + 2, 1), mand, mand, { joints: 'all but first' }, 'mandible joints');
    const curve = xform(g, at(body.col + 3, 0), 'tree/rotate', mand, selMand, { rz: '-0.4' }, 'add', at(body.col + 3, 1), 'Curve inward');

    const atLegs = select(g, at(body.col + 4, 3), curve, body.spine, { joints: 'every N', from: 7, to: 11, step: 2 }, 'leg sockets');
    const lg = limb(g, body.col + 4, curve, atLegs, {
      name: 'Legs', joints: 6, count: 2, tilt: HALF, len: 0.72, wid: 0.27, taper: 0.93,
      bend: 'joint == 1 ? 1.0 : (joint == 2 ? -1.9 : -0.05)',
      lift: '0.4', rake: '(1 - floor(ord / 2)) * 0.8',
    });

    outputs(g, lg.col, lg.head, body.join, { name: 'ant', res: 230, curveRadius: 0.165, blend: 0.8, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Grasshopper',
  slug: '05-spring-grasshopper',
  color: '#9db072',
  desc: 'Folded hind legs with swollen femora, from a single bend expression over joint index.',
  group: 'Insects',
  build(g) {
    // The hind legs are the whole point: one expression folds a femur up and a
    // tibia back down, and only the last leg pair gets it.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 18, len: 0.44, wid: 0.1, ribJoints: 7, ribWid: 0.015,
      profile: lobes({ neck: 0.1, head: [0, 0.15, 0.46], thorax: [0.11, 0.4, 0.7], abdomen: [0.36, 1, 0.62] }),
      nu: 15, nv: 46,
    });

    // tegmina: long narrow wing covers folded over the back
    const atWing = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 5, to: 5 }, 'wing base');
    const teg = petals(g, body.col, body.head, {
      name: 'Tegmina', count: 1, tilt: 0.16, spin: HALF, joints: 12, len: 0.44, wid: 0.04, taper: 0.995,
      ribJoints: 3, ribLen: 0.4, ribWid: 0.012, at: atWing,
      outline: wing(0.8, { base: 4, round: 10 }),
      curve: '0.008', cup: '0.72',
      nu: 7, nv: 44,
    });

    const atFront = select(g, at(teg.col, 3), teg.head, body.spine, { joints: 'every N', from: 4, to: 6, step: 2 }, 'front legs');
    const front = limb(g, teg.col, teg.head, atFront, {
      name: 'Front legs', joints: 5, count: 2, tilt: HALF, len: 0.72, wid: 0.3, taper: 0.92,
      bend: 'joint == 1 ? 0.9 : (joint == 2 ? -1.85 : -0.06)',
      lift: '0.35', rake: '(0.5 - floor(ord / 2)) * 1.0',
    });
    const atHind = select(g, at(front.col, 3), front.head, body.spine, { joints: 'range', from: 8, to: 8 }, 'hind legs');
    const hind = limb(g, front.col, front.head, atHind, {
      name: 'Hind legs', joints: 9, count: 2, tilt: 1.25, len: 0.62, wid: 0.36, taper: 0.97,
      // femur kicks up over the back, then the knee folds a long tibia down
      // past the body — the taper stays near 1 so the tibia does not wither
      bend: 'joint == 1 ? 1.35 : (joint == 4 ? -2.6 : (joint >= 5 ? -0.16 : 0.05))',
      lift: '0.2', rake: '-0.75',
    });
    const selHindAll = select(g, at(hind.col, 1), hind.head, hind.br, { joints: 'range', from: 0, to: 3 }, 'femur');
    const thigh = xform(g, at(hind.col, 0), 'tree/size', hind.head, selHindAll, { width: '0.62 * sin((0.25 + along * 0.6) * PI)' }, 'set', at(hind.col, 2), 'Swollen femur');

    const atHead = select(g, at(hind.col + 1, 3), thigh, body.spine, { joints: 'first' }, 'head');
    const ant = mk(g, 'tree/branch', at(hind.col + 1, 0), { joints: 10, rads: 2, angle: 0.85, spread: HALF, length: 0.24, width: 0.13, taper: 0.95 }, 'Antennae');
    link(thigh, 'skeleton', ant, 'skeleton'); attach(atHead, ant);

    const shell = mk(g, 'surface/join', at(hind.col + 2, 2), {}, 'Body + tegmina');
    link(body.join, 'curves', shell, 'curves 1');
    link(teg.join, 'curves', shell, 'curves 2');

    outputs(g, hind.col + 3, ant, shell, { name: 'grasshopper', res: 230, curveRadius: 0.19, blend: 0.6, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Butterfly',
  slug: '06-scalloped-butterfly',
  color: '#d9a05b',
  desc: 'Broad wings with a scalloped margin and clubbed antennae.',
  group: 'Insects',
  build(g) {
    // Broad wings with a scalloped edge: the Warp runs a sine round the loft's
    // outer edge only, so the scallops fade to nothing at the wing root.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 14, len: 0.4, wid: 0.1, ribJoints: 6, ribWid: 0.015,
      profile: lobes({ neck: 0.07, head: [0, 0.16, 0.26], thorax: [0.12, 0.4, 0.42], abdomen: [0.36, 1, 0.3] }),
      nu: 11, nv: 34,
    });

    const atFore = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 3, to: 3 }, 'forewing base');
    const fore = petals(g, body.col, body.head, {
      name: 'Forewings', count: 2, tilt: 1.45, spin: HALF, joints: 10, len: 0.55, wid: 0.04, taper: 0.995,
      ribJoints: 3, ribLen: 0.6, ribWid: 0.012, at: atFore,
      outline: wing(2.0, { base: 2.0, round: 4, sweep: 0.12 }),
      curve: '-0.02', cup: '0.14',
      nu: 17, nv: 44,
    });
    const atHind = select(g, at(fore.col, 4), fore.head, body.spine, { joints: 'range', from: 6, to: 6 }, 'hindwing base');
    const hind = petals(g, fore.col, fore.head, {
      name: 'Hindwings', count: 2, tilt: 1.85, spin: HALF, joints: 8, len: 0.5, wid: 0.04, taper: 0.995,
      ribJoints: 3, ribLen: 0.55, ribWid: 0.012, at: atHind,
      outline: wing(1.55, { base: 2.4, round: 4 }),
      curve: '-0.02', cup: '0.18',
      nu: 15, nv: 38,
    });

    const wings = mk(g, 'surface/join', at(hind.col, 2), {}, 'Wings');
    link(fore.join, 'curves', wings, 'curves 1');
    link(hind.join, 'curves', wings, 'curves 2');

    const scallop = slider(g, at(hind.col, 4), 'scallop', 0, 0.5, 0.14);
    const warp = mk(g, 'surface/warp', at(hind.col + 1, 2), {
      normal: '0',
      'along u': 'sin(v * PI * 9) * pow(u, 8) * a',      // ripples the outer margin only
      'along v': '0',
      radius: '0.5 + 0.5 * sin(u * PI)',
    }, 'Scalloped edge');
    link(wings, 'curves', warp, 'curves');
    link(scallop, 'value', warp, 'a');

    const atHead = select(g, at(hind.col + 2, 3), hind.head, body.spine, { joints: 'first' }, 'head');
    const ant = mk(g, 'tree/branch', at(hind.col + 2, 0), { joints: 8, rads: 2, angle: 0.75, spread: HALF, length: 0.26, width: 0.1, taper: 0.97 }, 'Antennae');
    link(hind.head, 'skeleton', ant, 'skeleton'); attach(atHead, ant);
    const selAnt = select(g, at(hind.col + 2, 1), ant, ant, { joints: 'all' }, 'antenna joints');
    const clubbed = xform(g, at(hind.col + 3, 0), 'tree/size', ant, selAnt, { width: '0.09 + pow(along, 5) * 0.26' }, 'set', at(hind.col + 3, 1), 'Clubbed');

    const join2 = mk(g, 'surface/join', at(hind.col + 4, 2), {}, 'All surfaces');
    link(warp, 'curves', join2, 'curves 1');
    link(body.join, 'curves', join2, 'curves 2');

    outputs(g, hind.col + 5, clubbed, join2, { name: 'butterfly', res: 240, curveRadius: 0.125, blend: 0.8, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Bee',
  slug: '07-banded-bee',
  color: '#d4a63c',
  desc: 'A sawtooth profile bands the abdomen; the hind legs carry pollen baskets.',
  group: 'Insects',
  build(g) {
    // A banded abdomen. The profile carries a sawtooth so the segments step
    // rather than ripple, which is what makes a bee look like a bee.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 16, len: 0.42, wid: 0.1, ribJoints: 7, ribWid: 0.015,
      profile: `(${lobes({ neck: 0.1, head: [0, 0.2, 0.58], thorax: [0.16, 0.46, 0.82], abdomen: [0.44, 1, 0.85] })}) * (pfrac < 0.46 ? 1 : 1 + 0.15 * pow(abs(sin(pfrac * PI * 9)), 0.5))`,
      nu: 20, nv: 44,
    });

    const atWing = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 4, to: 4 }, 'wing base');
    const wings = petals(g, body.col, body.head, {
      name: 'Wings', count: 2, tilt: 1.55, spin: HALF, joints: 9, len: 0.42, wid: 0.035, taper: 0.995,
      ribJoints: 2, ribLen: 0.4, ribWid: 0.012, at: atWing,
      outline: wing(0.62, { base: 2.4, round: 8, sweep: 0.1 }),
      curve: '-0.02', cup: '0.08',
      nu: 7, nv: 36,
    });

    const atLegs = select(g, at(wings.col, 3), wings.head, body.spine, { joints: 'range', from: 3, to: 5 }, 'leg sockets');
    const lg = limb(g, wings.col, wings.head, atLegs, {
      name: 'Legs', joints: 5, count: 2, tilt: HALF, len: 0.62, wid: 0.26, taper: 0.93,
      bend: 'joint == 1 ? 1.0 : (joint == 2 ? -1.9 : -0.07)',
      lift: '0.35', rake: '(1 - floor(ord / 2)) * 0.7',
    });
    // pollen baskets on the hind pair
    const selBasket = select(g, at(lg.col, 1), lg.head, lg.br, { joints: 'range', from: 3, to: 3, filter: 'ppj >= 5' }, 'hind tibiae');
    const basket = xform(g, at(lg.col, 0), 'tree/size', lg.head, selBasket, { width: 0.34 }, 'set', null, 'Pollen baskets');

    const atHead = select(g, at(lg.col + 1, 3), basket, body.spine, { joints: 'first' }, 'head');
    const ant = mk(g, 'tree/branch', at(lg.col + 1, 0), { joints: 6, rads: 2, angle: 1.0, spread: HALF, length: 0.24, width: 0.13, taper: 0.94 }, 'Antennae');
    link(basket, 'skeleton', ant, 'skeleton'); attach(atHead, ant);
    const selAnt = select(g, at(lg.col + 1, 1), ant, ant, { joints: 'all but first' }, 'antenna joints');
    const bendAnt = xform(g, at(lg.col + 2, 0), 'tree/rotate', ant, selAnt, { rz: 'joint == 1 ? 0.8 : 0.1' }, 'add', at(lg.col + 2, 1), 'Elbow');

    const join = mk(g, 'surface/join', at(lg.col + 3, 2), {}, 'Wings + body');
    link(wings.join, 'curves', join, 'curves 1');
    link(body.join, 'curves', join, 'curves 2');

    outputs(g, lg.col + 4, bendAnt, join, { name: 'bee', res: 230, curveRadius: 0.145, blend: 0.7, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Mantis',
  slug: '08-cathedral-mantis',
  color: '#9bb87f',
  desc: 'A long prothorax and raptorial forelegs snapped shut against heavy femora.',
  group: 'Insects',
  build(g) {
    // A long prothorax and raptorial forelegs, held folded. The forelegs get a
    // different bend expression from the walking legs, from the same helper.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': 1.1 }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 22, len: 0.4, wid: 0.1, ribJoints: 6, ribWid: 0.015,
      // narrow head, very long slim prothorax, then a broad abdomen
      profile: '0.14 + 0.52 * pow(max(0, (pfrac - 0.42) / 0.58), 0.7) * pow(max(0, 1 - pow(max(0,(pfrac-0.82)/0.18), 2)), 0.6) + 0.3 * pow(max(0, 1 - pfrac * 7), 1.5)',
      bend: 'pfrac < 0.42 ? 0.115 : (pfrac > 0.82 ? -0.1 : 0.005)',
      nu: 15, nv: 56,
    });

    const atFore = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 3, to: 3 }, 'foreleg socket');
    const raptor = limb(g, body.col, body.head, atFore, {
      name: 'Raptorial', joints: 7, count: 2, tilt: 1.15, len: 0.64, wid: 0.24, taper: 0.93,
      // femur swings up and forward, tibia snaps shut back along it
      bend: 'joint == 1 ? 1.15 : (joint == 4 ? -2.55 : 0.05)',
      lift: '0.55', rake: '1.15',
    });
    const selFemur = select(g, at(raptor.col, 1), raptor.head, raptor.br, { joints: 'range', from: 2, to: 3 }, 'femur');
    const spiny = xform(g, at(raptor.col, 0), 'tree/size', raptor.head, selFemur, { width: 0.34 }, 'set', null, 'Heavy femur');

    const atWalk = select(g, at(raptor.col + 1, 3), spiny, body.spine, { joints: 'every N', from: 9, to: 13, step: 4 }, 'walking legs');
    const walk = limb(g, raptor.col + 1, spiny, atWalk, {
      name: 'Walking legs', joints: 6, count: 2, tilt: HALF, len: 0.8, wid: 0.24, taper: 0.94,
      bend: 'joint == 1 ? 1.1 : (joint == 2 ? -2.0 : -0.06)',
      lift: '0.45', rake: '(0.5 - floor(ord / 2)) * 1.1',
    });

    const atHead = select(g, at(walk.col, 3), walk.head, body.spine, { joints: 'first' }, 'head');
    const eyes = mk(g, 'tree/branch', at(walk.col, 0), { joints: 1, rads: 2, angle: 1.15, spread: HALF, length: 0.2, width: 0.3 }, 'Eyes');
    link(walk.head, 'skeleton', eyes, 'skeleton'); attach(atHead, eyes);
    const ant = mk(g, 'tree/branch', at(walk.col + 1, 0), { joints: 10, rads: 2, angle: 0.7, spread: HALF, length: 0.24, width: 0.1, taper: 0.96 }, 'Antennae');
    link(eyes, 'skeleton', ant, 'skeleton'); attach(atHead, ant);

    outputs(g, walk.col + 2, ant, body.join, { name: 'mantis', res: 230, curveRadius: 0.1, blend: 0.8, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Spider',
  slug: '09-globe-spider',
  color: '#6f6257',
  desc: 'Eight long legs off a pinched cephalothorax, under a near-spherical abdomen.',
  group: 'Insects',
  build(g) {
    // Eight legs off a short cephalothorax, and an abdomen that is nearly a
    // sphere because the profile is a half sine over a short spine.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 16, len: 0.34, wid: 0.1, ribJoints: 7, ribWid: 0.015,
      // cephalothorax, a pinch, then a fat globular abdomen
      profile: '0.08 + (pfrac < 0.46 ? 0.72 * pow(sin(pfrac / 0.46 * PI), 0.5) : 1.0 * pow(sin((pfrac - 0.46) / 0.54 * PI), 0.45))',
      nu: 22, nv: 44,
    });

    const atLegs = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 2, to: 5 }, 'leg sockets');
    const lg = limb(g, body.col, body.head, atLegs, {
      name: 'Legs', joints: 8, count: 2, tilt: HALF, len: 0.74, wid: 0.26, taper: 0.95,
      // up over the knee, then a long fall to the tip
      bend: 'joint == 1 ? 1.2 : (joint == 3 ? -1.95 : -0.04)',
      lift: '0.5', rake: '(1.5 - floor(ord / 2)) * 0.55',
    });

    const atHead = select(g, at(lg.col, 3), lg.head, body.spine, { joints: 'first' }, 'head');
    const palps = mk(g, 'tree/branch', at(lg.col, 0), { joints: 4, rads: 2, angle: 1.25, spread: HALF, length: 0.26, width: 0.15, taper: 0.88 }, 'Pedipalps');
    link(lg.head, 'skeleton', palps, 'skeleton'); attach(atHead, palps);
    const selPalp = select(g, at(lg.col, 1), palps, palps, { joints: 'all but first' }, 'palp joints');
    const palpBend = xform(g, at(lg.col + 1, 0), 'tree/rotate', palps, selPalp, { rz: '0.5' }, 'add', at(lg.col + 1, 1), 'Curl');
    const selPalpTip = select(g, at(lg.col + 1, 2), palpBend, palps, { joints: 'last' }, 'palp tips');
    const bulbs = xform(g, at(lg.col + 2, 0), 'tree/size', palpBend, selPalpTip, { width: 0.26 }, 'set', null, 'Palp bulbs');

    const spinner = mk(g, 'tree/branch', at(lg.col + 3, 0), { joints: 3, rads: 4, angle: 0.35, length: 0.16, width: 0.14, taper: 0.8 }, 'Spinnerets');
    link(bulbs, 'skeleton', spinner, 'skeleton');
    attach(select(g, at(lg.col + 3, 1), bulbs, body.spine, { joints: 'last' }, 'abdomen tip'), spinner);

    outputs(g, lg.col + 4, spinner, body.join, { name: 'spider', res: 230, curveRadius: 0.17, blend: 0.6, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Cicada',
  slug: '10-tent-cicada',
  color: '#8fa08c',
  desc: 'Wings rolled by a twist into a tent over the back, above a broad head.',
  group: 'Insects',
  build(g) {
    // Wings held in a tent over the back: the same wing recipe, but rolled
    // about its own spine by `twist` so the pair meets along the midline.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.2, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 14, len: 0.44, wid: 0.1, ribJoints: 7, ribWid: 0.015,
      profile: lobes({ neck: 0.12, head: [0, 0.2, 0.72], thorax: [0.16, 0.48, 0.9], abdomen: [0.45, 1, 0.7] }),
      nu: 19, nv: 38,
    });

    const atWing = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 4, to: 4 }, 'wing base');
    const wings = petals(g, body.col, body.head, {
      name: 'Wings', count: 2, tilt: 1.15, spin: HALF, joints: 12, len: 0.58, wid: 0.05, taper: 0.995,
      ribJoints: 2, ribLen: 0.5, ribWid: 0.012, at: atWing,
      outline: wing(1.05, { base: 2.4, round: 8, sweep: 0.15 }),
      curve: '-0.015',
      twist: '0.05',                 // rolls the membrane into the tent
      cup: '0.12',
      nu: 11, nv: 48,
    });

    const atHead = select(g, at(wings.col, 3), wings.head, body.spine, { joints: 'first' }, 'head');
    const eyes = mk(g, 'tree/branch', at(wings.col, 0), { joints: 1, rads: 2, angle: 1.3, spread: HALF, length: 0.2, width: 0.36 }, 'Eyes');
    link(wings.head, 'skeleton', eyes, 'skeleton'); attach(atHead, eyes);

    const atLegs = select(g, at(wings.col + 1, 3), eyes, body.spine, { joints: 'range', from: 3, to: 5 }, 'leg sockets');
    const lg = limb(g, wings.col + 1, eyes, atLegs, {
      name: 'Legs', joints: 5, count: 2, tilt: HALF, len: 0.68, wid: 0.28, taper: 0.92,
      bend: 'joint == 1 ? 1.0 : (joint == 2 ? -1.9 : -0.06)',
      lift: '0.35', rake: '(1 - floor(ord / 2)) * 0.65',
    });

    const join = mk(g, 'surface/join', at(lg.col, 2), {}, 'Wings + body');
    link(wings.join, 'curves', join, 'curves 1');
    link(body.join, 'curves', join, 'curves 2');

    outputs(g, lg.col + 1, lg.head, join, { name: 'cicada', res: 230, curveRadius: 0.15, blend: 0.7, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Stick insect',
  slug: '11-twig-stick-insect',
  color: '#a8a08c',
  desc: 'Forty body joints of nearly constant radius with a slow noise wobble.',
  group: 'Insects',
  build(g) {
    // Everything stretched. The body is 40 joints of almost constant radius
    // with a slow noise wobble, so it reads as a twig rather than a tube.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.15, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 40, len: 0.46, wid: 0.1, ribJoints: 5, ribWid: 0.012,
      profile: '0.2 * (1 + 0.22 * sin(pfrac * PI * 11)) * (1 + 0.5 * pow(max(0, 1 - pfrac * 9), 2))',
      bend: 'noise(pfrac * 3.5, 7.3, 0) * 0.05',
      nu: 9, nv: 96,
    });

    const atLegs = select(g, at(body.col, 4), body.head, body.spine, { joints: 'every N', from: 4, to: 12, step: 4 }, 'leg sockets');
    const lg = limb(g, body.col, body.head, atLegs, {
      name: 'Legs', joints: 9, count: 2, tilt: HALF, len: 0.8, wid: 0.2, taper: 0.97,
      bend: 'joint == 1 ? 0.95 : (joint == 3 ? -1.55 : -0.02)',
      lift: '0.4', rake: '(1 - floor(ord / 2)) * 0.95',
    });

    const atHead = select(g, at(lg.col, 3), lg.head, body.spine, { joints: 'first' }, 'head');
    const ant = mk(g, 'tree/branch', at(lg.col, 0), { joints: 12, rads: 2, angle: 0.5, spread: HALF, length: 0.3, width: 0.09, taper: 0.98 }, 'Antennae');
    link(lg.head, 'skeleton', ant, 'skeleton'); attach(atHead, ant);

    outputs(g, lg.col + 1, ant, body.join, { name: 'stick-insect', res: 260, curveRadius: 0.1, blend: 0.9, minRadius: 0 });
  },
},

// ---------------------------------------------------------------------------
{
  name: 'Stag beetle',
  slug: '12-antler-stag-beetle',
  color: '#5f4a3a',
  desc: 'Mandibles as antlers: a curving chain that sprouts its own tines.',
  group: 'Insects',
  build(g) {
    // Mandibles as antlers: a chain that curves inward and sprouts its own
    // tines, which is a tree growing out of an insect's face.
    const origin = mk(g, 'tree/root', at(-1, 0), { trunks: 1, joints: 1, length: 0.2, width: 0.25, 'rot z': HALF }, 'Origin');
    const body = ribbedBody(g, 0, origin, {
      name: 'Body', joints: 15, len: 0.6, wid: 0.1, ribJoints: 7, ribWid: 0.02,
      profile: lobes({ neck: 0.14, head: [0, 0.18, 0.62], thorax: [0.13, 0.44, 0.92], abdomen: [0.4, 1, 1.0] }),
      nu: 17, nv: 42,
    });

    const atElytra = select(g, at(body.col, 4), body.head, body.spine, { joints: 'range', from: 5, to: 5 }, 'elytra base');
    const el = petals(g, body.col, body.head, {
      name: 'Elytra', count: 1, tilt: 0.1, spin: HALF, joints: 11, len: 0.44, wid: 0.05, taper: 0.99,
      ribJoints: 4, ribLen: 0.5, ribWid: 0.02, at: atElytra,
      outline: wing(1.45, { base: 5, round: 8 }),
      curve: '0.01',
      cup: '0.6',
      nu: 12, nv: 32,
    });

    const atHead = select(g, at(el.col, 4), el.head, body.spine, { joints: 'first' }, 'head');
    const jaw = mk(g, 'tree/branch', at(el.col, 0), { joints: 9, rads: 2, angle: 1.25, spread: HALF, length: 0.38, width: 0.24, taper: 0.93 }, 'Mandibles');
    link(el.head, 'skeleton', jaw, 'skeleton'); attach(atHead, jaw);
    const selJaw = select(g, at(el.col, 1), jaw, jaw, { joints: 'all but first' }, 'mandible joints');
    // sweep out, then hook sharply back in
    const sweep = xform(g, at(el.col + 1, 0), 'tree/rotate', jaw, selJaw,
      { rz: 'along < 0.45 ? -0.2 : 0.42', ry: '0.06' }, 'add', at(el.col + 1, 1), 'Sweep and hook');
    const tines = mk(g, 'tree/branch', at(el.col + 2, 0), { joints: 3, rads: 1, angle: 1.1, spread: 0, length: 0.2, width: 0.15, taper: 0.8 }, 'Tines');
    link(sweep, 'skeleton', tines, 'skeleton');
    attach(select(g, at(el.col + 2, 1), sweep, jaw, { joints: 'every N', from: 3, to: 6, step: 2 }, 'tine sockets'), tines);

    const atLegs = select(g, at(el.col + 3, 3), tines, body.spine, { joints: 'range', from: 4, to: 6 }, 'leg sockets');
    const lg = limb(g, el.col + 3, tines, atLegs, {
      name: 'Legs', joints: 5, count: 2, tilt: HALF, len: 1.0, wid: 0.3, taper: 0.93,
      bend: 'joint == 1 ? 0.95 : (joint == 2 ? -1.9 : -0.06)',
      lift: '0.3', rake: '(1 - floor(ord / 2)) * 0.6',
    });

    const shell = mk(g, 'surface/join', at(lg.col, 2), {}, 'Body + elytra');
    link(body.join, 'curves', shell, 'curves 1');
    link(el.join, 'curves', shell, 'curves 2');

    outputs(g, lg.col + 1, lg.head, shell, { name: 'stag-beetle', res: 240, curveRadius: 0.16, blend: 0.55, minRadius: 0 });
  },
},

];
