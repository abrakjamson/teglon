import { levels } from "./levels/index.js";
import "./styles.css";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEX_BASE_POINTS = [
  [1, 0],
  [.5, .8660254],
  [-.5, .8660254],
  [-1, 0],
  [-.5, -.8660254],
  [.5, -.8660254],
];
const RHOMBUS_BASE_POINTS = [
  [-.75, .4330127],
  [.25, .4330127],
  [.75, -.4330127],
  [-.25, -.4330127],
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
const TRIANGLE_BASE_POINTS = [
  [0, .5773503],
  [-.5, -.2886751],
  [.5, -.2886751],
];
const TRIANGLE_EDGE_SEGMENTS = [
  [[0, .5773503], [-.5, -.2886751]],
  [[-.5, -.2886751], [.5, -.2886751]],
  [[.5, -.2886751], [0, .5773503]],
];
const PATTERN_PAIRS = {
  H1: [0, 1],
  H2: [0, 2],
  H3: [0, 3],
  RA: [0, 1],
  RO: [0, 3],
  P0: [0, 2],
  P1: [1, 3],
  T1: [0, 1],
};

// Per-shape geometry config: edgeCount/rotationCount define how many discrete
// rotation states a piece has and how far (in edge-index steps) each state
// shifts the active edges; angleStep is the visual SVG rotation degrees applied
// per rotation step; usesSlotAngle marks shapes placed at non-zero screen
// angles depending on their slot's position (rhombus + triangle), matching the
// hex-vs-non-hex distinction already required for edgeMap remapping.
const SHAPE_CONFIG = {
  hex: {
    edgeCount: 6,
    rotationCount: 6,
    basePoints: HEX_BASE_POINTS,
    edgeSegments: HEX_EDGE_SEGMENTS,
    angleStep: -60,
    usesSlotAngle: false,
  },
  rhombus: {
    edgeCount: 4,
    rotationCount: 2,
    basePoints: RHOMBUS_BASE_POINTS,
    edgeSegments: RHOMBUS_EDGE_SEGMENTS,
    angleStep: 180,
    usesSlotAngle: true,
  },
  triangle: {
    edgeCount: 3,
    rotationCount: 3,
    basePoints: TRIANGLE_BASE_POINTS,
    edgeSegments: TRIANGLE_EDGE_SEGMENTS,
    angleStep: 120,
    usesSlotAngle: true,
  },
};

function shapeConfig(shape) {
  return SHAPE_CONFIG[shape];
}

// Tray (piece supply) layout: rendered independently of level.board.scale so
// piece size in the tray never depends on the board's own zoom level (some
// levels use a large board.scale for a small tight board, others a small
// scale for a wide board - the tray must stay legible and non-overlapping in
// both cases). TRAY_AREA is expressed in the SVG's fixed 0..1000 / 0..700
// viewBox coordinates. computeTrayLayout() picks the column count (and thus
// row count) that yields the largest piece scale (up to TRAY_SCALE_MAX) that
// still fits every piece inside TRAY_AREA without overlap - this keeps small
// piece counts (level3's 5) comfortably large while shrinking large piece
// counts (level4's 34) enough to fit cleanly.
const TRAY_AREA = { left: 45, right: 955, top: 552, bottom: 674 };
const TRAY_SCALE_MAX = 66;
const TRAY_CELL_PAD = 10;
// Widest/tallest shape bounding-box factors (relative to `scale`), used to
// convert a candidate cell size into a safe piece scale. Hex is both the
// widest (points span x in [-1,1]) and tallest (y in [-.866,.866]) shape.
const TRAY_SHAPE_WIDTH_FACTOR = 2;
const TRAY_SHAPE_HEIGHT_FACTOR = 1.7320508;

function computeTrayLayout(count) {
  const areaWidth = TRAY_AREA.right - TRAY_AREA.left;
  const areaHeight = TRAY_AREA.bottom - TRAY_AREA.top;
  let best = null;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellWidth = areaWidth / columns;
    const cellHeight = areaHeight / rows;
    const scale = Math.min(
      (cellWidth - TRAY_CELL_PAD) / TRAY_SHAPE_WIDTH_FACTOR,
      (cellHeight - TRAY_CELL_PAD) / TRAY_SHAPE_HEIGHT_FACTOR,
      TRAY_SCALE_MAX,
    );
    if (scale <= 0) continue;
    if (!best || scale > best.scale) best = { columns, rows, cellWidth, cellHeight, scale };
  }
  return best || { columns: 1, rows: count, cellWidth: areaWidth, cellHeight: areaHeight, scale: TRAY_SCALE_MAX };
}

