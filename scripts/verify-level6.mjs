// Side-effect-free construction and exhaustive verifier for Level 6.
import { level6 } from "../src/levels/level6.js";

const SQRT3 = Math.sqrt(3);
const SHAPE_EDGE_COUNT = { rhombus: 4, triangle: 3 };
const SHAPE_ROTATION_COUNT = { rhombus: 2, triangle: 3 };
const PATTERN_PAIRS = {
  RA: [0, 1],
  RO: [0, 3],
  P0: [0, 2],
  P1: [1, 3],
  T1: [0, 1],
};
const SHAPE_PATTERNS = {
  rhombus: ["RA", "RO", "P0", "P1"],
  triangle: ["T1"],
};
const EXPECTED_SHAPES = { rhombus: 9, triangle: 6 };
const EXPECTED_PATTERNS = { RA: 2, RO: 3, P0: 1, P1: 3, T1: 6 };
const IDENTITY_EDGE_MAP = [0, 1, 2, 3];

// Each recipe names elementary triangles in the side-2 lattice hexagon.
// Paired cells share one edge and therefore form one unit rhombus.
const SLOT_CELLS = {
  R01: ["D:-2:-1", "U:-1:-1"],
  R02: ["U:-2:0", "D:-2:0"],
  R03: ["U:-2:1", "D:-2:1"],
  R04: ["D:-1:-1", "U:0:-1"],
  R05: ["U:-1:1", "D:-1:1"],
  R06: ["U:0:-2", "D:0:-2"],
  R07: ["D:0:-1", "U:0:0"],
  R08: ["D:0:0", "U:0:1"],
  R09: ["D:1:-1", "U:1:0"],
  T01: ["D:-1:-2"],
  T02: ["U:-1:0"],
  T03: ["D:-1:0"],
  T04: ["U:1:-2"],
  T05: ["D:1:-2"],
  T06: ["U:1:-1"],
};

const INTENDED_CYCLE = [
  "R03", "R02", "R01", "T01", "R06",
  "T04", "T05", "T06", "R09", "R08",
  "R07", "R04", "T02", "T03", "R05",
];

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function axialPointKey([p, q]) {
  return `${p},${q}`;
}

function edgeKey(a, b) {
  const keys = [axialPointKey(a), axialPointKey(b)].sort();
  return `${keys[0]}|${keys[1]}`;
}

function parsePoint(key) {
  return key.split(",").map(Number);
}

function parseEdge(key) {
  return key.split("|").map(parsePoint);
}

function sorted(values) {
  return [...values].sort();
}

function sameArray(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameCounter(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] || 0) === (b[key] || 0));
}

function counter(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return result;
}

function inSideTwoHex(p, q) {
  return Math.abs(p) <= 2 && Math.abs(q) <= 2 && Math.abs(p + q) <= 2;
}

function makeCell(type, p, q, vertices) {
  const id = `${type}:${p}:${q}`;
  const edges = [
    edgeKey(vertices[0], vertices[1]),
    edgeKey(vertices[0], vertices[2]),
    edgeKey(vertices[1], vertices[2]),
  ];
  return { id, type, p, q, vertices, edges };
}

function constructElementaryCells() {
  const cells = new Map();
  for (let p = -3; p <= 3; p += 1) {
    for (let q = -3; q <= 3; q += 1) {
      const up = [[p, q], [p + 1, q], [p, q + 1]];
      if (up.every(([a, b]) => inSideTwoHex(a, b))) {
        const cell = makeCell("U", p, q, up);
        cells.set(cell.id, cell);
      }
      const down = [[p + 1, q], [p, q + 1], [p + 1, q + 1]];
      if (down.every(([a, b]) => inSideTwoHex(a, b))) {
        const cell = makeCell("D", p, q, down);
        cells.set(cell.id, cell);
      }
    }
  }
  check(cells.size === 24, `side-2 hex should contain 24 cells, found ${cells.size}`);
  return cells;
}

function xorEdges(cells) {
  const parity = new Set();
  for (const cell of cells) {
    for (const edge of cell.edges) {
      if (parity.has(edge)) parity.delete(edge);
      else parity.add(edge);
    }
  }
  return parity;
}

function rotate60([p, q]) {
  return [-q, p + q];
}

