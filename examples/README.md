# Examples

Two dozen finished sculptures, as saved graphs you can open with **Load** or from
the **Examples** menu.

```
catalog.json          what the Examples menu reads; also a geometry report per model
flowers/NN-slug.json  twelve flowers
insects/NN-slug.json  twelve insects
flowers.js            the builder that generates the twelve flower graphs
insects.js            the builder that generates the twelve insect graphs
```

The `.json` files are the artifacts and the `.js` builders are the source. After
editing a builder, regenerate:

```bash
node tools/export-examples.mjs
```

That runs every graph headlessly, writes the JSON, and checks the resulting mesh:
vertex count, non-manifold edges, connected components, signed volume and bounds,
all recorded in `catalog.json`. It fails loudly if a model stops being watertight.

## Opening one

Pick it from the Examples menu, or press **Load** and choose the file. Every graph
ends in an **Isosurface** feeding an **Export** node. The isosurface is not live —
after changing anything, press **Build now** on it, then **Export** for an STL.

## What is in them

A petal, a wing and an insect's flank are all the same construction: a *spine*
with *ribs* crossing it, where rib length is an expression in `pfrac` (how far
along the spine that rib sprouts) and `group by: parent branch` gives each spine
its own lofted surface. The README at the repository root explains the sizing
rules that decide whether a lofted sheet closes into a solid.

`catalog.json` records `parts` per model — triangle count and signed volume for
each connected shell. More than one shell is not automatically a problem: a shell
with *negative* volume faces inward, so it is a sealed void, such as the air
trapped under a beetle's wing case, and the model still prints as one piece. A
second shell with *positive* volume is a piece floating free, and that is what
the `loose` count reports. Every isosurface model here has `loose: 0`.

`12-rosette-echeveria` is the exception at 579 shells: it uses the `Surface` node
and a `Merge`, which stacks separate solids rather than fusing them, so its
shells overlap physically without being unioned. The exporter only applies the
`loose` test to isosurface output for that reason.

## Which way things point

This bit is easy to get wrong, and getting it wrong is what makes an insect look
like a blimp with spikes. A body spine built from the standard Origin runs along
**-X**, head at the **+X** end, **+Y** up, **±Z** the flanks. On a branch:

| you want | you set |
| --- | --- |
| a pair out to the flanks | `spin: HALF` — `spin: 0` puts the pair up and down |
| the limb swung forward or back | `rz` at the socket (`rake`), unmirrored |
| the limb raised or dropped whole | `ry` at the socket (`lift`), mirrored by `rad` |
| a knee | `ry` a quarter turn at the *second* joint, then `rz` after it |

`rz` swings a joint inside the plane holding the limb and the body axis, so for a
leg sticking out sideways it sweeps fore and aft and never lifts a knee. `ry`
past the first joint is a roll about the limb's own length — which is exactly
what turns the following `rz` into a vertical hinge. `limb()` in
`src/app/graph-build.js` does the roll for you.

Anything mirrored is mirrored because the second leg of a pair is the first one
turned halfway round the body, which reverses its idea of "up": an equal rotation
raises one and lowers the other.
