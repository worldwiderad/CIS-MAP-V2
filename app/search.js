// Finding a place from what someone types: a room code however it is typed ("kb305", "KB 305",
// "305"), a name or part of one in English or Chinese, a small typo ("libary"), a word for the
// place that its name does not use ("clinic"), or a kind of place ("toilet", "lift", "洗手间").
// Runs on the phone, instantly, with nothing sent anywhere.

import { roomKind, splitLabel } from './floors.js';
import { t, nameIn, SEARCH, language } from './i18n.js';

// What people call a kind of place -> the kind (floors.js roomKind, plus connectors). A search
// that is only one of these words lists that kind nearest first, as its chip does.
const KINDS = [
  [/^(toilets?|wc|loos?|restrooms?|bathrooms?|washrooms?|厕所|洗手间|卫生间|厕)$/i, 'toilet'],
  [/^(lifts?|elevators?|电梯)$/i, 'lift'],
  [/^(stairs?|staircases?|stairways?|楼梯)$/i, 'stair'],
  [/^(canteens?|cafeterias?|cafes?|food|lunch|食堂|餐厅|饭堂)$/i, 'food'],
  [/^(offices?|办公室)$/i, 'office'],
];

// The chips under the search box: a kind, or words a name must hold; `not` leaves out the back
// rooms that share the words (the canteen's kitchen, the library's workroom, the pool's toilets).
export const CHIPS = [
  { key: 'chipToilet', kind: 'toilet' },
  { key: 'chipLift', kind: 'lift' },
  { key: 'chipFood', kind: 'food', not: /kitchen|pantry|prep|store/i },
  { key: 'chipLibrary', name: /librar/i, not: /workroom|office|store/i },
  { key: 'chipGym', name: /gym|fitness|pool/i, not: /toilet|office|store|changing|locker|equipment/i },
  { key: 'chipTheatre', name: /theatre|black ?box|auditorium/i, not: /costume|props|store|dressing/i },
  { key: 'chipOffice', kind: 'office' },
  { key: 'chipStairs', kind: 'stair' },
];

// What a toilet block holds (data/toilets_evac.json, read off the door signs in the school's photo
// tour): boys' and girls' toilets are signed "Students only"; men's, women's and the all-gender
// "adults" ones "Adults only"; and neither may use the other's. The older plates say only female or
// male. In the order the search offers them.
export const TOILETS = ['girls', 'boys', 'women', 'men', 'adults', 'female', 'male', 'accessible'];
// their names, in each language's words (i18n.js: capGirls "Girls", toiletGirls "Girls' Toilet")
const cap = k => k[0].toUpperCase() + k.slice(1);
const toiletOne = (k, lang) => t(lang, 'toilet' + cap(k));
const toiletList = (ks, lang) => ks.map(k => t(lang, 'cap' + cap(k))).join(t(lang, 'listSep'));
// a name made in whichever language asks for it (i18n.js nameIn), English and Chinese made now
const made = gen => ({ en: gen('en'), zh: gen('zh'), gen });
const SEX = { girls: 'f', female: 'f', women: 'f', boys: 'm', male: 'm', men: 'm' };
// who a block serves: an adult may use the all-gender adults' toilet as well as their own, and a
// toilet signed only female or male serves either age
const TOILET_FOR = { girls: ['girls', 'female'], boys: ['boys', 'male'], women: ['women', 'adults', 'female'], men: ['men', 'adults', 'male'],
  adults: ['adults'], female: ['female'], male: ['male'], accessible: ['accessible'] };
// the four a toilet list leads with, each the nearest that serves them (an all-gender adults'
// toilet serves women and men; a plate with no age serves either age)
export const TOILET_GROUPS = { girls: ['girls', 'female'], boys: ['boys', 'male'], women: ['women', 'adults', 'female'], men: ['men', 'adults', 'male'] };
// the choices the search offers: the two with no age are found under girls/women and boys/men
const TOILET_CHOICES = ['girls', 'boys', 'women', 'men', 'adults', 'accessible'];
const TOILET_WORDS = {
  girls: ['girls', 'girl', 'female', 'student', 'students', '女生', '女厕', '女'],
  boys: ['boys', 'boy', 'male', 'student', 'students', '男生', '男厕', '男'],
  women: ['women', 'woman', 'ladies', 'female', 'adult', 'adults', 'staff', '女士', '女厕', '女', '成人', '教职员'],
  female: ['female', 'women', 'woman', 'ladies', 'girls', 'girl', '女厕', '女'],
  male: ['male', 'men', 'man', 'gents', 'boys', 'boy', '男厕', '男'],
  men: ['men', 'man', 'gents', 'male', 'adult', 'adults', 'staff', '男士', '男厕', '男', '成人', '教职员'],
  adults: ['adult', 'adults', 'staff', 'unisex', 'all-gender', 'family', '成人', '通用', '教职员'],
  accessible: ['accessible', 'disabled', 'wheelchair', 'handicap', '无障碍', '残疾'],
};

