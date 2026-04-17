// Shared constants + helpers used by both 2D viewer and 3D navigator.
(function (root) {
  'use strict';

  var STRINGS = {
    en: {
      title:        'MAP',
      floorBadge:   'Level 4 Demo',
      from:         'From',
      to:           'To',
      loading:      'Loading map\u2026',
      noRoute:      'No route found between these locations',
      invalidStart: 'Unknown start location',
      invalidDest:  'Unknown destination',
      same:         'Start and destination are the same',
      swap:         'Swap',
      tapToSelect:  'Tap to select',
      searchPh:     'Search locations\u2026',
      routeInfo:    '~{dist}m \u00B7 about {time} min',
      selectStart:  'Select starting point',
      selectDest:   'Select destination',
    },
    zh: {
      title:        '\u5730\u56FE',
      floorBadge:   '4\u697C \u6F14\u793A',
      from:         '\u8D77\u70B9',
      to:           '\u7EC8\u70B9',
      loading:      '\u52A0\u8F7D\u5730\u56FE\u4E2D\u2026',
      noRoute:      '\u672A\u627E\u5230\u8FD9\u4E24\u4E2A\u4F4D\u7F6E\u4E4B\u95F4\u7684\u8DEF\u7EBF',
      invalidStart: '\u672A\u77E5\u7684\u8D77\u70B9\u4F4D\u7F6E',
      invalidDest:  '\u672A\u77E5\u7684\u7EC8\u70B9\u4F4D\u7F6E',
      same:         '\u8D77\u70B9\u548C\u7EC8\u70B9\u76F8\u540C',
      swap:         '\u4EA4\u6362',
      tapToSelect:  '\u70B9\u51FB\u9009\u62E9',
      searchPh:     '\u641C\u7D22\u4F4D\u7F6E\u2026',
      routeInfo:    '~{dist} \u7C73 \u00B7 \u7EA6 {time} \u5206\u949F',
      selectStart:  '\u9009\u62E9\u8D77\u70B9',
      selectDest:   '\u9009\u62E9\u7EC8\u70B9',
    }
  };

  var CATEGORIES = [
    { key: 'ew',    label: { en: 'East Wing',   zh: '\u4E1C\u7FFC' }, match: function(id) { return id.startsWith('EW') && !id.includes('Elevator'); } },
    { key: 'nw',    label: { en: 'North Wing',  zh: '\u5317\u7FFC' }, match: function(id) { return id.startsWith('NW') && !id.includes('Elevator'); } },
    { key: 'ww',    label: { en: 'West Wing',   zh: '\u897F\u7FFC' }, match: function(id) { return id.startsWith('WW') && !id.includes('Elevator'); } },
    { key: 'stair', label: { en: 'Stairs',      zh: '\u697C\u68AF' }, match: function(id) { return id.startsWith('Stair'); } },
    { key: 'elev',  label: { en: 'Elevators',   zh: '\u7535\u68AF' }, match: function(id) { return id.includes('Elevator'); } },
    { key: 'other', label: { en: 'Facilities',  zh: '\u8BBE\u65BD' }, match: function() { return true; } },
  ];

  var DISPLAY_NAMES = {
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

  function displayName(id, lang) {
    if (DISPLAY_NAMES[lang] && DISPLAY_NAMES[lang][id]) return DISPLAY_NAMES[lang][id];
    var name = id.replace(/_/g, '-');
    if (lang === 'zh') name = name.replace(/^Stair/, '\u697C\u68AF');
    return name;
  }

  function sortKey(id) {
    return id.replace(/[-_]/g, '-').toLowerCase();
  }

  function sortPortalIDs(ids) {
    return ids.slice().sort(function(a, b) {
      return sortKey(a).localeCompare(sortKey(b), undefined, { numeric: true });
    });
  }

  // Populate a panel-list element with grouped, sorted location buttons.
  // opts: { listEl, ids, lang, onPick(id), currentStart, currentDest }
  function buildLocationList(opts) {
    var listEl = opts.listEl;
    var lang = opts.lang;
    var ids = sortPortalIDs(opts.ids);
    listEl.innerHTML = '';
    if (!ids.length) return;

    var assigned = new Set();
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var catIds = ids.filter(function(id) { return !assigned.has(id) && cat.match(id); });
      if (!catIds.length) continue;
      catIds.forEach(function(id) { assigned.add(id); });

      var header = document.createElement('div');
      header.className = 'loc-group-header';
      header.setAttribute('data-cat', cat.key);
      header.textContent = cat.label[lang] || cat.label.en;
      listEl.appendChild(header);

      for (var j = 0; j < catIds.length; j++) {
        var btn = document.createElement('button');
        btn.className = 'loc-item';
        btn.setAttribute('data-id', catIds[j]);
        btn.textContent = displayName(catIds[j], lang);
        (function(id) {
          btn.addEventListener('click', function() { opts.onPick(id); });
        })(catIds[j]);
        listEl.appendChild(btn);
      }
    }
  }

  function filterLocationList(listEl, query, lang, onExactMatch) {
    var q = query.trim().toLowerCase();
    var visibleCount = 0;
    var lastVisibleId = null;
    var items = listEl.querySelectorAll('.loc-item');
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-id');
      var name = displayName(id, lang).toLowerCase();
      var match = !q || id.toLowerCase().includes(q) || name.includes(q);
      items[i].style.display = match ? '' : 'none';
      if (match) { visibleCount++; lastVisibleId = id; }
    }
    var headers = listEl.querySelectorAll('.loc-group-header');
    for (var h = 0; h < headers.length; h++) {
      var next = headers[h].nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('loc-group-header')) {
        if (next.style.display !== 'none') { hasVisible = true; break; }
        next = next.nextElementSibling;
      }
      headers[h].style.display = hasVisible ? '' : 'none';
    }
    if (q && visibleCount === 1 && lastVisibleId && lastVisibleId.toLowerCase() === q && onExactMatch) {
      onExactMatch(lastVisibleId);
    }
  }

  function highlightCurrentValue(listEl, currentVal) {
    var items = listEl.querySelectorAll('.loc-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('current-value', items[i].getAttribute('data-id') === currentVal);
    }
  }

  root.CISShared = {
    STRINGS: STRINGS,
    CATEGORIES: CATEGORIES,
    DISPLAY_NAMES: DISPLAY_NAMES,
    displayName: displayName,
    sortKey: sortKey,
    sortPortalIDs: sortPortalIDs,
    buildLocationList: buildLocationList,
    filterLocationList: filterLocationList,
    highlightCurrentValue: highlightCurrentValue,
  };
})(window);