const boardSvg = document.querySelector("#game-board");
const boardArt = document.querySelector("#board-art");
const slotLayer = document.querySelector("#slot-layer");
const pieceLayer = document.querySelector("#piece-layer");
const celebrationLayer = document.querySelector("#celebration-layer");
const boardMessage = document.querySelector("#board-message");
const levelTitle = document.querySelector("#level-title");
const levelDescription = document.querySelector("#level-description");
const cycleCount = document.querySelector("#cycle-count");
const progressNote = document.querySelector("#progress-note");
const levelButtons = document.querySelector("#level-buttons");
const resetButton = document.querySelector("#reset-button");
const hintButton = document.querySelector("#hint-button");
const soundButton = document.querySelector("#sound-button");
const winToast = document.querySelector("#win-toast");
const winTitle = document.querySelector("#win-title");
const nextButton = document.querySelector("#next-button");

let levelIndex = 0;
let level = levels[levelIndex];
let pieces = new Map();
let slotElements = new Map();
let pieceElements = new Map();
let selectedId = null;
let dragState = null;
let completedLevels = new Set();
let winnerGlowVisible = false;
let audioEnabled = true;
let audioContext;

const patternLabel = {
  H1: "adjacent",
  H2: "skipping",
  H3: "opposite",
  RA: "acute bend",
  RO: "obtuse bend",
  P0: "parallel",
  P1: "parallel",
  T1: "corner-to-corner",
};

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function setAttributes(element, attributes) {
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

function rotatePoint(point, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    point[0] * cos - point[1] * sin,
    point[0] * sin + point[1] * cos,
  ];
}

function addPoint(left, right) {
  return [left[0] + right[0], left[1] + right[1]];
}

function multiplyPoint(point, factor) {
  return [point[0] * factor, point[1] * factor];
}

function normalizePoint(point) {
  const length = Math.hypot(point[0], point[1]);
  return length === 0 ? [0, 0] : multiplyPoint(point, 1 / length);
}

function dotPoint(left, right) {
  return left[0] * right[0] + left[1] * right[1];
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function formatPoints(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function boardPoint(point) {
  const [macroX] = level.board.macroCenter;
  return [
    level.board.center[0] + (point[0] - macroX) * level.board.scale,
    level.board.center[1] + point[1] * level.board.scale,
  ];
}

function boardScalePoint(point) {
  return [point[0] * level.board.scale, point[1] * level.board.scale];
}

function slotById(id) {
  return level.slots.find((slot) => slot.id === id);
}

function pieceShapePoints(shape) {
  return shapeConfig(shape).basePoints;
}

function pieceEdgeSegments(shape) {
  return shapeConfig(shape).edgeSegments;
}

function rotationOffset(piece, rotation) {
  const config = shapeConfig(piece.shape);
  return rotation * (config.edgeCount / config.rotationCount);
}

function physicalEdge(piece, localEdge, rotation) {
  const edgeCount = shapeConfig(piece.shape).edgeCount;
  return (localEdge + rotationOffset(piece, rotation)) % edgeCount;
}

function physicalRotation(piece, rotation, slot) {
  const config = shapeConfig(piece.shape);
  const slotAngle = config.usesSlotAngle ? (slot?.angle || 0) : 0;
  return slotAngle + rotation * config.angleStep;
}

function patternPair(piece) {
  return PATTERN_PAIRS[piece.pattern];
}

function activeEdges(piece, rotation) {
  const size = shapeConfig(piece.shape).edgeCount;
  return new Set(patternPair(piece).map((edge) => (edge + rotationOffset(piece, rotation)) % size));
}

function localBit(piece, localEdge) {
  const pair = patternPair(piece);
  if (!piece.bits) return 0;
  return piece.bits[pair.indexOf(localEdge)] ?? 0;
}

function edgeSegment(piece, localEdge, rotation, slot) {
  const segment = pieceEdgeSegments(piece.shape)[localEdge];
  const angle = physicalRotation(piece, rotation, slot);
  const loose = slot.loose === true;
  const scale = loose ? computeTrayLayout(level.pieces.length).scale : level.board.scale;
  if (loose) {
    return segment.map((point) => {
      const rotated = rotatePoint(point, angle);
      return [piece.position[0] + rotated[0] * scale, piece.position[1] + rotated[1] * scale];
    });
  }
  const physical = physicalEdge(piece, localEdge, rotation);
  const usesSlotAngle = shapeConfig(piece.shape).usesSlotAngle;
  const visualIndex = usesSlotAngle
    ? (slot.edgeMap?.[physical] ?? physical)
    : physical;
  const target = pieceEdgeSegments(piece.shape)[visualIndex].map((point) => {
    const rotated = rotatePoint(point, usesSlotAngle ? (slot.angle || 0) : 0);
    const center = boardPoint(slot.center);
    return [center[0] + rotated[0] * scale, center[1] + rotated[1] * scale];
  });
  const transformed = segment.map((point) => {
    const rotated = rotatePoint(point, angle);
    const center = boardPoint(slot.center);
    return [center[0] + rotated[0] * scale, center[1] + rotated[1] * scale];
  });
  const sameDirection = distance(transformed[0], target[0]) < distance(transformed[1], target[0]);
  return sameDirection ? target : [target[1], target[0]];
}

function endpointFor(piece, slot, localEdge, rotation, endpointBit = null) {
  const [start, end] = edgeSegment(piece, localEdge, rotation, slot);
  const t = endpointBit === null || level.endpointMode === "center"
    ? .5
    : endpointBit === 0 ? .34 : .66;
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ];
}

function physicalEndpoint(piece, slot, physicalEdge, rotation) {
  const offset = rotationOffset(piece, rotation);
  const edgeCount = shapeConfig(piece.shape).edgeCount;
  const localEdge = (physicalEdge - offset + edgeCount) % edgeCount;
  return endpointFor(piece, slot, localEdge, rotation, localBit(piece, localEdge));
}

function piecePolygon(piece, slot, rotation, loose = false) {
  const usesSlotAngle = shapeConfig(piece.shape).usesSlotAngle;
  const angle = loose ? 0 : (usesSlotAngle ? (slot?.angle || 0) : 0);
  const center = loose ? piece.position : boardPoint(slot.center);
  const scale = loose ? computeTrayLayout(level.pieces.length).scale : level.board.scale;
  const points = pieceShapePoints(piece.shape).map((point) => {
    const rotated = rotatePoint(point, angle);
    return [center[0] + rotated[0] * scale, center[1] + rotated[1] * scale];
  });
  return points;
}

function inwardNormal(segment, center) {
  const edge = [segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]];
  const normal = normalizePoint([-edge[1], edge[0]]);
  const midpoint = [
    (segment[0][0] + segment[1][0]) / 2,
    (segment[0][1] + segment[1][1]) / 2,
  ];
  const towardCenter = [center[0] - midpoint[0], center[1] - midpoint[1]];
  return dotPoint(normal, towardCenter) >= 0 ? normal : multiplyPoint(normal, -1);
}

