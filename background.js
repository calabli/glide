// 快捷键 → 转给当前网页（点工具栏图标现在打开设置面板）
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { cmd }).catch(() => {});
});
