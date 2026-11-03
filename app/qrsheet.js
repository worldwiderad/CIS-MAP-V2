// The door labels sheet (app/qr.html): a QR code for every place on a floor, each opening the
// map with that door as "you are here". Every code is read back by the browser's own barcode
// reader where it has one, so a label that would not scan is caught before it is printed.

import { Router } from '../routing/engine.mjs';
import { loadFloors, getJSON, useRouting } from './floors.js';
import { Places, nearText } from './search.js';
import { qr, qrPath } from './qr.js';
import { floorLabel, placeTitle, t } from './i18n.js';

const ROOT = '../';
const QUIET = 2;   // the white margin round each code, in its own squares
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem('cismap.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cismap.' + k, v); } catch { /* fine without */ } },
};

// The page's own words; the labels themselves always carry both languages.
const STR = {
  en: {
    title: 'Door labels', base: 'Each code opens', floor: 'Floor', find: 'Find a label',
    findHint: 'a code or a name, on any floor', rooms: 'rooms', stairs: 'stairs', lifts: 'lifts', print: 'Print',
    note: 'Each label\'s code opens the map with that door as the starting point, marked "you are here". '
      + 'Set the address above to where the app is published before printing. The sheet prints twelve labels '
      + 'to an A4 page, three across and four down, 62 × 68 mm each, with dashed cut lines. To replace one label, find it and print just that.',
    badBase: 'That is not a web address the codes can open: it should start with https://',
    reading: n => `${labels(n)}. Reading each code back…`,
    noReader: n => `${labels(n)}. This browser has no barcode reader to check them with (Chrome has one).`,
    bad: (n, b) => `${labels(n)}; ${b} did not read back as ${b === 1 ? 'its' : 'their'} link (outlined in red). Do not print ${b === 1 ? 'it' : 'those'}.`,
    good: n => `${labels(n)}; ${n === 1 ? 'its code reads' : 'every code reads'} back as its link.`,
    tight: n => ` ${n === 1 ? 'One name is' : `${n} names are`} too long to print whole (outlined): shorten ${n === 1 ? 'it' : 'them'} in the map first.`,
    none: 'No label matches that.', lang: '中文', langLabel: '切换到中文',
    hidden: 'It is there, but the boxes above leave it out: tick rooms, stairs or lifts.',
    dropped: part => ` The address's "${part}" is left out: each code carries only its door.`,
    capped: (n, all) => ` Only the first ${n} of the ${all} labels that match are shown: narrow the search, or print a floor at a time.`,
  },
  zh: {
    title: '门牌二维码', base: '二维码打开的网址', floor: '楼层', find: '查找门牌',
    findHint: '编号或名称，任何楼层', rooms: '房间', stairs: '楼梯', lifts: '电梯', print: '打印',
    note: '每张门牌的二维码会打开地图，并以该门为起点，标记“您在这里”。打印前请把上面的网址设为应用发布的地址。'
      + '每张 A4 纸印十二张（横三竖四），每张 62 × 68 毫米，带虚线裁切线。要更换一张门牌，查找到它后单独打印即可。',
    badBase: '这不是二维码可以打开的网址：应以 https:// 开头',
    reading: n => `共 ${n} 张门牌，正在逐一读回二维码…`,
    noReader: n => `共 ${n} 张门牌。此浏览器没有条码读取功能，无法检查（Chrome 有）。`,
    bad: (n, b) => `共 ${n} 张门牌，其中 ${b} 张读回的链接不对（红框标出），请勿打印。`,
    good: n => `共 ${n} 张门牌，每个二维码都能读回正确的链接。`,
    tight: n => `其中 ${n} 张的名称太长，无法完整打印（已标出），请先在地图数据中缩短。`,
    none: '没有符合的门牌。', lang: 'EN', langLabel: 'Switch to English',
    hidden: '有这个地点，但被上面的勾选框排除了：请勾选房间、楼梯或电梯。',
    dropped: part => `网址中的“${part}”不会用到：每个二维码只带它那扇门。`,
    capped: (n, all) => `符合的门牌共 ${all} 张，这里只显示前 ${n} 张：请缩小搜索范围，或逐层打印。`,
  },
};
const labels = n => `${n} label${n === 1 ? '' : 's'}`;
let lang = (s => (s === 'zh' || s === 'en' ? s : (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'))(store.get('lang'));

const [campus, graph] = await Promise.all([loadFloors(ROOT), getJSON(ROOT + 'data/routing/graph_evac.json')]);
useRouting(campus, graph);
const places = new Places(new Router(graph), campus);
// a toilet's label says whose it is ("Toilets (Girls, Women)"), as the map does
places.addToilets(await getJSON(ROOT + 'data/toilets_evac.json').catch(() => null));

$('base').value = store.get('qrBase') || new URL('./', location.href).href;
const firstFloor = new URLSearchParams(location.search).get('floor') || 'L1';

function applyLang() {
  const S = STR[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  document.title = lang === 'zh' ? 'CIS 地图门牌' : 'CIS Map door labels';
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = S[el.dataset.s];
  $('find').placeholder = S.findHint;
  $('btn-lang').textContent = S.lang;
  $('btn-lang').setAttribute('aria-label', S.langLabel);
  const want = $('floor').value || firstFloor;
  $('floor').innerHTML = '';
  for (const f of campus.floors) {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = floorLabel(f, lang);
    $('floor').appendChild(o);
  }
  $('floor').value = want;
}

let run = 0;
async function render() {
  const mine = ++run, S = STR[lang];
  const base = baseURL($('base').value.trim());
  if (!base) {
    // a broken address would print codes that open nothing: say so, and print none
    $('sheet').innerHTML = '';
    $('status').className = 'status bad';
    $('status').textContent = S.badBase;
    $('print').disabled = true;
    return;
  }
  store.set('qrBase', base);
  // a query or a #part the codes leave out is said, not dropped silently
  let cut = '';
  try { const u = new URL($('base').value.trim()); cut = u.search + u.hash; } catch { /* checked above */ }
  const note = cut ? S.dropped(cut) : '';
  const kinds = { room: $('k-room').checked, stair: $('k-stair').checked, lift: $('k-lift').checked };
  const ok = p => (p.type === 'stair' ? kinds.stair : p.type === 'elevator' ? kinds.lift : p.type === 'room' ? kinds.room : false);
  const q = $('find').value.trim();
  // labels found by a search, on any floor, every one that matches (a cap of 40 once left KB-408 and
  // on out of a "KB-" batch without a word, a review found); a search so broad it would be a heap
  // says so. Otherwise the whole floor.
  // a whole code or id ("LKS-304", "L4:KB-405") is that one label, not the rooms whose codes start
  // with it (LKS-304-1, the workroom inside the library, once came along to be reprinted)
  const exact = q ? places.find(q) : null;
  const found = q ? (exact && ok(exact) ? [exact] : places.search(q, Infinity).filter(ok)) : null;
  const MAX = 300;
  // a big place with sides (the Secondary Library, the gym) gets a label at each side instead of one for
  // the place: scanned there, the trip starts at that side
  const list = (found ? found.slice(0, MAX)
    : places.list.filter(p => p.floor.id === $('floor').value).filter(ok).sort((a, b) => places.cmp(a, b)))
    .flatMap(p => (p.sides && p.sides.length > 1 ? p.sides : [p]));
  const capped = found && found.length > MAX ? S.capped(MAX, found.length) : '';
  const sheet = $('sheet');
  sheet.innerHTML = '';
  const made = [];
  for (const at of list) {
    // (a side's label is its place's, with the side under the name; its link is the side's)
    const p = at.sideOf || at;
    const url = link(base, at.key);
    const code = qr(url, 'M');
    const { d, n } = qrPath(code, QUIET);
    const el = document.createElement('article');
    el.className = 'label';
    const title = p.code || placeTitle(p, 'en');
    // the English name bold, the Chinese after it; whichever the title already says is left out
    const name = [[p.name.en, 'en'], [p.name.zh, 'zh']].filter(([x]) => x && x !== title)
      .map(([x, l]) => `<span class="${l}" lang="${l === 'zh' ? 'zh-Hans' : 'en'}">${esc(x)}</span>`).join(' · ');
    // the floor in both languages; and "Toilet", "Passenger Lift": the place nearby tells two such
    // labels apart on the wall
    const where = `${floorLabel(p.floor, 'en')} · ${p.floor.level}楼`;
    const near = p.code || !twins(p, title) ? '' : nearText(p, 'en');
    const sideOf = l => { const x = at.side && (at.side[l] || at.side.en); return x ? x.charAt(0).toUpperCase() + x.slice(1) : ''; };
    // after the brand guide's door plate: the number first and big; its id is in the code's link
    el.innerHTML = `<div class="code${p.code ? '' : ' named'}">${esc(title)}</div>`
      + (name ? `<div class="name">${name}</div>` : '')
      + (at.side ? `<div class="where side">${esc(sideOf('en'))} · <span lang="zh-Hans">${esc(sideOf('zh'))}</span></div>` : '')
      + `<div class="where">${esc(where)}</div>`
      // the place nearby in both languages, as the rest of the label (a review found the Chinese side
      // of two lift labels told apart only in English)
      + (near ? `<div class="where">${esc(t('en', 'near', { place: near }))} · ${esc(t('zh', 'near', { place: nearText(p, 'zh') || near }))}</div>` : '')
      + `<div class="label-foot" style="--quiet: ${(30 * QUIET / n).toFixed(3)}mm"><svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${esc(url)}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
      + `<div class="label-side"><div class="scan">Scan for directions<br><span lang="zh-Hans">扫码查看路线</span></div>`
      + `<img class="lockup" src="icons/cis-map-logo.svg" alt="CIS Map"></div></div>`;
    sheet.appendChild(el);
    made.push({ el, code, url });
  }
  const tight = made.filter(m => !fit(m.el));
  tight.forEach(m => m.el.classList.add('tight'));
  const tail = (tight.length ? S.tight(tight.length) : '') + note + capped;
  $('status').className = 'status' + (tight.length ? ' bad' : '');
  // nothing to print: no Print, and why
  $('print').disabled = !made.length;
  if (!made.length) { $('status').textContent = q && places.search(q, 5).length ? S.hidden : S.none; return; }
  $('status').textContent = S.reading(made.length) + tail;
  const check = checking = readBack(made);
  const bad = await check;
  if (mine !== run) return;
  if (bad === null) $('status').textContent = S.noReader(made.length) + tail;
  else if (bad.length) {
    $('status').className = 'status bad';
    $('status').textContent = S.bad(made.length, bad.length) + tail;
  } else $('status').textContent = S.good(made.length) + tail;
}

// Whether another label on the same floor would read the same (two "Toilet"s, two lifts): only then
// does a label need the room it is near.
function twins(p, title) {
  return places.list.some(q => q !== p && q.floor === p.floor && !q.code && (q.code || placeTitle(q, 'en')) === title);
}

// Every name whole on its label: the number on one line (a name in its place on two), the names
// on two, each shrunk until it fits and the label still holds its code. False when one cannot fit.
function fit(el) {
  const shrink = (node, from, min, lines) => {
    if (!node || !node.textContent) return true;
    for (let mm = from; mm >= min - 1e-6; mm -= 0.2) {
      node.style.fontSize = mm.toFixed(1) + 'mm';
      const cs = getComputedStyle(node), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      // (one line is a nowrap line: only its width can overflow. Bold glyphs stand a little past a
      // tight line-height, so the last line may reach a quarter of the size further.)
      const slack = Math.max(1, 0.25 * parseFloat(cs.fontSize));
      if (node.scrollWidth <= node.clientWidth + 0.5 && (lines === 1 || node.scrollHeight <= lh * lines + slack)) return true;
    }
    return false;
  };
  const title = el.querySelector('.code'), name = el.querySelector('.name');
  const named = title.classList.contains('named');
  let ok = shrink(title, named ? 6.4 : 10.5, named ? 4 : 5.6, named ? 2 : 1) && shrink(name, 3.4, 2.4, 2);
  const over = () => el.scrollHeight > el.clientHeight + 1;
  // still too tall: the names give first, then the title, down to what reads at arm's length
  for (let mm = name ? parseFloat(name.style.fontSize) || 3.4 : 0; name && over() && mm > 2.4; mm -= 0.2) name.style.fontSize = mm.toFixed(1) + 'mm';
  for (let mm = parseFloat(title.style.fontSize) || 6; over() && mm > 4; mm -= 0.2) title.style.fontSize = mm.toFixed(1) + 'mm';
  return ok && !over();
}

// The address as the codes will use it: a web address, without a query or a #part (after a #,
// "?here=" would never reach the app), or null.
function baseURL(text) {
  try {
    const u = new URL(text);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.search = ''; u.hash = '';
    return u.href;
  } catch { return null; }
}

// "…/app/?here=L4:KB-405": "you are here" at that door; the floor and id stay readable
function link(base, key) {
  return `${base}?here=${encodeURIComponent(key).replace(/%3A/g, ':')}`;
}

let checking = null;   // the read-back running now; Print waits for it

async function readBack(made) {
  if (!('BarcodeDetector' in window)) return null;
  let det;
  try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch { return null; }
  const bad = [];
  for (const m of made) {
    const c = document.createElement('canvas'), k = 6, n = m.code.size + 8;
    c.width = c.height = n * k;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let y = 0; y < m.code.size; y++) for (let x = 0; x < m.code.size; x++) if (m.code.dark(x, y)) g.fillRect((x + 4) * k, (y + 4) * k, k, k);
    const got = await det.detect(c).catch(() => []);
    if (!got.length || got[0].rawValue !== m.url) { bad.push(m.url); m.el.classList.add('fail'); }
  }
  return bad;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

for (const id of ['base', 'floor', 'k-room', 'k-stair', 'k-lift']) $(id).addEventListener('change', render);
let typing = 0;
// the address and the search take effect as they are typed
for (const id of ['find', 'base']) $(id).addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(render, 300); });
// Print only once every code on the sheet has been read back
$('print').addEventListener('click', async () => {
  clearTimeout(typing);
  $('print').disabled = true;
  try { await render(); if (checking) await checking; } finally { $('print').disabled = false; }
  window.print();
});
$('btn-lang').addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; store.set('lang', lang); applyLang(); render(); });
applyLang();
render();
