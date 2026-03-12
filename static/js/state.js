const state = {
  view: '2d',
  tool: 'move',
  roomMode: 'free',
  roomW: 6, roomD: 4, roomH: 2.8,
  // Wall-builder mode (replaces freehand)
  poly: [], polyDone: false, polyDraw: false,
  polyOriginX: null, polyOriginY: null,
  items: [],
  nextId: 1,
  sel: null,
  ppm: 80,
  zoom: 1.0,           // zoom multiplier (scroll wheel)
  panX: 0, panY: 0,
  sketchId: null,
  sketchName: 'Ny skisse',
  customer: '',
  drag: null, dox: 0, doy: 0,
  rotat: null, rsa: 0, rsi: 0,
  pendingSkilt: null,
  hoverPoly: null,
  shiftDown: false,
  spaceDown: false,
  panning: false, panSX: 0, panSY: 0, panOX: 0, panOY: 0,
};

function getO() {
  const c = document.getElementById('canvas-2d');
  const ppm = state.ppm * state.zoom;
  if (state.roomMode === 'rect') {
    return {
      ox: (c.width  - state.roomW * ppm) / 2 + state.panX,
      oy: (c.height - state.roomD * ppm) / 2 + state.panY,
    };
  }
  // Wall-builder / free mode
  if (!state.polyDone || state.poly.length === 0) {
    return { ox: state.polyOriginX || c.width/2, oy: state.polyOriginY || c.height/2 };
  }
  const xs = state.poly.map(p => p.x), ys = state.poly.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
  return {
    ox: (c.width  - spanX * ppm) / 2 - minX * ppm + state.panX,
    oy: (c.height - spanY * ppm) / 2 - minY * ppm + state.panY,
  };
}

// Returns pixels-per-metre accounting for zoom
function getPPM() { return state.ppm * state.zoom; }

function calcPPM() {
  const w = document.getElementById('cw');
  const aW = w.clientWidth - 80, aH = w.clientHeight - 100;
  if (state.roomMode === 'rect') {
    state.ppm = Math.min(aW / state.roomW, aH / state.roomD, 150);
  } else if (state.polyDone && state.poly.length > 2) {
    const xs = state.poly.map(p => p.x), ys = state.poly.map(p => p.y);
    const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys);
    state.ppm = Math.min(aW / Math.max(sx,.1), aH / Math.max(sy,.1), 150);
  }
  state.zoom = 1.0;
  document.getElementById('rbar').style.width = getPPM() + 'px';
}

function toJSON() {
  return {
    roomMode: state.roomMode, roomW: state.roomW, roomD: state.roomD, roomH: state.roomH,
    poly: state.poly, polyDone: state.polyDone,
    items: state.items.map(it => ({
      id: it.id, typeId: it.typeId, kind: it.kind,
      x: it.x, y: it.y, rot: it.rot, fraksjon: it.fraksjon || 'rest',
      text: it.text || null, wallSide: it.wallSide || null,
      size: it.size || null, wallH: it.wallH || null, wallOffset: it.wallOffset || null,
      _linkedTo: it._linkedTo || null,
      _wallNx: it._wallNx ?? null, _wallNy: it._wallNy ?? null,
      _wallX:  it._wallX  ?? null, _wallY:  it._wallY  ?? null,
    }))
  };
}

function fromJSON(d) {
  state.roomMode = d.roomMode || 'free';
  state.roomW = d.roomW || 6; state.roomD = d.roomD || 4; state.roomH = d.roomH || 2.8;
  state.poly = d.poly || []; state.polyDone = d.polyDone || false;
  state.items = (d.items || []).map(it => {
    let def = null;
    if (it.kind === 'container') def = DEFS.find(x => x.id === it.typeId);
    else if (it.kind === 'wall') def = WALL_EL_DEFS[it.typeId];
    else if (it.kind === 'skilt') def = SKILT_DEFS.find(x => x.id === it.typeId);
    return { ...it, def, fraksjon: it.fraksjon || 'rest' };
  });
  state.nextId = state.items.reduce((m, i) => Math.max(m, i.id + 1), 1);
  calcPPM();
}
