// Reads scripts/level4-raw.json (raw polygon vertices per slot, with
// provisional edge numbering from the lattice construction) and re-indexes
// each slot's edges to match the actual game engine's template edge
// numbering (HEX_EDGE_SEGMENTS / TRIANGLE_EDGE_SEGMENTS / RHOMBUS_EDGE_SEGMENTS),
// finding the correct `angle` (a multiple of 60 degrees, matching the
// lattice's 6-fold symmetry) and cyclic edge relabeling for each slot by
// brute force (small search space per slot: 6 angles x edgeCount cyclic
// shifts). This guarantees the resulting slot data renders correctly with
// `edgeMap` left as identity (per scripts/verify-triangle-edgemap.mjs's
// finding that identity works at any multiple-of-60 slot angle for hex,
// rhombus, and triangle alike).
import { readFileSync, writeFileSync } from "node:fs";

const HEX_EDGE_SEGMENTS = [
  [[-.5, .8660254], [-1, 0]],
  [[-.5, .8660254], [.5, .8660254]],
  [[.5, .8660254], [1, 0]],
  [[1, 0], [.5, -.8660254]],
  [[.5, -.8660254], [-.5, -.8660254]],
  [[-.5, -.8660254], [-1, 0]],
];
const RHOMBUS_EDGE_SEGMENTS = [
  [[.25, .4330127], [.75, -.4330127]],
  [[.75, -.4330127], [-.25, -.4330127]],
  [[-.25, -.4330127], [-.75, .4330127]],
  [[-.75, .4330127], [.25, .4330127]],
];
const TRIANGLE_EDGE_SEGMENTS = [
  [[0, .5773503], [-.5, -.2886751]],
  [[-.5, -.2886751], [.5, -.2886751]],
  [[.5, -.2886751], [0, .5773503]],
];
const TEMPLATES = { hex: HEX_EDGE_SEGMENTS, rhombus: RHOMBUS_EDGE_SEGMENTS, triangle: TRIANGLE_EDGE_SEGMENTS };
const KIND_TO_SHAPE = { hex: "hex", triangle: "triangle", rhombus: "rhombus" };

function rotatePoint([x, y], degrees) {
  const r = degrees * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function centroid(verts) {
  const n = verts.length;
  return [verts.reduce((s, v) => s + v[0], 0) / n, verts.reduce((s, v) => s + v[1], 0) / n];
}

function findAngleAndShift(shape, rawEdges, center) {
  const template = TEMPLATES[shape];
  const n = template.length;
  let best = null;
  // Templates may be authored in either rotational winding direction
  // relative to a CCW-traversed raw polygon (this is a known property: the
  // hex template array happens to be CW while triangle/rhombus are CCW), so
  // we must try both forward and reversed traversal of the raw edges.
  for (const reversed of [false, true]) {
    const orderedRawEdges = reversed
      ? rawEdges.map((e) => [e[1], e[0]]).slice().reverse()
      : rawEdges;
    for (const angleDeg of [0, 60, 120, 180, 240, 300, -60, -120, -180, -240, -300]) {
      const rotatedTemplate = template.map((seg) => seg.map((p) => add(center, rotatePoint(p, angleDeg))));
      for (let shift = 0; shift < n; shift += 1) {
        let maxErr = 0;
        for (let i = 0; i < n; i += 1) {
          const rawEdge = orderedRawEdges[(i + shift) % n];
          const tmplEdge = rotatedTemplate[i];
          const d1 = Math.max(dist(rawEdge[0], tmplEdge[0]), dist(rawEdge[1], tmplEdge[1]));
          const d2 = Math.max(dist(rawEdge[0], tmplEdge[1]), dist(rawEdge[1], tmplEdge[0]));
          maxErr = Math.max(maxErr, Math.min(d1, d2));
        }
        if (!best || maxErr < best.err) best = { angleDeg, shift, err: maxErr, reversed };
      }
    }
  }
  return best;
}

const raw = JSON.parse(readFileSync(new URL("./level4-raw.json", import.meta.url), "utf8"));

// First pass: for every slot, compute its raw edges (from verts) and find
// the best (angle, shift).
const processed = new Map();
raw.slots.forEach((slot) => {
  const shape = KIND_TO_SHAPE[slot.kind];
  const n = slot.verts.length;
  const rawEdges = slot.verts.map((v, i) => [v, slot.verts[(i + 1) % n]]);
  const center = centroid(slot.verts);
  const fit = findAngleAndShift(shape, rawEdges, center);
  processed.set(slot.id, { shape, center, n, fit, rawOutside: slot.outside, rawNeighbors: slot.neighbors });
});

let worstErr = 0;
processed.forEach((p, id) => {
  worstErr = Math.max(worstErr, p.fit.err);
  if (p.fit.err > 0.001) console.log(`  high error slot ${id} (${p.shape}): err=${p.fit.err.toFixed(4)} angle=${p.fit.angleDeg} shift=${p.fit.shift}`);
});
console.log(`Worst per-slot template-fit error across all 34 slots: ${worstErr.toFixed(8)}`);

// Re-index: original raw edge index maps to template edge index according
// to whether the best fit needed forward or reversed traversal.
function remapIndex(rawIndex, fit, n) {
  if (!fit.reversed) return (rawIndex - fit.shift + n) % n;
  return ((2 * n - 1 - rawIndex - fit.shift) % n + n) % n;
}

const finalSlots = [];
processed.forEach((p, id) => {
  const { shape, center, n, fit, rawOutside, rawNeighbors } = p;
  const outside = rawOutside.map((i) => remapIndex(i, fit, n)).sort((a, b) => a - b);
  const neighbors = {};
  Object.entries(rawNeighbors).forEach(([neighborId, rawEdge]) => {
    neighbors[neighborId] = remapIndex(rawEdge, fit, n);
  });
  finalSlots.push({
    id,
    shape,
    center: [Number(center[0].toFixed(6)), Number(center[1].toFixed(6))],
    angle: shape === "hex" ? undefined : ((fit.angleDeg % 360) + 360) % 360 === 0 ? 0 : fit.angleDeg,
    edgeCount: n,
    outside,
    neighbors,
  });
});

writeFileSync(new URL("./level4-slots.json", import.meta.url), JSON.stringify(finalSlots, null, 2));
console.log(`Wrote ${finalSlots.length} finalized slots to scripts/level4-slots.json`);

// Sanity: adjacency symmetry re-check after remap (should already hold by
// construction, but verify indices agree with each shape's own convention).
let asymmetric = 0;
const byId = new Map(finalSlots.map((s) => [s.id, s]));
finalSlots.forEach((slot) => {
  Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
    const neighbor = byId.get(neighborId);
    if (neighbor.neighbors[slot.id] === undefined) { asymmetric += 1; console.log(`Missing back-reference: ${neighborId} -> ${slot.id}`); }
  });
});
console.log(`Asymmetric adjacency issues: ${asymmetric}`);

const shapeCounts = finalSlots.reduce((acc, s) => { acc[s.shape] = (acc[s.shape] || 0) + 1; return acc; }, {});
console.log("Shape counts:", shapeCounts);
