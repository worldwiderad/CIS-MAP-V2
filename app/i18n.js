// Every word the app shows: English and Simplified Chinese here, the other languages each in its own
// file, app/lang/<id>.json, fetched when it is chosen (tools/i18n writes them; see its README).
//
// Place names come from the map itself: each portal's label carries en and zh. The other languages
// name places from their file's table of the map's English names. The building names "Lakeside"
// and "Toh Tuck" stay in English in every language: the school has no other name for either on
// record here, and the signs on site use these.
//
// Anything a language leaves out is said in English, and so is a place name its table lacks.

// The languages the app speaks, in the order the language page lists them (two to a row, each row
// a pair: English and French, the two Chinese, Korean and Japanese, ..., German and Tagalog): each by its own name, with
// its HTML lang tag, the device language tags that choose it (navigator.languages), the language
// page's heading and the language button's name in it (there before its file is), and for the
// languages that write it in two characters, the lockup's MAP in its own script (地图).
// cased: a Latin script, whose words are lower case inside a sentence. unspaced: written without
// spaces between words (search matches inside a name; a label breaks between characters).
export const LANGUAGES = [
  { id: 'en', name: 'English', html: 'en', match: /^en\b/i, choose: 'Choose your language', label: 'Language', cased: true },
  { id: 'fr', name: 'Français', html: 'fr', match: /^fr\b/i, choose: 'Choisissez votre langue', label: 'Langue', cased: true, file: true },
  { id: 'zh', name: '简体中文', html: 'zh-Hans', match: /^zh(?!-(hant|tw|hk|mo)\b)/i, choose: '选择语言', label: '语言', brand: '地图', unspaced: true },
  { id: 'zh-Hant', name: '繁體中文', html: 'zh-Hant', match: /^zh-(hant|tw|hk|mo)\b/i, choose: '選擇語言', label: '語言', brand: '地圖', unspaced: true, file: true },
  { id: 'ko', name: '한국어', html: 'ko', match: /^ko\b/i, choose: '언어를 선택하세요', label: '언어', brand: '지도', file: true },
  { id: 'ja', name: '日本語', html: 'ja', match: /^ja\b/i, choose: '言語を選んでください', label: '言語', brand: '地図', unspaced: true, file: true },
  { id: 'es', name: 'Español', html: 'es', match: /^es\b/i, choose: 'Elige tu idioma', label: 'Idioma', cased: true, file: true },
  { id: 'pt-BR', name: 'Português (Brasil)', html: 'pt-BR', match: /^pt\b/i, choose: 'Escolha seu idioma', label: 'Idioma', cased: true, file: true },
  { id: 'hi', name: 'हिन्दी', html: 'hi', match: /^hi\b/i, choose: 'अपनी भाषा चुनें', label: 'भाषा', file: true },
  { id: 'ta', name: 'தமிழ்', html: 'ta', match: /^ta\b/i, choose: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்', label: 'மொழி', file: true },
  { id: 'ms', name: 'Bahasa Melayu', html: 'ms', match: /^ms\b/i, choose: 'Pilih bahasa anda', label: 'Bahasa', cased: true, file: true },
  { id: 'id', name: 'Bahasa Indonesia', html: 'id', match: /^(id|in)\b/i, choose: 'Pilih bahasa Anda', label: 'Bahasa', cased: true, file: true },
  { id: 'vi', name: 'Tiếng Việt', html: 'vi', match: /^vi\b/i, choose: 'Chọn ngôn ngữ của bạn', label: 'Ngôn ngữ', cased: true, file: true },
  { id: 'th', name: 'ไทย', html: 'th', match: /^th\b/i, choose: 'เลือกภาษาของคุณ', label: 'ภาษา', unspaced: true, file: true },
  // (owner, 2 Nov: "let's add 2 more", after the fourteen: a row of their own at the end, so the
  // others keep their places. Tagalog by the name Filipinos and their phones call it, Filipino; a
  // phone set to Filipino or Tagalog gets it)
  { id: 'de', name: 'Deutsch', html: 'de', match: /^de\b/i, choose: 'Wählen Sie Ihre Sprache', label: 'Sprache', cased: true, file: true },
  { id: 'fil', name: 'Filipino', html: 'fil', match: /^(fil|tl)\b/i, choose: 'Piliin ang iyong wika', label: 'Wika', cased: true, file: true },
];
export const LANGS = LANGUAGES.map(l => l.id);
export function language(id) { return LANGUAGES.find(l => l.id === id) || LANGUAGES[0]; }
// a language as a link or an old visit spells it ("zh-hant", "pt-br"), or null
export function langId(s) { const l = s && LANGUAGES.find(x => x.id.toLowerCase() === String(s).toLowerCase()); return l ? l.id : null; }

// The map's own lettering in each language: the brand's Hanken Grotesk for Latin letters and
// digits, then the script's own font on the phone, the one its readers expect first (a Japanese
// kanji drawn from a Chinese font looks wrong to a Japanese reader). Vietnamese is all the phone's
// font: the bundled Hanken files lack its letters with two marks (ấ, ệ), which would come out in
// another font mid-word.
const LATIN = '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Helvetica Neue"';
const FONTS = {
  'zh-Hant': `"Hanken Grotesk", "PingFang TC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", sans-serif`,
  ja: `"Hanken Grotesk", "Hiragino Sans", "Hiragino Kaku Gothic ProN", -apple-system, BlinkMacSystemFont, "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", "Noto Sans CJK JP", sans-serif`,
  ko: `"Hanken Grotesk", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif`,
  hi: `${LATIN}, "Kohinoor Devanagari", "Devanagari Sangam MN", "Nirmala UI", "Noto Sans Devanagari", sans-serif`,
  ta: `${LATIN}, "Tamil Sangam MN", "Nirmala UI", "Noto Sans Tamil", Latha, sans-serif`,
  th: `${LATIN}, Thonburi, "Leelawadee UI", "Noto Sans Thai", sans-serif`,
  vi: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif',
};
export const fontFor = lang => FONTS[lang] || `${LATIN}, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`;

// The languages that live in their own files, once fetched: their words, their place names (the
// map's English name -> theirs; a number in a name stands as # in its pattern: "Science Lab #"),
// and their search words (app/search.js).
export const NAMES = {};
export const SEARCH = {};
const loading = {};
export function addLanguage(id, d) {
  STRINGS[id] = { ...(d.strings || {}) };
  NAMES[id] = d.names || {};
  SEARCH[id] = d.search || {};
  named.delete(id);
}
// Fetches a language's file once (true when its words are there to use; English answers if not).
export function loadLang(id) {
  if (!language(id).file || STRINGS[id]) return Promise.resolve(!!STRINGS[id] || !language(id).file);
  return (loading[id] ||= fetch(new URL(`lang/${id}.json`, import.meta.url).href)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`lang/${id}.json: ${r.status}`))))
    .then(d => { addLanguage(id, d); return true; })
    .catch(e => { console.error(e); delete loading[id]; return false; }));
}

