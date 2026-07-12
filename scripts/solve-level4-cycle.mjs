// Finds a Hamiltonian cycle through all 34 level4 slots using the internal
// (non-outside) adjacency graph, then derives the pattern+rotation each
// piece needs to realize that cycle as the single active groove loop, and
// finally emits src/levels/level4.js.
import { readFileSync, writeFileSync } from "node:fs";

const slots = JSON.parse(readFileSync(new URL("./level4-slots.json", import.meta.url), "utf8"));
const byId = new Map(slots.map((s) => [s.id, s]));

// Build simple adjacency list (ids only) for Hamiltonian search.
const adj = new Map(slots.map((s) => [s.id, Object.keys(s.neighbors)]));

// Order nodes by degree ascending (helps backtracking prune faster) but
// always start the search at H0 to keep things deterministic.
const ids = slots.map((s) => s.id);
const n = ids.length;

function findHamiltonianCycle() {
  const start = "H0";
  const visited = new Set([start]);
  const path = [start];

  function neighborsSorted(id) {
    // Prefer neighbors with fewer remaining options (most-constrained-first),
    // improving backtracking performance.
    return [...adj.get(id)].sort((a, b) => adj.get(a).length - adj.get(b).length);
  }

  function backtrack() {
    if (path.length === n) {
      return adj.get(path[n - 1]).includes(start);
    }
    const current = path[path.length - 1];
    for (const next of neighborsSorted(current)) {
      if (visited.has(next)) continue;
      visited.add(next);
      path.push(next);
      if (backtrack()) return true;
      path.pop();
      visited.delete(next);
    }
    return false;
  }

  if (!backtrack()) return null;
  return path;
}

const cycle = findHamiltonianCycle();
if (!cycle) {
  console.error("No Hamiltonian cycle found!");
  process.exit(1);
}
console.log(`Found Hamiltonian cycle of length ${cycle.length}:`);
console.log(cycle.join(" -> "));

// For each slot in the cycle, determine which two LOCAL edge indices connect
// it to its cycle-predecessor and cycle-successor.
const activePairs = new Map();
for (let i = 0; i < cycle.length; i += 1) {
  const id = cycle[i];
  const prev = cycle[(i - 1 + cycle.length) % cycle.length];
  const next = cycle[(i + 1) % cycle.length];
  const slot = byId.get(id);
  const edgeToPrev = slot.neighbors[prev];
  const edgeToNext = slot.neighbors[next];
  if (edgeToPrev === edgeToNext) {
    console.error(`Slot ${id}: prev/next map to same edge index — degenerate, needs re-search`);
  }
  activePairs.set(id, [edgeToPrev, edgeToNext].sort((a, b) => a - b));
}

// Derive (pattern, rotation) per shape from a desired local-edge active pair.
function solvePatternRotation(shape, pair) {
  const [a, b] = pair;
  if (shape === "hex") {
    const gap = Math.min((b - a + 6) % 6, (a - b + 6) % 6);
    const pattern = gap === 1 ? "H1" : gap === 2 ? "H2" : "H3";
    // base pair for pattern is {0, gap}; rotation r shifts by r (mod 6).
    const rotation = a; // since {a, a+gap} should equal {a,b} when b=(a+gap)%6
    // Verify, else try rotation = b with base offset assumption reversed.
    const check = new Set([rotation % 6, (rotation + gap) % 6]);
    if (check.has(a) && check.has(b)) return { pattern, rotation: rotation % 6 };
    // fallback: rotation = b, gap taken the other direction
    const rotation2 = b;
    return { pattern, rotation: rotation2 % 6 };
  }
  if (shape === "triangle") {
    // pattern T1 base {0,1}; rotation r in {0,1,2} shifts by r (mod 3): {r, r+1 mod 3}
    for (let r = 0; r < 3; r += 1) {
      const set = new Set([r % 3, (r + 1) % 3]);
      if (set.has(a) && set.has(b)) return { pattern: "T1", rotation: r };
    }
    throw new Error(`No triangle rotation found for pair ${pair}`);
  }
  if (shape === "rhombus") {
    const options = [
      { pattern: "RA", rotation: 0, set: [0, 1] },
      { pattern: "RA", rotation: 1, set: [2, 3] },
      { pattern: "RO", rotation: 0, set: [0, 3] },
      { pattern: "RO", rotation: 1, set: [1, 2] },
      { pattern: "P0", rotation: 0, set: [0, 2] },
      { pattern: "P0", rotation: 1, set: [0, 2] },
      { pattern: "P1", rotation: 0, set: [1, 3] },
      { pattern: "P1", rotation: 1, set: [1, 3] },
    ];
    const match = options.find((o) => o.set[0] === a && o.set[1] === b);
    if (!match) throw new Error(`No rhombus option found for pair ${pair}`);
    return { pattern: match.pattern, rotation: match.rotation };
  }
  throw new Error(`Unknown shape ${shape}`);
}

const solved = new Map();
slots.forEach((slot) => {
  const pair = activePairs.get(slot.id);
  const outsideSet = new Set(slot.outside);
  if (pair.some((e) => outsideSet.has(e))) {
    console.error(`Slot ${slot.id}: active pair ${pair} overlaps an outside edge ${[...outsideSet]}`);
  }
  const solution = solvePatternRotation(slot.shape, pair);
  solved.set(slot.id, { ...solution, pair });
});

console.log("\nPer-slot solution (pattern/rotation for the intended solved state):");
slots.forEach((slot) => {
  const sol = solved.get(slot.id);
  console.log(`  ${slot.id} (${slot.shape}): pair=${JSON.stringify(sol.pair)} -> pattern=${sol.pattern} rotation=${sol.rotation}`);
});

// Tally pattern usage per shape to build the piece inventory.
const patternCounts = {};
slots.forEach((slot) => {
  const sol = solved.get(slot.id);
  const key = `${slot.shape}:${sol.pattern}`;
  patternCounts[key] = (patternCounts[key] || 0) + 1;
});
console.log("\nPattern usage counts:", patternCounts);

writeFileSync(
  new URL("./level4-solution.json", import.meta.url),
  JSON.stringify({ cycle, solved: Object.fromEntries(solved) }, null, 2),
);
console.log("\nWrote scripts/level4-solution.json");
