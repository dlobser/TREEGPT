// ============================================================================
// surface.js — turn a lofted grid into a mesh.
//
// `open`  : one sheet, rendered double-sided (the old openSurface).
// `solid` : the sheet plus a copy pushed along -normal by `thickness`, with the
//           four borders stitched, so the result is watertight and printable
//           (the old solidify/solidSurface, but closed on all four sides).
// ============================================================================

import { gridNormals } from './curves.js';

export function buildSurface(grids, opts = {}, prev = null) {
  const solid = opts.mode !== 'open';
  const thickness = Math.max(0, opts.thickness ?? 1);
  const list = (Array.isArray(grids) ? grids : [grids]).filter((g) => g && g.nu > 1 && g.nv > 1);

  let nv = 0, ni = 0;
  for (const g of list) {
    const face = g.nu * g.nv;
    const quads = (g.nu - 1) * (g.nv - 1);
    if (solid) { nv += face * 2; ni += quads * 12 + ((g.nu - 1) + (g.nv - 1)) * 2 * 6; }
    else { nv += face; ni += quads * 6; }
  }

  let out = prev;
  if (!out || out.positions.length !== nv * 3 || out.indices.length !== ni) {
    out = { positions: new Float32Array(nv * 3), normals: new Float32Array(nv * 3), indices: nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni) };
  }
  out.vertexCount = nv; out.indexCount = ni;
  out.doubleSided = !solid;
  const pos = out.positions, nor = out.normals, idx = out.indices;
  let vi = 0, ii = 0;
  const tri = (a, b, c) => { idx[ii++] = a; idx[ii++] = b; idx[ii++] = c; };

  for (const g of list) {
    const { pts, nu, nv: gv } = g;
    const N = gridNormals(g);
    const face = nu * gv;
    const F = vi;
    for (let i = 0; i < face; i++) {
      const o = vi * 3;
      pos[o] = pts[i * 3]; pos[o + 1] = pts[i * 3 + 1]; pos[o + 2] = pts[i * 3 + 2];
      nor[o] = N[i * 3]; nor[o + 1] = N[i * 3 + 1]; nor[o + 2] = N[i * 3 + 2];
      vi++;
    }
    let B = -1;
    if (solid) {
      B = vi;
      for (let i = 0; i < face; i++) {
        const o = vi * 3;
        pos[o] = pts[i * 3] - N[i * 3] * thickness;
        pos[o + 1] = pts[i * 3 + 1] - N[i * 3 + 1] * thickness;
        pos[o + 2] = pts[i * 3 + 2] - N[i * 3 + 2] * thickness;
        nor[o] = -N[i * 3]; nor[o + 1] = -N[i * 3 + 1]; nor[o + 2] = -N[i * 3 + 2];
        vi++;
      }
    }
    const f = (u, v) => F + v * nu + u;
    const b = (u, v) => B + v * nu + u;
    for (let v = 0; v < gv - 1; v++) {
      for (let u = 0; u < nu - 1; u++) {
        const a = f(u, v), bb = f(u + 1, v), c = f(u + 1, v + 1), d = f(u, v + 1);
        tri(a, bb, c); tri(a, c, d);
        if (solid) {
          const a2 = b(u, v), b2 = b(u + 1, v), c2 = b(u + 1, v + 1), d2 = b(u, v + 1);
          tri(a2, c2, b2); tri(a2, d2, c2);
        }
      }
    }
    if (solid) {
      for (let u = 0; u < nu - 1; u++) {
        // v = 0 border, outward is -dv
        tri(f(u, 0), b(u, 0), b(u + 1, 0)); tri(f(u, 0), b(u + 1, 0), f(u + 1, 0));
        // v = last border, outward is +dv
        const L = gv - 1;
        tri(f(u, L), f(u + 1, L), b(u + 1, L)); tri(f(u, L), b(u + 1, L), b(u, L));
      }
      for (let v = 0; v < gv - 1; v++) {
        // u = 0 border, outward is -du
        tri(f(0, v), f(0, v + 1), b(0, v + 1)); tri(f(0, v), b(0, v + 1), b(0, v));
        // u = last border, outward is +du
        const L = nu - 1;
        tri(f(L, v), b(L, v), b(L, v + 1)); tri(f(L, v), b(L, v + 1), f(L, v + 1));
      }
    }
  }
  return out;
}