// A name in a language: the map's own (it carries Chinese), else the language's table's, else the
// English. A name made from what a place holds (a toilet block's) is made in the language asked.
const named = new Map();   // lang -> Map(English -> translated or '')
export function nameIn(n, lang) {
  if (!n) return '';
  if (n.gen) return n.gen(lang) || n.en || '';
  if (n[lang]) return n[lang];
  const en = n.en || '';
  if (!en || !NAMES[lang]) return en;
  let memo = named.get(lang);
  if (!memo) named.set(lang, memo = new Map());
  if (!memo.has(en)) memo.set(en, fromTable(NAMES[lang], en));
  return memo.get(en) || en;
}
function fromTable(tab, en) {
  if (tab[en]) return tab[en];
  const nums = en.match(/\d+(?:\.\d+)?/g);
  const v = nums && tab[en.replace(/\d+(?:\.\d+)?/g, '#')];
  if (!v) return '';
  let i = 0;
  return v.replace(/#/g, () => nums[i++] ?? '#');
}

// The device's own language when the app speaks it (the first of its preferred ones that it does),
// else English.
export function systemLang() {
  const tags = (typeof navigator !== 'undefined' && (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])) || [];
  for (const tag of tags) {
    const l = LANGUAGES.find(x => x.match.test(tag || ''));
    if (l) return l.id;
  }
  return 'en';
}

