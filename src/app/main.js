// ============================================================================
// main.js — layout, litegraph canvas, three.js viewer, the frame loop, the
// slider drawer, the preset library, save/load, export.
// ============================================================================

import { Viewer } from './viewer.js';
import { runtime } from './runtime.js';
import { registerNodes, PALETTE } from '../nodes/index.js';
import { PRESETS, buildPreset } from './presets.js';
import { exportMeshes } from '../nodes/output.js';
import { paramAtLocalY, pinSlotFor } from '../nodes/common.js';
import { loadLibrary, savePreset, deletePreset, renamePreset, insertPreset, exportLibrary, importLibrary, groupSelection } from './library.js';
import { ATTR_INFO } from '../core/fields.js';

const LiteGraph = window.LiteGraph, LGraph = window.LGraph, LGraphCanvas = window.LGraphCanvas;
const $ = (id) => document.getElementById(id);
const GRAPH_KEY = 'tree.graph.v1', UI_KEY = 'tree.ui.v1';

async function main() {
  await registerNodes();

  // ---- graph + canvas -----------------------------------------------------
  const graph = new LGraph();
  runtime.graph = graph;
  const canvasEl = $('graphcanvas');
  const lcanvas = new LGraphCanvas(canvasEl, graph);
  lcanvas.render_canvas_border = false;
  lcanvas.allow_searchbox = true;
  lcanvas.show_info = false;
  lcanvas.render_shadows = false;
  lcanvas.links_render_mode = LiteGraph.SPLINE_LINK;
  lcanvas.default_link_color = '#8a92a0';
  Object.assign(LGraphCanvas.link_type_colors, {
    skeleton: '#7fd07f', branches: '#c9b04a', selection: '#e0c65a', curves: '#57c6c6',
    field: '#c58ae0', number: '#e0a070', 'number,field': '#d8a0c0', mesh: '#e08080',
  });
  const pane = $('graphpane');
  function resizeGraph() {
    if (pane.clientWidth < 2 || pane.clientHeight < 2) return;
    lcanvas.resize(pane.clientWidth, pane.clientHeight);
  }
  new ResizeObserver(resizeGraph).observe(pane);
  resizeGraph();

  // Drop a link on a widget row and that parameter turns into an input pin.
  const origMouseUp = LGraphCanvas.prototype.processMouseUp;
  lcanvas.processMouseUp = function (e) {
    if (this.connecting_node && this.connecting_output) {
      const node = this.graph.getNodeOnPos(e.canvasX, e.canvasY, this.visible_nodes);
      if (node && node !== this.connecting_node && node._params) {
        if (this.isOverNodeInput(node, e.canvasX, e.canvasY) === -1) {
          const name = paramAtLocalY(node, e.canvasY - node.pos[1]);
          if (name) {
            const slot = pinSlotFor(node, name);
            if (slot >= 0) {
              this.connecting_node.connect(this.connecting_slot, node, slot);
              this.connecting_node = null; this.connecting_output = null; this.connecting_input = null;
              this.connecting_pos = null; this.connecting_slot = -1;
              this.dirty_canvas = true; this.dirty_bgcanvas = true;
            }
          }
        }
      }
    }
    return origMouseUp.call(this, e);
  };

  // ---- viewer -------------------------------------------------------------
  const viewer = new Viewer($('viewport'));
  runtime.viewer = viewer;
  window.TREE = { graph, lcanvas, viewer, runtime };   // console access

  // ---- toast --------------------------------------------------------------
  const toastEl = $('toast');
  let toastTimer = 0;
  runtime.toast = (msg) => {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  // ---- ui state -----------------------------------------------------------
  const ui = { graphW: 52, bg: 'dark', grid: true, drawer: true, palette: true };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch {}
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} };
  const applyUI = () => {
    document.documentElement.style.setProperty('--graph-w', ui.graphW + '%');
    viewer.setBackground(ui.bg);
    viewer.grid.visible = ui.grid; $('btn-grid').classList.toggle('on', ui.grid);
    $('drawer').classList.toggle('open', ui.drawer); $('btn-sliders').classList.toggle('on', ui.drawer);
    $('palette').classList.toggle('collapsed', !ui.palette);
  };
  applyUI();

  // ---- splitter -----------------------------------------------------------
  const splitter = $('splitter');
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId);
    const mainEl = $('main');
    const move = (ev) => {
      const r = mainEl.getBoundingClientRect();
      ui.graphW = Math.min(85, Math.max(10, ((ev.clientX - r.left) / r.width) * 100));
      document.documentElement.style.setProperty('--graph-w', ui.graphW + '%');
    };
    const up = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); saveUI(); };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  // ---- palette ------------------------------------------------------------
  const paletteBody = $('palette').querySelector('.body');
  const presetSection = document.createElement('div');

  const centerGraphPos = () => lcanvas.ds.convertCanvasToOffset([canvasEl.width * 0.5, canvasEl.height * 0.5]);

  function addNodeAtCenter(type) {
    const node = LiteGraph.createNode(type);
    if (!node) return;
    const c = centerGraphPos();
    node.pos = [Math.round(c[0] - node.size[0] * 0.5 + (Math.random() - 0.5) * 40), Math.round(c[1] - node.size[1] * 0.5 + (Math.random() - 0.5) * 40)];
    graph.add(node);
    lcanvas.selectNodes([node]);
    lcanvas.setDirty(true, true);
  }

  for (const group of PALETTE) {
    const h = document.createElement('h4'); h.textContent = group.name; paletteBody.appendChild(h);
    for (const [type, label] of group.items) {
      const b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = `<span class="dot" style="background:${group.color}"></span>${label}`;
      b.title = (LiteGraph.registered_node_types[type] && LiteGraph.registered_node_types[type].desc) || type;
      b.addEventListener('click', () => addNodeAtCenter(type));
      paletteBody.appendChild(b);
    }
  }
  paletteBody.appendChild(presetSection);
  $('palette').querySelector('.head').addEventListener('click', () => { ui.palette = !ui.palette; applyUI(); saveUI(); });

  function renderPresets() {
    presetSection.innerHTML = '';
    const h = document.createElement('h4');
    h.textContent = 'My presets';
    presetSection.appendChild(h);
    const list = loadLibrary();
    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'hint';
      p.textContent = 'Select nodes, then Save group.';
      presetSection.appendChild(p);
    }
    for (const entry of list) {
      const b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = `<span class="dot" style="background:#9a7fd0"></span>${entry.name}`;
      b.title = `${entry.nodes} nodes — click to insert, right-click to rename or delete`;
      b.addEventListener('click', () => {
        const added = insertPreset(lcanvas, entry, centerGraphPos());
        runtime.markDirty();
        runtime.toast(`Inserted "${entry.name}" (${added.length} nodes)`);
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const what = prompt(`Rename "${entry.name}", or clear the box to delete it`, entry.name);
        if (what === null) return;
        if (!what.trim()) { deletePreset(entry.name); runtime.toast(`Deleted "${entry.name}"`); }
        else renamePreset(entry.name, what);
        renderPresets();
      });
      presetSection.appendChild(b);
    }
    const tools = document.createElement('div');
    tools.className = 'preset-tools';
    const mk = (label, title, fn) => { const x = document.createElement('button'); x.textContent = label; x.title = title; x.addEventListener('click', fn); return x; };
    tools.append(
      mk('Save group', 'Save the selected nodes as a reusable preset (ctrl+shift+s)', saveSelectionPrompt),
      mk('Frame', 'Draw a titled frame around the selection (ctrl+g)', () => {
        const t = prompt('Frame title', 'Group');
        if (t === null) return;
        if (!groupSelection(lcanvas, t)) runtime.toast('Select some nodes first');
      }),
      mk('Export', 'Save the preset library to a file', () => {
        const blob = new Blob([exportLibrary()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tree-presets.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }),
      mk('Import', 'Load a preset library file', () => $('file-lib').click()),
    );
    presetSection.appendChild(tools);
  }

  function saveSelectionPrompt() {
    const n = Object.keys(lcanvas.selected_nodes || {}).length;
    if (!n) { runtime.toast('Select some nodes first'); return; }
    const name = prompt(`Save ${n} node${n > 1 ? 's' : ''} as a preset called:`, 'my preset');
    if (name === null) return;
    const entry = savePreset(lcanvas, name);
    if (entry) { renderPresets(); runtime.toast(`Saved preset "${entry.name}"`); }
  }
  $('file-lib').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const n = importLibrary(await f.text()); renderPresets(); runtime.toast(`Imported ${n} presets`); }
    catch (err) { runtime.toast('Import failed: ' + err.message); }
  });
  renderPresets();

  // ---- examples / new / save / load ---------------------------------------
  // The flower and insect packs are saved graphs on disk (examples/catalog.json
  // lists them); the Basics are still built in code. Both land in one menu.
  const presetSel = $('presets');
  let catalog = [];
  async function buildExamplesMenu() {
    try {
      const res = await fetch('examples/catalog.json', { cache: 'no-store' });
      if (res.ok) catalog = await res.json();
    } catch { /* opened without a server: the Basics still work */ }
    const groups = new Map();
    PRESETS.forEach((p, i) => {
      const g = p.group || 'Basics';
      if (g !== 'Basics') return;                 // the packs come from the catalog
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(`<option value="b${i}">${p.name}</option>`);
    });
    catalog.forEach((e, i) => {
      const g = e.kind === 'insects' ? 'Insects' : 'Flowers';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(`<option value="f${i}" title="${(e.description || '').replace(/"/g, '&quot;')}">${e.name}</option>`);
    });
    presetSel.innerHTML = '<option value="">Examples…</option>'
      + [...groups].map(([g, opts]) => `<optgroup label="${g}">${opts.join('')}</optgroup>`).join('');
  }
  await buildExamplesMenu();

  presetSel.addEventListener('change', async () => {
    const v = presetSel.value; presetSel.value = '';
    if (!v) return;
    const label = v[0] === 'b' ? PRESETS[+v.slice(1)].name : catalog[+v.slice(1)].name;
    if (graph._nodes.length && !confirm('Replace the current graph with "' + label + '"?')) return;
    if (v[0] === 'b') { loadExample(PRESETS[+v.slice(1)]); return; }
    const entry = catalog[+v.slice(1)];
    try {
      const res = await fetch(entry.file, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      graph.configure(await res.json());
      afterGraphLoad();
      runtime.toast(`Loaded ${entry.name}`);
    } catch (err) { runtime.toast('Could not load ' + entry.file + ': ' + err.message); }
  });
  function loadExample(p) {
    try { buildPreset(graph, p); } catch (e) { console.error(e); runtime.toast('Example failed: ' + e.message); }
    afterGraphLoad();
  }
  function afterGraphLoad() {
    viewer.prune(graph);
    runtime.markDirty();
    runtime.time = 0;
    fitAt = runtime.frame + 3;
    lcanvas.setDirty(true, true);
    rebuildDrawer();
  }
  $('btn-new').addEventListener('click', () => {
    if (graph._nodes.length && !confirm('Clear the graph?')) return;
    graph.clear(); afterGraphLoad();
  });
  $('btn-save').addEventListener('click', () => {
    const data = JSON.stringify(graph.serialize(), null, 1);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tree-graph.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    runtime.toast('Saved tree-graph.json');
  });
  $('btn-load').addEventListener('click', () => $('file-load').click());
  $('file-load').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const data = JSON.parse(await f.text()); graph.configure(data); afterGraphLoad(); runtime.toast('Loaded ' + f.name); }
    catch (err) { runtime.toast('Load failed: ' + err.message); }
  });

  // autosave
  let lastSaved = '';
  setInterval(() => {
    try {
      const s = JSON.stringify(graph.serialize());
      if (s !== lastSaved) { localStorage.setItem(GRAPH_KEY, s); lastSaved = s; }
    } catch {}
  }, 2500);

  // ---- playback -----------------------------------------------------------
  const playBtn = $('btn-play');
  const setPaused = (p) => { runtime.paused = p; playBtn.innerHTML = p ? '&#9654;' : '&#10074;&#10074;'; playBtn.classList.toggle('on', p); };
  playBtn.addEventListener('click', () => setPaused(!runtime.paused));
  $('speed').addEventListener('input', (e) => { runtime.speed = parseFloat(e.target.value); });

  // ---- preview bar --------------------------------------------------------
  $('btn-fit').addEventListener('click', () => viewer.fit());
  $('btn-grid').addEventListener('click', () => { ui.grid = viewer.toggleGrid(); applyUI(); saveUI(); });
  $('btn-bg').addEventListener('click', () => { ui.bg = viewer.toggleBackground(); saveUI(); });
  const toggleDrawer = () => { ui.drawer = !ui.drawer; applyUI(); saveUI(); };
  $('btn-sliders').addEventListener('click', toggleDrawer);
  $('btn-drawer-close').addEventListener('click', toggleDrawer);
  const toggleMax = () => { $('app').classList.toggle('maximized'); $('btn-max').classList.toggle('on'); setTimeout(resizeGraph, 50); };
  $('btn-max').addEventListener('click', toggleMax);
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('preview').requestFullscreen && $('preview').requestFullscreen();
  });
  const visibleMeshes = () => graph._nodes
    .filter((n) => n._geo && n.properties && n.properties.values && n.properties.values.show)
    .map((n) => n._geo);
  const doExport = (fmt) => {
    const m = visibleMeshes();
    if (!m.length) return runtime.toast('No visible mesh to export');
    exportMeshes(m, fmt, 1, 'tree');
  };
  $('btn-obj').addEventListener('click', () => doExport('obj'));
  $('btn-stl').addEventListener('click', () => doExport('stl'));

  // ---- help ---------------------------------------------------------------
  const attrTable = $('attr-table');
  if (attrTable) {
    attrTable.innerHTML = ATTR_INFO.map((a) =>
      `<tr><td><code>${a.name}</code></td><td>${a.alias ? `<code>${a.alias}</code>` : ''}</td><td>${a.help}</td></tr>`).join('');
  }
  $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
  $('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').hidden = true; });

  // ---- slider drawer ------------------------------------------------------
  const drawerList = $('drawer-list');
  let rows = [];
  function rebuildDrawer() {
    drawerList.innerHTML = '';
    rows = [];
    const nodes = [...runtime.sliders.values()].sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0]);
    if (!nodes.length) { drawerList.innerHTML = '<div class="empty">Add a Slider node and it appears here.</div>'; return; }
    for (const node of nodes) {
      const row = document.createElement('div'); row.className = 'row';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = node.getName();
      const val = document.createElement('span'); val.className = 'val';
      const input = document.createElement('input'); input.type = 'range';
      const [min, max] = node.getRange();
      input.min = min; input.max = max; input.step = (max - min) / 1000 || 0.001; input.value = node.getValue();
      input.addEventListener('input', () => { node.setValue(parseFloat(input.value)); val.textContent = fmt(node.getValue()); });
      row.append(name, val, input); drawerList.appendChild(row);
      rows.push({ node, input, val, name });
      val.textContent = fmt(node.getValue());
    }
  }
  const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));
  function syncDrawer() {
    for (const r of rows) {
      const v = r.node.getValue();
      if (parseFloat(r.input.value) !== v) { r.input.value = v; r.val.textContent = fmt(v); }
      const nm = r.node.getName();
      if (r.name.textContent !== nm) r.name.textContent = nm;
    }
  }
  runtime.onSlidersChanged = () => { queueMicrotask(rebuildDrawer); };

  // ---- keyboard -----------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'g' || e.key === 'G') {
        const title = prompt('Frame title', 'Group');
        if (title !== null && !groupSelection(lcanvas, title)) runtime.toast('Select some nodes first');
        e.preventDefault();
      } else if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
        saveSelectionPrompt(); e.preventDefault();
      }
      return;
    }
    if (e.altKey) return;
    if (e.key === 'h') { toggleDrawer(); e.preventDefault(); }
    else if (e.key === 'f') { viewer.fit(); }
    else if (e.key === ' ') { setPaused(!runtime.paused); e.preventDefault(); }
    else if (e.key === 'g') { toggleMax(); }
  });
  graph.onNodeAdded = () => runtime.markDirty();
  graph.onNodeRemoved = () => runtime.markDirty();

  // ---- initial graph ------------------------------------------------------
  let fitAt = 0;
  let restored = false;
  try {
    const s = localStorage.getItem(GRAPH_KEY);
    if (s) { const data = JSON.parse(s); if (data && data.nodes && data.nodes.length) { graph.configure(data); restored = true; lastSaved = s; } }
  } catch (e) { console.warn('could not restore graph', e); }
  if (!restored) loadExample(PRESETS[0]); else afterGraphLoad();

  // ---- loop ---------------------------------------------------------------
  const statsEl = $('stats');
  let last = performance.now(), fpsAcc = 0, fpsN = 0, statsAt = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!runtime.paused) runtime.time += dt * runtime.speed;
    runtime.frame++;
    try { graph.runStep(1, true); } catch (e) { console.error(e); }
    viewer.render();
    if (fitAt && runtime.frame >= fitAt) { fitAt = 0; viewer.fit(); }
    syncDrawer();
    fpsAcc += dt; fpsN++;
    if (now > statsAt) {
      const fps = fpsN / Math.max(1e-6, fpsAcc); fpsAcc = 0; fpsN = 0; statsAt = now + 500;
      const s = runtime.stats;
      statsEl.textContent = `${fps.toFixed(0)} fps · ${s.joints} joints · ${s.branches} branches`
        + (s.tubeVerts ? ` · tubes ${s.tubeVerts}v` : '')
        + (s.isoVerts ? ` · iso ${s.isoVerts}v ${s.isoMs.toFixed(0)}ms` : '');
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch((e) => { console.error(e); alert('TREE failed to start: ' + e.message); });
