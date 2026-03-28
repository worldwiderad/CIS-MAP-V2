// ============================================================================
//  CIS Indoor Navigation — Mobile Viewer
// ============================================================================
//  This app does ZERO pathfinding. It simply:
//    1. Loads the pre-baked route dictionary (baked_paths.json)
//    2. Populates autocomplete lists from the portal IDs
//    3. Looks up routes[start][dest] and draws the coordinate array
//    4. Provides pan/zoom so the user can explore the map
// ============================================================================

(function () {
  'use strict';

  // ── Bilingual strings ──
  const STRINGS = {
    en: {
      title:        'CIS Navigator',
      from:         'From',
      to:           'To',
      navigate:     'Navigate',
      clear:        'Clear',
      loading:      'Loading map…',
      ready:        'Select start and destination',
      noRoute:      'No route found between these locations',
      routeFound:   'Route displayed',
      invalidStart: 'Unknown start location',
      invalidDest:  'Unknown destination',
      same:         'Start and destination are the same',
      lang:         '中文',
      startPh:      'e.g. Stair_1',
      destPh:       'e.g. NW-412',
      swap:         'Swap',
    },
    zh: {
      title:        'CIS 校园导航',
      from:         '起点',
      to:           '终点',
      navigate:     '导航',
      clear:        '清除',
      loading:      '加载地图中…',
      ready:        '请选择起点和终点',
      noRoute:      '未找到这两个位置之间的路线',
      routeFound:   '路线已显示',
      invalidStart: '未知的起点位置',
      invalidDest:  '未知的终点位置',
      same:         '起点和终点相同',
      lang:         'EN',
      startPh:      '例如 Stair_1',
      destPh:       '例如 NW-412',
      swap:         '交换',
    }
  };

  let lang = 'en';

  // ── DOM refs ──
  const canvas      = document.getElementById('mapcanvas');
  const ctx         = canvas.getContext('2d');
  const loadingEl   = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const statusEl    = document.getElementById('status');
  const inputStart  = document.getElementById('input-start');
  const inputDest   = document.getElementById('input-dest');
  const datalist    = document.getElementById('portal-list');
  const btnNav      = document.getElementById('btn-navigate');
  const btnClear    = document.getElementById('btn-clear');
  const btnSwap     = document.getElementById('btn-swap');
  const btnLang     = document.getElementById('btn-lang');
  const appTitle    = document.getElementById('app-title');
  const labelStart  = document.getElementById('label-start');
  const labelDest   = document.getElementById('label-dest');

  // ── State ──
  let bakedPaths = null;           // the full route dictionary
  let portalIDs  = [];             // sorted list of portal ID strings
  let mapImg     = null;           // HTMLImageElement for the floor plan
  let currentRoute = null;         // array of {x,y} for the active path

  // Camera (pan & zoom in image-pixel space)
  let camX = 0, camY = 0;         // translation offset (screen pixels)
  let camScale = 1;                // zoom factor
  let minScale = 0.1, maxScale = 5;

  // Touch tracking
  let pointers = new Map();        // pointerId → {x, y}
  let lastPinchDist = 0;
  let lastPanX = 0, lastPanY = 0;
  let isDragging = false;

  // ── Helpers ──
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || '';
  }

  function t(key) { return STRINGS[lang][key] || key; }

  function applyLanguage() {
    appTitle.textContent   = t('title');
    labelStart.textContent = t('from');
    labelDest.textContent  = t('to');
    btnNav.textContent     = t('navigate');
    btnClear.textContent   = t('clear');
    btnLang.textContent    = t('lang');
    btnSwap.title          = t('swap');
    inputStart.placeholder = t('startPh');
    inputDest.placeholder  = t('destPh');
    loadingText.textContent = t('loading');
    if (!currentRoute) setStatus(t('ready'));
  }

  // ── Data loading ──
  async function init() {
    try {
      // Load paths and image concurrently
      const [pathsResp, img] = await Promise.all([
        fetch('data/baked_paths.json').then(r => {
          if (!r.ok) throw new Error('Failed to load route data');
          return r.json();
        }),
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Failed to load map image'));
          image.src = 'assets/img/lvl4map.jpg';
        })
      ]);

      bakedPaths = pathsResp;
      mapImg = img;

      // Extract and sort portal IDs
      const idSet = new Set();
      for (const src of Object.keys(bakedPaths)) {
        idSet.add(src);
        for (const dst of Object.keys(bakedPaths[src])) {
          idSet.add(dst);
        }
      }
      portalIDs = [...idSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Populate datalist
      const frag = document.createDocumentFragment();
      for (const id of portalIDs) {
        const opt = document.createElement('option');
        opt.value = id;
        frag.appendChild(opt);
      }
      datalist.appendChild(frag);

      // Set initial camera to fit the image in the viewport
      fitToView();

      // Parse QR-code query params (e.g. ?start=Stair_1)
      const params = new URLSearchParams(window.location.search);
      if (params.has('start')) inputStart.value = params.get('start');
      if (params.has('dest'))  inputDest.value  = params.get('dest');

      // Enable UI
      btnNav.disabled = false;
      loadingEl.classList.add('hidden');
      setStatus(t('ready'));
      draw();

      // Auto-navigate if both params provided
      if (inputStart.value && inputDest.value) {
        navigate();
      }
    } catch (err) {
      console.error(err);
      loadingText.textContent = err.message;
    }
  }

  // ── Camera ──

  function fitToView() {
    if (!mapImg) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    // Fit image into viewport with some padding
    camScale = Math.min(cw / mapImg.width, ch / mapImg.height) * 0.95;
    // Center the image
    camX = (cw - mapImg.width * camScale) / 2;
    camY = (ch - mapImg.height * camScale) / 2;
    minScale = camScale * 0.5;
    maxScale = camScale * 12;
  }

  // ── Corner-rounding with arcTo ──
  // Canvas arcTo draws a true circular arc tangent to both line
  // segments meeting at the corner — it stays tight to the corner
  // instead of cutting inside like a quadratic bezier.

  function drawSmoothRoute(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    // arcTo needs a radius smaller than both adjacent segments,
    // otherwise it produces spikes on short segments.
    const MAX_RADIUS = 30;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1], cur = points[i], next = points[i + 1];
      const lenIn = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      const lenOut = Math.sqrt((next.x - cur.x) ** 2 + (next.y - cur.y) ** 2);
      const r = Math.min(MAX_RADIUS, lenIn * 0.4, lenOut * 0.4);
      ctx.arcTo(cur.x, cur.y, next.x, next.y, r);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // ── Drawing ──

  function draw() {
    // clearRect in CSS-pixel space (DPR transform is active)
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();

    // Apply camera transform (in CSS-pixel space, on top of DPR)
    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    // Draw the floor plan
    if (mapImg) {
      ctx.drawImage(mapImg, 0, 0);
    }

    // Draw active route
    if (currentRoute && currentRoute.length > 1) {
      // Glow layer (wider, semi-transparent)
      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(56, 182, 255, 0.35)';
      ctx.lineWidth = 18 / camScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Core path line
      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = '#38b6ff';
      ctx.lineWidth = 7 / camScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Start marker (green dot)
      const start = currentRoute[0];
      const dotR = 10 / camScale;
      ctx.beginPath();
      ctx.arc(start.x, start.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#3fb950';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / camScale;
      ctx.stroke();

      // End marker (red dot)
      const end = currentRoute[currentRoute.length - 1];
      ctx.beginPath();
      ctx.arc(end.x, end.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#f85149';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / camScale;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Resize handling ──

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width  = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // Debounced resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 100);
  });

  // ── Navigation logic ──

  function navigate() {
    const src = inputStart.value.trim();
    const dst = inputDest.value.trim();

    if (!src || !dst) {
      setStatus(t('ready'));
      return;
    }
    if (src === dst) {
      setStatus(t('same'), 'error');
      return;
    }
    if (!bakedPaths[src]) {
      setStatus(t('invalidStart'), 'error');
      return;
    }
    if (!bakedPaths[src][dst]) {
      // Try reverse lookup — paths might be stored one-directional
      if (bakedPaths[dst] && bakedPaths[dst][src] && bakedPaths[dst][src].length > 0) {
        currentRoute = [...bakedPaths[dst][src]].reverse();
        setStatus(t('routeFound'), 'success');
        panToRoute();
        draw();
        return;
      }
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      draw();
      return;
    }

    const route = bakedPaths[src][dst];
    if (!route || route.length === 0) {
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      draw();
      return;
    }

    currentRoute = route;
    setStatus(t('routeFound'), 'success');
    panToRoute();
    draw();
  }

  // Center the camera on the current route
  function panToRoute() {
    if (!currentRoute || currentRoute.length === 0) return;

    // Compute bounding box of the route in image coords
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of currentRoute) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    const routeW = maxX - minX;
    const routeH = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Fit the route bbox into the viewport with padding
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    const pad = 0.7; // use 70% of viewport for the route
    const scale = Math.min(
      (viewW * pad) / Math.max(routeW, 50),
      (viewH * pad) / Math.max(routeH, 50),
      maxScale
    );
    // Don't zoom in too far on short routes
    camScale = Math.min(scale, camScale * 3, maxScale);
    camScale = Math.max(camScale, minScale);

    // Center on route midpoint
    camX = viewW / 2 - cx * camScale;
    camY = viewH / 2 - cy * camScale;
  }

  function clearRoute() {
    currentRoute = null;
    inputStart.value = '';
    inputDest.value = '';
    setStatus(t('ready'));
    fitToView();
    draw();
  }

  // ── Touch / Mouse Pan & Zoom ──

  function getPointerXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const pt = getPointerXY(e);
    pointers.set(e.pointerId, pt);

    if (pointers.size === 1) {
      isDragging = true;
      lastPanX = pt.x;
      lastPanY = pt.y;
    } else if (pointers.size === 2) {
      isDragging = false;
      const pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const pt = getPointerXY(e);
    pointers.set(e.pointerId, pt);

    if (pointers.size === 1 && isDragging) {
      // Pan
      camX += pt.x - lastPanX;
      camY += pt.y - lastPanY;
      lastPanX = pt.x;
      lastPanY = pt.y;
      draw();
    } else if (pointers.size === 2) {
      // Pinch zoom
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDist > 0) {
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const factor = dist / lastPinchDist;
        zoomAt(midX, midY, factor);
      }
      lastPinchDist = dist;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) isDragging = false;
  });

  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) isDragging = false;
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pt = getPointerXY(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(pt.x, pt.y, factor);
  }, { passive: false });

  function zoomAt(screenX, screenY, factor) {
    const newScale = Math.max(minScale, Math.min(maxScale, camScale * factor));
    const ratio = newScale / camScale;
    // Zoom towards the pointer position
    camX = screenX - (screenX - camX) * ratio;
    camY = screenY - (screenY - camY) * ratio;
    camScale = newScale;
    draw();
  }

  // ── Event wiring ──

  btnNav.addEventListener('click', navigate);
  btnClear.addEventListener('click', clearRoute);

  btnSwap.addEventListener('click', () => {
    const tmp = inputStart.value;
    inputStart.value = inputDest.value;
    inputDest.value = tmp;
  });

  btnLang.addEventListener('click', () => {
    lang = lang === 'en' ? 'zh' : 'en';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyLanguage();
  });

  // Allow Enter key to trigger navigation
  inputStart.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputDest.focus(); });
  inputDest.addEventListener('keydown',  (e) => { if (e.key === 'Enter') { e.target.blur(); navigate(); } });

  // ── Boot ──

  applyLanguage();
  resizeCanvas();
  init();

})();