// Words people use that the names do not: each word of a search also matches these.
const SYNONYMS = {
  clinic: ['nurse'], sickbay: ['nurse'], sick: ['nurse'], medical: ['nurse'], health: ['nurse'],
  doctor: ['nurse'], infirmary: ['nurse'],
  exit: ['entrance'], gate: ['entrance'],
  auditorium: ['theatre'], theater: ['theatre'], stage: ['theatre'],
  // (where a car stops, and the visitors' car park on the north site: "car park" is read as "carpark", and the name
  // "Visitor Car Park" itself found nothing, 6 Nov)
  parking: ['drop', 'bay', 'car', 'park'], carpark: ['drop', 'bay', 'car', 'park'], park: ['drop', 'bay'], car: ['drop', 'bay', 'driveway'],
  counselor: ['counsellor', 'counselling'], counseling: ['counselling'],
  counsellor: ['counselling'], counselling: ['counsellor'],
  swimming: ['pool'], swim: ['pool', 'swimming'],
  coffee: ['cafe'], laboratory: ['lab'], gym: ['gymnasium', 'fitness'],
  cafeteria: ['canteen', 'cafe'], dining: ['canteen'],
  // subjects, by the rooms they are taught in (the names say Science Lab, Music Room, Makerspace)
  chemistry: ['science'], physics: ['science'], biology: ['science'], chem: ['science'], bio: ['science'],
  band: ['music'], orchestra: ['music'], choir: ['music'], piano: ['music'], instrument: ['music'],
  design: ['makerspace', 'steam'], robotics: ['steam', 'makerspace'], engineering: ['steam'], maker: ['makerspace'],
  acting: ['drama', 'theatre'], painting: ['arts'], cooking: ['baking', 'bakery'], culinary: ['baking', 'bakery'],
  computer: ['it'], ict: ['it'], wifi: ['it'],
  // sport, by where it is played
  pe: ['gymnasium'], sport: ['gymnasium', 'field', 'courts', 'pool'], football: ['field'], soccer: ['field'],
  rugby: ['field'], athletics: ['field'], badminton: ['gymnasium'], volleyball: ['gymnasium'],
  // the IB programmes: the Primary Years and the Middle Years and Diploma ones in the secondary school
  pyp: ['primary'], myp: ['secondary'], dp: ['secondary'],
  // the kindergarten's classes: Junior (JK), Senior (SK), Pre-K and the nursery
  kindergarten: ['jk', 'sk', 'k', 'nursery'], kinder: ['jk', 'sk', 'k', 'nursery'], kg: ['jk', 'sk', 'k', 'nursery'],
  preschool: ['jk', 'sk', 'k', 'nursery'],
  college: ['university'], uni: ['university'], staffroom: ['staff'],
  pickup: ['pick', 'drop'], dropoff: ['drop'], taxi: ['drop'], grab: ['drop'],
};
// Words that are one word in a search, however they are typed ("sick bay" is the sickbay)
const PHRASES = [
  [/\bsick\s+bay\b/g, 'sickbay'], [/\bcar\s+park(s|ing)?\b/g, 'carpark'],
  [/\bsenior\s+kindergarten\b/g, 'sk'], [/\bjunior\s+kindergarten\b/g, 'jk'], [/\bpre[\s-]?k(indergarten)?\b/g, 'pre k'],
  [/\bcollege\s+counsel+(ing|ling|or|ors|lor|lors)\b/g, 'university'], [/\bstaff\s+room\b/g, 'staffroom'],
];
const phrased = q => PHRASES.reduce((s, [re, w]) => s.replace(re, w), q.toLowerCase());
const ZH_SYNONYMS = {
  诊所: ['校医室', '医务室'], 医疗室: ['校医室', '医务室'], 保健室: ['校医室', '医务室'], 护士: ['校医室', '医务室'],
  医务室: ['校医室'], 校医: ['校医室', '医务室'], 校医室: ['医务室'], 护士室: ['校医室', '医务室'],
  出口: ['入口', '正门'], 大门: ['正门'], 校门: ['正门', '入口'],
  礼堂: ['剧院', '剧场'], 剧院: ['剧场'], 剧场: ['剧院'],
  停车: ['接送', '巴士'], 停车场: ['接送', '巴士'], 游泳: ['泳池'], 健身房: ['健身', '体育馆'],
  前台: ['接待'], 服务台: ['接待'], 接待处: ['接待'],
  化学: ['科学实验室'], 物理: ['科学实验室'], 生物: ['科学实验室'], 科学: ['科学实验室'], 实验室: ['科学实验室'],
  音乐: ['音乐室', '音乐学院'], 乐队: ['音乐室', '音乐学院'], 合唱: ['音乐室'], 合唱团: ['音乐室'], 钢琴: ['音乐室'],
  幼儿园: ['幼儿班', '高班', '学前班', '幼儿室', '幼儿园'], 幼稚园: ['幼儿班', '高班', '学前班', '幼儿室', '幼儿园'],
  足球: ['运动场'], 操场: ['运动场'], 田径: ['运动场'], 体育: ['体育馆', '体育'], 体育课: ['体育馆'],
  设计: ['创客空间', 'STEAM'], 创客: ['创客空间'], 机器人: ['STEAM', '创客空间'],
  戏剧: ['戏剧', '剧场', '剧院'], 表演: ['剧场', '剧院', '戏剧'], 烹饪: ['烘焙'], 美术: ['美术室'], 艺术: ['美术室', '艺术'],
  电脑: ['资讯科技', 'IT'], 计算机: ['资讯科技', 'IT'], 大学: ['大学升学顾问'], 升学: ['大学升学顾问'],
  咖啡: ['咖啡厅'], 教员室: ['教职员室'],
};
// A search for a kind of place somewhere ("toilet near the library", "girls toilet level 3",
// "3楼洗手间"): the words for a floor, for whose toilet, and for "near".
const LEVEL_WORDS = [
  [/\b(?:tt|toh\s*tuck)\s*(?:level\s*|l\s*)?([1-4])\b/i, 'tohtuck'],
  [/\b(?:level|lvl|floor|storey|l)\s*([1-6])\b/i, null],
  [/\b([1-6])(?:st|nd|rd|th)\s+floor\b/i, null],
  [/([1-6一二三四五六])\s*(?:楼|层)/, null],
];
const ZH_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const WHO = {
  girls: 'girls', girl: 'girls', 女生: 'girls', boys: 'boys', boy: 'boys', 男生: 'boys',
  women: 'women', woman: 'women', ladies: 'women', lady: 'women', 女士: 'women', men: 'men', man: 'men', gents: 'men', 男士: 'men',
  adult: 'adults', adults: 'adults', unisex: 'adults', 成人: 'adults',
  accessible: 'accessible', disabled: 'accessible', wheelchair: 'accessible', handicap: 'accessible', 无障碍: 'accessible',
};
const ZH_KIND = /厕所|洗手间|卫生间|电梯|楼梯|食堂|餐厅|饭堂|办公室/;
const NEAR_WORDS = new Set(['near', 'nearest', 'closest', 'by', 'next', 'beside', 'around', 'on', 'in', 'at', 'for', 'to', 'the']);
const ZH_NEAR = /附近的?|旁边的?|最近的?|靠近|离|在|的/g;
// Words that carry nothing in a search ("where is the library")
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'at', 'in', 'near', 'nearest', 'closest', 'nearby', 'where', 'is', 'my', 'go', 'find']);
// A back room named after the place it serves comes after the place: "Library Workroom",
// "Canteen Kitchen", "Junior Library Office".
const SERVICE = /\b(workroom|work room|office|store|storage|kitchen|prep|pantry|plant|server|equipment)\b/i;
const ZH_SERVICE = /工作室|办公室|储藏|储物|仓库|厨房|准备室|机房|设备/;

