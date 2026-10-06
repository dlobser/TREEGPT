# TREE

A node-based tool for building, animating and 3D-printing branching sculptures. It is a
rewrite of the old `TREE.js` / Turbine code-sketch library as a visual graph (litegraph) with a
fast typed-array skeleton, live tube extrusion, surface lofting, and a worker-based isosurface.

No build step: plain ES modules, three.js from the jsDelivr importmap, litegraph vendored in
`lib/`. Serve the folder over http (ES modules do not load from `file://`):

```bash
python tools/serve.py
```

(`python -m http.server 8123` works too, but it lets the browser cache modules,
so edits can appear not to take effect.)

then open http://127.0.0.1:8199/. Tests for the core (no browser needed):

```bash
node test/core.test.mjs
node test/loft-grouping.test.mjs
node tools/export-examples.mjs     # rebuilds examples/ and checks every mesh
```

## Layout

```
index.html               page, importmap, toolbar, help panel
lib/                     litegraph.js + css (vendored, 0.7.18)
src/core/                *** imports nothing from the DOM or three.js ***
  skeleton.js            joints as typed arrays; addBranch(), applyOps(), evaluate(), collectSegments()
  fields.js              joint attributes, Perlin noise, hash, the expression compiler
  select.js              branch set + joint range + spoke + filter -> Int32Array of joints
  curves.js              polylines, Catmull-Rom resampling, RMF frames, loft grids
  tubes.js               sweep closed tube shells along any polylines (buffers reused per frame)
  surface.js             a lofted grid as a sheet, open or solidified and watertight
  iso.js                 capsule SDF splatting + marching cubes (watertight, indexed)
  mctables.js            marching cubes tables
  export.js              OBJ / binary STL writers
src/iso/worker.js        runs buildIso off the main thread
src/nodes/               litegraph node types + the widget/pin parameter system (common.js)
src/app/                 viewer, main (layout, loop, drawer), presets, library (groups + reuse)
  graph-build.js         helpers for authoring examples: petals(), ribbedBody(), limb(), outputs()
examples/                twenty-four saved graphs + the builders that make them
  catalog.json           what the Examples menu reads, plus a geometry report each
  flowers/ insects/      NN-slug.json, openable with Load
  flowers.js insects.js  the builders; re-run tools/export-examples.mjs after editing
tools/export-examples.mjs  regenerates the JSON and validates every mesh
tools/serve.py           no-cache dev server
test/core.test.mjs       math, winding, watertightness, exporters, perf numbers
```

## Parameters: widgets and pins

Every parameter starts as a widget on the node and can become an input pin, the way shader forge
does it. Drop a link straight onto the widget row, or right-click the node and use **Inputs**.
Values live in `node.properties.values`, so widgets are only a view and the order never drifts
across a save and reload.

## Joint attributes

A field is a function evaluated once per joint. The long names are canonical; the short names from
the first version still work in expressions.

| name | short | meaning |
|---|---|---|
| `joint` | `i` | joint index along its branch, 0 at the base |
| `joints` | `n` | how many joints the branch has |
| `along` | `t` | 0 to 1 from base to tip |
| `rad` | `sib` | which spoke, 0 to rads-1, of the branches at one joint |
| `rads` | | how many spokes sprout from that joint |
| `order` | `ord` | index of this branch among all the ones its Branch node made |
| `orders` | `nord` | how many branches that node made |
| `across` | `u` | 0 to 1 over order |
| `parent` | `pj` | index of the joint this branch sprouts from |
| `pfrac` | | 0 to 1 position of that joint along the parent branch |
| `gparent` | `ppj` | same, one generation up |
| `depth` | | branch generation |
| `branch` | `br` | branch id |
| `id` | | global joint index |
| `x` `y` `z` | | rest position, before transforms |
| `time` | | seconds, scaled by the speed slider |

Expressions may also use `sin cos tan abs floor ceil round sqrt pow min max exp log atan2 sign PI`,
`noise(x,y,z)`, `hash(n)`, `clamp mix smoothstep step`, and the node inputs `a b c d`.

