// ============================================================================
// graph-build.js — helpers for authoring example graphs in code.
//
// The examples are written as builder functions rather than saved JSON so they
// stay readable and keep working when a node gains a parameter. Save any of
// them from the toolbar if you want a frozen .json copy.
// ============================================================================

import { LiteGraph, buildParamWidgets, pinSlotFor } from '../nodes/common.js';

export const PI = Math.PI;
export const HALF = Math.PI / 2;
export const TAU = Math.PI * 2;
export const GOLDEN = 2.39996322972865332;      // golden angle, for phyllotaxis

/** Grid position: column, row. Keeps example graphs legible without hand-placing. */
export const at = (col, row) => [60 + col * 300, 40 + row * 250];

/** Create a node and set parameter values by name. */
export function mk(graph, type, pos, values = {}, title) {
  const n = LiteGraph.createNode(type);
  if (!n) throw new Error('unknown node type ' + type);
  n.pos = pos;
  graph.add(n);
  for (const k in values) {
    if (!n._paramByName || !n._paramByName[k]) { console.warn(type, 'has no parameter', k); continue; }
    n.properties.values[k] = values[k];
    const d = n._paramByName[k];
    if (d.onChange) d.onChange(n, values[k]);
  }
  buildParamWidgets(n);
  if (n.syncRange) n.syncRange();
  if (title) n.title = title;
  return n;
}

/** Connect output -> fixed input, both by name. */
export function link(a, out, b, inp) {
  const o = typeof out === 'string' ? a.findOutputSlot(out) : out;
  const i = typeof inp === 'string' ? b.findInputSlot(inp) : inp;
  if (o < 0 || i < 0) throw new Error(`bad link ${a.title}.${out} -> ${b.title}.${inp}`);
  a.connect(o, b, i);
}

/** Connect into a parameter, flipping it to a pin on the way. */
export function drive(a, out, b, paramName) {
  const slot = pinSlotFor(b, paramName);
  const o = typeof out === 'string' ? a.findOutputSlot(out) : out;
  if (o < 0 || slot < 0) throw new Error(`bad drive ${a.title}.${out} -> ${b.title}.${paramName}`);
  a.connect(o, b, slot);
}

/** Wire a Select (or Branch) into a Branch node's `at` input. */
export function attach(selNode, branchNode) {
  link(selNode, selNode.findOutputSlot('selection') >= 0 ? 'selection' : 'branches', branchNode, 'at');
}

/**
 * A Branch that sprouts from an explicit place rather than from whatever the
 * previous structure node happened to make. `where` is {scope, ...selectOpts}.
 */
export function sprout(g, pos, prev, where, values, title) {
  const br = mk(g, 'tree/branch', pos, values, title);
  link(prev, 'skeleton', br, 'skeleton');
  if (where) {
    const sel = select(g, [pos[0], pos[1] + 250], prev, where.scope, where.opts || { joints: 'last' }, (title || 'sprout') + ' at');
    attach(sel, br);
  }
  return br;
}

// ---------------------------------------------------------------------------
// Small node shorthands
// ---------------------------------------------------------------------------
export const expr = (g, pos, src, title) => mk(g, 'field/expression', pos, { expr: src }, title);
export const slider = (g, pos, name, min, max, value) => mk(g, 'value/slider', pos, { name, min, max, value });
export const num = (g, pos, value) => mk(g, 'value/number', pos, { value });

/** Select a scope's joints. */
export function select(g, pos, skelNode, scopeNode, opts = {}, title) {
  const n = mk(g, 'tree/select', pos, opts, title);
  link(skelNode, 'skeleton', n, 'skeleton');
  if (scopeNode) link(scopeNode, scopeNode.findOutputSlot('branches') >= 0 ? 'branches' : 'selection', n, 'scope');
  return n;
}

/**
 * Apply a transform to a selection, with each channel either a number or an
 * expression string (which becomes an Expression node wired into that channel).
 * Returns the transform node; `fieldPos` is where any expression nodes land.
 */
