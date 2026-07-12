// Generates src/levels/level4.js from scripts/level4-slots.json and
// scripts/level4-solution.json (produced by build-level4.mjs, reindex-level4.mjs,
// and solve-level4-cycle.mjs in that order). Re-run this whenever the upstream
// lattice/solution scripts change.
import { readFileSync, writeFileSync } from "node:fs";

const slots = JSON.parse(readFileSync(new URL("./level4-slots.json", import.meta.url), "utf8"));
const solutionData = JSON.parse(readFileSync(new URL("./level4-solution.json", import.meta.url), "utf8"));
const solved = solutionData.solved;

function fmtNum(n) {
  return Number(n.toFixed(6));
}

function slotToSource(slot) {
  const lines = [];
  lines.push(`    {`);
  lines.push(`      id: "${slot.id}",`);
  lines.push(`      shape: "${slot.shape}",`);
  lines.push(`      center: [${fmtNum(slot.center[0])}, ${fmtNum(slot.center[1])}],`);
  if (slot.angle !== undefined) lines.push(`      angle: ${slot.angle},`);
  lines.push(`      edgeCount: ${slot.edgeCount},`);
  lines.push(`      outside: [${slot.outside.join(", ")}],`);
  const neighborEntries = Object.entries(slot.neighbors).map(([k, v]) => `${k}: ${v}`).join(", ");
  lines.push(`      neighbors: { ${neighborEntries} },`);
  lines.push(`    },`);
  return lines.join("\n");
}

const slotsSource = slots.map(slotToSource).join("\n");

// Build the piece inventory: one piece object per slot, using each slot's
// derived pattern (piece ids are stable, human-readable, grouped by shape).
const shapeCounters = { hex: 0, triangle: 0, rhombus: 0 };
const shapeAbbrev = { hex: "h4", triangle: "t4", rhombus: "r4" };
const rotationsFor = { hex: 6, triangle: 3, rhombus: 2 };

let hintPieceId = null;
const pieceLines = [];
slots.forEach((slot) => {
  const sol = solved[slot.id];
  shapeCounters[slot.shape] += 1;
  const pieceId = `${shapeAbbrev[slot.shape]}-${sol.pattern.toLowerCase()}-${shapeCounters[slot.shape]}`;
  if (slot.id === "H0") hintPieceId = { pieceId, rotation: sol.rotation };
  pieceLines.push(
    `  { id: "${pieceId}", shape: "${slot.shape}", pattern: "${sol.pattern}", rotations: ${rotationsFor[slot.shape]} },`,
  );
});

const source = `export const level4 = {
  id: "greater-cloister",
  number: 4,
  title: "The Greater Cloister",
  shortTitle: "Greater Cloister",
  description:
    "A wider court of stone. Thirty-four fragments, one line, and no room for the eye to guess correctly.",
  board: {
    macroCenter: [0, 0],
    center: [480, 320],
    scale: 62,
    side: 3,
  },
  endpointMode: "center",
  hint: { pieceId: "${hintPieceId.pieceId}", slotId: "H0", rotation: ${hintPieceId.rotation} },
  slots: [
${slotsSource}
  ],
  pieces: [
${pieceLines.join("\n")}
  ],
};
`;

writeFileSync(new URL("../src/levels/level4.js", import.meta.url), source);
console.log("Wrote src/levels/level4.js");
console.log("Shape counts:", shapeCounters);
console.log("Hint:", hintPieceId);
