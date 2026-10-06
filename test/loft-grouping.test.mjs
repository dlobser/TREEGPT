import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Skeleton, composeMatrix } from '../src/core/skeleton.js';
import { runtime } from '../src/app/runtime.js';
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../lib/litegraph.js', import.meta.url), 'utf8'));
await import('../src/nodes/surface.js');
const skel = new Skeleton();
const arms = [], ribs = [];
for (let arm = 0; arm < 3; arm++) {
  const root = composeMatrix(new Float32Array(16), 0, 0, 0, arm * 100, 0, 0);
  const parent = skel.addBranch({ n: 3, len: 2, root });
  arms.push(parent);
  ribs.push(Array.from({ length: 3 }, (_, j) => skel.addBranch({ at: parent.start + j, n: 3, len: 3, rz: 0.3 }).id));
}
// Interleaving ensures grouping uses parent identity, not contiguous runs or ordinals.
const ids = [0, 1, 2].flatMap(j => ribs.map(group => group[j]));
const node = LiteGraph.createNode('surface/loft');
let result;
node.getInputData = slot => slot === 0 ? { skel, ops: [], set: { branches: ids } } : undefined;
node.setOutputData = (_, data) => { result = data; };
const run = (values = {}) => {
  Object.assign(node.properties.values, { 'group by': 'parent branch', span: 'pairs', closed: false, every: 1 }, values);
  runtime.frame++;
  node.onExecute();
  assert.equal(node._err, undefined);
  return result;
};
const isolated = expected => {
  assert.equal(result.grids.length, expected);
  const centers = new Set();
  for (const g of result.grids) {
    const xs = Array.from(g.pts).filter((_, i) => i % 3 === 0);
    assert.ok(xs.every(Number.isFinite));
    assert.ok(Math.max(...xs) - Math.min(...xs) < 20, 'patch bridges separate arms');
    centers.add(Math.round(xs[0] / 100));
  }
  assert.deepEqual([...centers].sort(), [0, 1, 2]);
};
run(); isolated(6);
run({ closed: true }); isolated(9);
run({ span: 'whole set' }); isolated(3);
run({ span: 'whole set', closed: true }); isolated(3);
run({ every: 2 }); isolated(3); // sampling restarts within each three-rib group
run({ 'group by': 'none' }); assert.equal(result.grids.length, 8);
run({ 'group by': 'none', closed: true }); assert.equal(result.grids.length, 9);
run({ 'group by': 'none', span: 'whole set' }); assert.equal(result.grids.length, 1);
node.getInputData = slot => slot === 0 ? { skel, ops: [], set: { branches: ids } } : { branches: [ribs[0][0], ...ribs[1], ribs[2][0]] };
run(); assert.equal(result.grids.length, 2); // singleton groups are skipped
node.getInputData = slot => slot === 0 ? { skel, ops: [], set: { branches: ids } } : { branches: ribs.map(group => group[0]) };
run(); assert.equal(result, undefined); // no stale output when no group can loft
assert.match(node._info, /2\+ ribs/);
node.getInputData = slot => slot === 0 ? { skel, ops: [], set: { branches: ids } } : { branches: ribs.flat() };
run({ 'group by': undefined }); assert.equal(result.grids.length, 8); // old saved graphs
const restored = LiteGraph.createNode('surface/loft');
run(); restored.configure(node.serialize());
assert.equal(restored.properties.values['group by'], 'parent branch');
// Terminal roots share parent -1 and remain loftable as a single group.
node.getInputData = slot => slot === 0 ? { skel, ops: [], set: { branches: arms.map(arm => arm.id) } } : undefined;
run(); assert.equal(result.grids.length, 2);
console.log('Loft grouping: parent isolation, pairs/whole set, closing, sampling, selections, legacy defaults and save/load passed.');
