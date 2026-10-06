// ============================================================================
// library.js — groups and a reusable preset library.
//
// A preset is a chunk of graph: the selected nodes plus the links between them.
// It rides on litegraph's own clipboard format, so id remapping and link
// rewiring are litegraph's problem rather than ours, and a preset saved today
// still pastes correctly after a node gains parameters.
// ============================================================================

const LiteGraph = window.LiteGraph;
const CLIP_KEY = 'litegrapheditor_clipboard';
const LIB_KEY = 'tree.library.v1';

export function loadLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && p.name && p.data) : [];
  } catch { return []; }
}

function persist(list) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch (e) { console.warn('library too large to save', e); }
  return list;
}

/** Serialise the canvas's current selection as a preset payload. */
export function captureSelection(lcanvas) {
  const n = Object.keys(lcanvas.selected_nodes || {}).length;
  if (!n) return null;
  const before = localStorage.getItem(CLIP_KEY);
  lcanvas.copyToClipboard();
  const data = localStorage.getItem(CLIP_KEY);
  if (before === null) localStorage.removeItem(CLIP_KEY); else localStorage.setItem(CLIP_KEY, before);
  try { return JSON.parse(data); } catch { return null; }
}

export function savePreset(lcanvas, name) {
  const data = captureSelection(lcanvas);
  if (!data || !data.nodes || !data.nodes.length) return null;
  const list = loadLibrary();
  const clean = String(name || 'preset').trim().slice(0, 40) || 'preset';
  const existing = list.findIndex((p) => p.name === clean);
  const entry = { name: clean, data, nodes: data.nodes.length, created: Date.now() };
  if (existing >= 0) list[existing] = entry; else list.push(entry);
  persist(list);
  return entry;
}

export function deletePreset(name) {
  persist(loadLibrary().filter((p) => p.name !== name));
}

export function renamePreset(oldName, newName) {
  const list = loadLibrary();
  const p = list.find((x) => x.name === oldName);
  if (!p) return false;
  p.name = String(newName).trim().slice(0, 40) || oldName;
  persist(list);
  return true;
}

/**
 * Paste a preset into the graph at a graph-space position.
 * Returns the nodes that were created.
 */
export function insertPreset(lcanvas, entry, pos) {
  if (!entry || !entry.data) return [];
  const before = localStorage.getItem(CLIP_KEY);
  localStorage.setItem(CLIP_KEY, JSON.stringify(entry.data));
  const existing = new Set(lcanvas.graph._nodes.map((n) => n.id));
  const saveCanvas = lcanvas.graph_mouse;
  if (pos) lcanvas.graph_mouse = [pos[0], pos[1]];
  try { lcanvas.pasteFromClipboard(false); } finally {
    lcanvas.graph_mouse = saveCanvas;
    if (before === null) localStorage.removeItem(CLIP_KEY); else localStorage.setItem(CLIP_KEY, before);
  }
  const added = lcanvas.graph._nodes.filter((n) => !existing.has(n.id));
  if (added.length) lcanvas.selectNodes(added);
  return added;
}

export function exportLibrary() {
  return JSON.stringify({ kind: 'tree-library', version: 1, presets: loadLibrary() }, null, 1);
}

export function importLibrary(text, { replace = false } = {}) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : (parsed && parsed.presets) || [];
  const valid = incoming.filter((p) => p && p.name && p.data && p.data.nodes);
  if (!valid.length) throw new Error('no presets in that file');
  const list = replace ? [] : loadLibrary();
  for (const p of valid) {
    const i = list.findIndex((x) => x.name === p.name);
    if (i >= 0) list[i] = p; else list.push(p);
  }
  persist(list);
  return valid.length;
}

// ---------------------------------------------------------------------------
// Groups — litegraph's own coloured frames, sized around the selection.
// ---------------------------------------------------------------------------
export function groupSelection(lcanvas, title = 'Group') {
  const nodes = Object.values(lcanvas.selected_nodes || {});
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const [x, y] = n.pos, [w, h] = n.size;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y - LiteGraph.NODE_TITLE_HEIGHT);
    x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  const pad = 24;
  const g = new LiteGraph.LGraphGroup();
  g.title = title;
  g.pos = [x0 - pad, y0 - pad - 18];
  g.size = [(x1 - x0) + pad * 2, (y1 - y0) + pad * 2 + 18];
  g.color = '#3f4757';
  lcanvas.graph.add(g);
  lcanvas.setDirty(true, true);
  return g;
}

export function removeGroupsAt(lcanvas, pos) {
  const groups = lcanvas.graph._groups || [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].isPointInside && groups[i].isPointInside(pos[0], pos[1])) {
      lcanvas.graph.remove(groups[i]);
      lcanvas.setDirty(true, true);
      return true;
    }
  }
  return false;
}
