// ============================================================================
// viewer.js — the three.js preview. Skeletons are drawn as two InstancedMeshes
// (balls and segments), so a 10k-joint tree is two draw calls and one typed
// array upload per frame instead of thirty thousand scene-graph objects.
// Tube and isosurface meshes are owned by their nodes and updated in place.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CH } from '../core/skeleton.js';

const BG = { dark: 0x1b1d21, light: 0xf1f1ee };

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 20000);
    this.camera.position.set(60, 50, 140);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(1, 1.2, 0.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb0d8, 0.5); fill.position.set(-1, 0.4, -0.8); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe8d0, 0.35); rim.position.set(0.2, -1, 0.4); this.scene.add(rim);

    this.grid = new THREE.GridHelper(200, 20, 0x666a72, 0x3a3d44);
    this.grid.material.transparent = true; this.grid.material.opacity = 0.5;
    this.scene.add(this.grid);
    this.bgMode = 'dark';
    this.setBackground('dark');

    this.views = new Map();    // node.id -> SkeletonView
    this.meshes = new Map();   // node.id -> { mesh, geo }

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setBackground(mode) {
    this.bgMode = mode;
    this.scene.background = new THREE.Color(BG[mode] ?? BG.dark);
    const dark = mode === 'dark';
    this.grid.material.color.set(dark ? 0x555a63 : 0xb5b8c0);
  }
  toggleBackground() { this.setBackground(this.bgMode === 'dark' ? 'light' : 'dark'); return this.bgMode; }
  toggleGrid() { this.grid.visible = !this.grid.visible; return this.grid.visible; }

  // ---- skeleton instancing --------------------------------------------------
  updateSkeletonView(node, skel, opts) {
    let v = this.views.get(node.id);
    if (v && v.node !== node) { v.dispose(); v = null; }     // id reused by a different node
    if (!v) { v = new SkeletonView(this.scene); v.node = node; this.views.set(node.id, v); }
    v.update(skel, opts);
  }
  removeSkeletonView(node) {
    const v = this.views.get(node.id);
    if (v) { v.dispose(); this.views.delete(node.id); }
  }

  // ---- node-owned meshes ----------------------------------------------------
  updateMesh(node, geo, opts = {}) {
    let rec = this.meshes.get(node.id);
    if (rec && rec.node !== node) { this.removeMesh(node); rec = null; }   // id reused
    if (!rec) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      rec = { mesh, node, pos: null, nor: null, idx: null };
      this.meshes.set(node.id, rec);
    }
    const g = rec.mesh.geometry;
    const vc = geo.vertexCount ?? geo.positions.length / 3;
    const ic = geo.indexCount ?? geo.indices.length;
    if (rec.pos !== geo.positions) {
      g.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3).setUsage(THREE.DynamicDrawUsage));
      rec.pos = geo.positions; rec.nor = geo.normals;
    } else {
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
    }
    if (rec.idx !== geo.indices) { g.setIndex(new THREE.BufferAttribute(geo.indices, 1)); rec.idx = geo.indices; }
    else g.index.needsUpdate = true;
    g.setDrawRange(0, ic);
    g.attributes.position.count = vc;
    g.boundingSphere = null; g.boundingBox = null;
    if (opts.color !== undefined) rec.mesh.material.color.set(opts.color);
    if (opts.wire !== undefined) rec.mesh.material.wireframe = !!opts.wire;
    rec.mesh.visible = opts.visible !== false;
  }
  setMeshVisible(node, visible) { const r = this.meshes.get(node.id); if (r) r.mesh.visible = visible; }
  removeMesh(node) {
    const r = this.meshes.get(node.id);
    if (r) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.meshes.delete(node.id); }
  }

  /**
   * Drop any geometry whose node is gone. litegraph reuses node ids after a
   * clear, so a graph that shrinks can otherwise leave ghosts on screen.
   */
  prune(graph) {
    // Match on the node object, not its id: litegraph restarts ids from 1 after a
    // clear, so a new graph can reuse an id for a node that owns no geometry and
    // the old mesh would otherwise linger in the scene.
    const live = new Set(graph._nodes);
    for (const [id, r] of [...this.meshes]) {
      if (live.has(r.node)) continue;
      this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose();
      this.meshes.delete(id);
    }
    for (const [id, v] of [...this.views]) {
      if (live.has(v.node)) continue;
      v.dispose();
      this.views.delete(id);
    }
  }

  // ---- framing --------------------------------------------------------------
  bounds() {
    const box = new THREE.Box3();
    for (const v of this.views.values()) if (v.group.visible && v.bounds) box.union(v.bounds);
    for (const r of this.meshes.values()) {
      if (!r.mesh.visible || !r.mesh.geometry.attributes.position || r.mesh.geometry.attributes.position.count === 0) continue;
      r.mesh.geometry.computeBoundingBox();
      box.union(r.mesh.geometry.boundingBox);
    }
    return box.isEmpty() ? null : box;
  }
  fit() {
    const box = this.bounds();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1e-3, box.getSize(new THREE.Vector3()).length() * 0.5);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * 1.05;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!isFinite(dir.length()) || dir.length() < 1e-6) dir.set(0.4, 0.3, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist * 0.001); this.camera.far = dist * 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}

