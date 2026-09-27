import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_SITES, getEnabledSiteIds, buildSearchUrl } from '../search-sites.js';

test('未設定は全サイト、空配列は全非表示、未知のIDは無視する', () => {
  assert.equal(getEnabledSiteIds(undefined).length, 8);
  assert.equal(getEnabledSiteIds(null).length, 8);
  assert.deepEqual(getEnabledSiteIds([]), []);
  assert.deepEqual(getEnabledSiteIds(['searchYouTube', 'unknown', 'searchX', 'searchX']), ['searchX', 'searchYouTube']);
});

test('全サイトで日本語・空白・URLの特殊文字を検索語として保持する', () => {
  const query = 'イヤホン & 本 + # / ? = % 🎧';
  const destinations = [
    ['www.google.com', 'q'],
    ['x.com', 'q'], ['www.amazon.co.jp', 'k'], ['search.rakuten.co.jp', null],
    ['shopping.yahoo.co.jp', 'p'], ['jp.mercari.com', 'keyword'], ['www.youtube.com', 'search_query'], ['www.google.com', 'query'],
  ];
  SEARCH_SITES.forEach((site, index) => {
    const url = new URL(buildSearchUrl(site, `  ${query}\n`));
    const [host, parameter] = destinations[index];
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, host);
    assert.equal(url.hash, '');
    if (parameter) assert.equal(url.searchParams.get(parameter), query);
    else assert.equal(decodeURIComponent(url.pathname.slice('/search/mall/'.length, -1)), query);
    if (site.id === 'searchMaps') assert.equal(url.searchParams.get('api'), '1');
  });
});

