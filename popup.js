// 界面文字：按浏览器语言读取 _locales（中文浏览器显示中文，其他显示英文）
const L = (k, subs) => { try { return chrome.i18n.getMessage(k, subs) || k; } catch { return k; } };
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
document.documentElement.lang = (() => { try { return chrome.i18n.getUILanguage(); } catch { return 'en'; } })();
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = L(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', L(el.dataset.i18nAria)));
document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = L(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
document.getElementById('readerKey').textContent = IS_MAC ? '⌥⇧R' : 'Alt+Shift+R';

const PRESETS = [
  { name: L('swGraphite'), bg: '#22242a' },
  { name: L('swNight'), bg: '#1a1f2b' },
  { name: L('swWarm'), bg: '#2a2622' },
  { name: L('swGreen'), bg: '#1d2624' },
  { name: L('swBlack'), bg: '#000000' },
];
const DEFAULT = { bg: '#22242a', text: 0.93 };

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
let tabId = null;
let palette = { ...DEFAULT };

/* ---------- 和当前网页通信 ---------- */
async function ask(cmd, extra = {}) {
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, { cmd, ...extra }); }
  catch { return null; }
}

function render(st) {
  if (!st) { document.body.classList.add('na'); return; }
  $('host').textContent = st.host || L('pLocalFile');
  $('siteDark').checked = st.dark;
  const note = $('siteNote');
  if (st.manual) {
    note.textContent = L('pManual') + ' · ';
    const a = document.createElement('a');
    a.id = 'reset';
    a.textContent = L('pReturnAuto');
    note.appendChild(a);
    $('reset').onclick = async () => render(await ask('reset-site'));
  } else if (st.nativeDark) {
    note.textContent = L('pNativeDark');
  } else {
    note.textContent = autoLabel();
  }
  $('readerLabel').textContent = st.reader ? L('pReaderClose') : L('pReaderOpen');
  const t = st.tune || { brightness: 1, never: false };
  $('never').checked = !!t.never;
  if (!tuneTimer) $('bright').value = Math.round(t.brightness * 100);   // 正在拖动时不要把滑块弹回去
  paintBright();
}

/* ---------- 配色 ---------- */
function mix(hex, t) {
  const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const top = [242, 244, 248];
  return `rgb(${bg.map((b, i) => Math.round(b + (top[i] - b) * t)).join(',')})`;
}
function paintPalette() {
  for (const el of $('swatches').children) el.setAttribute('aria-checked', String(el.dataset.bg === palette.bg));
  $('text').value = Math.round(palette.text * 100);
  $('preview').style.background = palette.bg;
  $('preview').style.color = mix(palette.bg, palette.text);
}
let saveTimer = 0;
function savePalette() {
  paintPalette();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set({ palette }), 60);   // 拖动滑块时不要每一帧都写
}

for (const p of PRESETS) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = p.bg;
  b.dataset.bg = p.bg;
  b.title = p.name;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', p.name);
  b.onclick = () => { palette.bg = p.bg; savePalette(); };
  $('swatches').appendChild(b);
}
$('text').oninput = (e) => { palette.text = e.target.value / 100; savePalette(); };

/* ---------- 按网站微调 ---------- */
function paintBright() {
  const v = +$('bright').value;
  $('brightVal').textContent = v === 100 ? '100%' : `${v}% · ${L('pReset')}`;
}
let tuneTimer = 0;
$('bright').oninput = () => {
  paintBright();
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => { tuneTimer = 0; ask('set-tune', { tune: { brightness: $('bright').value / 100 } }); }, 40);
};
$('brightVal').onclick = async () => {
  clearTimeout(tuneTimer); tuneTimer = 0;
  $('bright').value = 100;
  paintBright();
  render(await ask('set-tune', { tune: { brightness: 1 } }));
};
$('never').onchange = async (e) => {
  clearTimeout(tuneTimer); tuneTimer = 0;   // 把还没发出的亮度一起带上
  render(await ask('set-tune', { tune: { never: e.target.checked, brightness: $('bright').value / 100 } }));
};

/* ---------- 开关 ---------- */
$('siteDark').onchange = async (e) => render(await ask('set-dark', { on: e.target.checked }));
/* ---------- 自动开启：跟随系统 / 定时 / 关闭 ---------- */
let mode = 'system';
let sched = { from: '19:00', to: '07:00' };
let pos = 'br';
function autoLabel() {
  if (mode === 'schedule') return L('pScheduled', [sched.from, sched.to]);
  if (mode === 'off') return L('pAutoOff');
  return L('pFollowing');
}
function paintMode() {
  for (const b of $('mode').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  $('times').classList.toggle('show', mode === 'schedule');
  $('from').value = sched.from;
  $('to').value = sched.to;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  $('overnight').textContent = toMin(sched.from) > toMin(sched.to) ? L('pNextDay') : toMin(sched.from) === toMin(sched.to) ? L('pSameTime') : '';
  $('modeNote').textContent =
    mode === 'system' ? L('pModeNoteSystem') :
    mode === 'schedule' ? '' : L('pModeNoteOff');
  $('modeNote').style.display = mode === 'schedule' ? 'none' : '';
}
async function refreshSite() { setTimeout(async () => render(await ask('state')), 90); }
$('mode').onclick = async (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  mode = b.dataset.mode;
  paintMode();
  await store.set({ autoMode: mode });
  refreshSite();
};
for (const id of ['from', 'to']) {
  $(id).onchange = async (e) => {
    if (!e.target.value) { paintMode(); return; }   // 清空了就恢复原值
    sched = { ...sched, [id]: e.target.value };
    paintMode();
    await store.set({ schedule: sched });
    refreshSite();
  };
}

/* ---------- 按钮位置 ---------- */
function paintPos() { for (const b of $('pos').children) b.setAttribute('aria-checked', String(b.dataset.pos === pos)); }
$('pos').onclick = (e) => {
  const b = e.target.closest('[data-pos]');
  if (!b) return;
  pos = b.dataset.pos;
  paintPos();
  store.set({ dockPos: pos });
};
$('reader').onclick = async () => { await ask('reader'); window.close(); };

/* ---------- 初始化 ---------- */
(async () => {
  const s = await store.get(['palette', 'followSystem', 'autoMode', 'schedule', 'dockPos']);
  palette = { ...DEFAULT, ...(s.palette || {}) };
  mode = s.autoMode || (s.followSystem === false ? 'off' : 'system');
  sched = { ...sched, ...(s.schedule || {}) };
  pos = s.dockPos || 'br';
  paintMode();
  paintPos();
  paintPalette();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab ? tab.id : null;
  render(await ask('state'));
})();