// ----------------------------------------------------------------------------
const ballGeo = new THREE.SphereGeometry(1, 12, 8);
const segGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); segGeo.translate(0, 0.5, 0);

class SkeletonView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.55, metalness: 0 });
    this.capBalls = 0; this.capSegs = 0;
    this.balls = null; this.segs = null;
    this.bounds = new THREE.Box3();
    this._ensure(1024, 1024);
  }
  _ensure(nb, ns) {
    if (nb > this.capBalls) {
      if (this.balls) { this.group.remove(this.balls); this.balls.dispose(); }
      this.capBalls = Math.max(1024, 1 << Math.ceil(Math.log2(nb)));
      this.balls = new THREE.InstancedMesh(ballGeo, this.material, this.capBalls);
      this.balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.balls.frustumCulled = false;
      this.group.add(this.balls);
    }
    if (ns > this.capSegs) {
      if (this.segs) { this.group.remove(this.segs); this.segs.dispose(); }
      this.capSegs = Math.max(1024, 1 << Math.ceil(Math.log2(ns)));
      this.segs = new THREE.InstancedMesh(segGeo, this.material, this.capSegs);
      this.segs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.segs.frustumCulled = false;
      this.group.add(this.segs);
    }
  }
  update(skel, opts = {}) {
    const n = skel.count, nb = n + skel.branches.length;
    this._ensure(nb, n);
    const W = skel.world, pose = skel.pose;
    const bm = this.balls.instanceMatrix.array, sm = this.segs.instanceMatrix.array;
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let j = 0; j < n; j++) {
      const o = j * 16, q = j * CH, wid = pose[q + 10], len = pose[q + 9];
      const b = j * 16;
      bm[b] = W[o] * wid; bm[b + 1] = W[o + 1] * wid; bm[b + 2] = W[o + 2] * wid; bm[b + 3] = 0;
      bm[b + 4] = W[o + 4] * wid; bm[b + 5] = W[o + 5] * wid; bm[b + 6] = W[o + 6] * wid; bm[b + 7] = 0;
      bm[b + 8] = W[o + 8] * wid; bm[b + 9] = W[o + 9] * wid; bm[b + 10] = W[o + 10] * wid; bm[b + 11] = 0;
      bm[b + 12] = W[o + 12]; bm[b + 13] = W[o + 13]; bm[b + 14] = W[o + 14]; bm[b + 15] = 1;
      sm[b] = W[o] * wid; sm[b + 1] = W[o + 1] * wid; sm[b + 2] = W[o + 2] * wid; sm[b + 3] = 0;
      sm[b + 4] = W[o + 4] * len; sm[b + 5] = W[o + 5] * len; sm[b + 6] = W[o + 6] * len; sm[b + 7] = 0;
      sm[b + 8] = W[o + 8] * wid; sm[b + 9] = W[o + 9] * wid; sm[b + 10] = W[o + 10] * wid; sm[b + 11] = 0;
      sm[b + 12] = W[o + 12]; sm[b + 13] = W[o + 13]; sm[b + 14] = W[o + 14]; sm[b + 15] = 1;
      const x = W[o + 12], y = W[o + 13], z = W[o + 14];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    // tip balls, one per branch
    let k = n;
    for (const br of skel.branches) {
      const j = br.start + br.n - 1, o = j * 16, q = j * CH, wid = pose[q + 10], len = pose[q + 9], b = k * 16;
      bm[b] = W[o] * wid; bm[b + 1] = W[o + 1] * wid; bm[b + 2] = W[o + 2] * wid; bm[b + 3] = 0;
      bm[b + 4] = W[o + 4] * wid; bm[b + 5] = W[o + 5] * wid; bm[b + 6] = W[o + 6] * wid; bm[b + 7] = 0;
      bm[b + 8] = W[o + 8] * wid; bm[b + 9] = W[o + 9] * wid; bm[b + 10] = W[o + 10] * wid; bm[b + 11] = 0;
      const x = W[o + 12] + W[o + 4] * len, y = W[o + 13] + W[o + 5] * len, z = W[o + 14] + W[o + 6] * len;
      bm[b + 12] = x; bm[b + 13] = y; bm[b + 14] = z; bm[b + 15] = 1;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
      k++;
    }
    this.balls.count = opts.balls === false ? 0 : nb;
    this.segs.count = opts.segments === false ? 0 : n;
    this.balls.instanceMatrix.needsUpdate = true;
    this.segs.instanceMatrix.needsUpdate = true;
    if (opts.color !== undefined) this.material.color.set(opts.color);
    this.group.visible = opts.visible !== false;
    if (n > 0) this.bounds.min.set(minx, miny, minz), this.bounds.max.set(maxx, maxy, maxz); else this.bounds.makeEmpty();
  }
  dispose() {
    this.scene.remove(this.group);
    if (this.balls) this.balls.dispose();
    if (this.segs) this.segs.dispose();
    this.material.dispose();
  }
}
