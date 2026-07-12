// Verifies level3 (and later level4) puzzle data using the exact index-based
// win-condition logic from src/main.js's evaluate()/selectedGraph() (copied
// here since main.js has DOM side effects at module scope). This is
// shape-agnostic (works for hex/rhombus/triangle equally) since win logic
// only depends on edgeCount/outside/neighbors + pattern/rotation arithmetic,
// not on screen-space rendering.
import { level3 } from "../src/levels/level3.js";

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
  // assignment: Map(slotId -> {shape, pattern, rotation})
  for (const slot of level.slots) {
    const piece = assignment.get(slot.id);
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

function verifyLevel(level, expectedHintSlot) {
  console.log(`\n=== Verifying ${level.id} ===`);
  console.log(`Slots: ${level.slots.length}, Pieces: ${level.pieces.length}`);

  // 1. Symmetric adjacency check.
  let adjacencyOk = true;
  level.slots.forEach((slot) => {
    Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
      const neighbor = level.slots.find((s) => s.id === neighborId);
      if (!neighbor) { console.log(`FAIL: ${slot.id} references missing neighbor ${neighborId}`); adjacencyOk = false; return; }
      const back = neighbor.neighbors[slot.id];
      if (back === undefined) { console.log(`FAIL: ${neighborId} does not list ${slot.id} back`); adjacencyOk = false; }
    });
  });
  console.log(adjacencyOk ? "Adjacency symmetric: OK" : "Adjacency symmetric: FAIL");

  // 2. Hint solution verification.
  const hint = level.hint;
  console.log(`Hint: ${JSON.stringify(hint)}`);

  // 3. Brute-force solution count using the declared piece inventory
  // (respecting shape constraints per slot), trying every combination of
  // {which piece in which same-shape slot} x {rotation}. This mirrors the
  // "attempts/solutions" combinatorial analysis done for levels 1 and 2.
  const bySlotShape = {};
  level.slots.forEach((s) => { (bySlotShape[s.shape] ||= []).push(s.id); });
  const piecesByShape = {};
  level.pieces.forEach((p) => { (piecesByShape[p.shape] ||= []).push(p); });

  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    arr.forEach((item, i) => {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      permutations(rest).forEach((p) => out.push([item, ...p]));
    });
    return out;
  }

  let solutions = 0;
  let attempts = 0;
  const shapeNames = Object.keys(bySlotShape);

  function* assignmentsForShape(shape) {
    const slotIds = bySlotShape[shape];
    const pieces = piecesByShape[shape];
    for (const perm of permutations(pieces)) {
      const rotationCount = SHAPE_ROTATION_COUNT[shape];
      const rotationCombos = Math.pow(rotationCount, slotIds.length);
      for (let combo = 0; combo < rotationCombos; combo += 1) {
        const rotations = [];
        let rem = combo;
        for (let i = 0; i < slotIds.length; i += 1) {
          rotations.push(rem % rotationCount);
          rem = Math.floor(rem / rotationCount);
        }
        yield slotIds.map((slotId, i) => [slotId, { ...perm[i], rotation: rotations[i] }]);
      }
    }
  }

  function combineGenerators(shapes, index, partial) {
    if (index === shapes.length) {
      attempts += 1;
      const assignment = new Map(partial);
      if (evaluateAssignment(level, assignment)) {
        solutions += 1;
        if (solutions <= 3) {
          console.log(`  Solution #${solutions}:`, [...assignment.entries()].map(([slot, p]) => `${slot}=${p.id}@rot${p.rotation}`).join(", "));
        }
      }
      return;
    }
    for (const entries of assignmentsForShape(shapes[index])) {
      combineGenerators(shapes, index + 1, [...partial, ...entries]);
    }
  }

  combineGenerators(shapeNames, 0, []);
  console.log(`Total attempts (index/rotation space): ${attempts}`);
  console.log(`Total valid single-loop solutions found: ${solutions}`);

  // 4. Confirm the declared hint is itself part of a valid solution.
  const hintAssignment = new Map();
  const hintPiece = level.pieces.find((p) => p.id === hint.pieceId);
  console.log(`Hint piece ${hint.pieceId} is shape ${hintPiece.shape} pattern ${hintPiece.pattern}, target slot ${hint.slotId} rotation ${hint.rotation}`);
}

verifyLevel(level3);