// Traditional characters typed on a Traditional keyboard, as the Simplified the names are written in
// (圖書館 -> 图书馆): the ones in the campus's names and in what people search for.
const T2S = Object.fromEntries([...'圖图書书館馆間间電电廁厕樓楼廳厅學学醫医務务體体劇剧場场車车禮礼辦办樂乐習习實实驗验師师長长園园兒儿處处門门號号層层東东區区衛卫遊游藝艺術术創创聯联輔辅導导財财設设備备庫库儲储準准機机網网絡络錄录級级會会議议訪访員员職职廚厨護护診诊療疗觀观紅红點点運运動动鐘钟廣广濟济險险鄰邻階阶臺台燈灯陽阳陰阴報报紙纸畫画線线約约總总綜综資资訊讯齡龄養养愛爱廠厂歲岁從从對对開开關关進进際际貨货梯梯'.match(/../g)].map(([t, s]) => [t, s]));
const simplified = q => q.replace(/[\u3400-\u9fff]/g, c => T2S[c] || c);

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, '');
const words = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const CJK = /[㐀-鿿]/;
// toilets -> toilet, libraries -> library, arts -> art; "class", "bus" stay
const stem = w => w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y'
  : w.length > 3 && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

// "Girls' Toilet" for a block with one; "Toilets (Girls, Boys, Men)" for several.
function toiletName(has) {
  return made(lang => (has.length === 1 ? toiletOne(has[0], lang) : t(lang, 'toiletsOf', { list: toiletList(has, lang) })));
}