## Surfaces

This is what replaced the old `weave()`.

- **Loft** spans a surface across a set of branches (the ribs). `pairs` makes one patch between each
  adjacent pair, like the old weave; `whole set` makes one patch across all of them. Ribs are
  resampled by arc length so ribs of different lengths line up.
- **Warp** pushes every lofted point along the surface normal and the two surface directions, with
  expressions over `u v iu iv nu nv x y z r patch patches time` and the inputs `a b c d`.
- **Curve Tubes** extrudes tubes along the lofted rows, columns, or both, which is how a veined
  membrane is made.
- **Surface** meshes the patches as a sheet, `open` or `solid` with a thickness (watertight, so it
  prints).

## Growing a petal, a wing or a body

All three are the same shape of graph, and they are what the `Loft` node's
`group by: parent branch` is for.

**A petal** is a *spine* (one Branch) with *ribs* crossing it (a second Branch,
`rads 2`, `angle PI/2`, `spread PI/2`). The rib `spread` matters: at `PI/2` the
ribs lie flat across the petal, at `0` they stand on edge. Rib length comes from
a `Size(set)` whose field is an expression in **`pfrac`** — how far along the
spine that rib sprouts — so `sin(pfrac * PI)` is a petal that grows and shrinks
along its length. Cup it by rotating the rib joints on `rx`, with the sign
flipped per spoke (`rad == 0 ? 1 : -1`), because the two spokes of a `rads 2`
branch are point-symmetric rather than mirrored. Finally `Select(spokes = index
0)` and `index 1` feed two `Loft` nodes, because the ribs are created
interleaved and a loft needs its ribs in order. `group by: parent branch` then
gives one surface per petal however many petals there are.

**An insect body** is the same thing rolled up: ribs start at the dorsal midline
and curl on `rx` through 180 degrees down each flank, so every cross-section is a
closed ring, and `pfrac` drives the silhouette — a thorax bulge, an abdomen
taper, segment ripples.

**A wing** is a petal. `examples/insects.js` uses the same helper for both.

### Sizing rule

An isosurface built from lofted curves is a union of capsules laid along the grid
lines, so how densely the loft is sampled decides what the sheet looks like:

```
spacing <= 2 x curve radius   the capsules touch: the sheet closes, but corrugates
spacing <=     curve radius   they overlap enough to read as one smooth surface
cell size <=   curve radius   cell = longest bbox side / resolution
curve radius << half-width    or the sheet reads as a fat rod instead of a petal
```

You do not have to work this out by hand. Set **`spacing`** on the Loft node to
about 0.8 of the isosurface's `curve radius` and it chooses `divide u` and
`divide v` from the actual rib geometry, per patch. The example builders do this
for you: `outputs()` pushes the value into every Loft in the graph.

`blend` then controls how much neighbouring parts fuse: around `0.6` keeps a
beetle's wing cases distinct from its body, `1.2` melts a flower together.

## How the graph maps to the old library

| Old code | Node |
|---|---|
| `generate({joints:[15,7], rads:[1,3], angles:[0,1], length:[5,1]})` | `Root` then `Branch`; chain more Branch nodes for more layers |
| `appendBranch` at a selection | `Branch` with a `Select` plugged into `at` |
| selector `[0,-1,-2]` | `Select(scope = Root.branches, joints = all but first)` |
| `[0,0,0,[0,9],[0,9],0,"all"]` sibling 0 | `Select(... spokes = index 0)`, or filter `parent == 2 && rad == 0` |
| `transform({rz: .3})` | `Rotate(rz .3)` (mode add/set/mul) |
| `{jFreq, jMult, jOff, jFract}` | `Sine(attr joint, freq, amp, phase, scale by joint)` into a channel |
| `{jOffset}` phase per branch | `Ramp(attr order)` into `Sine.phase` |
| `{nFreq, nMult, nObjOff}` | `Noise(attr joint, per branch)` |
| `{sc: .98}` taper | `Scale(mode set, .98)` or the Branch `taper` |
| `setJointLength / setJointWidth` | `Size(length, width)` |
| `data.var1` sliders | `Slider` nodes, mirrored in the preview drawer |
| `makeTubes()` | `Tubes` |
| `nurbsishSurface` + `insertLerpVerts` + `tubes` (`weave()`) | `Loft` -> `Warp` -> `Curve Tubes` |
| `openSurface` / `solidSurface` | `Surface` (open / solid) |
| `metaBalls` + `generateGeo` | `Isosurface` |
| lofted veins blobbed together | `Loft`/`Warp` straight into the Isosurface `curves` input |
| `metaBalls.updateBalls(mesh.vertices)` | a mesh into the Isosurface `points` input, with `point radius` |
| `mergeMeshes` | `Merge` |
| `saver()` | `Export`, or the OBJ/STL buttons |

