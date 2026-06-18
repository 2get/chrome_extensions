chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'searchX',
    title: 'Xで「%s」を検索',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'searchX') {
    const query = encodeURIComponent(info.selectionText.trim());
    chrome.tabs.create({ url: `https://x.com/search?q=${query}` });
  }
});