export class Places {
  constructor(router, campus) {
    this.byKey = new Map();
    this.list = [];
    // numbers with no room (TK-306, TK-206: the bridge landings): found only when typed whole
    this.exactOnly = [];
    const gfloors = router.g.floors;
    for (const [key, d] of Object.entries(router.dest)) {
      const floor = campus.byId[gfloors[d.floor].id];
      const id = key.slice(key.indexOf(':') + 1);
      const portal = floor.portalById.get(id) || null;
      const type = portal ? portal.type : 'room';
      const kind = type === 'stair' ? 'stair' : type === 'elevator' ? 'lift' : type === 'bridge' ? 'bridge'
        : roomKind(id, d.label && d.label.en);
      const { code, name } = splitLabel(id, d.label);
      const p = {
        key, id, floor, portal, type, kind, code, name, label: d.label, section: d.section,
        // which side of a big place this entrance is ("atrium side"): a start there asks which
        side: portal && portal.entranceOf && portal.side ? portal.side : null,
        // a door into another place, or a room the plans give no name ("Unnamed room"): not a result
        // ... nor a seam where two sheets meet at grade (a bridge with no deck or crossing)
        hidden: !!(portal && portal.entranceOf) || /UNNAMED/.test(id) || (type === 'bridge' && !!portal && !portal.area), blank: /UNNAMED/.test(id),
        codeN: norm(code), idN: norm(id), idParts: id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
        digits: (code.match(/\d+/) || [''])[0], inner: /\d\D+\w*$/.test(code),
        enN: (name.en || '').toLowerCase(), enW: words(name.en), zh: name.zh || '',
        enCore: words((name.en || '').replace(/\s*[（(][^）)]*[）)]/g, '')).length,
        enCoreW: words((name.en || '').replace(/\s*[（(][^）)]*[）)]/g, '')),
      };
      this.byKey.set(key, p);
      if (portal && portal.exactOnly) this.exactOnly.push(p);
      else if (!p.hidden) this.list.push(p);
    }
    // A big place whose exits are far apart (the Secondary Library, the gym) has its sides, each an
    // entrance of it: a trip starting there asks which one you are at (owner, 1 Nov 2026)
    this.sides = [];
    for (const q of this.byKey.values()) {
      const main = q.side && this.byKey.get(`${q.floor.id}:${q.portal.entranceOf}`);
      if (!main) continue;
      q.sideOf = main;
      (main.sides ||= []).push(q);
      this.sides.push(q);
    }
    // A place with no code of its own ("Toilet") is told apart by the nearest coded room; with none
    // near, by the nearest place with a name ("near Canteen Level 1").
    for (const p of this.list) {
      if (p.code || !p.portal) continue;
      const by = (q => Math.hypot(q.x - p.portal.x, q.y - p.portal.y));
      p.nearCodes = p.floor.portals.filter(q => q.code && by(q) < 40).sort((a, b) => by(a) - by(b)).map(q => q.code);
      p.near = p.nearCodes[0] || null;
      if (!p.near) {
        const named = p.floor.openPlaces.filter(q => q.id !== p.id && q.name && q.name.en && q.name.en.length <= 28 && by(q) < 40)
          .sort((a, b) => by(a) - by(b))[0];
        p.nearName = named ? named.name : null;
      }
    }
    this.distinguish();
    this.floorOrder = new Map(campus.floors.map((f, i) => [f.id, i]));
    this.vocab = null;
  }

  // Traditional characters read as the Simplified the map's Chinese names are written in -- not in
  // Japanese, whose kanji are its own (図書館: 書 and 館 would turn Chinese, 図 would not)
  simp(s) { return this.vocab && this.vocab.lang !== 'zh-Hant' ? s : simplified(s); }

  // The language the app speaks now. In a language with a file of its own (i18n.js SEARCH), a
  // search also matches each place's name in it, and its words for a kind of place, for whose
  // toilet and for a level are read as the English ones ("toilettes niveau 3" is "toilet level 3").
  setLang(lang) {
    const v = SEARCH[lang];
    this.vocab = v ? vocabOf(lang, v) : null;
    for (const p of this.byKey.values()) {
      const n = this.vocab ? nameIn(p.name, lang) : '';
      p.ln = n && n !== p.name.en ? fold(n) : '';
      p.lnW = p.ln && !this.vocab.unspaced ? splitWords(p.ln) : [];
    }
  }

  // Places that share a name, told apart: a name many places share ("Toilet", "Passenger Lift",
  // "Stairs 8") says nothing of where it is, so it gets its floor and the room it is by; two alike
  // by the same room (a pair of toilets) get the next room as well, or a number.
  distinguish() {
    const used = new Map();
    for (const p of this.list) if (!p.code) used.set(p.name.en, (used.get(p.name.en) || 0) + 1);
    for (const p of this.list) {
      p.generic = !p.code && used.get(p.name.en) > 1;
      if (p.nearCodes) p.near = p.nearCodes[0] || null;
      delete p.nearTag;
    }
    const alike = new Map();
    for (const p of this.list) {
      if (p.code || !p.near) continue;
      const k = `${p.floor.id}|${p.name.en}|${p.near}`;
      if (!alike.has(k)) alike.set(k, []);
      alike.get(k).push(p);
    }
    for (const group of alike.values()) {
      if (group.length < 2) continue;
      const second = group.map(p => p.nearCodes.find(c => c !== p.near));
      if (second.every(Boolean) && new Set(second).size === group.length) group.forEach((p, i) => { p.near = `${p.near}, ${second[i]}`; });
      // still alike (side by side, by the same rooms): numbered across the map, left to right
      else group.sort((a, b) => a.portal.x - b.portal.x || a.portal.y - b.portal.y).forEach((p, i) => { p.nearTag = i + 1; });
    }
  }

  // Other names for places, from data/directory_evac.json when the school fills it: a subject, a
  // teacher, a club ({"aliases": {"L3:KB-305": ["Biology", "Mr Chen"]}}).
  addAliases(dir) {
    for (const [key, names] of Object.entries((dir && dir.aliases) || {})) {
      const p = this.byKey.get(key);
      if (!p || !Array.isArray(names)) continue;
      p.aliases = (p.aliases || []).concat(names.map(n => String(n).toLowerCase()));
    }
  }

  // The toilets: each block named for what it holds ("Toilets (Girls, Boys)", "Girls' Toilet"), and
  // found by the words for each ("girls toilet", "女厕", "staff toilet").
  addToilets(data) {
    for (const [key, v] of Object.entries((data && data.blocks) || {})) {
      const p = this.byKey.get(key);
      const has = TOILETS.filter(k => v && Array.isArray(v.has) && v.has.includes(k));
      if (!p || !has.length) continue;
      p.has = has;
      // a plain "Toilet" is named for what it holds; one with a name of its own ("Toilets (Junior
      // Gym)", "Accessible Toilet") keeps it
      if (/^toilets?( \((men|women)\))?$/i.test(p.name.en || '')) {
        p.name = toiletName(has); p.toiletNamed = true;
        p.enN = p.name.en.toLowerCase(); p.enW = words(p.name.en); p.zh = p.name.zh;
        p.enCoreW = words(p.name.en.replace(/\s*[（(][^）)]*[）)]/g, '')); p.enCore = p.enCoreW.length;
      }
      p.aliases = (p.aliases || []).concat(has.flatMap(k => TOILET_WORDS[k]).map(w => `${w} toilet`), has.flatMap(k => TOILET_WORDS[k]));
      if (p.portal && p.portal.room) p.portal.room.has = has;
    }
    // the toilets no longer all share one name
    this.distinguish();
  }

  // Whether a block serves girls, boys, women or men: for "the nearest for girls" and so on.
  serves(p, group) { return !!(p.has && (TOILET_GROUPS[group] || [group]).some(k => p.has.includes(k))); }

  // The kinds of toilet the map knows of, for the search's choices.
  toiletKinds() { return TOILET_CHOICES.filter(k => this.list.some(p => p.has && TOILET_FOR[k].some(h => p.has.includes(h)))); }

  // A block as the one toilet in it someone is looking for: "Girls' Toilet", same place and link.
  toiletAs(p, k) {
    if (!p.has || !p.has.includes(k) || p.has.length === 1) return p;
    // an accessible toilet in a block signed for one sex ("MALE TOILET ♿") says whose: it may be
    // inside that one (a review found "Accessible Toilet" leading to a men's block)
    const sexed = k === 'accessible' ? p.has.filter(h => SEX[h]) : [];
    const whose = sexed.length && sexed.every(h => SEX[h] === SEX[sexed[0]]);
    const name = made(lang => (whose ? t(lang, 'withCode', { name: toiletOne(k, lang), code: toiletList(sexed, lang) }) : toiletOne(k, lang)));
    return { ...p, name, toilet: k };
  }

  // A block as the toilet in it that serves girls, boys, women, men or a wheelchair: a man's is
  // the Adults' Toilet (all-gender) when the block has no men's.
  toiletFor(p, group) {
    const k = (TOILET_GROUPS[group] || [group]).find(h => p.has && p.has.includes(h));
    return k ? this.toiletAs(p, k) : p;
  }

  get(key) { return this.byKey.get(key) || null; }

  // A place from a link: "L3:KB-305", "KB-305" (if only one floor has it), or a near miss in case.
  find(q) {
    if (!q) return null;
    if (this.byKey.has(q)) return this.byKey.get(q);
    const up = q.toUpperCase();
    for (const [k, p] of this.byKey) if (k.toUpperCase() === up) return p;
    const hits = this.list.concat(this.exactOnly).filter(p => p.id.toUpperCase() === up || p.codeN === norm(q));
    return hits.length === 1 ? hits[0] : null;
  }

  // An id that several floors have ("STAIR-9", "ELEV-1"): the one on the first of these floors that
  // has it, else on the lowest.
  findOn(q, floors) {
    if (!q) return null;
    const up = q.toUpperCase();
    const hits = this.list.filter(p => p.id.toUpperCase() === up).sort((a, b) => this.cmp(a, b));
    for (const f of floors) { const p = f && hits.find(h => h.floor.id === f); if (p) return p; }
    return hits[0] || null;
  }

  // A search that asks for a kind of place somewhere: {kind, toilet, level, building, anchor, text}.
  // "toilet near the library" and "library toilet" are toilets nearest the best match for
  // "library"; "girls toilet level 3", girls' toilets on level 3; "music room L3", the search
  // "music room" on level 3. Null for a plain search (and for a kind on its own: kindOf).
  ask(q) {
    let s = this.simp(phrased(this.vocab ? canon(q, this.vocab) : (q || '').trim()));
    let level = null, building = null, kind = null, toilet = null;
    for (const [re, b] of LEVEL_WORDS) {
      const m = re.exec(s);
      if (m) { level = ZH_NUM[m[1]] || Number(m[1]); building = b; s = s.replace(re, ' '); break; }
    }
    const zk = ZH_KIND.exec(s);
    if (zk) { kind = this.kindOf(zk[0]); s = s.replace(zk[0], ' '); }
    for (const w of Object.keys(WHO)) if (CJK.test(w) && s.includes(w)) { toilet = WHO[w]; s = s.replace(w, ' '); break; }
    const toiletWords = new Set(Object.values(TOILET_WORDS).flat());
    const rest = [];
    for (let w of s.split(/[^\p{L}\p{M}\p{N}-]+/u).filter(Boolean)) {
      if (CJK.test(w)) { w = w.replace(ZH_NEAR, ''); if (w) rest.push(w); continue; }
      if (!kind && this.kindOf(w)) { kind = this.kindOf(w); continue; }
      if (Object.hasOwn(WHO, w)) { toilet = toilet || WHO[w]; continue; }
      // "staff", "female", "student": said by the toilets' own words, not a place to be near
      if (STOP.has(w) || NEAR_WORDS.has(w) || toiletWords.has(w)) continue;
      rest.push(w);
    }
    if (toilet && !kind) kind = 'toilet';
    if (kind !== 'toilet') toilet = null;
    const text = rest.join(CJK.test(rest.join('')) ? '' : ' ');
    if (!kind && !(level && text)) return null;
    if (kind && !toilet && !level && !text) return null;
    let anchor = null;
    if (kind && text) {
      const best = this.scored(text, 1)[0];
      if (!best || best[0] < 600) return null;
      anchor = best[1];
    }
    return { kind, toilet, level, building, anchor, text: kind ? '' : text };
  }

  // The kind a search names on its own ("toilet", "洗手间"), or null.
  kindOf(q) {
    // "nearest toilet", "where is the lift", "最近的洗手间": the kind (in another language, its
    // words for one: "toilettes", "トイレ")
    if (this.vocab) q = canon(q, this.vocab);
    const s = this.simp(phrased((q || '').trim()).replace(/\b(nearest|closest|nearby|the|a|an|where|is|find|my)\b|^最近的?|附近的?/g, '')
      .replace(/\s+/g, ''));
    return (KINDS.find(([re]) => re.test(s)) || [])[1] || null;
  }

  ofKind(chip, toilet) {
    if (toilet) return this.list.filter(p => p.has && TOILET_FOR[toilet].some(k => p.has.includes(k)))
      .map(p => this.toiletAs(p, TOILET_FOR[toilet].find(k => p.has.includes(k))));
    return this.list.filter(p => (chip.kind ? p.kind === chip.kind : chip.name.test(p.name.en || '') || chip.name.test(p.code))
      && !(chip.not && chip.not.test(p.name.en || '')))
      .sort((a, b) => this.cmp(a, b));
  }

  cmp(a, b) {
    return (this.floorOrder.get(a.floor.id) - this.floorOrder.get(b.floor.id))
      || (a.code || a.enN).localeCompare(b.code || b.enN, 'en', { numeric: true });
  }

  search(q, limit = 60) { return this.scored(q, limit).map(([, p]) => p); }

  // Matches with their scores, best first: a code beats a name, a whole word beats the start of
  // one, which beats a typo; every word typed must match something.
  scored(q, limit = 60) {
    // (full-width letters, digits and dashes, as a Chinese or Japanese keyboard types them -- ４０５, ＫＢ－４０５ -- read
    // as the plain ones: in English and Chinese they found nothing, 6 Nov. Brackets and commas stay, as names have them.)
    const typed = (q || '').replace(/[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a\uff0d]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/\u3000/g, ' ').trim(), V = this.vocab;
    // in another language: its words for a kind of place read as the English ones, the rest kept; a
    // place's name in it is matched against what is left with the small words gone ("図書館 近く",
    // "la bibliothèque": the library), or against all that was typed if nothing is
    q = V ? canon(typed, V) : typed;
    const left = V ? q.split(/\s+/).filter(w => w && !CANON.has(w)) : [];
    const own = V ? (left.join(V.unspaced ? '' : ' ') || fold(typed)) : '';
    const ownToks = V && !V.unspaced ? splitWords(own).filter((w, i, all) => !V.ignore.has(w) || (w.length === 1 && i === all.length - 1)) : [];
    q = this.simp((q || '').trim());
    if (!q) return [];
    if (!CJK.test(q)) q = phrased(q);
    // "room 405", "rm 405", "classroom KB-405": around a number these words say nothing
    const bare = /\d/.test(q) ? q.replace(/\b(?:room|rm|classroom|class|no\.?|number)\b|#/gi, ' ').trim() || q : q;
    const ql = q.toLowerCase(), qn = norm(bare), toks = words(q).filter(w => !STOP.has(w));
    const kind = this.kindOf(q), zh = CJK.test(q);
    const whoK = [...new Set(toks.map(w => Object.hasOwn(WHO, w) && WHO[w]).filter(Boolean))];
    // the whole id a door label prints ("L4:KB-405", "l4 kb405"): that place, first
    const m = /^([a-z]{1,2}_?l?\d)\s*[:\s]\s*(.+)$/i.exec(q);
    const exact = this.find(q) || (m && this.list.concat(this.exactOnly).find(p => p.floor.id.toLowerCase() === m[1].toLowerCase().replace(/^tt(?!_)/, 'tt_')
      && (p.idN === norm(m[2]) || p.codeN === norm(m[2])))) || null;
    const out = [];
    for (const p of this.list) {
      let s = p === exact ? 1100 : 0;
      if (kind && p.kind === kind) s = 500;
      if (p.codeN && qn) {
        if (p.codeN === qn) s = Math.max(s, 1000);
        else if (p.codeN.startsWith(qn)) s = Math.max(s, 900 - (p.codeN.length - qn.length));
        if (/^\d+$/.test(qn)) {
          // "304" is LKS-304 before LKS-304-1, the workroom inside it, wherever you stand
          if (p.digits === qn) s = Math.max(s, p.inner ? 880 : 950);
          else if (p.digits.startsWith(qn)) s = Math.max(s, 700);
        }
      }
      // an id is a code too ("MAIN-ENTRANCE", "TOILET-TK-N"): by the start of one of its parts
      if (qn.length >= 3 && (/\d/.test(qn) ? p.idN.includes(qn) : p.idParts.some(w => w.startsWith(qn)))) s = Math.max(s, 420);
      s = Math.max(s, zh ? zhScore(p.zh, q) : nameScore(p, ql, toks));
      if (p.ln) s = Math.max(s, ownScore(p, own, ownToks, V));
      if (p.aliases) {
        for (const a of p.aliases) {
          if (a === ql) s = Math.max(s, 840);
          else if (a.startsWith(ql) || (zh && a.includes(ql))) s = Math.max(s, 700);
          else if (toks.length && toks.every(tk => words(a).some(w => w.startsWith(tk)))) s = Math.max(s, 640);
        }
      }
      // a block signed for exactly whom the search names comes before one that only serves them too
      // ("girls toilet": the girls' toilets, then the female ones that girls may use)
      if (s > 0 && p.has && whoK.some(k => p.has.includes(k))) s += 5;
      if (s > 0) out.push([s, p]);
    }
    // a number with no room, only when typed whole: "306", "TK-306", "tk 306" (never "30", "TK-30")
    for (const p of this.exactOnly) {
      const s = p === exact ? 1100 : p.codeN === qn ? 1000 : /^\d+$/.test(qn) && p.digits === qn ? 950 : 0;
      if (s) out.push([s, p]);
    }
    out.sort((a, b) => b[0] - a[0] || this.cmp(a[1], b[1]));
    return out.slice(0, limit);
  }
}