function grooveCurvePath(start, end, startNormal, endNormal, piece, scale, center) {
  // Straight normal leads make the edge crossings exactly perpendicular. A
  // polar rose supplies a single-stroke ornamental knot in the tile center.
  const style = {
    H1: { radius: .5, lead: .13, phase: 0, petals: 2 },
    H2: { radius: .48, lead: .13, phase: Math.PI / 6, petals: 2 },
    H3: { radius: .5, lead: .13, phase: Math.PI / 4, petals: 2 },
    RA: { radius: .26, lead: .1, phase: 0, petals: 2 },
    RO: { radius: .26, lead: .1, phase: Math.PI / 4, petals: 2 },
    P0: { radius: .27, lead: .1, phase: Math.PI / 8, petals: 2 },
    P1: { radius: .27, lead: .1, phase: -Math.PI / 8, petals: 2 },
    T1: { radius: .16, lead: .08, phase: -Math.PI / 2, petals: 3 },
  }[piece.pattern] || {
    radius: .25,
    lead: .1,
    phase: 0,
    petals: 2,
  };
  const innerStart = addPoint(start, multiplyPoint(startNormal, scale * style.lead));
  const innerEnd = addPoint(end, multiplyPoint(endNormal, scale * style.lead));
  const axis = normalizePoint([innerEnd[0] - innerStart[0], innerEnd[1] - innerStart[1]]);
  const crossAxis = [-axis[1], axis[0]];
  const radius = scale * style.radius;
  const approach = scale * .18;

  function rosePointAt(t) {
    const theta = 2 * Math.PI * t;
    const angle = theta + style.phase;
    const radial = radius * Math.sin(style.petals * theta);
    return addPoint(
      center,
      addPoint(
        multiplyPoint(axis, radial * Math.cos(angle)),
        multiplyPoint(crossAxis, radial * Math.sin(angle)),
      ),
    );
  }

  function roseDerivativeAt(t) {
    const theta = 2 * Math.PI * t;
    const angle = theta + style.phase;
    const radial = radius * Math.sin(style.petals * theta);
    const radialDerivative = radius * style.petals * 2 * Math.PI
      * Math.cos(style.petals * theta);
    const angleDerivative = 2 * Math.PI;
    const alongAxis = radialDerivative * Math.cos(angle)
      - radial * Math.sin(angle) * angleDerivative;
    const alongCrossAxis = radialDerivative * Math.sin(angle)
      + radial * Math.cos(angle) * angleDerivative;
    return addPoint(
      multiplyPoint(axis, alongAxis),
      multiplyPoint(crossAxis, alongCrossAxis),
    );
  }

  const roseDirection = normalizePoint(roseDerivativeAt(0));
  const startControl = addPoint(innerStart, multiplyPoint(startNormal, approach));
  const centerArrival = addPoint(center, multiplyPoint(roseDirection, -approach));
  let path = `M ${start[0]} ${start[1]} L ${innerStart[0]} ${innerStart[1]}`;
  path += ` C ${startControl[0]} ${startControl[1]} ${centerArrival[0]} ${centerArrival[1]} ${center[0]} ${center[1]}`;

  const segmentCount = style.petals * 16;
  for (let index = 0; index < segmentCount; index += 1) {
    const from = index / segmentCount;
    const to = (index + 1) / segmentCount;
    const fromPoint = rosePointAt(from);
    const toPoint = rosePointAt(to);
    const fromControl = addPoint(fromPoint, multiplyPoint(roseDerivativeAt(from), (to - from) / 3));
    const toControl = addPoint(toPoint, multiplyPoint(roseDerivativeAt(to), -(to - from) / 3));
    path += ` C ${fromControl[0]} ${fromControl[1]} ${toControl[0]} ${toControl[1]} ${toPoint[0]} ${toPoint[1]}`;
  }
  const centerDeparture = addPoint(center, multiplyPoint(roseDirection, approach));
  const endControl = addPoint(innerEnd, multiplyPoint(endNormal, approach));
  path += ` C ${centerDeparture[0]} ${centerDeparture[1]} ${endControl[0]} ${endControl[1]} ${innerEnd[0]} ${innerEnd[1]}`;
  return `${path} L ${end[0]} ${end[1]}`;
}

