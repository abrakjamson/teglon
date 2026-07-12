// Verifies level4 ("The Greater Cloister"). Full brute-force enumeration
// (as done for level3) is infeasible at 34 pieces, so this instead:
//   1. Re-checks adjacency symmetry directly from the shipped level file.
//   2. Reconstructs the intended solution (same piece<->slot pairing used by
//      scripts/emit-level4.mjs) and confirms it satisfies the exact
//      win-condition logic (outside edges inactive, neighbor edges agree,
//      resulting active-edge graph is a single 34-node cycle).
//   3. Confirms the declared hint matches the intended solution's hex
//      placement.
//   4. Spot-checks a handful of "obvious" naive arrangements (identity
//      order, all-zero rotations, simple pattern-block orderings) to
//      confirm they do NOT solve the puzzle, per the design brief's
//      difficulty requirement that most obvious arrangements should fail.
import { level4 } from "../src/levels/level4.js";

const PATTERN_PAIRS = {
  H1: [0, 1], H2: [0, 2], H3: [0, 3],
  RA: [0, 1], RO: [0, 3], P0: [0, 2], P1: [1, 3],
  T1: [0, 1],
};
const SHAPE_EDGE_COUNT = { hex: 6, rhombus: 4, triangle: 3 };
const SHAPE_ROTATION_COUNT = { hex: 6, rhombus: 2, triangle: 3 };

function rotationOffset(shape, rotation) {
  return rotation * (SHAPE_EDGE_COUNT[shape] / SHAPE_ROTATION_COUNT[shape]);
}
function activeEdges(piece, rotation) {
  const size = SHAPE_EDGE_COUNT[piece.shape];
  return new Set(PATTERN_PAIRS[piece.pattern].map((e) => (e + rotationOffset(piece.shape, rotation)) % size));
}
function isConnectedGraph(graph) {
  const start = graph.keys().next().value;
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    graph.get(current).forEach((n) => { if (!visited.has(n)) { visited.add(n); queue.push(n); } });
  }
  return visited.size === graph.size;
}
function evaluateAssignment(level, assignment) {
  for (const slot of level.slots) {
    const piece = assignment.get(slot.id);
    if (!piece) return false;
    const active = activeEdges(piece, piece.rotation);
    for (const outsideEdge of slot.outside) {
      if (active.has(outsideEdge)) return false;
    }
    for (const [neighborId, edge] of Object.entries(slot.neighbors)) {
      if (slot.id > neighborId) continue;
      const neighbor = level.slots.find((s) => s.id === neighborId);
      const neighborPiece = assignment.get(neighborId);
      const neighborEdge = neighbor.neighbors[slot.id];
      const neighborActive = activeEdges(neighborPiece, neighborPiece.rotation);
      if (active.has(edge) !== neighborActive.has(neighborEdge)) return false;
    }
  }
  const graph = new Map(level.slots.map((s) => [s.id, new Set()]));
  level.slots.forEach((slot) => {
    const piece = assignment.get(slot.id);
    const active = activeEdges(piece, piece.rotation);
    Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
      if (active.has(edge)) graph.get(slot.id).add(neighborId);
    });
  });
  if ([...graph.values()].some((s) => s.size !== 2)) return false;
  return isConnectedGraph(graph);
}

console.log(`=== Verifying ${level4.id} ===`);
console.log(`Slots: ${level4.slots.length}, Pieces: ${level4.pieces.length}`);

// 1. Adjacency symmetry.
let adjacencyOk = true;
level4.slots.forEach((slot) => {
  Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
    const neighbor = level4.slots.find((s) => s.id === neighborId);
    if (!neighbor) { console.log(`FAIL: ${slot.id} -> missing neighbor ${neighborId}`); adjacencyOk = false; return; }
    if (neighbor.neighbors[slot.id] === undefined) { console.log(`FAIL: ${neighborId} missing back-ref to ${slot.id}`); adjacencyOk = false; }
  });
});
console.log(adjacencyOk ? "Adjacency symmetric: OK" : "Adjacency symmetric: FAIL");

