// Web Worker: builds the isosurface off the main thread so the graph and the
// preview keep responding while a high-resolution mesh is polygonised.
import { buildIso } from '../core/iso.js';

self.onmessage = (e) => {
  const { id, segs, opts } = e.data;
  try {
    const r = buildIso(segs, opts);
    self.postMessage({ id, ok: true, positions: r.positions, normals: r.normals, indices: r.indices, cells: r.cells, parts: r.parts, time: r.time },
      [r.positions.buffer, r.normals.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
