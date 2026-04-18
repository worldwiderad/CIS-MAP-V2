// CIS Indoor Navigation — Mobile Viewer

(function () {
  'use strict';

  var S = window.CISShared;
  var STRINGS = S.STRINGS;
  let lang = 'en';
  function displayName(id) { return S.displayName(id, lang); }

  const canvas       = document.getElementById('mapcanvas');
  const ctx          = canvas.getContext('2d');
  const loadingEl    = document.getElementById('loading');
  const loadingText  = document.getElementById('loading-text');
  const statusEl     = document.getElementById('status');
  const btnSwap      = document.getElementById('btn-swap');
  const btnLang      = document.getElementById('btn-lang');
  const langWrap     = document.getElementById('lang-wrap');
  const langDropdown = document.getElementById('lang-dropdown');
  const appTitle     = document.getElementById('app-title');
  const floorBadge   = document.getElementById('floor-badge');
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
  const panelTitle   = document.getElementById('panel-title');

  let bakedPaths = null;
  let portalIDs  = [];
  let mapImg     = null;
  let currentRoute = null;
  let startValue = '';
  let destValue  = '';
  let camX = 0, camY = 0;
  let camScale = 1;
  let minScale = 0.1, maxScale = 5;
  let panelTarget = null;
  let exactMatchTimer = null;
  let dashOffset = 0;
  let animFrameId = null;
  let lastAnimTime = 0;

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = '';
    if (msg) {
      statusEl.classList.add('visible');
      if (cls) statusEl.classList.add(cls);
    }
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
  }

  function applyLanguage() {
    appTitle.textContent    = t('title');
    floorBadge.textContent  = t('floorBadge');
    labelStart.textContent  = t('from');
    labelDest.textContent   = t('to');
    btnSwap.title           = t('swap');
    loadingText.textContent = t('loading');
    panelSearch.placeholder = t('searchPh');
    updatePills();
    buildLocationList();
    if (currentRoute) {
      var info = computeRouteInfo(currentRoute);
      setStatus(
        displayName(startValue) + ' \u2192 ' + displayName(destValue) + '  \u00B7  ' +
        t('routeInfo').replace('{dist}', info.meters).replace('{time}', info.minutes),
        'success'
      );
    }
  }

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

      var idSet = new Set();
      for (var src of Object.keys(bakedPaths)) {
        idSet.add(src);
        for (var dst of Object.keys(bakedPaths[src])) {
          idSet.add(dst);
        }
      }
      portalIDs = S.sortPortalIDs([...idSet]);

      buildLocationList();
      fitToView();

      startValue = 'Stair_2';

      var params = new URLSearchParams(window.location.search);
      if (params.has('start')) startValue = params.get('start');
      if (params.has('dest'))  destValue  = params.get('dest');

      updatePills();
      loadingEl.classList.add('hidden');

      if (startValue && destValue) {
        navigate();
      } else {
        draw();
      }
    } catch (err) {
      console.error(err);
      loadingText.textContent = err.message;
    }
  }

  function buildLocationList() {
    S.buildLocationList({ listEl: panelList, ids: portalIDs, lang: lang, onPick: selectLocation });
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
    tryNavigate();
  }

  function openPanel(target) {
    panelTarget = target;
    var currentVal = target === 'start' ? startValue : destValue;
    panelSearch.value = '';
    panelTitle.textContent = target === 'start' ? t('selectStart') : t('selectDest');
    filterList('');
    S.highlightCurrentValue(panelList, currentVal);
    locationPanel.classList.remove('panel-hidden');
    setTimeout(function() { panelSearch.focus(); }, 320);
  }

  function closePanel() {
    locationPanel.classList.add('panel-hidden');
    panelTarget = null;
    panelSearch.blur();
    clearTimeout(exactMatchTimer);
  }

  function filterList(query) {
    clearTimeout(exactMatchTimer);
    S.filterLocationList(panelList, query, lang, function(id) {
      exactMatchTimer = setTimeout(function() { selectLocation(id); }, 400);
    });
  }

  function clampPan() {
    if (!mapImg) return;
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;
    var mw = mapImg.width * camScale;
    var mh = mapImg.height * camScale;

    if (mw <= cw) {
      camX = (cw - mw) / 2;
    } else {
      camX = Math.min(camX, 0);
      camX = Math.max(camX, cw - mw);
    }

    if (mh <= ch) {
      camY = (ch - mh) / 2;
    } else {
      camY = Math.min(camY, 0);
      camY = Math.max(camY, ch - mh);
    }
  }

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

  function drawMapPin(px, py, color, r) {
    ctx.save();
    ctx.translate(px, py);
    var s = r / 10;
    ctx.scale(s, s);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-2, -5, -10, -11, -10, -18);
    ctx.arc(0, -18, 10, Math.PI, 0, false);
    ctx.bezierCurveTo(10, -11, 2, -5, 0, 0);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / (camScale * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -18, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();
  }

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

    if (currentRoute && currentRoute.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 16 / camScale;
      ctx.stroke();

      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(218, 41, 28, 0.15)';
      ctx.lineWidth = 12 / camScale;
      ctx.stroke();

      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = '#DA291C';
      ctx.lineWidth = 5 / camScale;
      ctx.stroke();

      drawSmoothRoute(currentRoute);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 3 / camScale;
      ctx.setLineDash([8 / camScale, 24 / camScale]);
      ctx.lineDashOffset = dashOffset / camScale;
      ctx.stroke();
      ctx.setLineDash([]);

      var start = currentRoute[0];
      var dotR = 9 / camScale;
      ctx.beginPath();
      ctx.arc(start.x, start.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#4285F4';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5 / camScale;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(start.x, start.y, dotR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      var end = currentRoute[currentRoute.length - 1];
      drawMapPin(end.x, end.y, '#DA291C', 14 / camScale);
    }

    ctx.restore();
  }

  function startAnimation() {
    if (animFrameId) return;
    lastAnimTime = 0;
    animFrameId = requestAnimationFrame(animTick);
  }

  function stopAnimation() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function animTick(now) {
    if (!currentRoute) {
      animFrameId = null;
      return;
    }
    if (!lastAnimTime) lastAnimTime = now;
    var dt = Math.min((now - lastAnimTime) / 1000, 0.1);
    lastAnimTime = now;
    dashOffset -= 40 * dt;
    draw();
    animFrameId = requestAnimationFrame(animTick);
  }

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

  function tryNavigate() {
    if (startValue && destValue) {
      navigate();
    } else if (currentRoute) {
      currentRoute = null;
      stopAnimation();
      setStatus('');
      draw();
    }
  }

  function navigate() {
    var src = startValue.trim();
    var dst = destValue.trim();

    if (!src || !dst) return;

    if (src === dst) {
      setStatus(t('same'), 'error');
      currentRoute = null;
      stopAnimation();
      draw();
      return;
    }
    if (!bakedPaths[src]) {
      setStatus(t('invalidStart'), 'error');
      currentRoute = null;
      stopAnimation();
      draw();
      return;
    }
    if (!bakedPaths[src][dst]) {
      if (bakedPaths[dst] && bakedPaths[dst][src] && bakedPaths[dst][src].length > 0) {
        currentRoute = [...bakedPaths[dst][src]].reverse();
        var info1 = computeRouteInfo(currentRoute);
        setStatus(
          displayName(src) + ' \u2192 ' + displayName(dst) + '  \u00B7  ' +
          t('routeInfo').replace('{dist}', info1.meters).replace('{time}', info1.minutes),
          'success'
        );
        panToRoute();
        startAnimation();
        return;
      }
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      stopAnimation();
      draw();
      return;
    }

    var route = bakedPaths[src][dst];
    if (!route || route.length === 0) {
      setStatus(t('noRoute'), 'error');
      currentRoute = null;
      stopAnimation();
      draw();
      return;
    }

    currentRoute = route;
    var info = computeRouteInfo(currentRoute);
    setStatus(
      displayName(src) + ' \u2192 ' + displayName(dst) + '  \u00B7  ' +
      t('routeInfo').replace('{dist}', info.meters).replace('{time}', info.minutes),
      'success'
    );
    panToRoute();
    startAnimation();
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
    clampPan();
  }

  function getCanvasXY(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function zoomAt(screenX, screenY, factor) {
    var fitScale = Math.min(canvas.clientWidth / mapImg.width, canvas.clientHeight / mapImg.height) * 0.95;
    var newScale = Math.max(fitScale, Math.min(fitScale * 12, camScale * factor));
    var ratio = newScale / camScale;
    camX = screenX - (screenX - camX) * ratio;
    camY = screenY - (screenY - camY) * ratio;
    camScale = newScale;
    clampPan();
    draw();
  }

  var pointers = new Map();
  var lastPinchDist = 0;

  canvas.addEventListener('pointerdown', function(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, getCanvasXY(e.clientX, e.clientY));
    if (pointers.size === 2) {
      var pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  });

  canvas.addEventListener('pointermove', function(e) {
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId);
    var cur = getCanvasXY(e.clientX, e.clientY);
    pointers.set(e.pointerId, cur);

    if (pointers.size === 1) {
      camX += cur.x - prev.x;
      camY += cur.y - prev.y;
      clampPan();
      if (!animFrameId) draw();
    } else if (pointers.size === 2) {
      var pts = [...pointers.values()];
      var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDist > 0 && mapImg) {
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
    var pt = getCanvasXY(e.clientX, e.clientY);
    zoomAt(pt.x, pt.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  btnSwap.addEventListener('click', function() {
    var tmp = startValue;
    startValue = destValue;
    destValue = tmp;
    updatePills();
    tryNavigate();
  });

  btnLang.addEventListener('click', function(e) {
    e.stopPropagation();
    langDropdown.classList.toggle('dropdown-hidden');
  });

  document.addEventListener('click', function(e) {
    if (!langWrap.contains(e.target)) {
      langDropdown.classList.add('dropdown-hidden');
    }
  });

  langDropdown.addEventListener('click', function(e) {
    var option = e.target.closest('.lang-option');
    if (!option) return;
    var newLang = option.getAttribute('data-lang');
    if (newLang !== lang) {
      lang = newLang;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      langDropdown.querySelectorAll('.lang-option').forEach(function(opt) {
        opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
      });
      applyLanguage();
    }
    langDropdown.classList.add('dropdown-hidden');
  });

  pillStart.addEventListener('click', function() { openPanel('start'); });
  pillDest.addEventListener('click', function() { openPanel('dest'); });
  panelBack.addEventListener('click', closePanel);
  panelSearch.addEventListener('input', function() {
    filterList(panelSearch.value);
  });

  applyLanguage();
  resizeCanvas();
  init();

})();