// ---- another language's words (app/lang/<id>.json "search") ----------------------------------------

// A name or a search as it is matched: accents and case set aside (é is e, đ is d; full-width
// letters as plain ones), so "bibliotheque" finds the Bibliothèque.
export const fold = s => (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().normalize('NFC');
const splitWords = s => s.split(/[^\p{L}\p{M}\p{N}#-]+/u).filter(Boolean);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A language's search words, ready: each word (or phrase) -> the English one the search knows
// ("toilettes" -> toilet, "filles" -> girls, "niveau" -> level, "où" -> nothing).
const KIND_EN = { toilet: 'toilet', lift: 'lift', stair: 'stairs', food: 'canteen', office: 'office' };
// the English words canon puts in (a kind, whose toilet, a level): not part of a place's name
const CANON = new Set([...Object.values(KIND_EN), ...TOILETS, 'level']);
function vocabOf(lang, v) {
  const unspaced = !!language(lang).unspaced;
  const words = new Map();
  const put = (list, to) => { for (const w of list || []) { const f = fold(w).trim(); if (f && !words.has(f)) words.set(f, to); } };
  for (const [k, list] of Object.entries(v.kinds || {})) if (KIND_EN[k]) put(list, KIND_EN[k]);
  for (const [k, list] of Object.entries(v.who || {})) put(list, k);
  put(v.level, 'level');
  const ignore = new Set((v.ignore || []).map(w => fold(w).trim()).filter(Boolean));
  const syn = new Map(Object.entries(v.synonyms || {}).map(([k, list]) => [fold(k), list.map(fold)]));
  // the longest first, so a phrase wins over a word inside it
  const byLength = [...words.keys()].sort((a, b) => b.length - a.length);
  // the ones that can carry an ending (not Latin, three letters or more), the longest first
  const stems = byLength.filter(w => !/[a-z]/.test(w) && !w.includes(' ') && w.length >= 3);
  const after = (v.levelAfter || []).map(w => fold(w).trim()).filter(Boolean);
  const before = (v.level || []).map(w => fold(w).trim()).filter(Boolean);
  return { lang, unspaced, words, byLength, stems, ignore, syn, after, before };
}

// A search in another language, with its words for a kind of place, whose toilet and a level put
// as the English ones, and its small words dropped: "les toilettes du niveau 3" -> "toilet level 3",
// "3階のトイレ" -> "level 3 toilet". What is left is the language's own (a place's name).
export function canon(q, V) {
  let s = fold(q).trim();
  // a level: "niveau 3", "3階", "3층", "ชั้น 3"
  for (const w of V.after) s = s.replace(new RegExp(`([1-6])\\s*${esc(w)}`, 'gu'), ' level $1 ');
  for (const w of V.before) s = s.replace(new RegExp(`${esc(w)}\\s*([1-6])`, 'gu'), ' level $1 ');
  if (V.unspaced) {
    for (const w of V.byLength) if (w.length > 0 && s.includes(w)) s = s.split(w).join(` ${V.words.get(w)} `);
    // the small words left between them ("3階のトイレ": の), or at either end of what is left
    // ("図書館の" -> 図書館); never from inside a word
    const small = [...V.ignore].sort((a, b) => b.length - a.length);
    const trim = w => { let x = w, again = true; while (again) { again = false; for (const i of small) { if (x.length > i.length && x.endsWith(i)) { x = x.slice(0, -i.length); again = true; } if (x.length > i.length && x.startsWith(i)) { x = x.slice(i.length); again = true; } } } return x; };
    return s.split(/\s+/).filter(w => w && !V.ignore.has(w)).map(trim).join(' ');
  }
  const toks = s.split(/[\s,.;:!?¿¡'’"«»()（）]+/u).filter(Boolean), out = [];
  for (let i = 0; i < toks.length;) {
    let hit = null;
    for (let k = Math.min(3, toks.length - i); k >= 1 && !hit; k--) {
      const ph = toks.slice(i, i + k).join(' ');
      if (V.words.has(ph)) hit = [V.words.get(ph), k];
      // a word with an ending on it, in a script without capitals (Tamil கழிவறைக்கு "to the toilet",
      // Korean 화장실은): the word it begins with
      else if (k === 1 && !/^[a-z0-9]/.test(ph) && V.stems.some(w => ph.startsWith(w))) hit = [V.words.get(V.stems.find(w => ph.startsWith(w))), 1];
      // (a small word dropped, but not a lone letter at the end: French "à" reads as "a", which is
      // also Pod A's letter, as in "pod a")
      else if (k === 1 && V.ignore.has(ph) && !(ph.length === 1 && i === toks.length - 1)) hit = ['', 1];
    }
    if (hit) { if (hit[0]) out.push(hit[0]); i += hit[1]; } else { out.push(toks[i]); i++; }
  }
  return out.join(' ');
}

// A place's name in the language against what was typed: as zhScore for a language written without
// spaces (Japanese, Thai, Traditional Chinese), else as nameScore, word by word (a word inside a
// longer one counts for Korean and Tamil, which join words; a slip counts for a Latin script).
function ownScore(p, q, toks, V) {
  if (!q || !p.ln) return 0;
  const alts = a => [a, ...(V.syn.get(a) || [])];
  if (V.unspaced) {
    const z = p.ln, bare = z.replace(/（[^）]*）|\([^)]*\)/g, '').trim(), qq = q.replace(/\s+/g, '');
    let s = 0;
    for (const a of alts(qq)) {
      if (z === a || bare === a) s = Math.max(s, 860);
      else if (z.endsWith(a)) s = Math.max(s, 790);
      else if (z.startsWith(a)) s = Math.max(s, 730);
      else if (z.includes(a)) s = Math.max(s, 700);
    }
    // words typed apart ("音楽 練習"): each somewhere in the name
    const parts = q.split(/\s+/).filter(Boolean);
    if (!s && parts.length > 1 && parts.every(w => z.includes(w))) s = 680;
    return s;
  }
  if (p.ln === q) return 860;
  if (!toks.length) return 0;
  const latin = /^[a-z0-9#-]+$/;
  let sum = 0;
  for (const tk of toks) {
    let best = 0;
    for (const w of p.lnW) {
      for (const a of alts(tk)) {
        if (w === a) best = 3;
        else if (best < 2 && a.length >= 2 && (w.startsWith(a) || (!latin.test(a) && (w.includes(a) || (w.length >= 3 && a.startsWith(w)))))) best = 2;
        else if (best < 1 && latin.test(a) && a.length >= 4 && w[0] === a[0] && near(w, a)) best = 1;
      }
      if (best === 3) break;
    }
    if (!best) return 0;
    sum += best;
  }
  const n = toks.length;
  const s = sum === 3 * n ? 800 : sum >= 2 * n ? (p.ln.startsWith(q) ? 740 : 700) : 420 + 20 * (sum - n);
  return s - 4 * Math.max(0, p.lnW.length - n);
}

// What a place with no code is near, in words: "KB-416", "TT-208, TT-210", "Canteen Level 1", or ''.
export function nearText(p, lang) {
  const base = p.near || (p.nearName ? nameIn(p.nearName, lang) : '');
  return base && p.nearTag ? t(lang, 'withCode', { name: base, code: p.nearTag }) : base;
}

// An English name against the words typed. Each word scores 3 for a whole word of the name (or
// its plural, or a synonym), 2 for the start of one, 1 for a typo; any word scoring 0 rules the
// place out.
function nameScore(p, ql, toks) {
  if (!p.enN || !toks.length) return 0;
  if (p.enN === ql || stem(p.enN) === stem(ql)) return 860;
  let sum = 0;
  for (const tk of toks) {
    const alts = [tk, ...synonyms(tk)];
    let best = 0;
    for (const w of p.enW) {
      for (const a of alts) {
        if (stem(w) === stem(a)) best = 3;
        else if (best < 2 && a.length >= 2 && w.startsWith(a)) best = 2;
        else if (best < 1 && a.length >= 4 && w[0] === a[0] && near(w, a)) best = 1;
      }
      if (best === 3) break;
    }
    if (!best) return 0;
    sum += best;
  }
  const n = toks.length;
  let s = sum === 3 * n ? 800 : sum >= 2 * n ? (p.enN.startsWith(ql) ? 740 : 700) : 420 + 20 * (sum - n);
  // matched only in a note in brackets ("Toilets (Pool)" for "pool"): after the pools themselves
  if (toks.every(tk => !p.enCoreW.some(w => stem(w) === stem(tk) || w.startsWith(tk)))) s -= 60;
  s -= 4 * Math.max(0, p.enCore - n);
  if (SERVICE.test(p.enN) && !toks.some(t => SERVICE.test(t))) s -= 60;
  return s;
}

// A word's other words, also for a word typed with a slip in it ("cafteria" is a cafeteria).
const synCache = new Map();
function synonyms(tk) {
  // (own words only: "constructor" typed found Object's, and the search threw, 6 Nov)
  if (Object.hasOwn(SYNONYMS, tk)) return SYNONYMS[tk];
  if (!synCache.has(tk)) {
    // (a slip, not another word that starts the same: "nurse" is not a nursery)
    const k = tk.length >= 5 ? Object.keys(SYNONYMS).find(w => w.length >= 5 && w[0] === tk[0] && Math.abs(w.length - tk.length) <= 1 && near(w, tk)) : null;
    synCache.set(tk, k ? SYNONYMS[k] : []);
  }
  return synCache.get(tk);
}

// A Chinese name against what was typed: the whole name, then the name ending with it (the thing
// itself: 中学图书馆), then starting with it (something of it: 图书馆工作室), then holding it.
function zhScore(z, q) {
  if (!z) return 0;
  let s = 0;
  // a name's bracketed qualifier says which one, not what it is: 校医室（小学） is as much 校医室
  // as BT-505's, and the nearer comes first (医务室 once put the kindergarten's first, 140 m away)
  const bare = z.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
  for (const a of [q, ...((Object.hasOwn(ZH_SYNONYMS, q) && ZH_SYNONYMS[q]) || [])]) {
    if (z === a || bare === a) s = Math.max(s, 860);
    else if (z.endsWith(a)) s = Math.max(s, 790);
    else if (z.startsWith(a)) s = Math.max(s, 730);
    else if (z.includes(a)) s = Math.max(s, 700);
  }
  if (s && ZH_SERVICE.test(z) && !ZH_SERVICE.test(q)) s -= 60;
  return s;
}

// One edit apart (two for long words), counting a swap of neighbours as one: "libary", "gymnsium".
function near(w, tk) {
  if (w.startsWith(tk.slice(0, -1)) && tk.length >= 5) return true;
  const max = tk.length >= 8 ? 2 : 1;
  if (Math.abs(w.length - tk.length) > max) return false;
  const a = w, b = tk, m = a.length, n = b.length;
  let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev; prev = cur;
  }
  return prev[n] <= max;
}
