// Constructs Level 4's board: a side-3 hexagon on the triangular lattice,
// decomposed into 1 central hexagon slot (the 6 elementary triangles around
// the origin), 18 individual triangle slots (the "collar1" ring), and 15
// rhombus slots (the "collar2" outer ring, paired up from 30 elementary
// triangles). Adjacency/outside-edges are derived by exact endpoint matching
// (no floating-point tolerance issues since all lattice coordinates are
// exact rationals times sqrt(3)); this replaces hand-derivation with
// mechanical, verifiable construction, per the design brief's own request
// to double-check large-board adjacency by code before shipping.

const SQRT3 = Math.sqrt(3);
function cart([p, q]) { return [p + q / 2, (SQRT3 / 2) * q]; }
function hexDist(p, q) { return (Math.abs(p) + Math.abs(q) + Math.abs(p + q)) / 2; }
function key(pt) { return `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`; }

const N = 3; // side length of the big hexagon
function inBounds(p, q) {
  return Math.abs(p) <= N && Math.abs(q) <= N && Math.abs(p + q) <= N;
}

// Enumerate every elementary triangle (up-pointing U and down-pointing D)
// whose 3 vertices all lie within the side-N hex.
const triangles = [];
for (let p = -N - 1; p <= N + 1; p += 1) {
  for (let q = -N - 1; q <= N + 1; q += 1) {
    const uVerts = [[p, q], [p + 1, q], [p, q + 1]];
    if (uVerts.every(([a, b]) => inBounds(a, b))) {
      triangles.push({ type: "U", p, q, verts: uVerts });
    }
    const dVerts = [[p + 1, q], [p, q + 1], [p + 1, q + 1]];
    if (dVerts.every(([a, b]) => inBounds(a, b))) {
      triangles.push({ type: "D", p, q, verts: dVerts });
    }
  }
}

// Classify each triangle by the max hex-distance of its vertices from the
// origin: <=1 => core (forms the central hexagon), ==2 => collar1 (loose
// triangle slots), ==3 => collar2 (paired into rhombi).
triangles.forEach((t) => {
  t.maxDist = Math.max(...t.verts.map(([a, b]) => hexDist(a, b)));
});
const core = triangles.filter((t) => t.maxDist <= 1);
const collar1 = triangles.filter((t) => t.maxDist === 2);
const collar2 = triangles.filter((t) => t.maxDist === 3);
console.log(`core=${core.length} collar1=${collar1.length} collar2=${collar2.length} total=${triangles.length}`);

// --- Build the central hexagon slot -----------------------------------
// Its 6 vertices are the 6 lattice points at distance 1 from the origin, in
// counterclockwise angular order.
const ring1Points = [];
for (let p = -1; p <= 1; p += 1) {
  for (let q = -1; q <= 1; q += 1) {
    if (hexDist(p, q) === 1) ring1Points.push([p, q]);
  }
}
ring1Points.sort((a, b) => Math.atan2(cart(a)[1], cart(a)[0]) - Math.atan2(cart(b)[1], cart(b)[0]));
const hexVertsCart = ring1Points.map(cart);
// hexEdges[i] = segment from vertex i to vertex i+1 (mod 6), matching the
// counterclockwise "edge i joins vertex i to vertex i+1" convention.
const hexEdges = hexVertsCart.map((v, i) => [v, hexVertsCart[(i + 1) % 6]]);

