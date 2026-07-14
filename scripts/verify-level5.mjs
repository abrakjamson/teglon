// Targeted verification for level5. Full enumeration is infeasible for forty
// pieces, so this checks the static geometry and exact win condition against
// an intended solution, then rejects representative naive and near-solution
// placements.
import { level5 } from "../src/levels/level5.js";

const PATTERN_PAIRS = {
  H1: [0, 1], H2: [0, 2], H3: [0, 3],
  RA: [0, 1], RO: [0, 3], P0: [0, 2], P1: [1, 3],
  T1: [0, 1],
};
const SHAPE_EDGE_COUNT = { hex: 6, rhombus: 4, triangle: 3 };
const SHAPE_ROTATION_COUNT = { hex: 6, rhombus: 2, triangle: 3 };
const SHAPE_SEGMENTS = {
  hex: [
    [[-0.5, 0.8660254], [-1, 0]],
    [[-0.5, 0.8660254], [0.5, 0.8660254]],
    [[0.5, 0.8660254], [1, 0]],
    [[1, 0], [0.5, -0.8660254]],
    [[0.5, -0.8660254], [-0.5, -0.8660254]],
    [[-0.5, -0.8660254], [-1, 0]],
  ],
  rhombus: [
    [[0.25, 0.4330127], [0.75, -0.4330127]],
    [[0.75, -0.4330127], [-0.25, -0.4330127]],
    [[-0.25, -0.4330127], [-0.75, 0.4330127]],
    [[-0.75, 0.4330127], [0.25, 0.4330127]],
  ],
  triangle: [
    [[0, 0.5773503], [-0.5, -0.2886751]],
    [[-0.5, -0.2886751], [0.5, -0.2886751]],
    [[0.5, -0.2886751], [0, 0.5773503]],
  ],
};

const INTENDED_PLACEMENTS = {
  H0: ["h5-h1-1", 5],
  H1: ["h5-h1-2", 5],
  H2: ["h5-h1-3", 4],
  H3: ["h5-h3-1", 0],
  H4: ["h5-h1-4", 1],
  H5: ["h5-h1-5", 1],
  H6: ["h5-h1-6", 0],
  T0: ["t5-t1-1", 0],
  T1: ["t5-t1-2", 0],
  T2: ["t5-t1-3", 1],
  T3: ["t5-t1-4", 1],
  T4: ["t5-t1-5", 2],
  T5: ["t5-t1-6", 1],
  R0: ["r5-ra-1", 0],
  R1: ["r5-p1-1", 0],
  R2: ["r5-p0-1", 0],
  T6: ["t5-t1-7", 0],
  T7: ["t5-t1-8", 0],
  R3: ["r5-ro-1", 1],
  R4: ["r5-ro-2", 0],
  R5: ["r5-ra-2", 1],
  R6: ["r5-ra-3", 1],
  R7: ["r5-ro-3", 0],
  R8: ["r5-p0-2", 0],
  R9: ["r5-p0-3", 0],
  R10: ["r5-p1-2", 0],
  T8: ["t5-t1-9", 2],
  T9: ["t5-t1-10", 1],
  R11: ["r5-p1-3", 0],
  R12: ["r5-p0-4", 0],
  R13: ["r5-p1-4", 0],
  R14: ["r5-ra-4", 0],
  R15: ["r5-ro-4", 0],
  R16: ["r5-ra-5", 0],
  R17: ["r5-ro-5", 1],
  R18: ["r5-ro-6", 1],
  R19: ["r5-p1-5", 0],
  T10: ["t5-t1-11", 2],
  T11: ["t5-t1-12", 1],
  R20: ["r5-ra-6", 0],
};

function rotationOffset(shape, rotation) {
  return rotation * (SHAPE_EDGE_COUNT[shape] / SHAPE_ROTATION_COUNT[shape]);
}

function activeEdges(piece, rotation) {
  const size = SHAPE_EDGE_COUNT[piece.shape];
  return new Set(PATTERN_PAIRS[piece.pattern].map(
    (edge) => (edge + rotationOffset(piece.shape, rotation)) % size,
  ));
}

function activeGraph(level, assignment) {
  const graph = new Map(level.slots.map((slot) => [slot.id, new Set()]));
  level.slots.forEach((slot) => {
    const piece = assignment.get(slot.id);
    const active = activeEdges(piece, piece.rotation);
    Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
      if (active.has(edge)) graph.get(slot.id).add(neighborId);
    });
  });
  return graph;
}

function isConnectedGraph(graph) {
  const start = graph.keys().next().value;
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    graph.get(current).forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }
  return visited.size === graph.size;
}

