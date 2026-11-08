const PRESETS = [
  { name: '石墨', bg: '#22242a' },
  { name: '夜蓝', bg: '#1a1f2b' },
  { name: '暖棕', bg: '#2a2622' },
  { name: '墨绿', bg: '#1d2624' },
  { name: '纯黑', bg: '#000000' },
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
  $('host').textContent = st.host || '本地文件';
  $('siteDark').checked = st.dark;
  const note = $('siteNote');
  if (st.manual) {
    note.innerHTML = '手动设置 · <a id="reset">恢复跟随系统</a>';
    $('reset').onclick = async () => render(await ask('reset-site'));
  } else if (st.nativeDark) {
    note.textContent = '网页本身是深色，已自动跳过';
  } else {
    note.textContent = autoLabel();
  }
  $('readerLabel').textContent = st.reader ? '退出阅读模式' : '进入阅读模式';
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
  $('brightVal').textContent = v === 100 ? '100%' : `${v}% · 重置`;
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
  if (mode === 'schedule') return `定时 ${sched.from}–${sched.to}`;
  if (mode === 'off') return '自动开启已关闭';
  return '跟随系统';
}
function paintMode() {
  for (const b of $('mode').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  $('times').classList.toggle('show', mode === 'schedule');
  $('from').value = sched.from;
  $('to').value = sched.to;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  $('overnight').textContent = toMin(sched.from) > toMin(sched.to) ? '次日' : toMin(sched.from) === toMin(sched.to) ? '时间不能相同' : '';
  $('modeNote').textContent =
    mode === 'system' ? 'macOS / Windows 切到深色时，为浅色网站开启' :
    mode === 'schedule' ? '' : '只在你手动打开的网站使用夜间模式';
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
