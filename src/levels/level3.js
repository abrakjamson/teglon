// Level 3 - "The Threefold Cloister"
//
// Introduces the third piece shape (equilateral triangle) alongside the
// hexagon and rhombus. Five slots meet at a single shared vertex, each
// occupying an angular wedge around it: the hexagon a 120-degree wedge, and
// the two rhombi and two triangles each a 60-degree wedge (rhombi resting on
// their acute/60-degree corner). Geometry and edge/neighbor indices were
// derived and cross-checked with scripts/verify-triangle-edgemap.mjs against
// the real engine formulas (see that script for the angleStep=120,
// identity-edgeMap finding for triangles).
//
// Verified solution (see docs below): H0=H1@rot5, TR=T1@rot2, TL=T1@rot2,
// RR=RA@rot0, RL=RA@rot0 forms the single 5-cycle H0-TR-RR-RL-TL-H0 with no
// outside edge active. 216 total rotation/placement combinations, exactly 1
// solution up to interchangeable identical pieces (both triangles and both
// rhombi carry the same pattern, so swapping either pair is the same result).
export const level3 = {
  id: "threefold-cloister",
  number: 3,
  title: "The Threefold Cloister",
  shortTitle: "Threefold Cloister",
  description:
    "Five stones of three forms meet at one silent point. Let the triangles learn their place beside the rest.",
  board: {
    macroCenter: [0, 0],
    center: [500, 330],
    scale: 160,
    side: 1.9,
  },
  endpointMode: "center",
  hint: { pieceId: "h-quiet", slotId: "H0", rotation: 5 },
  slots: [
    {
      id: "H0",
      shape: "hex",
      center: [1, 0],
      edgeCount: 6,
      outside: [1, 2, 3, 4],
      neighbors: { TR: 0, TL: 5 },
    },
    {
      id: "TR",
      shape: "triangle",
      center: [0, 0.5773503],
      angle: 180,
      edgeCount: 3,
      outside: [1],
      neighbors: { H0: 0, RR: 2 },
    },
    {
      id: "RR",
      shape: "rhombus",
      center: [-0.75, 0.4330127],
      angle: 0,
      edgeMap: [0, 1, 2, 3],
      edgeCount: 4,
      outside: [2, 3],
      neighbors: { TR: 0, RL: 1 },
    },
    {
      id: "RL",
      shape: "rhombus",
      center: [-0.75, -0.4330127],
      angle: 60,
      edgeMap: [0, 1, 2, 3],
      edgeCount: 4,
      outside: [2, 3],
      neighbors: { RR: 0, TL: 1 },
    },
    {
      id: "TL",
      shape: "triangle",
      center: [0, -0.5773503],
      angle: 0,
      edgeCount: 3,
      outside: [1],
      neighbors: { RL: 0, H0: 2 },
    },
  ],
  pieces: [
    { id: "h-quiet", shape: "hex", pattern: "H1", rotations: 6 },
    { id: "r-quiet", shape: "rhombus", pattern: "RA", rotations: 2 },
    { id: "r-waking", shape: "rhombus", pattern: "RA", rotations: 2 },
    { id: "t-quiet", shape: "triangle", pattern: "T1", rotations: 3 },
    { id: "t-waking", shape: "triangle", pattern: "T1", rotations: 3 },
  ],
};