function groovePath(piece, slot, loose = false) {
  const pair = patternPair(piece);
  const rotation = piece.rotation;
  const localStart = pair[0];
  const localEnd = pair[1];
  const start = endpointFor(piece, slot, localStart, rotation, localBit(piece, localStart));
  const end = endpointFor(piece, slot, localEnd, rotation, localBit(piece, localEnd));
  const center = loose ? piece.position : boardPoint(slot.center);
  const scale = loose ? computeTrayLayout(level.pieces.length).scale : level.board.scale;
  const startSegment = edgeSegment(piece, localStart, rotation, slot);
  const endSegment = edgeSegment(piece, localEnd, rotation, slot);
  const startNormal = inwardNormal(startSegment, center);
  const endNormal = inwardNormal(endSegment, center);
  return grooveCurvePath(start, end, startNormal, endNormal, piece, scale, center);
}

function trayPosition(index, count, shape) {
  const layout = computeTrayLayout(count);
  const rowCount = Math.ceil(count / layout.columns);
  const row = Math.floor(index / layout.columns);
  const itemsInRow = row === rowCount - 1 ? count - layout.columns * row : layout.columns;
  const rowOffset = (layout.columns - itemsInRow) / 2;
  const column = (index % layout.columns) + rowOffset;
  const x = TRAY_AREA.left + layout.cellWidth * (column + .5);
  const y = TRAY_AREA.top + layout.cellHeight * (row + .5);
  return [x, y + (shape === "hex" ? 2 : 0)];
}

function makeBoardOutline() {
  // The slot layer's own shapes (see makeSlots) already trace the puzzle's
  // true outline, so no separate decorative frame is drawn here - a fixed or
  // auto-fit outer hexagon either mismatched irregular layouts (level3) or
  // was simply redundant with the real slot outlines.
  boardArt.replaceChildren();
}

function makeSlots() {
  slotLayer.replaceChildren();
  slotElements.clear();
  level.slots.forEach((slot) => {
    const group = svgElement("g", { class: "slot", "data-slot": slot.id });
    const shapePoints = pieceShapePoints(slot.shape);
    const transformed = shapePoints.map((point) => {
      const angle = shapeConfig(slot.shape).usesSlotAngle ? slot.angle : 0;
      const rotated = rotatePoint(point, angle);
      const center = boardPoint(slot.center);
      return [
        center[0] + rotated[0] * level.board.scale,
        center[1] + rotated[1] * level.board.scale,
      ];
    });
    const polygon = svgElement("polygon", {
      points: formatPoints(transformed),
      class: "slot-shape",
      "data-slot": slot.id,
    });
    const label = svgElement("text", {
      x: boardPoint(slot.center)[0],
      y: boardPoint(slot.center)[1] + 4,
      class: "piece-label",
      opacity: ".24",
    });
    label.textContent = slot.id;
    group.append(polygon, label);
    group.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && selectedId && !dragState) {
        event.preventDefault();
        placePieceInSlot(selectedId, slot.id);
      }
    });
    slotLayer.append(group);
    slotElements.set(slot.id, { group, polygon });
  });
}

