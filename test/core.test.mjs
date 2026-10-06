import { Skeleton, CH, CHAN } from '../src/core/skeleton.js';
import { buildTubes, sweepTubes } from '../src/core/tubes.js';
import { buildIso } from '../src/core/iso.js';
import { buildSurface } from '../src/core/surface.js';
import { resolveSelection, jointsOfBranches } from '../src/core/select.js';
import { toOBJ, toSTL } from '../src/core/export.js';
import { compileExpr, makeCtx, noise, ATTRS, ATTR_ALL } from '../src/core/fields.js';
import { polyline, resample, loft, gridRows, gridCols, subdivide, dedupe } from '../src/core/curves.js';

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let fails = 0;
const check = (name, ok) => { if (!ok) { fails++; console.log('FAIL', name); } else console.log('ok  ', name); };

function openEdges(indices, count = indices.length) {
  const edges = new Map();
  for (let i = 0; i < count; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const key = a < b ? a + ':' + b : b + ':' + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let open = 0;
  for (const v of edges.values()) if (v !== 2) open++;
  return open;
}
function windingAgreesWithNormals(geo) {
  let bad = 0, tot = 0;
  const p = geo.positions, n = geo.normals, idx = geo.indices, c = geo.indexCount ?? idx.length;
  for (let i = 0; i < c; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, cc = idx[i + 2] * 3;
    const nx = (p[b + 1] - p[a + 1]) * (p[cc + 2] - p[a + 2]) - (p[b + 2] - p[a + 2]) * (p[cc + 1] - p[a + 1]);
    const ny = (p[b + 2] - p[a + 2]) * (p[cc] - p[a]) - (p[b] - p[a]) * (p[cc + 2] - p[a + 2]);
    const nz = (p[b] - p[a]) * (p[cc + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[cc] - p[a]);
    const d = nx * (n[a] + n[b] + n[cc]) + ny * (n[a + 1] + n[b + 1] + n[cc + 1]) + nz * (n[a + 2] + n[b + 2] + n[cc + 2]);
    tot++; if (d < 0) bad++;
  }
  return { bad, tot };
}
// signed volume: positive when triangles wind outward
function signedVolume(geo) {
  const p = geo.positions, idx = geo.indices, c = geo.indexCount ?? idx.length;
  let v = 0;
  for (let i = 0; i < c; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, cc = idx[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[cc + 2] - p[b + 2] * p[cc + 1])
        - p[a + 1] * (p[b] * p[cc + 2] - p[b + 2] * p[cc])
        + p[a + 2] * (p[b] * p[cc + 1] - p[b + 1] * p[cc])) / 6;
  }
  return v;
}

console.log('--- skeleton ---');
const s = new Skeleton(8);
s.clear(1);
s.addBranch({ at: -1, n: 3, len: 5, wid: 1, ord: 0, nord: 1, rads: 1 });
s.applyOps([], 0, 1);
check('trunk joint1 y=5', near(s.world[1 * 16 + 13], 5));
check('trunk joint2 y=10', near(s.world[2 * 16 + 13], 10));

const b = s.addBranch({ at: 1, n: 2, len: 3, wid: .5, rz: Math.PI / 2, ord: 0, nord: 1, rads: 1 });
s.applyOps([], 0, 2);
const j0 = b.start, j1 = b.start + 1;
check('branch joint0 at (0,10,0)', near(s.world[j0 * 16 + 12], 0) && near(s.world[j0 * 16 + 13], 10));
check('branch joint1 at (-3,10,0)', near(s.world[j1 * 16 + 12], -3) && near(s.world[j1 * 16 + 13], 10));
check('branch record pj=1 depth=1 pfrac=0.5', b.pj === 1 && b.depth === 1 && b.parentBranch === 0 && near(b.pfrac, 0.5));

const s2 = new Skeleton(8); s2.clear(1);
s2.addBranch({ at: -1, n: 3, len: 2, wid: 1, taper: .5 });
s2.applyOps([], 0, 1);
check('taper compounds', near(Math.hypot(s2.world[32], s2.world[33], s2.world[34]), 0.25) && near(s2.world[2 * 16 + 13], 3));

console.log('--- selection + fields ---');
const sel = resolveSelection(s, { branches: [0] }, { joints: 'all but first' });
check('selection all-but-first of trunk = [1,2]', sel.joints.length === 2 && sel.joints[0] === 1 && sel.joints[1] === 2);
const f = compileExpr('joint * 0.1 + a');
check('expr with long names', near(f({ ...makeCtx(), joint: 3 }, { a: 1, b: 0, c: 0, d: 0 }), 1.3));
const fShort = compileExpr('i * 0.1 + a');
check('expr with short aliases still works', near(fShort({ ...makeCtx(), i: 3 }, { a: 1, b: 0, c: 0, d: 0 }), 1.3));
check('attr list has long names + pfrac', ATTRS.includes('joint') && ATTRS.includes('along') && ATTRS.includes('pfrac') && ATTR_ALL.includes('i'));
s.applyOps([{ sel: sel.joints, buildId: s.buildId, mode: 'add', chans: [{ ch: CHAN.rz, v: (c) => 0.1 * c.joint }] }], 0, 3);
check('op applied to pose', near(s.pose[1 * CH + 2], 0.1) && near(s.pose[2 * CH + 2], 0.2) && near(s.pose[0 * CH + 2], 0));
const selF = resolveSelection(s, null, { joints: 'all', filter: 'depth == 1' });
check('filter expression selects branch joints', selF.joints.length === 2 && selF.branches[0] === 1);
const selP = resolveSelection(s, null, { joints: 'all', filter: 'pfrac > 0.4 && pfrac < 0.6' });
check('pfrac filter works', selP.joints.length === 2);
check('jointsOfBranches every 2', jointsOfBranches(s, [0], 2, 0, -1).join() === '0,2');

console.log('--- curves ---');
{
  const line = polyline(3);
  line.pts.set([0, 0, 0, 0, 10, 0, 0, 20, 0]); line.rads.set([1, 1, 1]);
  const r = resample(line, 5);
  check('resample keeps the ends', near(r.pts[1], 0) && near(r.pts[4 * 3 + 1], 20));
  check('resample spaces evenly', near(r.pts[1 * 3 + 1], 5, 0.2) && near(r.pts[2 * 3 + 1], 10, 0.2));
  const sub = subdivide(line, 4);
  check('subdivide count', sub.n === 9 && near(sub.pts[8 * 3 + 1], 20));
  const dup = polyline(3); dup.pts.set([0, 0, 0, 0, 0, 0, 0, 5, 0]); dup.rads.set([1, 2, 1]);
  check('dedupe drops coincident points', dedupe(dup).n === 2);

  const a = polyline(2); a.pts.set([0, 0, 0, 0, 10, 0]); a.rads.set([1, 1]);
  const c = polyline(2); c.pts.set([4, 0, 0, 4, 10, 0]); c.rads.set([2, 2]);
  const g = loft([a, c], 5, 3);
  check('loft grid size', g.nu === 5 && g.nv === 3 && g.pts.length === 45);
  check('loft first row is rib a', near(g.pts[0], 0) && near(g.pts[4 * 3 + 1], 10));
  check('loft last row is rib c', near(g.pts[(2 * 5) * 3], 4));
  check('loft middle row interpolates', near(g.pts[(1 * 5) * 3], 2, 1e-6));
  check('loft interpolates radii', near(g.rads[1 * 5], 1.5, 1e-6));
  check('gridRows / gridCols counts', gridRows(g).length === 3 && gridCols(g).length === 5 && gridRows(g)[0].n === 5);
}

console.log('--- tubes ---');
s.applyOps([], 0, 4);
const t = buildTubes(s, { radial: 8, subdiv: 2, caps: 'ball', capRings: 3 });
check('tubes have verts', t.vertexCount > 0 && t.indexCount % 3 === 0);
{
  const w = windingAgreesWithNormals(t);
  check(`tube winding agrees with normals (${w.bad}/${w.tot} flipped)`, w.bad === 0);
}
check('tube shells watertight', openEdges(t.indices, t.indexCount) === 0);
check('tube volume positive (outward)', signedVolume(t) > 0);
const t2 = buildTubes(s, { radial: 8, subdiv: 2, caps: 'ball', capRings: 3 }, t);
check('tube buffer reuse', t2.positions === t.positions);
check('flat caps + joint balls build', buildTubes(s, { radial: 6, caps: 'flat', jointBalls: true }).vertexCount > 0);
{
  const line = polyline(4);
  line.pts.set([0, 0, 0, 0, 5, 0, 2, 9, 0, 6, 11, 0]); line.rads.set([1, 1, 0.8, 0.5]);
  const ct = sweepTubes([line], { radial: 8, subdiv: 3, caps: 'ball', capRings: 3 });
  check('sweepTubes on a bare polyline is watertight', ct.vertexCount > 0 && openEdges(ct.indices, ct.indexCount) === 0);
}

console.log('--- surface ---');
{
  const a = polyline(2); a.pts.set([0, 0, 0, 0, 10, 0]); a.rads.set([1, 1]);
  const c = polyline(2); c.pts.set([4, 0, 0, 4, 10, 0]); c.rads.set([1, 1]);
  const g = loft([a, c], 6, 4);
  const open = buildSurface([g], { mode: 'open' });
  check('open surface verts', open.vertexCount === 24 && open.indexCount === 5 * 3 * 6);
  const solid = buildSurface([g], { mode: 'solid', thickness: 0.5 });
  check('solid surface doubles the sheet', solid.vertexCount === 48);
  check(`solid surface watertight (${openEdges(solid.indices, solid.indexCount)} open edges)`, openEdges(solid.indices, solid.indexCount) === 0);
  check('solid surface volume positive (outward)', signedVolume(solid) > 0);
  const w = windingAgreesWithNormals(solid);
  check(`solid surface winding (${w.bad}/${w.tot} flipped)`, w.bad / w.tot < 0.2);   // the rim normals are the sheet's, so some disagree
}

console.log('--- isosurface ---');
const segs = new Float32Array([0, 0, 0, 1, 0, 4, 0, 1]);
const iso = buildIso(segs, { res: 48, blend: 1 });
{
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < iso.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], iso.positions[i + k]); mx[k] = Math.max(mx[k], iso.positions[i + k]); }
  console.log('   iso bbox', mn.map((v) => v.toFixed(2)), mx.map((v) => v.toFixed(2)), 'verts', iso.positions.length / 3);
  check('iso bbox ~ capsule', near(mn[0], -1, .15) && near(mx[0], 1, .15) && near(mn[1], -1, .15) && near(mx[1], 5, .15));
}
{
  let out = 0, inn = 0;
  for (let i = 0; i < iso.positions.length; i += 3) {
    const y = Math.min(4, Math.max(0, iso.positions[i + 1]));
    const dx = iso.positions[i], dy = iso.positions[i + 1] - y, dz = iso.positions[i + 2];
    if (dx * iso.normals[i] + dy * iso.normals[i + 1] + dz * iso.normals[i + 2] > 0) out++; else inn++;
  }
  check(`iso normals outward (${out} out / ${inn} in)`, inn < out * 0.02);
}
check('iso mesh watertight', openEdges(iso.indices) === 0);
// A bent chain inside ONE branch is an exact union: every surface point should sit
// at the true capsule distance. Across two branches the smooth-min adds a fillet.
{
  const bent = new Float32Array([0, 0, 0, 1, 0, 4, 0, 1, 0, 4, 0, 1, 3, 4, 0, 1]);
  // distance from a point to the capsule chain
  const distTo = (px, py, pz) => {
    let best = Infinity;
    for (let q = 0; q < bent.length; q += 8) {
      const ax = bent[q], ay = bent[q + 1], az = bent[q + 2], r = bent[q + 3];
      const bx = bent[q + 4], by = bent[q + 5], bz = bent[q + 6];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const dd = dx * dx + dy * dy + dz * dz;
      let tt = dd > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / dd : 0;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      best = Math.min(best, Math.hypot(ax + dx * tt - px, ay + dy * tt - py, az + dz * tt - pz) - r);
    }
    return best;
  };
  const worst = (geo) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < geo.positions.length; i += 3) {
      const d = distTo(geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]);
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    return { lo, hi };
  };
  const one = buildIso(bent, { res: 96, blend: 1, branchOf: new Int32Array([0, 0]) });
  const w1 = worst(one);
  check(`same-branch union stays on the true capsule surface (${w1.lo.toFixed(3)} .. ${w1.hi.toFixed(3)})`,
    Math.abs(w1.lo) < 0.06 && Math.abs(w1.hi) < 0.06);
  const two = buildIso(bent, { res: 96, blend: 2, branchOf: new Int32Array([0, 1]) });
  const w2 = worst(two);
  check(`different branches get a fillet (out to ${w2.hi.toFixed(3)})`, w2.hi > 0.15);
  const sharp = buildIso(bent, { res: 96, blend: 0, branchOf: new Int32Array([0, 1]) });
  const w3 = worst(sharp);
  check(`blend 0 is a sharp union (${w3.hi.toFixed(3)})`, Math.abs(w3.hi) < 0.06);
}
// curve-following: a curved branch sampled with smooth>1 bulges outward vs the straight chords
{
  const arc = new Skeleton(); arc.clear(1);
  arc.addBranch({ at: -1, n: 8, len: 3, wid: 1 });
  arc.applyOps([{ sel: null, buildId: arc.buildId, mode: 'add', chans: [{ ch: CHAN.rz, v: 0.35 }] }], 0, 1);
  const flat = arc.collectSegments({ smooth: 1 });
  const smooth = arc.collectSegments({ smooth: 4 });
  check('smooth sampling makes more segments', smooth.segs.length / 8 === (flat.segs.length / 8) * 4);
  // every smoothed point should sit on or outside the chord polyline, i.e. the path is longer
  const len = (r) => { let L = 0; for (let i = 0; i < r.segs.length; i += 8) L += Math.hypot(r.segs[i + 4] - r.segs[i], r.segs[i + 5] - r.segs[i + 1], r.segs[i + 6] - r.segs[i + 2]); return L; };
  check(`smoothed path is longer than the chords (${len(smooth).toFixed(2)} vs ${len(flat).toFixed(2)})`, len(smooth) > len(flat));
  check('branch ids come back with the segments', flat.branchOf.length === flat.segs.length / 8 && flat.branchOf[0] === 0);
}

