const form = document.getElementById('drawing-form');
const svg = document.getElementById('drawing');
const statusEl = document.getElementById('status');
const drawingModeEl = document.getElementById('drawingMode');
const downloadPdfBtn = document.getElementById('downloadPdf');
const sharePdfBtn = document.getElementById('sharePdf');
const saveImageBtn = document.getElementById('saveImage');
const saveProjectBtn = document.getElementById('saveProject');
const loadProjectBtn = document.getElementById('loadProject');
const saveCloudBtn = document.getElementById('saveCloud');
const loadCloudBtn = document.getElementById('loadCloud');
const logoutBtn = document.getElementById('logoutBtn');
const projectFileInputEl = document.getElementById('projectFileInput');
const previewWrap = document.querySelector('.preview-wrap');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const fitViewBtn = document.getElementById('fitView');
const zoomLabel = document.getElementById('zoomLabel');
const uiModeToggleBtn = document.getElementById('uiModeToggle');
const sketchMaterialEl = document.getElementById('sketchMaterial');
const snapAngleStepEl = document.getElementById('snapAngleStep');
const gridStepEl = document.getElementById('gridStep');
const gridToggleBtn = document.getElementById('gridToggle');
const gridSnapToggleBtn = document.getElementById('gridSnapToggle');
const toolLineBtn = document.getElementById('toolLine');
const toolRectBtn = document.getElementById('toolRect');
const toolCircleBtn = document.getElementById('toolCircle');
const toolPipeBtn = document.getElementById('toolPipe');
const toolMoveBtn = document.getElementById('toolMove');
const toolExtrudeBtn = document.getElementById('toolExtrude');
const toolMeasureBtn = document.getElementById('toolMeasure');
const drawBoardToggleBtn = document.getElementById('drawBoardToggle');
const undoSketchBtn = document.getElementById('undoSketch');
const blankSheetBtn = document.getElementById('blankSheet');
const clearSketchBtn = document.getElementById('clearSketch');
const clearMeasuresBtn = document.getElementById('clearMeasures');
const sketchDimensionsEl = document.getElementById('sketchDimensions');
const customerNameEl = document.getElementById('customerName');
const projectNameEl = document.getElementById('projectName');
const orderNoEl = document.getElementById('orderNo');

const FORM_FIELD_IDS = [
  'drawingMode',
  'partName',
  'length',
  'width',
  'height',
  'holeDiameter',
  'holeOffsetX',
  'holeOffsetY',
  'tolerance',
  'uLength',
  'uHeight',
  'uInnerWidth',
  'uThickness',
  'uRadius',
  'uMaterial',
];

const SVG_W = 1189;
const SVG_H = 841;
let zoom = 1;
let activeTool = 'line';
let isDrawing = false;
let startPoint = null;
let startRawPoint = null;
let previewElement = null;
let sketchGroup = null;
const sketchShapes = [];
let blankSheetMode = false;
let nextShapeIndex = 0;
let isMoving = false;
let movingShapeIndex = -1;
let lastMovePoint = null;
let selectedShapeIndex = -1;
let isExtruding = false;
let lineUnitsCache = [];
let uiMode = 'simple';
let extrudeStartPoint = null;
let extrudeStartDepth = 0;
const sketchMeasures = [];
let measureStartRef = null;
let measureStartPoint = null;
let lineChainPoint = null;
let drawingBoardArmed = true;
let requireDrawingBoardArming = false;
let showGrid = true;
let snapToGrid = false;

const SKETCH_STATE_KEY = 'drawing-sketch-state-v2';
const SUPABASE_TABLE = window.AppSupabase?.config?.PROJECTS_TABLE || 'drawing_projects';

const EXTRUDE_VECTOR = { x: 1, y: -0.35 };
const EXTRUDE_LEN = Math.hypot(EXTRUDE_VECTOR.x, EXTRUDE_VECTOR.y);
const EXTRUDE_UNIT = { x: EXTRUDE_VECTOR.x / EXTRUDE_LEN, y: EXTRUDE_VECTOR.y / EXTRUDE_LEN };
const LINE_CONNECT_TOL = 14;

const NS = 'http://www.w3.org/2000/svg';
const supabaseClient = window.AppSupabase?.getClient?.() || null;

function makeSvgElement(tag, attrs = {}, textContent = '') {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  if (textContent) el.textContent = textContent;
  return el;
}

function applyUiMode() {
  document.body.classList.toggle('simple-mode', uiMode === 'simple');
  if (uiModeToggleBtn) {
    uiModeToggleBtn.textContent = uiMode === 'simple' ? 'Avansert' : 'Enkel';
  }
}

function toggleUiMode() {
  uiMode = uiMode === 'simple' ? 'advanced' : 'simple';
  localStorage.setItem('drawing-ui-mode', uiMode);
  applyUiMode();
}

function isTouchLikeLayout() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function updateDrawingBoardToggle() {
  requireDrawingBoardArming = isTouchLikeLayout();
  if (!requireDrawingBoardArming) drawingBoardArmed = true;
  if (!drawBoardToggleBtn) return;
  drawBoardToggleBtn.style.display = requireDrawingBoardArming ? 'inline-flex' : 'none';
  drawBoardToggleBtn.textContent = `Tegnebrett: ${drawingBoardArmed ? 'PÅ' : 'AV'}`;
  drawBoardToggleBtn.classList.toggle('active', drawingBoardArmed);
}

function toggleDrawingBoardArming() {
  drawingBoardArmed = !drawingBoardArmed;
  updateDrawingBoardToggle();
  statusEl.textContent = drawingBoardArmed ? 'Tegnebrett aktivert.' : 'Tegnebrett deaktivert.';
}

function canUseDrawingBoard(event) {
  if (event?.pointerType === 'mouse') return true;
  return !requireDrawingBoardArming || drawingBoardArmed;
}