function segKey(seg) {
  const a = key(seg[0]);
  const b = key(seg[1]);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// --- Build collar1 triangle slots --------------------------------------
// Each collar1 triangle keeps its own 3 vertices (in CCW order matching the
// enumeration order given above for U/D, which is already CCW by construction
// since U=(p,q),(p+1,q),(p,q+1) and D=(p+1,q),(p,q+1),(p+1,q+1) both wind CCW
// on this lattice - verified below by signed-area check).
function signedArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

const triSlots = collar1.map((t, i) => {
  const cartVerts = t.verts.map(cart);
  if (signedArea(cartVerts) < 0) cartVerts.reverse();
  return {
    id: `A${i}`,
    kind: "triangle",
    verts: cartVerts,
    edges: cartVerts.map((v, k) => [v, cartVerts[(k + 1) % 3]]),
  };
});

// --- Pair up collar2 triangles into rhombi ------------------------------
// Build adjacency among collar2 triangles by shared-edge matching, then walk
// the resulting ring (each collar2 triangle has exactly 2 collar2 neighbors,
// forming a single cycle of 30) and pair consecutive triangles.
function triCart(t) {
  const verts = t.verts.map(cart);
  return signedArea(verts) < 0 ? verts.slice().reverse() : verts;
}
collar2.forEach((t) => { t.cartVerts = triCart(t); t.edges = t.cartVerts.map((v, i) => [v, t.cartVerts[(i + 1) % 3]]); });

const edgeOwners = new Map(); // segKey -> [triangleIndex,...]
collar2.forEach((t, idx) => {
  t.edges.forEach((seg) => {
    const k = segKey(seg);
    if (!edgeOwners.has(k)) edgeOwners.set(k, []);
    edgeOwners.get(k).push(idx);
  });
});
const collar2Adj = collar2.map(() => new Set());
edgeOwners.forEach((owners) => {
  if (owners.length === 2) {
    collar2Adj[owners[0]].add(owners[1]);
    collar2Adj[owners[1]].add(owners[0]);
  }
});
console.log("collar2 neighbor-degree histogram:", collar2Adj.map((s) => s.size).reduce((acc, n) => { acc[n] = (acc[n] || 0) + 1; return acc; }, {}));

// Walk the ring starting from triangle 0, always stepping to an unvisited
// neighbor, to get a single cyclic order of all 30 collar2 triangles.
const visited = new Array(collar2.length).fill(false);
const ringOrder = [0];
visited[0] = true;
while (ringOrder.length < collar2.length) {
  const current = ringOrder[ringOrder.length - 1];
  const next = [...collar2Adj[current]].find((n) => !visited[n]);
  if (next === undefined) { console.log("FAIL: could not extend ring, stuck at", current); break; }
  ringOrder.push(next);
  visited[next] = true;
}
console.log(`collar2 ring length: ${ringOrder.length} (expect 30)`);

// Pair consecutive triangles in the ring into rhombi.
const rhombusSlots = [];
for (let j = 0; j < 15; j += 1) {
  const ta = collar2[ringOrder[2 * j]];
  const tb = collar2[ringOrder[2 * j + 1]];
  // shared edge between ta and tb
  const sharedKeySet = new Set(ta.edges.map(segKey));
  const sharedEdge = tb.edges.find((seg) => sharedKeySet.has(segKey(seg)));
  if (!sharedEdge) { console.log(`FAIL: pair ${j} (${2 * j},${2 * j + 1}) does not share an edge`); }
  // Rhombus vertices: the 4 distinct points among ta+tb's vertices, ordered
  // CCW. Two of them are the shared edge's endpoints; the other two are each
  // triangle's "apex" (the vertex not on the shared edge).
  const sharedPts = sharedEdge;
  const apexA = ta.cartVerts.find((v) => !sharedPts.some((s) => key(s) === key(v)));
  const apexB = tb.cartVerts.find((v) => !sharedPts.some((s) => key(s) === key(v)));
  // Order CCW: apexA, sharedPts[0], apexB, sharedPts[1] (or reversed) - build
  // and fix winding via signedArea.
  let rhomb = [apexA, sharedPts[0], apexB, sharedPts[1]];
  if (signedArea(rhomb) < 0) rhomb = [apexA, sharedPts[1], apexB, sharedPts[0]];
  rhombusSlots.push({
    id: `R${j}`,
    kind: "rhombus",
    verts: rhomb,
    edges: rhomb.map((v, i) => [v, rhomb[(i + 1) % 4]]),
  });
}

// --- Global adjacency: match every slot's edges against every other slot's
// edges (including the hex) by exact endpoint coincidence. -----------------
const allSlots = [
  { id: "H0", kind: "hex", verts: hexVertsCart, edges: hexEdges },
  ...triSlots,
  ...rhombusSlots,
];
const globalEdgeOwners = new Map(); // segKey -> [[slotId, edgeIndex], ...]
allSlots.forEach((slot) => {
  slot.edges.forEach((seg, edgeIndex) => {
    const k = segKey(seg);
    if (!globalEdgeOwners.has(k)) globalEdgeOwners.set(k, []);
    globalEdgeOwners.get(k).push([slot.id, edgeIndex]);
  });
});

const neighbors = new Map(allSlots.map((s) => [s.id, {}]));
const outside = new Map(allSlots.map((s) => [s.id, []]));
let multiEdgeIssues = 0;
globalEdgeOwners.forEach((owners, segK) => {
  if (owners.length === 1) {
    const [[slotId, edgeIndex]] = owners;
    outside.get(slotId).push(edgeIndex);
  } else if (owners.length === 2) {
    const [[idA, edgeA], [idB, edgeB]] = owners;
    neighbors.get(idA)[idB] = edgeA;
    neighbors.get(idB)[idA] = edgeB;
  } else {
    multiEdgeIssues += 1;
    console.log(`FAIL: edge ${segK} owned by ${owners.length} slots`, owners);
  }
});
console.log(`multiEdgeIssues=${multiEdgeIssues}`);

// Sanity: total edges = sum of edgeCounts; outside edges + 2*internal edges
// should equal total edges.
const totalEdgeSlots = allSlots.reduce((sum, s) => sum + s.edges.length, 0);
const totalOutside = [...outside.values()].reduce((sum, arr) => sum + arr.length, 0);
const totalInternalPairs = [...neighbors.values()].reduce((sum, obj) => sum + Object.keys(obj).length, 0);
console.log(`totalEdgeSlots=${totalEdgeSlots} totalOutside=${totalOutside} totalInternalHalfEdges=${totalInternalPairs} (outside+internal should = totalEdgeSlots)`);
console.log(`check: ${totalOutside + totalInternalPairs === totalEdgeSlots ? "OK" : "MISMATCH"}`);

// Export a JSON blob for the next script to consume (board data + raw
// geometry), keeping this script focused on construction/verification.
import { writeFileSync } from "node:fs";
const boardCenter = [0, 0]; // origin is already the lattice center
const exportData = {
  slots: allSlots.map((s) => ({
    id: s.id,
    kind: s.kind,
    verts: s.verts,
    neighbors: neighbors.get(s.id),
    outside: outside.get(s.id),
  })),
};
writeFileSync(new URL("./level4-raw.json", import.meta.url), JSON.stringify(exportData, null, 2));
console.log("Wrote scripts/level4-raw.json");
