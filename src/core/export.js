// ============================================================================
// export.js — OBJ and binary STL writers. Pure: typed arrays in, string /
// ArrayBuffer out. `parts` is [{ name, positions, normals?, indices }].
// ============================================================================

export function toOBJ(parts, { scale = 1, precision = 5 } = {}) {
  let s = '# TREE export\n';
  let voff = 1;
  const f = (v) => (v * scale).toFixed(precision);
  for (const part of parts) {
    if (!part || !part.positions || part.positions.length === 0) continue;
    const pos = part.positions, nor = part.normals, idx = part.indices;
    const nv = pos.length / 3;
    s += `o ${part.name || 'part'}\n`;
    const lines = new Array(nv);
    for (let i = 0; i < nv; i++) lines[i] = `v ${f(pos[i * 3])} ${f(pos[i * 3 + 1])} ${f(pos[i * 3 + 2])}`;
    s += lines.join('\n') + '\n';
    const hasN = nor && nor.length === pos.length;
    if (hasN) {
      const nl = new Array(nv);
      for (let i = 0; i < nv; i++) nl[i] = `vn ${nor[i * 3].toFixed(4)} ${nor[i * 3 + 1].toFixed(4)} ${nor[i * 3 + 2].toFixed(4)}`;
      s += nl.join('\n') + '\n';
    }
    const nt = idx.length / 3;
    const fl = new Array(nt);
    for (let i = 0; i < nt; i++) {
      const a = idx[i * 3] + voff, b = idx[i * 3 + 1] + voff, c = idx[i * 3 + 2] + voff;
      fl[i] = hasN ? `f ${a}//${a} ${b}//${b} ${c}//${c}` : `f ${a} ${b} ${c}`;
    }
    s += fl.join('\n') + '\n';
    voff += nv;
  }
  return s;
}

export function toSTL(parts, { scale = 1 } = {}) {
  let ntri = 0;
  for (const p of parts) if (p && p.indices) ntri += p.indices.length / 3;
  const buf = new ArrayBuffer(84 + ntri * 50);
  const dv = new DataView(buf);
  const header = 'TREE export (binary STL)';
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  dv.setUint32(80, ntri, true);
  let off = 84;
  for (const p of parts) {
    if (!p || !p.indices) continue;
    const pos = p.positions, idx = p.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ax = pos[a] * scale, ay = pos[a + 1] * scale, az = pos[a + 2] * scale;
      const bx = pos[b] * scale, by = pos[b + 1] * scale, bz = pos[b + 2] * scale;
      const cx = pos[c] * scale, cy = pos[c + 1] * scale, cz = pos[c + 2] * scale;
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
      dv.setFloat32(off + 12, ax, true); dv.setFloat32(off + 16, ay, true); dv.setFloat32(off + 20, az, true);
      dv.setFloat32(off + 24, bx, true); dv.setFloat32(off + 28, by, true); dv.setFloat32(off + 32, bz, true);
      dv.setFloat32(off + 36, cx, true); dv.setFloat32(off + 40, cy, true); dv.setFloat32(off + 44, cz, true);
      dv.setUint16(off + 48, 0, true);
      off += 50;
    }
  }
  return buf;
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
