const scene3d = (() => {
  let renderer, scene, camera, controls;
  let meshes = [];
  let initialized = false;
  let currentAngle = 'iso-ne';

  // GLB model cache: typeId → THREE.Group (cloned per instance)
  const glbCache = {};
  let gltfLoader = null;

  function getGLTFLoader() {
    if (gltfLoader) return gltfLoader;
    if (!THREE.GLTFLoader) return null;
    gltfLoader = new THREE.GLTFLoader();
    return gltfLoader;
  }

  function loadGLB(url, targetW, targetH, targetD, callback) {
    const loader = getGLTFLoader();
    if (!loader) { callback(null); return; }
    if (glbCache[url]) { callback(glbCache[url].clone()); return; }
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      // Scale to exact NG dimensions
      model.scale.set(targetW / size.x, targetH / size.y, targetD / size.z);
      model.updateMatrixWorld(true);
      // Store at origin — position applied per instance
      model.position.set(0, 0, 0);
      glbCache[url] = model;
      callback(model.clone());
    }, undefined, (err) => {
      console.warn('GLB load failed, using fallback:', err);
      callback(null);
    });
  }

  // Orbit state
  let orbit = { active: false, lastX: 0, lastY: 0, theta: Math.PI*0.35, phi: Math.PI*0.3, radius: 0, target: new THREE.Vector3() };
  let _skiltMeshMap = []; // maps mesh → item id for raycasting

  function initOrbit() {
    const el = renderer.domElement;
    let didDrag = false;
    el.addEventListener('mousedown', e => {
      if (e.button === 0) {
        orbit.active = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY;
        el.style.cursor = 'grabbing'; didDrag = false;
      }
    });
    el.addEventListener('mouseup', e => {
      orbit.active = false; el.style.cursor = 'grab';
      if (!didDrag) trySelectSkilt(e);
    });
    el.addEventListener('mouseleave', () => { orbit.active = false; el.style.cursor = 'grab'; });
    el.addEventListener('mousemove', e => {
      if (!orbit.active) return;
      const dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      orbit.lastX = e.clientX; orbit.lastY = e.clientY;
      orbit.theta -= dx * 0.008;
      orbit.phi = Math.max(0.08, Math.min(Math.PI * 0.48, orbit.phi - dy * 0.008));
      updateOrbitCamera();
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      orbit.radius = Math.max(2, Math.min(40, orbit.radius + e.deltaY * 0.01));
      updateOrbitCamera();
    }, { passive: false });
    el.style.cursor = 'grab';

    // Keyboard pan — arrows move camera like a drone (strafe left/right, up/down)
    document.addEventListener('keydown', e => {
      if (state.view !== '3d') return;
      const step = 0.25;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          orbit.target.x += Math.cos(orbit.theta) * step * dir;
          orbit.target.z -= Math.sin(orbit.theta) * step * dir;
          updateOrbitCamera();
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          orbit.target.y += step * dir;
          updateOrbitCamera();
          break;
        }
        case '+': case '=': e.preventDefault(); orbit.radius = Math.max(2, orbit.radius - 0.8); updateOrbitCamera(); break;
        case '-': e.preventDefault(); orbit.radius = Math.min(40, orbit.radius + 0.8); updateOrbitCamera(); break;
      }
    });
  }

  function trySelectSkilt(e) {
    const el = renderer.domElement;
    const rect = el.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const targets = _skiltMeshMap.map(s => s.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      // Find which skilt was hit
      const hitObj = hits[0].object;
      const entry = _skiltMeshMap.find(s => {
        let o = hitObj;
        while (o) { if (o === s.mesh) return true; o = o.parent; }
        return false;
      });
      if (entry) {
        state.sel = entry.id;
        if (typeof updateDP === 'function') updateDP();
        if (typeof updateSkilt3dCtrl === 'function') updateSkilt3dCtrl();
        return;
      }
    }
    // Clicked empty space — deselect skilt control
    const selItem = state.items.find(i => i.id === state.sel);
    if (selItem && selItem.kind === 'skilt') {
      state.sel = null;
      if (typeof updateSkilt3dCtrl === 'function') updateSkilt3dCtrl();
    }
  }

  function updateOrbitCamera() {
    const r = orbit.radius;
    camera.position.set(
      orbit.target.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      orbit.target.y + r * Math.cos(orbit.phi),
      orbit.target.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }

  function resetOrbit() {
    const rW = state.roomW, rD = state.roomD, rH = state.roomH;
    orbit.target.set(rW/2, rH*0.35, rD/2);
    orbit.radius = Math.max(rW, rD) * 2.2;
    orbit.theta = Math.PI * 0.35;
    orbit.phi = Math.PI * 0.3;
    updateOrbitCamera();
  }

  function init() {
    const container = document.getElementById('canvas-3d');
    const W = container.clientWidth, H = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb0b8bf);
    scene.fog = new THREE.Fog(0xb0b8bf, 18, 60);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Camera
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
    resetOrbit();
    initOrbit();

    // Lights — industrial overhead feel
    const ambient = new THREE.AmbientLight(0xc8d4de, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff6d8, 1.2);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.001;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb0c8e0, 0.3);
    fill.position.set(-8, 6, -8);
    scene.add(fill);

    initialized = true;
    animate();
    rebuild();
  }

  let _dirty = false;
  function markDirty() { _dirty = true; }

  function animate() {
    requestAnimationFrame(animate);
    if (_dirty) { _doRebuild(); _dirty = false; }
    renderer.render(scene, camera);
  }

  function setAngle(a) {
    currentAngle = a;
    if (!camera) return;
    const rW = state.roomW, rD = state.roomD, rH = state.roomH;
    orbit.target.set(rW/2, rH*0.35, rD/2);
    orbit.radius = Math.max(rW, rD) * 2.2;
    const angles = {
      'iso-ne': [Math.PI*0.35, Math.PI*0.30],
      'iso-nw': [-Math.PI*0.35, Math.PI*0.30],
      'iso-se': [Math.PI*0.65, Math.PI*0.30],
      'iso-sw': [-Math.PI*0.65, Math.PI*0.30],
      'top':    [Math.PI*0.35, 0.08],
      'front':  [0, Math.PI*0.38],
      'side-r': [Math.PI*0.5, Math.PI*0.35],
      'side-l': [-Math.PI*0.5, Math.PI*0.35],
    };
    const [th, ph] = angles[a] || angles['iso-ne'];
    orbit.theta = th; orbit.phi = ph;
    updateOrbitCamera();
  }

  function rebuild() {
    if (!initialized) { markDirty(); return; }
    markDirty();
  }

  function _doRebuild() {
    meshes.forEach(m => scene.remove(m));
    meshes = [];
    _skiltMeshMap = [];

    buildRoom();
    state.items.forEach(it => {
      if (it.kind === 'container') buildContainer(it);
      else if (it.kind === 'wall') buildWallEl(it);
      else if (it.kind === 'skilt') buildSkilt3D(it);
    });
    // Note: camera NOT reset here — only on init/setAngle
  }

  function mat(color, opts = {}) {
    return new THREE.MeshLambertMaterial({ color, ...opts });
  }

  function box(w, h, d, color, opts) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color, opts));
    return mesh;
  }

  function setShadow(obj, cast = true, receive = true) {
    obj.traverse(child => {
      if (child.isMesh) { child.castShadow = cast; child.receiveShadow = receive; }
    });
  }

  function addMesh(m) { scene.add(m); meshes.push(m); return m; }

  function buildRoom() {
    const H = state.roomH;
    const thick = 0.12;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xc8c4be, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x706c66 });

    if (state.roomMode === 'rect') {
      const W = state.roomW, D = state.roomD;

      // Floor — concrete
      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(W, thick, D),
        new THREE.MeshLambertMaterial({ color: 0x6e6b67 })
      );
      floorMesh.position.set(W/2, -thick/2, D/2);
      floorMesh.receiveShadow = true;
      addMesh(floorMesh);

      // Floor expansion joints (1m grid, darker lines)
      const gpts = [];
      for (let i = 0; i <= Math.ceil(W); i++) { gpts.push(i,0.005,0, i,0.005,D); }
      for (let i = 0; i <= Math.ceil(D); i++) { gpts.push(0,0.005,i, W,0.005,i); }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
      addMesh(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x4a4845 })));

      // 4 walls
      [[W,H,thick,W/2,H/2,0],[thick,H,D,0,H/2,D/2],[thick,H,D,W,H/2,D/2],[W,H,thick,W/2,H/2,D]]
        .forEach(([w,h,d,px,py,pz]) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat.clone());
          m.position.set(px,py,pz);
          m.receiveShadow = true;
          addMesh(m);
        });

      // Ceiling — semi-opaque industrial panel
      const ceilMesh = new THREE.Mesh(
        new THREE.BoxGeometry(W, 0.06, D),
        new THREE.MeshLambertMaterial({ color: 0x9a9690, transparent: true, opacity: 0.45 })
      );
      ceilMesh.position.set(W/2, H + 0.03, D/2);
      addMesh(ceilMesh);

      // Edge lines
      [[[0,0,0],[W,0,0],[W,H,0],[0,H,0],[0,0,0]],
       [[0,0,D],[W,0,D],[W,H,D],[0,H,D],[0,0,D]],
       [[0,0,0],[0,0,D],[0,H,D],[0,H,0]],
       [[W,0,0],[W,0,D],[W,H,D],[W,H,0]],
       [[0,H,0],[W,H,0],[W,H,D],[0,H,D],[0,H,0]]
      ].forEach(ps => {
        const geo = new THREE.BufferGeometry();
        const arr = []; ps.forEach(([x,y,z]) => arr.push(x,y,z));
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
        addMesh(new THREE.Line(geo, edgeMat));
      });

    } else if (state.roomMode === 'free' && state.polyDone && state.poly.length > 2) {
      const poly = state.poly;
      const shape = new THREE.Shape();
      shape.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, poly[i].y);
      shape.closePath();

      // Floor via ShapeGeometry (XZ plane)
      const floorShape = new THREE.ShapeGeometry(shape);
      const posAttr = floorShape.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i);
        posAttr.setXYZ(i, x, 0, y);
      }
      floorShape.attributes.position.needsUpdate = true;
      floorShape.computeVertexNormals();
      const floorMesh = new THREE.Mesh(floorShape, new THREE.MeshLambertMaterial({ color: 0x6e6b67, side: THREE.DoubleSide }));
      floorMesh.receiveShadow = true;
      addMesh(floorMesh);

      // Walls — one per edge
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i+1) % poly.length];
        const dx = b.x - a.x, dz = b.y - a.y;
        const len = Math.sqrt(dx*dx + dz*dz);
        const wallGeo = new THREE.BoxGeometry(len, H, thick);
        const wall = new THREE.Mesh(wallGeo, wallMat.clone());
        wall.position.set((a.x+b.x)/2, H/2, (a.y+b.y)/2);
        wall.rotation.y = -Math.atan2(dz, dx);
        addMesh(wall);

        // Edge lines for this wall
        const ep = [[a.x,0,a.y],[b.x,0,b.y],[b.x,H,b.y],[a.x,H,a.y],[a.x,0,a.y]];
        const eg = new THREE.BufferGeometry();
        const ea = []; ep.forEach(([x,y,z]) => ea.push(x,y,z));
        eg.setAttribute('position', new THREE.Float32BufferAttribute(ea,3));
        addMesh(new THREE.Line(eg, edgeMat));
      }

      // Update orbit target to polygon centroid
      const cx = poly.reduce((s,p)=>s+p.x,0)/poly.length;
      const cz = poly.reduce((s,p)=>s+p.y,0)/poly.length;
      const xs = poly.map(p=>p.x), zs = poly.map(p=>p.y);
      const span = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...zs)-Math.min(...zs));
      orbit.target.set(cx, H*0.35, cz);
      orbit.radius = span * 2.2;
      updateOrbitCamera();
    }
  }

  // ── Skilt (sorteringsmerke) ───────────────────────────────────────────
  const _skilt3dTexCache = {};

  // Offisielle sortere.no PNG-ikoner lastet via R2-proxy
  const SKILT_STYLE = {
    'sk-rest':       { label: 'Restavfall',                r2: 'Restavfall_web.png'             },
    'sk-mat':        { label: 'Matavfall',                 r2: 'Matavfall_web.png'              },
    'sk-glass':      { label: 'Glass og metallemballasje', r2: 'Glass_metallemballasje_web.png' },
    'sk-papir':      { label: 'Papp og Papir',             r2: 'Papp_og_papir_web.png'          },
    'sk-papp':       { label: 'Papp',                      r2: 'Papp_web.png'                   },
    'sk-plast':      { label: 'Plastemballasje',           r2: 'Plastemballasje_web.png'        },
    'sk-plastfolie': { label: 'Plastfolie',                r2: 'Plastfolie_web.png'             },
    'sk-metall':     { label: 'Metall',                    r2: 'Jern_og_metaller_web.png'       },
    'sk-eps':        { label: 'EPS',                       r2: 'EPS_web.png'                    },
    'sk-farlig':     { label: 'Farlig avfall',             r2: 'Farlig_avfall_web.png'          },
    'sk-ee':         { label: 'EE-avfall',                 r2: 'Elektronikk_web.png'            },
  };

  function makeSkiltTexture(typeId) {
    const S = SKILT_STYLE[typeId] || { label: typeId, iconUrl: null };
    const SZ = 512;
    const ICON_H = Math.round(SZ * 0.75);
    const LABEL_H = SZ - ICON_H;

    const c = document.createElement('canvas');
    c.width = SZ; c.height = SZ;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);

    function drawLabel() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, ICON_H, SZ, LABEL_H);
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = S.label.split(' ');
      if (words.length > 1 && ctx.measureText(S.label).width > SZ * 0.88) {
        ctx.font = `bold ${Math.round(LABEL_H * 0.37)}px Arial, sans-serif`;
        ctx.fillText(words[0], SZ/2, ICON_H + LABEL_H * 0.28);
        ctx.fillText(words.slice(1).join(' '), SZ/2, ICON_H + LABEL_H * 0.70);
      } else {
        ctx.font = `bold ${Math.round(LABEL_H * 0.42)}px Arial, sans-serif`;
        ctx.fillText(S.label, SZ/2, ICON_H + LABEL_H * 0.5);
      }
      tex.needsUpdate = true;
    }

    // Option 1: inline canvas drawing (ee, blandet etc)
    if (S.drawIcon) {
      ctx.fillStyle = S.bg || '#444';
      ctx.fillRect(0, 0, SZ, ICON_H);
      S.drawIcon(ctx, SZ, ICON_H);
      drawLabel();
      return tex;
    }

    // Option 2: R2 full-image PNG (sortere.no offisielle skilt) — tegnes over hele canvas
    if (S.r2) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, SZ, SZ); tex.needsUpdate = true; };
      img.onerror = () => { ctx.fillStyle = '#555'; ctx.fillRect(0, 0, SZ, SZ); drawLabel(); };
      img.src = `/r2/${S.r2}`;
      return tex;
    }

    // Option 3: URL — GPN SVG-ikoner direkte
    const url = S.iconUrl || null;
    if (url) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, SZ, ICON_H); drawLabel(); };
      img.onerror = () => { ctx.fillStyle = S.bg || '#555'; ctx.fillRect(0, 0, SZ, ICON_H); drawLabel(); };
      img.src = url;
    } else {
      ctx.fillStyle = S.bg || '#555';
      ctx.fillRect(0, 0, SZ, ICON_H);
    }
    drawLabel();
    return tex;
  }

  function getSkiltWallInfo(it) {
    const cx = it.x, cz = it.y;
    const offset = it.wallOffset || 0;
    if (state.roomMode === 'rect') {
      const W = state.roomW, D = state.roomD;
      // nx/nz = inward normals (into the room), wx/wz = point on wall surface
      const dists = [
        { nx:0,  nz:1,  wx: cx, wz: 0,      d: cz   },  // north wall, inward = +Z
        { nx:0,  nz:-1, wx: cx, wz: D,      d: D-cz },  // south wall, inward = -Z
        { nx:1,  nz:0,  wx: 0,  wz: cz,     d: cx   },  // west wall,  inward = +X
        { nx:-1, nz:0,  wx: W,  wz: cz,     d: W-cx },  // east wall,  inward = -X
      ];
      return dists.reduce((a,b) => a.d < b.d ? a : b);
    }
    // Free mode: compute from polygon at runtime
    const pts = state.poly;
    if (pts && pts.length > 2) {
      const cx0 = pts.reduce((s,p) => s+p.x, 0) / pts.length;
      const cy0 = pts.reduce((s,p) => s+p.y, 0) / pts.length;
      let best = null;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i+1)%pts.length];
        const ex = b.x-a.x, ey = b.y-a.y, len2 = ex*ex+ey*ey;
        if (len2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((cx-a.x)*ex+(cz-a.y)*ey)/len2));
        const wx = a.x+t*ex, wy = a.y+t*ey;
        const dist = Math.hypot(cx-wx, cz-wy);
        const len = Math.sqrt(len2);
        let nx = -ey/len, ny = ex/len;
        // Flip inward — use wall point not segment midpoint
        if ((cx0-wx)*nx+(cy0-wy)*ny < 0) { nx=-nx; ny=-ny; }
        if (!best || dist < best.dist) best = { dist, wx, wy, nx, ny };
      }
      if (best) return { nx: best.nx, nz: best.ny, wx: best.wx + offset * Math.abs(best.ny), wz: best.wy + offset * Math.abs(best.nx) };
    }
    return { nx:0, nz:-1, wx: cx, wz: 0.03 };
  }

  function buildSkilt3D(it) {
    if (!it.def) return;
    const sz = it.size || 0.6;
    let mountH = it.wallH;
    if (mountH === undefined) {
      // Fallback: compute from linked container height
      const linked = it._linkedTo !== undefined
        ? state.items.find(c => c.kind === 'container' && c.id === it._linkedTo)
        : null;
      mountH = linked ? linked.def.H / 1000 + 0.3 : 1.5;
    }
    const wi = getSkiltWallInfo(it);

    const key = it.typeId;
    if (!_skilt3dTexCache[key]) {
      _skilt3dTexCache[key] = makeSkiltTexture(it.typeId, it.def.name || it.typeId);
    }
    const texture = _skilt3dTexCache[key];

    // White backing panel
    const backGeo = new THREE.PlaneGeometry(sz + 0.04, sz + 0.04);
    const backMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.FrontSide });
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.z = -0.003;

    // Sign face
    const geo = new THREE.PlaneGeometry(sz, sz);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);

    const group = new THREE.Group();
    group.add(back);
    group.add(mesh);

    // Place sign ON the inner wall surface (wall thickness = 0.12, inner face at 0.06 from center)
    const wallThick = 0.08;
    const posX = wi.wx + wi.nx * wallThick;
    const posZ = wi.wz + wi.nz * wallThick;
    console.log('skilt:', it.typeId, 'container:', it.x.toFixed(2), it.y.toFixed(2),
      '→ wall:', wi.wx?.toFixed(2), wi.wz?.toFixed(2),
      'normal:', wi.nx?.toFixed(2), wi.nz?.toFixed(2),
      'pos:', posX.toFixed(2), posZ.toFixed(2), 'h:', mountH.toFixed(2));
    group.position.set(posX, mountH, posZ);
    group.lookAt(posX + wi.nx, mountH, posZ + wi.nz);

    addMesh(group);
    _skiltMeshMap.push({ mesh: group, id: it.id });
  }

  function buildContainer(it, skipGLB = false) {
    const def = it.def;
    const W = def.W / 1000, D = def.D / 1000, H = def.H / 1000;
    const cx = it.x, cz = it.y;
    const rot = it.rot || 0;

    if (def.type === 'cage' || def.type === 'rollcage') {
      buildCage3D(it, W, D, H, cx, cz, rot, def.type === 'rollcage');
      return;
    }

    // ── GLB models — proxied via local server to avoid CORS ──────────
    const R2 = '/r2';
    const GLB_MODELS = {
      '140L':  `${R2}/140L.glb`,
      '240L':  `${R2}/240.glb`,
      '360L':  `${R2}/360.glb`,
      '360LG': `${R2}/360.glb`,
      '660L':  `${R2}/660L.glb`,
      '660LG': `${R2}/660L.glb`,
      '1000L': `${R2}/1000L.glb`,
      'BALEX':   `${R2}/Balex.glb`,
      'BALEX10': `${R2}/Balex.glb`,
    };

    if (!skipGLB && GLB_MODELS[def.id]) {
      loadGLB(GLB_MODELS[def.id], W, H, D, (model) => {
        if (!model) {
          buildContainerFallback(it); return;
        }
        if (def.type.includes('glass')) {
          model.traverse(child => {
            if (child.isMesh) {
              const b = new THREE.Box3().setFromObject(child);
              if (b.min.y > H * 0.65) {
                child.material = child.material.clone();
                child.material.color.setHex(0x1a55aa);
              }
            }
          });
        }
        if (def.id === 'BALEX' || def.id === 'BALEX10') {
          const bluemat = new THREE.MeshStandardMaterial({
            color: 0x1a6bc4,
            roughness: 0.5,
            metalness: 0.15,
            emissive: new THREE.Color(0x0d3d75),
            emissiveIntensity: 0.35,
          });
          model.traverse(child => {
            if (child.isMesh) child.material = bluemat;
          });
        }
        // Center model at origin, bottom at y=0, then wrap for positioning/rotation
        model.position.set(0, 0, 0);
        model.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(model);
        const bCx = (b.min.x + b.max.x) / 2;
        const bCz = (b.min.z + b.max.z) / 2;
        model.position.set(-bCx, -b.min.y, -bCz);
        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.position.set(cx, 0, cz);
        wrapper.rotation.y = Math.PI - rot;
        setShadow(wrapper, false, false);
        addMesh(wrapper);
      });
      return;
    }

    const isGlass  = def.type.includes('glass');
    const is4wheel = def.wheels === 4;
    const group    = new THREE.Group();

    const NG_ORANGE = 0xe8521a;
    const BODY_COL  = 0x282828;
    const LID_COL   = isGlass ? 0x1a55aa : 0x1c1c1c;
    const m = (c, s=40) => new THREE.MeshPhongMaterial({ color:c, shininess:s, specular:0x222222 });

    // ── Dimensions ───────────────────────────────────────────────────
    // Wheel radius — sits on Y=0 ground
    const wr = is4wheel ? 0.060 : 0.075;
    const wt = is4wheel ? 0.042 : 0.038; // tyre thickness
    // Bin body starts above wheels
    const floorY  = wr * 2;          // bottom of body
    const bodyH   = H - floorY - H * 0.10;  // leave room for lid
    const topY    = floorY + bodyH;

    // Body is a simple box — no taper to avoid geometry bugs
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), m(BODY_COL, 30));
    body.position.set(0, floorY + bodyH/2, 0);
    group.add(body);

    // Collar ring at top of body
    const collar = new THREE.Mesh(new THREE.BoxGeometry(W+0.012, 0.025, D+0.012), m(0x111111, 20));
    collar.position.set(0, topY - 0.012, 0);
    group.add(collar);

    // ── LID ──────────────────────────────────────────────────────────
    const lidH = H * 0.09;
    const lid1 = new THREE.Mesh(new THREE.BoxGeometry(W+0.020, lidH*0.35, D+0.020), m(LID_COL, 80));
    lid1.position.set(0, topY + lidH*0.175, 0);
    group.add(lid1);

    const lid2 = new THREE.Mesh(new THREE.BoxGeometry(W+0.006, lidH*0.45, D+0.006), m(LID_COL, 80));
    lid2.position.set(0, topY + lidH*0.35 + lidH*0.225, 0);
    group.add(lid2);

    const lid3 = new THREE.Mesh(new THREE.BoxGeometry(W*0.90, lidH*0.25, D*0.90), m(LID_COL, 80));
    lid3.position.set(0, topY + lidH*0.80 + lidH*0.125, 0);
    group.add(lid3);

    const lidTop = topY + lidH;

    // ── LID HANDLE ───────────────────────────────────────────────────
    const hm = m(0x0d0d0d, 60);
    if (is4wheel) {
      // Two side handles
      [-W*0.28, W*0.28].forEach(hx => {
        const lA = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.018), hm);
        lA.position.set(hx, lidTop + 0.021, -0.020); group.add(lA);
        const lB = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.018), hm);
        lB.position.set(hx, lidTop + 0.021,  0.020); group.add(lB);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.050), hm);
        bar.position.set(hx, lidTop + 0.040, 0); group.add(bar);
      });
    } else {
      // Single top handle
      const hW = W * 0.26;
      const lA = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.038, 0.020), hm);
      lA.position.set(-hW/2, lidTop + 0.019, 0); group.add(lA);
      const lB = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.038, 0.020), hm);
      lB.position.set( hW/2, lidTop + 0.019, 0); group.add(lB);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(hW, 0.020, 0.020), hm);
      bar.position.set(0, lidTop + 0.036, 0); group.add(bar);
    }

    // ── NG LOGO ───────────────────────────────────────────────────────
    const ls = Math.min(W*0.22, 0.13);
    const logo = new THREE.Mesh(new THREE.BoxGeometry(ls, ls, 0.015), m(NG_ORANGE, 60));
    logo.position.set(0, floorY + bodyH*0.52, -D/2 - 0.009);
    group.add(logo);

    // ── BASE PLATE ────────────────────────────────────────────────────
    const base = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, floorY, D - 0.02), m(0x111111, 10));
    base.position.set(0, floorY/2, 0);
    group.add(base);

    // ── WHEELS ────────────────────────────────────────────────────────
    if (is4wheel) {
      const GOLD = 0xaa8010;
      const positions = [
        [-W/2+0.08, -D/2+0.08], [ W/2-0.08, -D/2+0.08],
        [-W/2+0.08,  D/2-0.08], [ W/2-0.08,  D/2-0.08],
      ];
      positions.forEach(([wx, wz], i) => {
        const wg = new THREE.Group();
        // Castor housing
        const fork = new THREE.Mesh(new THREE.BoxGeometry(wt*1.1, wr*0.7, wr*0.5), m(GOLD, 70));
        fork.position.set(0, wr*0.55, 0); wg.add(fork);
        // Tyre
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, wt, 16), m(0x111111, 5));
        tyre.rotation.z = Math.PI/2; wg.add(tyre);
        // Hub
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wr*0.35, wr*0.35, wt*1.1, 10), m(GOLD, 90));
        hub.rotation.z = Math.PI/2; wg.add(hub);
        wg.position.set(wx, wr, wz);
        group.add(wg);
      });

    } else {
      // 2-wheel bins: large wheels at REAR (+Z), small glide foot at front (-Z)
      const axleZ = D/2 - wr * 0.5;
      [-W/2 + 0.045, W/2 - 0.045].forEach(wx => {
        const wg = new THREE.Group();
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, wt, 18), m(0x111111, 5));
        tyre.rotation.z = Math.PI/2; wg.add(tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wr*0.35, wr*0.35, wt*1.1, 10), m(0x888888, 80));
        hub.rotation.z = Math.PI/2; wg.add(hub);
        // 4 spokes
        for (let s = 0; s < 4; s++) {
          const spk = new THREE.Mesh(new THREE.BoxGeometry(wr*0.08, wr*0.58, wt*0.2), m(0x666666, 40));
          spk.rotation.z = s * Math.PI/4; wg.add(spk);
        }
        wg.position.set(wx, wr, axleZ);
        group.add(wg);
      });
      // Axle rod
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, W*0.52, 8), m(0x777777, 60));
      axle.rotation.z = Math.PI/2;
      axle.position.set(0, wr, axleZ);
      group.add(axle);
      // Push bar at rear (+Z)
      const pbZ = D/2 + 0.010;
      const pbm = m(0x111111, 50);
      [-W*0.22, W*0.22].forEach(px => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.080, 0.022), pbm);
        leg.position.set(px, topY - 0.040, pbZ); group.add(leg);
      });
      const pbBar = new THREE.Mesh(new THREE.BoxGeometry(W*0.46, 0.024, 0.036), pbm);
      pbBar.position.set(0, topY - 0.002, pbZ); group.add(pbBar);
      // Glide foot at front (-Z)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(W*0.28, 0.020, 0.050), m(0x222222, 15));
      foot.position.set(0, 0.010, -D/2 + 0.030);
      group.add(foot);
    }

    group.position.set(cx, 0, cz);
    group.rotation.y = -rot;
    setShadow(group, false, false);
    addMesh(group);
  }

  // Alias so GLB path can fall back to hand-coded version
  function buildContainerFallback(it) { buildContainer(it, true); }

  function buildCage3D(it, W, D, H, cx, cz, rot, isRoll) {
    const group = new THREE.Group();
    const barR = 0.015; // bar radius
    const barMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x555555 });

    // Floor plate
    const floor = box(W, 0.04, D, 0x999999);
    floor.position.set(0, 0.02, 0);
    group.add(floor);

    // Corner posts
    const postH = H;
    [[W/2, D/2],[-W/2, D/2],[W/2,-D/2],[-W/2,-D/2]].forEach(([px,pz]) => {
      const postGeo = new THREE.CylinderGeometry(0.03, 0.03, postH, 6);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, postH/2, pz);
      group.add(post);
    });

    // Horizontal rails on each face (4 faces, 3 rails each)
    const railH = [H*0.25, H*0.55, H*0.88];
    railH.forEach(ry => {
      // front/back rails (along X)
      [-D/2, D/2].forEach(pz => {
        const rGeo = new THREE.CylinderGeometry(barR, barR, W, 4);
        const r = new THREE.Mesh(rGeo, barMat);
        r.rotation.z = Math.PI/2;
        r.position.set(0, ry, pz);
        group.add(r);
      });
      // side rails (along Z)
      [-W/2, W/2].forEach(px => {
        const rGeo = new THREE.CylinderGeometry(barR, barR, D, 4);
        const r = new THREE.Mesh(rGeo, barMat);
        r.rotation.x = Math.PI/2;
        r.position.set(px, ry, 0);
        group.add(r);
      });
    });

    // Vertical bars on front and back faces
    const vCols = Math.max(3, Math.round(W / 0.25));
    for (let i = 1; i < vCols; i++) {
      const px = -W/2 + (W / vCols) * i;
      [-D/2, D/2].forEach(pz => {
        const vGeo = new THREE.CylinderGeometry(barR*0.8, barR*0.8, H*0.88, 4);
        const v = new THREE.Mesh(vGeo, barMat);
        v.position.set(px, H*0.44, pz);
        group.add(v);
      });
    }
    // Vertical bars on side faces
    const sCols = Math.max(2, Math.round(D / 0.25));
    for (let i = 1; i < sCols; i++) {
      const pz = -D/2 + (D / sCols) * i;
      [-W/2, W/2].forEach(px => {
        const vGeo = new THREE.CylinderGeometry(barR*0.8, barR*0.8, H*0.88, 4);
        const v = new THREE.Mesh(vGeo, barMat);
        v.position.set(px, H*0.44, pz);
        group.add(v);
      });
    }

    // Top frame
    const topMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    [[-W/2, D/2],[W/2,-D/2]].forEach(([px,pz]) => {
      const tGeo = new THREE.CylinderGeometry(barR*1.2, barR*1.2, W, 4);
      const t = new THREE.Mesh(tGeo, topMat);
      t.rotation.z = Math.PI/2; t.position.set(0, H, pz); group.add(t);
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(barR*1.2, barR*1.2, D, 4), topMat);
      t2.rotation.x = Math.PI/2; t2.position.set(px, H, 0); group.add(t2);
    });

    // EE warning label (orange plate on front)
    const badge = box(W*0.3, H*0.06, 0.01, 0xe8521a);
    badge.position.set(0, H*0.65, D/2 + 0.01);
    group.add(badge);

    // Wheels
    const wr = 0.055;
    [[W/2-wr, D/2-wr],[-W/2+wr, D/2-wr],[W/2-wr,-D/2+wr],[-W/2+wr,-D/2+wr]].forEach(([wx,wz]) => {
      const wGeo = new THREE.CylinderGeometry(wr, wr, 0.04, 10);
      const wheel = new THREE.Mesh(wGeo, new THREE.MeshLambertMaterial({color: 0x111111}));
      wheel.rotation.x = Math.PI/2; wheel.position.set(wx, wr, wz);
      group.add(wheel);
    });

    group.position.set(cx, 0, cz);
    group.rotation.y = -rot;
    setShadow(group, false, false);
    addMesh(group);
  }

  function buildWallEl(it) {
    const def = it.def;
    const W = def.W / 1000, D = def.D / 1000;
    const cx = it.x, cz = it.y;
    const rot = it.rot || 0;

    if (def.type === 'door' || def.type === 'window') {
      const isDoor = def.type === 'door';
      const frameH = isDoor ? 2.1 : 1.1;
      const floorY = isDoor ? 0 : 0.9; // windows raised off floor
      const g = new THREE.Group();
      const frame = box(W, frameH, 0.06, isDoor ? 0x8b6520 : 0x4a7fa8);
      frame.position.set(0, floorY + frameH/2, 0);
      g.add(frame);
      if (!isDoor) {
        // Window glass pane
        const glassMat = new THREE.MeshLambertMaterial({ color: 0xd4eaf7, transparent: true, opacity: 0.55 });
        const glass = new THREE.Mesh(new THREE.BoxGeometry(W*0.88, frameH*0.82, 0.02), glassMat);
        glass.position.set(0, floorY + frameH/2, 0.02);
        g.add(glass);
        // Window cross bars
        const barMat = new THREE.MeshLambertMaterial({ color: 0x3a6080 });
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(W*0.88, 0.03, 0.03), barMat);
        hBar.position.set(0, floorY + frameH/2, 0.02); g.add(hBar);
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.03, frameH*0.82, 0.03), barMat);
        vBar.position.set(0, floorY + frameH/2, 0.02); g.add(vBar);
      }
      g.position.set(cx, 0, cz);
      g.rotation.y = -rot;
      addMesh(g);
    } else if (def.type === 'pillar') {
      const pillar = box(W, state.roomH, D, 0x888888);
      pillar.position.set(cx, state.roomH / 2, cz);
      addMesh(pillar);
    }
  }

  function resize() {
    if (!initialized) return;
    const container = document.getElementById('canvas-3d');
    const W = container.clientWidth, H = container.clientHeight;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  function nudgeSkilt(id, dir) {
    const it = state.items.find(i => i.id === id && i.kind === 'skilt');
    if (!it) return;
    const step = 0.05;
    if (it.wallH === undefined) it.wallH = 1.5;
    if (it.wallOffset === undefined) it.wallOffset = 0;
    if (dir === 'up')    it.wallH      += step;
    if (dir === 'down')  it.wallH      = Math.max(0.05, it.wallH - step);
    if (dir === 'left')  it.wallOffset -= step;
    if (dir === 'right') it.wallOffset += step;
    rebuild();
    // Update height label in overlay
    const lbl = document.getElementById('skilt3d-h-lbl');
    if (lbl) lbl.textContent = it.wallH.toFixed(2) + 'm';
  }

  return { init, rebuild, setAngle, resize, markDirty, nudgeSkilt, get _initialized() { return initialized; } };
})();