// Sanity: each slot's edgeCount matches outside+neighbor edge indices being
// within range and non-overlapping (each local edge index used at most once
// across outside+neighbors).
let indexOk = true;
level4.slots.forEach((slot) => {
  const used = new Map();
  slot.outside.forEach((e) => { used.set(e, (used.get(e) || 0) + 1); });
  Object.values(slot.neighbors).forEach((e) => { used.set(e, (used.get(e) || 0) + 1); });
  used.forEach((count, edge) => {
    if (count > 1) { console.log(`FAIL: slot ${slot.id} edge ${edge} used ${count} times`); indexOk = false; }
    if (edge < 0 || edge >= slot.edgeCount) { console.log(`FAIL: slot ${slot.id} edge ${edge} out of range`); indexOk = false; }
  });
  if (used.size !== slot.edgeCount) { console.log(`FAIL: slot ${slot.id} has ${used.size} accounted edges, expected ${slot.edgeCount}`); indexOk = false; }
});
console.log(indexOk ? "Edge index accounting: OK" : "Edge index accounting: FAIL");

// 2. Reconstruct the intended solution (mirrors scripts/emit-level4.mjs's
// piece-id-generation order: pieces are listed in the same order as slots,
// grouped by shape counters, so the i-th piece of a given shape corresponds
// to the i-th slot of that shape in level4.slots order). We also need the
// exact rotation per slot, which is embedded in the piece pattern only
// (rotation is chosen at placement time) -- so instead we recompute the
// solution directly from the same source data used to emit the file.
import { readFileSync } from "node:fs";
const solutionData = JSON.parse(readFileSync(new URL("../scripts/level4-solution.json", import.meta.url), "utf8"));
const solved = solutionData.solved;

const shapeCounters = { hex: 0, triangle: 0, rhombus: 0 };
const shapeAbbrev = { hex: "h4", triangle: "t4", rhombus: "r4" };
const assignment = new Map();
level4.slots.forEach((slot) => {
  const sol = solved[slot.id];
  shapeCounters[slot.shape] += 1;
  const pieceId = `${shapeAbbrev[slot.shape]}-${sol.pattern.toLowerCase()}-${shapeCounters[slot.shape]}`;
  const piece = level4.pieces.find((p) => p.id === pieceId);
  if (!piece) { console.log(`FAIL: could not find piece ${pieceId} for slot ${slot.id}`); return; }
  assignment.set(slot.id, { ...piece, rotation: sol.rotation });
});

const solutionValid = evaluateAssignment(level4, assignment);
console.log(`Intended solution satisfies win condition: ${solutionValid ? "YES" : "NO (FAIL)"}`);

// 3. Confirm the declared hint matches the intended solution's hex slot.
const hint = level4.hint;
const hexAssignment = assignment.get(hint.slotId);
const hintMatches = hexAssignment && hexAssignment.id === hint.pieceId && hexAssignment.rotation === hint.rotation;
console.log(`Declared hint (${hint.pieceId}@${hint.slotId} rot${hint.rotation}) matches intended solution: ${hintMatches ? "YES" : "NO (FAIL)"}`);

// 4. Spot-check naive arrangements fail.
function buildNaiveAssignment({ rotationFn } = {}) {
  const pool = { hex: [...level4.pieces.filter((p) => p.shape === "hex")], triangle: [...level4.pieces.filter((p) => p.shape === "triangle")], rhombus: [...level4.pieces.filter((p) => p.shape === "rhombus")] };
  const counters = { hex: 0, triangle: 0, rhombus: 0 };
  const naive = new Map();
  level4.slots.forEach((slot) => {
    const piece = pool[slot.shape][counters[slot.shape] % pool[slot.shape].length];
    counters[slot.shape] += 1;
    const rotation = rotationFn ? rotationFn(slot, piece) : 0;
    naive.set(slot.id, { ...piece, rotation });
  });
  return naive;
}

const naiveCases = [
  { name: "identity order, rotation=0 everywhere", rotationFn: () => 0 },
  { name: "identity order, rotation=1 everywhere (mod each shape's count)", rotationFn: (slot) => 1 % SHAPE_ROTATION_COUNT[slot.shape] },
  { name: "identity order, rotation = slot index parity", rotationFn: (slot, piece) => (level4.slots.indexOf(slot) % SHAPE_ROTATION_COUNT[slot.shape]) },
];

let anyNaivePassed = false;
naiveCases.forEach((testCase) => {
  const naive = buildNaiveAssignment(testCase);
  const result = evaluateAssignment(level4, naive);
  if (result) anyNaivePassed = true;
  console.log(`Naive case "${testCase.name}": ${result ? "SOLVES (unexpected!)" : "does not solve (expected)"}`);
});

console.log(`\nOverall: ${adjacencyOk && indexOk && solutionValid && hintMatches && !anyNaivePassed ? "PASS" : "CHECK ABOVE FOR FAILURES"}`);