function rotateTimes(point, turns) {
  let result = point;
  for (let i = 0; i < turns; i += 1) result = rotate60(result);
  return result;
}

function reflect([p, q]) {
  return [p + q, -q];
}

function transformPoint(point, turns, reflected) {
  return rotateTimes(reflected ? reflect(point) : point, turns);
}

function transformEdge(key, turns, reflected) {
  const [a, b] = parseEdge(key);
  return edgeKey(transformPoint(a, turns, reflected), transformPoint(b, turns, reflected));
}

function rhombusGeometry(cells, boundary) {
  check(cells.length === 2, "rhombus recipe must contain exactly two cells");
  check(cells[0].edges.filter((edge) => cells[1].edges.includes(edge)).length === 1,
    `rhombus cells ${cells[0].id}/${cells[1].id} must share exactly one edge`);

  const vertices = new Map();
  for (const edge of boundary) {
    for (const point of parseEdge(edge)) vertices.set(axialPointKey(point), point);
  }
  check(vertices.size === 4, "rhombus boundary must have four vertices");

  const points = [...vertices.values()];
  const doubledCenter = [
    points.reduce((sum, [p]) => sum + p, 0) / 2,
    points.reduce((sum, [, q]) => sum + q, 0) / 2,
  ];
  check(doubledCenter.every(Number.isInteger), "rhombus center must be half-lattice exact");

  const baseDoubled = [[-2, 1], [0, 1], [2, -1], [0, -1]];
  const target = new Set(points.map(([p, q]) => axialPointKey([2 * p, 2 * q])));
  for (let turns = 0; turns < 3; turns += 1) {
    const transformed = baseDoubled.map((point) => {
      const [p, q] = rotateTimes(point, turns);
      return [p + doubledCenter[0], q + doubledCenter[1]];
    });
    if (!transformed.every((point) => target.has(axialPointKey(point)))) continue;
    check(transformed.every(([p, q]) => p % 2 === 0 && q % 2 === 0),
      "transformed rhombus vertices must land on lattice points");
    const verticesInEngineOrder = transformed.map(([p, q]) => [p / 2, q / 2]);
    const localEdges = [
      edgeKey(verticesInEngineOrder[1], verticesInEngineOrder[2]),
      edgeKey(verticesInEngineOrder[2], verticesInEngineOrder[3]),
      edgeKey(verticesInEngineOrder[3], verticesInEngineOrder[0]),
      edgeKey(verticesInEngineOrder[0], verticesInEngineOrder[1]),
    ];
    return {
      angle: turns * 60,
      centerAxial: [doubledCenter[0] / 2, doubledCenter[1] / 2],
      localEdges,
      boundary,
    };
  }
  throw new Error(`FAIL: could not orient rhombus ${cells.map((cell) => cell.id).join("/")}`);
}

function triangleGeometry(cell, boundary) {
  let verticesInEngineOrder;
  let centerAxial;
  let angle;
  if (cell.type === "U") {
    verticesInEngineOrder = [
      [cell.p, cell.q + 1],
      [cell.p, cell.q],
      [cell.p + 1, cell.q],
    ];
    centerAxial = [cell.p + 1 / 2, cell.q + 1 / 3];
    angle = 0;
  } else {
    verticesInEngineOrder = [
      [cell.p + 1, cell.q],
      [cell.p + 1, cell.q + 1],
      [cell.p, cell.q + 1],
    ];
    centerAxial = [cell.p + 2 / 3, cell.q + 2 / 3];
    angle = 180;
  }
  return {
    angle,
    centerAxial,
    localEdges: [
      edgeKey(verticesInEngineOrder[0], verticesInEngineOrder[1]),
      edgeKey(verticesInEngineOrder[1], verticesInEngineOrder[2]),
      edgeKey(verticesInEngineOrder[2], verticesInEngineOrder[0]),
    ],
    boundary,
  };
}

