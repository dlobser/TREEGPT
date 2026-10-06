#!/usr/bin/env node
// ============================================================================
// export-examples.mjs — turn the example builders into loadable graph files.
//
//   node tools/export-examples.mjs
//
// Writes examples/flowers/NN-slug.json and examples/insects/NN-slug.json — each
// one exactly what the app's Save button produces, so Load opens it — plus
// examples/catalog.json, which the Examples menu reads and which carries a real
// geometry check per model (watertightness, component count, volume, bounds).
//
// The builders in examples/*.js stay the source of truth; re-run this after
// editing one. It works because src/core/ has no DOM and no three.js, so the
// only shims needed are a `window` for litegraph and a synchronous stand-in for
// the isosurface Web Worker.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---- minimal browser shims -------------------------------------------------
globalThis.window = globalThis;
globalThis.navigator ??= { userAgent: 'node' };
const stubElement = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
  appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
  setAttribute() {}, getAttribute: () => null, getContext: () => null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  querySelector: () => null, querySelectorAll: () => [],
});
globalThis.document ??= {
  createElement: stubElement, body: stubElement(), documentElement: stubElement(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// litegraph is a UMD bundle that assigns onto `this`
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'lib', 'litegraph.js'), 'utf8'),
  { filename: 'litegraph.js' });
if (!globalThis.LiteGraph) throw new Error('litegraph did not load');

// The Isosurface node posts to a Worker. Give it a synchronous one so the graph
// runs unchanged and we get the very geometry the app would produce.
const { buildIso } = await import(pathToFileURL(path.join(ROOT, 'src/core/iso.js')));
globalThis.Worker = class {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(msg) {
    let out;
    try {
      const r = buildIso(msg.segs, msg.opts);
      out = { id: msg.id, ok: true, positions: r.positions, normals: r.normals, indices: r.indices, cells: r.cells, parts: r.parts, time: r.time };
    } catch (e) { out = { id: msg.id, ok: false, error: String(e.message || e) }; }
    queueMicrotask(() => this.onmessage && this.onmessage({ data: out }));
  }
  terminate() {}
};

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { registerNodes } = await imp('src/nodes/index.js');
await registerNodes();
const { runtime } = await imp('src/app/runtime.js');
const { FLOWERS } = await imp('examples/flowers.js');
const { INSECTS } = await imp('examples/insects.js');

// ---- geometry checks -------------------------------------------------------
function inspect(geo) {
  if (!geo || !geo.indices) return null;
  const vc = geo.vertexCount ?? geo.positions.length / 3;
  const ic = geo.indexCount ?? geo.indices.length;
  const pos = geo.positions, idx = geo.indices;

  // non-manifold / boundary edges
  const edges = new Map();
  for (let i = 0; i < ic; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let nonManifold = 0;
  for (const v of edges.values()) if (v !== 2) nonManifold++;

  // connected components, by triangle count
  const parent = new Int32Array(vc);
  for (let i = 0; i < vc; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let i = 0; i < ic; i += 3) { union(idx[i], idx[i + 1]); union(idx[i + 1], idx[i + 2]); }
  // Per component: triangle count and signed volume. A negative volume is an
  // inward-facing shell — a sealed void, such as the air under a wing case —
  // which prints fine. A positive one that is not the main body is a piece
  // floating free, which does not.
  const perRoot = new Map();
  for (let i = 0; i < ic; i += 3) {
    const r = find(idx[i]);
    let e = perRoot.get(r);
    if (!e) perRoot.set(r, e = { tris: 0, vol: 0 });
    e.tris++;
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    e.vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
            - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
            + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
  }
  const parts = [...perRoot.values()].sort((a, b) => b.tris - a.tris)
    .map((e) => ({ triangles: e.tris, volume: +e.vol.toFixed(3) }));
  const components = parts.map((e) => e.triangles);
  const loose = parts.filter((e, i) => i > 0 && e.volume > 0).length;

  // signed volume and bounds
  let vol = 0;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ic; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
          - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
          + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
  }
  let finite = true;
  for (let i = 0; i < vc * 3; i++) {
    const v = pos[i];
    if (!Number.isFinite(v)) { finite = false; continue; }
    const a = i % 3;
    if (v < mn[a]) mn[a] = v;
    if (v > mx[a]) mx[a] = v;
  }
  return {
    finite, vertices: vc, triangles: ic / 3, nonManifoldEdges: nonManifold,
    components, parts, loose, volume: vol, bounds: [...mn, ...mx],
  };
}

