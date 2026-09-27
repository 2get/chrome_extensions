import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

assert.ok(process.env.CHROME_BIN, 'CHROME_BINにChromiumまたはChrome for Testingの実行ファイルを指定してください');
const extension = fileURLToPath(new URL('..', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'selection-search-check-'));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>body { font: 20px/1.8 sans-serif; margin: 40px; min-height: 1800px; }
    button { background: red !important; font-size: 90px !important; }
    #edge { position: fixed; bottom: 4px; right: 4px; }</style>
    <h1>検索バーの動作確認</h1><p id="text">ワイヤレス イヤホン & 日本語 🎧</p>
    <p id="other">別の検索テキスト</p><textarea id="input">入力欄のテキスト</textarea>
    <div contenteditable="true" id="editor">編集中のテキスト</div><span id="edge">画面の端</span>
    ${request.url === '/preselected' ? `<script>
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#text'));
      getSelection().addRange(range);
    </script>` : ''}`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(process.env.CHROME_BIN, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Browser launch timed out')), 15000);
    browser.stderr.on('data', data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    browser.on('error', error => { clearTimeout(timeout); reject(error); });
    browser.on('exit', code => { clearTimeout(timeout); reject(new Error(`Browser exited: ${code}`)); });
  });
  ws = new WebSocket(endpoint);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (!response.id) return;
    const request = pending.get(response.id);
    pending.delete(response.id);
    clearTimeout(request.timeout);
    if (response.error) request.reject(new Error(JSON.stringify(response.error)));
    else request.resolve(response.result);
  });
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => reject(new Error(`CDP timed out: ${method}`)), 10000);
      pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  let sessionId;
  async function evaluate(expression, session = sessionId) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression, session = sessionId) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression, session)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${expression}`);
  }
  async function open(url) {
    const { targetId } = await call('Target.createTarget', { url });
    const result = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Runtime.enable', {}, result.sessionId);
    return result.sessionId;
  }
  let worker;
  for (let attempt = 0; attempt < 50; attempt++) {
    const { targetInfos } = await call('Target.getTargets');
    worker = targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js'));
    if (worker) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(worker, 'Extension service worker started');
  sessionId = await open(worker.url.replace('background.js', 'options.html'));
  const optionsSession = sessionId;
  await waitFor("document.querySelectorAll('#sites input:checked').length === 8 && !document.querySelector('fieldset').disabled");
  assert.equal(await evaluate('chrome.runtime.getManifest().version'), '1.9.1');
  await waitFor("!document.querySelector('#ai-settings').disabled");
  assert.equal(await evaluate("document.querySelector('#ai-enabled').checked"), false);
  assert.equal(await evaluate("document.querySelector('#toolbar-enabled').checked"), true);
  await evaluate("document.querySelector('#toolbar-enabled').click()");
  await waitFor("!document.querySelector('fieldset').disabled");
  await call('Page.reload', {}, sessionId);
  await waitFor("document.querySelector('#toolbar-enabled')?.checked === false && !document.querySelector('fieldset').disabled");
  assert.equal(await evaluate("chrome.storage.local.get('toolbarEnabled').then(value => value.toolbarEnabled)"), false);
  await evaluate("document.querySelector('#toolbar-enabled').click()");
  await waitFor("!document.querySelector('fieldset').disabled");
  await call('Emulation.setDeviceMetricsOverride', { width: 800, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);
  if (process.env.SCREENSHOT_DIR) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-options.png'), Buffer.from(shot.data, 'base64'));
    const aiRect = await evaluate(`(() => { const r = document.querySelector('.ai-settings').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`);
    const aiShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: aiRect }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-ai-settings.png'), Buffer.from(aiShot.data, 'base64'));
  }

  sessionId = await open(`${fixtureUrl}/preselected`);
  await waitFor("document.querySelector('[data-selection-search-toolbar]')?.shadowRoot?.querySelectorAll('button[data-site-id]').length === 8");
  // 次のテストではページ読み込み後にドラッグ選択する。
  await call('Page.navigate', { url: fixtureUrl }, sessionId);
  await call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("document.readyState === 'complete'");
  const host = "document.querySelector('[data-selection-search-toolbar]')";
  const bar = `${host}?.shadowRoot`;
  const count = `${bar}?.querySelectorAll('button[data-site-id]').length`;
  async function select(id = 'text') {
    await evaluate(`(() => {
      document.activeElement?.blur();
      const range = document.createRange(); range.selectNodeContents(document.getElementById('${id}'));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    })()`);
  }
  // 初期設定の取得完了後に、実際の選択イベントで検索バーを表示する。
  await new Promise(resolve => setTimeout(resolve, 250));
  // ページ側がpointerupを止めても、実際のドラッグ終了を検知する。
  await evaluate("document.querySelector('#text').addEventListener('pointerup', event => event.stopPropagation())");
  const dragRect = await evaluate(`(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('#text'));
    const rect = range.getBoundingClientRect(); return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: dragRect.left + 1, y: dragRect.y }, sessionId);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: dragRect.right - 1, y: dragRect.y }, sessionId);
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: dragRect.right - 1, y: dragRect.y }, sessionId);
  await waitFor(`${count} === 8`);
  await select();
  await waitFor(`${count} === 8`);
  assert.equal(await evaluate(`getComputedStyle(${bar}.querySelector('button')).fontSize`), '13px');
  assert.equal(await evaluate(`${host}.getBoundingClientRect().width <= 320`), true, '8サイトでもコンパクトな幅');
  assert.equal(await evaluate(`${bar}.querySelectorAll('button > svg').length`), 8);
  if (process.env.SCREENSHOT_DIR) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-toolbar.png'), Buffer.from(shot.data, 'base64'));
  }
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, sessionId);
  await waitFor(`!${host}`);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }, sessionId);
  await select();
  await waitFor(`${count} === 8`);
  await evaluate(`${bar}.querySelector('.close').click()`);
  await waitFor(`!${host}`);
  await select('editor');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(await evaluate(`!${host}`), true, '編集中の文章では表示しない');
  await evaluate("document.querySelector('#input').focus(); document.querySelector('#input').select()");
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(await evaluate(`!${host}`), true, '入力欄では表示しない');
  await select();
  await waitFor(`${count} === 8`);
  await evaluate('window.scrollTo(0, 200)');
  await waitFor(`!${host}`);
  await evaluate('window.scrollTo(0, 0)');
  await new Promise(resolve => setTimeout(resolve, 100));
  await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 150));
  await select('edge');
  await waitFor(`${count} === 8`);
  assert.equal(await evaluate(`(() => { const rect = ${host}.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; })()`), true, '端や狭い画面でも画面内に収まる');
  await evaluate("chrome.storage.local.set({ toolbarEnabled: false })", optionsSession);
  await waitFor(`!${host}`);
  await select();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(await evaluate(`!${host}`), true, 'オフは開いているページにも即時反映');
  await evaluate("chrome.storage.local.set({ toolbarEnabled: true, enabledSites: ['searchAmazon', 'searchYouTube'] })", optionsSession);
  await new Promise(resolve => setTimeout(resolve, 150));
  await select();
  await waitFor(`${count} === 2`);
  assert.deepEqual(await evaluate(`[...${bar}.querySelectorAll('button[data-site-id]')].map(button => button.getAttribute('aria-label'))`), ['Amazon.co.jpで検索', 'YouTubeで検索']);
  // 実際のマウスクリックで、選択が消える前の文字を新規タブへ渡す。
  const point = await evaluate(`(() => { const rect = ${bar}.querySelector('button').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, sessionId);
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, sessionId);
  let searchTarget;
  for (let attempt = 0; attempt < 50; attempt++) {
    searchTarget = (await call('Target.getTargets')).targetInfos.find(target => target.url.startsWith('https://www.amazon.co.jp/s?'));
    if (searchTarget) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(searchTarget, 'クリックで検索結果タブが開く');
  assert.equal(new URL(searchTarget.url).searchParams.get('k'), 'ワイヤレス イヤホン & 日本語 🎧');
  await call('Target.closeTarget', { targetId: searchTarget.targetId });
  await evaluate('chrome.storage.local.set({ enabledSites: [] })', optionsSession);
  await new Promise(resolve => setTimeout(resolve, 150));
  await select();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(await evaluate(`!${host}`), true, '全サイトオフでは検索バーを表示しない');

  // Jevの通信はテスト用ワーカー内で置き換える。実キー・実API・権限付与は使用しない。
  await evaluate('getSelection().removeAllRanges()');
  const { sessionId: workerSession } = await call('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  await evaluate(`
    globalThis.jevTestRequests = [];
    chrome.permissions.contains = async () => true;
    globalThis.fetch = async (url, options) => {
      if (!url.startsWith('https://api.typesafe.ai/')) throw new Error('Unexpected test request');
      const body = options.body ? JSON.parse(options.body) : null;
      globalThis.jevTestRequests.push({ url, body });
      if (url.endsWith('/models')) return Response.json({ models: [{ name: 'jev-test' }] });
      await new Promise(resolve => setTimeout(resolve, 650));
      const preferred = body.state.selected_text.includes('イヤホン') ? ['searchAmazon', 'searchYouTube', 'purpose_compare', 'purpose_review'] : ['searchMaps', 'searchGoogle'];
      return Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: 'score', score: (preferred.includes(id) || id === 'query_0' || id === 'query_1' || id === 'sony' || id === 'kakaku') ? 3 : 1, confidence: 0.95 }])) });
    };
  `, workerSession);
  await evaluate(`
    chrome.permissions.request = async () => true;
    document.querySelector('#ai-key').value = 'fake-browser-test-key';
    document.querySelector('#ai-connect').click();
  `, optionsSession);
  await waitFor("document.querySelector('#ai-enabled').checked && !document.querySelector('#ai-settings').disabled", optionsSession);
  assert.equal(await evaluate("document.querySelector('#ai-key').value", optionsSession), '');
  await evaluate("chrome.storage.local.remove('enabledSites')", optionsSession);
  await new Promise(resolve => setTimeout(resolve, 150));
  await select();
  await waitFor(`${count} === 8`);
  const positions = await evaluate(`[...${bar}.querySelectorAll('[data-site-id]')].map(button => ({ x: button.getBoundingClientRect().x, y: button.getBoundingClientRect().y }))`);
  assert.equal(await evaluate(`${bar}.querySelectorAll('.recommended').length`), 0, 'AIを待たずに通常のアイコンを表示');
  await waitFor(`${bar}?.querySelectorAll('.recommended').length === 2`);
  assert.deepEqual(await evaluate(`[...${bar}.querySelectorAll('.recommended')].map(button => button.dataset.siteId)`), ['searchAmazon', 'searchYouTube']);
  assert.deepEqual(await evaluate(`[...${bar}.querySelectorAll('[data-site-id]')].map(button => ({ x: button.getBoundingClientRect().x, y: button.getBoundingClientRect().y }))`), positions, 'おすすめ表示でアイコンを動かさない');
  assert.equal(await evaluate('globalThis.jevTestRequests.at(-1).body.state.nearby_text', workerSession), '');
  assert.deepEqual(await evaluate(`[...${bar}.querySelectorAll('[data-purpose-id]')].map(button => button.textContent)`), ['価格を比べる', 'レビューを見る']);
  assert.equal(await evaluate(`(() => { const r = ${host}.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true);

  if (process.env.SCREENSHOT_DIR) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-ai.png'), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`${bar}.querySelector('[data-purpose-id="review"]').click()`);
  await waitFor(`!${host}`);
  let purposeTarget;
  for (let attempt = 0; attempt < 50; attempt++) {
    purposeTarget = (await call('Target.getTargets')).targetInfos.find(target => target.url.startsWith('https://www.google.com/search?'));
    if (purposeTarget) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(purposeTarget, '目的クリックで検索結果が開く');
  assert.equal(new URL(purposeTarget.url).searchParams.get('q'), 'ワイヤレス イヤホン & 日本語 🎧 レビュー');
  await call('Target.closeTarget', { targetId: purposeTarget.targetId });
  await select('edge');
  await waitFor(`${bar}?.querySelector('.purpose-status')?.textContent === '目的の提案はありません'`);
  assert.equal(await evaluate(`(() => { const r = ${host}.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true, '目的欄付きでも画面端に収まる');
  await evaluate("document.querySelector('#ai-enabled').click()", optionsSession);
  await waitFor("!document.querySelector('#ai-settings').disabled", optionsSession);
  await waitFor(`${bar}?.querySelectorAll('.recommended').length === 0`);
  const afterDisable = await evaluate('globalThis.jevTestRequests.length', workerSession);
  await select('other');
  await waitFor(`${count} === 8`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate('globalThis.jevTestRequests.length', workerSession), afterDisable, 'AIオフ時は新たに通信しない');
  await evaluate('getSelection().removeAllRanges()');
  await evaluate("document.querySelector('#ai-enabled').click()", optionsSession);
  await waitFor("!document.querySelector('#ai-settings').disabled", optionsSession);
  await evaluate("document.querySelector('#ai-context').click()", optionsSession);
  await waitFor("!document.querySelector('#ai-settings').disabled", optionsSession);
  await new Promise(resolve => setTimeout(resolve, 150));
  await evaluate(`(() => {
    const text = document.querySelector('#text').firstChild;
    const offset = text.textContent.indexOf('イヤホン');
    const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 4);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  })()`);
  await waitFor(`${bar}?.querySelectorAll('.recommended').length === 2`);
  const stateSent = await evaluate('globalThis.jevTestRequests.at(-1).body.state', workerSession);
  assert.equal(stateSent.selected_text, 'イヤホン');
  assert.ok(stateSent.nearby_text.includes('ワイヤレス'));
  assert.deepEqual(Object.keys(stateSent), ['selected_text', 'nearby_text']);
  await evaluate("chrome.storage.local.set({ enabledSites: ['searchYouTube'] })", optionsSession);
  await waitFor(`${count} === 1 && ${bar}?.querySelector('.purpose-status')?.textContent === '目的の提案はありません'`);
  assert.equal(await evaluate(`${host}.getBoundingClientRect().width >= 240`), true, '検索先が少なくても目的の表示幅を確保');
  assert.equal(await evaluate(`${bar}.querySelectorAll('[data-purpose-id]').length`), 0, 'Googleを無効にするとGoogleの目的を提案しない');
  await evaluate("chrome.storage.local.remove('enabledSites')", optionsSession);
  await waitFor(`${bar}?.querySelectorAll('[data-purpose-id]').length === 2`);

  const longSelection = '昨日購入した「Sony WH-1000XM6」で音が途切れるので、設定方法やレビューを調べてから交換するか考えたいです。';
  await evaluate(`document.querySelector('#text').textContent = ${JSON.stringify(longSelection)}`);
  await select();
  await waitFor(`${bar}?.querySelectorAll('.query-choice').length >= 2`);
  assert.equal(await evaluate(`${bar}.querySelector('.query-choice[aria-pressed="true"]').textContent`), '原文のまま');
  const targetsBeforeQuery = (await call('Target.getTargets')).targetInfos.length;
  await evaluate(`${bar}.querySelectorAll('.query-choice')[1].click()`);
  await waitFor(`${bar}?.querySelector('.query-choice[aria-pressed="true"]')?.textContent === 'Sony WH-1000XM6'`);
  assert.equal((await call('Target.getTargets')).targetInfos.length, targetsBeforeQuery, '候補を選んでも検索タブは開かない');
  await evaluate(`${bar}.querySelector('.query-choice').click()`);
  assert.equal(await evaluate(`${bar}.querySelector('.query-choice[aria-pressed="true"]').textContent`), '原文のまま');
  await evaluate(`${bar}.querySelectorAll('.query-choice')[1].click()`);
  if (process.env.SCREENSHOT_DIR) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-queries.png'), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`${bar}.querySelector('[data-site-id="searchAmazon"]').click()`);
  let queryTarget;
  for (let attempt = 0; attempt < 50; attempt++) {
    queryTarget = (await call('Target.getTargets')).targetInfos.find(target => target.url.startsWith('https://www.amazon.co.jp/s?'));
    if (queryTarget) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(queryTarget);
  assert.equal(new URL(queryTarget.url).searchParams.get('k'), 'Sony WH-1000XM6');
  await call('Target.closeTarget', { targetId: queryTarget.targetId });
  await new Promise(resolve => setTimeout(resolve, 550));

  await select();
  await waitFor(`${bar}?.querySelector('.discover-specialists')`);
  await evaluate(`${bar}.querySelector('.discover-specialists').click()`);
  await waitFor(`${bar}?.querySelectorAll('[data-specialist-id]').length === 2`);
  assert.deepEqual(await evaluate(`[...${bar}.querySelectorAll('[data-specialist-id]')].map(b => b.dataset.specialistId)`), ['sony', 'kakaku']);
  assert.equal(await evaluate(`(() => { const r = ${host}.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth; })()`), true, '専門サイトの展開後も画面内');
  if (process.env.SCREENSHOT_DIR) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(process.env.SCREENSHOT_DIR, 'selection-search-specialists.png'), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`${bar}.querySelector('[data-specialist-id="sony"]').click()`);
  let specialistTarget;
  for (let attempt = 0; attempt < 50; attempt++) {
    specialistTarget = (await call('Target.getTargets')).targetInfos.find(target => target.url.startsWith('https://www.google.com/search?'));
    if (specialistTarget) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(specialistTarget);
  assert.equal(new URL(specialistTarget.url).searchParams.get('q'), `site:sony.jp ${longSelection}`);
  await call('Target.closeTarget', { targetId: specialistTarget.targetId });
  await new Promise(resolve => setTimeout(resolve, 550));

  const veryLong = 'この文章には日常の出来事について書かれています。'.repeat(100) + '購入した「Sony WH-1000XM6」の設定を調べたい。';
  await evaluate(`document.querySelector('#text').textContent = ${JSON.stringify(veryLong)}`);
  const requestsBeforeLong = await evaluate('globalThis.jevTestRequests.length', workerSession);
  await evaluate(`window.scrollTo(0, 0)`);
  await select();
  await waitFor(`${bar}?.querySelectorAll('.query-choice').length >= 2`);
  assert.ok((await evaluate(`[...${bar}.querySelectorAll('.query-choice')].map(b => b.textContent)`)).includes('Sony WH-1000XM6'));
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(await evaluate('globalThis.jevTestRequests.length', workerSession), requestsBeforeLong, '2,000文字超の候補抽出はAPIを呼ばない');
  await evaluate(`document.querySelector('#text').textContent = ${JSON.stringify(longSelection)}`);
  const beforeSlow = await evaluate('globalThis.jevTestRequests.length', workerSession);
  await select('other');
  await waitFor(`globalThis.jevTestRequests.length > ${beforeSlow}`, workerSession);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, sessionId);
  await waitFor(`!${host}`);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(await evaluate(`!${host}`), true, '閉じた検索バーを遅いAI結果で再表示しない');
  await evaluate("document.querySelector('#ai-delete').click()", optionsSession);
  await waitFor("!document.querySelector('#ai-settings').disabled && !document.querySelector('#ai-enabled').checked", optionsSession);
  assert.equal(await evaluate("chrome.storage.local.get('jevApiKey').then(value => value.jevApiKey === undefined)", optionsSession), true);
  console.log('PASS: purpose suggestions, search query, disabled destinations, narrow layout, cache; AI opt-in, setup, highlight without movement, no wait for AI, context limits, off/delete, stale response (mock API)');
  console.log('PASS: toolbar rendering, real search click, settings persistence/live updates, enabled sites, dismissal, editable exclusion, style isolation, viewport edges');
} finally {
  if (ws) ws.close();
  browser.kill();
  if (browser.pid && browser.exitCode === null) await new Promise(resolve => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
