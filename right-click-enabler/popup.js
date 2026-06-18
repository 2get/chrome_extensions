(function () {
  'use strict';

  const toggle = document.getElementById('toggleEnabled');
  const badge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');

  function updateUI(enabled) {
    toggle.checked = enabled;
    if (enabled) {
      badge.className = 'status-badge on';
      statusText.textContent = '有効 — 右クリックが使えます';
    } else {
      badge.className = 'status-badge off';
      statusText.textContent = '無効';
    }
  }

  // 現在の状態を background から取得
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    updateUI(response?.enabled !== false);
  });

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    updateUI(enabled);
    chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled });
  });
})();