export function xform(g, pos, type, skelNode, selNode, chans, mode = 'add', fieldPos = null, title) {
  const values = { mode };
  const fields = {};
  for (const k in chans) {
    if (typeof chans[k] === 'string') fields[k] = chans[k];
    else if (chans[k] && chans[k].type) fields[k] = chans[k];      // an existing node
    else values[k] = chans[k];
  }
  const n = mk(g, type, pos, values, title);
  link(skelNode, 'skeleton', n, 'skeleton');
  if (selNode) link(selNode, selNode.findOutputSlot('selection') >= 0 ? 'selection' : 'branches', n, 'selection');
  let row = 0;
  for (const k in fields) {
    const f = fields[k];
    if (typeof f === 'string') {
      const e = expr(g, fieldPos ? [fieldPos[0], fieldPos[1] + row * 120] : [pos[0] - 280, pos[1] + 200 + row * 120], f);
      drive(e, 'field', n, k);
      row++;
    } else {
      drive(f, f.findOutputSlot('field') >= 0 ? 'field' : 'out', n, k);
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Petals
// ---------------------------------------------------------------------------
/**
 * A ring (or spiral) of petals. `outline` is the petal's half-width in world
 * units; `len` x `joints` (with taper) is roughly its length. Each petal is a spine with ribs crossing it;
 * rib length is a profile of `pfrac`, the position along the spine, so the petal
 * grows and shrinks along its length. The two rib spokes are lofted separately
 * (they are created interleaved, and a loft needs its ribs in order) and joined,
 * giving one surface per petal via `group by: parent branch`.
 *
 * o: {
 *   count, tilt, spin, joints, len, wid, taper,      // the spine
 *   ribJoints, ribLen, ribWid,                       // the ribs
 *   outline,   // expression for rib length, over pfrac / along / order / across
 *   cup,       // expression for rib curl (mirrored automatically)
 *   curve,     // expression for spine rz along the petal
 *   twist,     // expression for spine ry along the petal
 *   spinExpr,  // expression for per-petal ry (phyllotaxis); applied to the spine base
 *   nu, nv,    // loft resolution across / along the petal
 * }
 */
export function petals(g, col, prev, o = {}) {
  const {
    count = 5, tilt = 0.9, spin = 0, joints = 8, len = 3, wid = 0.35, taper = 1,
    ribJoints = 3, ribLen = 1, ribWid = 0.18,
    outline = 'sin(pfrac * PI) * 2', cup = null, curve = null, twist = null, spinExpr = null,
    nu = 5, nv = 14, spacing = 0, name = 'Petals', start = -1, end = -1, every = 1, at: atSel = null,
  } = o;

  const spines = mk(g, 'tree/branch', at(col, 0), {
    joints, rads: count, angle: tilt, spread: spin, length: len, width: wid, taper, start, end, every,
  }, name);
  link(prev, 'skeleton', spines, 'skeleton');
  // Without this the branch sprouts from whatever the previous structure node
  // made, which after a petal set means every rib joint.
  if (atSel) attach(atSel, spines);

  const ribs = mk(g, 'tree/branch', at(col + 1, 0), {
    joints: ribJoints, rads: 2, angle: HALF, spread: HALF, length: ribLen, width: ribWid, taper: 1,
  }, name + ' ribs');
  link(spines, 'skeleton', ribs, 'skeleton');

  let head = ribs;
  const selSpine = select(g, at(col, 1), ribs, spines, { joints: 'all but first' }, 'spine joints');
  const selSpineAll = select(g, at(col, 2), ribs, spines, { joints: 'all' }, 'spine all');
  const selRib = select(g, at(col + 1, 1), ribs, ribs, { joints: 'all' }, 'rib joints');
  const selRibTail = select(g, at(col + 1, 2), ribs, ribs, { joints: 'all but first' }, 'rib tail');

  // per-petal spin (phyllotaxis) goes on the first joint of each spine
  if (spinExpr) {
    const selBase = select(g, at(col, 3), ribs, spines, { joints: 'first' }, 'spine base');
    head = xform(g, at(col + 2, 3), 'tree/rotate', head, selBase, { ry: spinExpr }, 'add', at(col + 2, 4), 'Spin');
  }
  if (curve) head = xform(g, at(col + 2, 0), 'tree/rotate', head, selSpine, { rz: curve }, 'add', at(col + 2, 1), 'Curve');
  if (twist) head = xform(g, at(col + 3, 0), 'tree/rotate', head, selSpineAll, { ry: twist }, 'add', at(col + 3, 1), 'Twist');

  // The outline is the petal's half-width. Size sets the length of *each* rib
  // joint, so divide by their count to keep the expression in world units.
  head = xform(g, at(col + 4, 0), 'tree/size', head, selRib,
    { length: `(${outline}) / ${ribJoints}` }, 'set', at(col + 4, 1), 'Outline');
  if (cup) {
    // mirror the curl between the two spokes so the petal cups instead of twisting
    head = xform(g, at(col + 5, 0), 'tree/rotate', head, selRibTail,
      { rx: `(rad == 0 ? 1 : -1) * (${cup})` }, 'add', at(col + 5, 1), 'Cup');
  }

  const selL = select(g, at(col + 6, 2), head, ribs, { spokes: 'index', spoke: 0 }, 'left ribs');
  const selR = select(g, at(col + 6, 3), head, ribs, { spokes: 'index', spoke: 1 }, 'right ribs');
  const loftL = mk(g, 'surface/loft', at(col + 7, 2), { span: 'whole set', spacing, 'divide u': nu, 'divide v': nv, 'group by': 'parent branch' }, 'Loft L');
  link(head, 'skeleton', loftL, 'skeleton'); link(selL, 'branches', loftL, 'ribs');
  const loftR = mk(g, 'surface/loft', at(col + 7, 3), { span: 'whole set', spacing, 'divide u': nu, 'divide v': nv, 'group by': 'parent branch' }, 'Loft R');
  link(head, 'skeleton', loftR, 'skeleton'); link(selR, 'branches', loftR, 'ribs');
  const join = mk(g, 'surface/join', at(col + 8, 2), {}, name + ' surface');
  link(loftL, 'curves', join, 'curves 1'); link(loftR, 'curves', join, 'curves 2');

  return { spines, ribs, head, selSpine, selSpineAll, selRib, selRibTail, selL, selR, loftL, loftR, join, col: col + 9 };
}

// ---------------------------------------------------------------------------
// Insect bodies
// ---------------------------------------------------------------------------
/**
 * A ribbed body segment: a spine with hoop ribs that start at the dorsal midline
 * and sweep down both flanks, so the cross-section is a closed ring. Rib length
 * is a profile of `pfrac`, which is what gives a thorax its bulge and an abdomen
 * its taper. The two sides are lofted separately and joined.
 *
 * o: { joints, len, wid, tilt, spin, ribJoints, ribLen, ribWid,
 *      profile,  // rib length over pfrac — the body's silhouette
 *      curl,     // per-joint hoop curl; total sweep is curl * (ribJoints-1)
 *      bend,     // spine rz along the body
 *      nu, nv }
 */
export function ribbedBody(g, col, prev, o = {}) {
  const {
    joints = 10, len = 2, wid = 0.1, tilt = 0, spin = 0, count = 1,
    ribJoints = 9, ribLen = 0.7, ribWid = 0.02, spokes = 2,
    profile = 'sin(pfrac * PI) * 1.6 + 0.3', curl = null, bend = null,
    nu = 6, nv = 14, spacing = 0, name = 'Body', start = -1, end = -1, at: atSel = null,
    capEnds = 7,        // how sharply the first and last ribs shrink to a point
    core = 0.85,        // spine radius as a fraction of the body radius; 0 leaves it hollow
  } = o;

  const spine = mk(g, 'tree/branch', at(col, 0), {
    joints, rads: count, angle: tilt, spread: spin, length: len, width: wid, start, end,
  }, name);
  link(prev, 'skeleton', spine, 'skeleton');
  if (atSel) attach(atSel, spine);

  // Each rib is a radial stalk out to the body's surface followed by a tangential
  // arc round it, and the spokes divide the circle between them turning the same
  // way. Ribs that simply curl out of the spine trace spirals, and a loft across
  // spirals is a set of vanes rather than a tube.
  const ribs = mk(g, 'tree/branch', at(col + 1, 0), {
    joints: ribJoints, rads: spokes, angle: HALF, spread: 0, length: ribLen, width: ribWid,
  }, name + ' ribs');
  link(spine, 'skeleton', ribs, 'skeleton');

  let head = ribs;
  const selSpine = select(g, at(col, 1), ribs, spine, { joints: 'all but first' }, 'spine joints');
  const selRib = select(g, at(col + 1, 1), ribs, ribs, { joints: 'all' }, 'rib joints');
  const selRibTail = select(g, at(col + 1, 2), ribs, ribs, { joints: 'all but first' }, 'rib tail');

  if (bend) head = xform(g, at(col + 2, 0), 'tree/rotate', head, selSpine, { rz: bend }, 'add', at(col + 2, 1), 'Bend');

  // `profile` is the body's radius, in world units. Joint 0 is the stalk and runs
  // out to exactly that; the remaining joints are chords of an arc at that radius.
  // The end factor shrinks the first and last ribs to nothing, closing the tube
  // into a capsule instead of leaving it open at nose and tail.
  const capF = capEnds > 0 ? ` * min(1, pfrac * ${capEnds}) * min(1, (1 - pfrac) * ${capEnds})` : '';
  const arcN = Math.max(1, ribJoints - 1);          // joints forming the arc
  const per = (curl ? Number(curl) : TAU / spokes) / arcN;   // turn per arc joint
  const chord = (2 * Math.sin(per / 2)).toFixed(6);
  const R = `((${profile})${capF})`;
  head = xform(g, at(col + 3, 0), 'tree/size', head, selRib,
    { length: `joint == 0 ? ${R} : ${R} * ${chord}` }, 'set', at(col + 3, 1), 'Profile');
  // the first arc joint also turns a right angle, to leave the stalk tangentially
  head = xform(g, at(col + 4, 0), 'tree/rotate', head, selRibTail,
    { rx: `joint == 1 ? ${(HALF + per / 2).toFixed(6)} : ${per.toFixed(6)}` }, 'add', at(col + 4, 1), 'Hoop');

  // Fill the interior: the loft is a closed sheet, so on its own the isosurface
  // gives it an inner wall and a sealed void. A spine that follows the same
  // profile reaches that wall everywhere, including a pinched waist.
  if (core > 0) {
    const alongProfile = profile.replace(/pfrac/g, 'along');
    const selSpineAll = select(g, at(col + 5, 1), head, spine, { joints: 'all' }, 'spine all');
    head = xform(g, at(col + 5, 0), 'tree/size', head, selSpineAll,
      { width: `(${alongProfile}) * ${core}` }, 'set', at(col + 5, 4), 'Solid core');
  }

  // one loft per spoke: the ribs are created interleaved, and a loft needs its
  // ribs in order along the body
  const join = mk(g, 'surface/join', at(col + 8, 2), {}, name + ' surface');
  const lofts = [];
  for (let k = 0; k < Math.min(4, spokes); k++) {
    const sel = select(g, at(col + 6, 1 + k), head, ribs, { spokes: 'index', spoke: k }, `spoke ${k}`);
    const loft = mk(g, 'surface/loft', at(col + 7, 1 + k), {
      span: 'whole set', spacing, 'divide u': nu, 'divide v': nv, 'group by': 'parent branch',
      'skip base': 1,            // drop the stalk root so the sheet is the wall, not a vane
    }, 'Loft ' + k);
    link(head, 'skeleton', loft, 'skeleton');
    link(sel, 'branches', loft, 'ribs');
    link(loft, 'curves', join, 'curves ' + (k + 1));
    lofts.push(loft);
  }

  return { spine, ribs, head, selSpine, selRib, selRibTail, lofts, join, col: col + 9 };
}

/**
 * A jointed limb — a leg, a feeler, a raptorial arm.
 *
 * Orientation is the whole game here, so it is worth stating the frame. A body
 * spine built from the standard Origin runs along -X with the head at the +X
 * end; +Y is up and ±Z are the flanks. A branch with `rads: 2` puts its pair
 * 180 degrees apart around the spine, so:
 *
 *   spin = HALF   the pair points out to ±Z, the flanks. This is what a leg wants.
 *   spin = 0      the pair points up and down. Almost never what you want.
 *
 * The second catch is which way a joint bends. `rz` swings a joint inside the
 * plane holding the limb and the body axis — for a leg out to the side that is
 * the *horizontal* plane, so on its own it sweeps the leg forward and back and
 * never lifts a knee. `ry` past the first joint is a roll about the limb's own
 * length. So the limb is rolled a quarter turn at its second joint, after which
 * every `rz` is a vertical hinge:
 *
 *   bend   rz from the second joint on: positive lifts, negative drops. Lift the
 *          femur, fold the tibia down under it, and you have an insect leg.
 *   lift   ry at the socket, mirrored: swings the whole limb above or below the
 *          horizontal before any of the bending.
 *   rake   rz at the socket: positive swings the limb forward, toward the head.
 *
 * The roll and the lift are mirrored by `rad` because the far leg of a pair is
 * the near one turned halfway round the body, which reverses its idea of "up".
 */
export function limb(g, col, prev, atSel, o = {}) {
  const {
    joints = 5, len = 2, wid = 0.25, count = 2, tilt = HALF, spin = HALF, taper = 0.9,
    bend = 'joint == 1 ? 1.0 : (joint == 2 ? -1.95 : -0.06)',
    lift = null, rake = null,
    name = 'Leg', every = 1, start = 0, end = -1,
  } = o;
  const br = mk(g, 'tree/branch', at(col, 0), {
    joints, rads: count, angle: tilt, spread: spin, length: len, width: wid, taper, every, start, end,
  }, name);
  link(prev, 'skeleton', br, 'skeleton');
  if (atSel) attach(atSel, br);
  const selTail = select(g, at(col, 1), br, br, { joints: 'all but first' }, name + ' tail');
  const selFirst = select(g, at(col, 2), br, br, { joints: 'first' }, name + ' socket');

  let head = xform(g, at(col + 1, 0), 'tree/rotate', br, selTail,
    { ry: `joint == 1 ? (rad == 0 ? ${HALF.toFixed(6)} : ${(-HALF).toFixed(6)}) : 0` }, 'add', at(col + 1, 1), name + ' roll');
  head = xform(g, at(col + 2, 0), 'tree/rotate', head, selTail, { rz: bend }, 'add', at(col + 2, 1), name + ' knee');
  let used = 3;
  if (lift) {
    head = xform(g, at(col + used, 0), 'tree/rotate', head, selFirst,
      { ry: `(rad == 0 ? 1 : -1) * (${lift})` }, 'add', at(col + used, 1), name + ' lift');
    used++;
  }
  if (rake) {
    head = xform(g, at(col + used, 0), 'tree/rotate', head, selFirst, { rz: rake }, 'add', at(col + used, 1), name + ' rake');
    used++;
  }
  return { br, sel: selTail, head, col: col + used };
}

// ---------------------------------------------------------------------------
// Output tails
// ---------------------------------------------------------------------------
/** Preview + Tubes + Isosurface(+curves) + Export, wired up. */
export function outputs(g, col, skelNode, curvesNode, o = {}) {
  const {
    res = 150, blend = 1.1, smooth = 2, curveRadius = 0.16, radiusMul = 1, minRadius = 0,
    tubes = true, tubeRadial = 7, showTubes = false, showPreview = false, name = 'sculpture',
    isoLive = false, curveDir = 'both', specks = 64,
  } = o;
  // Every Loft in the graph is sampled from the isosurface's curve radius: a
  // grid edge shorter than one radius is what makes neighbouring capsules fuse
  // into a smooth sheet rather than a corrugated one.
  if (curveRadius > 0) {
    for (const n of g._nodes) {
      if (n.type !== 'surface/loft') continue;
      n.properties.values.spacing = +(curveRadius * 0.8).toFixed(4);
      buildParamWidgets(n);
    }
  }
  const prev = mk(g, 'out/preview', at(col, 0), { show: showPreview }, 'Preview');
  link(skelNode, 'skeleton', prev, 'skeleton');
  let tubeNode = null;
  if (tubes) {
    tubeNode = mk(g, 'out/tubes', at(col, 1), { show: showTubes, 'radial segs': tubeRadial, subdivide: 2, 'radius x': radiusMul, 'min radius': minRadius }, 'Tubes');
    link(skelNode, 'skeleton', tubeNode, 'skeleton');
  }
  const iso = mk(g, 'out/isosurface', at(col, 2), {
    resolution: res, blend, smooth, 'curve radius': curveRadius, 'radius x': radiusMul,
    'min radius': minRadius, 'curve dir': curveDir, live: isoLive, 'drop specks': specks,
  }, 'Isosurface');
  link(skelNode, 'skeleton', iso, 'skeleton');
  if (curvesNode) link(curvesNode, 'curves', iso, 'curves');
  const exp = mk(g, 'out/export', at(col + 1, 2), { format: 'stl', name }, 'Export');
  link(iso, 'mesh', exp, 'mesh');
  return { prev, tubeNode, iso, exp };
}