test('インストール・設定変更・再起動・検索を一連の操作で検証する', async () => {
  const listeners = {};
  const menus = new Map();
  const tabs = [];
  let enabledSites;
  let toolbarEnabled;
  let jevEnabled;
  let optionsOpened = 0;
  const event = key => ({ addListener(fn) { listeners[key] = fn; } });
  globalThis.chrome = {
    runtime: {
      id: 'test-extension', onMessage: event('message'),
      onInstalled: event('installed'), onStartup: event('startup'),
      async openOptionsPage() { optionsOpened++; },
    },
    storage: { local: { async get() { return { enabledSites, toolbarEnabled, jevEnabled }; } }, onChanged: event('changed') },
    contextMenus: {
      async removeAll() { menus.clear(); },
      create(properties, callback) {
        assert.ok(!menus.has(properties.id), 'メニューIDが重複しない');
        menus.set(properties.id, properties);
        queueMicrotask(callback);
      },
      onClicked: event('clicked'),
    },
    action: { onClicked: event('action') },
    tabs: { async create(tab) { tabs.push(tab); } },
  };
  try {
    await import('../background.js');
    await listeners.installed();
    assert.equal(menus.size, 10);
    assert.ok([...menus.values()].every(menu => menu.contexts[0] === 'selection'));
    await listeners.installed();
    assert.equal(menus.size, 10);
    for (const site of SEARCH_SITES) {
      await listeners.clicked({ menuItemId: site.id, selectionText: ' 日本語 & test ' });
      assert.equal(tabs.at(-1).url, buildSearchUrl(site, '日本語 & test'));
    }
    enabledSites = ['searchAmazon', 'searchMaps'];
    await Promise.all([
      listeners.changed({ enabledSites: {} }, 'local'),
      listeners.changed({ enabledSites: {} }, 'local'),
    ]);
    assert.deepEqual([...menus.keys()], ['searchAmazon', 'searchMaps', 'searchSeparator', 'searchSettings']);
    await listeners.startup();
    assert.equal(menus.size, 4);
    await listeners.clicked({ menuItemId: 'searchX', selectionText: 'disabled' });
    await listeners.clicked({ menuItemId: 'searchAmazon', selectionText: '   ' });
    await listeners.clicked({ menuItemId: 'searchAmazon' });
    await listeners.clicked({ menuItemId: 'unknown', selectionText: 'ignored' });
    assert.equal(tabs.length, 8);
    enabledSites = [];
    await listeners.changed({ enabledSites: {} }, 'local');
    assert.deepEqual([...menus.keys()], ['searchSettings']);
    await listeners.clicked({ menuItemId: 'searchSettings' });
    await listeners.action();
    assert.equal(optionsOpened, 2);
    enabledSites = undefined;
    await listeners.changed({ unrelated: {} }, 'local');
    await listeners.changed({ enabledSites: {} }, 'sync');
    assert.equal(menus.size, 1);
    await listeners.changed({ enabledSites: {} }, 'local');
    assert.equal(menus.size, 10);

    const sendMessage = message => new Promise(resolve => {
      assert.equal(listeners.message(message, { id: 'test-extension' }, resolve), true);
    });
    const defaults = await sendMessage({ type: 'getToolbarSettings' });
    assert.equal(defaults.enabled, true);
    assert.equal(defaults.sites.length, 8);
    enabledSites = ['searchAmazon'];
    const configured = await sendMessage({ type: 'getToolbarSettings' });
    assert.deepEqual(configured.sites, [{ id: 'searchAmazon', name: 'Amazon.co.jp' }]);
    const searchMessage = { type: 'searchFromToolbar', siteId: 'searchAmazon', selectionText: ' 日本語 & 本 ' };
    assert.deepEqual(await sendMessage(searchMessage), { ok: true });
    assert.equal(new URL(tabs.at(-1).url).searchParams.get('k'), '日本語 & 本');
    const searchCount = tabs.length;
    for (const invalid of [
      { ...searchMessage, siteId: 'searchX' },
      { ...searchMessage, siteId: 'https://example.com' },
      { ...searchMessage, selectionText: '  ' },
      { ...searchMessage, selectionText: null },
      { ...searchMessage, selectionText: { query: 'invalid' } },
    ]) assert.deepEqual(await sendMessage(invalid), { ok: false });
    toolbarEnabled = false;
    assert.equal((await sendMessage({ type: 'getToolbarSettings' })).enabled, false);
    assert.deepEqual(await sendMessage(searchMessage), { ok: false });
    assert.equal(tabs.length, searchCount);
    await listeners.clicked({ menuItemId: 'searchAmazon', selectionText: '右クリックは有効' });
    assert.equal(tabs.length, searchCount + 1);
    const purposeSender = { id: 'test-extension', tab: { id: 1 }, url: 'https://example.com' };
    const sendPurpose = (message, sender = purposeSender) => new Promise(resolve => listeners.message(message, sender, resolve));
    const purposeMessage = { type: 'searchPurpose', purposeId: 'review', selectionText: ' 製品 & 本 ' };
    jevEnabled = true;
    toolbarEnabled = true;
    enabledSites = ['searchGoogle'];
    assert.deepEqual(await sendPurpose(purposeMessage), { ok: true });
    assert.equal(new URL(tabs.at(-1).url).searchParams.get('q'), '製品 & 本 レビュー');
    const specialistMessage = { type: 'searchSpecialist', siteId: 'mdn', selectionText: '日本語 & Web API' };
    assert.deepEqual(await sendPurpose(specialistMessage), { ok: true });
    assert.equal(new URL(tabs.at(-1).url).searchParams.get('q'), 'site:developer.mozilla.org 日本語 & Web API');
    assert.deepEqual(await sendPurpose({ ...specialistMessage, siteId: 'https://unknown.example' }), { ok: false });
    const purposeCount = tabs.length;
    assert.deepEqual(await sendPurpose({ ...purposeMessage, purposeId: 'https://example.com' }), { ok: false });
    assert.deepEqual(await sendPurpose({ ...purposeMessage, selectionText: 'a'.repeat(2001) }), { ok: false });
    assert.deepEqual(await sendPurpose(purposeMessage, { id: 'test-extension' }), { ok: false });
    enabledSites = ['searchAmazon'];
    assert.deepEqual(await sendPurpose(specialistMessage), { ok: false });
    assert.deepEqual(await sendPurpose(purposeMessage), { ok: false });
    enabledSites = ['searchGoogle'];
    toolbarEnabled = false;
    assert.deepEqual(await sendPurpose(purposeMessage), { ok: false });
    toolbarEnabled = true;
    jevEnabled = false;
    assert.deepEqual(await sendPurpose(specialistMessage), { ok: false });
    assert.deepEqual(await sendPurpose(purposeMessage), { ok: false });
    assert.equal(tabs.length, purposeCount);
    assert.equal(listeners.message(searchMessage, { id: 'other-extension' }, () => assert.fail('外部からのメッセージを処理しない')), undefined);
  } finally {
    delete globalThis.chrome;
  }
});
