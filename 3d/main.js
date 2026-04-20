// CIS Level 4 — 3D Navigator
// Procedurally generates a 3D corridor environment from 2D polygon data.

(async function () {
  'use strict';

  const WALL_HEIGHT = 200;
  const IMG_W = 5712, IMG_H = 4284;
  const HALF_W = IMG_W / 2, HALF_H = IMG_H / 2;

  // image-pixel (x, y) → Three.js world (Y-up)
  function toWorld3(px, py, height) {
    return new THREE.Vector3(px - HALF_W, height, py - HALF_H);
  }

  function portalColor(id) {
    if (id.startsWith('Stair'))                  return 0xff8844;
    if (id.includes('Elevator'))                 return 0x44ff88;
    if (id.includes('Pod') || id.includes('WC')) return 0xaa44ff;
    return 0x44aaff;
  }

  const [navData, bakedPaths] = await Promise.all([
    fetch('../data/navmesh_data.json').then(r => r.json()),
    fetch('../data/baked_paths.json').then(r => r.json()),
  ]);

  const polygon = navData.polygon;
  const portals = navData.portals;
  const portalIDs = [...new Set(portals.map(p => p.id))];

  const container = document.getElementById('canvas-container');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  const labelRenderer = new THREE.CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a10);
  scene.fog = new THREE.FogExp2(0x060a10, 0.0003);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 12000);
  camera.position.set(0, 2500, 1500);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x404060, 0.5));
  scene.add(new THREE.HemisphereLight(0x4488ff, 0x002244, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(1000, 1500, -500);
  scene.add(dirLight);

  const floorShape = new THREE.Shape();
  floorShape.moveTo(polygon[0].x - HALF_W, polygon[0].y - HALF_H);
  for (let i = 1; i < polygon.length; i++) {
    floorShape.lineTo(polygon[i].x - HALF_W, polygon[i].y - HALF_H);
  }
  floorShape.closePath();

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = 256; tileCanvas.height = 256;
  const tCtx = tileCanvas.getContext('2d');
  tCtx.fillStyle = '#1a1a2e';
  tCtx.fillRect(0, 0, 256, 256);
  tCtx.strokeStyle = '#252540';
  tCtx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 64) {
    tCtx.beginPath(); tCtx.moveTo(i, 0); tCtx.lineTo(i, 256); tCtx.stroke();
    tCtx.beginPath(); tCtx.moveTo(0, i); tCtx.lineTo(256, i); tCtx.stroke();
  }
  const tileTex = new THREE.CanvasTexture(tileCanvas);
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(40, 40);

  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const floorMat = new THREE.MeshStandardMaterial({
    map: tileTex, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = Math.PI / 2;
  floorMesh.position.y = 0;
  scene.add(floorMesh);

  // Ceiling is translucent so the orbit view can see corridors from above.
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d1a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    emissive: 0x0a0a15, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.15,
    depthWrite: false,
  });
  const ceilMesh = new THREE.Mesh(floorGeo.clone(), ceilMat);
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.y = WALL_HEIGHT;
  scene.add(ceilMesh);

  const wallPositions = [];
  const wallNormals = [];
  const wallUVs = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    const ax = a.x - HALF_W, az = a.y - HALF_H;
    const bx = b.x - HALF_W, bz = b.y - HALF_H;

    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    const nx = -dz / len, nz = dx / len;

    wallPositions.push(ax, 0, az,  bx, 0, bz,  ax, WALL_HEIGHT, az);
    wallPositions.push(bx, 0, bz,  bx, WALL_HEIGHT, bz,  ax, WALL_HEIGHT, az);

    for (let v = 0; v < 6; v++) wallNormals.push(nx, 0, nz);

    const u = len / 200;
    wallUVs.push(0, 0,  u, 0,  0, 1,   u, 0,  u, 1,  0, 1);
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUVs, 2));

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x334466, roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.35,
    depthWrite: false, // walls must not occlude the route ribbon
    side: THREE.DoubleSide,
    emissive: 0x112233, emissiveIntensity: 0.15,
  });
  scene.add(new THREE.Mesh(wallGeo, wallMat));

  const edgePoints = [];
  const edgePointsTop = [];
  for (let i = 0; i < n; i++) {
    const p = polygon[i];
    edgePoints.push(new THREE.Vector3(p.x - HALF_W, 1, p.y - HALF_H));
    edgePointsTop.push(new THREE.Vector3(p.x - HALF_W, WALL_HEIGHT - 1, p.y - HALF_H));
  }
  edgePoints.push(edgePoints[0].clone());
  edgePointsTop.push(edgePointsTop[0].clone());

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x44aaff, linewidth: 1 });
  const edgeBot = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePoints), edgeMat);
  const edgeTop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePointsTop), edgeMat.clone());
  edgeTop.material.color.set(0x2266aa);
  scene.add(edgeBot);
  scene.add(edgeTop);

  const portalGroup = new THREE.Group();
  scene.add(portalGroup);
  const portalRings = [];
  const portalLabels = [];

  for (const p of portals) {
    const color = portalColor(p.id);
    const pos = toWorld3(p.x, p.y, 0);

    const pillarGeo = new THREE.CylinderGeometry(6, 6, WALL_HEIGHT * 0.8, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.0,
      transparent: true, opacity: 0.5,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.copy(pos);
    pillar.position.y = WALL_HEIGHT * 0.4;
    portalGroup.add(pillar);

    const ringGeo = new THREE.RingGeometry(12, 18, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y = 1;
    portalGroup.add(ring);
    portalRings.push(ring);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'portal-label';
    labelDiv.textContent = p.id.replace(/_/g, ' ');
    const label = new THREE.CSS2DObject(labelDiv);
    label.position.copy(pos);
    label.position.y = WALL_HEIGHT * 0.85;
    portalGroup.add(label);
    portalLabels.push(label);
  }

  const PARTICLE_COUNT = 200;
  const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  const particleSpeeds = new Float32Array(PARTICLE_COUNT);

  let cx = 0, cz = 0;
  for (const v of polygon) { cx += v.x; cz += v.y; }
  cx = cx / polygon.length - HALF_W;
  cz = cz / polygon.length - HALF_H;
  const PARTICLE_SPREAD = 2000;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePositions[i * 3]     = cx + (Math.random() - 0.5) * PARTICLE_SPREAD;
    particlePositions[i * 3 + 1] = Math.random() * WALL_HEIGHT * 1.5;
    particlePositions[i * 3 + 2] = cz + (Math.random() - 0.5) * PARTICLE_SPREAD;
    particleSpeeds[i] = 0.1 + Math.random() * 0.3;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
  particleGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const particleMat = new THREE.PointsMaterial({
    color: 0x6688cc, size: 3, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Bloom runs at half resolution — visually indistinguishable, ~4× cheaper.
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(
    new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
    0.6, 0.4, 0.6
  ));

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 300;
  controls.maxDistance = 5000;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(cx, 0, cz);
  controls.enabled = true;

  let activeRouteMesh = null;
  let runnerDot = null;
  let startMarker = null;
  let endMarker = null;
  let routePts3d = null;

  function clearRoute() {
    if (activeRouteMesh) { scene.remove(activeRouteMesh); activeRouteMesh = null; }
    if (runnerDot)       { scene.remove(runnerDot);       runnerDot = null; }
    if (startMarker)     { scene.remove(startMarker);     startMarker = null; }
    if (endMarker)       { scene.remove(endMarker);       endMarker = null; }
    routePts3d = null;
  }

  // Flat ribbon from polyline waypoints; straight segments avoid CatmullRom corner overshoot.
  function buildRibbonGeo(pts, halfWidth) {
    const verts = [];
    const indices = [];
    for (let i = 0; i < pts.length; i++) {
      let dx, dz;
      if (i === 0) {
        dx = pts[1].x - pts[0].x;
        dz = pts[1].z - pts[0].z;
      } else if (i === pts.length - 1) {
        dx = pts[i].x - pts[i - 1].x;
        dz = pts[i].z - pts[i - 1].z;
      } else {
        // averaging neighbour directions gives smooth joints
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = -dz / len * halfWidth;
      const pz =  dx / len * halfWidth;

      verts.push(pts[i].x + px, pts[i].y, pts[i].z + pz);
      verts.push(pts[i].x - px, pts[i].y, pts[i].z - pz);

      if (i < pts.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function lerpPolyline(pts, t, target) {
    if (pts.length < 2) { target.copy(pts[0]); return; }
    const idx = t * (pts.length - 1);
    const i = Math.min(Math.floor(idx), pts.length - 2);
    target.lerpVectors(pts[i], pts[i + 1], idx - i);
  }

  function showRoute(fromId, toId) {
    clearRoute();
    const route = bakedPaths[fromId] && bakedPaths[fromId][toId];
    if (!route || route.length < 2) return;

    routePts3d = route.map(p => toWorld3(p.x, p.y, 40));

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    activeRouteMesh = new THREE.Mesh(buildRibbonGeo(routePts3d, 8), ribbonMat);
    activeRouteMesh.renderOrder = 999;
    scene.add(activeRouteMesh);

    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });
    runnerDot = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 12), dotMat);
    runnerDot.renderOrder = 1001;
    scene.add(runnerDot);

    const mkRing = (col) => {
      const m = new THREE.MeshBasicMaterial({ color: col, depthTest: false });
      return new THREE.Mesh(new THREE.TorusGeometry(20, 3, 8, 32), m);
    };
    startMarker = mkRing(0x3fb950);
    startMarker.rotation.x = -Math.PI / 2;
    startMarker.position.copy(routePts3d[0]);
    startMarker.position.y = 2;
    startMarker.renderOrder = 998;
    scene.add(startMarker);

    endMarker = mkRing(0xf85149);
    endMarker.rotation.x = -Math.PI / 2;
    endMarker.position.copy(routePts3d[routePts3d.length - 1]);
    endMarker.position.y = 2;
    endMarker.renderOrder = 998;
    scene.add(endMarker);
  }

  camera.position.set(cx + 1200, 2000, cz + 1200);
  controls.target.set(cx, 0, cz);
  controls.update();

  const _tempVec = new THREE.Vector3();

  const S = window.CISShared;
  const LANG = 'en';

  const pillStart     = document.getElementById('pill-start');
  const pillDest      = document.getElementById('pill-dest');
  const pillStartVal  = document.getElementById('pill-start-value');
  const pillDestVal   = document.getElementById('pill-dest-value');
  const btnSwap       = document.getElementById('btn-swap');
  const locationPanel = document.getElementById('location-panel');
  const panelSearch   = document.getElementById('panel-search');
  const panelList     = document.getElementById('panel-list');
  const panelBack     = document.getElementById('panel-back');
  const panelTitle    = document.getElementById('panel-title');

  const sortedIDs = S.sortPortalIDs(portalIDs);
  let startValue = '';
  let destValue  = '';
  let panelTarget = null;
  let exactMatchTimer = null;

  function rebuildList() {
    S.buildLocationList({
      listEl: panelList, ids: sortedIDs, lang: LANG,
      onPick: selectLocation,
    });
  }

  function updatePills() {
    pillStartVal.textContent = startValue ? S.displayName(startValue, LANG) : 'Tap to select';
    pillStartVal.classList.toggle('placeholder', !startValue);
    pillDestVal.textContent  = destValue  ? S.displayName(destValue,  LANG) : 'Tap to select';
    pillDestVal.classList.toggle('placeholder', !destValue);
  }

  function selectLocation(id) {
    clearTimeout(exactMatchTimer);
    if (panelTarget === 'start') startValue = id;
    else destValue = id;
    updatePills();
    closePanel();
    if (startValue && destValue) showRoute(startValue, destValue);
  }

  function openPanel(target) {
    panelTarget = target;
    const currentVal = target === 'start' ? startValue : destValue;
    panelSearch.value = '';
    panelTitle.textContent = target === 'start' ? 'Select starting point' : 'Select destination';
    S.filterLocationList(panelList, '', LANG);
    S.highlightCurrentValue(panelList, currentVal);
    locationPanel.classList.remove('panel-hidden');
    setTimeout(() => panelSearch.focus(), 320);
  }

  function closePanel() {
    locationPanel.classList.add('panel-hidden');
    panelTarget = null;
    panelSearch.blur();
    clearTimeout(exactMatchTimer);
  }

  rebuildList();
  updatePills();

  pillStart.addEventListener('click', () => openPanel('start'));
  pillDest.addEventListener('click',  () => openPanel('dest'));
  panelBack.addEventListener('click', closePanel);
  panelSearch.addEventListener('input', () => {
    clearTimeout(exactMatchTimer);
    S.filterLocationList(panelList, panelSearch.value, LANG, (id) => {
      exactMatchTimer = setTimeout(() => selectLocation(id), 400);
    });
  });

  btnSwap.addEventListener('click', () => {
    const tmp = startValue; startValue = destValue; destValue = tmp;
    updatePills();
    if (startValue && destValue) showRoute(startValue, destValue);
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setSize(w, h);
  });

  const loadScreen = document.getElementById('loading-screen');
  loadScreen.classList.add('fade-out');
  setTimeout(() => loadScreen.style.display = 'none', 800);

  const clock = new THREE.Clock();
  const LABEL_CULL_DIST = 800;

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    controls.update();

    const pPos = particles.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pPos[i * 3 + 1] += particleSpeeds[i] * dt * 30;
      if (pPos[i * 3 + 1] > WALL_HEIGHT * 2) pPos[i * 3 + 1] = -10;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    if (runnerDot && routePts3d) {
      const t = (elapsed * 0.15) % 1;
      lerpPolyline(routePts3d, t, _tempVec);
      runnerDot.position.copy(_tempVec);
      runnerDot.position.y += 5;
    }

    for (let i = 0; i < portalRings.length; i++) {
      const ring = portalRings[i];
      ring.material.opacity = 0.25 + 0.15 * Math.sin(elapsed * 2 + ring.position.x * 0.01);
    }

    for (let i = 0; i < portalLabels.length; i++) {
      const label = portalLabels[i];
      const dist = camera.position.distanceTo(label.position);
      label.element.style.display = dist < LABEL_CULL_DIST ? '' : 'none';
    }

    composer.render();
    labelRenderer.render(scene, camera);
  }

  animate();
})();
