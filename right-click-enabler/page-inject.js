// world: MAIN で実行 — ページのJSコンテキストに直接アクセスできる
(function () {
  'use strict';

  const ENABLED_KEY = '__rightClickEnabled__';

  function enableRightClick() {
    // document.oncontextmenu を無効化し、以降の上書きも防ぐ
    Object.defineProperty(document, 'oncontextmenu', {
      get() { return null; },
      set() {},
      configurable: true,
    });

    // body.oncontextmenu も同様に対処
    if (document.body) {
      document.body.oncontextmenu = null;
    }

    // 将来 body が生成されたときにも対処
    const bodyObserver = new MutationObserver(() => {
      if (document.body && document.body.oncontextmenu) {
        document.body.oncontextmenu = null;
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true, subtree: false });

    // addEventListener をラップして contextmenu リスナーの登録をブロック
    const _origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (window[ENABLED_KEY] && type === 'contextmenu') return;
      return _origAdd.call(this, type, listener, options);
    };

    // removeEventListener は通常通り動作させる（必要なら元に戻せるよう）
    window[ENABLED_KEY] = true;
  }

  function disableRightClick() {
    window[ENABLED_KEY] = false;
  }

  // content.js からのメッセージを受け取る
  window.addEventListener('__rcEnable__', enableRightClick);
  window.addEventListener('__rcDisable__', disableRightClick);

  // デフォルトで有効化
  enableRightClick();
})();