function constructGeometry(cells) {
  const usedCells = [];
  const geometry = new Map();
  for (const [slotId, cellIds] of Object.entries(SLOT_CELLS)) {
    const recipeCells = cellIds.map((cellId) => {
      check(cells.has(cellId), `${slotId} references missing cell ${cellId}`);
      return cells.get(cellId);
    });
    usedCells.push(...cellIds);
    const boundary = xorEdges(recipeCells);
    geometry.set(
      slotId,
      cellIds.length === 2
        ? rhombusGeometry(recipeCells, boundary)
        : triangleGeometry(recipeCells[0], boundary),
    );
  }
  check(usedCells.length === cells.size, "slot recipes must account for all 24 cells");
  check(new Set(usedCells).size === usedCells.length, "slot recipes overlap elementary cells");
  check(sameArray(sorted(usedCells), sorted(cells.keys())), "slot recipes must tile the whole hex");
  return geometry;
}

function axialToCartesian([p, q]) {
  return [p + q / 2, (SQRT3 / 2) * q];
}

function deriveOwnership(geometry) {
  const owners = new Map();
  for (const [slotId, data] of geometry) {
    data.localEdges.forEach((edge, localIndex) => {
      if (!owners.has(edge)) owners.set(edge, []);
      owners.get(edge).push({ slotId, localIndex });
    });
  }
  return owners;
}

function validateSchemaAndGeometry(cells, geometry, owners) {
  check(level6.id === "sixfold-weave" && level6.number === 6, "level identity is invalid");
  check(level6.endpointMode === "center", "endpointMode must be center");
  check(level6.board?.side === 2, "board side must describe the side-2 hexagon");
  check(level6.slots.length === 15 && level6.pieces.length === 15,
    "Level 6 must have exactly 15 slots and pieces");

  const slotIds = level6.slots.map((slot) => slot.id);
  const pieceIds = level6.pieces.map((piece) => piece.id);
  check(new Set(slotIds).size === slotIds.length, "slot IDs must be unique");
  check(new Set(pieceIds).size === pieceIds.length, "piece IDs must be unique");
  check(sameArray(sorted(slotIds), sorted(Object.keys(SLOT_CELLS))),
    "level slot IDs must exactly match the geometric recipes");

  const slotShapeCounts = counter(level6.slots.map((slot) => slot.shape));
  const pieceShapeCounts = counter(level6.pieces.map((piece) => piece.shape));
  check(sameCounter(slotShapeCounts, EXPECTED_SHAPES), "slot shape counts are invalid");
  check(sameCounter(pieceShapeCounts, EXPECTED_SHAPES), "piece shape counts are invalid");

  const slotsById = new Map(level6.slots.map((slot) => [slot.id, slot]));
  const expectedNeighbors = new Map(level6.slots.map((slot) => [slot.id, {}]));
  const expectedOutside = new Map(level6.slots.map((slot) => [slot.id, []]));
  let boundaryEdges = 0;
  let sharedEdges = 0;

  for (const [edge, edgeOwners] of owners) {
    check(edgeOwners.length === 1 || edgeOwners.length === 2,
      `geometric edge ${edge} has ${edgeOwners.length} owners`);
    if (edgeOwners.length === 1) {
      boundaryEdges += 1;
      const [{ slotId, localIndex }] = edgeOwners;
      expectedOutside.get(slotId).push(localIndex);
    } else {
      sharedEdges += 1;
      const [a, b] = edgeOwners;
      expectedNeighbors.get(a.slotId)[b.slotId] = a.localIndex;
      expectedNeighbors.get(b.slotId)[a.slotId] = b.localIndex;
    }
  }

  const totalEdges = level6.slots.reduce((sum, slot) => sum + slot.edgeCount, 0);
  check(totalEdges === 54, `expected 54 local edges, found ${totalEdges}`);
  check(boundaryEdges === 12 && sharedEdges === 21,
    `expected 12 boundary and 21 shared edges, found ${boundaryEdges}/${sharedEdges}`);
  check(boundaryEdges + 2 * sharedEdges === totalEdges, "edge accounting identity failed");

  for (const slot of level6.slots) {
    const data = geometry.get(slot.id);
    const expectedShape = SLOT_CELLS[slot.id].length === 2 ? "rhombus" : "triangle";
    check(slot.shape === expectedShape, `${slot.id} has the wrong shape`);
    check(slot.edgeCount === SHAPE_EDGE_COUNT[slot.shape], `${slot.id} has wrong edgeCount`);
    check(slot.angle === data.angle, `${slot.id} has wrong lattice orientation`);
    if (slot.shape === "rhombus") {
      check(sameArray(slot.edgeMap, IDENTITY_EDGE_MAP), `${slot.id} must use identity edgeMap`);
    } else {
      check(slot.edgeMap === undefined, `${slot.id} should not define edgeMap`);
    }
    const expectedCenter = axialToCartesian(data.centerAxial);
    check(slot.center.length === 2 && slot.center.every(Number.isFinite),
      `${slot.id} center must contain two finite numbers`);
    check(Math.abs(slot.center[0] - expectedCenter[0]) < 1e-6
      && Math.abs(slot.center[1] - expectedCenter[1]) < 1e-6,
    `${slot.id} center does not match its exact lattice cells`);

    check(sameArray(sorted(slot.outside), sorted(expectedOutside.get(slot.id))),
      `${slot.id} outside edges disagree with geometric ownership`);
    check(sameArray(
      Object.entries(slot.neighbors).sort(),
      Object.entries(expectedNeighbors.get(slot.id)).sort(),
    ), `${slot.id} neighbors disagree with geometric ownership`);

    for (const [neighborId, edgeIndex] of Object.entries(slot.neighbors)) {
      const neighbor = slotsById.get(neighborId);
      check(neighbor, `${slot.id} references missing neighbor ${neighborId}`);
      check(neighbor.neighbors[slot.id] !== undefined,
        `${slot.id}/${neighborId} adjacency is not symmetric`);
      check(Number.isInteger(edgeIndex) && edgeIndex >= 0 && edgeIndex < slot.edgeCount,
        `${slot.id}/${neighborId} uses invalid local edge ${edgeIndex}`);
    }
  }

  const silhouetteBoundary = new Set(
    [...owners].filter(([, edgeOwners]) => edgeOwners.length === 1).map(([edge]) => edge),
  );
  for (const reflected of [false, true]) {
    for (let turns = 0; turns < 6; turns += 1) {
      const transformed = new Set(
        [...silhouetteBoundary].map((edge) => transformEdge(edge, turns, reflected)),
      );
      check(sameArray(sorted(transformed), sorted(silhouetteBoundary)),
        `outer boundary is not invariant under D6 transform ${turns}/${reflected}`);
    }
  }
  check(cells.size === 24, "canonical cell construction changed unexpectedly");
  return { slotsById, boundaryEdges, sharedEdges };
}

