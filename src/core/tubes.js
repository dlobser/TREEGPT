// ============================================================================
// tubes.js — sweep a circle along polylines.
//
// The sweep is generic (it takes polylines), so it serves both the branch tubes
// and the lofted curves from curves.js. Buffers are reused when the vertex and
// index counts have not changed, so a live tube preview is one fill pass plus a
// GPU upload.
//
// Each polyline becomes one closed shell: rotation-minimising frames along the
// chain (optionally Catmull-Rom subdivided), per-point radius, and caps that are
// stitched hemispheres ("ball", the default), a flat fan, or open.
// ============================================================================

import { skeletonPolylines } from './skeleton.js';
import { dedupe, subdivide, frames } from './curves.js';

export { skeletonPolylines };

export const CAP_MODES = ['ball', 'flat', 'none'];

export function buildTubes(skel, opts = {}, prev = null) {
  const lines = skeletonPolylines(skel, opts);
  return sweepTubes(lines, opts, prev);
}

/**
 * @param lines  array of Polyline
 * @param opts   { radial, subdiv, caps, capRings, jointBalls }
 * @param prev   previous result to reuse buffers from
 */
export function sweepTubes(lines, opts = {}, prev = null) {
  const radial = Math.max(3, opts.radial | 0 || 8);
  const subdiv = Math.max(1, opts.subdiv | 0 || 1);
  const caps = CAP_MODES.includes(opts.caps) ? opts.caps : 'ball';
  const capRings = Math.max(1, opts.capRings | 0 || 4);
  const jointBalls = !!opts.jointBalls;

  // ---- pass 1: clean the lines and count -----------------------------------
  const ready = [];
  let nv = 0, ni = 0;
  const sphereLat = capRings * 2;
  const sphV = (sphereLat - 1) * radial + 2, sphI = ((sphereLat - 2) * radial * 2 + 2 * radial) * 3;

  for (const raw of lines) {
    if (!raw || raw.n < 2) continue;
    const clean = dedupe(raw, 1e-5);
    if (clean.n < 2) continue;
    const line = subdiv > 1 ? subdivide(clean, subdiv) : clean;
    line.source = clean;
    ready.push(line);
    const P = line.n;
    nv += P * radial; ni += (P - 1) * radial * 6;
    if (caps === 'ball') { nv += 2 * ((capRings - 1) * radial + 1); ni += 2 * ((capRings - 1) * radial * 6 + radial * 3); }
    else if (caps === 'flat') { nv += 2; ni += 2 * radial * 3; }
    if (jointBalls) { nv += clean.n * sphV; ni += clean.n * sphI; }
  }

  // ---- allocate (reuse when sizes match) ----------------------------------
  let out = prev;
  if (!out || out.positions.length !== nv * 3 || out.indices.length !== ni) {
    out = {
      positions: new Float32Array(nv * 3),
      normals: new Float32Array(nv * 3),
      indices: nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni),
    };
  }
  out.vertexCount = nv; out.indexCount = ni;
  const pos = out.positions, nor = out.normals, idx = out.indices;
  let vi = 0, ii = 0;
  const vert = (x, y, z, nx, ny, nz) => { const o = vi * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz; return vi++; };
  const tri = (a, b, c) => { idx[ii++] = a; idx[ii++] = b; idx[ii++] = c; };
  const ringQuads = (la, lb, flip) => {
    for (let s = 0; s < radial; s++) {
      const s1 = (s + 1) % radial;
      const a = la + s, b = la + s1, c = lb + s, d = lb + s1;
      if (!flip) { tri(a, b, d); tri(a, d, c); } else { tri(a, d, b); tri(a, c, d); }
    }
  };
  const fan = (ring, pole, flip) => {
    for (let s = 0; s < radial; s++) {
      const s1 = (s + 1) % radial;
      if (!flip) tri(ring + s, ring + s1, pole); else tri(ring + s, pole, ring + s1);
    }
  };
  const cosT = new Float64Array(radial), sinT = new Float64Array(radial);
  for (let s = 0; s < radial; s++) { const t = s / radial * Math.PI * 2; cosT[s] = Math.cos(t); sinT[s] = Math.sin(t); }

  // hemisphere cap. dir = outward axis (unit), (N,B) = ring basis of the tube end
  const cap = (cx, cy, cz, dx, dy, dz, nx, ny, nz, bx, by, bz, r, ring0, flip) => {
    let prevRing = ring0;
    for (let q = 1; q < capRings; q++) {
      const phi = q / capRings * Math.PI * 0.5, cp = Math.cos(phi), sp = Math.sin(phi);
      const ring = vi;
      for (let s = 0; s < radial; s++) {
        const rx = nx * cosT[s] + bx * sinT[s], ry = ny * cosT[s] + by * sinT[s], rz = nz * cosT[s] + bz * sinT[s];
        const nnx = rx * cp + dx * sp, nny = ry * cp + dy * sp, nnz = rz * cp + dz * sp;
        vert(cx + nnx * r, cy + nny * r, cz + nnz * r, nnx, nny, nnz);
      }
      ringQuads(prevRing, ring, flip);
      prevRing = ring;
    }
    const pole = vert(cx + dx * r, cy + dy * r, cz + dz * r, dx, dy, dz);
    fan(prevRing, pole, flip);
  };

  const sphere = (cx, cy, cz, r) => {
    const bottom = vert(cx, cy - r, cz, 0, -1, 0);
    let prevRing = -1;
    for (let q = 1; q < sphereLat; q++) {
      const phi = -Math.PI * 0.5 + q / sphereLat * Math.PI, cp = Math.cos(phi), sp = Math.sin(phi);
      const ring = vi;
      for (let s = 0; s < radial; s++) {
        const nx = sinT[s] * cp, ny = sp, nz = cosT[s] * cp;
        vert(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz);
      }
      if (q === 1) fan(ring, bottom, true); else ringQuads(prevRing, ring, false);
      prevRing = ring;
    }
    const top = vert(cx, cy + r, cz, 0, 1, 0);
    fan(prevRing, top, false);
  };

  // ---- pass 2: frames + geometry ------------------------------------------
  for (const line of ready) {
    const { pts, rads, n: P } = line;
    const { T, N, B } = frames(line);
    const rings = new Int32Array(P);
    for (let i = 0; i < P; i++) {
      const r = rads[i], px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const bx = B[i * 3], by = B[i * 3 + 1], bz = B[i * 3 + 2];
      rings[i] = vi;
      for (let s = 0; s < radial; s++) {
        const dx = nx * cosT[s] + bx * sinT[s], dy = ny * cosT[s] + by * sinT[s], dz = nz * cosT[s] + bz * sinT[s];
        vert(px + dx * r, py + dy * r, pz + dz * r, dx, dy, dz);
      }
      if (i > 0) ringQuads(rings[i - 1], rings[i], false);
    }
    const last = P - 1;
    if (caps === 'ball') {
      cap(pts[0], pts[1], pts[2], -T[0], -T[1], -T[2], N[0], N[1], N[2], B[0], B[1], B[2], rads[0], rings[0], true);
      cap(pts[last * 3], pts[last * 3 + 1], pts[last * 3 + 2], T[last * 3], T[last * 3 + 1], T[last * 3 + 2],
        N[last * 3], N[last * 3 + 1], N[last * 3 + 2], B[last * 3], B[last * 3 + 1], B[last * 3 + 2], rads[last], rings[last], false);
    } else if (caps === 'flat') {
      const c0 = vert(pts[0], pts[1], pts[2], -T[0], -T[1], -T[2]);
      fan(rings[0], c0, true);
      const c1 = vert(pts[last * 3], pts[last * 3 + 1], pts[last * 3 + 2], T[last * 3], T[last * 3 + 1], T[last * 3 + 2]);
      fan(rings[last], c1, false);
    }
    if (jointBalls) {
      const s = line.source;
      for (let k = 0; k < s.n; k++) sphere(s.pts[k * 3], s.pts[k * 3 + 1], s.pts[k * 3 + 2], s.rads[k]);
    }
  }
  return out;
}
