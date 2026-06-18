// world: ISOLATED で実行 — ページのDOMイベントをキャプチャフェーズで傍受する
(function () {
  'use strict';

  const STORAGE_KEY = 'rightClickEnabled';
  let enabled = true;

  // captureフェーズで contextmenu を傍受し、ページ側の preventDefault/stopPropagation を無効化
  function handleContextMenu(e) {
    if (!enabled) return;
    e.stopImmediatePropagation();
    // stopImmediatePropagation 後に再ディスパッチして本物のコンテキストメニューを表示
    // （これにより preventDefault 済みのイベントをリセットする）
    if (e.defaultPrevented) {
      const newEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
        buttons: e.buttons,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
      e.target.dispatchEvent(newEvent);
    }
  }

  // mousedown で右クリックをブロックしているサイトへの対策
  function handleMouseDown(e) {
    if (!enabled) return;
    if (e.button === 2) {
      e.stopImmediatePropagation();
    }
  }

  function attach() {
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('mousedown', handleMouseDown, true);
  }

  function detach() {
    document.removeEventListener('contextmenu', handleContextMenu, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
  }

  function applyState(isEnabled) {
    enabled = isEnabled;
    if (isEnabled) {
      attach();
      window.dispatchEvent(new Event('__rcEnable__'));
    } else {
      detach();
      window.dispatchEvent(new Event('__rcDisable__'));
    }
  }

  // 初期状態を storage から読み込む
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const isEnabled = result[STORAGE_KEY] !== false; // デフォルト: 有効
    applyState(isEnabled);
  });

  // popup からのメッセージを受け取る
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_ENABLED') {
      applyState(message.enabled);
    }
  });
})();