function updateSlotHighlights() {
  slotElements.forEach(({ polygon }, slotId) => {
    const slot = slotById(slotId);
    const occupied = [...pieces.values()].some((piece) => piece.slotId === slotId);
    const canReceive = selectedId && pieces.get(selectedId)?.shape === slot.shape && !occupied;
    polygon.classList.toggle("is-hot", Boolean(canReceive));
    polygon.classList.toggle("is-filled", occupied);
  });
}

function clearHintHighlight() {
  pieceElements.forEach(({ group }) => group.classList.remove("is-hint"));
  slotElements.forEach(({ polygon }) => polygon.classList.remove("is-hint"));
}

function finishHint(pieceId) {
  clearHintHighlight();
  // The hint temporarily marks its piece as "selected" so its groove reads
  // clearly; once the highlight animation ends, that selection must be
  // released too, otherwise the piece keeps glowing indefinitely (the
  // is-selected filter has no other timeout of its own).
  if (selectedId === pieceId) {
    selectedId = null;
    renderPieces();
    updateSlotHighlights();
  }
}

function offerHint() {
  if (completedLevels.has(level.id)) return;
  const hint = level.hint;
  const piece = pieces.get(hint.pieceId);
  const target = slotById(hint.slotId);
  if (!piece || !target) return;

  const occupant = [...pieces.values()].find((candidate) => candidate.slotId === target.id);
  if (occupant && occupant.id !== piece.id) {
    occupant.slotId = null;
    occupant.position = trayPosition([...pieces.keys()].indexOf(occupant.id), level.pieces.length, occupant.shape);
  }
  piece.slotId = target.id;
  piece.rotation = hint.rotation;
  piece.position = boardPoint(target.center);
  selectedId = piece.id;
  clearHintHighlight();
  pieceElements.get(piece.id)?.group.classList.add("is-hint");
  slotElements.get(target.id)?.polygon.classList.add("is-hint");
  renderPieces();
  updateSlotHighlights();
  playSound("hint");
  window.setTimeout(() => finishHint(piece.id), 2800);
}

function createPieceState(definition, index) {
  const rotation = Math.floor(Math.random() * definition.rotations);
  return {
    ...definition,
    rotation,
    slotId: null,
    position: trayPosition(index, level.pieces.length, definition.shape),
  };
}

function createPieceElement(piece) {
  const group = svgElement("g", {
    class: `piece ${piece.shape}`,
    tabindex: "0",
    role: "button",
    "aria-label": `${{ hex: "Hexagon", rhombus: "Rhombus", triangle: "Triangle" }[piece.shape]} groove, ${patternLabel[piece.pattern]}`,
    "data-piece": piece.id,
  });
  const body = svgElement("polygon", { class: "piece-body" });
  const groove = svgElement("path", { class: "groove" });
  group.append(body, groove);
  group.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    rotatePiece(piece.id);
  });
  group.addEventListener("pointerdown", (event) => beginPointer(event, piece.id));
  group.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r" || event.key === " ") {
      event.preventDefault();
      rotatePiece(piece.id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectedId = piece.id;
      updatePieceClasses();
      updateSlotHighlights();
    }
  });
  pieceLayer.append(group);
  pieceElements.set(piece.id, { group, body, groove });
  return group;
}

function renderPiece(piece) {
  const elements = pieceElements.get(piece.id);
  if (!elements) return;
  const slot = piece.slotId ? slotById(piece.slotId) : null;
  const loose = !slot;
  const points = piecePolygon(piece, slot || { center: [0, 0] }, piece.rotation, loose);
  elements.body.setAttribute("points", formatPoints(points));
  elements.groove.setAttribute("d", groovePath(piece, slot || {
    center: [
      (piece.position[0] - level.board.center[0]) / level.board.scale + level.board.macroCenter[0],
      (piece.position[1] - level.board.center[1]) / level.board.scale,
    ],
    angle: 0,
    loose: !slot,
  }, !slot));
  if (loose) {
    elements.group.setAttribute("transform", "");
    elements.groove.setAttribute("transform", "");
  }
  elements.group.classList.toggle("is-dragging", dragState?.id === piece.id);
  elements.group.classList.toggle("is-selected", selectedId === piece.id);
  elements.group.classList.toggle("is-winner", winnerGlowVisible);
  elements.group.setAttribute("aria-pressed", selectedId === piece.id ? "true" : "false");
}

