// ============================================================================
// runtime.js — the little bit of shared state nodes and the app both touch.
// ============================================================================

export const runtime = {
  time: 0,            // seconds, scaled by speed, frozen while paused
  frame: 0,           // increments every graph step
  speed: 1,
  paused: false,
  buildId: 1,         // bump = every skeleton rebuilds on the next step
  viewer: null,       // set by main.js
  graph: null,
  sliders: new Map(), // node.id -> Slider node
  onSlidersChanged: null,
  stats: { joints: 0, branches: 0, tubeVerts: 0, isoVerts: 0, isoMs: 0 },

  markDirty() { this.buildId++; },
  registerSlider(node) { this.sliders.set(node.id, node); this.onSlidersChanged && this.onSlidersChanged(); },
  unregisterSlider(node) { this.sliders.delete(node.id); this.onSlidersChanged && this.onSlidersChanged(); },
};
