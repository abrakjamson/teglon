# Teglon — Adding New Levels

This document is a practical guide (and sub-agent delegation playbook) for
adding new levels to the Teglon puzzle, based on what worked building levels
1-4. It assumes you are **not** introducing a new piece shape — just new
boards/groove patterns built from the three shapes the engine already
supports (`hex`, `rhombus`, `triangle`). If a new shape is genuinely required,
see "When a new shape is needed" at the end — that is engine work, not
level-authoring work, and should not be delegated the same way.

## 1. Mental model of the puzzle data

Each level is a plain data object (`src/levels/levelN.js`) with no engine
logic in it. The engine (`src/main.js`) is shape-agnostic: it only cares
about `edgeCount`, `outside`, `neighbors`, and pattern/rotation arithmetic —
never screen coordinates — for win detection. Screen coordinates only affect
rendering, not solvability.

A level has three parts:

- **`board`**: `macroCenter`, `center`, `scale`, `side` — purely for
  positioning/scaling the SVG rendering. Doesn't affect puzzle logic.
- **`slots`**: the fixed positions on the board. Each slot has:
  - `id` — unique string.
  - `shape` — `"hex" | "rhombus" | "triangle"`.
  - `center` — position in "unit" board coordinates (multiplied by
    `board.scale` at render time).
  - `angle` — screen rotation in degrees for `rhombus`/`triangle` slots only
    (hex slots don't need it; `usesSlotAngle` in `SHAPE_CONFIG` governs this).
  - `edgeCount` — 6/4/3 matching the shape.
  - `outside` — array of **local edge indices** that face the outer boundary
    of the board (i.e., no neighboring slot). A solution is only valid if
    none of these edges have an active groove-end on them.
  - `neighbors` — `{ neighborSlotId: localEdgeIndex }` map: for each adjacent
    slot, which of *this* slot's local edges touches it. Neighbor
    relationships must be **symmetric** — if A lists B on edge 2, B must list
    A back on whichever edge of B touches that same shared side.
  - `edgeMap` (rhombus only, optional) — remaps local edge indices; used when
    a rhombus's natural edge order needs to be reindexed for a particular
    orientation the puzzle designer used. Not always needed (see levels 1-3,
    which mostly don't set it in later designs).
- **`pieces`**: the tile inventory. Each piece has:
  - `id` — unique string.
  - `shape` — `"hex" | "rhombus" | "triangle"`.
  - `pattern` — a key into `PATTERN_PAIRS` in `main.js` (e.g. `H1`, `RA`,
    `T1`) describing which pair of local edges the groove connects **before**
    rotation. Existing patterns:
    - `H1`/`H2`/`H3` (hex: adjacent / skip-one / opposite edges)
    - `RA`/`RO` (rhombus: acute-corner bend / obtuse-corner bend)
    - `P0`/`P1` (rhombus: the two "parallel/straight-through" edge pairs)
    - `T1` (triangle: corner-to-corner, the only distinct pattern a triangle
      groove can have)
  - `rotations` — the discrete rotation count for that shape (6/2/3). This
    must match `SHAPE_CONFIG` — do not invent a different rotation count per
    piece.
- **`hint`**: `{ pieceId, slotId, rotation }` — one placement from a *known
  valid solution*, shown to the player as a hint. **You must derive this from
  an actual verified solution**, not guess it.
- **`endpointMode`**: `"center"` for all levels so far (grooves are drawn edge
  midpoint → shape center → edge midpoint). Leave this as `"center"` unless
  you have a specific reason to change rendering behavior.

## 2. The win condition (what "valid" means)

A placement (piece + rotation in every slot) is a solution iff, for every
slot:

1. None of its `outside` edges are active (groove never touches the outer
   boundary — the loop must be fully interior).
2. For every neighbor pair, the active/inactive state of the touching edge
   matches on both sides (groove continues cleanly across the shared edge,
   or both sides are blank there — no dangling half-grooves).
3. Considering the full graph of "this slot's groove connects to that
   neighbor," every slot has **exactly 2** active connections (each piece's
   groove is a single line segment/curve with exactly two ends), and the
   whole graph is **one connected loop** (not multiple disjoint loops).

This exact logic is implemented twice: once in `main.js` (`evaluate()`/
`selectedGraph()`, with DOM side effects) and once, side-effect-free, in
`scripts/verify-level.mjs` (works for level3; extend the same pattern for a
new level). **Always validate a new level with the side-effect-free version**
before wiring it into the actual game — it's much faster to iterate on and
gives you exact solution counts.

## 3. Design workflow for a new level

1. **Pick/derive the geometry.** Decide the outer board shape and how it
   subdivides into hex/rhombus/triangle slots meeting edge-to-edge with no
   gaps or overlaps (angles around every interior vertex must sum to 360°).
   Write down `center`/`angle` for each slot in unit coordinates, and the
   `neighbors` map (verify symmetry by hand or script — this is the most
   common source of bugs).
2. **Decide the piece inventory.** One piece per slot, matching shape counts
   exactly. Reuse existing patterns (`H1`/`H2`/`H3`/`RA`/`RO`/`P0`/`P1`/`T1`)
   — don't invent new ones unless the puzzle genuinely needs a groove
   topology none of these support (rare; a hex/rhombus/triangle only has a
   few geometrically distinct groove shapes).
3. **Search for a solvable groove pattern.** Brute-force over which piece
   pattern goes in which slot (respecting shape) and try all rotations,
   using the win condition in §2. You want:
   - **At least one valid solution** (ideally derive/paste it as the `hint`).
   - **A non-trivial attempts-to-solutions ratio.** Levels 1-2 were
     deliberately easy (small number of attempts, exactly 1-2 solutions,
     good tutorials). Levels 3-4 aim harder: level 3 has 216 total
     rotation/placement combinations and exactly 1 solution (a good "you can
     get partway before realizing you're wrong" difficulty). Level 4 is
     larger and was checked with targeted validity checks rather than full
     brute force (34 pieces makes full brute force computationally
     infeasible — see `scripts/verify-level4.mjs` for the targeted-check
     approach used instead: verify adjacency symmetry, verify the declared
     hint/solution actually satisfies the win condition end-to-end, and
     spot-check that a few "obvious" naive placements do NOT solve it).
   - Multiple solutions are fine as long as most "obvious"/naive arrangements
     still fail.
4. **Write `scripts/verify-levelN.mjs`** (copy `verify-level.mjs` or
   `verify-level4.mjs` as a starting template depending on whether full
   brute force is computationally feasible for your slot count). Confirm:
   adjacency symmetry, the hint is part of a genuine solution, and a
   solution-count/attempts figure worth reporting back to the user.
5. **Write `src/levels/levelN.js`** following the schema in §1. Add a
   descriptive header comment (see `level3.js`) explaining the geometry
   choice and summarizing verification results — future edits (including
   your own) rely on this context.
6. **Register it** in `src/levels/index.js` (add the import + push into the
   exported `levels` array in the desired order).
7. **Rebuild and smoke-test.** `npm run build`, then a quick Playwright
   check (install `-D`, use, uninstall afterward — don't leave it as a
   permanent dependency) confirming: the board renders with the right slot
   count/shape and no overlapping dashed outlines, the tray shows all pieces
   without overlap (uses `computeTrayLayout(level.pieces.length)` — no
   per-level tray tuning needed, it's automatic), and the hint button
   highlights the correct piece/slot without leaving a permanent glow after
   it fades.

## 4. Things that do NOT need to change for a new level

Because the engine is fully data-driven from `level.slots`/`level.pieces`,
adding a level that reuses the existing three shapes requires **zero
changes** to:
- `SHAPE_CONFIG`, `PATTERN_PAIRS`, or any rendering geometry in `main.js`.
- Tray layout code (`computeTrayLayout`) — it sizes automatically from
  `level.pieces.length`.
- `makeBoardOutline()` — board shape is conveyed entirely by the real slot
  outlines; there is no separate outer-hex frame to draw or adjust.
- CSS/theme.

This means a new level is safe to delegate almost entirely to a sub-agent: it
only touches a new `levelN.js` file, a new `verify-levelN.mjs` script, and
one line in `index.js`.

## 5. Delegating level design to sub-agents

This worked well for levels 3-4 and is the recommended approach for future
levels:

- **One sub-agent per level**, given:
  - This document (or an equivalent summary of §1-§3) as context.
  - The exact deliverable: a `src/levels/levelN.js` file passing the schema
    in §1, plus a `scripts/verify-levelN.mjs` script (based on
    `verify-level.mjs`/`verify-level4.mjs`) that it has itself run and whose
    output it reports back (solution count, attempts count, hint
    confirmation).
  - A difficulty brief in plain language (e.g. "small board, 3 different
    shapes, simple outer silhouette, good tutorial difficulty" vs. "larger
    board, same 3 shapes, should NOT be solvable by an obvious/naive
    arrangement, multiple solutions OK").
  - An explicit instruction that it must **run its own verification script
    and confirm the result before declaring the level done** — don't take
    the sub-agent's word for solvability without seeing verifier output.
- **Do not re-solve/re-verify the sub-agent's work yourself from scratch**
  once it has shown you a passing verifier run — spot-check the output and
  the level file's structure instead. Re-deriving the whole solution
  independently duplicates the sub-agent's work and defeats the point of
  delegating it.
- **After the sub-agent delivers**, you (the orchestrator) are responsible
  for: registering the level in `index.js`, rebuilding, and doing the
  rendering/tray/hint smoke test in §3 step 7 — sub-agents don't need to run
  the full app or Playwright unless you want them to.
- Good model choice for this kind of combinatorial/geometric reasoning +
  code-writing task: a capable general-purpose model (e.g. GPT-5.6 Sol)
  worked well for levels 3/4.

## 6. When a new shape IS needed

If a future level genuinely requires a shape beyond hex/rhombus/triangle
(e.g. a square, pentagon, or a non-regular shape), that's an **engine
change**, not a level-authoring task, and should not be delegated the same
way a normal level is:

- New entries needed in `SHAPE_CONFIG` (`basePoints`, `edgeSegments`,
  `angleStep`, `rotationCount`, `usesSlotAngle`) and possibly new
  `PATTERN_PAIRS` entries for the new shape's distinct groove topologies.
- `TRAY_SHAPE_WIDTH_FACTOR`/`TRAY_SHAPE_HEIGHT_FACTOR` in `main.js` assume
  hex is the widest/tallest shape for tray-scale computation — verify this
  still holds, or generalize the tray sizing if the new shape is larger.
- CSS/rendering for piece bodies, drag/rotate interactions, and the win
  overlay may need shape-specific tweaks.
- Handle this yourself (or delegate as a distinct "extend the engine" task
  separate from level design), then treat the new level's authoring as a
  normal §3 workflow once the shape exists.