function renderPieces() {
  pieces.forEach(renderPiece);
  updatePieceClasses();
  updateSlotHighlights();
}

function updatePieceClasses() {
  pieces.forEach((piece) => {
    const element = pieceElements.get(piece.id)?.group;
    if (!element) return;
    element.classList.toggle("is-selected", selectedId === piece.id);
    element.classList.toggle("is-dragging", dragState?.id === piece.id);
  });
}

function setPiecePosition(piece, point) {
  piece.position = point;
  const slot = piece.slotId ? slotById(piece.slotId) : null;
  if (!slot) {
    const elements = pieceElements.get(piece.id);
    const points = piecePolygon(piece, { center: [0, 0] }, piece.rotation, true);
    elements.body.setAttribute("points", formatPoints(points));
    elements.groove.setAttribute("d", groovePath(piece, {
      center: [
        (point[0] - level.board.center[0]) / level.board.scale + level.board.macroCenter[0],
        (point[1] - level.board.center[1]) / level.board.scale,
      ],
      angle: 0,
      loose: true,
    }, true));
  }
}

function svgPointFromEvent(event) {
  const rect = boardSvg.getBoundingClientRect();
  return [
    (event.clientX - rect.left) * 1000 / rect.width,
    (event.clientY - rect.top) * 700 / rect.height,
  ];
}

function nearestOpenSlot(point, shape) {
  let nearest = null;
  let nearestDistance = Infinity;
  level.slots.forEach((slot) => {
    if (slot.shape !== shape) return;
    if ([...pieces.values()].some((piece) => piece.slotId === slot.id)) return;
    const slotPoint = boardPoint(slot.center);
    const candidateDistance = distance(point, slotPoint);
    if (candidateDistance < nearestDistance) {
      nearest = slot;
      nearestDistance = candidateDistance;
    }
  });
  return nearest && nearestDistance < level.board.scale * .76 ? nearest : null;
}

function releaseFromSlot(piece) {
  if (!piece.slotId) return;
  piece.slotId = null;
  const index = [...pieces.keys()].indexOf(piece.id);
  piece.position = trayPosition(index, level.pieces.length, piece.shape);
}

function placePieceInSlot(pieceId, slotId) {
  const piece = pieces.get(pieceId);
  const slot = slotById(slotId);
  if (!piece || !slot || piece.shape !== slot.shape) return;
  const occupant = [...pieces.values()].find((candidate) => candidate.slotId === slotId);
  if (occupant && occupant.id !== pieceId) return;
  piece.slotId = slotId;
  piece.position = boardPoint(slot.center);
  selectedId = pieceId;
  playSound("snap");
  renderPieces();
  evaluate();
}

function returnToTray(piece) {
  piece.slotId = null;
  const index = [...pieces.keys()].indexOf(piece.id);
  piece.position = trayPosition(index, level.pieces.length, piece.shape);
  playSound("return");
  renderPieces();
}

function beginPointer(event, pieceId) {
  event.stopPropagation();
  if (event.button === 2) return;
  const piece = pieces.get(pieceId);
  if (!piece) return;
  if (event.pointerType === "touch") {
    if (selectedId === pieceId) {
      rotatePiece(pieceId);
      selectedId = null;
    } else {
      selectedId = pieceId;
      playSound("select");
    }
    updatePieceClasses();
    updateSlotHighlights();
    return;
  }
  selectedId = pieceId;
  const originalPosition = piece.slotId
    ? boardPoint(slotById(piece.slotId).center)
    : piece.position;
  releaseFromSlot(piece);
  piece.position = originalPosition;
  const point = svgPointFromEvent(event);
  dragState = {
    id: pieceId,
    pointerId: event.pointerId,
    offset: [piece.position[0] - point[0], piece.position[1] - point[1]],
  };
  piece.position = [point[0] + dragState.offset[0], point[1] + dragState.offset[1]];
  event.currentTarget.setPointerCapture?.(event.pointerId);
  renderPieces();
  updateSlotHighlights();
}

function movePointer(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const piece = pieces.get(dragState.id);
  if (!piece) return;
  const point = svgPointFromEvent(event);
  piece.position = [point[0] + dragState.offset[0], point[1] + dragState.offset[1]];
  renderPiece(piece);
  const target = nearestOpenSlot(point, piece.shape);
  slotElements.forEach(({ polygon }, slotId) => polygon.classList.toggle("is-hot", target?.id === slotId));
}