function activePair(shape, pattern, rotation) {
  const edgeCount = SHAPE_EDGE_COUNT[shape];
  const offset = rotation * (edgeCount / SHAPE_ROTATION_COUNT[shape]);
  return sorted(PATTERN_PAIRS[pattern].map((edge) => (edge + offset) % edgeCount));
}

function optionForPair(shape, pair) {
  for (const pattern of SHAPE_PATTERNS[shape]) {
    for (let rotation = 0; rotation < SHAPE_ROTATION_COUNT[shape]; rotation += 1) {
      if (sameArray(activePair(shape, pattern, rotation), pair)) return { pattern, rotation };
    }
  }
  throw new Error(`FAIL: no ${shape} pattern realizes pair ${pair}`);
}

function cycleOptions(cycle, slotsById) {
  const options = new Map();
  for (let i = 0; i < cycle.length; i += 1) {
    const slotId = cycle[i];
    const previous = cycle[(i - 1 + cycle.length) % cycle.length];
    const next = cycle[(i + 1) % cycle.length];
    const slot = slotsById.get(slotId);
    const pair = sorted([slot.neighbors[previous], slot.neighbors[next]]);
    check(pair[0] !== pair[1], `${slotId} cycle uses one edge twice`);
    options.set(slotId, { ...optionForPair(slot.shape, pair), pair });
  }
  return options;
}

function optionHistogram(options) {
  return counter([...options.values()].map(({ pattern }) => pattern));
}

