(() => {
  if (window.top !== window || window.__glide) return;
  window.__glide = true;

  const root = document.documentElement;
  // 界面文字：按浏览器语言读取 _locales（中文浏览器显示中文，其他显示英文）
  const L = (k, subs) => { try { return chrome.i18n.getMessage(k, subs) || k; } catch { return k; } };
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keys = (k) => (IS_MAC ? '⌥⇧' + k : 'Alt+Shift+' + k);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'site:' + (location.hostname || location.protocol);
  // 整页只用浏览器原生、GPU 加速的滤镜（不用 SVG 滤镜，避免标签页崩溃）
  const FILTER = 'invert(1) hue-rotate(180deg)';
  // 再用两层全屏混合层定色：背景 #22242a，最亮文字 #e3e5ea
  // （层在反色之前混合，所以这里写的是"反色前"的颜色）
  const tintLo = document.createElement('glide-tint'); tintLo.className = 'lo';
  const tintHi = document.createElement('glide-tint'); tintHi.className = 'hi';
  const MEDIA = 'img,video,picture,canvas,iframe,embed,object,[style*="background-image"]';
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 夜间模式（全局样式） ---------- */
  const globalStyle = document.createElement('style');
  globalStyle.textContent = `
    html.glide-dark{background-color:#fff!important}
    glide-tint{display:none!important}
    html.glide-dark > glide-tint{display:block!important;position:fixed!important;inset:0!important;
      margin:0!important;pointer-events:none!important;z-index:2147483646!important}
    html.glide-dark > glide-tint.lo{mix-blend-mode:multiply!important}
    html.glide-dark > glide-tint.hi{mix-blend-mode:screen!important}
    html.glide-dark :is(${MEDIA}) :is(${MEDIA}){filter:none!important}
    @media print{glide-dock{display:none!important}}
  `;
  (document.head || root).appendChild(globalStyle);

  /* ---------- 配色：底色 + 文字亮度 → 两个混合层的颜色 ---------- */
  const PALETTE = 'palette';
  const DEFAULT_PALETTE = { bg: '#22242a', text: 0.93 };
  const paletteStyle = document.createElement('style');
  (document.head || root).appendChild(paletteStyle);
  const H = [[-.574, 1.43, .144], [.426, .43, .144], [.426, 1.43, -.856]];   // hue-rotate(180deg)
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const F = (c) => { const v = c.map((x) => 1 - x); return H.map((r) => clamp(r[0] * v[0] + r[1] * v[1] + r[2] * v[2])); };
  const rgb = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')})`;
  function setPalette(p) {
    const hex = /^#[0-9a-f]{6}$/i.test(p && p.bg) ? p.bg : DEFAULT_PALETTE.bg;
    const text = Math.min(1, Math.max(0.6, +(p && p.text) || DEFAULT_PALETTE.text));
    const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const top = [242, 244, 248].map((x) => x / 255);
    const fg = bg.map((b, i) => b + (top[i] - b) * text);          // 最亮的文字颜色
    const bgp = bg.map((b, i) => (fg[i] ? Math.min(1, b / fg[i]) : 0));
    paletteStyle.textContent =
      `html.glide-dark > glide-tint.lo{background:${rgb(F(bgp))}!important}` +
      `html.glide-dark > glide-tint.hi{background:${rgb(F(fg))}!important}`;
  }
  setPalette(DEFAULT_PALETTE);

  /* ---------- 按网站微调：亮度、不自动开启 ---------- */
  const TUNE = 'tune:' + (location.hostname || location.protocol);
  const DEFAULT_TUNE = { brightness: 1, never: false };
  let tune = { ...DEFAULT_TUNE };
  const filterStyle = document.createElement('style');
  (document.head || root).appendChild(filterStyle);
  function applyFilter() {
    const b = Math.min(1.4, Math.max(0.6, +tune.brightness || 1));
    // 整页：反色 → 回正色相 → 调亮度；图片视频：先抵消亮度，再反色回来，保持原样
    const page = b === 1 ? FILTER : `${FILTER} brightness(${b})`;
    const media = b === 1 ? FILTER : `brightness(${(1 / b).toFixed(4)}) hue-rotate(180deg) invert(1)`;
    filterStyle.textContent =
      `html.glide-dark{filter:${page}!important}` +
      `html.glide-dark :is(${MEDIA}){filter:${media}!important}`;
  }
  function setTune(t) {
    tune = { ...DEFAULT_TUNE, ...(t || {}) };
    applyFilter();
  }
  applyFilter();

  // 唯一的状态来源：点击时立即更新，不依赖 DOM（动画进行中 DOM 还没变）
  let dark = false;
  let transition = null;
  const applyTheme = (on) => {
    if (on && !tintLo.isConnected) root.append(tintLo, tintHi);
    if (host && on && root.lastElementChild !== host) root.appendChild(host);   // 按钮始终在混合层之上
    root.classList.toggle('glide-dark', on);
    if (host) refreshLook();
  };
  /* ---------- 明暗由谁决定 ----------
     1. 这个网站手动选过 → 用手动的选择
     2. 没选过 → 跟随系统：系统是深色、且网页本身不是深色时开启
     手动切换后若恰好和"跟随系统"的结果一致，就清掉手动记录，继续跟随系统 */
  const FOLLOW = 'followSystem';   // 旧版设置，读到 false 时当作"关闭"
  const DBL = 'dblTop';             // 双击空白处回到顶部（默认开）
  let dblTop = true;
  const POS = 'dockPos';            // 按钮位置：br 右下 / bl 左下 / rm 右侧中间 / lm 左侧中间
  let pos = 'br';
  function setPos(p) {
    pos = ['br', 'bl', 'rm', 'lm'].includes(p) ? p : 'br';
    if (!host) return;
    for (const k of ['br', 'bl', 'rm', 'lm']) host.classList.toggle('pos-' + k, k === pos);
    host.classList.toggle('left', pos === 'bl' || pos === 'lm');
  }
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const TAB = Math.random().toString(36).slice(2);   // 写入时带上，忽略自己写入的回声
  let siteChoice = null;   // null = 没手动选过
  // 自动开启方式：system 跟随系统 / schedule 定时 / off 关闭
  const MODE = 'autoMode', SCHED = 'schedule';
  let mode = 'system';
  let sched = { from: '19:00', to: '07:00' };
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return ((h || 0) * 60 + (m || 0)) % 1440; };
  function inSchedule() {
    const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
    const a = toMin(sched.from), b = toMin(sched.to);
    if (a === b) return false;
    return a < b ? now >= a && now < b : now >= a || now < b;   // 跨午夜，例如 19:00–07:00
  }
  const readMode = (r) => r[MODE] || (r[FOLLOW] === false ? 'off' : 'system');
  const readSite = (v) => (v == null ? null : typeof v === 'object' ? !!v.on : !!v);
  const autoOn = () => (mode === 'system' ? sysDark.matches : mode === 'schedule' ? inSchedule() : false);
  const autoDark = () => !tune.never && autoOn() && !pageNativeDark();
  const wanted = () => (siteChoice !== null ? siteChoice : autoDark());
  const setFromOutside = (on) => {
    if (on === dark) return;
    dark = on;
    if (transition) transition.skipTransition();
    applyTheme(on);
  };
  let ready = false;   // 读到设置之前不做判断，避免闪一下
  const sync = () => { if (ready) setFromOutside(wanted()); };
  const save = () => {
    if (dark === autoDark()) {
      siteChoice = null;
      if (store) store.remove(KEY).catch(() => {});
    } else {
      siteChoice = dark;
      if (store) store.set({ [KEY]: { on: dark, src: TAB } }).catch(() => {});
    }
  };
  const resetSite = () => {
    siteChoice = null;
    if (store) store.remove(KEY).catch(() => {});
    sync();
  };

  sysDark.addEventListener('change', sync);
  // 定时模式：每 30 秒看一眼时间；电脑从睡眠醒来、切回标签页时也立刻检查
  setInterval(() => { if (mode === 'schedule') sync(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (mode === 'schedule' && !document.hidden) sync(); });
  if (store) {
    store.get([KEY, FOLLOW, MODE, SCHED, PALETTE, TUNE, POS, DBL]).then((r) => {
      dblTop = r[DBL] !== false;
      siteChoice = readSite(r[KEY]);
      setTune(r[TUNE]);
      mode = readMode(r);
      if (r[SCHED]) sched = { ...sched, ...r[SCHED] };
      setPos(r[POS]);
      if (r[PALETTE]) setPalette(r[PALETTE]);
      ready = true;
      sync();
    }).catch(() => { ready = true; sync(); });
    chrome.storage.onChanged.addListener((ch) => {
      if (KEY in ch) {
        const v = ch[KEY].newValue;
        if (v && v.src === TAB) return;   // 自己写的
        siteChoice = readSite(v);         // 同一网站的其他标签页切换了
      }
      if (MODE in ch) mode = ch[MODE].newValue || 'system';
      if (SCHED in ch && ch[SCHED].newValue) sched = { ...sched, ...ch[SCHED].newValue };
      if (PALETTE in ch) setPalette(ch[PALETTE].newValue);
      if (TUNE in ch) setTune(ch[TUNE].newValue);
      if (POS in ch) setPos(ch[POS].newValue);
      if (DBL in ch) dblTop = ch[DBL].newValue !== false;
      if (KEY in ch || MODE in ch || SCHED in ch || TUNE in ch) sync();
    });
  } else {
    ready = true;
    sync();
  }

  /* ---------- 悬浮按钮 ---------- */
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I_UP = icon('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>');
  const I_DOWN = icon('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>');
  const I_MOON = icon('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>');
  const I_SUN = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>');

  const I_BOOK = icon('<path d="M2.5 4.5h5.5a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2.5z"/><path d="M21.5 4.5H16a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h6.5z"/>');

  let host, dock, btnUp, btnDown, btnTheme, btnReader;
  let hovering = false, nearEdge = false, hideTimer = 0, lastScroller = null;

  function build() {
    host = document.createElement('glide-dock');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial;position:fixed;right:20px;bottom:28px;z-index:2147483647;
          --bg:rgba(255,255,255,.72);--fg:#1d1d1f;--ring:rgba(0,0,0,.08);--sh:rgba(0,0,0,.12);--hover:rgba(0,0,0,.06)}
        /* 页面本身是深色 */
        :host(.native-dark){--bg:rgba(40,40,42,.72);--fg:#f5f5f7;--ring:rgba(255,255,255,.10);--sh:rgba(0,0,0,.45);--hover:rgba(255,255,255,.10)}
        /* Glide 夜间模式：整页被反色，这里写的是"反色前"的颜色 */
        :host(.glide-dark){--bg:rgba(207,209,215,.78);--fg:#181a1f;--ring:rgba(0,0,0,.10);--sh:rgba(255,255,255,.45);--hover:rgba(0,0,0,.10)}

        :host(.pos-bl){right:auto;left:20px}
        :host(.pos-rm){right:12px;bottom:auto;top:50%;transform:translateY(-50%)}
        :host(.pos-lm){right:auto;left:12px;bottom:auto;top:50%;transform:translateY(-50%)}
        :host(.left) .dock:not(.show){transform:translateX(-10px) scale(.96)}
        .dock{display:flex;flex-direction:column;align-items:center;padding:4px;border-radius:999px;
          background:var(--bg);color:var(--fg);
          -webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
          box-shadow:0 0 0 .5px var(--ring),0 8px 28px -6px var(--sh),0 1px 2px var(--sh);
          opacity:0;transform:translateX(10px) scale(.96);pointer-events:none;
          transition:opacity .35s ${EASE},transform .5s ${EASE},background .3s,color .3s}
        .dock.show{opacity:1;transform:none;pointer-events:auto}

        button{all:unset;box-sizing:border-box;position:relative;width:32px;height:32px;border-radius:50%;
          display:grid;place-items:center;cursor:pointer;overflow:hidden;
          transition:background .2s,transform .2s ${EASE},opacity .3s ${EASE},height .4s ${EASE}}
        button:hover{background:var(--hover)}
        button:active{transform:scale(.88)}
        button:focus-visible{box-shadow:0 0 0 2px #0a84ff}
        button.off{height:0;opacity:0;pointer-events:none}

        svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .theme svg{position:absolute;inset:0;margin:auto;transition:transform .55s ${EASE},opacity .3s}
        .theme .sun{opacity:0;transform:rotate(-90deg) scale(.4)}
        :host(.on) .theme .sun{opacity:1;transform:none}
        :host(.on) .theme .moon{opacity:0;transform:rotate(90deg) scale(.4)}
        /* 阅读模式打开时，书本按钮保持高亮 */
        .reader.active{background:var(--hover);color:#0a84ff}
        :host(.glide-dark) .reader.active{color:#239dff}   /* 反色 + 色相回转后呈现为 #0a84ff */

        @media (prefers-reduced-motion: reduce){*{transition-duration:.01s!important}}
      </style>
      <div class="dock" part="dock">
        <button class="up" title="${esc(L('dockTop'))} (${keys('↑')})" aria-label="${esc(L('dockTop'))}">${I_UP}</button>
        <button class="theme" title="${esc(L('dockTheme'))} (${keys('L')})" aria-label="${esc(L('dockTheme'))}">
          ${I_MOON.replace('<svg', '<svg class="moon"')}
          ${I_SUN.replace('<svg', '<svg class="sun"')}
        </button>
        <button class="reader" title="${esc(L('dockReader'))} (${keys('R')})" aria-label="${esc(L('dockReader'))}" aria-pressed="false">${I_BOOK}</button>
        <button class="down" title="${esc(L('dockBottom'))} (${keys('↓')})" aria-label="${esc(L('dockBottom'))}">${I_DOWN}</button>
      </div>`;
    dock = shadow.querySelector('.dock');
    btnUp = shadow.querySelector('.up');
    btnDown = shadow.querySelector('.down');
    btnTheme = shadow.querySelector('.theme');
    btnReader = shadow.querySelector('.reader');

    btnUp.addEventListener('click', () => scrollToEdge('top'));
    btnDown.addEventListener('click', () => scrollToEdge('bottom'));
    btnTheme.addEventListener('click', () => toggleTheme());
    btnReader.addEventListener('click', () => { if (window.__glideReader) window.__glideReader.toggle(); });
    host.addEventListener('mouseenter', () => { hovering = true; show(); });
    host.addEventListener('mouseleave', () => { hovering = false; show(); });

    root.appendChild(host);
    setPos(pos);
    sync();          // 页面加载完后再判断一次：此时才能看出网页本身是不是深色
    refreshLook();
    update();
  }

  /* ---------- 外观：跟随页面明暗 ---------- */
  function luminance(color) {
    const m = color.match(/[\d.]+/g);
    if (!m || (m.length === 4 && +m[3] === 0)) return null;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  // 网页本身是不是深色（读取网页自己的背景色，先临时去掉 Glide 的样式）
  function pageNativeDark() {
    const had = root.classList.contains('glide-dark');
    if (had) root.classList.remove('glide-dark');
    let result = false;
    for (const el of [document.body, root]) {
      if (!el) continue;
      const l = luminance(getComputedStyle(el).backgroundColor);
      if (l !== null) { result = l < 0.4; break; }
    }
    if (had) root.classList.add('glide-dark');
    return result;
  }
  function refreshLook() {
    const on = root.classList.contains('glide-dark');
    host.classList.toggle('on', on);
    host.classList.toggle('glide-dark', on);
    host.classList.toggle('native-dark', !on && pageNativeDark());
    if (window.__glideReader) window.__glideReader.setDark(on);
  }

  /* ---------- 滚动容器识别（兼容内部滚动的网页应用） ---------- */
  const docEl = () => document.scrollingElement || root;
  const scrollable = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el === docEl()) return el.scrollHeight > innerHeight + 1;
    const oy = getComputedStyle(el).overflowY;
    return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      el.scrollHeight > el.clientHeight + 1 && el.clientHeight > innerHeight * 0.4;
  };
  function getScroller() {
    const rs = window.__glideReader && window.__glideReader.scroller();
    if (rs) return rs;                       // 阅读模式打开时，滚动的是阅读页
    if (lastScroller && lastScroller.isConnected && scrollable(lastScroller)) return lastScroller;
    if (scrollable(docEl())) return docEl();
    let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (el && el !== root) {
      if (scrollable(el)) return el;
      el = el.parentElement;
    }
    return docEl();
  }

  function scrollToEdge(where) {
    const s = getScroller();
    const top = where === 'top' ? 0 : s.scrollHeight;
    const behavior = reduceMotion() ? 'auto' : 'smooth';
    (s === docEl() ? window : s).scrollTo({ top, behavior });
  }

  /* ---------- 显示 / 隐藏 ---------- */
  function update() {
    if (!host) return;
    const s = getScroller();
    const isDoc = s === docEl();
    const y = isDoc ? window.scrollY : s.scrollTop;
    const max = s.scrollHeight - (isDoc ? innerHeight : s.clientHeight);
    btnUp.classList.toggle('off', y < 8);
    btnDown.classList.toggle('off', max - y < 8);
  }
  function show(ms = 1400) {
    if (!host) return;
    if (!host.isConnected) root.appendChild(host);
    if (document.fullscreenElement) { dock.classList.remove('show'); return; }
    dock.classList.add('show');
    clearTimeout(hideTimer);
    if (!hovering && !nearEdge) {
      hideTimer = setTimeout(() => {
        if (!hovering && !nearEdge) dock.classList.remove('show');
      }, ms);
    }
  }

  let raf = 0;
  addEventListener('scroll', (e) => {
    const t = e.target;
    if (t && t.nodeType === 1 && scrollable(t)) lastScroller = t;
    else if (t === document) lastScroller = null;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; update(); show(); });
  }, { capture: true, passive: true });

  let mraf = 0;
  addEventListener('mousemove', (e) => {
    if (mraf) return;
    mraf = requestAnimationFrame(() => {
      mraf = 0;
      const was = nearEdge;
      // 鼠标靠近按钮所在的位置（四周留出一圈感应区）
      const r = host ? host.getBoundingClientRect() : null;
      nearEdge = !!r && r.width > 0 &&
        e.clientX > r.left - 70 && e.clientX < r.right + 70 && e.clientY > r.top - 90 && e.clientY < r.bottom + 60;
      if (nearEdge || was) { update(); show(); }
    });
  }, { passive: true });

  addEventListener('resize', () => update(), { passive: true });
  addEventListener('glide-scroll', () => { update(); show(); });   // 阅读模式里的滚动

  /* ---------- 双击空白处回到顶部 ----------
     只在真正的空白处生效：双击段落等含文字的元素、链接、按钮、输入框、图片、视频、
     地图画布、可编辑区域都不触发；网页自己处理了双击（preventDefault）也不触发 */
  const NOT_BLANK = 'a,button,input,textarea,select,option,label,summary,details,[contenteditable],[role="button"],' +
    '[role="textbox"],[role="slider"],[role="menuitem"],[role="tab"],[role="link"],[draggable="true"],' +
    'img,picture,video,audio,canvas,svg,iframe,embed,object,glide-dock';
  // 被点中的元素自己直接含有文字（段落、列表项、标题…）就算"点在文字上"
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  addEventListener('dblclick', (e) => {
    if (!dblTop || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const t = e.composedPath()[0];                         // 阅读模式在 shadow DOM 里，取真实目标
    if (!(t instanceof Element) || t.isContentEditable || t.closest(NOT_BLANK) || hasOwnText(t)) return;
    const s = getScroller();
    const y = s === docEl() ? window.scrollY : s.scrollTop;
    if (y < 8) return;                                     // 已经在顶部
    const sel = getSelection();
    if (sel) sel.removeAllRanges();                        // 双击空白处时浏览器会顺手选中旁边一个字，清掉
    scrollToEdge('top');
    update();
    show();
  });
  addEventListener('glide-reader', () => {                          // 阅读模式打开 / 关闭
    if (!btnReader) return;
    const on = !!(window.__glideReader && window.__glideReader.isOpen());
    btnReader.classList.toggle('active', on);
    btnReader.setAttribute('aria-pressed', String(on));
    btnReader.title = on ? `${L('readerExit')} (Esc)` : `${L('dockReader')} (${keys('R')})`;
    update();
  });
  document.addEventListener('fullscreenchange', () => show());

  /* ---------- 明暗切换：从按钮处圆形展开 ---------- */
  function toggleTheme() {
    dark = !dark;
    save();

    // 动画还没放完又点了一次：结束当前动画，直接切到最新状态
    if (transition) {
      transition.skipTransition();
      applyTheme(dark);
      return;
    }

    const r0 = btnTheme && btnTheme.getBoundingClientRect();
    const x = r0 && r0.width ? r0.left + r0.width / 2 : innerWidth - 36;
    const y = r0 && r0.width ? r0.top + r0.height / 2 : innerHeight - 44;

    if (!document.startViewTransition || reduceMotion() || document.visibilityState !== 'visible') {
      applyTheme(dark);
      return;
    }
    const vt = document.createElement('style');
    vt.textContent = `::view-transition-old(root),::view-transition-new(root){animation:none!important;mix-blend-mode:normal!important}`;
    root.appendChild(vt);
    // 回调里读最新的 dark，而不是闭包里的旧值
    let started = false;
    const t = transition = document.startViewTransition(() => { started = true; applyTheme(dark); });
    // 保险：浏览器 300ms 内没开始动画（标签页在后台、卡顿等），直接切换，不再等
    setTimeout(() => {
      if (started) return;
      t.skipTransition();
      vt.remove();
      if (transition === t) transition = null;
      applyTheme(dark);
    }, 300);
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    t.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    t.finished.catch(() => {}).finally(() => {
      vt.remove();
      if (transition === t) transition = null;
    });
  }

  /* ---------- 快捷键 / 工具栏图标 ---------- */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((m, _sender, reply) => {
      if (m.cmd === 'to-top') scrollToEdge('top');
      else if (m.cmd === 'to-bottom') scrollToEdge('bottom');
      else if (m.cmd === 'toggle-theme') { show(); toggleTheme(); }
      else if (m.cmd === 'set-dark') { if (!!m.on !== dark) toggleTheme(); reply(state()); }
      else if (m.cmd === 'reset-site') { resetSite(); reply(state()); }
      else if (m.cmd === 'set-tune') {
        setTune({ ...tune, ...m.tune });
        const isDefault = tune.brightness === 1 && !tune.never;
        if (store) (isDefault ? store.remove(TUNE) : store.set({ [TUNE]: tune })).catch(() => {});
        sync();
        reply(state());
      }
      else if (m.cmd === 'reader') { if (window.__glideReader) window.__glideReader.toggle(); reply(state()); }
      else if (m.cmd === 'state') reply(state());
    });
  }

  // 给设置面板看的当前状态
  function state() {
    return {
      host: location.hostname,
      dark,
      manual: siteChoice !== null,
      nativeDark: pageNativeDark(),
      tune: { ...tune },
      mode,
      systemDark: sysDark.matches,
      reader: !!(window.__glideReader && window.__glideReader.isOpen()),
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  else build();
})();