function endPointer(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const piece = pieces.get(dragState.id);
  const point = svgPointFromEvent(event);
  dragState = null;
  if (piece) {
    const target = nearestOpenSlot(point, piece.shape);
    if (target) {
      placePieceInSlot(piece.id, target.id);
    } else {
      returnToTray(piece);
    }
  }
}

function rotatePiece(pieceId) {
  const piece = pieces.get(pieceId);
  if (!piece) return;
  piece.rotation = (piece.rotation + 1) % piece.rotations;
  selectedId = pieceId;
  playSound("rotate");
  renderPiece(piece);
  updatePieceClasses();
  updateSlotHighlights();
  evaluate();
}

function edgeIsActive(piece, slot, edge) {
  return activeEdges(piece, piece.rotation).has(edge);
}

function pairIsContinuous(leftPiece, leftSlot, rightPiece, rightSlot, leftEdge, rightEdge) {
  if (!edgeIsActive(leftPiece, leftSlot, leftEdge)) return true;
  if (level.endpointMode === "center") return true;
  if (level.matchingMode === "complement") {
    const leftOffset = rotationOffset(leftPiece, leftPiece.rotation);
    const rightOffset = rotationOffset(rightPiece, rightPiece.rotation);
    const leftLocal = (leftEdge - leftOffset + leftSlot.edgeCount) % leftSlot.edgeCount;
    const rightLocal = (rightEdge - rightOffset + rightSlot.edgeCount) % rightSlot.edgeCount;
    return localBit(leftPiece, leftLocal) !== localBit(rightPiece, rightLocal);
  }
  const leftOffset = rotationOffset(leftPiece, leftPiece.rotation);
  const rightOffset = rotationOffset(rightPiece, rightPiece.rotation);
  const leftLocal = (leftEdge - leftOffset + leftSlot.edgeCount) % leftSlot.edgeCount;
  const rightLocal = (rightEdge - rightOffset + rightSlot.edgeCount) % rightSlot.edgeCount;
  const first = endpointFor(leftPiece, leftSlot, leftLocal, leftPiece.rotation, localBit(leftPiece, leftLocal));
  const second = endpointFor(rightPiece, rightSlot, rightLocal, rightPiece.rotation, localBit(rightPiece, rightLocal));
  return distance(first, second) < level.board.scale * .035;
}

function selectedGraph() {
  const graph = new Map(level.slots.map((slot) => [slot.id, new Set()]));
  level.slots.forEach((slot) => {
    const piece = [...pieces.values()].find((candidate) => candidate.slotId === slot.id);
    if (!piece) return;
    Object.entries(slot.neighbors).forEach(([neighborId, edge]) => {
      if (edgeIsActive(piece, slot, edge)) graph.get(slot.id).add(neighborId);
    });
  });
  return graph;
}