### Semantics worth knowing

- **Structure is shared, pose is path-dependent.** Every Root/Branch connected to the skeleton adds
  to it (rebuilt only when a structural parameter or connection changes). Transforms record ops; an
  output node applies the ops on the path from the Root to it, in order.
- **Defaults follow the chain.** A Branch, Select or transform with nothing plugged into
  `at` / `scope` / `selection` acts on the branch set produced by the nearest upstream Root/Branch.
- **Frames match the old library.** A joint sits at `(0, len, 0)` in its parent's rotator frame,
  `rotator = T·Rxyz·S`, and scale compounds down the chain, so `Scale(set .98)` tapers like `sc:.98`.
- **`mul` mode** multiplies what the channel already holds. Rotation channels start at 0, so use
  `add` with a field there; `mul` is for Scale and Size.
- **Fields nest.** Any numeric parameter accepts another field.
- **Select `step` applies only to the `every N` mode.** `range` walks every joint between
  `from` and `to`; if you meant to skip, pick `every N`.

## Reuse

Select nodes and press **Save group** in the palette (or `ctrl`+`shift`+`s`) to store them as a named
preset in the palette's "My presets" list. Clicking a preset drops another copy into the graph with
its internal wiring intact. **Frame** (`ctrl`+`g`) draws a titled box around a selection. The whole
library exports and imports as one JSON file.

## Printing

- **Tubes**: one closed shell per branch, rotation-minimising frames, per-joint radius, caps `ball`
  (stitched hemispheres, default) / `flat` / `none`, optional joint balls. Live at ~6 ms for 5k joints.
- **Isosurface**: each segment is a capsule in a signed-distance grid (cost scales with volume, not
  resolution³ × joints). `smooth` subdivides each chain with the same Catmull-Rom the tubes use, so the
  blob follows the same curve instead of cutting the corners. Segments of one chain are an exact union
  (no beading at joints); different chains meet with a smooth-min fillet of `blend` × radius, and
  `blend 0` is a sharp union. Runs in a worker: res 256 on 5k joints ≈ 220 ms.
  It takes three kinds of input and blends them together in one field:
  `skeleton` for the branches, `curves` for lofted surfaces (each lofted row and column becomes its own
  capsule chain, with `curve radius` and `curve dir`), and `points` for any mesh, which puts a blob at
  every vertex with `point radius` — the old `metaBalls.updateBalls(mesh.vertices)` trick.
- **Export**: STL (binary) or OBJ, with a scale factor for your units.

## Keys

`h` sliders · `f` fit view · `space` pause · `g` hide/show graph · `ctrl`+`g` frame ·
`ctrl`+`shift`+`s` save group · double-click canvas to search nodes

## Separate lofts on each arm

Set Loft **group by** to **parent branch** to loft each arm’s child ribs separately.
Feed all child branches into **ribs**; one Loft and one Surface Mesh can render all the wings.
Both **span** modes work per group, **every** restarts per group, and **closed** closes each
group independently. Groups with fewer than two sampled ribs are skipped.
The default **none** preserves existing graphs.