export const STRINGS = {
  en: {
    title: 'Map',
    from: 'From', to: 'To',
    chooseStart: 'Choose where you are',
    whereTo: 'Where to?',
    youAreHere: 'You are here',
    swap: 'Swap start and destination', endTrip: 'Clear the route', showMap: 'Show the map',
    stepFree: 'Step-free',
    stepFreeHint: 'Lifts and ramps only',
    searchPh: 'Search a room, code or place',
    noResults: 'Nothing matches “{q}”. Try a room code such as KB\u2060-\u2060405, or a place such as library or toilet.',
    nearest: 'Nearest {what}',
    nearestToilet: 'Nearest toilet', nearestLift: 'Nearest lift', nearestOf: 'Nearest: {what}', nearestFor: 'Nearest for {who}', nearestAccessible: 'Nearest accessible toilet', kindNear: '{kind} near {place}',
    needStart: 'Choose where you are first, to find the nearest one.',
    chipToilet: 'Toilets', chipLift: 'Lifts', chipStairs: 'Stairs', chipFood: 'Canteen',
    chipLibrary: 'Library', chipOffice: 'Offices', chipGym: 'Gym', chipTheatre: 'Theatres',
    directionsHere: 'Directions here', startHere: 'Start here', backToRoute: 'Back to route',
    whichSide: 'Which side are you at?', sideCancel: 'Not now',
    summary: '{dist} · about {time}',
    summaryShort: '{dist} · under a minute',
    min: '{n} min', sec: '{n} s',
    metres: '{n} m',
    noRoute: 'There is no route between these two places.',
    noStepFree: 'There is no step-free route between these two places.',
    stepFreeYours: 'Step-free, as this phone is set: the route uses lifts and ramps only.',
    same: 'That is where you are already.',
    loading: 'Loading the campus…',
    loadFail: 'The map could not load. Check the connection and reload the page.',
    showFloor: 'Show the whole floor',
    floors: 'Floors',
    close: 'Close', back: 'Back', clear: 'Clear', endSteps: 'Show the whole route',
    popular: 'Popular places', arrivals: 'Entrances and drop-off points', keepTyping: 'Keep typing…', done: 'Done', findPlace: 'Find a place',
    shareTitlePhone: 'Share this route', shareSubPhone: 'Send the link, or let another phone scan the code.',
    floorUp: 'one floor up', floorDown: 'one floor down', floorUps: '{n} floors up', floorDowns: '{n} floors down',
    viaFloor: 'via {f}',
    steps: 'Directions',
    allSteps: 'All steps', hideSteps: 'Hide steps', start: 'Start', stepCount: 'Step {i} of {n}',
    nextStop: 'Next stop: {place}', stopOf: '{i} of {n}',
    prevStep: 'Previous step', nextStep: 'Next step',
    stepsTip: 'The map does not track you: follow each step, then tap › for the next.',
    docTitle: 'CIS Map',
    language: 'Language', chooseLanguage: 'Choose your language', languageLabel: 'Language',
    results: 'Places', recent: 'Recent',
    share: 'Take this route on your phone', shareTitle: 'Take this route with you',
    shareSub: 'Scan with a phone camera to open it there.', copyLink: 'Copy link', copied: 'Copied',
    shareLink: 'Share this route', linkCopied: 'Link copied',
    shareNative: 'Share…',
    tapMapTip: 'Not sure of the room? Go back and tap where you are on the map, then “Start here”.',
    pickOnMap: 'Pick on the map', pickFromSub: 'Tap where you are', pickToSub: 'Tap where you are going',
    pickFromNotice: 'Tap where you are on the map.', pickToNotice: 'Tap the place on the map.',
    floorOf: '{floor}',
    // directions
    leave: 'Leave {place}', leaveTurn: 'Leave {place} and turn {dir}', leaveStraight: 'Leave {place} and go straight on',
    startAt: 'Start at {place}', startAtTurn: 'From {place}, turn {dir}', startAtStraight: 'From {place}, go straight on',
    startAtToward: 'From {place}, walk towards {mark}',
    leaveByStraight: 'Leave {place} by the {side}', leaveByHead: 'Leave {place} by the {side} and head for {target}',
    leaveByToward: 'Leave {place} by the {side} and walk towards {mark}',
    leaveHead: 'Leave {place} and head for {target}', leaveTurnHead: 'Leave {place}, turn {dir} and head for {target}',
    startAtHead: 'From {place}, head for {target}', startAtTurnHead: 'From {place}, turn {dir} and head for {target}',
    onHead: 'Head for {target}', onStraight: 'Go straight on', onTurn: 'Turn {dir}', onTurnHead: 'Turn {dir} and head for {target}',
    onToward: 'Walk towards {mark}',
    turn: 'Turn {dir}', turnAt: 'Turn {dir} at {mark}', turnBy: 'Turn {dir} by {mark}',
    turnEnd: 'At the end of the corridor, turn {dir}', turnEndPath: 'At the end of the path, turn {dir}', turnAgain: 'Turn {dir} again',
    bear: 'Bear {dir}', bearAt: 'Bear {dir} at {mark}', bearBy: 'Bear {dir} by {mark}', bearAgain: 'Bear {dir} again',
    turnAround: 'Turn around',
    then: '{first}, then {dir}', thenAgain: '{first}, then {dir} again',
    left: 'left', right: 'right', leftTurn: 'left', rightTurn: 'right',
    arrive: 'Arrive at {place}', arriveSide: 'Arrive at {place}, on your {dir}', arriveAhead: 'Arrive at {place}, straight ahead',
    arriveOn: 'On your {dir}', arriveAheadShort: 'Straight ahead',
    stairsUp: 'Take {stair} up to {floor}', stairsDown: 'Take {stair} down to {floor}',
    stairsUpN: 'Take {stair} up {n} floors to {floor}', stairsDownN: 'Take {stair} down {n} floors to {floor}',
    liftUp: 'Take {lift} up to {floor}', liftDown: 'Take {lift} down to {floor}',
    bridge: 'Cross the Linkway Bridge to {floor}',
    walkway: 'Take the covered walkway to {floor}',
    seam: 'Carry on to {floor}',
    landing: 'Go through the {stair} landing onto {floor}',
    walkTo: '{dist} to {place}',
    onFloor: 'on {floor}',
    toFloor: 'To {floor}', fromFloor: 'From {floor}',
    lakeside: 'Lakeside', tohtuck: 'Toh Tuck',
    level: 'Level {n}', ttLevel: 'Toh Tuck Level {n}', floorIn: '{floor}, {building}', levelWord: 'Level',
    levelShort: 'L{n}', ttShort: 'TT L{n}',
    viaPlace: '{place}',
    // misc
    about: 'About this map',
    staffOnly: 'Staff only',
    // why a route goes the long way (a school rule): under the summary
    noteGym: 'Goes round the gym, which is not a through route.', noteStaff: 'Goes round a staff-only area.',
    noteOffice: 'Goes round the office, which is not a through route.', noteLibrary: 'Goes round the library rather than through it.',
    noteBusBay: 'Goes round the bus bay rather than across it.', noteCourts: 'Goes round the basketball courts rather than across them.',
    notePool: 'Goes round the pool deck, which is fenced.', noteLobby: 'Goes round the changing block: its lobbies are not a way through.',
    noteRoads: 'Keeps to the footpaths, off the driveways and the car park.',
    notePrimary: 'Keeps out of the primary school’s corridors.', noteSecondary: 'Keeps out of the secondary school’s corridors.',
    // words inside sentences and lists
    liftRef: 'the lift', liftBy: 'the lift by {mark}', liftOwn: 'the {name}', bridgeRef: 'the Linkway Bridge', walkwayRef: 'the covered walkway',
    connLift: 'Lift', connBridge: 'Bridge', connWalkway: 'Walkway',
    near: 'near {place}', listSep: ', ', and: ' and ', capSep: ' · ', withCode: '{name} ({code})',
    capGirls: 'Girls', capBoys: 'Boys', capWomen: 'Women', capMen: 'Men', capAdults: 'Adults',
    capFemale: 'Female', capMale: 'Male', capAccessible: 'Accessible',
    // who a toilet is for, inside a sentence ("Nearest for girls and boys")
    whoGirls: 'girls', whoBoys: 'boys', whoWomen: 'women', whoMen: 'men',
    // a toilet block named for what it holds
    toiletGirls: "Girls' Toilet", toiletBoys: "Boys' Toilet", toiletWomen: "Women's Toilet", toiletMen: "Men's Toilet",
    toiletAdults: "Adults' Toilet (all-gender)", toiletFemale: 'Female Toilet', toiletMale: 'Male Toilet', toiletAccessible: 'Accessible Toilet',
    toiletsOf: 'Toilets ({list})',
    minUnder: '<1 min',
    unknownPlace: 'This link points at “{q}”, which is not on the map.',
  },
  zh: {
    title: '地图',
    from: '起点', to: '终点',
    chooseStart: '选择您所在的位置',
    whereTo: '要去哪里？',
    youAreHere: '您在这里',
    swap: '交换起点和终点', endTrip: '清除路线', showMap: '显示地图',
    stepFree: '无障碍',
    stepFreeHint: '只走电梯和坡道',
    searchPh: '搜索房间、编号或地点',
    noResults: '没有找到“{q}”。可以试试房间编号（如 KB\u2060-\u2060405），或地点（如图书馆、洗手间）。',
    nearest: '最近的{what}',
    nearestToilet: '最近的洗手间', nearestLift: '最近的电梯', nearestOf: '最近的{what}', nearestFor: '{who}最近的洗手间', nearestAccessible: '最近的无障碍洗手间', kindNear: '{place}附近的{kind}',
    needStart: '请先选择您所在的位置，才能找到最近的地点。',
    chipToilet: '洗手间', chipLift: '电梯', chipStairs: '楼梯', chipFood: '食堂',
    chipLibrary: '图书馆', chipOffice: '办公室', chipGym: '体育馆', chipTheatre: '剧场',
    directionsHere: '到这里', startHere: '从这里出发', backToRoute: '返回路线',
    whichSide: '您在哪一侧？', sideCancel: '暂不选择',
    summary: '{dist} · 约 {time}',
    summaryShort: '{dist} · 不到 1 分钟',
    min: '{n} 分钟', sec: '{n} 秒',
    metres: '{n} 米',
    noRoute: '这两个地点之间没有路线。',
    noStepFree: '这两个地点之间没有无障碍路线。',
    stepFreeYours: '已按本机设置使用无障碍路线：只走电梯和坡道。',
    same: '您已经在这里了。',
    loading: '正在加载校园地图…',
    loadFail: '地图加载失败，请检查网络后重新加载页面。',
    showFloor: '显示整层',
    floors: '楼层',
    close: '关闭', back: '返回', clear: '清除', endSteps: '查看全程',
    popular: '常去的地方', arrivals: '入口和落客点', keepTyping: '请继续输入…', done: '完成', findPlace: '查找地点',
    shareTitlePhone: '分享这条路线', shareSubPhone: '发送链接，或让另一部手机扫描二维码。',
    floorUp: '上一层', floorDown: '下一层', floorUps: '上 {n} 层', floorDowns: '下 {n} 层',
    viaFloor: '经{f}',
    steps: '路线',
    allSteps: '全部步骤', hideSteps: '收起步骤', start: '开始', stepCount: '第 {i} 步，共 {n} 步',
    nextStop: '下一站：{place}', stopOf: '第 {i} 站，共 {n} 站',
    prevStep: '上一步', nextStep: '下一步',
    stepsTip: '地图不会定位您：按每一步走完后，点 › 看下一步。',
    docTitle: 'CIS 地图',
    language: '语言', chooseLanguage: '选择语言', languageLabel: '语言',
    results: '地点', recent: '最近',
    share: '在手机上打开此路线', shareTitle: '带走这条路线',
    shareSub: '用手机相机扫码，即可在手机上打开。', copyLink: '复制链接', copied: '已复制',
    shareLink: '分享这条路线', linkCopied: '链接已复制',
    shareNative: '分享…',
    tapMapTip: '不确定房间名称？返回地图，点选您所在的位置，再点“从这里出发”。',
    pickOnMap: '在地图上选择', pickFromSub: '点选您所在的位置', pickToSub: '点选要去的地方',
    pickFromNotice: '请在地图上点选您所在的位置。', pickToNotice: '请在地图上点选要去的地方。',
    floorOf: '{floor}',
    leave: '离开{place}', leaveTurn: '离开{place}后{dirTurn}', leaveStraight: '离开{place}后直行',
    startAt: '从{place}出发', startAtTurn: '从{place}出发，{dirTurn}', startAtStraight: '从{place}出发，直行',
    startAtToward: '从{place}出发，朝{mark}走',
    leaveByStraight: '从{side}离开{place}', leaveByHead: '从{side}离开{place}，前往{target}',
    leaveByToward: '从{side}离开{place}，朝{mark}走',
    leaveHead: '离开{place}，前往{target}', leaveTurnHead: '离开{place}后{dirTurn}，前往{target}',
    startAtHead: '从{place}出发，前往{target}', startAtTurnHead: '从{place}出发，{dirTurn}，前往{target}',
    onHead: '前往{target}', onStraight: '直行', onTurn: '{dirTurn}', onTurnHead: '{dirTurn}，前往{target}',
    onToward: '朝{mark}走',
    turn: '{dirTurn}', turnAt: '在{mark}处{dirTurn}', turnBy: '在{mark}旁{dirTurn}',
    turnEnd: '走到走廊尽头后{dirTurn}', turnEndPath: '走到路的尽头后{dirTurn}', turnAgain: '再{dirTurn}',
    bear: '稍向{dir}转', bearAt: '在{mark}处稍向{dir}转', bearBy: '在{mark}旁稍向{dir}转', bearAgain: '再稍向{dir}转',
    turnAround: '掉头',
    then: '{first}，然后{dirTurn}', thenAgain: '{first}，然后再{dirTurn}',
    left: '左', right: '右', leftTurn: '左转', rightTurn: '右转',
    arrive: '到达{place}', arriveSide: '到达{place}，在您的{dir}侧', arriveAhead: '到达{place}，就在前方',
    arriveOn: '在您的{dir}侧', arriveAheadShort: '就在前方',
    stairsUp: '走{stair}上楼到{floor}', stairsDown: '走{stair}下楼到{floor}',
    stairsUpN: '走{stair}上 {n} 层到{floor}', stairsDownN: '走{stair}下 {n} 层到{floor}',
    liftUp: '乘{lift}上到{floor}', liftDown: '乘{lift}下到{floor}',
    bridge: '经连廊前往{floor}',
    walkway: '沿有盖步道前往{floor}',
    seam: '继续前往{floor}',
    landing: '经{stair}平台进入{floor}',
    walkTo: '{dist}到{place}',
    onFloor: '在{floor}',
    toFloor: '前往{floor}', fromFloor: '来自{floor}',
    lakeside: 'Lakeside', tohtuck: 'Toh Tuck',
    level: '{n}楼', ttLevel: 'Toh Tuck {n}楼', floorIn: '{building} {floor}', levelWord: '楼层',
    levelShort: '{n}楼', ttShort: 'TT {n}楼',
    viaPlace: '{place}',
    about: '关于此地图',
    staffOnly: '仅限教职员工',
    noteGym: '绕过体育馆：体育馆不作通道。', noteStaff: '绕过教职员专用区域。',
    noteOffice: '绕过办公室：办公室不作通道。', noteLibrary: '绕过图书馆，不从中穿行。',
    noteBusBay: '绕过巴士停靠区，不从中穿行。', noteCourts: '绕过篮球场，不从中穿行。',
    notePool: '绕过泳池平台：平台有围栏。', noteLobby: '绕过更衣楼：其门厅不作通道。',
    noteRoads: '沿人行道走，避开车道和停车场。',
    notePrimary: '避开小学部的走廊。', noteSecondary: '避开中学部的走廊。',
    liftRef: '电梯', liftBy: '{mark}旁的电梯', liftOwn: '{name}', bridgeRef: '连廊', walkwayRef: '有盖步道',
    connLift: '电梯', connBridge: '连廊', connWalkway: '步道',
    near: '靠近{place}', listSep: '、', and: '和', capSep: '·', withCode: '{name}（{code}）',
    capGirls: '女生', capBoys: '男生', capWomen: '女士', capMen: '男士', capAdults: '成人',
    capFemale: '女', capMale: '男', capAccessible: '无障碍',
    whoGirls: '女生', whoBoys: '男生', whoWomen: '女士', whoMen: '男士',
    toiletGirls: '女生洗手间', toiletBoys: '男生洗手间', toiletWomen: '女士洗手间', toiletMen: '男士洗手间',
    toiletAdults: '成人洗手间（不分性别）', toiletFemale: '女洗手间', toiletMale: '男洗手间', toiletAccessible: '无障碍洗手间',
    toiletsOf: '洗手间（{list}）',
    minUnder: '<1 分钟',
    unknownPlace: '此链接指向“{q}”，但地图上没有这个地点。',
  },
};