function evaluateAssignment(assignment, slotsById) {
  const graph = new Map(level6.slots.map((slot) => [slot.id, new Set()]));
  for (const slot of level6.slots) {
    const placement = assignment.get(slot.id);
    check(placement, `assignment omits ${slot.id}`);
    const active = new Set(activePair(slot.shape, placement.pattern, placement.rotation));
    if (slot.outside.some((edge) => active.has(edge))) return false;
    for (const [neighborId, edge] of Object.entries(slot.neighbors)) {
      const neighborPlacement = assignment.get(neighborId);
      const neighbor = slotsById.get(neighborId);
      const neighborActive = new Set(
        activePair(neighbor.shape, neighborPlacement.pattern, neighborPlacement.rotation),
      );
      if (active.has(edge) !== neighborActive.has(neighbor.neighbors[slot.id])) return false;
      if (active.has(edge)) graph.get(slot.id).add(neighborId);
    }
  }
  if ([...graph.values()].some((neighbors) => neighbors.size !== 2)) return false;
  const start = level6.slots[0].id;
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of graph.get(current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size === level6.slots.length;
}

function enumerateHamiltonianCycles(slotsById) {
  const ids = sorted(slotsById.keys());
  const start = ids[0];
  const path = [start];
  const visited = new Set(path);
  const cycles = [];

  function search(current) {
    if (path.length === ids.length) {
      if (slotsById.get(current).neighbors[start] !== undefined
        && path[1].localeCompare(path[path.length - 1]) < 0) {
        cycles.push([...path]);
      }
      return;
    }
    const candidates = Object.keys(slotsById.get(current).neighbors)
      .filter((id) => !visited.has(id))
      .sort((a, b) => {
        const availableA = Object.keys(slotsById.get(a).neighbors)
          .filter((id) => !visited.has(id)).length;
        const availableB = Object.keys(slotsById.get(b).neighbors)
          .filter((id) => !visited.has(id)).length;
        return availableA - availableB || a.localeCompare(b);
      });
    for (const next of candidates) {
      visited.add(next);
      path.push(next);
      search(next);
      path.pop();
      visited.delete(next);
    }
  }

  search(start);
  return cycles;
}

function assignPieces(options) {
  const available = {};
  for (const piece of level6.pieces) {
    (available[piece.pattern] ||= []).push(piece);
  }
  const assignment = new Map();
  for (const slot of level6.slots) {
    const option = options.get(slot.id);
    const piece = available[option.pattern].shift();
    check(piece, `inventory lacks ${option.pattern} for ${slot.id}`);
    assignment.set(slot.id, { ...piece, rotation: option.rotation });
  }
  check(Object.values(available).every((pieces) => pieces.length === 0),
    "intended assignment leaves pieces unused");
  return assignment;
}

function sharedEdgeForSlots(owners, a, b) {
  for (const [edge, edgeOwners] of owners) {
    if (edgeOwners.length === 2
      && edgeOwners.some((owner) => owner.slotId === a)
      && edgeOwners.some((owner) => owner.slotId === b)) return edge;
  }
  throw new Error(`FAIL: ${a}/${b} have no shared geometric edge`);
}

function startSignature(slotId, pair, geometry, turns, reflected) {
  const data = geometry.get(slotId);
  const polygon = sorted([...data.boundary].map((edge) => transformEdge(edge, turns, reflected)));
  const active = sorted(pair.map((index) => (
    transformEdge(data.localEdges[index], turns, reflected)
  )));
  return JSON.stringify([polygon, active]);
}

function analyzeSolutions(slotsById, geometry, owners) {
  check(sameCounter(counter(level6.pieces.map((piece) => piece.pattern)), EXPECTED_PATTERNS),
    "piece inventory pattern histogram is invalid");
  for (const piece of level6.pieces) {
    check(SHAPE_PATTERNS[piece.shape]?.includes(piece.pattern),
      `${piece.id} uses pattern ${piece.pattern} on incompatible shape ${piece.shape}`);
    check(piece.rotations === SHAPE_ROTATION_COUNT[piece.shape],
      `${piece.id} has invalid rotation count`);
    check(piece.bits === undefined, `${piece.id} must not use matching bits`);
  }

  const cycles = enumerateHamiltonianCycles(slotsById);
  const analyzed = cycles.map((cycle) => {
    const options = cycleOptions(cycle, slotsById);
    return { cycle, options, histogram: optionHistogram(options) };
  });
  const solutions = analyzed.filter(({ histogram }) => sameCounter(histogram, EXPECTED_PATTERNS));
  check(cycles.length === 3, `expected 3 Hamiltonian cycles, found ${cycles.length}`);
  check(solutions.length === 1, `expected 1 inventory-compatible solution, found ${solutions.length}`);

  const intendedOptions = cycleOptions(INTENDED_CYCLE, slotsById);
  check(sameCounter(optionHistogram(intendedOptions), EXPECTED_PATTERNS),
    "intended cycle does not match the inventory");
  const intendedSolution = solutions[0];
  const intendedEdges = new Set();
  for (let i = 0; i < INTENDED_CYCLE.length; i += 1) {
    intendedEdges.add(sharedEdgeForSlots(
      owners,
      INTENDED_CYCLE[i],
      INTENDED_CYCLE[(i + 1) % INTENDED_CYCLE.length],
    ));
  }
  const solutionEdges = new Set();
  for (let i = 0; i < intendedSolution.cycle.length; i += 1) {
    solutionEdges.add(sharedEdgeForSlots(
      owners,
      intendedSolution.cycle[i],
      intendedSolution.cycle[(i + 1) % intendedSolution.cycle.length],
    ));
  }
  check(sameArray(sorted(intendedEdges), sorted(solutionEdges)),
    "declared intended cycle is not the enumerated solution");

  const assignment = assignPieces(intendedOptions);
  check(evaluateAssignment(assignment, slotsById), "intended assignment fails engine win logic");
  const hintPlacement = assignment.get(level6.hint.slotId);
  check(hintPlacement, "hint references a missing slot");
  check(hintPlacement.id === level6.hint.pieceId
    && hintPlacement.rotation === level6.hint.rotation,
  "hint is not a member of the intended solution");

  const candidateStarts = new Map();
  for (const solution of solutions) {
    for (const [slotId, option] of solution.options) {
      candidateStarts.set(
        `${slotId}|${option.pattern}|${option.rotation}`,
        { slotId, ...option },
      );
    }
  }
  const startOrbits = new Set();
  for (const { slotId, pair } of candidateStarts.values()) {
    const signatures = [];
    for (const reflected of [false, true]) {
      for (let turns = 0; turns < 6; turns += 1) {
        signatures.push(startSignature(slotId, pair, geometry, turns, reflected));
      }
    }
    startOrbits.add(signatures.sort()[0]);
  }
  check(candidateStarts.size === 15, `expected 15 supported starts, found ${candidateStarts.size}`);
  check(startOrbits.size === 9, `expected 9 D6 start orbits, found ${startOrbits.size}`);

  const grooveStabilizers = [];
  for (const reflected of [false, true]) {
    for (let turns = 0; turns < 6; turns += 1) {
      const transformed = new Set(
        [...intendedEdges].map((edge) => transformEdge(edge, turns, reflected)),
      );
      if (sameArray(sorted(transformed), sorted(intendedEdges))) {
        grooveStabilizers.push({ turns, reflected });
      }
    }
  }
  check(grooveStabilizers.length === 1
    && grooveStabilizers[0].turns === 0
    && grooveStabilizers[0].reflected === false,
  "intended groove has a nontrivial D6 symmetry");

  return {
    cycles,
    solutions,
    candidateStarts,
    startOrbits,
    assignment,
  };
}

const cells = constructElementaryCells();
const geometry = constructGeometry(cells);
const owners = deriveOwnership(geometry);
const { slotsById, boundaryEdges, sharedEdges } = validateSchemaAndGeometry(
  cells,
  geometry,
  owners,
);
const analysis = analyzeSolutions(slotsById, geometry, owners);

console.log("=== Level 6 verification: PASS ===");
console.log(`Geometry: 24 elementary triangles -> 9 rhombi + 6 triangles (${level6.slots.length} slots)`);
console.log(`Edge ownership: ${boundaryEdges} outside + 2 x ${sharedEdges} shared half-edges = 54 local edges`);
console.log("Schema/inventory/IDs/shape counts/adjacency/centers: OK");
console.log(`Hamiltonian cycles enumerated (reversal quotiented): ${analysis.cycles.length}`);
console.log(`Distinct valid solutions (identical labels quotiented): ${analysis.solutions.length}`);
console.log(`Solution-supported legal starts: ${analysis.candidateStarts.size} (${analysis.startOrbits.size} D6-inequivalent)`);
console.log("Intended groove symmetry: identity only (asymmetric under all 11 nontrivial D6 transforms)");
console.log(`Hint verified: ${level6.hint.pieceId} -> ${level6.hint.slotId} @ rotation ${level6.hint.rotation}`);