function getGridStepMm() {
  const n = Number(gridStepEl?.value || 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function applyGridSnap(point) {
  if (!snapToGrid) return point;
  const step = getGridStepMm();
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  };
}

function updateGridControls() {
  if (gridToggleBtn) {
    gridToggleBtn.textContent = `Rutenett: ${showGrid ? 'PÅ' : 'AV'}`;
    gridToggleBtn.classList.toggle('active', showGrid);
  }
  if (gridSnapToggleBtn) {
    gridSnapToggleBtn.textContent = `Grid snap: ${snapToGrid ? 'PÅ' : 'AV'}`;
    gridSnapToggleBtn.classList.toggle('active', snapToGrid);
  }
}

function toggleGrid() {
  showGrid = !showGrid;
  updateGridControls();
  updateDrawing();
}

function toggleGridSnap() {
  snapToGrid = !snapToGrid;
  updateGridControls();
  renderSketchShapes();
}

function getProjectMeta() {
  return {
    customerName: (customerNameEl?.value || '').trim(),
    projectName: (projectNameEl?.value || '').trim(),
    orderNo: (orderNoEl?.value || '').trim(),
  };
}

function getFormState() {
  const state = {};
  for (const id of FORM_FIELD_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    state[id] = el.value;
  }
  return state;
}

function applyFormState(state) {
  if (!state || typeof state !== 'object') return;
  for (const id of FORM_FIELD_IDS) {
    if (!(id in state)) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = String(state[id] ?? '');
  }
}

function saveSketchState() {
  try {
    const payload = {
      sketchShapes,
      sketchMeasures,
      nextShapeIndex,
      lineChainPoint,
      selectedShapeIndex,
      showGrid,
      snapToGrid,
      gridStep: gridStepEl?.value || '10',
      snapAngleStep: snapAngleStepEl?.value || '15',
      project: getProjectMeta(),
      form: getFormState(),
    };
    localStorage.setItem(SKETCH_STATE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore quota/storage errors.
  }
}

function loadSketchState() {
  try {
    const raw = localStorage.getItem(SKETCH_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (Array.isArray(state.sketchShapes)) {
      sketchShapes.length = 0;
      sketchShapes.push(...state.sketchShapes);
    }
    if (Array.isArray(state.sketchMeasures)) {
      sketchMeasures.length = 0;
      sketchMeasures.push(...state.sketchMeasures);
    }
    if (Number.isInteger(state.nextShapeIndex) && state.nextShapeIndex >= 0) nextShapeIndex = state.nextShapeIndex;
    if (state.lineChainPoint && Number.isFinite(state.lineChainPoint.x) && Number.isFinite(state.lineChainPoint.y)) {
      lineChainPoint = { x: state.lineChainPoint.x, y: state.lineChainPoint.y };
    }
    if (Number.isInteger(state.selectedShapeIndex)) selectedShapeIndex = state.selectedShapeIndex;
    showGrid = typeof state.showGrid === 'boolean' ? state.showGrid : showGrid;
    snapToGrid = typeof state.snapToGrid === 'boolean' ? state.snapToGrid : snapToGrid;
    if (gridStepEl && ['5', '10', '20'].includes(String(state.gridStep))) gridStepEl.value = String(state.gridStep);
    if (snapAngleStepEl && ['off', '15', '30', '45', '90'].includes(String(state.snapAngleStep))) {
      snapAngleStepEl.value = String(state.snapAngleStep);
    }
    if (state.project && typeof state.project === 'object') {
      if (customerNameEl) customerNameEl.value = state.project.customerName || '';
      if (projectNameEl) projectNameEl.value = state.project.projectName || '';
      if (orderNoEl) orderNoEl.value = state.project.orderNo || '';
    }
    applyFormState(state.form);
  } catch (error) {
    // Ignore malformed state.
  }
}

function drawLine(group, x1, y1, x2, y2, extra = {}) {
  group.appendChild(makeSvgElement('line', { x1, y1, x2, y2, ...extra }));
}

function drawText(group, x, y, text, extra = {}) {
  group.appendChild(
    makeSvgElement(
      'text',
      {
        x,
        y,
        'font-size': 16,
        'font-family': 'IBM Plex Sans, Segoe UI, sans-serif',
        fill: '#111827',
        ...extra,
      },
      text,
    ),
  );
}

function drawRect(group, x, y, w, h, extra = {}) {
  group.appendChild(makeSvgElement('rect', { x, y, width: w, height: h, ...extra }));
}

function drawCircle(group, cx, cy, r, extra = {}) {
  group.appendChild(makeSvgElement('circle', { cx, cy, r, ...extra }));
}

function ensureSketchLayer() {
  sketchGroup = makeSvgElement('g', {
    id: 'sketch-layer',
    stroke: '#dc2626',
    fill: 'none',
    'stroke-width': 2,
    'stroke-linecap': 'round',
  });
  svg.appendChild(sketchGroup);
}

function indexToLabel(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function getNextShapeLabel() {
  const label = indexToLabel(nextShapeIndex);
  nextShapeIndex += 1;
  return label;
}

function materialStyle(material) {
  if (material === 'alu') return { stroke: '#6b7280', fill: 'none' };
  if (material === 'blikk') return { stroke: '#64748b', fill: 'none', 'stroke-dasharray': '10 4' };
  return { stroke: '#334155', fill: 'none' };
}

function shapeLength(shape) {
  return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
}

function getShapePrimaryMeasureMm(shape) {
  if (shape.type === 'line') return shapeLength(shape);
  if (shape.type === 'rect') return Math.max(shape.width, shape.height);
  if (shape.type === 'circle') return shape.r * 2;
  if (shape.type === 'pipe') return shape.rOuter * 2;
  return 0;
}

function shapeLabelWithMm(shape) {
  const valueMm = roundMm(getShapePrimaryMeasureMm(shape));
  return `${shape.label} ${valueMm} mm`;
}

function getShapeDepth(shape) {
  return Number.isFinite(shape.depth) ? shape.depth : 0;
}

function getDepthOffset(shape) {
  const depth = getShapeDepth(shape);
  return { dx: EXTRUDE_UNIT.x * depth, dy: EXTRUDE_UNIT.y * depth };
}

function getShapeBaseHandlePoint(shape) {
  if (shape.type === 'line') return { x: shape.x2, y: shape.y2 };
  if (shape.type === 'rect') return { x: shape.x + shape.width, y: shape.y };
  if (shape.type === 'circle') return { x: shape.cx + shape.r, y: shape.cy };
  if (shape.type === 'pipe') return { x: shape.cx + shape.rOuter, y: shape.cy };
  return { x: 0, y: 0 };
}

function getShapeHandlePoint(shape) {
  const base = getShapeBaseHandlePoint(shape);
  const off = getDepthOffset(shape);
  return { x: base.x + off.dx, y: base.y + off.dy };
}

function getDisplayHandlePoint(shape) {
  const base = getShapeBaseHandlePoint(shape);
  const displayDepth = Math.max(getShapeDepth(shape), 24);
  return {
    x: base.x + EXTRUDE_UNIT.x * displayDepth,
    y: base.y + EXTRUDE_UNIT.y * displayDepth,
  };
}

function projectToExtrudeAxis(basePoint, point) {
  return (point.x - basePoint.x) * EXTRUDE_UNIT.x + (point.y - basePoint.y) * EXTRUDE_UNIT.y;
}

function isPointNearHandle(shape, point) {
  const actualHandle = getShapeHandlePoint(shape);
  const displayHandle = getDisplayHandlePoint(shape);
  const baseHandle = getShapeBaseHandlePoint(shape);
  const nearActual = Math.hypot(point.x - actualHandle.x, point.y - actualHandle.y) <= 16;
  const nearDisplay = Math.hypot(point.x - displayHandle.x, point.y - displayHandle.y) <= 16;
  const nearBase = Math.hypot(point.x - baseHandle.x, point.y - baseHandle.y) <= 16;
  return nearActual || nearDisplay || nearBase;
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getSnapStepDeg() {
  if (!snapAngleStepEl) return 0;
  const value = snapAngleStepEl.value;
  if (value === 'off') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getSnappedPoint(start, point) {
  const snapDeg = getSnapStepDeg();
  if (snapDeg <= 0) return point;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return point;
  const angle = Math.atan2(dy, dx);
  const stepRad = (snapDeg * Math.PI) / 180;
  const snappedAngle = Math.round(angle / stepRad) * stepRad;
  return {
    x: start.x + Math.cos(snappedAngle) * len,
    y: start.y + Math.sin(snappedAngle) * len,
  };
}

function findNearestLineEndpoint(point, tolerance = 18) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sketchShapes.length; i += 1) {
    const shape = sketchShapes[i];
    if (shape.type !== 'line') continue;
    for (const p of [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }]) {
      const d = pointDistance(point, p);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
  }
  return best && bestDist <= tolerance ? { x: best.x, y: best.y } : null;
}

function resolveLineStartPoint(point) {
  const chainTol = 42;
  if (lineChainPoint && pointDistance(point, lineChainPoint) <= chainTol) {
    return { x: lineChainPoint.x, y: lineChainPoint.y };
  }
  return findNearestLineEndpoint(point, 18) || point;
}

function resolveLineEndPoint(start, end) {
  const angled = getSnappedPoint(start, end);
  const snappedToEndpoint = findNearestLineEndpoint(angled, 18);
  if (snappedToEndpoint && pointDistance(start, snappedToEndpoint) > 0.5) {
    return snappedToEndpoint;
  }
  return angled;
}

function angleBetweenSegments(prevPoint, jointPoint, nextPoint) {
  const v1 = { x: prevPoint.x - jointPoint.x, y: prevPoint.y - jointPoint.y };
  const v2 = { x: nextPoint.x - jointPoint.x, y: nextPoint.y - jointPoint.y };
  const l1 = Math.hypot(v1.x, v1.y);
  const l2 = Math.hypot(v2.x, v2.y);
  if (l1 < 0.0001 || l2 < 0.0001) return 0;
  const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
  const clamped = Math.max(-1, Math.min(1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

function signedAngleBetweenSegments(prevPoint, jointPoint, nextPoint) {
  const v1 = { x: prevPoint.x - jointPoint.x, y: prevPoint.y - jointPoint.y };
  const v2 = { x: nextPoint.x - jointPoint.x, y: nextPoint.y - jointPoint.y };
  return (Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y) * 180) / Math.PI;
}

function rotatePointAround(point, center, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const px = point.x - center.x;
  const py = point.y - center.y;
  return {
    x: center.x + px * cos - py * sin,
    y: center.y + px * sin + py * cos,
  };
}

function makePointRef(point) {
  return { kind: 'point', x: point.x, y: point.y };
}

function getShapeAnchors(shape, shapeIndex) {
  if (shape.type === 'line') {
    return [
      { key: 'start', point: { x: shape.x1, y: shape.y1 } },
      { key: 'end', point: { x: shape.x2, y: shape.y2 } },
      { key: 'mid', point: { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 } },
    ].map((a) => ({ kind: 'anchor', shapeIndex, key: a.key, ...a.point }));
  }
  if (shape.type === 'rect') {
    const x = shape.x;
    const y = shape.y;
    const w = shape.width;
    const h = shape.height;
    return [
      { key: 'left', x, y: y + h / 2 },
      { key: 'right', x: x + w, y: y + h / 2 },
      { key: 'top', x: x + w / 2, y },
      { key: 'bottom', x: x + w / 2, y: y + h },
      { key: 'center', x: x + w / 2, y: y + h / 2 },
      { key: 'tl', x, y },
      { key: 'tr', x: x + w, y },
      { key: 'bl', x, y: y + h },
      { key: 'br', x: x + w, y: y + h },
    ].map((a) => ({ kind: 'anchor', shapeIndex, key: a.key, x: a.x, y: a.y }));
  }
  if (shape.type === 'circle') {
    return [
      { key: 'center', x: shape.cx, y: shape.cy },
      { key: 'left', x: shape.cx - shape.r, y: shape.cy },
      { key: 'right', x: shape.cx + shape.r, y: shape.cy },
      { key: 'top', x: shape.cx, y: shape.cy - shape.r },
      { key: 'bottom', x: shape.cx, y: shape.cy + shape.r },
    ].map((a) => ({ kind: 'anchor', shapeIndex, key: a.key, x: a.x, y: a.y }));
  }
  const r = shape.rOuter;
  return [
    { key: 'center', x: shape.cx, y: shape.cy },
    { key: 'left', x: shape.cx - r, y: shape.cy },
    { key: 'right', x: shape.cx + r, y: shape.cy },
    { key: 'top', x: shape.cx, y: shape.cy - r },
    { key: 'bottom', x: shape.cx, y: shape.cy + r },
  ].map((a) => ({ kind: 'anchor', shapeIndex, key: a.key, x: a.x, y: a.y }));
}

function resolveAnchorRef(ref) {
  if (!ref) return null;
  if (ref.kind === 'point') return { x: ref.x, y: ref.y };
  if (ref.kind === 'projection') {
    const targetShape = sketchShapes[ref.shapeIndex];
    if (!targetShape) return null;
    const sourcePoint = resolveAnchorRef(ref.sourceRef);
    if (!sourcePoint) return null;
    if (ref.axis === 'vertical') {
      return verticalMeasurePointOnShape(targetShape, sourcePoint.x, sourcePoint.y, ref.direction || 'up');
    }
    if (ref.axis === 'horizontal') {
      return horizontalMeasurePointOnShape(targetShape, sourcePoint.y, sourcePoint.x, ref.direction || 'nearest');
    }
    return null;
  }
  const shape = sketchShapes[ref.shapeIndex];
  if (!shape) return null;
  const anchor = getShapeAnchors(shape, ref.shapeIndex).find((a) => a.key === ref.key);
  if (!anchor) return null;
  return { x: anchor.x, y: anchor.y };
}

function nearestBoundaryPointOnShape(shape, sourcePoint) {
  if (!shape || !sourcePoint) return null;
  if (shape.type === 'line') {
    const a = { x: shape.x1, y: shape.y1 };
    const b = { x: shape.x2, y: shape.y2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denom = dx * dx + dy * dy;
    if (denom < 0.0001) return { x: a.x, y: a.y };
    const t = Math.max(0, Math.min(1, ((sourcePoint.x - a.x) * dx + (sourcePoint.y - a.y) * dy) / denom));
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  if (shape.type === 'rect') {
    const left = shape.x;
    const right = shape.x + shape.width;
    const top = shape.y;
    const bottom = shape.y + shape.height;
    const clampedX = Math.max(left, Math.min(right, sourcePoint.x));
    const clampedY = Math.max(top, Math.min(bottom, sourcePoint.y));
    const candidates = [
      { x: clampedX, y: top },
      { x: clampedX, y: bottom },
      { x: left, y: clampedY },
      { x: right, y: clampedY },
    ];
    let best = candidates[0];
    let bestDist = pointDistance(sourcePoint, best);
    for (let i = 1; i < candidates.length; i += 1) {
      const d = pointDistance(sourcePoint, candidates[i]);
      if (d < bestDist) {
        best = candidates[i];
        bestDist = d;
      }
    }
    return best;
  }
  if (shape.type === 'circle') {
    const dx = sourcePoint.x - shape.cx;
    const dy = sourcePoint.y - shape.cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) return { x: shape.cx + shape.r, y: shape.cy };
    return { x: shape.cx + (dx / len) * shape.r, y: shape.cy + (dy / len) * shape.r };
  }
  if (shape.type === 'pipe') {
    const dx = sourcePoint.x - shape.cx;
    const dy = sourcePoint.y - shape.cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) return { x: shape.cx + shape.rOuter, y: shape.cy };
    return { x: shape.cx + (dx / len) * shape.rOuter, y: shape.cy + (dy / len) * shape.rOuter };
  }
  return null;
}

function pickPreferredVerticalY(values, fromY) {
  if (!values || values.length === 0) return null;
  const above = values.filter((y) => y < fromY).sort((a, b) => b - a);
  if (above.length > 0) return above[0];
  const below = values.filter((y) => y > fromY).sort((a, b) => a - b);
  if (below.length > 0) return below[0];
  return values[0];
}

function pickPreferredHorizontalX(values, fromX, direction = 'nearest') {
  if (!values || values.length === 0) return null;
  if (direction === 'left') {
    const left = values.filter((x) => x < fromX).sort((a, b) => b - a);
    if (left.length > 0) return left[0];
    const right = values.filter((x) => x > fromX).sort((a, b) => a - b);
    if (right.length > 0) return right[0];
    return values[0];
  }
  if (direction === 'right') {
    const right = values.filter((x) => x > fromX).sort((a, b) => a - b);
    if (right.length > 0) return right[0];
    const left = values.filter((x) => x < fromX).sort((a, b) => b - a);
    if (left.length > 0) return left[0];
    return values[0];
  }
  const sorted = [...values].sort((a, b) => Math.abs(a - fromX) - Math.abs(b - fromX));
  return sorted[0];
}

function verticalMeasurePointOnShape(shape, x, fromY, direction = 'up') {
  if (!shape) return null;
  if (shape.type === 'rect') {
    const left = shape.x;
    const right = shape.x + shape.width;
    if (x < left || x > right) return null;
    const y = direction === 'down'
      ? pickPreferredVerticalY([shape.y + shape.height, shape.y], fromY)
      : pickPreferredVerticalY([shape.y, shape.y + shape.height], fromY);
    return y === null ? null : { x, y };
  }
  if (shape.type === 'line') {
    const x1 = shape.x1;
    const y1 = shape.y1;
    const x2 = shape.x2;
    const y2 = shape.y2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) < 0.0001) {
      if (Math.abs(x - x1) > 0.0001) return null;
      const y = pickPreferredVerticalY([y1, y2], fromY);
      return y === null ? null : { x, y };
    }
    const t = (x - x1) / dx;
    if (t < 0 || t > 1) return null;
    return { x, y: y1 + t * dy };
  }
  if (shape.type === 'circle' || shape.type === 'pipe') {
    const r = shape.type === 'circle' ? shape.r : shape.rOuter;
    const dx = x - shape.cx;
    if (Math.abs(dx) > r) return null;
    const h = Math.sqrt(Math.max(r * r - dx * dx, 0));
    const y1 = shape.cy - h;
    const y2 = shape.cy + h;
    const y = direction === 'down' ? pickPreferredVerticalY([y2, y1], fromY) : pickPreferredVerticalY([y1, y2], fromY);
    return y === null ? null : { x, y };
  }
  return null;
}

function horizontalMeasurePointOnShape(shape, y, fromX, direction = 'nearest') {
  if (!shape) return null;
  if (shape.type === 'rect') {
    const top = shape.y;
    const bottom = shape.y + shape.height;
    if (y < top || y > bottom) return null;
    const x = pickPreferredHorizontalX([shape.x, shape.x + shape.width], fromX, direction);
    return x === null ? null : { x, y };
  }
  if (shape.type === 'line') {
    const x1 = shape.x1;
    const y1 = shape.y1;
    const x2 = shape.x2;
    const y2 = shape.y2;
    const dy = y2 - y1;
    const dx = x2 - x1;
    if (Math.abs(dy) < 0.0001) {
      if (Math.abs(y - y1) > 0.0001) return null;
      const x = pickPreferredHorizontalX([x1, x2], fromX, direction);
      return x === null ? null : { x, y };
    }
    const t = (y - y1) / dy;
    if (t < 0 || t > 1) return null;
    return { x: x1 + t * dx, y };
  }
  if (shape.type === 'circle' || shape.type === 'pipe') {
    const r = shape.type === 'circle' ? shape.r : shape.rOuter;
    const dy = y - shape.cy;
    if (Math.abs(dy) > r) return null;
    const w = Math.sqrt(Math.max(r * r - dy * dy, 0));
    const x1 = shape.cx - w;
    const x2 = shape.cx + w;
    const x = pickPreferredHorizontalX([x1, x2], fromX, direction);
    return x === null ? null : { x, y };
  }
  return null;
}

function shapeArea(shape) {
  if (shape.type === 'rect') return Math.max(shape.width * shape.height, 0);
  if (shape.type === 'circle') return Math.PI * shape.r * shape.r;
  if (shape.type === 'pipe') return Math.PI * shape.rOuter * shape.rOuter;
  if (shape.type === 'line') return shapeLength(shape);
  return Number.POSITIVE_INFINITY;
}

function isShapeInsideContainer(childShape, containerShape) {
  if (!childShape || !containerShape || childShape === containerShape) return false;
  if (childShape.type !== 'circle' && childShape.type !== 'rect') return false;
  if (!['rect', 'circle', 'pipe'].includes(containerShape.type)) return false;

  if (containerShape.type === 'rect') {
    const left = containerShape.x;
    const right = containerShape.x + containerShape.width;
    const top = containerShape.y;
    const bottom = containerShape.y + containerShape.height;
    if (childShape.type === 'circle') {
      return (
        childShape.cx - childShape.r >= left &&
        childShape.cx + childShape.r <= right &&
        childShape.cy - childShape.r >= top &&
        childShape.cy + childShape.r <= bottom
      );
    }
    return (
      childShape.x >= left &&
      childShape.x + childShape.width <= right &&
      childShape.y >= top &&
      childShape.y + childShape.height <= bottom
    );
  }

  const rContainer = containerShape.type === 'circle' ? containerShape.r : containerShape.rOuter;
  const cx = containerShape.cx;
  const cy = containerShape.cy;
  if (childShape.type === 'circle') {
    const d = Math.hypot(childShape.cx - cx, childShape.cy - cy);
    return d + childShape.r <= rContainer;
  }
  const corners = [
    { x: childShape.x, y: childShape.y },
    { x: childShape.x + childShape.width, y: childShape.y },
    { x: childShape.x, y: childShape.y + childShape.height },
    { x: childShape.x + childShape.width, y: childShape.y + childShape.height },
  ];
  return corners.every((p) => Math.hypot(p.x - cx, p.y - cy) <= rContainer);
}

function addAutoPlacementMeasuresForShape(shapeIndex) {
  const shape = sketchShapes[shapeIndex];
  if (!shape || (shape.type !== 'circle' && shape.type !== 'rect')) return;
  const containers = sketchShapes
    .map((s, i) => ({ shape: s, index: i }))
    .filter((item) => item.index !== shapeIndex && isShapeInsideContainer(shape, item.shape))
    .sort((a, b) => shapeArea(a.shape) - shapeArea(b.shape));

  if (containers.length === 0) return;
  const container = containers[0];
  const centerRef = { kind: 'anchor', shapeIndex, key: 'center' };
  const verticalRef = { kind: 'projection', shapeIndex: container.index, axis: 'vertical', direction: 'up', sourceRef: centerRef };
  const horizontalRef = { kind: 'projection', shapeIndex: container.index, axis: 'horizontal', direction: 'nearest', sourceRef: centerRef };
  sketchMeasures.push({ startRef: centerRef, endRef: verticalRef });
  sketchMeasures.push({ startRef: centerRef, endRef: horizontalRef });
}

function normalizeMeasurePair(startRef, endRef, startClickPoint = null, endClickPoint = null) {
  const startPoint = resolveAnchorRef(startRef);
  const endPoint = resolveAnchorRef(endRef);
  if (!startPoint || !endPoint) return { startRef, endRef };

  const startIsCenter = startRef?.kind === 'anchor' && startRef.key === 'center';
  const endIsCenter = endRef?.kind === 'anchor' && endRef.key === 'center';
  const endHitShapeIndex = endClickPoint ? findShapeIndexAtPoint(endClickPoint) : -1;
  const startHitShapeIndex = startClickPoint ? findShapeIndexAtPoint(startClickPoint) : -1;

  if (startIsCenter && endRef?.kind === 'anchor') {
    const targetShape = sketchShapes[endRef.shapeIndex];
    const projected = verticalMeasurePointOnShape(targetShape, startPoint.x, startPoint.y) || nearestBoundaryPointOnShape(targetShape, startPoint);
    if (projected) return { startRef, endRef: makePointRef(projected) };
  }
  if (startIsCenter && endRef?.kind === 'point' && endHitShapeIndex >= 0) {
    const targetShape = sketchShapes[endHitShapeIndex];
    const projected = verticalMeasurePointOnShape(targetShape, startPoint.x, startPoint.y) || nearestBoundaryPointOnShape(targetShape, startPoint);
    if (projected) return { startRef, endRef: makePointRef(projected) };
  }

  if (endIsCenter && startRef?.kind === 'anchor') {
    const targetShape = sketchShapes[startRef.shapeIndex];
    const projected = verticalMeasurePointOnShape(targetShape, endPoint.x, endPoint.y) || nearestBoundaryPointOnShape(targetShape, endPoint);
    if (projected) return { startRef: makePointRef(projected), endRef };
  }
  if (endIsCenter && startRef?.kind === 'point' && startHitShapeIndex >= 0) {
    const targetShape = sketchShapes[startHitShapeIndex];
    const projected = verticalMeasurePointOnShape(targetShape, endPoint.x, endPoint.y) || nearestBoundaryPointOnShape(targetShape, endPoint);
    if (projected) return { startRef: makePointRef(projected), endRef };
  }

  if (startIsCenter && endRef?.kind === 'point') {
    return { startRef, endRef: makePointRef({ x: startPoint.x, y: endPoint.y }) };
  }
  if (endIsCenter && startRef?.kind === 'point') {
    return { startRef: makePointRef({ x: endPoint.x, y: startPoint.y }), endRef };
  }

  return { startRef, endRef };
}

function getRadialAnchorRef(shape, shapeIndex, point) {
  const radius = shape.type === 'pipe' ? shape.rOuter : shape.r;
  const dx = point.x - shape.cx;
  const dy = point.y - shape.cy;
  const dist = Math.hypot(dx, dy);
  const centerSnapTol = Math.max(radius * 0.22, 10);
  if (dist <= centerSnapTol) {
    return { kind: 'anchor', shapeIndex, key: 'center', x: shape.cx, y: shape.cy };
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return { kind: 'anchor', shapeIndex, key: 'right', x: shape.cx + radius, y: shape.cy };
    return { kind: 'anchor', shapeIndex, key: 'left', x: shape.cx - radius, y: shape.cy };
  }
  if (dy >= 0) return { kind: 'anchor', shapeIndex, key: 'bottom', x: shape.cx, y: shape.cy + radius };
  return { kind: 'anchor', shapeIndex, key: 'top', x: shape.cx, y: shape.cy - radius };
}

function nearestAnchorFromShape(shape, shapeIndex, point) {
  const anchors = getShapeAnchors(shape, shapeIndex);
  if (anchors.length === 0) return null;
  let best = anchors[0];
  let bestDist = pointDistance(point, anchors[0]);
  for (let i = 1; i < anchors.length; i += 1) {
    const d = pointDistance(point, anchors[i]);
    if (d < bestDist) {
      best = anchors[i];
      bestDist = d;
    }
  }
  return { kind: 'anchor', shapeIndex: best.shapeIndex, key: best.key, x: best.x, y: best.y };
}

function findNearestAnchorRef(point) {
  const tol = 20;
  const hitIndex = findShapeIndexAtPoint(point);
  if (hitIndex >= 0) {
    const hitShape = sketchShapes[hitIndex];
    if (hitShape?.type === 'circle' || hitShape?.type === 'pipe') {
      return getRadialAnchorRef(hitShape, hitIndex, point);
    }
    const hitAnchor = nearestAnchorFromShape(hitShape, hitIndex, point);
    if (hitAnchor) return hitAnchor;
  }

  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sketchShapes.length; i += 1) {
    const shape = sketchShapes[i];
    const anchors = getShapeAnchors(shape, i);
    for (const anchor of anchors) {
      const d = Math.hypot(anchor.x - point.x, anchor.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'anchor', shapeIndex: anchor.shapeIndex, key: anchor.key, x: anchor.x, y: anchor.y };
      }
    }
  }
  if (best && bestDist <= tol) return best;
  return makePointRef(point);
}

function drawMeasurementLine(group, a, b, text) {
  drawLine(group, a.x, a.y, b.x, b.y, { stroke: '#0f172a', 'stroke-width': 1.3 });
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const arr = 8;
  const aa = 0.5;
  drawLine(group, a.x, a.y, a.x + Math.cos(ang + aa) * arr, a.y + Math.sin(ang + aa) * arr, { stroke: '#0f172a', 'stroke-width': 1.2 });
  drawLine(group, a.x, a.y, a.x + Math.cos(ang - aa) * arr, a.y + Math.sin(ang - aa) * arr, { stroke: '#0f172a', 'stroke-width': 1.2 });
  drawLine(group, b.x, b.y, b.x - Math.cos(ang + aa) * arr, b.y - Math.sin(ang + aa) * arr, { stroke: '#0f172a', 'stroke-width': 1.2 });
  drawLine(group, b.x, b.y, b.x - Math.cos(ang - aa) * arr, b.y - Math.sin(ang - aa) * arr, { stroke: '#0f172a', 'stroke-width': 1.2 });
  drawText(group, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6, text, { 'font-size': 12, fill: '#0f172a', 'font-weight': 700 });
}

function findMeasureIndexAtPoint(point) {
  const segmentTol = 10;
  const labelTol = 14;
  for (let i = sketchMeasures.length - 1; i >= 0; i -= 1) {
    const m = sketchMeasures[i];
    const a = resolveAnchorRef(m.startRef);
    const b = resolveAnchorRef(m.endRef);
    if (!a || !b) continue;
    if (distanceToSegment(point, a, b) <= segmentTol) return i;
    const mid = { x: (a.x + b.x) / 2 + 6, y: (a.y + b.y) / 2 - 6 };
    if (pointDistance(point, mid) <= labelTol) return i;
  }
  return -1;
}

function moveShapeByIndex(shapeIndex, dx, dy) {
  if (!Number.isInteger(shapeIndex) || shapeIndex < 0 || shapeIndex >= sketchShapes.length) return;
  moveShape(sketchShapes[shapeIndex], dx, dy);
}

function setRefPoint(ref, point) {
  if (!ref || ref.kind !== 'point') return;
  ref.x = point.x;
  ref.y = point.y;
}

function updateMeasureLengthByMm(measure, targetMm) {
  const a = resolveAnchorRef(measure.startRef);
  const b = resolveAnchorRef(measure.endRef);
  if (!a || !b) return;
  const current = pointDistance(a, b);
  if (current < 0.001) return;
  const delta = targetMm - current;
  const ux = (b.x - a.x) / current;
  const uy = (b.y - a.y) / current;

  if (measure.endRef?.kind === 'anchor') {
    moveShapeByIndex(measure.endRef.shapeIndex, ux * delta, uy * delta);
    return;
  }
  if (measure.startRef?.kind === 'anchor') {
    moveShapeByIndex(measure.startRef.shapeIndex, -ux * delta, -uy * delta);
    return;
  }
  if (measure.endRef?.kind === 'point') {
    setRefPoint(measure.endRef, { x: b.x + ux * delta, y: b.y + uy * delta });
    return;
  }
  if (measure.startRef?.kind === 'point') {
    setRefPoint(measure.startRef, { x: a.x - ux * delta, y: a.y - uy * delta });
  }
}

function renderSketchLabel(shape) {
  let x = 0;
  let y = 0;
  if (shape.type === 'line') {
    x = (shape.x1 + shape.x2) / 2 + 8;
    y = (shape.y1 + shape.y2) / 2 - 8;
  }
  if (shape.type === 'rect') {
    x = shape.x + shape.width + 8;
    y = shape.y - 8;
  }
  if (shape.type === 'circle') {
    x = shape.cx + shape.r + 8;
    y = shape.cy - shape.r - 8;
  }
  if (shape.type === 'pipe') {
    x = shape.cx + shape.rOuter + 8;
    y = shape.cy - shape.rOuter - 8;
  }
  sketchGroup.appendChild(
    makeSvgElement(
      'text',
      {
        x,
        y,
        fill: '#b91c1c',
        'font-size': 16,
        'font-weight': 700,
        'font-family': 'IBM Plex Sans, Segoe UI, sans-serif',
      },
      shapeLabelWithMm(shape),
    ),
  );
}

function updateSketchDimensionsPanel() {
  if (sketchShapes.length === 0) {
    sketchDimensionsEl.innerHTML = '<div class="sketch-dimensions-empty">Ingen figurer ennå.</div>';
    return;
  }

  const materialSelect = (index, value) => `
    <label>
      Materiale
      <select data-shape-index="${index}" data-field="material">
        <option value="stal" ${value === 'stal' ? 'selected' : ''}>Stål</option>
        <option value="alu" ${value === 'alu' ? 'selected' : ''}>Alu</option>
        <option value="blikk" ${value === 'blikk' ? 'selected' : ''}>Blikk</option>
      </select>
    </label>
  `;

  const html = sketchShapes
    .map((shape, index) => {
      if (shape.type === 'line') {
        return `
          <div class="shape-dimension-item">
            <div class="shape-dimension-header">${shape.label} - Strek</div>
            <div class="shape-dimension-grid">
              <label>
                Lengde (mm)
                <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="length" value="${roundMm(
          shapeLength(shape),
        )}" />
              </label>
              <label>
                Dybde (mm)
                <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="depth" value="${roundMm(
          getShapeDepth(shape),
        )}" />
              </label>
              ${materialSelect(index, shape.material || 'stal')}
            </div>
          </div>
        `;
      }
      if (shape.type === 'rect') {
        return `
          <div class="shape-dimension-item">
            <div class="shape-dimension-header">${shape.label} - Firkant</div>
            <div class="shape-dimension-grid">
              <label>
                Bredde (mm)
                <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="width" value="${roundMm(
          shape.width,
        )}" />
              </label>
              <label>
                Høyde (mm)
                <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="height" value="${roundMm(
          shape.height,
        )}" />
              </label>
              <label>
                Dybde (mm)
                <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="depth" value="${roundMm(
          getShapeDepth(shape),
        )}" />
              </label>
              ${materialSelect(index, shape.material || 'stal')}
            </div>
          </div>
        `;
      }
      if (shape.type === 'pipe') {
        return `
        <div class="shape-dimension-item">
          <div class="shape-dimension-header">${shape.label} - Rør</div>
          <div class="shape-dimension-grid">
            <label>
              Ytre dia (mm)
              <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="outerDiameter" value="${roundMm(
          shape.rOuter * 2,
        )}" />
            </label>
            <label>
              Godstykkelse (mm)
              <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="wall" value="${roundMm(
          shape.wall,
        )}" />
            </label>
            <label>
              Dybde (mm)
              <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="depth" value="${roundMm(
          getShapeDepth(shape),
        )}" />
            </label>
            ${materialSelect(index, shape.material || 'stal')}
          </div>
        </div>
      `;
      }
      return `
        <div class="shape-dimension-item">
          <div class="shape-dimension-header">${shape.label} - Sirkel</div>
          <div class="shape-dimension-grid">
            <label>
              Senter X (mm)
              <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="centerX" value="${roundMm(shape.cx)}" />
            </label>
            <label>
              Senter Y (mm)
              <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="centerY" value="${roundMm(shape.cy)}" />
            </label>
            <label>
              Diameter (mm)
              <input type="number" min="0.1" step="0.1" data-shape-index="${index}" data-field="diameter" value="${roundMm(
        shape.r * 2,
      )}" />
            </label>
            <label>
              Dybde (mm)
              <input type="number" min="0" step="0.1" data-shape-index="${index}" data-field="depth" value="${roundMm(
        getShapeDepth(shape),
      )}" />
            </label>
            ${materialSelect(index, shape.material || 'stal')}
          </div>
        </div>
      `;
    })
    .join('');

  const unitsHtml = lineUnitsCache
    .map((unit, unitIndex) => {
      const jointsHtml = unit.joints
        .map(
          (joint, jointIndex) => `
          <label>
            Punkt ${jointIndex + 1} vinkel (°)
            <input
              type="number"
              min="1"
              max="179"
              step="0.1"
              data-field="jointAngle"
              data-unit-index="${unitIndex}"
              data-joint-index="${jointIndex}"
              value="${roundMm(joint.angle)}" />
          </label>
        `,
        )
        .join('');
      return `
        <div class="shape-dimension-item">
          <div class="shape-dimension-header">Enhet ${unitIndex + 1} (${unit.labels.join(' - ')})</div>
          <div class="shape-dimension-grid">${jointsHtml || '<div>Ingen knekkpunkter</div>'}</div>
        </div>
      `;
    })
    .join('');

  sketchDimensionsEl.innerHTML = html + unitsHtml;
}

function setLineEndpointsFromSegment(line, fromPoint, toPoint) {
  const d1 = Math.hypot(line.x1 - fromPoint.x, line.y1 - fromPoint.y);
  const d2 = Math.hypot(line.x2 - fromPoint.x, line.y2 - fromPoint.y);
  if (d1 <= d2) {
    line.x1 = fromPoint.x;
    line.y1 = fromPoint.y;
    line.x2 = toPoint.x;
    line.y2 = toPoint.y;
    return;
  }
  line.x2 = fromPoint.x;
  line.y2 = fromPoint.y;
  line.x1 = toPoint.x;
  line.y1 = toPoint.y;
}

function buildLineConnectivity(tolerance = LINE_CONNECT_TOL) {
  const lineIndices = sketchShapes
    .map((shape, index) => ({ shape, index }))
    .filter((item) => item.shape.type === 'line')
    .map((item) => item.index);

  const nodes = [];
  const lineNodes = new Map();

  function nodeForPoint(point) {
    for (let i = 0; i < nodes.length; i += 1) {
      if (pointDistance(nodes[i], point) <= tolerance) return i;
    }
    nodes.push({ x: point.x, y: point.y });
    return nodes.length - 1;
  }

  for (const lineIndex of lineIndices) {
    const line = sketchShapes[lineIndex];
    const startNode = nodeForPoint({ x: line.x1, y: line.y1 });
    const endNode = nodeForPoint({ x: line.x2, y: line.y2 });
    lineNodes.set(lineIndex, { startNode, endNode });
  }

  const nodeToLines = new Map();
  for (const lineIndex of lineIndices) {
    const { startNode, endNode } = lineNodes.get(lineIndex);
    if (!nodeToLines.has(startNode)) nodeToLines.set(startNode, []);
    if (!nodeToLines.has(endNode)) nodeToLines.set(endNode, []);
    nodeToLines.get(startNode).push(lineIndex);
    nodeToLines.get(endNode).push(lineIndex);
  }

  return { nodes, lineNodes, nodeToLines };
}

function lineComponentFromNode(connectivity, startNode, excludedLineIndex) {
  const { lineNodes, nodeToLines } = connectivity;
  const queue = [startNode];
  const visitedNodes = new Set([startNode]);
  const lines = new Set();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const linkedLines = nodeToLines.get(nodeId) || [];
    for (const lineIndex of linkedLines) {
      if (lineIndex === excludedLineIndex) continue;
      if (!lines.has(lineIndex)) lines.add(lineIndex);
      const pair = lineNodes.get(lineIndex);
      if (!pair) continue;
      for (const nextNode of [pair.startNode, pair.endNode]) {
        if (!visitedNodes.has(nextNode)) {
          visitedNodes.add(nextNode);
          queue.push(nextNode);
        }
      }
    }
  }
  return Array.from(lines);
}

function applyConnectedLineLengthChange(lineIndex, targetLength) {
  const line = sketchShapes[lineIndex];
  if (!line || line.type !== 'line') return false;

  // Build connectivity before editing the line, so we know which side is attached.
  // Use a strict tolerance here so very short segments do not collapse both ends into one node.
  const connectivityBefore = buildLineConnectivity(0.01);
  const pairBefore = connectivityBefore.lineNodes.get(lineIndex);
  if (!pairBefore) return false;
  const linesAttachedToEndBefore = lineComponentFromNode(connectivityBefore, pairBefore.endNode, lineIndex);

  const fromPoint = { x: line.x1, y: line.y1 };
  const toPoint = { x: line.x2, y: line.y2 };
  const vx = toPoint.x - fromPoint.x;
  const vy = toPoint.y - fromPoint.y;
  const len = Math.hypot(vx, vy);
  if (len < 0.0001) return false;

  const ux = vx / len;
  const uy = vy / len;
  const newTo = { x: fromPoint.x + ux * targetLength, y: fromPoint.y + uy * targetLength };
  const delta = { x: newTo.x - toPoint.x, y: newTo.y - toPoint.y };
  setLineEndpointsFromSegment(line, fromPoint, newTo);

  if (Math.hypot(delta.x, delta.y) < 0.0001) return true;
  for (const nextIndex of linesAttachedToEndBefore) {
    const nextLine = sketchShapes[nextIndex];
    if (!nextLine || nextLine.type !== 'line') continue;
    nextLine.x1 += delta.x;
    nextLine.y1 += delta.y;
    nextLine.x2 += delta.x;
    nextLine.y2 += delta.y;
  }
  return true;
}

function applyShapeDimensionChange(shapeIndex, field, rawValue) {
  const shape = sketchShapes[shapeIndex];
  if (!shape) return;
  if (field === 'depth') {
    const depthValue = Number(rawValue);
    if (Number.isFinite(depthValue) && depthValue >= 0) shape.depth = depthValue;
    return;
  }
  if (field === 'material') {
    if (['stal', 'alu', 'blikk'].includes(rawValue)) {
      shape.material = rawValue;
    }
    return;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;

  if (shape.type === 'line' && field === 'length') {
    if (value <= 0) return;
    if (applyConnectedLineLengthChange(shapeIndex, value)) return;
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const current = Math.hypot(dx, dy);
    if (current < 0.0001) {
      shape.x2 = shape.x1 + value;
      shape.y2 = shape.y1;
    } else {
      const scale = value / current;
      shape.x2 = shape.x1 + dx * scale;
      shape.y2 = shape.y1 + dy * scale;
    }
  }

  if (shape.type === 'rect') {
    if (field === 'width' && value > 0) shape.width = value;
    if (field === 'height' && value > 0) shape.height = value;
    if (field === 'x') shape.x = value;
    if (field === 'y') shape.y = value;
  }

  if (shape.type === 'circle' && field === 'diameter') {
    if (value > 0) shape.r = value / 2;
  }
  if (shape.type === 'circle' && field === 'centerX') {
    shape.cx = value;
  }
  if (shape.type === 'circle' && field === 'centerY') {
    shape.cy = value;
  }

  if (shape.type === 'pipe') {
    if (field === 'outerDiameter' && value > 0) shape.rOuter = value / 2;
    if (field === 'wall' && value > 0) shape.wall = Math.min(value, Math.max(shape.rOuter - 0.1, 0.1));
    if (field === 'centerX') shape.cx = value;
    if (field === 'centerY') shape.cy = value;
  }
}

function computeLineUnits() {
  const lineIndices = sketchShapes
    .map((shape, index) => ({ shape, index }))
    .filter((item) => item.shape.type === 'line')
    .map((item) => item.index);

  if (lineIndices.length < 2) return [];

  const nodes = [];
  const lineNodes = new Map();

  function nodeForPoint(point) {
    for (let i = 0; i < nodes.length; i += 1) {
      if (pointDistance(nodes[i], point) <= LINE_CONNECT_TOL) {
        const n = nodes[i];
        const count = n.count + 1;
        n.x = (n.x * n.count + point.x) / count;
        n.y = (n.y * n.count + point.y) / count;
        n.count = count;
        return i;
      }
    }
    nodes.push({ x: point.x, y: point.y, count: 1 });
    return nodes.length - 1;
  }

  for (const lineIndex of lineIndices) {
    const line = sketchShapes[lineIndex];
    const startNode = nodeForPoint({ x: line.x1, y: line.y1 });
    const endNode = nodeForPoint({ x: line.x2, y: line.y2 });
    lineNodes.set(lineIndex, { startNode, endNode });
  }

  const nodeToLines = new Map();
  for (const lineIndex of lineIndices) {
    const { startNode, endNode } = lineNodes.get(lineIndex);
    if (!nodeToLines.has(startNode)) nodeToLines.set(startNode, []);
    if (!nodeToLines.has(endNode)) nodeToLines.set(endNode, []);
    nodeToLines.get(startNode).push(lineIndex);
    nodeToLines.get(endNode).push(lineIndex);
  }

  const visited = new Set();
  const components = [];

  for (const lineIndex of lineIndices) {
    if (visited.has(lineIndex)) continue;
    const queue = [lineIndex];
    const comp = [];
    visited.add(lineIndex);
    while (queue.length > 0) {
      const curr = queue.shift();
      comp.push(curr);
      const { startNode, endNode } = lineNodes.get(curr);
      for (const nodeId of [startNode, endNode]) {
        const linked = nodeToLines.get(nodeId) || [];
        for (const nextLine of linked) {
          if (!visited.has(nextLine)) {
            visited.add(nextLine);
            queue.push(nextLine);
          }
        }
      }
    }
    components.push(comp);
  }

  const units = [];
  for (const compLines of components) {
    if (compLines.length < 2) continue;

    const degree = new Map();
    for (const lineIndex of compLines) {
      const { startNode, endNode } = lineNodes.get(lineIndex);
      degree.set(startNode, (degree.get(startNode) || 0) + 1);
      degree.set(endNode, (degree.get(endNode) || 0) + 1);
    }

    let startNode = null;
    for (const [nodeId, deg] of degree.entries()) {
      if (deg === 1) {
        startNode = nodeId;
        break;
      }
    }
    if (startNode === null) startNode = lineNodes.get(compLines[0]).startNode;

    const used = new Set();
    const orderedSegments = [];
    const orderedNodes = [startNode];
    let currentNode = startNode;

    while (used.size < compLines.length) {
      const candidates = (nodeToLines.get(currentNode) || []).filter((lineIndex) => compLines.includes(lineIndex) && !used.has(lineIndex));
      if (candidates.length === 0) break;
      const nextLine = candidates[0];
      const nodesForLine = lineNodes.get(nextLine);
      const toNode = nodesForLine.startNode === currentNode ? nodesForLine.endNode : nodesForLine.startNode;
      orderedSegments.push({ lineIndex: nextLine, fromNode: currentNode, toNode });
      used.add(nextLine);
      orderedNodes.push(toNode);
      currentNode = toNode;
    }

    if (orderedSegments.length < 2) continue;

    const joints = [];
    for (let i = 1; i < orderedNodes.length - 1; i += 1) {
      const prev = nodes[orderedNodes[i - 1]];
      const joint = nodes[orderedNodes[i]];
      const next = nodes[orderedNodes[i + 1]];
      joints.push({
        jointIndex: i - 1,
        nodeId: orderedNodes[i],
        point: { x: joint.x, y: joint.y },
        angle: angleBetweenSegments(prev, joint, next),
        signedAngle: signedAngleBetweenSegments(prev, joint, next),
      });
    }

    units.push({
      lineIndices: orderedSegments.map((s) => s.lineIndex),
      orderedSegments,
      orderedNodes,
      joints,
      labels: orderedSegments.map((s) => sketchShapes[s.lineIndex].label),
      centroid: {
        x: orderedNodes.reduce((acc, nodeId) => acc + nodes[nodeId].x, 0) / orderedNodes.length,
        y: orderedNodes.reduce((acc, nodeId) => acc + nodes[nodeId].y, 0) / orderedNodes.length,
      },
      nodes,
    });
  }

  return units;
}

function drawLineUnitOverlay(group, units) {
  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    drawText(group, unit.centroid.x + 8, unit.centroid.y - 10, `Enhet ${unitIndex + 1}`, {
      'font-size': 12,
      fill: '#0f766e',
      'font-weight': 700,
    });
    for (let j = 0; j < unit.joints.length; j += 1) {
      const joint = unit.joints[j];
      drawCircle(group, joint.point.x, joint.point.y, 4, { stroke: '#0284c7', fill: '#7dd3fc', 'stroke-width': 1.1 });
      drawText(group, joint.point.x + 8, joint.point.y - 8, `${roundMm(joint.angle)}°`, {
        'font-size': 12,
        fill: '#0369a1',
        'font-weight': 700,
      });
    }
  }
}

function applyUnitJointAngleChange(unitIndex, jointIndex, targetAngleRaw) {
  const unit = lineUnitsCache[unitIndex];
  if (!unit) return;
  const target = Number(targetAngleRaw);
  if (!Number.isFinite(target) || target <= 0 || target >= 180) return;
  const joint = unit.joints[jointIndex];
  if (!joint) return;

  const currentSigned = joint.signedAngle;
  const targetSigned = (currentSigned >= 0 ? 1 : -1) * target;
  const delta = targetSigned - currentSigned;
  const pivot = joint.point;

  for (let s = jointIndex + 1; s < unit.orderedSegments.length; s += 1) {
    const lineIndex = unit.orderedSegments[s].lineIndex;
    const line = sketchShapes[lineIndex];
    if (!line || line.type !== 'line') continue;
    const p1 = rotatePointAround({ x: line.x1, y: line.y1 }, pivot, delta);
    const p2 = rotatePointAround({ x: line.x2, y: line.y2 }, pivot, delta);
    line.x1 = p1.x;
    line.y1 = p1.y;
    line.x2 = p2.x;
    line.y2 = p2.y;
  }
}

function drawShapeSelectionOverlay(group, shape) {
  const hl = { stroke: '#0ea5e9', fill: 'none', 'stroke-width': 2.6, 'stroke-dasharray': '6 4' };
  if (shape.type === 'line') {
    drawLine(group, shape.x1, shape.y1, shape.x2, shape.y2, hl);
    return;
  }
  if (shape.type === 'rect') {
    drawRect(group, shape.x, shape.y, shape.width, shape.height, hl);
    return;
  }
  if (shape.type === 'circle') {
    drawCircle(group, shape.cx, shape.cy, shape.r, hl);
    return;
  }
  drawCircle(group, shape.cx, shape.cy, shape.rOuter, hl);
}

function renderSketchShapes() {
  renderSketchShapesWithOptions();
}

function renderSketchShapesWithOptions(options = {}) {
  const { skipPanel = false } = options;
  if (!sketchGroup) ensureSketchLayer();
  while (sketchGroup.firstChild) sketchGroup.removeChild(sketchGroup.firstChild);

  for (let index = 0; index < sketchShapes.length; index += 1) {
    const shape = sketchShapes[index];
    const style = materialStyle(shape.material || 'stal');
    const off = getDepthOffset(shape);
    const depthLineStyle = { stroke: style.stroke, fill: 'none', 'stroke-width': 1.4 };

    if (shape.type === 'line') {
      if (getShapeDepth(shape) > 0) {
        drawLine(sketchGroup, shape.x1 + off.dx, shape.y1 + off.dy, shape.x2 + off.dx, shape.y2 + off.dy, depthLineStyle);
        drawLine(sketchGroup, shape.x1, shape.y1, shape.x1 + off.dx, shape.y1 + off.dy, depthLineStyle);
        drawLine(sketchGroup, shape.x2, shape.y2, shape.x2 + off.dx, shape.y2 + off.dy, depthLineStyle);
      }
      sketchGroup.appendChild(
        makeSvgElement('line', { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, ...style }),
      );
    }
    if (shape.type === 'rect') {
      if (getShapeDepth(shape) > 0) {
        sketchGroup.appendChild(
          makeSvgElement('rect', {
            x: shape.x + off.dx,
            y: shape.y + off.dy,
            width: shape.width,
            height: shape.height,
            ...depthLineStyle,
          }),
        );
        drawLine(sketchGroup, shape.x, shape.y, shape.x + off.dx, shape.y + off.dy, depthLineStyle);
        drawLine(sketchGroup, shape.x + shape.width, shape.y, shape.x + shape.width + off.dx, shape.y + off.dy, depthLineStyle);
        drawLine(
          sketchGroup,
          shape.x + shape.width,
          shape.y + shape.height,
          shape.x + shape.width + off.dx,
          shape.y + shape.height + off.dy,
          depthLineStyle,
        );
        drawLine(sketchGroup, shape.x, shape.y + shape.height, shape.x + off.dx, shape.y + shape.height + off.dy, depthLineStyle);
      }
      sketchGroup.appendChild(
        makeSvgElement('rect', { x: shape.x, y: shape.y, width: shape.width, height: shape.height, ...style }),
      );
    }
    if (shape.type === 'circle') {
      if (getShapeDepth(shape) > 0) {
        sketchGroup.appendChild(
          makeSvgElement('circle', { cx: shape.cx + off.dx, cy: shape.cy + off.dy, r: shape.r, ...depthLineStyle }),
        );
        drawLine(sketchGroup, shape.cx + shape.r, shape.cy, shape.cx + shape.r + off.dx, shape.cy + off.dy, depthLineStyle);
        drawLine(sketchGroup, shape.cx - shape.r, shape.cy, shape.cx - shape.r + off.dx, shape.cy + off.dy, depthLineStyle);
      }
      sketchGroup.appendChild(makeSvgElement('circle', { cx: shape.cx, cy: shape.cy, r: shape.r, ...style }));
    }
    if (shape.type === 'pipe') {
      if (getShapeDepth(shape) > 0) {
        sketchGroup.appendChild(
          makeSvgElement('circle', { cx: shape.cx + off.dx, cy: shape.cy + off.dy, r: shape.rOuter, ...depthLineStyle }),
        );
        sketchGroup.appendChild(
          makeSvgElement('circle', {
            cx: shape.cx + off.dx,
            cy: shape.cy + off.dy,
            r: Math.max(shape.rOuter - shape.wall, 0.1),
            ...depthLineStyle,
          }),
        );
        drawLine(sketchGroup, shape.cx + shape.rOuter, shape.cy, shape.cx + shape.rOuter + off.dx, shape.cy + off.dy, depthLineStyle);
        drawLine(sketchGroup, shape.cx - shape.rOuter, shape.cy, shape.cx - shape.rOuter + off.dx, shape.cy + off.dy, depthLineStyle);
      }
      sketchGroup.appendChild(makeSvgElement('circle', { cx: shape.cx, cy: shape.cy, r: shape.rOuter, ...style }));
      const innerStyle = { ...style };
      if (innerStyle['stroke-dasharray']) delete innerStyle['stroke-dasharray'];
      sketchGroup.appendChild(
        makeSvgElement('circle', {
          cx: shape.cx,
          cy: shape.cy,
          r: Math.max(shape.rOuter - shape.wall, 0.1),
          ...innerStyle,
        }),
      );
    }
    renderSketchLabel(shape);

    if (index === selectedShapeIndex) {
      drawShapeSelectionOverlay(sketchGroup, shape);
    }

    if (activeTool === 'move' && index === selectedShapeIndex) {
      const base = getShapeBaseHandlePoint(shape);
      const handle = getDisplayHandlePoint(shape);
      drawLine(sketchGroup, base.x, base.y, handle.x, handle.y, { stroke: '#0ea5e9', 'stroke-width': 1.4, 'stroke-dasharray': '6 4' });
      sketchGroup.appendChild(
        makeSvgElement('circle', {
          cx: handle.x,
          cy: handle.y,
          r: 6,
          stroke: '#0284c7',
          fill: '#7dd3fc',
          'stroke-width': 1.5,
        }),
      );
    }
  }
  lineUnitsCache = computeLineUnits();
  drawLineUnitOverlay(sketchGroup, lineUnitsCache);
  for (const m of sketchMeasures) {
    const a = resolveAnchorRef(m.startRef);
    const b = resolveAnchorRef(m.endRef);
    if (!a || !b) continue;
    drawMeasurementLine(sketchGroup, a, b, `${roundMm(pointDistance(a, b))} mm`);
  }
  if (measureStartRef) {
    const p = resolveAnchorRef(measureStartRef);
    if (p) {
      drawCircle(sketchGroup, p.x, p.y, 5, { stroke: '#16a34a', fill: '#bbf7d0', 'stroke-width': 1.2 });
    }
  }
  if (!skipPanel) updateSketchDimensionsPanel();
  saveSketchState();
}

function drawHorizontalDimension(group, x1, x2, yBase, offset, label) {
  const y = yBase + offset;
  drawLine(group, x1, yBase, x1, y, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x2, yBase, x2, y, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x1, y, x2, y, { stroke: '#111', 'stroke-width': 1.3 });

  const arrow = 6;
  drawLine(group, x1, y, x1 + arrow, y - 3, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x1, y, x1 + arrow, y + 3, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x2, y, x2 - arrow, y - 3, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x2, y, x2 - arrow, y + 3, { stroke: '#111', 'stroke-width': 1.3 });

  drawText(group, (x1 + x2) / 2, y - 8, label, { 'text-anchor': 'middle' });
}

function drawVerticalDimension(group, y1, y2, xBase, offset, label) {
  const x = xBase + offset;
  drawLine(group, xBase, y1, x, y1, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, xBase, y2, x, y2, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x, y1, x, y2, { stroke: '#111', 'stroke-width': 1.3 });

  const arrow = 6;
  drawLine(group, x, y1, x - 3, y1 + arrow, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x, y1, x + 3, y1 + arrow, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x, y2, x - 3, y2 - arrow, { stroke: '#111', 'stroke-width': 1.3 });
  drawLine(group, x, y2, x + 3, y2 - arrow, { stroke: '#111', 'stroke-width': 1.3 });

  drawText(group, x + 8, (y1 + y2) / 2, label, {
    'dominant-baseline': 'middle',
    'text-anchor': 'start',
  });
}

function clearSvg() {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

function roundMm(value) {
  return Number(value.toFixed(2));
}

function applyZoom() {
  svg.style.transform = `scale(${zoom})`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function fitToView() {
  const pad = 24;
  const availableW = Math.max(previewWrap.clientWidth - pad, 280);
  const availableH = Math.max(previewWrap.clientHeight - pad, 220);
  zoom = Math.min(availableW / SVG_W, availableH / SVG_H);
  zoom = Math.max(0.25, Math.min(zoom, 3));
  applyZoom();
}

function parseModel() {
  const model = {
    drawingMode: drawingModeEl.value,
    partName: document.getElementById('partName').value.trim() || 'Uten navn',
    length: Number(document.getElementById('length').value),
    width: Number(document.getElementById('width').value),
    height: Number(document.getElementById('height').value),
    holeDiameter: Number(document.getElementById('holeDiameter').value),
    holeOffsetX: Number(document.getElementById('holeOffsetX').value),
    holeOffsetY: Number(document.getElementById('holeOffsetY').value),
    tolerance: document.getElementById('tolerance').value.trim() || '-',
    uLength: Number(document.getElementById('uLength').value),
    uHeight: Number(document.getElementById('uHeight').value),
    uInnerWidth: Number(document.getElementById('uInnerWidth').value),
    uThickness: Number(document.getElementById('uThickness').value),
    uRadius: Number(document.getElementById('uRadius').value),
    uMaterial: document.getElementById('uMaterial').value.trim() || 'Aluminium (Alu)',
  };

  if (model.drawingMode === 'block') {
    const required = ['length', 'width', 'height'];
    for (const key of required) {
      if (!Number.isFinite(model[key]) || model[key] <= 0) {
        throw new Error(`Ugyldig verdi for ${key}. Må være > 0 mm.`);
      }
    }

    if (model.holeDiameter < 0 || !Number.isFinite(model.holeDiameter)) {
      throw new Error('Hull-diameter må være 0 eller større.');
    }

    if (model.holeDiameter > 0) {
      const r = model.holeDiameter / 2;
      if (
        model.holeOffsetX - r < 0 ||
        model.holeOffsetX + r > model.length ||
        model.holeOffsetY - r < 0 ||
        model.holeOffsetY + r > model.width
      ) {
        throw new Error('Hull ligger utenfor emnet. Juster posisjon eller diameter.');
      }
    }
  }

  if (model.drawingMode === 'uprofile') {
    const requiredU = ['uLength', 'uHeight', 'uInnerWidth', 'uThickness'];
    for (const key of requiredU) {
      if (!Number.isFinite(model[key]) || model[key] <= 0) {
        throw new Error(`Ugyldig verdi for ${key}. Må være > 0 mm.`);
      }
    }
    if (!Number.isFinite(model.uRadius) || model.uRadius < 0) {
      throw new Error('Ugyldig innvendig radius.');
    }
  }

  return model;
}

function drawUSection(group, x, y, innerWidth, height, thickness, scale) {
  const iw = innerWidth * scale;
  const h = height * scale;
  const t = thickness * scale;
  const ow = iw + 2 * t;

  const points = [
    `${x},${y + h}`,
    `${x},${y}`,
    `${x + t},${y}`,
    `${x + t},${y + h - t}`,
    `${x + t + iw},${y + h - t}`,
    `${x + t + iw},${y}`,
    `${x + ow},${y}`,
    `${x + ow},${y + h}`,
  ].join(' ');

  group.appendChild(makeSvgElement('polyline', { points, fill: 'none', stroke: '#111827', 'stroke-width': 2 }));
  drawLine(group, x + t, y + h - t, x + t + iw, y + h - t, { stroke: '#111827', 'stroke-width': 2 });
}

function renderUProfileSheet(model) {
  clearSvg();
  const W = SVG_W;
  const H = SVG_H;
  const root = makeSvgElement('g', { stroke: '#111827', fill: 'none', 'stroke-width': 1.4 });
  svg.appendChild(root);

  drawRect(root, 20, 20, W - 40, H - 40, { stroke: '#111827' });

  drawText(root, 55, 85, 'JSO', { 'font-size': 74, 'font-weight': 800, fill: '#0d4a7f' });
  drawText(root, 170, 68, 'INDUSTRI', { 'font-size': 34, 'font-weight': 700, fill: '#555' });
  drawText(root, 170, 102, 'TEGNING', { 'font-size': 34, 'font-weight': 700, fill: '#555' });

  const outerWidth = model.uInnerWidth + 2 * model.uThickness;
  const topScale = Math.min(760 / model.uLength, 80 / outerWidth);
  const topX = 60;
  const topY = 560;
  const topLen = model.uLength * topScale;
  const topOw = outerWidth * topScale;
  const topT = model.uThickness * topScale;
  drawText(root, topX + 180, topY - 28, 'TOPPVISNING', { 'font-size': 24, 'font-weight': 700 });
  drawRect(root, topX, topY, topLen, topOw, {});
  drawRect(root, topX, topY + topT, topLen, model.uInnerWidth * topScale, { 'stroke-dasharray': '8 6' });
  drawHorizontalDimension(root, topX, topX + topLen, topY + topOw, 52, `${roundMm(model.uLength)} mm`);
  drawVerticalDimension(root, topY, topY + topOw, topX + topLen, 36, `${roundMm(outerWidth)} mm`);

  const sectionScale = 7;
  const secX = 900;
  const secY = 250;
  drawText(root, secX - 20, secY - 32, 'SNITT A-A', { 'font-size': 24, 'font-weight': 700 });
  drawUSection(root, secX, secY, model.uInnerWidth, model.uHeight, model.uThickness, sectionScale);
  const secOW = outerWidth * sectionScale;
  const secH = model.uHeight * sectionScale;
  drawHorizontalDimension(root, secX, secX + secOW, secY + secH, 42, `${roundMm(outerWidth)} mm`);
  drawVerticalDimension(root, secY, secY + secH, secX + secOW, 38, `${roundMm(model.uHeight)} mm`);
  drawHorizontalDimension(
    root,
    secX + model.uThickness * sectionScale,
    secX + (model.uThickness + model.uInnerWidth) * sectionScale,
    secY + secH,
    82,
    `${roundMm(model.uInnerWidth)} mm`,
  );
  drawText(root, secX + secOW + 28, secY + secH / 2, `${roundMm(model.uThickness)} mm`, { 'font-size': 18 });

  const iso = makeSvgElement('g', { stroke: '#4b5563', fill: '#d1d5db', 'stroke-width': 1.2 });
  root.appendChild(iso);
  const baseX = 330;
  const baseY = 250;
  const lenPx = Math.min(720, model.uLength * 0.65);
  const rise = 95;
  const owIso = Math.min(180, outerWidth * 7.5);
  const hIso = Math.min(190, model.uHeight * 5.1);
  const p1 = [baseX, baseY];
  const p2 = [baseX + lenPx, baseY - rise];
  const p3 = [baseX + lenPx, baseY - rise + hIso];
  const p4 = [baseX, baseY + hIso];
  iso.appendChild(makeSvgElement('polygon', { points: `${p1.join(',')} ${p2.join(',')} ${p3.join(',')} ${p4.join(',')}` }));
  iso.appendChild(
    makeSvgElement('polygon', {
      points: `${p1.join(',')} ${[p1[0] + owIso, p1[1] - owIso * 0.25].join(',')} ${[
        p2[0] + owIso,
        p2[1] - owIso * 0.25,
      ].join(',')} ${p2.join(',')}`,
      fill: '#9ca3af',
    }),
  );
  drawHorizontalDimension(root, p1[0], p2[0], p1[1], -40, `${roundMm(model.uLength)} mm`);
  drawVerticalDimension(root, p1[1], p4[1], p1[0], -42, `${roundMm(model.uHeight)} mm`);
  drawText(root, p1[0] + 90, p4[1] + 28, `${roundMm(model.uInnerWidth)} mm`, { 'font-size': 20, 'font-weight': 700 });
  drawText(root, p1[0] + owIso + 30, p1[1] + 16, `${roundMm(model.uThickness)} mm`, { 'font-size': 20, 'font-weight': 700 });
  drawText(root, p1[0] + owIso + 26, p1[1] + 54, `R${roundMm(model.uRadius)}`, { 'font-size': 18, 'font-weight': 700 });

  const boxX = 830;
  const boxY = 460;
  const boxW = 330;
  const boxH = 340;
  drawRect(root, boxX, boxY, boxW, boxH, {});
  const rows = [52, 42, 42, 42, 42, 42, 18];
  let y = boxY;
  for (const r of rows) {
    y += r;
    drawLine(root, boxX, y, boxX + boxW, y, {});
  }
  drawLine(root, boxX + 130, boxY + 52, boxX + 130, boxY + boxH, {});
  drawText(root, boxX + 24, boxY + 35, 'PRODUKT', { 'font-size': 16, 'font-weight': 700 });
  drawText(root, boxX + 145, boxY + 35, 'U-PROFIL ALUMINIUM', { 'font-size': 18, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 86, 'Lengde:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 90, `${roundMm(model.uLength)} mm`, { 'font-size': 17, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 128, 'Høyde:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 132, `${roundMm(model.uHeight)} mm`, { 'font-size': 17, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 170, 'Innvendig bredde:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 174, `${roundMm(model.uInnerWidth)} mm`, { 'font-size': 17, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 212, 'Godstykkelse:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 216, `${roundMm(model.uThickness)} mm`, { 'font-size': 17, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 254, 'Materiale:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 258, model.uMaterial, { 'font-size': 15, 'font-weight': 700 });
  drawText(root, boxX + 18, boxY + 296, 'Innv. radius:', { 'font-size': 13 });
  drawText(root, boxX + 185, boxY + 300, `R${roundMm(model.uRadius)}`, { 'font-size': 17, 'font-weight': 700 });

  drawText(root, boxX + 18, boxY + 320, 'Målestokk: 1:1', { 'font-size': 12 });
  drawText(root, boxX + 160, boxY + 320, `Dato: ${new Date().toISOString().slice(0, 10)}`, { 'font-size': 12 });
  drawText(root, boxX + 18, boxY + 338, `Toleranse: ${model.tolerance}`, { 'font-size': 12 });
  drawText(root, boxX + 210, boxY + 338, 'Enhet: mm', { 'font-size': 12 });

  ensureSketchLayer();
  renderSketchShapes();
}

function renderDrawing(model) {
  clearSvg();

  const W = SVG_W;
  const H = SVG_H;

  const root = makeSvgElement('g', {
    stroke: '#0b0b0b',
    fill: 'none',
    'stroke-width': 1.6,
  });
  svg.appendChild(root);

  drawRect(root, 20, 20, W - 40, H - 40, { stroke: '#0b0b0b' });

  const mainArea = {
    x: 40,
    y: 40,
    w: W - 80,
    h: H - 170,
  };
  drawRect(root, mainArea.x, mainArea.y, mainArea.w, mainArea.h, { stroke: '#9ca3af' });

  const frameGapX = 75;
  const frameGapY = 90;
  const usableW = mainArea.w - frameGapX * 2;
  const usableH = mainArea.h - frameGapY * 2;

  const scale = Math.min(
    usableW / (model.length + model.height + model.length),
    usableH / (model.width + model.height + model.width),
  );

  const projectedLength = model.length * scale;
  const projectedWidth = model.width * scale;
  const projectedHeight = model.height * scale;

  const topX = mainArea.x + frameGapX;
  const topY = mainArea.y + frameGapY;

  const frontX = topX;
  const frontY = topY + projectedWidth + 120;

  const sideX = topX + projectedLength + 180;
  const sideY = frontY;

  const views = makeSvgElement('g', {
    stroke: '#111827',
    fill: 'none',
    'stroke-width': 1.8,
  });
  root.appendChild(views);

  drawRect(views, topX, topY, projectedLength, projectedWidth, {});
  drawText(root, topX, topY - 12, 'TOPP', { 'font-size': 14 });

  if (model.holeDiameter > 0) {
    const holeCx = topX + model.holeOffsetX * scale;
    const holeCy = topY + model.holeOffsetY * scale;
    drawCircle(views, holeCx, holeCy, (model.holeDiameter / 2) * scale, {});
    drawLine(views, holeCx - 10, holeCy, holeCx + 10, holeCy, { 'stroke-width': 1.2 });
    drawLine(views, holeCx, holeCy - 10, holeCx, holeCy + 10, { 'stroke-width': 1.2 });
    drawText(root, holeCx + 14, holeCy - 8, `⌀${roundMm(model.holeDiameter)} mm`, { 'font-size': 14 });
  }

  drawRect(views, frontX, frontY, projectedLength, projectedHeight, {});
  drawText(root, frontX, frontY - 12, 'FRONT', { 'font-size': 14 });

  drawRect(views, sideX, sideY, projectedWidth, projectedHeight, {});
  drawText(root, sideX, sideY - 12, 'SIDE', { 'font-size': 14 });

  const dims = makeSvgElement('g', { stroke: '#111', fill: 'none', 'stroke-width': 1.3 });
  root.appendChild(dims);

  drawHorizontalDimension(dims, topX, topX + projectedLength, topY + projectedWidth, 30, `${roundMm(model.length)} mm`);
  drawVerticalDimension(dims, topY, topY + projectedWidth, topX, -34, `${roundMm(model.width)} mm`);
  drawVerticalDimension(
    dims,
    frontY,
    frontY + projectedHeight,
    frontX + projectedLength,
    30,
    `${roundMm(model.height)} mm`,
  );

  if (model.holeDiameter > 0) {
    const holeCx = topX + model.holeOffsetX * scale;
    const holeCy = topY + model.holeOffsetY * scale;
    drawHorizontalDimension(dims, topX, holeCx, topY, -28, `X=${roundMm(model.holeOffsetX)} mm`);
    drawVerticalDimension(dims, topY, holeCy, topX + projectedLength, 35, `Y=${roundMm(model.holeOffsetY)} mm`);
  }

  const titleY = H - 115;
  const titleH = 75;
  drawRect(root, 40, titleY, W - 80, titleH, { stroke: '#0b0b0b' });

  const cols = [260, 190, 170, 180, 1];
  let x = 40;
  for (let i = 0; i < cols.length - 1; i += 1) {
    x += cols[i];
    drawLine(root, x, titleY, x, titleY + titleH, { stroke: '#0b0b0b', 'stroke-width': 1.2 });
  }

  drawText(root, 50, titleY + 24, 'DEL', { 'font-size': 12 });
  drawText(root, 50, titleY + 52, model.partName, { 'font-size': 18, 'font-weight': 700 });

  drawText(root, 310, titleY + 24, 'MATERIAL', { 'font-size': 12 });
  drawText(root, 310, titleY + 52, 'Etter spesifikasjon', { 'font-size': 14 });

  drawText(root, 500, titleY + 24, 'SKALA', { 'font-size': 12 });
  drawText(root, 500, titleY + 52, `1:${roundMm(1 / scale)}`, { 'font-size': 14 });

  drawText(root, 670, titleY + 24, 'TOLERANSE', { 'font-size': 12 });
  drawText(root, 670, titleY + 52, model.tolerance, { 'font-size': 14 });

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  drawText(root, 860, titleY + 24, 'DATO', { 'font-size': 12 });
  drawText(root, 860, titleY + 52, date, { 'font-size': 14 });

  ensureSketchLayer();
  renderSketchShapes();
}

function renderBlankSheet() {
  clearSvg();
  const root = makeSvgElement('g', {
    stroke: '#9ca3af',
    fill: 'none',
    'stroke-width': 1.2,
  });
  svg.appendChild(root);
  drawRect(root, 20, 20, SVG_W - 40, SVG_H - 40, { stroke: '#cbd5e1' });
  if (showGrid) {
    const step = getGridStepMm();
    const grid = makeSvgElement('g', { stroke: '#e2e8f0', 'stroke-width': 0.9 });
    svg.appendChild(grid);
    for (let x = 20 + step; x < SVG_W - 20; x += step) {
      drawLine(grid, x, 20, x, SVG_H - 20, {});
    }
    for (let y = 20 + step; y < SVG_H - 20; y += step) {
      drawLine(grid, 20, y, SVG_W - 20, y, {});
    }
  }
  ensureSketchLayer();
  renderSketchShapes();
}

function updateDrawing(event) {
  if (event) event.preventDefault();
  try {
    // Always keep a clean sketch sheet; no auto-generated base drawing overlay.
    renderBlankSheet();
    statusEl.textContent = '';
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function shapeBounds(shape, includeDepth = false) {
  const off = includeDepth ? getDepthOffset(shape) : { dx: 0, dy: 0 };
  if (shape.type === 'line') {
    const xs = [shape.x1, shape.x2, shape.x1 + off.dx, shape.x2 + off.dx];
    const ys = [shape.y1, shape.y2, shape.y1 + off.dy, shape.y2 + off.dy];
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  if (shape.type === 'rect') {
    const x2 = shape.x + shape.width;
    const y2 = shape.y + shape.height;
    const xs = [shape.x, x2, shape.x + off.dx, x2 + off.dx];
    const ys = [shape.y, y2, shape.y + off.dy, y2 + off.dy];
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  if (shape.type === 'circle') {
    const xs = [shape.cx - shape.r, shape.cx + shape.r, shape.cx + off.dx - shape.r, shape.cx + off.dx + shape.r];
    const ys = [shape.cy - shape.r, shape.cy + shape.r, shape.cy + off.dy - shape.r, shape.cy + off.dy + shape.r];
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  const r = shape.rOuter;
  const xs = [shape.cx - r, shape.cx + r, shape.cx + off.dx - r, shape.cx + off.dx + r];
  const ys = [shape.cy - r, shape.cy + r, shape.cy + off.dy - r, shape.cy + off.dy + r];
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function combineBounds(shapes, includeDepth = false) {
  if (shapes.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const all = shapes.map((s) => shapeBounds(s, includeDepth));
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

function drawExportShape(group, shape, tx, ty, scale, withDepth, color) {
  const off = withDepth ? getDepthOffset(shape) : { dx: 0, dy: 0 };
  const ox = off.dx * scale;
  const oy = off.dy * scale;
  const stroke = color;

  const mapX = (x) => tx + x * scale;
  const mapY = (y) => ty + y * scale;

  if (shape.type === 'line') {
    if (withDepth && getShapeDepth(shape) > 0) {
      drawLine(group, mapX(shape.x1) + ox, mapY(shape.y1) + oy, mapX(shape.x2) + ox, mapY(shape.y2) + oy, { stroke, 'stroke-width': 1.2 });
      drawLine(group, mapX(shape.x1), mapY(shape.y1), mapX(shape.x1) + ox, mapY(shape.y1) + oy, { stroke, 'stroke-width': 1.1 });
      drawLine(group, mapX(shape.x2), mapY(shape.y2), mapX(shape.x2) + ox, mapY(shape.y2) + oy, { stroke, 'stroke-width': 1.1 });
    }
    drawLine(group, mapX(shape.x1), mapY(shape.y1), mapX(shape.x2), mapY(shape.y2), { stroke, 'stroke-width': 1.4 });
  }

  if (shape.type === 'rect') {
    if (withDepth && getShapeDepth(shape) > 0) {
      drawRect(group, mapX(shape.x) + ox, mapY(shape.y) + oy, shape.width * scale, shape.height * scale, { stroke, 'stroke-width': 1.2 });
      drawLine(group, mapX(shape.x), mapY(shape.y), mapX(shape.x) + ox, mapY(shape.y) + oy, { stroke, 'stroke-width': 1.1 });
      drawLine(
        group,
        mapX(shape.x + shape.width),
        mapY(shape.y),
        mapX(shape.x + shape.width) + ox,
        mapY(shape.y) + oy,
        { stroke, 'stroke-width': 1.1 },
      );
      drawLine(
        group,
        mapX(shape.x + shape.width),
        mapY(shape.y + shape.height),
        mapX(shape.x + shape.width) + ox,
        mapY(shape.y + shape.height) + oy,
        { stroke, 'stroke-width': 1.1 },
      );
    }
    drawRect(group, mapX(shape.x), mapY(shape.y), shape.width * scale, shape.height * scale, { stroke, 'stroke-width': 1.4 });
  }

  if (shape.type === 'circle') {
    if (withDepth && getShapeDepth(shape) > 0) {
      drawCircle(group, mapX(shape.cx) + ox, mapY(shape.cy) + oy, shape.r * scale, { stroke, 'stroke-width': 1.2 });
      drawLine(group, mapX(shape.cx + shape.r), mapY(shape.cy), mapX(shape.cx + shape.r) + ox, mapY(shape.cy) + oy, { stroke, 'stroke-width': 1.1 });
    }
    drawCircle(group, mapX(shape.cx), mapY(shape.cy), shape.r * scale, { stroke, 'stroke-width': 1.4 });
  }

  if (shape.type === 'pipe') {
    const inner = Math.max(shape.rOuter - shape.wall, 0.1);
    if (withDepth && getShapeDepth(shape) > 0) {
      drawCircle(group, mapX(shape.cx) + ox, mapY(shape.cy) + oy, shape.rOuter * scale, { stroke, 'stroke-width': 1.2 });
      drawCircle(group, mapX(shape.cx) + ox, mapY(shape.cy) + oy, inner * scale, { stroke, 'stroke-width': 1.1 });
      drawLine(group, mapX(shape.cx + shape.rOuter), mapY(shape.cy), mapX(shape.cx + shape.rOuter) + ox, mapY(shape.cy) + oy, {
        stroke,
        'stroke-width': 1.1,
      });
    }
    drawCircle(group, mapX(shape.cx), mapY(shape.cy), shape.rOuter * scale, { stroke, 'stroke-width': 1.4 });
    drawCircle(group, mapX(shape.cx), mapY(shape.cy), inner * scale, { stroke, 'stroke-width': 1.2 });
  }
}

function shapeMeasureText(shape) {
  if (shape.type === 'line') return `L=${roundMm(shapeLength(shape))}mm, D=${roundMm(getShapeDepth(shape))}mm`;
  if (shape.type === 'rect') return `B=${roundMm(shape.width)} H=${roundMm(shape.height)} D=${roundMm(getShapeDepth(shape))}`;
  if (shape.type === 'circle') return `Ø=${roundMm(shape.r * 2)} D=${roundMm(getShapeDepth(shape))}`;
  return `Øy=${roundMm(shape.rOuter * 2)} t=${roundMm(shape.wall)} D=${roundMm(getShapeDepth(shape))}`;
}

function drawPdfLineAngles(group, units, tx, ty, scale, color = '#0f766e') {
  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    for (let j = 0; j < unit.joints.length; j += 1) {
      const joint = unit.joints[j];
      const x = tx + joint.point.x * scale;
      const y = ty + joint.point.y * scale;
      drawCircle(group, x, y, 3.5, { stroke: color, fill: '#dcfce7', 'stroke-width': 1 });
      drawText(group, x + 8, y - 7, `${roundMm(joint.angle)}°`, { 'font-size': 12, 'font-weight': 700, fill: color });
    }
  }
}

function buildPdfSheetSvg() {
  const sheetW = 1600;
  const sheetH = 1120;
  const exportSvg = makeSvgElement('svg', {
    xmlns: NS,
    viewBox: `0 0 ${sheetW} ${sheetH}`,
    width: sheetW,
    height: sheetH,
  });

  const defs = makeSvgElement('defs');
  const paperGrad = makeSvgElement('linearGradient', { id: 'paperGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  paperGrad.appendChild(makeSvgElement('stop', { offset: '0%', 'stop-color': '#f8fafc' }));
  paperGrad.appendChild(makeSvgElement('stop', { offset: '100%', 'stop-color': '#eef2f7' }));
  defs.appendChild(paperGrad);
  const steelGrad = makeSvgElement('linearGradient', { id: 'steelGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
  steelGrad.appendChild(makeSvgElement('stop', { offset: '0%', 'stop-color': '#cfd4db' }));
  steelGrad.appendChild(makeSvgElement('stop', { offset: '45%', 'stop-color': '#667085' }));
  steelGrad.appendChild(makeSvgElement('stop', { offset: '100%', 'stop-color': '#e7ebf0' }));
  defs.appendChild(steelGrad);
  const shadow = makeSvgElement('filter', { id: 'cardShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
  shadow.appendChild(makeSvgElement('feDropShadow', { dx: '0', dy: '1', stdDeviation: '1.4', 'flood-color': '#475569', 'flood-opacity': '0.22' }));
  defs.appendChild(shadow);
  exportSvg.appendChild(defs);

  drawRect(exportSvg, 18, 18, sheetW - 36, sheetH - 36, { stroke: '#64748b', fill: 'url(#paperGrad)', 'stroke-width': 1.3 });
  drawRect(exportSvg, 30, 30, sheetW - 60, sheetH - 60, { stroke: '#cbd5e1', fill: 'none', 'stroke-width': 1 });

  drawText(exportSvg, 58, 86, 'JSO', { 'font-size': 74, 'font-weight': 800, fill: '#0d4a7f' });
  drawText(exportSvg, 245, 72, 'INDUSTRI', { 'font-size': 30, 'font-weight': 700, fill: '#4b5563' });
  drawText(exportSvg, 245, 104, 'TEGNING', { 'font-size': 30, 'font-weight': 700, fill: '#4b5563' });
  drawLine(exportSvg, 58, 112, 430, 112, { stroke: '#0d4a7f', 'stroke-width': 2.2 });

  const main3d = { x: 50, y: 140, w: 1085, h: 510 };
  const top2d = { x: 50, y: 675, w: 700, h: 310 };
  const cut2d = { x: 770, y: 675, w: 365, h: 310 };
  const info = { x: 1155, y: 140, w: 395, h: 845 };

  function panel(title, box) {
    drawRect(exportSvg, box.x, box.y, box.w, box.h, { stroke: '#1f2937', fill: '#ffffff', 'stroke-width': 1.2, filter: 'url(#cardShadow)' });
    drawText(exportSvg, box.x + 16, box.y + 34, title, { 'font-size': 28, 'font-weight': 700, fill: '#111827' });
    drawLine(exportSvg, box.x + 14, box.y + 44, box.x + Math.min(220, box.w - 14), box.y + 44, { stroke: '#1f2937', 'stroke-width': 1.2 });
  }
  panel('3D-DETALJ', main3d);
  panel('TOPPVISNING', top2d);
  panel('SNITT / MÅL', cut2d);
  drawRect(exportSvg, info.x, info.y, info.w, info.h, { stroke: '#1f2937', fill: '#ffffff', 'stroke-width': 1.2, filter: 'url(#cardShadow)' });

  const b3 = combineBounds(sketchShapes, true);
  const b2 = combineBounds(sketchShapes, false);
  const scale3 = Math.min((main3d.w - 78) / Math.max(1, b3.maxX - b3.minX), (main3d.h - 110) / Math.max(1, b3.maxY - b3.minY));
  const scale2 = Math.min((top2d.w - 82) / Math.max(1, b2.maxX - b2.minX), (top2d.h - 104) / Math.max(1, b2.maxY - b2.minY));
  const tx3 = main3d.x + 38 - b3.minX * scale3;
  const ty3 = main3d.y + 66 - b3.minY * scale3;
  const tx2 = top2d.x + 40 - b2.minX * scale2;
  const ty2 = top2d.y + 68 - b2.minY * scale2;
  const txCut = cut2d.x + 40 - b2.minX * scale2 * 0.8;
  const tyCut = cut2d.y + 76 - b2.minY * scale2 * 0.8;

  const g3 = makeSvgElement('g', {});
  exportSvg.appendChild(g3);
  const g2 = makeSvgElement('g', {});
  exportSvg.appendChild(g2);
  const gCut = makeSvgElement('g', {});
  exportSvg.appendChild(gCut);
  const pdfUnits = computeLineUnits();

  for (const shape of sketchShapes) {
    drawExportShape(g3, shape, tx3, ty3, scale3, true, '#4b5563');
    drawExportShape(g2, shape, tx2, ty2, scale2, false, '#0f172a');
    drawExportShape(gCut, shape, txCut, tyCut, scale2 * 0.8, false, '#0f172a');
  }

  for (const m of sketchMeasures) {
    const a = resolveAnchorRef(m.startRef);
    const b = resolveAnchorRef(m.endRef);
    if (!a || !b) continue;
    const m2a = { x: tx2 + a.x * scale2, y: ty2 + a.y * scale2 };
    const m2b = { x: tx2 + b.x * scale2, y: ty2 + b.y * scale2 };
    drawMeasurementLine(g2, m2a, m2b, `${roundMm(pointDistance(a, b))} mm`);
    const mCa = { x: txCut + a.x * scale2 * 0.8, y: tyCut + a.y * scale2 * 0.8 };
    const mCb = { x: txCut + b.x * scale2 * 0.8, y: tyCut + b.y * scale2 * 0.8 };
    drawMeasurementLine(gCut, mCa, mCb, `${roundMm(pointDistance(a, b))} mm`);
  }
  drawPdfLineAngles(g2, pdfUnits, tx2, ty2, scale2);
  drawPdfLineAngles(gCut, pdfUnits, txCut, tyCut, scale2 * 0.8, '#0369a1');

  drawText(exportSvg, info.x + 18, info.y + 48, 'JSO', { 'font-size': 46, 'font-weight': 800, fill: '#0d4a7f' });
  drawText(exportSvg, info.x + 165, info.y + 36, 'INDUSTRI', { 'font-size': 24, 'font-weight': 700, fill: '#4b5563' });
  drawText(exportSvg, info.x + 165, info.y + 62, 'TEGNING', { 'font-size': 24, 'font-weight': 700, fill: '#4b5563' });
  drawLine(exportSvg, info.x + 16, info.y + 68, info.x + info.w - 16, info.y + 68, { stroke: '#1f2937', 'stroke-width': 1.2 });

  const metaTop = info.y + 86;
  const rowH = 42;
  const colX = info.x + 180;
  const projectMeta = getProjectMeta();
  const metaRows = [
    ['Produkt', 'Fri tegning'],
    ['Navn', projectMeta.customerName || '-'],
    ['Prosjekt', projectMeta.projectName || '-'],
    ['Ordre nr.', projectMeta.orderNo || '-'],
    ['Dato', new Date().toISOString().slice(0, 10)],
    ['Enhet', 'mm'],
    ['Målestokk', 'Auto'],
    ['Antall figurer', String(sketchShapes.length)],
  ];
  for (let i = 0; i < metaRows.length; i += 1) {
    const y = metaTop + i * rowH;
    drawRect(exportSvg, info.x + 12, y, info.w - 24, rowH, { stroke: '#cbd5e1', fill: i % 2 === 0 ? '#f8fafc' : '#ffffff', 'stroke-width': 1 });
    drawLine(exportSvg, colX, y, colX, y + rowH, { stroke: '#cbd5e1', 'stroke-width': 1 });
    drawText(exportSvg, info.x + 24, y + 27, metaRows[i][0], { 'font-size': 18, 'font-weight': 600, fill: '#334155' });
    drawText(exportSvg, colX + 14, y + 27, metaRows[i][1], { 'font-size': 20, 'font-weight': 700, fill: '#111827' });
  }

  const tableTop = metaTop + metaRows.length * rowH + 26;
  drawText(exportSvg, info.x + 18, tableTop, 'FIGURTABELL', { 'font-size': 20, 'font-weight': 700 });
  drawLine(exportSvg, info.x + 16, tableTop + 8, info.x + info.w - 16, tableTop + 8, { stroke: '#1f2937', 'stroke-width': 1.1 });
  drawText(exportSvg, info.x + 20, tableTop + 34, 'Figur', { 'font-size': 15, 'font-weight': 700 });
  drawText(exportSvg, info.x + 120, tableTop + 34, 'Mål', { 'font-size': 15, 'font-weight': 700 });
  drawText(exportSvg, info.x + 330, tableTop + 34, 'Mat', { 'font-size': 15, 'font-weight': 700 });

  let y = tableTop + 56;
  for (let i = 0; i < sketchShapes.length; i += 1) {
    if (y > info.y + info.h - 210) break;
    const shape = sketchShapes[i];
    drawRect(exportSvg, info.x + 12, y - 22, info.w - 24, 28, { stroke: '#e2e8f0', fill: i % 2 === 0 ? '#ffffff' : '#f8fafc', 'stroke-width': 0.8 });
    drawText(exportSvg, info.x + 20, y, `${shape.label} (${shape.type})`, { 'font-size': 14 });
    drawText(exportSvg, info.x + 120, y, shapeMeasureText(shape), { 'font-size': 13 });
    drawText(exportSvg, info.x + 330, y, (shape.material || 'stal').toUpperCase(), { 'font-size': 13 });
    y += 30;
  }

  y += 8;
  drawText(exportSvg, info.x + 18, y, 'VINKLER', { 'font-size': 16, 'font-weight': 700 });
  y += 20;
  for (let unitIndex = 0; unitIndex < pdfUnits.length; unitIndex += 1) {
    const unit = pdfUnits[unitIndex];
    for (let j = 0; j < unit.joints.length; j += 1) {
      if (y > info.y + info.h - 90) break;
      drawText(exportSvg, info.x + 20, y, `Enhet ${unitIndex + 1}, punkt ${j + 1}: ${roundMm(unit.joints[j].angle)}°`, {
        'font-size': 13,
        fill: '#0f172a',
      });
      y += 17;
    }
  }
  drawLine(exportSvg, info.x + 16, info.y + info.h - 66, info.x + info.w - 16, info.y + info.h - 66, { stroke: '#cbd5e1', 'stroke-width': 1 });
  drawText(exportSvg, info.x + 20, info.y + info.h - 40, 'Tegning: Arbeidsark', { 'font-size': 14, fill: '#334155' });
  drawText(exportSvg, info.x + 220, info.y + info.h - 40, 'Standard: ISO 2768-m', { 'font-size': 14, fill: '#334155' });

  return exportSvg;
}

function downloadPdf() {
  const sheetSvg = buildPdfSheetSvg();
  const svgMarkup = new XMLSerializer().serializeToString(sheetSvg);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    statusEl.textContent = 'Kunne ikke åpne PDF-vindu. Tillat popup og prøv igjen.';
    return;
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Arbeidstegning PDF</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { margin: 0; background: #fff; }
  svg { width: 100%; height: auto; display: block; }
</style></head>
<body>${svgMarkup}
<script>
  window.onload = () => { window.print(); };
</script>
</body></html>`;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

async function saveAsImage() {
  try {
    const sheetSvg = buildPdfSheetSvg();
    const svgMarkup = new XMLSerializer().serializeToString(sheetSvg);
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1120;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        statusEl.textContent = 'Klarte ikke lagre bilde.';
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) {
          statusEl.textContent = 'Klarte ikke lagre bilde.';
          return;
        }
        const date = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `arbeidstegning-${date}.png`);
        statusEl.textContent = 'Bilde lagret.';
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      statusEl.textContent = 'Klarte ikke lage bilde.';
    };
    image.src = svgUrl;
  } catch (error) {
    statusEl.textContent = 'Klarte ikke lage bilde.';
  }
}

async function sharePdf() {
  try {
    downloadPdf();
    statusEl.textContent = 'PDF-vindu åpnet. Velg Lagre/del som PDF i utskriftsdialog.';
  } catch (error) {
    statusEl.textContent = 'Klarte ikke dele PDF. Prøv igjen.';
  }
}

function buildProjectPayload() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sketchShapes,
    sketchMeasures,
    nextShapeIndex,
    selectedShapeIndex,
    lineChainPoint,
    showGrid,
    snapToGrid,
    gridStep: gridStepEl?.value || '10',
    snapAngleStep: snapAngleStepEl?.value || '15',
    project: getProjectMeta(),
    form: getFormState(),
  };
}

function applyProjectPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Ugyldig prosjektfil');
  if (!Array.isArray(payload.sketchShapes) || !Array.isArray(payload.sketchMeasures)) {
    throw new Error('Prosjektfil mangler skissedata');
  }

  sketchShapes.length = 0;
  sketchShapes.push(...payload.sketchShapes);
  sketchMeasures.length = 0;
  sketchMeasures.push(...payload.sketchMeasures);
  nextShapeIndex = Number.isInteger(payload.nextShapeIndex) && payload.nextShapeIndex >= 0 ? payload.nextShapeIndex : sketchShapes.length;
  selectedShapeIndex = Number.isInteger(payload.selectedShapeIndex) ? payload.selectedShapeIndex : -1;
  lineChainPoint =
    payload.lineChainPoint && Number.isFinite(payload.lineChainPoint.x) && Number.isFinite(payload.lineChainPoint.y)
      ? { x: payload.lineChainPoint.x, y: payload.lineChainPoint.y }
      : null;
  showGrid = typeof payload.showGrid === 'boolean' ? payload.showGrid : showGrid;
  snapToGrid = typeof payload.snapToGrid === 'boolean' ? payload.snapToGrid : snapToGrid;
  if (gridStepEl && ['5', '10', '20'].includes(String(payload.gridStep))) gridStepEl.value = String(payload.gridStep);
  if (snapAngleStepEl && ['off', '15', '30', '45', '90'].includes(String(payload.snapAngleStep))) {
    snapAngleStepEl.value = String(payload.snapAngleStep);
  }
  if (payload.project && typeof payload.project === 'object') {
    if (customerNameEl) customerNameEl.value = payload.project.customerName || '';
    if (projectNameEl) projectNameEl.value = payload.project.projectName || '';
    if (orderNoEl) orderNoEl.value = payload.project.orderNo || '';
  }
  applyFormState(payload.form);
  measureStartRef = null;
  measureStartPoint = null;
  updateGridControls();
  updateDrawing();
  renderSketchShapes();
  fitToView();
  saveSketchState();
}

function saveProjectToFile() {
  const payload = buildProjectPayload();
  const json = JSON.stringify(payload, null, 2);
  const projectName = (projectNameEl?.value || 'prosjekt').trim().replace(/[^a-z0-9_-]+/gi, '-');
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${projectName || 'prosjekt'}-${stamp}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = `Prosjekt lagret: ${fileName}`;
}

function getDefaultCloudProjectKey() {
  const project = (projectNameEl?.value || '').trim();
  const orderNo = (orderNoEl?.value || '').trim();
  const customer = (customerNameEl?.value || '').trim();
  return orderNo || project || customer || 'prosjekt-1';
}

function askCloudProjectKey(actionLabel) {
  const suggestion = getDefaultCloudProjectKey();
  const raw = window.prompt(`${actionLabel} - prosjektnøkkel:`, suggestion);
  if (raw === null) return null;
  const key = raw.trim();
  return key || null;
}

function supabaseMissingTableHint() {
  return (
    'Mangler database-tabell. Kjør SQL i Supabase:\n' +
    `create table if not exists public.${SUPABASE_TABLE} (\n` +
    '  project_key text primary key,\n' +
    '  payload jsonb not null,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');'
  );
}

async function saveProjectToCloud() {
  if (!supabaseClient) {
    statusEl.textContent = 'Supabase er ikke tilgjengelig i denne nettleseren.';
    return;
  }
  const projectKey = askCloudProjectKey('Lagre til sky');
  if (!projectKey) return;

  const payload = buildProjectPayload();
  const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(
    {
      project_key: projectKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_key' },
  );

  if (error) {
    if (error.code === '42P01') {
      statusEl.textContent = supabaseMissingTableHint();
      return;
    }
    statusEl.textContent = `Sky-lagring feilet: ${error.message || 'ukjent feil'}`;
    return;
  }

  statusEl.textContent = `Lagret i sky: ${projectKey}`;
}

async function loadProjectFromCloud() {
  if (!supabaseClient) {
    statusEl.textContent = 'Supabase er ikke tilgjengelig i denne nettleseren.';
    return;
  }
  const projectKey = askCloudProjectKey('Hent fra sky');
  if (!projectKey) return;

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('payload')
    .eq('project_key', projectKey)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      statusEl.textContent = supabaseMissingTableHint();
      return;
    }
    statusEl.textContent = `Sky-henting feilet: ${error.message || 'ukjent feil'}`;
    return;
  }

  if (!data?.payload) {
    statusEl.textContent = `Fant ikke prosjekt i sky: ${projectKey}`;
    return;
  }

  try {
    applyProjectPayload(data.payload);
    statusEl.textContent = `Hentet fra sky: ${projectKey}`;
  } catch (err) {
    statusEl.textContent = 'Data i sky kunne ikke leses av appen.';
  }
}

async function logoutCurrentUser() {
  try {
    await window.AppAuth?.signOut?.();
  } finally {
    const loginUrl = window.AppAuth?.buildLoginUrl?.() || '/login/';
    window.location.replace(loginUrl);
  }
}

function openProjectFilePicker() {
  if (!projectFileInputEl) return;
  projectFileInputEl.value = '';
  projectFileInputEl.click();
}

async function onProjectFileChosen(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    applyProjectPayload(payload);
    statusEl.textContent = `Prosjekt åpnet: ${file.name}`;
  } catch (error) {
    statusEl.textContent = 'Klarte ikke åpne prosjektfil. Sjekk at det er en gyldig JSON fra appen.';
  }
}

function onZoomIn() {
  zoom = Math.min(zoom + 0.1, 3);
  applyZoom();
}

function onZoomOut() {
  zoom = Math.max(zoom - 0.1, 0.25);
  applyZoom();
}

function setActiveTool(tool) {
  activeTool = tool;
  if (tool !== 'measure') {
    measureStartRef = null;
    measureStartPoint = null;
  }
  if (tool !== 'line') lineChainPoint = null;
  toolLineBtn.classList.toggle('active', tool === 'line');
  toolRectBtn.classList.toggle('active', tool === 'rect');
  toolCircleBtn.classList.toggle('active', tool === 'circle');
  toolPipeBtn.classList.toggle('active', tool === 'pipe');
  toolMoveBtn.classList.toggle('active', tool === 'move');
  toolExtrudeBtn.classList.toggle('active', tool === 'extrude');
  toolMeasureBtn.classList.toggle('active', tool === 'measure');
  const toolLabel = {
    line: 'Strek',
    rect: 'Firkant',
    circle: 'Sirkel',
    pipe: 'Rør',
    move: 'Flytt',
    extrude: 'Dra ut 3D',
    measure: 'Målelinje',
  }[tool];
  if (toolLabel) statusEl.textContent = `Verktøy: ${toolLabel}`;
  renderSketchShapes();
}

function pointerToSvgPoint(event) {
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * SVG_W;
  const y = ((event.clientY - rect.top) / rect.height) * SVG_H;
  return {
    x: Math.max(0, Math.min(SVG_W, x)),
    y: Math.max(0, Math.min(SVG_H, y)),
  };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function isPointInsideShape(shape, point) {
  const tol = 10;
  if (shape.type === 'line') {
    return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }) <= tol;
  }
  if (shape.type === 'rect') {
    return point.x >= shape.x - tol && point.x <= shape.x + shape.width + tol && point.y >= shape.y - tol && point.y <= shape.y + shape.height + tol;
  }
  if (shape.type === 'circle') {
    return Math.hypot(point.x - shape.cx, point.y - shape.cy) <= shape.r + tol;
  }
  if (shape.type === 'pipe') {
    const d = Math.hypot(point.x - shape.cx, point.y - shape.cy);
    return d <= shape.rOuter + tol && d >= Math.max(shape.rOuter - shape.wall - tol, 0);
  }
  return false;
}

function findShapeIndexAtPoint(point) {
  for (let i = sketchShapes.length - 1; i >= 0; i -= 1) {
    if (isPointInsideShape(sketchShapes[i], point)) return i;
  }
  return -1;
}

function findEditableShapeIndexAtPoint(point) {
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = sketchShapes.length - 1; i >= 0; i -= 1) {
    const shape = sketchShapes[i];
    let score = Number.POSITIVE_INFINITY;

    if (shape.type === 'line') {
      // Larger hitbox so the full line is easy to double click.
      score = distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
      if (score > 24) continue;
    } else if (shape.type === 'rect') {
      const xMin = shape.x - 16;
      const xMax = shape.x + shape.width + 16;
      const yMin = shape.y - 16;
      const yMax = shape.y + shape.height + 16;
      if (point.x < xMin || point.x > xMax || point.y < yMin || point.y > yMax) continue;
      score = 0;
    } else if (shape.type === 'circle') {
      const d = Math.hypot(point.x - shape.cx, point.y - shape.cy);
      if (d > shape.r + 16) continue;
      score = Math.abs(d - shape.r);
    } else if (shape.type === 'pipe') {
      const d = Math.hypot(point.x - shape.cx, point.y - shape.cy);
      if (d > shape.rOuter + 16) continue;
      score = Math.abs(d - shape.rOuter);
    }

    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function moveShape(shape, dx, dy) {
  if (shape.type === 'line') {
    shape.x1 += dx;
    shape.y1 += dy;
    shape.x2 += dx;
    shape.y2 += dy;
  }
  if (shape.type === 'rect') {
    shape.x += dx;
    shape.y += dy;
  }
  if (shape.type === 'circle' || shape.type === 'pipe') {
    shape.cx += dx;
    shape.cy += dy;
  }
}

function editShapeViaDoubleClick(shapeIndex) {
  const shape = sketchShapes[shapeIndex];
  if (!shape) return false;

  if (shape.type === 'line') {
    const currentMm = roundMm(shapeLength(shape));
    const raw = window.prompt(`Ny lengde for ${shape.label} i mm:`, String(currentMm));
    if (raw === null) return false;
    const mm = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(mm) || mm <= 0) return false;
    applyShapeDimensionChange(shapeIndex, 'length', mm);
    return true;
  }

  if (shape.type === 'rect') {
    const raw = window.prompt(
      `Ny bredde og høyde for ${shape.label} i mm (eksempel: 120 80):`,
      `${roundMm(shape.width)} ${roundMm(shape.height)}`,
    );
    if (raw === null) return false;
    const numbers = String(raw).match(/-?\d+(?:[.,]\d+)?/g) || [];
    const widthMm = Number((numbers[0] || '').replace(',', '.'));
    const heightMm = Number((numbers[1] || '').replace(',', '.'));
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) return false;
    applyShapeDimensionChange(shapeIndex, 'width', widthMm);
    applyShapeDimensionChange(shapeIndex, 'height', heightMm);
    return true;
  }

  if (shape.type === 'circle') {
    const currentMm = roundMm(shape.r * 2);
    const raw = window.prompt(`Ny diameter for ${shape.label} i mm:`, String(currentMm));
    if (raw === null) return false;
    const mm = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(mm) || mm <= 0) return false;
    applyShapeDimensionChange(shapeIndex, 'diameter', mm);
    return true;
  }

  if (shape.type === 'pipe') {
    const currentMm = roundMm(shape.rOuter * 2);
    const raw = window.prompt(`Ny ytre diameter for ${shape.label} i mm:`, String(currentMm));
    if (raw === null) return false;
    const mm = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(mm) || mm <= 0) return false;
    applyShapeDimensionChange(shapeIndex, 'outerDiameter', mm);
    return true;
  }

  return false;
}

function editMeasureViaDoubleClick(measureIndex) {
  const measure = sketchMeasures[measureIndex];
  if (!measure) return false;
  const a = resolveAnchorRef(measure.startRef);
  const b = resolveAnchorRef(measure.endRef);
  if (!a || !b) return false;
  const currentMm = roundMm(pointDistance(a, b));
  const raw = window.prompt('Ny målestrek i mm:', String(currentMm));
  if (raw === null) return false;
  const mm = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(mm) || mm <= 0) return false;
  updateMeasureLengthByMm(measure, mm);
  return true;
}

function onSvgDoubleClick(event) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault();
  if (!canUseDrawingBoard(event)) return;
  const point = pointerToSvgPoint(event);
  const measureIndex = findMeasureIndexAtPoint(point);
  if (measureIndex >= 0) {
    if (editMeasureViaDoubleClick(measureIndex)) renderSketchShapes();
    return;
  }
  const shapeIndex = findEditableShapeIndexAtPoint(point);
  if (shapeIndex >= 0 && editShapeViaDoubleClick(shapeIndex)) {
    renderSketchShapes();
  }
}

function buildPreviewShape(start, current) {
  if (activeTool === 'move' || activeTool === 'extrude' || activeTool === 'measure') return null;
  if (activeTool === 'line') {
    const snapped = resolveLineEndPoint(start, current);
    return makeSvgElement('line', {
      x1: start.x,
      y1: start.y,
      x2: snapped.x,
      y2: snapped.y,
      stroke: '#dc2626',
      'stroke-width': 2,
      'stroke-dasharray': '6 4',
    });
  }

  if (activeTool === 'rect') {
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    return makeSvgElement('rect', {
      x,
      y,
      width,
      height,
      stroke: '#dc2626',
      fill: 'none',
      'stroke-width': 2,
      'stroke-dasharray': '6 4',
    });
  }

  if (activeTool === 'pipe') {
    const r = Math.hypot(current.x - start.x, current.y - start.y);
    const g = makeSvgElement('g', {});
    g.appendChild(
      makeSvgElement('circle', {
        cx: start.x,
        cy: start.y,
        r,
        stroke: '#dc2626',
        fill: 'none',
        'stroke-width': 2,
        'stroke-dasharray': '6 4',
      }),
    );
    g.appendChild(
      makeSvgElement('circle', {
        cx: start.x,
        cy: start.y,
        r: Math.max(r - Math.max(r * 0.2, 2), 0.5),
        stroke: '#dc2626',
        fill: 'none',
        'stroke-width': 2,
        'stroke-dasharray': '6 4',
      }),
    );
    return g;
  }

  const r = Math.hypot(current.x - start.x, current.y - start.y);
  return makeSvgElement('circle', {
    cx: start.x,
    cy: start.y,
    r,
    stroke: '#dc2626',
    fill: 'none',
    'stroke-width': 2,
    'stroke-dasharray': '6 4',
  });
}

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault();
  const requiresBoardForTool = ['line', 'rect', 'circle', 'pipe', 'measure'].includes(activeTool);
  if (requiresBoardForTool && !canUseDrawingBoard(event)) {
    statusEl.textContent = 'Trykk "Tegnebrett: AV/PÅ" først for å tegne.';
    return;
  }
  const rawPoint = pointerToSvgPoint(event);
  const isDrawTool = ['line', 'rect', 'circle', 'pipe'].includes(activeTool);
  const point = isDrawTool ? applyGridSnap(rawPoint) : rawPoint;
  const hitShapeIndex = findShapeIndexAtPoint(point);
  if (hitShapeIndex >= 0) {
    selectedShapeIndex = hitShapeIndex;
  } else if (activeTool !== 'move' && activeTool !== 'extrude') {
    selectedShapeIndex = -1;
  }
  if (activeTool === 'measure') {
    const ref = findNearestAnchorRef(point);
    if (!measureStartRef) {
      measureStartRef = ref;
      measureStartPoint = point;
    } else {
      const pair = normalizeMeasurePair(measureStartRef, ref, measureStartPoint, point);
      sketchMeasures.push({ startRef: pair.startRef, endRef: pair.endRef });
      measureStartRef = null;
      measureStartPoint = null;
    }
    renderSketchShapes();
    return;
  }

  if (activeTool === 'extrude') {
    const hitIndex = findShapeIndexAtPoint(point);
    if (hitIndex >= 0) {
      selectedShapeIndex = hitIndex;
      isExtruding = true;
      extrudeStartPoint = point;
      extrudeStartDepth = getShapeDepth(sketchShapes[hitIndex]);
      renderSketchShapes();
    } else {
      selectedShapeIndex = -1;
      renderSketchShapes();
    }
    return;
  }

  if (activeTool === 'move') {
    const hitIndex = findShapeIndexAtPoint(point);
    if (hitIndex >= 0) {
      selectedShapeIndex = hitIndex;
      renderSketchShapes();
      movingShapeIndex = hitIndex;
      isMoving = true;
      lastMovePoint = point;
    } else {
      selectedShapeIndex = -1;
      renderSketchShapes();
    }
    return;
  }

  isDrawing = true;
  startRawPoint = rawPoint;
  startPoint = activeTool === 'line' ? resolveLineStartPoint(point) : point;
  if (previewElement && sketchGroup && sketchGroup.contains(previewElement)) {
    sketchGroup.removeChild(previewElement);
  }
  previewElement = null;
}

function onPointerMove(event) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault();
  if (isExtruding && selectedShapeIndex >= 0 && selectedShapeIndex < sketchShapes.length) {
    const shape = sketchShapes[selectedShapeIndex];
    const point = pointerToSvgPoint(event);
    if (activeTool === 'extrude' && extrudeStartPoint) {
      const delta = projectToExtrudeAxis(extrudeStartPoint, point);
      shape.depth = Math.max(0, extrudeStartDepth + delta);
    } else {
      const baseHandle = getShapeBaseHandlePoint(shape);
      shape.depth = Math.max(0, projectToExtrudeAxis(baseHandle, point));
    }
    renderSketchShapes();
    return;
  }

  if (isMoving && movingShapeIndex >= 0 && lastMovePoint) {
    const current = pointerToSvgPoint(event);
    const dx = current.x - lastMovePoint.x;
    const dy = current.y - lastMovePoint.y;
    moveShape(sketchShapes[movingShapeIndex], dx, dy);
    lastMovePoint = current;
    renderSketchShapes();
    return;
  }

  if (!isDrawing || !startPoint || !sketchGroup) return;
  const currentRaw = pointerToSvgPoint(event);
  const current = ['line', 'rect', 'circle', 'pipe'].includes(activeTool) ? applyGridSnap(currentRaw) : currentRaw;
  if (previewElement && sketchGroup.contains(previewElement)) sketchGroup.removeChild(previewElement);
  previewElement = buildPreviewShape(startPoint, current);
  if (previewElement) sketchGroup.appendChild(previewElement);
}

function addShapeFromDrag(start, end) {
  const material = sketchMaterialEl.value || 'stal';
  if (activeTool === 'line') {
    const snappedEnd = resolveLineEndPoint(start, end);
    if (pointDistance(start, snappedEnd) < 1) return;
    sketchShapes.push({
      type: 'line',
      material,
      depth: 0,
      label: getNextShapeLabel(),
      x1: start.x,
      y1: start.y,
      x2: snappedEnd.x,
      y2: snappedEnd.y,
    });
    lineChainPoint = { x: snappedEnd.x, y: snappedEnd.y };
    return;
  }
  lineChainPoint = null;

  if (activeTool === 'rect') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width > 2 && height > 2) {
      sketchShapes.push({ type: 'rect', material, depth: 0, label: getNextShapeLabel(), x, y, width, height });
      addAutoPlacementMeasuresForShape(sketchShapes.length - 1);
    }
    return;
  }

  if (activeTool === 'pipe') {
    const rOuter = Math.hypot(end.x - start.x, end.y - start.y);
    const wall = Math.max(rOuter * 0.2, 1);
    if (rOuter > 2) sketchShapes.push({ type: 'pipe', material, depth: 0, label: getNextShapeLabel(), cx: start.x, cy: start.y, rOuter, wall });
    return;
  }

  const r = Math.hypot(end.x - start.x, end.y - start.y);
  if (r > 2) {
    sketchShapes.push({ type: 'circle', material, depth: 0, label: getNextShapeLabel(), cx: start.x, cy: start.y, r });
    addAutoPlacementMeasuresForShape(sketchShapes.length - 1);
  }
}

function onPointerUp(event) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault();
  if (isExtruding) {
    isExtruding = false;
    extrudeStartPoint = null;
    extrudeStartDepth = 0;
    return;
  }
  if (isMoving) {
    isMoving = false;
    movingShapeIndex = -1;
    lastMovePoint = null;
    return;
  }
  if (!isDrawing || !startPoint) return;
  isDrawing = false;
  const endRaw = pointerToSvgPoint(event);
  const endPoint = ['line', 'rect', 'circle', 'pipe'].includes(activeTool) ? applyGridSnap(endRaw) : endRaw;
  if (previewElement && sketchGroup && sketchGroup.contains(previewElement)) {
    sketchGroup.removeChild(previewElement);
    previewElement = null;
  }
  const rawDragDistance = startRawPoint ? pointDistance(startRawPoint, endRaw) : pointDistance(startPoint, endPoint);
  if (rawDragDistance >= 4) {
    addShapeFromDrag(startPoint, endPoint);
  }
  startRawPoint = null;
  startPoint = null;
  renderSketchShapes();
}

function clearSketch() {
  sketchShapes.length = 0;
  sketchMeasures.length = 0;
  measureStartRef = null;
  measureStartPoint = null;
  lineChainPoint = null;
  nextShapeIndex = 0;
  selectedShapeIndex = -1;
  renderSketchShapes();
}

function undoSketch() {
  if (measureStartRef) {
    measureStartRef = null;
    measureStartPoint = null;
    renderSketchShapes();
    return;
  }
  if (sketchMeasures.length > 0) {
    sketchMeasures.pop();
    renderSketchShapes();
    return;
  }
  if (sketchShapes.length === 0) return;
  sketchShapes.pop();
  lineChainPoint = null;
  nextShapeIndex = sketchShapes.length;
  if (selectedShapeIndex >= sketchShapes.length) selectedShapeIndex = sketchShapes.length - 1;
  renderSketchShapes();
}

function clearMeasures() {
  sketchMeasures.length = 0;
  measureStartRef = null;
  measureStartPoint = null;
  renderSketchShapes();
}

function handleWindowResize() {
  updateDrawingBoardToggle();
  fitToView();
}

function toggleBlankSheet() {
  blankSheetMode = true;
  if (blankSheetBtn) {
    blankSheetBtn.classList.add('active');
    blankSheetBtn.textContent = 'Blankt ark';
  }
  updateDrawing();
}

form.addEventListener('submit', updateDrawing);
if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', downloadPdf);
if (sharePdfBtn) sharePdfBtn.addEventListener('click', sharePdf);
if (saveImageBtn) saveImageBtn.addEventListener('click', saveAsImage);
if (saveProjectBtn) saveProjectBtn.addEventListener('click', saveProjectToFile);
if (loadProjectBtn) loadProjectBtn.addEventListener('click', openProjectFilePicker);
if (saveCloudBtn) saveCloudBtn.addEventListener('click', saveProjectToCloud);
if (loadCloudBtn) loadCloudBtn.addEventListener('click', loadProjectFromCloud);
if (logoutBtn) logoutBtn.addEventListener('click', logoutCurrentUser);
if (projectFileInputEl) projectFileInputEl.addEventListener('change', onProjectFileChosen);
if (drawBoardToggleBtn) drawBoardToggleBtn.addEventListener('click', toggleDrawingBoardArming);
if (gridToggleBtn) gridToggleBtn.addEventListener('click', toggleGrid);
if (gridSnapToggleBtn) gridSnapToggleBtn.addEventListener('click', toggleGridSnap);
if (gridStepEl) {
  gridStepEl.addEventListener('change', () => {
    updateDrawing();
    saveSketchState();
  });
}
uiModeToggleBtn.addEventListener('click', toggleUiMode);
zoomInBtn.addEventListener('click', onZoomIn);
zoomOutBtn.addEventListener('click', onZoomOut);
fitViewBtn.addEventListener('click', fitToView);
toolLineBtn.addEventListener('click', () => setActiveTool('line'));
toolRectBtn.addEventListener('click', () => setActiveTool('rect'));
toolCircleBtn.addEventListener('click', () => setActiveTool('circle'));
toolPipeBtn.addEventListener('click', () => setActiveTool('pipe'));
toolMoveBtn.addEventListener('click', () => setActiveTool('move'));
toolExtrudeBtn.addEventListener('click', () => setActiveTool('extrude'));
toolMeasureBtn.addEventListener('click', () => setActiveTool('measure'));
undoSketchBtn.addEventListener('click', undoSketch);
if (blankSheetBtn) blankSheetBtn.addEventListener('click', toggleBlankSheet);
clearSketchBtn.addEventListener('click', clearSketch);
clearMeasuresBtn.addEventListener('click', clearMeasures);
window.addEventListener('resize', handleWindowResize);
svg.addEventListener('pointerdown', onPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('dblclick', onSvgDoubleClick);
window.addEventListener('pointerup', onPointerUp);
sketchDimensionsEl.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const field = target.dataset.field;
  if (field === 'jointAngle') {
    const unitIndex = Number(target.dataset.unitIndex);
    const jointIndex = Number(target.dataset.jointIndex);
    if (!Number.isInteger(unitIndex) || !Number.isInteger(jointIndex)) return;
    applyUnitJointAngleChange(unitIndex, jointIndex, target.value);
    renderSketchShapesWithOptions({ skipPanel: true });
    return;
  }
  const shapeIndex = Number(target.dataset.shapeIndex);
  if (!Number.isInteger(shapeIndex) || !field) return;
  applyShapeDimensionChange(shapeIndex, field, target.value);
  renderSketchShapesWithOptions({ skipPanel: true });
});
sketchDimensionsEl.addEventListener('change', (event) => {
  const target = event.target;
  const field = target.dataset.field;
  if (!field) return;

  if (field === 'jointAngle') {
    const unitIndex = Number(target.dataset.unitIndex);
    const jointIndex = Number(target.dataset.jointIndex);
    if (!Number.isInteger(unitIndex) || !Number.isInteger(jointIndex)) return;
    applyUnitJointAngleChange(unitIndex, jointIndex, target.value);
    renderSketchShapes();
    return;
  }

  const shapeIndex = Number(target.dataset.shapeIndex);
  if (!Number.isInteger(shapeIndex)) return;
  applyShapeDimensionChange(shapeIndex, field, target.value);
  renderSketchShapes();
});

for (const id of ['partName', 'length', 'width', 'height', 'holeDiameter', 'holeOffsetX', 'holeOffsetY', 'tolerance']) {
  document.getElementById(id).addEventListener('input', updateDrawing);
}
drawingModeEl.addEventListener('change', updateDrawing);
for (const id of ['uLength', 'uHeight', 'uInnerWidth', 'uThickness', 'uRadius', 'uMaterial']) {
  document.getElementById(id).addEventListener('input', updateDrawing);
}
for (const el of [customerNameEl, projectNameEl, orderNoEl]) {
  if (!el) continue;
  el.addEventListener('input', saveSketchState);
}

loadSketchState();
updateGridControls();
updateDrawing();
fitToView();
setActiveTool('line');
drawingBoardArmed = !isTouchLikeLayout();
updateDrawingBoardToggle();
uiMode = localStorage.getItem('drawing-ui-mode') || 'simple';
applyUiMode();