function evaluateAssignment(level, assignment) {
  for (const slot of level.slots) {
    const piece = assignment.get(slot.id);
    if (!piece || piece.shape !== slot.shape) return false;
    const active = activeEdges(piece, piece.rotation);
    for (const outsideEdge of slot.outside) {
      if (active.has(outsideEdge)) return false;
    }
    for (const [neighborId, edge] of Object.entries(slot.neighbors)) {
      if (slot.id > neighborId) continue;
      const neighbor = level.slots.find((candidate) => candidate.id === neighborId);
      const neighborPiece = assignment.get(neighborId);
      if (!neighbor || !neighborPiece) return false;
      const neighborActive = activeEdges(neighborPiece, neighborPiece.rotation);
      if (active.has(edge) !== neighborActive.has(neighbor.neighbors[slot.id])) return false;
    }
  }
  const graph = activeGraph(level, assignment);
  if ([...graph.values()].some((neighbors) => neighbors.size !== 2)) return false;
  return isConnectedGraph(graph);
}

function rotatePoint([x, y], degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

function pointKey([x, y]) {
  const normalizedX = Math.abs(x) < 0.0005 ? 0 : x;
  const normalizedY = Math.abs(y) < 0.0005 ? 0 : y;
  return `${normalizedX.toFixed(3)},${normalizedY.toFixed(3)}`;
}

function segmentKey(segment) {
  return segment.map(pointKey).sort().join("|");
}

console.log(`=== Verifying ${level5.id} ===`);
console.log(`Slots: ${level5.slots.length}, Pieces: ${level5.pieces.length}`);

const slotIds = new Set(level5.slots.map((slot) => slot.id));
const pieceIds = new Set(level5.pieces.map((piece) => piece.id));
const shapeCounts = Object.fromEntries(Object.keys(SHAPE_EDGE_COUNT).map((shape) => [
  shape,
  level5.slots.filter((slot) => slot.shape === shape).length,
]));
const inventoryOk = slotIds.size === level5.slots.length
  && pieceIds.size === level5.pieces.length
  && level5.slots.length === level5.pieces.length
  && Object.entries(shapeCounts).every(([shape, count]) => (
    level5.pieces.filter((piece) => piece.shape === shape).length === count
  ))
  && level5.pieces.every((piece) => (
    PATTERN_PAIRS[piece.pattern]
    && piece.rotations === SHAPE_ROTATION_COUNT[piece.shape]
  ));
console.log(`Inventory/schema: ${inventoryOk ? "OK" : "FAIL"} (${shapeCounts.hex} hex, ${shapeCounts.rhombus} rhombus, ${shapeCounts.triangle} triangle)`);

let adjacencyOk = true;
level5.slots.forEach((slot) => {
  Object.entries(slot.neighbors).forEach(([neighborId]) => {
    const neighbor = level5.slots.find((candidate) => candidate.id === neighborId);
    if (!neighbor || neighbor.neighbors[slot.id] === undefined) adjacencyOk = false;
  });
});
console.log(`Adjacency symmetric: ${adjacencyOk ? "OK" : "FAIL"}`);

let indexOk = true;
level5.slots.forEach((slot) => {
  const expectedEdgeCount = SHAPE_EDGE_COUNT[slot.shape];
  const used = [...slot.outside, ...Object.values(slot.neighbors)];
  if (slot.edgeCount !== expectedEdgeCount
    || used.length !== expectedEdgeCount
    || new Set(used).size !== expectedEdgeCount
    || used.some((edge) => !Number.isInteger(edge) || edge < 0 || edge >= expectedEdgeCount)) {
    indexOk = false;
  }
});
console.log(`Edge index accounting: ${indexOk ? "OK" : "FAIL"}`);

const geometryEdges = new Map();
level5.slots.forEach((slot) => {
  SHAPE_SEGMENTS[slot.shape].forEach((segment, localEdge) => {
    const transformed = segment.map((point) => {
      const [x, y] = rotatePoint(point, slot.shape === "hex" ? 0 : slot.angle);
      return [x + slot.center[0], y + slot.center[1]];
    });
    const key = segmentKey(transformed);
    if (!geometryEdges.has(key)) geometryEdges.set(key, []);
    geometryEdges.get(key).push({ slot, localEdge });
  });
});

let geometryOk = true;
let boundaryEdges = 0;
let sharedEdges = 0;
geometryEdges.forEach((owners) => {
  if (owners.length === 1) {
    boundaryEdges += 1;
    const { slot, localEdge } = owners[0];
    if (!slot.outside.includes(localEdge)) geometryOk = false;
  } else if (owners.length === 2) {
    sharedEdges += 1;
    const [a, b] = owners;
    if (a.slot.neighbors[b.slot.id] !== a.localEdge
      || b.slot.neighbors[a.slot.id] !== b.localEdge) geometryOk = false;
  } else {
    geometryOk = false;
  }
});
geometryOk = geometryOk && boundaryEdges === 24 && sharedEdges === 69;
console.log(`Geometry edge ownership: ${geometryOk ? "OK" : "FAIL"} (${boundaryEdges} boundary, ${sharedEdges} shared)`);

let intendedDataOk = Object.keys(INTENDED_PLACEMENTS).length === level5.slots.length;
const intended = new Map();
const intendedPieceIds = new Set();
level5.slots.forEach((slot) => {
  const placement = INTENDED_PLACEMENTS[slot.id];
  const piece = placement && level5.pieces.find((candidate) => candidate.id === placement[0]);
  if (!piece || piece.shape !== slot.shape || intendedPieceIds.has(piece.id)) {
    intendedDataOk = false;
    return;
  }
  intendedPieceIds.add(piece.id);
  intended.set(slot.id, { ...piece, rotation: placement[1] });
});
intendedDataOk = intendedDataOk && intendedPieceIds.size === level5.pieces.length;
const intendedValid = intendedDataOk && evaluateAssignment(level5, intended);
const intendedGraph = intendedValid ? activeGraph(level5, intended) : new Map();
const intendedEdgeCount = intendedValid
  ? [...intendedGraph.values()].reduce((sum, neighbors) => sum + neighbors.size, 0) / 2
  : 0;
console.log(`Intended solution satisfies win condition: ${intendedValid ? "YES" : "NO (FAIL)"} (${intendedGraph.size} nodes, ${intendedEdgeCount} cycle edges)`);

const hint = level5.hint;
const hintedPlacement = INTENDED_PLACEMENTS[hint.slotId];
const hintMatches = Boolean(hintedPlacement)
  && hintedPlacement[0] === hint.pieceId
  && hintedPlacement[1] === hint.rotation;
console.log(`Declared hint (${hint.pieceId}@${hint.slotId} rot${hint.rotation}) matches intended solution: ${hintMatches ? "YES" : "NO (FAIL)"}`);

function buildNaiveAssignment(pieceOrder, rotationFn) {
  const pools = Object.fromEntries(Object.keys(SHAPE_EDGE_COUNT).map((shape) => [
    shape,
    pieceOrder.filter((piece) => piece.shape === shape),
  ]));
  const counters = { hex: 0, rhombus: 0, triangle: 0 };
  return new Map(level5.slots.map((slot, index) => {
    const piece = pools[slot.shape][counters[slot.shape]];
    counters[slot.shape] += 1;
    return [slot.id, { ...piece, rotation: rotationFn(slot, piece, index) }];
  }));
}

const reversedPieces = [...level5.pieces].reverse();
const targetedCases = [
  ["inventory order, rotation 0", buildNaiveAssignment(level5.pieces, () => 0)],
  ["inventory order, rotation 1", buildNaiveAssignment(level5.pieces, (slot) => 1 % SHAPE_ROTATION_COUNT[slot.shape])],
  ["inventory order, slot-index rotations", buildNaiveAssignment(level5.pieces, (slot, piece, index) => index % SHAPE_ROTATION_COUNT[slot.shape])],
  ["reverse inventory order, rotation 0", buildNaiveAssignment(reversedPieces, () => 0)],
];
const rotatedHint = new Map([...intended].map(([slotId, piece]) => [slotId, { ...piece }]));
rotatedHint.get(hint.slotId).rotation = (rotatedHint.get(hint.slotId).rotation + 1) % SHAPE_ROTATION_COUNT.hex;
targetedCases.push(["intended placement with hinted hex rotated once", rotatedHint]);
const swappedHexes = new Map([...intended].map(([slotId, piece]) => [slotId, { ...piece }]));
const firstHex = swappedHexes.get("H0");
const distinctHex = swappedHexes.get("H3");
swappedHexes.set("H0", distinctHex);
swappedHexes.set("H3", firstHex);
targetedCases.push(["intended placement with H0/H3 pieces swapped", swappedHexes]);

let rejectedCases = 0;
targetedCases.forEach(([name, assignment]) => {
  const solves = evaluateAssignment(level5, assignment);
  if (!solves) rejectedCases += 1;
  console.log(`Targeted case "${name}": ${solves ? "SOLVES (unexpected)" : "does not solve (expected)"}`);
});
const targetedOk = rejectedCases === targetedCases.length;
console.log(`Targeted invalid placements rejected: ${rejectedCases}/${targetedCases.length}`);

const overall = inventoryOk && adjacencyOk && indexOk && geometryOk
  && intendedValid && hintMatches && targetedOk;
console.log(`\nOverall: ${overall ? "PASS" : "CHECK ABOVE FOR FAILURES"}`);
if (!overall) process.exitCode = 1;
