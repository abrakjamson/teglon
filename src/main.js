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
const PATTERN_PAIRS = {
  H1: [0, 1],
  H2: [0, 2],
  H3: [0, 3],
  RA: [0, 1],
  RO: [0, 3],
  P0: [0, 2],
  P1: [1, 3],
};

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
  return shape === "hex" ? HEX_BASE_POINTS : RHOMBUS_BASE_POINTS;
}

function pieceEdgeSegments(shape) {
  return shape === "hex" ? HEX_EDGE_SEGMENTS : RHOMBUS_EDGE_SEGMENTS;
}

function rotationOffset(piece, rotation) {
  return piece.shape === "hex" ? rotation : rotation * 2;
}

function physicalEdge(piece, localEdge, rotation) {
  return (localEdge + rotationOffset(piece, rotation)) % (piece.shape === "hex" ? 6 : 4);
}

function physicalRotation(piece, rotation, slot) {
  const slotAngle = piece.shape === "rhombus" ? (slot?.angle || 0) : 0;
  return slotAngle + (piece.shape === "hex" ? -rotation * 60 : rotation * 180);
}

function patternPair(piece) {
  return PATTERN_PAIRS[piece.pattern];
}

function activeEdges(piece, rotation) {
  const size = piece.shape === "hex" ? 6 : 4;
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
  const scale = loose ? level.board.scale * .58 : level.board.scale;
  if (loose) {
    return segment.map((point) => {
      const rotated = rotatePoint(point, angle);
      return [piece.position[0] + rotated[0] * scale, piece.position[1] + rotated[1] * scale];
    });
  }
  const physical = physicalEdge(piece, localEdge, rotation);
  const visualIndex = piece.shape === "rhombus"
    ? (slot.edgeMap?.[physical] ?? physical)
    : physical;
  const target = pieceEdgeSegments(piece.shape)[visualIndex].map((point) => {
    const rotated = rotatePoint(point, piece.shape === "rhombus" ? (slot.angle || 0) : 0);
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
  const localEdge = (physicalEdge - offset + (piece.shape === "hex" ? 6 : 4))
    % (piece.shape === "hex" ? 6 : 4);
  return endpointFor(piece, slot, localEdge, rotation, localBit(piece, localEdge));
}

function piecePolygon(piece, slot, rotation, loose = false) {
  const angle = loose ? 0 : (piece.shape === "rhombus" ? (slot?.angle || 0) : 0);
  const center = loose ? piece.position : boardPoint(slot.center);
  const scale = loose ? level.board.scale * .58 : level.board.scale;
  const points = pieceShapePoints(piece.shape).map((point) => {
    const rotated = rotatePoint(point, angle);
    return [center[0] + rotated[0] * scale, center[1] + rotated[1] * scale];
  });
  return points;
}

function groovePath(piece, slot, loose = false) {
  const pair = patternPair(piece);
  const rotation = piece.rotation;
  const localStart = pair[0];
  const localEnd = pair[1];
  const start = endpointFor(piece, slot, localStart, rotation, localBit(piece, localStart));
  const end = endpointFor(piece, slot, localEnd, rotation, localBit(piece, localEnd));
  const center = loose ? piece.position : boardPoint(slot.center);
  const scale = loose ? level.board.scale * .58 : level.board.scale;
  const pairClass = piece.pattern;
  const curveBias = {
    H1: [0, 0],
    H2: [-.1, .05],
    H3: [0, 0],
    RA: [.1, 0],
    RO: [-.08, 0],
    P0: [0, -.05],
    P1: [0, .05],
  }[pairClass] || [0, 0];
  const control = [
    center[0] + curveBias[0] * scale,
    center[1] + curveBias[1] * scale,
  ];
  return `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
}

function trayPosition(index, count, shape) {
  const columns = level.pieces.length > 9 ? 8 : 3;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const width = level.pieces.length > 9 ? 104 : 150;
  const startX = level.pieces.length > 9 ? 105 : 245;
  const y = level.pieces.length > 9 ? 608 + row * 45 : 565 + row * 54;
  return [startX + column * width, y + (shape === "rhombus" ? 0 : 2)];
}

function makeBoardOutline() {
  boardArt.replaceChildren();
  const center = boardPoint([level.board.macroCenter[0], 0]);
  const radius = level.board.scale * level.board.side;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = index * 60 * Math.PI / 180;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  });
  const outline = svgElement("polygon", {
    points: formatPoints(points),
    class: "board-outline",
  });
  boardArt.append(outline);
  const inner = svgElement("polygon", {
    points: formatPoints(points.map(([x, y]) => [
      center[0] + (x - center[0]) * .96,
      center[1] + (y - center[1]) * .96,
    ])),
    fill: "none",
    stroke: "rgba(211,170,96,.13)",
    "stroke-width": "1",
    "stroke-dasharray": "2 9",
  });
  boardArt.append(inner);
}

function makeSlots() {
  slotLayer.replaceChildren();
  slotElements.clear();
  level.slots.forEach((slot) => {
    const group = svgElement("g", { class: "slot", "data-slot": slot.id });
    const shapePoints = pieceShapePoints(slot.shape);
    const transformed = shapePoints.map((point) => {
      const angle = slot.shape === "rhombus" ? slot.angle : 0;
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
  window.setTimeout(clearHintHighlight, 2800);
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
    "aria-label": `${piece.shape === "hex" ? "Hexagon" : "Rhombus"} groove, ${patternLabel[piece.pattern]}`,
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
  elements.group.classList.toggle("is-winner", completedLevels.has(level.id));
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
