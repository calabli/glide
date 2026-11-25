importScripts('domain.js');

// 快捷键 → 转给当前网页（点工具栏图标打开设置面板）
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { cmd }).catch(() => {});
});

/* 从这一版起按网站的设置以主域名为单位。把旧版按主机名存的 site:* / tune:* 合并过去，只做一次。
   同一主域名下有多份时，优先用主域名本身的，其次 www.，再其次按名字排第一的 */
const MIGRATED = 'domainKeys';
async function migrateToDomains() {
  const all = await chrome.storage.local.get(null);
  if (all[MIGRATED]) return;
  const groups = new Map();
  for (const key of Object.keys(all)) {
    const m = key.match(/^(site|tune):(.*)$/);
    if (!m) continue;
    const id = m[1] + ':' + glideDomain(m[2]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(m[2]);
  }
  const set = { [MIGRATED]: true }, remove = [];
  for (const [id, hosts] of groups) {
    const [prefix, domain] = [id.slice(0, 4), id.slice(5)];
    if (hosts.length === 1 && hosts[0] === domain) continue;
    const pick = hosts.includes(domain) ? domain : hosts.includes('www.' + domain) ? 'www.' + domain : hosts.sort()[0];
    set[id] = all[prefix + ':' + pick];
    for (const h of hosts) if (h !== domain) remove.push(prefix + ':' + h);
  }
  await chrome.storage.local.set(set);
  if (remove.length) await chrome.storage.local.remove(remove);
}
chrome.runtime.onInstalled.addListener(() => { migrateToDomains().catch(() => {}); });
