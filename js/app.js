// ============================================================================
//  CIS Indoor Navigation — Mobile Viewer
// ============================================================================
//  This app does ZERO pathfinding. It simply:
//    1. Loads the pre-baked route dictionary (baked_paths.json)
//    2. Populates a grouped location list from the portal IDs
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
      loading:      'Loading map\u2026',
      ready:        'Select start and destination',
      noRoute:      'No route found between these locations',
      routeFound:   'Route displayed',
      invalidStart: 'Unknown start location',
      invalidDest:  'Unknown destination',
      same:         'Start and destination are the same',
      lang:         '\u4E2D\u6587',
      swap:         'Swap',
      tapToSelect:  'Tap to select',
      searchPh:     'Search locations\u2026',
      routeInfo:    '~{dist}m \u00B7 about {time} min',
      selectStart:  'Select starting point',
      selectDest:   'Select destination',
    },
    zh: {
      title:        'CIS \u6821\u56ED\u5BFC\u822A',
      from:         '\u8D77\u70B9',
      to:           '\u7EC8\u70B9',
      navigate:     '\u5BFC\u822A',
      clear:        '\u6E05\u9664',
      loading:      '\u52A0\u8F7D\u5730\u56FE\u4E2D\u2026',
      ready:        '\u8BF7\u9009\u62E9\u8D77\u70B9\u548C\u7EC8\u70B9',
      noRoute:      '\u672A\u627E\u5230\u8FD9\u4E24\u4E2A\u4F4D\u7F6E\u4E4B\u95F4\u7684\u8DEF\u7EBF',
      routeFound:   '\u8DEF\u7EBF\u5DF2\u663E\u793A',
      invalidStart: '\u672A\u77E5\u7684\u8D77\u70B9\u4F4D\u7F6E',
      invalidDest:  '\u672A\u77E5\u7684\u7EC8\u70B9\u4F4D\u7F6E',
      same:         '\u8D77\u70B9\u548C\u7EC8\u70B9\u76F8\u540C',
      lang:         'EN',
      swap:         '\u4EA4\u6362',
      tapToSelect:  '\u70B9\u51FB\u9009\u62E9',
      searchPh:     '\u641C\u7D22\u4F4D\u7F6E\u2026',
      routeInfo:    '~{dist} \u7C73 \u00B7 \u7EA6 {time} \u5206\u949F',
      selectStart:  '\u9009\u62E9\u8D77\u70B9',
      selectDest:   '\u9009\u62E9\u7EC8\u70B9',
    }
  };

  let lang = 'en';

  // ── Location categories ──
  const CATEGORIES = [
    { key: 'nw',    label: { en: 'NW Wing',     zh: 'NW \u6559\u5BA4' },   match: function(id) { return id.startsWith('NW'); } },
    { key: 'ew',    label: { en: 'EW Wing',     zh: 'EW \u6559\u5BA4' },   match: function(id) { return id.startsWith('EW'); } },
    { key: 'ww',    label: { en: 'WW Wing',     zh: 'WW \u6559\u5BA4' },   match: function(id) { return id.startsWith('WW'); } },
    { key: 'stair', label: { en: 'Stairs',      zh: '\u697C\u68AF' },       match: function(id) { return id.startsWith('Stair'); } },
    { key: 'elev',  label: { en: 'Elevators',   zh: '\u7535\u68AF' },       match: function(id) { return id.includes('Elevator'); } },
    { key: 'other', label: { en: 'Facilities',  zh: '\u8BBE\u65BD' },       match: function() { return true; } },
  ];

  // ── Display names for non-obvious portal IDs ──
  const DISPLAY_NAMES = {
    en: {
      'Pod_A_WC_Girls':  'Girls WC (Pod A)',
      'Pod_A_WC_Boys':   'Boys WC (Pod A)',
      'Pod_C_WC_boys':   'Boys WC (Pod C)',
      'Pod_C_WC_Girls':  'Girls WC (Pod C)',
      'SW_Elevator':     'SW Elevator',
      'NW_Elevator':     'NW Elevator',
      'Secondary_Office': 'Secondary Office',
    },
    zh: {
      'Pod_A_WC_Girls':  '\u5973\u6D17\u624B\u95F4 (A\u533A)',
      'Pod_A_WC_Boys':   '\u7537\u6D17\u624B\u95F4 (A\u533A)',
      'Pod_C_WC_boys':   '\u7537\u6D17\u624B\u95F4 (C\u533A)',
      'Pod_C_WC_Girls':  '\u5973\u6D17\u624B\u95F4 (C\u533A)',
      'SW_Elevator':     '\u897F\u5357\u7535\u68AF',
      'NW_Elevator':     '\u897F\u5317\u7535\u68AF',
      'Secondary_Office': '\u4E2D\u5B66\u529E\u516C\u5BA4',
    }
  };

  function displayName(id) {
    if (DISPLAY_NAMES[lang] && DISPLAY_NAMES[lang][id]) return DISPLAY_NAMES[lang][id];
    return id.replace(/_/g, ' ').replace(/-/g, '\u2011');
  }

  // ── DOM refs ──
  const canvas       = document.getElementById('mapcanvas');
  const ctx          = canvas.getContext('2d');
  const loadingEl    = document.getElementById('loading');
  const loadingText  = document.getElementById('loading-text');
  const statusEl     = document.getElementById('status');
  const btnNav       = document.getElementById('btn-navigate');
  const btnClear     = document.getElementById('btn-clear');
  const btnSwap      = document.getElementById('btn-swap');
  const btnLang      = document.getElementById('btn-lang');
  const appTitle     = document.getElementById('app-title');
  const labelStart   = document.getElementById('label-start');
  const labelDest    = document.getElementById('label-dest');
  const pillStart    = document.getElementById('pill-start');
  const pillDest     = document.getElementById('pill-dest');
  const pillStartVal = document.getElementById('pill-start-value');
  const pillDestVal  = document.getElementById('pill-dest-value');
  const locationPanel = document.getElementById('location-panel');
  const panelSearch  = document.getElementById('panel-search');
  const panelList    = document.getElementById('panel-list');
  const panelBack    = document.getElementById('panel-back');
  const panelClearSearch = document.getElementById('panel-clear-search');
  const panelTitle   = document.getElementById('panel-title');

  // ── State ──
  let bakedPaths = null;
  let portalIDs  = [];
  let mapImg     = null;
  let currentRoute = null;

  let startValue = '';
  let destValue  = '';

  // Camera (pan & zoom in image-pixel space)
  let camX = 0, camY = 0;
  let camScale = 1;
  let minScale = 0.1, maxScale = 5;

  // Panel state
  let panelTarget = null;
  let exactMatchTimer = null;

  // ── Helpers ──
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || '';
  }

  function t(key) { return STRINGS[lang][key] || key; }

  function updatePills() {
    if (startValue) {
      pillStartVal.textContent = displayName(startValue);
      pillStartVal.classList.remove('placeholder');
    } else {
      pillStartVal.textContent = t('tapToSelect');
      pillStartVal.classList.add('placeholder');
    }
    if (destValue) {
      pillDestVal.textContent = displayName(destValue);
      pillDestVal.classList.remove('placeholder');
    } else {
      pillDestVal.textContent = t('tapToSelect');
      pillDestVal.classList.add('placeholder');
    }
    btnNav.disabled = !(startValue && destValue);
  }

  function applyLanguage() {
    appTitle.textContent   = t('title');
    labelStart.textContent = t('from');
    labelDest.textContent  = t('to');
    btnNav.textContent     = t('navigate');
    btnClear.textContent   = t('clear');
    btnSwap.title          = t('swap');
    loadingText.textContent = t('loading');
    panelSearch.placeholder = t('searchPh');
    updatePills();
    if (!currentRoute) setStatus(t('ready'));
    buildLocationList();
  }

  // ── Data loading ──
  async function init() {
    try {
      const [pathsResp, img] = await Promise.all([
        fetch('data/baked_paths.json').then(function(r) {
          if (!r.ok) throw new Error('Failed to load route data');
          return r.json();
        }),
        new Promise(function(resolve, reject) {
          var image = new Image();
          image.onload = function() { resolve(image); };
          image.onerror = function() { reject(new Error('Failed to load map image')); };
          image.src = 'assets/img/lvl4map.jpg';
        })
      ]);

      bakedPaths = pathsResp;
      mapImg = img;

      // Extract and sort portal IDs
      var idSet = new Set();
      for (var src of Object.keys(bakedPaths)) {
        idSet.add(src);
        for (var dst of Object.keys(bakedPaths[src])) {
          idSet.add(dst);
        }
      }
      portalIDs = [...idSet].sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); });

      buildLocationList();
      fitToView();

      // Parse QR-code query params
      var params = new URLSearchParams(window.location.search);
      if (params.has('start')) {
        startValue = params.get('start');
      }
      if (params.has('dest')) {
        destValue = params.get('dest');
      }

      updatePills();
      btnNav.disabled = !(startValue && destValue);
      loadingEl.classList.add('hidden');
      setStatus(t('ready'));
      draw();

      if (startValue && destValue) {
        navigate();
      }
    } catch (err) {
      console.error(err);
      loadingText.textContent = err.message;
    }
  }

  // ── Location list ──
  function buildLocationList() {
    panelList.innerHTML = '';
    if (!portalIDs.length) return;

    var assigned = new Set();
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var ids = portalIDs.filter(function(id) {
        return !assigned.has(id) && cat.match(id);
      });
      if (!ids.length) continue;
      ids.forEach(function(id) { assigned.add(id); });

      var header = document.createElement('div');
      header.className = 'loc-group-header';
      header.setAttribute('data-cat', cat.key);
      header.textContent = cat.label[lang] || cat.label.en;
      panelList.appendChild(header);

      for (var j = 0; j < ids.length; j++) {
        var btn = document.createElement('button');
        btn.className = 'loc-item';
        btn.setAttribute('data-id', ids[j]);
        btn.textContent = displayName(ids[j]);
        if (ids[j] !== displayName(ids[j]).replace(/\u2011/g, '-')) {
          var span = document.createElement('span');
          span.className = 'loc-id';
          span.textContent = ids[j];
          btn.appendChild(span);
        }
        btn.addEventListener('click', onLocationClick);
        panelList.appendChild(btn);
      }
    }
  }

  function onLocationClick(e) {
    var btn = e.currentTarget;
    var id = btn.getAttribute('data-id');
    selectLocation(id);
  }

  function selectLocation(id) {
    clearTimeout(exactMatchTimer);
    if (panelTarget === 'start') {
      startValue = id;
    } else {
      destValue = id;
    }
    updatePills();
    closePanel();
  }

  // ── Panel open/close ──
  function openPanel(target) {
    panelTarget = target;
    var currentVal = target === 'start' ? startValue : destValue;
    panelSearch.value = '';
    panelTitle.textContent = target === 'start' ? t('selectStart') : t('selectDest');
    filterList('');
    highlightCurrentValue(currentVal);
    locationPanel.classList.remove('panel-hidden');
    setTimeout(function() { panelSearch.focus(); }, 320);
  }

  function closePanel() {
    locationPanel.classList.add('panel-hidden');
    panelTarget = null;
    panelSearch.blur();
    clearTimeout(exactMatchTimer);
  }

  function highlightCurrentValue(currentVal) {
    var items = panelList.querySelectorAll('.loc-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-id') === currentVal) {
        items[i].classList.add('current-value');
      } else {
        items[i].classList.remove('current-value');
      }
    }
  }

  function filterList(query) {
    var q = query.trim().toLowerCase();
    var visibleCount = 0;
    var lastVisibleId = null;

    var items = panelList.querySelectorAll('.loc-item');
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-id');
      var name = displayName(id).toLowerCase();
      var match = !q || id.toLowerCase().includes(q) || name.includes(q);
      items[i].style.display = match ? '' : 'none';
      if (match) { visibleCount++; lastVisibleId = id; }
    }

    // Hide empty group headers
    var headers = panelList.querySelectorAll('.loc-group-header');
    for (var h = 0; h < headers.length; h++) {
      var next = headers[h].nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('loc-group-header')) {
        if (next.style.display !== 'none') { hasVisible = true; break; }
        next = next.nextElementSibling;
      }
      headers[h].style.display = hasVisible ? '' : 'none';
    }

    // Exact match auto-select
    clearTimeout(exactMatchTimer);
    if (q && visibleCount === 1 && lastVisibleId && lastVisibleId.toLowerCase() === q) {
      exactMatchTimer = setTimeout(function() { selectLocation(lastVisibleId); }, 400);
    }
  }

  // ── Camera ──
  function fitToView() {
    if (!mapImg) return;
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;
    camScale = Math.min(cw / mapImg.width, ch / mapImg.height) * 0.95;
    camX = (cw - mapImg.width * camScale) / 2;
    camY = (ch - mapImg.height * camScale) / 2;
    minScale = camScale * 0.5;
    maxScale = camScale * 12;
  }

  // ── Corner-rounding with arcTo ──
  function drawSmoothRoute(points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    var MAX_RADIUS = 30;
    for (var i = 1; i < points.length - 1; i++) {
      var prev = points[i - 1], cur = points[i], next = points[i + 1];
      var lenIn = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      var lenOut = Math.sqrt((next.x - cur.x) ** 2 + (next.y - cur.y) ** 2);
      var r = Math.min(MAX_RADIUS, lenIn * 0.4, lenOut * 0.4);
      ctx.arcTo(cur.x, cur.y, next.x, next.y, r);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // ── Drawing ──
  function draw() {
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();

    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    if (mapImg) {
      ctx.drawImage(mapImg, 0, 0);
    }

    // Draw active route
    if (currentRoute && currentRoute.length > 1) {
      // White halo for contrast on varied backgrounds
      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 22 / camScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Red glow layer
      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(196, 30, 58, 0.20)';
      ctx.lineWidth = 18 / camScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Core path line (CIS red)
      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = '#C41E3A';
      ctx.lineWidth = 7 / camScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Start marker (green dot)
      var start = currentRoute[0];
      var dotR = 10 / camScale;
      ctx.beginPath();
      ctx.arc(start.x, start.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#16A34A';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / camScale;
      ctx.stroke();

      // End marker (red dot)
      var end = currentRoute[currentRoute.length - 1];
      ctx.beginPath();
      ctx.arc(end.x, end.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#C41E3A';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / camScale;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Resize handling ──
  function resizeCanvas() {
    var wrap = canvas.parentElement;
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width  = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 100);
  });

  // ── Route info ──
  function computeRouteInfo(route) {
    var totalDist = 0;
    for (var i = 1; i < route.length; i++) {
      var dx = route[i].x - route[i - 1].x;
      var dy = route[i].y - route[i - 1].y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    var meters = Math.round(totalDist * 0.05);
    var minutes = Math.max(1, Math.ceil((meters / 1.2) / 60));
    return { meters: meters, minutes: minutes };
  }

  // ── Navigation logic ──
  function navigate() {
    var src = startValue.trim();
    var dst = destValue.trim();

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
      if (bakedPaths[dst] && bakedPaths[dst][src] && bakedPaths[dst][src].length > 0) {
        currentRoute = [...bakedPaths[dst][src]].reverse();
        var info1 = computeRouteInfo(currentRoute);
        setStatus(displayName(src) + ' \u2192 ' + displayName(dst) + '  \u00B7  ' + t('routeInfo').replace('{dist}', info1.meters).replace('{time}', info1.minutes), 'success');
        panToRoute();
        draw();
        return;
      }
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      draw();
      return;
    }

    var route = bakedPaths[src][dst];
    if (!route || route.length === 0) {
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      draw();
      return;
    }

    currentRoute = route;
    var info = computeRouteInfo(currentRoute);
    setStatus(displayName(src) + ' \u2192 ' + displayName(dst) + '  \u00B7  ' + t('routeInfo').replace('{dist}', info.meters).replace('{time}', info.minutes), 'success');
    panToRoute();
    draw();
  }

  function panToRoute() {
    if (!currentRoute || currentRoute.length === 0) return;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < currentRoute.length; i++) {
      var pt = currentRoute[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    var routeW = maxX - minX;
    var routeH = maxY - minY;
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;

    var viewW = canvas.clientWidth;
    var viewH = canvas.clientHeight;
    var pad = 0.7;
    var scale = Math.min(
      (viewW * pad) / Math.max(routeW, 50),
      (viewH * pad) / Math.max(routeH, 50),
      maxScale
    );
    camScale = Math.min(scale, camScale * 3, maxScale);
    camScale = Math.max(camScale, minScale);

    camX = viewW / 2 - cx * camScale;
    camY = viewH / 2 - cy * camScale;
  }

  function clearRoute() {
    currentRoute = null;
    startValue = '';
    destValue = '';
    updatePills();
    setStatus(t('ready'));
    fitToView();
    draw();
  }

  // ── Pinch Zoom ──
  let pointers = new Map();
  let lastPinchDist = 0;

  function getPointerXY(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function zoomAt(screenX, screenY, factor) {
    var fitScale = Math.min(canvas.clientWidth / mapImg.width, canvas.clientHeight / mapImg.height) * 0.95;
    var newScale = Math.max(fitScale, Math.min(fitScale * 12, camScale * factor));
    var ratio = newScale / camScale;
    camX = screenX - (screenX - camX) * ratio;
    camY = screenY - (screenY - camY) * ratio;
    camScale = newScale;
    draw();
  }

  canvas.addEventListener('pointerdown', function(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, getPointerXY(e));
    if (pointers.size === 2) {
      var pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  });

  canvas.addEventListener('pointermove', function(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, getPointerXY(e));
    if (pointers.size === 2) {
      var pts = [...pointers.values()];
      var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDist > 0) {
        var midX = (pts[0].x + pts[1].x) / 2;
        var midY = (pts[0].y + pts[1].y) / 2;
        zoomAt(midX, midY, dist / lastPinchDist);
      }
      lastPinchDist = dist;
    }
  });

  canvas.addEventListener('pointerup', function(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
  });

  canvas.addEventListener('pointercancel', function(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
  });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (!mapImg) return;
    var pt = getPointerXY(e);
    zoomAt(pt.x, pt.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // ── Event wiring ──
  btnNav.addEventListener('click', navigate);
  btnClear.addEventListener('click', clearRoute);

  btnSwap.addEventListener('click', function() {
    var tmp = startValue;
    startValue = destValue;
    destValue = tmp;
    updatePills();
  });

  btnLang.addEventListener('click', function() {
    lang = lang === 'en' ? 'zh' : 'en';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyLanguage();
  });

  // Panel wiring
  pillStart.addEventListener('click', function() { openPanel('start'); });
  pillDest.addEventListener('click', function() { openPanel('dest'); });
  panelBack.addEventListener('click', closePanel);
  panelClearSearch.addEventListener('click', function() {
    panelSearch.value = '';
    filterList('');
    panelSearch.focus();
  });
  panelSearch.addEventListener('input', function() {
    filterList(panelSearch.value);
  });

  // ── Boot ──
  applyLanguage();
  resizeCanvas();
  init();

})();