console.log('--- exporters ---');
const obj = toOBJ([{ name: 'tubes', ...t }], { scale: 1 });
check('obj has faces', obj.includes('\nf ') && obj.split('\nv ').length - 1 === t.positions.length / 3);
check('stl size', toSTL([{ name: 'x', positions: t.positions, normals: t.normals, indices: t.indices.subarray(0, t.indexCount) }]).byteLength === 84 + t.indexCount / 3 * 50);
check('noise deterministic', noise(1.5, 2.5, 3.5) === noise(1.5, 2.5, 3.5) && Math.abs(noise(1.5, 2.5, 3.5)) < 1);

console.log('--- perf ---');
const big = new Skeleton(); big.clear(1);
const roots = [];
for (let r = 0; r < 10; r++) roots.push(big.addBranch({ at: -1, n: 50, len: 2, wid: .5, ry: r * .6 }));
for (const r of roots) for (let k = 0; k < 50; k += 2) big.addBranch({ at: r.start + k, n: 20, len: 1, wid: .3, rz: 1, ry: k });
const selB = resolveSelection(big, null, { joints: 'all' });
const ops = [{ sel: selB.joints, buildId: big.buildId, mode: 'add', chans: [{ ch: CHAN.rz, v: (c) => Math.sin(c.joint * .5 + c.time) * .2 }] }];
let t0 = performance.now();
for (let fr = 0; fr < 20; fr++) big.applyOps(ops, fr * .01, fr);
const evalMs = (performance.now() - t0) / 20;
t0 = performance.now();
let tb = null;
for (let fr = 0; fr < 10; fr++) tb = buildTubes(big, { radial: 8, subdiv: 3 }, tb);
const tubeMs = (performance.now() - t0) / 10;
console.log(`   ${big.count} joints, ${big.branches.length} branches: ops+evaluate ${evalMs.toFixed(2)} ms/frame, tubes(subdiv 3) ${tubeMs.toFixed(2)} ms (${tb.vertexCount} verts)`);
{
  const r = big.collectSegments({ smooth: 3 });
  t0 = performance.now();
  const isoBig = buildIso(r.segs, { res: 128, blend: 1, branchOf: r.branchOf });
  console.log(`   iso res128 smooth3: ${(performance.now() - t0).toFixed(0)} ms, ${isoBig.positions.length / 3} verts`);
  t0 = performance.now();
  const isoBig2 = buildIso(r.segs, { res: 256, blend: 1, branchOf: r.branchOf });
  console.log(`   iso res256 smooth3: ${(performance.now() - t0).toFixed(0)} ms, ${isoBig2.positions.length / 3} verts`);
  check('big iso watertight', openEdges(isoBig2.indices) === 0);
}
{
  // a lofted wing: 9 ribs -> 8 patches -> tubes both ways
  const wing = new Skeleton(); wing.clear(1);
  const stem = wing.addBranch({ at: -1, n: 1, len: 1, wid: 1 });
  for (let k = 0; k < 9; k++) wing.addBranch({ at: stem.start, n: 8, len: 7, wid: .7, rz: 0.9, ry: (k - 4) * 0.25, ord: k, nord: 9 });
  wing.applyOps([], 0, 1);
  const { skeletonPolylines } = await import('../src/core/skeleton.js');
  const lines = skeletonPolylines(wing).slice(1);
  t0 = performance.now();
  const grids = [];
  for (let i = 0; i < lines.length - 1; i++) grids.push(loft([lines[i], lines[i + 1]], 14, 5));
  const curveLines = [];
  for (const g of grids) { curveLines.push(...gridRows(g)); curveLines.push(...gridCols(g)); }
  for (const l of curveLines) for (let i = 0; i < l.n; i++) l.rads[i] = Math.max(0.08, l.rads[i] * 0.5);
  const wingGeo = sweepTubes(curveLines, { radial: 5, caps: 'ball', capRings: 3 });
  console.log(`   wing loft: ${grids.length} patches, ${curveLines.length} curves, ${wingGeo.vertexCount} verts in ${(performance.now() - t0).toFixed(0)} ms`);
  check('wing membrane watertight', openEdges(wingGeo.indices, wingGeo.indexCount) === 0);
  const surf = buildSurface(grids, { mode: 'solid', thickness: 0.3 });
  check('wing solid surface watertight', openEdges(surf.indices, surf.indexCount) === 0);
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exitCode = fails ? 1 : 0;