export function t(lang, key, vars) {
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  if (lang === 'fr' && vars) s = elided(s);
  return lang === 'zh' || lang === 'zh-Hant' ? spaced(s) : s;
}

// French drops the vowel of de, le, la, que before a word that begins with one, and a name filled in
// can begin with one: "près de Escalier 2" -> "près d'Escalier 2", "que Atrium" -> "qu'Atrium". (Not
// before an h: the school's names with one take it aspirated, "le hall".)
function elided(s) {
  return s.replace(/(^|[\s(«\u202f])([dDlLjJ]e|[lL]a|[qQ]ue) ([aeiouyàâæéèêëîïôœùûüAEIOUYÀÂÆÉÈÊËÎÏÔŒÙÛÜ])/g, (m, b, w, c) => `${b}${w.slice(0, -1)}’${c}`);
}

// Chinese text sets a space between Chinese and a code or a number ("离开 KB-305 后左转"), but
// keeps a floor together ("5楼", "5樓").
function spaced(s) {
  return s.replace(/([\u3400-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u3400-\u9fff])/g, (m, a, b) => (/\d/.test(a) && /[楼层樓層]/.test(b) ? m : `${a} ${b}`));
}

// "Level 3" / "Toh Tuck Level 3" / "3楼"
export function floorName(floor, lang, short = false) {
  const tt = floor.building === 'tohtuck';
  const key = short ? (tt ? 'ttShort' : 'levelShort') : (tt ? 'ttLevel' : 'level');
  return t(lang, key, { n: floor.level });
}

export function buildingName(id, lang) { return t(lang, id === 'tohtuck' ? 'tohtuck' : 'lakeside'); }

// A floor with its building, the same way round in both: "Level 3 · Lakeside", "Level 3 · Toh Tuck".
export function floorLabel(floor, lang) {
  return `${t(lang, 'level', { n: floor.level })} · ${buildingName(floor.building, lang)}`;
}

export function fmtDist(m, lang) {
  const r = m < 10 ? Math.max(1, Math.round(m)) : m < 50 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
  return t(lang, 'metres', { n: r });
}

export function fmtTime(s, lang) {
  return t(lang, 'min', { n: Math.max(1, Math.round(s / 60)) });
}

// A walk's time in a list, short: "<1 min", "3 min" / "<1 分钟", "3 分钟"
export function fmtMins(s, lang) {
  return s < 45 ? t(lang, 'minUnder') : t(lang, 'min', { n: Math.round(s / 60) });
}

// A place's name in running text: its room code when it has one ("KB-305"), else its name.
export function placeName(p, lang) {
  if (!p) return '';
  if (p.code) return p.code;
  return nameIn(p.name, lang) || nameIn(p.label, lang) || p.id;
}

// A long name cut to what a sign would say: the first of its alternatives, without the note in
// brackets ("Main Entrance / School Entrance" -> "Main Entrance").
export function shortName(n) {
  return (n || '').split(/\s*[\/／]\s*/)[0].replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
}

// A place's full name for lists and cards: "Gross Motor Room 1" + "TK-401"; a plain classroom
// is known by its code.
export function placeTitle(p, lang) {
  if (p.code && isPlainClassroom(p)) return p.code;
  return nameIn(p.name, lang) || p.code || nameIn(p.label, lang) || p.id;
}

export function isPlainClassroom(p) { return !!p.name && /^classroom$/i.test(p.name.en || ''); }