function isConnectedGraph(graph) {
  const start = graph.keys().next().value;
  if (!start) return false;
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

function evaluate() {
  const placedCount = [...pieces.values()].filter((piece) => piece.slotId).length;
  progressNote.textContent = `${placedCount} of ${pieces.size} stones placed`;
  boardMessage.textContent = placedCount === pieces.size ? "Listening for the whole line" : "The stones are waiting";
  if (placedCount !== pieces.size) return false;

  const slotPieces = new Map(level.slots.map((slot) => [
    slot.id,
    [...pieces.values()].find((piece) => piece.slotId === slot.id),
  ]));
  if ([...slotPieces.values()].some((piece) => !piece)) return false;

  for (const slot of level.slots) {
    const piece = slotPieces.get(slot.id);
    for (const outsideEdge of slot.outside) {
      if (edgeIsActive(piece, slot, outsideEdge)) return false;
    }
    for (const [neighborId, edge] of Object.entries(slot.neighbors)) {
      if (slot.id > neighborId) continue;
      const neighbor = level.slots.find((candidate) => candidate.id === neighborId);
      const neighborPiece = slotPieces.get(neighborId);
      const neighborEdge = neighbor.neighbors[slot.id];
      if (edgeIsActive(piece, slot, edge) !== edgeIsActive(neighborPiece, neighbor, neighborEdge)) return false;
      if (!pairIsContinuous(piece, slot, neighborPiece, neighbor, edge, neighborEdge)) return false;
    }
  }

  const graph = selectedGraph();
  if ([...graph.values()].some((neighbors) => neighbors.size !== 2)) return false;
  if (!isConnectedGraph(graph)) return false;
  win();
  return true;
}

function win() {
  if (completedLevels.has(level.id)) return;
  completedLevels.add(level.id);
  winnerGlowVisible = true;
  pieces.forEach(renderPiece);
  boardMessage.textContent = "A complete circuit";
  winTitle.textContent = levelIndex === levels.length - 1 ? "The circle closes" : "A complete circuit";
  nextButton.textContent = levelIndex === levels.length - 1 ? "Play again" : "Next exercise";
  winToast.classList.add("is-visible");
  createCelebration();
  playSound("win");
  renderLevelButtons();
}

function createCelebration() {
  celebrationLayer.replaceChildren();
  const center = boardPoint([level.board.macroCenter[0], 0]);
  for (let index = 0; index < 26; index += 1) {
    const angle = index * 137.5;
    const radius = 90 + (index % 5) * 23;
    const dot = svgElement("circle", {
      class: "confetti",
      cx: center[0],
      cy: center[1],
      r: index % 3 === 0 ? 2.8 : 1.8,
    });
    dot.style.setProperty("--dx", `${Math.cos(angle) * radius}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * radius}px`);
    dot.style.setProperty("--spin", `${index * 30}deg`);
    dot.style.animationDelay = `${(index % 8) * .035}s`;
    celebrationLayer.append(dot);
  }
}

function closeWin() {
  winToast.classList.remove("is-visible");
  celebrationLayer.replaceChildren();
}

function randomizeLevel() {
  closeWin();
  winnerGlowVisible = false;
  pieces = new Map(level.pieces.map((piece, index) => [piece.id, createPieceState(piece, index)]));
  selectedId = null;
  dragState = null;
  pieceElements.clear();
  pieceLayer.replaceChildren();
  pieces.forEach(createPieceElement);
  renderPieces();
  evaluate();
}

function renderLevelButtons() {
  levelButtons.replaceChildren();
  levels.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-button";
    button.textContent = String(index + 1).padStart(2, "0");
    button.title = candidate.title;
    button.classList.toggle("is-active", index === levelIndex);
    button.classList.toggle("is-complete", completedLevels.has(candidate.id));
    button.addEventListener("click", () => loadLevel(index));
    levelButtons.append(button);
  });
}

function loadLevel(index) {
  levelIndex = index;
  level = levels[levelIndex];
  levelTitle.textContent = level.title;
  levelDescription.textContent = level.description;
  cycleCount.textContent = `${String(levelIndex + 1).padStart(2, "0")} / ${String(levels.length).padStart(2, "0")}`;
  makeBoardOutline();
  makeSlots();
  randomizeLevel();
  renderLevelButtons();
}

function loadNextLevel() {
  closeWin();
  loadLevel((levelIndex + 1) % levels.length);
}

function ensureAudio() {
  if (!audioEnabled) return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playSound(kind) {
  const context = ensureAudio();
  if (!context) return;
  const tones = {
    select: [[392, .055, .035]],
    snap: [[523.25, .08, .04], [659.25, .13, .028]],
    rotate: [[440, .06, .025], [554.37, .08, .022]],
    return: [[277.18, .08, .018]],
    hint: [[329.63, .1, .025], [493.88, .16, .03]],
    win: [[523.25, .12, .04], [659.25, .15, .045], [783.99, .18, .05], [1046.5, .3, .055]],
  };
  const now = context.currentTime;
  (tones[kind] || []).forEach(([frequency, duration, gainAmount], index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * .075);
    gain.gain.setValueAtTime(.0001, now + index * .075);
    gain.gain.exponentialRampToValueAtTime(gainAmount, now + index * .075 + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + index * .075 + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + index * .075);
    oscillator.stop(now + index * .075 + duration + .02);
  });
}

boardSvg.addEventListener("pointermove", movePointer);
boardSvg.addEventListener("pointerup", endPointer);
boardSvg.addEventListener("pointercancel", endPointer);
boardSvg.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch" && selectedId && event.target === boardSvg) {
    selectedId = null;
    updatePieceClasses();
    updateSlotHighlights();
  }
});
boardSvg.addEventListener("contextmenu", (event) => event.preventDefault());
resetButton.addEventListener("click", () => {
  playSound("return");
  randomizeLevel();
});
hintButton.addEventListener("click", offerHint);
soundButton.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  soundButton.setAttribute("aria-pressed", String(audioEnabled));
  soundButton.innerHTML = `<span aria-hidden="true">${audioEnabled ? "◖" : "◌"}</span> ${audioEnabled ? "Sound" : "Muted"}`;
  if (audioEnabled) playSound("select");
});
nextButton.addEventListener("click", loadNextLevel);

loadLevel(0);
