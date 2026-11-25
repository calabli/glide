/* 主域名：按网站保存的设置以主域名为单位，github.com、www.github.com、docs.github.com 共用一份。
   不带完整的公共后缀列表，用一个小规则覆盖常见情况：
   - IP 地址、localhost、没有点的主机名：原样返回
   - 国家顶级域下的二级后缀（co.uk、com.cn、ac.jp…）：取最后三段
   - 各人各站的托管平台（xxx.github.io、xxx.vercel.app…）：取最后三段，不同用户的站点互不影响
   - 其他：取最后两段
   内容脚本和 background.js（importScripts）共用 */
(() => {
  const SECOND_LEVEL = new Set(['com', 'net', 'org', 'gov', 'edu', 'ac', 'co', 'or', 'ne', 'go', 'gob', 'mil',
    'nom', 'ltd', 'plc', 'sch', 'gen', 'biz', 'info', 'res', 'lg', 'ed', 'gr', 'ad']);
  const HOSTED = new Set(['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev',
    'web.app', 'firebaseapp.com', 'herokuapp.com', 'appspot.com', 'blogspot.com', 'azurewebsites.net',
    'cloudfront.net', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co', 'surge.sh', 'neocities.org',
    'wordpress.com', 'tumblr.com', 'substack.com', 'notion.site']);

  function glideDomain(host) {
    host = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!host || host.includes(':') || /^\d+(\.\d+){3}$/.test(host) || !host.includes('.')) return host;
    const parts = host.split('.');
    const last2 = parts.slice(-2).join('.');
    const n = HOSTED.has(last2) ||
      (parts[parts.length - 1].length === 2 && SECOND_LEVEL.has(parts[parts.length - 2])) ? 3 : 2;
    return parts.slice(-n).join('.');
  }

  globalThis.glideDomain = glideDomain;
})();
