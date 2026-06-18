// service worker — 状態の永続化とタブへの通知を担当
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    chrome.storage.local.get(['rightClickEnabled'], (result) => {
      sendResponse({ enabled: result.rightClickEnabled !== false });
    });
    return true; // 非同期レスポンスを使う
  }

  if (message.type === 'SET_ENABLED') {
    chrome.storage.local.set({ rightClickEnabled: message.enabled }, () => {
      // アクティブタブに状態変更を通知
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
        }
      });
      sendResponse({ ok: true });
    });
    return true;
  }
});
