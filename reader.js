/* Glide 阅读模式：找出正文，用干净的排版单独展示 */
(() => {
  if (window.top !== window || window.__glideReader) return;

  const NEG = /comment|footer|footnote|sidebar|side-?bar|aside|nav|menu|share|social|related|recommend|advert|\bads?\b|ad-|promo|sponsor|popup|modal|cookie|subscribe|login|signin|breadcrumb|toolbar|widget|banner|rank|hot-?list|copyright/i;
  const POS = /article|content|post|entry|main|body|text|story|topic|markdown|prose|detail/i;
  const KEEP_ATTR = new Set(['href', 'src', 'srcset', 'alt', 'title', 'colspan', 'rowspan']);
  const DROP = 'script,style,noscript,iframe,form,input,button,select,textarea,nav,aside,footer,svg,canvas,object,embed,[hidden],[aria-hidden="true"],[role="navigation"],[role="complementary"],[role="banner"]';

  const textLen = (el) => (el.textContent || '').replace(/\s+/g, '').length;
  const classWeight = (el) => {
    const s = (el.className && typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
    let w = 0;
    if (NEG.test(s)) w -= 25;
    if (POS.test(s)) w += 25;
    return w;
  };
  const linkDensity = (el) => {
    const all = textLen(el) || 1;
    let links = 0;
    el.querySelectorAll('a').forEach((a) => { links += textLen(a); });
    return links / all;
  };
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  /* ---------- 找正文 ---------- */
  function findMain() {
    const scores = new Map();
    const add = (el, s) => { if (el && el !== document.documentElement) scores.set(el, (scores.get(el) || 0) + s); };

    // 段落：<p>、<pre>、<blockquote>，以及直接写文字、没有块级子元素的 <div>
    const paras = [...document.querySelectorAll('p,pre,blockquote,div,td,section')].filter((el) => {
      if (el.tagName === 'DIV' || el.tagName === 'TD' || el.tagName === 'SECTION') {
        if (el.querySelector('p,div,section,article,table,ul,ol,pre,blockquote')) return false;
      }
      return textLen(el) >= 20 && visible(el);
    });
    for (const p of paras) {
      const t = p.textContent || '';
      const len = textLen(p);
      const s = 1 + (t.match(/[,，、。；;]/g) || []).length * 0.5 + Math.min(len / 100, 3);
      add(p.parentElement, s);
      add(p.parentElement && p.parentElement.parentElement, s / 2);
      const g = p.parentElement && p.parentElement.parentElement;
      add(g && g.parentElement, s / 3);
    }

    let best = null, bestScore = 0;
    for (const [el, s0] of scores) {
      if (el === document.body) continue;
      const s = (s0 + classWeight(el)) * (1 - linkDensity(el));
      if (s > bestScore) { best = el; bestScore = s; }
    }
    // 偏好语义化的 <article>/<main>，如果它包含最佳节点且没大太多
    if (best) {
      const art = best.closest('article,[role="main"],main');
      if (art && textLen(art) < textLen(best) * 1.6) best = art;
    }
    return best && textLen(best) > 140 ? best : null;
  }

  function findTitle(main) {
    const og = document.querySelector('meta[property="og:title"]');
    const h1 = (main && main.querySelector('h1')) || document.querySelector('h1');
    const t = (og && og.content) || (h1 && h1.textContent) || document.title || '';
    return t.replace(/\s+/g, ' ').trim();
  }

  /* ---------- 清理 ---------- */
  function clean(main, title) {
    const node = main.cloneNode(true);
    // 克隆前先记住原图尺寸（克隆的 img 可能还没加载）
    const origImgs = main.querySelectorAll('img');
    node.querySelectorAll('img').forEach((img, i) => {
      const o = origImgs[i];
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-actualsrc');
      if (lazy) img.setAttribute('src', lazy);
      const w = o ? (o.naturalWidth || o.width) : 0;
      if (o && o.complete && w && w < 48) img.remove();   // 小图标、表情
    });

    node.querySelectorAll(DROP).forEach((el) => el.remove());
    node.querySelectorAll('*').forEach((el) => {
      if (!node.contains(el)) return;   // 祖先已经被删掉了
      const s = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
      if (NEG.test(s) && !POS.test(s) && textLen(el) < 400) { el.remove(); return; }
    });
    node.querySelectorAll('*').forEach((el) => {
      for (const a of [...el.attributes]) if (!KEEP_ATTR.has(a.name)) el.removeAttribute(a.name);
      if (el.tagName === 'A') {
        if (el.href) el.setAttribute('href', el.href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (el.tagName === 'IMG' && el.getAttribute('src')) el.setAttribute('src', el.src);
    });
    // 去掉和标题重复的 h1、空元素
    node.querySelectorAll('h1').forEach((h) => { if (h.textContent.trim() === title) h.remove(); });
    node.querySelectorAll('div,span,p,section,li').forEach((el) => {
      if (!el.textContent.trim() && !el.querySelector('img,video,picture,pre,br')) el.remove();
    });
    return node;
  }

  const readingTime = (text) => {
    const cjk = (text.match(/[一-鿿぀-ヿ가-힯]/g) || []).length;
    const words = (text.replace(/[一-鿿぀-ヿ가-힯]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    return Math.max(1, Math.round(cjk / 400 + words / 220));
  };

  /* ---------- 界面 ---------- */
  const CSS = `
    :host{all:initial;position:fixed;inset:0;z-index:2147483645}
    .wrap{position:fixed;inset:0;overflow-y:auto;overscroll-behavior:contain;background:#fbfaf7;color:#262626;
      opacity:0;transition:opacity .35s cubic-bezier(.2,.8,.2,1);outline:none;
      -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    .wrap.in{opacity:1}
    .page{max-width:var(--mw,680px);margin:0 auto;padding:96px 28px 140px;transform:translateY(14px);
      transition:transform .5s cubic-bezier(.2,.8,.2,1)}
    .wrap.in .page{transform:none}
    .site{font:500 12.5px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;
      color:#9a958c;letter-spacing:.06em;text-transform:uppercase}
    h1.title{font:650 32px/1.32 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;
      letter-spacing:-.01em;margin:14px 0 12px;color:#1f1f1f}
    .meta{font:13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;color:#9a958c;
      padding-bottom:30px;margin-bottom:34px;border-bottom:1px solid #ebe7df}
    .body{font-size:var(--fs,18.5px);line-height:1.85;font-family:var(--ff);
      word-wrap:break-word;overflow-wrap:anywhere}
    .page{--ff:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Segoe UI",sans-serif;transition:max-width .35s cubic-bezier(.2,.8,.2,1),transform .5s cubic-bezier(.2,.8,.2,1)}
    .page.serif{--ff:"Songti SC","Noto Serif SC","Source Han Serif SC","Noto Serif CJK SC",STSong,"SimSun",Georgia,serif}
    .page.serif h1.title{font-family:var(--ff);font-weight:700}
    /* 正在朗读的段落 */
    .speaking{background:rgba(255,190,0,.17);box-shadow:0 0 0 8px rgba(255,190,0,.17);border-radius:3px}
    .body p,.body li,.body h2,.body h3,.body h4,.body blockquote,h1.title{transition:background .35s,box-shadow .35s}
    .body *{max-width:100%;box-sizing:border-box}
    .body p{margin:0 0 1.15em}
    .body h2{font-size:1.35em;line-height:1.4;margin:1.9em 0 .6em;font-weight:650}
    .body h3{font-size:1.15em;line-height:1.45;margin:1.6em 0 .5em;font-weight:650}
    .body h4,.body h5,.body h6{font-size:1em;margin:1.4em 0 .4em;font-weight:650}
    .body img,.body video{height:auto;border-radius:10px;display:block;margin:1.5em auto}
    .body a{color:#2f6fd0;text-decoration:none;border-bottom:1px solid rgba(47,111,208,.28);transition:border-color .2s}
    .body a:hover{border-bottom-color:currentColor}
    .body ul,.body ol{padding-left:1.4em;margin:0 0 1.15em}
    .body li{margin:.3em 0}
    .body blockquote{margin:1.3em 0;padding:.1em 1.1em;border-left:3px solid #e2ddd2;color:#5b5750}
    .body pre{background:#f2efe8;padding:14px 16px;border-radius:10px;overflow:auto;
      font:13.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .body code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;
      background:#f2efe8;padding:.12em .38em;border-radius:5px}
    .body pre code{background:none;padding:0;font-size:inherit}
    .body table{border-collapse:collapse;width:100%;font-size:.88em;margin:1.2em 0;display:block;overflow-x:auto}
    .body td,.body th{border:1px solid #e7e2d8;padding:6px 10px;text-align:left}
    .body hr{border:0;border-top:1px solid #ebe7df;margin:2.2em 0}

    .bar{position:fixed;left:0;top:0;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(0);
      background:#c8bfae;z-index:2}
    /* 右上角工具条：Aa · 朗读 · 关闭 */
    .tools{position:fixed;top:16px;right:20px;display:flex;gap:2px;padding:4px;border-radius:999px;z-index:3;
      background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%);
      box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 6px 20px -6px rgba(0,0,0,.14)}
    .tool{all:unset;box-sizing:border-box;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;cursor:pointer;
      color:#5f5b54;font:600 13.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.02em;
      transition:background .2s,color .2s,transform .2s cubic-bezier(.2,.8,.2,1)}
    .tool:hover{background:rgba(0,0,0,.06)}
    .tool:active{transform:scale(.88)}
    .tool:focus-visible{box-shadow:0 0 0 2px #0a84ff}
    .tool.on{color:#0a84ff;background:rgba(10,132,255,.10)}
    .tool svg{width:15px;height:15px;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .tool .fill{fill:currentColor;stroke:none}
    .play .pause-i{display:none}
    .play.on .pause-i{display:block}
    .play.on .play-i{display:none}

    /* 排版面板 */
    .panel{position:fixed;top:64px;right:20px;width:268px;padding:10px 14px;border-radius:16px;z-index:3;
      background:rgba(255,255,255,.88);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);
      box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 16px 40px -12px rgba(0,0,0,.22);
      font:13px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;color:#3a3833;
      opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;pointer-events:none;
      transition:opacity .22s,transform .3s cubic-bezier(.2,.8,.2,1)}
    .panel.open{opacity:1;transform:none;pointer-events:auto}
    .prow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}
    .prow + .prow{border-top:.5px solid rgba(0,0,0,.07)}
    .seg{display:flex;background:#efece6;border-radius:9px;padding:2px}
    .seg button{all:unset;box-sizing:border-box;min-width:34px;text-align:center;padding:5px 9px;border-radius:7px;
      font:12.5px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;color:#6b665e;cursor:pointer;
      transition:background .2s,color .2s,box-shadow .2s}
    .seg button:hover{color:#1f1f1f}
    .seg button[aria-checked="true"]{background:#fff;color:#1f1f1f;box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.04)}
    .seg button:focus-visible{box-shadow:0 0 0 2px #0a84ff}
    .seg .val{padding:5px 4px;min-width:30px;text-align:center;color:#1f1f1f;font-variant-numeric:tabular-nums}
    .seg .serif-btn{font-family:"Songti SC","Noto Serif SC",Georgia,serif}

    /* 夜间模式：整页会被反色，这里把图片视频再反回来 */
    :host(.dark) :is(img,video,picture){filter:invert(1) hue-rotate(180deg)}
    :host(.dark) picture img{filter:none}

    @media (max-width:600px){.page{padding:72px 18px 120px}h1.title{font-size:26px}.body{font-size:calc(var(--fs,18.5px) - 1.5px)}.panel{right:12px;left:12px;width:auto}}
    @media (prefers-reduced-motion:reduce){.wrap,.page{transition:none}}
  `;

  const TOAST_CSS = `
    :host{all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none}
    .toast{position:fixed;left:50%;bottom:48px;transform:translate(-50%,10px);opacity:0;
      font:13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei UI",sans-serif;color:#fff;
      background:rgba(30,30,32,.86);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
      padding:11px 16px;border-radius:999px;transition:opacity .3s,transform .4s cubic-bezier(.2,.8,.2,1);pointer-events:none}
    .toast.in{opacity:1;transform:translate(-50%,0)}
  `;

  let host = null, wrap = null, page = null, savedOverflow = null;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setDark(on) { if (host) host.classList.toggle('dark', !!on); }

  function toast(msg) {
    const h = document.createElement('glide-toast');
    const sh = h.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${TOAST_CSS}</style><div class="toast"></div>`;
    sh.querySelector('.toast').textContent = msg;
    document.documentElement.appendChild(h);
    const t = sh.querySelector('.toast');
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => h.remove(), 400); }, 2200);
  }

  function open() {
    const main = findMain();
    if (!main) { toast('这个页面没有找到正文'); return; }
    const title = findTitle(main);
    const body = clean(main, title);
    const minutes = readingTime(body.textContent || '');

    host = document.createElement('glide-reader');
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${CSS}</style>
      <div class="bar"></div>
      <div class="tools">
        <button class="tool aa" title="排版" aria-label="排版设置" aria-expanded="false">Aa</button>
        <button class="tool play" title="朗读全文" aria-label="朗读全文">
          <svg class="play-i" viewBox="0 0 24 24"><path class="fill" d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z"/></svg>
          <svg class="pause-i" viewBox="0 0 24 24"><rect class="fill" x="7" y="5.5" width="3.6" height="13" rx="1"/><rect class="fill" x="13.4" y="5.5" width="3.6" height="13" rx="1"/></svg>
        </button>
        <button class="tool close" title="退出阅读模式 (Esc)" aria-label="退出阅读模式">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="panel" role="dialog" aria-label="排版设置">
        <div class="prow"><span>字号</span>
          <div class="seg"><button data-fs="-1" aria-label="缩小字号">A−</button><span class="val fs-val"></span><button data-fs="1" aria-label="放大字号">A+</button></div></div>
        <div class="prow"><span>行宽</span>
          <div class="seg" role="radiogroup" aria-label="行宽"><button role="radio" data-mw="s">窄</button><button role="radio" data-mw="m">中</button><button role="radio" data-mw="l">宽</button></div></div>
        <div class="prow"><span>字体</span>
          <div class="seg" role="radiogroup" aria-label="字体"><button role="radio" data-ff="sans">黑体</button><button role="radio" data-ff="serif" class="serif-btn">宋体</button></div></div>
        <div class="prow"><span>朗读语速</span>
          <div class="seg" role="radiogroup" aria-label="朗读语速"><button role="radio" data-rate="0.8">慢</button><button role="radio" data-rate="1">1×</button><button role="radio" data-rate="1.25">1.25</button><button role="radio" data-rate="1.5">1.5</button></div></div>
      </div>
      <div class="wrap" tabindex="-1"><main class="page">
        <div class="site"></div><h1 class="title"></h1>
        <div class="meta">约 ${minutes} 分钟读完</div>
        <div class="body"></div>
      </main></div>`;
    sh.querySelector('.site').textContent = location.hostname.replace(/^www\./, '');
    sh.querySelector('.title').textContent = title;
    sh.querySelector('.body').appendChild(body);
    wrap = sh.querySelector('.wrap');
    const bar = sh.querySelector('.bar');
    page = sh.querySelector('.page');
    sh.querySelector('.close').addEventListener('click', close);
    setupPanel(sh);
    setupSpeech(sh);
    wrap.addEventListener('scroll', () => {
      const max = wrap.scrollHeight - wrap.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? wrap.scrollTop / max : 0})`;
      dispatchEvent(new Event('glide-scroll'));   // 让右下角按钮也知道在滚动
    }, { passive: true });

    setDark(document.documentElement.classList.contains('glide-dark'));
    // 放在混合层（夜间配色）之下、按钮之上之前
    const tint = document.querySelector('html > glide-tint');
    document.documentElement.insertBefore(host, tint || null);

    savedOverflow = document.documentElement.style.getPropertyValue('overflow');
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    addEventListener('keydown', onKey, true);

    dispatchEvent(new Event('glide-reader'));
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
    wrap.focus({ preventScroll: true });
  }

  function close() {
    if (!host) return;
    stopSpeech();
    const h = host, w = wrap;
    host = null; wrap = null;
    removeEventListener('keydown', onKey, true);
    if (savedOverflow) document.documentElement.style.setProperty('overflow', savedOverflow);
    else document.documentElement.style.removeProperty('overflow');
    w.classList.remove('in');
    setTimeout(() => h.remove(), reduce() ? 0 : 350);
    dispatchEvent(new Event('glide-reader'));
    dispatchEvent(new Event('glide-scroll'));
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (panelEl && panelEl.classList.contains('open')) { togglePanel(false); return; }   // 先收起面板
    close();
  }

  /* ---------- 排版设置（全局记住） ---------- */
  const PREFS_KEY = 'readerPrefs';
  const WIDTHS = { s: '600px', m: '680px', l: '800px' };
  let prefs = { fs: 18.5, mw: 'm', ff: 'sans', rate: 1 };
  let panelEl = null, aaBtn = null;
  const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;

  function applyPrefs(sh) {
    if (!page) return;
    page.style.setProperty('--fs', prefs.fs + 'px');
    page.style.setProperty('--mw', WIDTHS[prefs.mw] || WIDTHS.m);
    page.classList.toggle('serif', prefs.ff === 'serif');
    sh.querySelector('.fs-val').textContent = String(prefs.fs).replace(/\.5$/, '½');
    sh.querySelectorAll('[data-mw]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mw === prefs.mw)));
    sh.querySelectorAll('[data-ff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ff === prefs.ff)));
    sh.querySelectorAll('[data-rate]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.rate === prefs.rate)));
  }
  function savePrefs() { if (store) store.set({ [PREFS_KEY]: prefs }).catch(() => {}); }
  function togglePanel(force) {
    if (!panelEl) return;
    const on = force === undefined ? !panelEl.classList.contains('open') : force;
    panelEl.classList.toggle('open', on);
    aaBtn.classList.toggle('on', on);
    aaBtn.setAttribute('aria-expanded', String(on));
  }
  function setupPanel(sh) {
    panelEl = sh.querySelector('.panel');
    aaBtn = sh.querySelector('.aa');
    aaBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    panelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.fs) prefs.fs = Math.min(26, Math.max(14, prefs.fs + (+b.dataset.fs)));
      if (b.dataset.mw) prefs.mw = b.dataset.mw;
      if (b.dataset.ff) prefs.ff = b.dataset.ff;
      if (b.dataset.rate) prefs.rate = +b.dataset.rate;
      applyPrefs(sh);
      savePrefs();
    });
    sh.querySelector('.wrap').addEventListener('click', () => togglePanel(false));   // 点正文收起面板
    applyPrefs(sh);
    if (store) store.get(PREFS_KEY).then((r) => {
      if (r[PREFS_KEY]) { prefs = { ...prefs, ...r[PREFS_KEY] }; applyPrefs(sh); }
    }).catch(() => {});
  }

  /* ---------- 朗读：系统语音，逐段读，高亮当前段落 ---------- */
  const synth = window.speechSynthesis;
  const tts = { playing: false, items: [], i: 0, chunks: [], j: 0, current: null, lang: 'zh-CN', btn: null };

  function pickVoice(lang) {
    const all = synth.getVoices();
    const base = lang.slice(0, 2).toLowerCase();
    const match = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
    const exact = match.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
    const pool = exact.length ? exact : match;
    // 打分：系统主力语音优先，趣味语音（Eddy、Grandma…）靠后，本机语音优先（不用联网）
    const GOOD = /婷婷|Tingting|Ting-Ting|Lili|莉莉|语舒|Yu-?shu|Xiaoxiao|晓晓|Huihui|慧慧|Yunxi|云希|Kangkang|康康|Yaoyao|瑶瑶|Samantha|Alex|Daniel|Karen|Aria|Jenny|Guy|Zira|David/i;
    const NOVELTY = /Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Whisper|Zarvox|Trinoids|Jester|Organ|Superstar|Bad News|Good News/i;
    const score = (v) => (GOOD.test(v.name) ? 4 : 0) + (NOVELTY.test(v.name) ? -4 : 0) + (v.localService ? 2 : 0) + (v.default ? 1 : 0);
    return pool.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  function splitText(text) {
    text = text.replace(/\s+/g, ' ').trim();
    const parts = text.match(/[^。！？!?；;…]+[。！？!?；;…]*["”’」』）)]*\s*|.+$/g) || [text];
    const out = [];
    let cur = '';
    for (const p of parts) {
      if ((cur + p).length > 140 && cur) { out.push(cur); cur = ''; }
      cur += p;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  function setSpeaking(el) {
    tts.items.forEach((x) => x.classList.remove('speaking'));
    if (!el || !wrap) return;
    el.classList.add('speaking');
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 70) {
      const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      wrap.scrollTo({ top: wrap.scrollTop + r.top - innerHeight * 0.35, behavior });
    }
  }
  function loadItem() {
    const el = tts.items[tts.i];
    tts.chunks = splitText(el.textContent || '');
    tts.j = 0;
    setSpeaking(el);
  }
  function speakNext() {
    if (!tts.playing) return;
    while (tts.j >= tts.chunks.length) {
      tts.i++;
      if (tts.i >= tts.items.length) { stopSpeech(); return; }
      loadItem();
    }
    const u = new SpeechSynthesisUtterance(tts.chunks[tts.j]);
    u.lang = tts.lang;
    const v = pickVoice(tts.lang);
    if (v) u.voice = v;
    u.rate = prefs.rate;
    u.onend = () => { if (u !== tts.current) return; tts.j++; speakNext(); };
    u.onerror = (e) => {
      if (u !== tts.current || e.error === 'interrupted' || e.error === 'canceled') return;
      tts.j++; speakNext();
    };
    tts.current = u;
    synth.speak(u);
  }
  function setPlayingUI(on) {
    if (!tts.btn) return;
    tts.btn.classList.toggle('on', on);
    tts.btn.title = on ? '暂停朗读' : '朗读全文';
    tts.btn.setAttribute('aria-label', tts.btn.title);
  }
  function startAt(i) {
    tts.current = null;
    synth.cancel();
    tts.i = i;
    tts.playing = true;
    setPlayingUI(true);
    loadItem();
    setTimeout(speakNext, 60);   // Chrome：cancel 后立刻 speak 偶尔会被吞掉
  }
  function pauseSpeech() {
    tts.playing = false;
    tts.current = null;
    synth.cancel();
    setPlayingUI(false);
  }
  function stopSpeech() {
    if (!synth) return;
    pauseSpeech();
    tts.items.forEach((x) => x.classList.remove('speaking'));
    tts.i = 0;
  }
  function setupSpeech(sh) {
    tts.btn = sh.querySelector('.play');
    if (!synth) { tts.btn.remove(); return; }
    const body = sh.querySelector('.body');
    tts.items = [sh.querySelector('.title'), ...body.querySelectorAll('h2,h3,h4,p,li,blockquote')]
      .filter((el) => !el.querySelector('p,li,blockquote') && (el.textContent || '').trim().length > 1);
    const sample = tts.items.slice(0, 8).map((el) => el.textContent).join('');
    const cjk = (sample.match(/[一-鿿]/g) || []).length;
    tts.lang = cjk > sample.length * 0.15 ? 'zh-CN' : (document.documentElement.lang || 'en-US');
    tts.i = 0;
    synth.getVoices();   // 触发语音列表加载

    tts.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tts.playing) { pauseSpeech(); return; }
      if (!tts.items.length) return;
      // 第一次播放：从屏幕上第一段可见的内容开始；暂停后继续：从当前段落重新开始
      let start = tts.i;
      if (!tts.items.some((x) => x.classList.contains('speaking'))) {
        const k = tts.items.findIndex((el) => el.getBoundingClientRect().bottom > 80);
        start = k < 0 ? 0 : k;
      }
      startAt(start);
    });
    // 朗读时点某一段，就从那一段开始读
    body.addEventListener('click', (e) => {
      if (!tts.playing || e.target.closest('a')) return;
      const k = tts.items.findIndex((el) => el.contains(e.target));
      if (k >= 0) startAt(k);
    });
  }
  addEventListener('pagehide', () => { if (synth && tts.playing) synth.cancel(); });

  window.__glideReader = {
    toggle: () => (host ? close() : open()),
    isOpen: () => !!host,
    scroller: () => wrap,
    setDark,
  };
})();
