// Standalone verification script (no DOM) - copies the exact geometry
// formulas from src/main.js to empirically determine, for a given shape and
// slot.angle, which `edgeMap` permutation makes the rendered groove endpoint
// (edgeSegment/target formula) coincide with the TRUE polygon edge that the
// piece's own body occupies at that rotation (piecePolygon ground truth).
// This replaces further hand-derivation with brute-force numeric search.

const HEX_BASE_POINTS = [
  [1, 0], [.5, .8660254], [-.5, .8660254], [-1, 0], [-.5, -.8660254], [.5, -.8660254],
];
const RHOMBUS_BASE_POINTS = [
  [-.75, .4330127], [.25, .4330127], [.75, -.4330127], [-.25, -.4330127],
];
const TRIANGLE_BASE_POINTS = [
  [0, .5773503], [-.5, -.2886751], [.5, -.2886751],
];
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

const SHAPE_CONFIG = {
  hex: { edgeCount: 6, rotationCount: 6, basePoints: HEX_BASE_POINTS, edgeSegments: HEX_EDGE_SEGMENTS, angleStep: -60, usesSlotAngle: false },
  rhombus: { edgeCount: 4, rotationCount: 2, basePoints: RHOMBUS_BASE_POINTS, edgeSegments: RHOMBUS_EDGE_SEGMENTS, angleStep: 180, usesSlotAngle: true },
  triangle: { edgeCount: 3, rotationCount: 3, basePoints: TRIANGLE_BASE_POINTS, edgeSegments: TRIANGLE_EDGE_SEGMENTS, angleStep: 120, usesSlotAngle: true },
};

function rotatePoint(point, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function rotationOffset(shape, rotation) {
  const c = SHAPE_CONFIG[shape];
  return rotation * (c.edgeCount / c.rotationCount);
}
function physicalEdge(shape, localEdge, rotation) {
  const c = SHAPE_CONFIG[shape];
  return (localEdge + rotationOffset(shape, rotation)) % c.edgeCount;
}
function physicalRotationAngle(shape, rotation, slotAngle) {
  const c = SHAPE_CONFIG[shape];
  const base = c.usesSlotAngle ? slotAngle : 0;
  return base + rotation * c.angleStep;
}

// Ground truth: where does LOCAL edge `l` of the piece actually sit in the
// world, given the piece's true rotation state `r`, if we rotate+translate
// the whole polygon by physicalRotationAngle (this is exactly what
// piecePolygon() does for the piece BODY, which is unambiguous ground truth).
function bodyEdgeWorld(shape, localEdge, rotation, slotAngle, center) {
  const c = SHAPE_CONFIG[shape];
  const angle = physicalRotationAngle(shape, rotation, slotAngle);
  return c.edgeSegments[localEdge].map((p) => add(center, rotatePoint(p, angle)));
}

// The engine's actual `target` formula (position actually returned by
// edgeSegment/groovePath), parameterized by a candidate edgeMap.
function targetWorld(shape, localEdge, rotation, slotAngle, center, edgeMap) {
  const c = SHAPE_CONFIG[shape];
  const physical = physicalEdge(shape, localEdge, rotation);
  const usesSlotAngle = c.usesSlotAngle;
  const visualIndex = usesSlotAngle ? (edgeMap?.[physical] ?? physical) : physical;
  return c.edgeSegments[visualIndex].map((p) => add(center, rotatePoint(p, usesSlotAngle ? slotAngle : 0)));
}

function segSetDistance(a, b) {
  // unordered pair comparison (min over both orderings)
  const direct = Math.max(dist(a[0], b[0]), dist(a[1], b[1]));
  const swapped = Math.max(dist(a[0], b[1]), dist(a[1], b[0]));
  return Math.min(direct, swapped);
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  arr.forEach((item, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    permutations(rest).forEach((p) => result.push([item, ...p]));
  });
  return result;
}

function findBestEdgeMap(shape, slotAngle, center = [0, 0]) {
  const c = SHAPE_CONFIG[shape];
  const candidates = permutations([...Array(c.edgeCount).keys()]);
  let best = null;
  let bestError = Infinity;
  for (const edgeMap of candidates) {
    let maxError = 0;
    for (let r = 0; r < c.rotationCount; r += 1) {
      for (let l = 0; l < c.edgeCount; l += 1) {
        const truth = bodyEdgeWorld(shape, l, r, slotAngle, center);
        const test = targetWorld(shape, l, r, slotAngle, center, edgeMap);
        maxError = Math.max(maxError, segSetDistance(truth, test));
      }
    }
    if (maxError < bestError) {
      bestError = maxError;
      best = edgeMap;
    }
  }
  return { edgeMap: best, error: bestError };
}

console.log("=== Rhombus sanity check (expect edgeMap matching level1.js) ===");
for (const angle of [0, -60, -120]) {
  const { edgeMap, error } = findBestEdgeMap("rhombus", angle);
  console.log(`rhombus angle=${angle}: edgeMap=${JSON.stringify(edgeMap)} error=${error.toFixed(6)}`);
}

console.log("\n=== Triangle: all 60-degree slot angles ===");
for (const angle of [0, 60, 120, 180, 240, 300, -60, -120, -180, -240, -300]) {
  const { edgeMap, error } = findBestEdgeMap("triangle", angle);
  console.log(`triangle angle=${angle}: edgeMap=${JSON.stringify(edgeMap)} error=${error.toFixed(6)}`);
}
