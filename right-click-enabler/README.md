# 右クリック有効化 (Right Click Enabler)

右クリックを無効化しているサイトで右クリックメニューを強制的に有効にするChrome拡張機能。

## インストール

1. このリポジトリをクローン or フォルダをダウンロード
2. Chromeで `chrome://extensions` を開く
3. 右上の **デベロッパーモード** をONにする
4. **「パッケージ化されていない拡張機能を読み込む」** をクリック
5. `right-click-enabler` フォルダを選択

## 使い方

インストール後、すべてのサイトでデフォルト有効。ツールバーのアイコンをクリックするとON/OFFを切り替えられる。

## 仕組み

右クリックの無効化に使われる手口を3つとも対策している。

| 無効化の手口 | 対策 |
|---|---|
| `document.oncontextmenu = false` | `Object.defineProperty` で上書きを防ぐ |
| `addEventListener('contextmenu', e => e.preventDefault())` | captureフェーズで `stopImmediatePropagation` を先に呼ぶ |
| `addEventListener('mousedown', ...)` で右クリックブロック | mousedown もcaptureフェーズで傍受 |

`page-inject.js` はページのJSコンテキスト (`world: MAIN`) で実行し、`addEventListener` 自体をラップしてページ側が後から登録するリスナーも無効化する。