// ---- run one example -------------------------------------------------------
const { LGraph } = globalThis;

async function build(entry, kind, index) {
  const graph = new LGraph();
  runtime.graph = graph;
  runtime.viewer = null;
  runtime.buildId++;
  runtime.time = 0;
  runtime.paused = true;
  entry.build(graph);

  // step until the isosurface has settled
  const iso = graph._nodes.find((n) => n.type === 'out/isosurface');
  if (iso) iso._pending = true;
  for (let i = 0; i < 8; i++) {
    runtime.frame++;
    graph.runStep(1, true);
    await new Promise((r) => setImmediate(r));
    if (iso && iso._geo && !iso._busy && !iso._pending) break;
  }

  const failed = graph._nodes.filter((n) => n._err).map((n) => `${n.title}: ${n._err}`);
  const meshNode = iso
    || graph._nodes.find((n) => n.type === 'out/merge')
    || graph._nodes.find((n) => n.type === 'surface/mesh');
  const geo = meshNode && (meshNode._geo || (meshNode.getOutputData && meshNode.getOutputData(0)));
  const validation = inspect(geo);
  // Separate shells only signal a broken print when the isosurface built the
  // mesh, since that unions everything it touches. A Merge output is overlapping
  // closed shells on purpose.
  if (validation) validation.unioned = meshNode === iso;

  const patches = graph._nodes
    .filter((n) => n.type === 'surface/loft' && n._info)
    .map((n) => ({ title: n.title, info: n._info }));

  const data = graph.serialize();
  const slug = entry.slug || `${String(index + 1).padStart(2, '0')}-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  data.extra = {
    title: entry.name,
    slug,
    description: entry.desc || '',
    collection: `TREE · ${kind === 'flowers' ? 'Flowers' : 'Insects'}`,
    units: 'Graph units; set the Export node scale for your printer',
    notes: 'Built by tools/export-examples.mjs from examples/' + kind + '.js. '
         + 'The Isosurface node is not live: press "Build now" on it after editing.',
  };
  return { data, slug, failed, validation, patches, nodes: graph._nodes.length };
}

// ---- main ------------------------------------------------------------------
const catalog = [];
let problems = 0;

for (const [kind, list] of [['flowers', FLOWERS], ['insects', INSECTS]]) {
  const dir = path.join(ROOT, 'examples', kind);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, entry] of list.entries()) {
    const r = await build(entry, kind, i);
    fs.writeFileSync(path.join(dir, r.slug + '.json'), JSON.stringify(r.data, null, 1));
    const v = r.validation;
    const ok = r.failed.length === 0 && v && v.finite && v.nonManifoldEdges === 0 && v.vertices > 0 && (!v.unioned || v.loose === 0);
    if (!ok) problems++;
    catalog.push({
      name: entry.name,
      slug: r.slug,
      kind,
      file: `examples/${kind}/${r.slug}.json`,
      description: entry.desc || '',
      color: entry.color || '#d8d8d8',
      nodes: r.nodes,
      patches: r.patches,
      validation: v,
      errors: r.failed,
    });
    const size = v ? v.bounds.slice(3).map((x, k) => (x - v.bounds[k]).toFixed(1)).join(' x ') : '-';
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${kind}/${r.slug}`.padEnd(46),
      v ? `${String(v.vertices).padStart(7)} verts  ${String(v.nonManifoldEdges).padStart(3)} open  ${String(v.components.length).padStart(2)} parts  ${v.loose ? String(v.loose).padStart(2) + ' loose' : '        '}  ${size}` : 'no mesh',
      r.failed.length ? '  ' + r.failed.join('; ') : '');
  }
}

fs.writeFileSync(path.join(ROOT, 'examples', 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`\nwrote ${catalog.length} graphs + examples/catalog.json`);
if (problems) { console.log(`${problems} with problems`); process.exitCode = 1; }
