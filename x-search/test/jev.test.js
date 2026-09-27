import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_SITES } from '../search-sites.js';
import { buildJevRequest, limitText, requestJev, selectRecommendations, selectPurposeRecommendations } from '../jev.js';
import { configureJev, getJevStatus, recommendSites, resetJevRequests } from '../jev-service.js';

const scores = (values = {}) => ({
  answers: Object.fromEntries(SEARCH_SITES.map(site => [site.id, {
    type: 'score', score: 1, confidence: 0.9, ...values[site.id],
  }])),
});

test('Jevへ渡す文章の範囲と質問を限定する', () => {
  const sites = SEARCH_SITES.filter(site => site.id === 'searchMaps');
  const body = buildJevRequest({ model: 'jev-test', selectionText: '🎧'.repeat(2100), context: 'あ'.repeat(500), sites });
  assert.equal(Array.from(body.state.selected_text).length, 2000);
  assert.equal(body.state.nearby_text.length, 240);
  assert.deepEqual(Object.keys(body.state), ['selected_text', 'nearby_text']);
  assert.deepEqual(Object.keys(body.questions), ['searchMaps', 'purpose_map']);
  assert.equal(body.questions.searchMaps.type, 'score');
  assert.equal(body.questions.searchMaps.criteria.length, 4);
  assert.equal(limitText(null, 100), '');
});

test('確信度の低い回答、壊れた回答、無効なサイトを除き最大2件を選ぶ', () => {
  const response = scores({
    searchMaps: { score: 3, confidence: 0.99 },
    searchGoogle: { score: 2.7, confidence: 0.9 },
    searchAmazon: { score: 2.6, confidence: 0.9 },
    searchX: { score: 3, confidence: 0.2 },
    searchYahoo: { score: '3', confidence: 0.99 },
    searchYouTube: { score: 5, confidence: 0.99 },
  });
  response.answers.inventedSite = { type: 'score', score: 3, confidence: 1 };
  assert.deepEqual(selectRecommendations(response, SEARCH_SITES), ['searchMaps', 'searchGoogle']);
  assert.deepEqual(selectRecommendations(response, SEARCH_SITES.filter(site => site.id === 'searchX')), []);
  assert.deepEqual(selectRecommendations({}, SEARCH_SITES), []);
});

test('固定APIへの認証、タイムアウト、認証エラーを扱う', async () => {
  await requestJev('/v1/models', { apiKey: 'fake-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer fake-key');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    return Response.json({ models: [] });
  } });
  await assert.rejects(requestJev('/v1/models', { apiKey: 'fake-key', fetchImpl: async () => new Response('secret server text', { status: 401 }) }), /APIキーまたはJevの利用権限/);
  await assert.rejects(requestJev('/v1/models', { apiKey: 'fake-key', timeoutMs: 5, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }) }), /応答が間に合いません/);
});

test('AIは明示的なオン・キー・権限が揃った場合だけ通信し、オフと削除が効く', async () => {
  const originalFetch = globalThis.fetch;
  let config = {};
  let permitted = false;
  const requests = [];
  const sender = { tab: { id: 5 }, frameId: 0, url: 'https://example.com/private-page' };
  const message = { selectionText: 'ベルクス', context: '近所のスーパー', url: 'https://do-not-send.example' };
  globalThis.chrome = {
    storage: { local: {
      async get() { return { ...config }; },
      async set(values) { Object.assign(config, values); resetJevRequests(); },
      async remove(keys) { for (const key of keys) delete config[key]; resetJevRequests(); },
    } },
    permissions: { async contains() { return permitted; } },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/models')) return Response.json({ models: [{ name: 'jev-test' }] });
    const response = scores({ searchMaps: { score: 3 }, searchGoogle: { score: 2.8 } });
    response.answers.purpose_map = { type: 'score', score: 3, confidence: 0.9 };
    return Response.json(response);
  };
  try {
    resetJevRequests();
    assert.deepEqual(await recommendSites(message, sender), { ids: [] });
    assert.equal(requests.length, 0);
    assert.equal((await configureJev({ action: 'enable', enabled: true })).ok, false);
    assert.equal((await configureJev({ action: 'connect', apiKey: 'fake-key' })).ok, false);
    permitted = true;
    const connected = await configureJev({ action: 'connect', apiKey: 'fake-key', includeContext: false });
    assert.equal(connected.enabled, true);
    assert.equal(connected.model, 'jev-test');
    assert.equal('jevApiKey' in connected, false);
    assert.equal(JSON.stringify(await getJevStatus()).includes('fake-key'), false);
    assert.equal(requests.length, 2);
    assert.deepEqual(await recommendSites(message, sender), { ids: ['searchMaps', 'searchGoogle'], purposes: [{ id: 'map', label: '地図で見る', siteId: 'searchMaps' }] });
    assert.deepEqual(requests.at(-1).body.state, { selected_text: 'ベルクス', nearby_text: '' });
    assert.equal(requests.at(-1).body.model, 'jev-test');
    const cached = await recommendSites(message, sender);
    assert.deepEqual(cached.purposes, [{ id: 'map', label: '地図で見る', siteId: 'searchMaps' }]);
    assert.equal(requests.length, 3, '同じ選択はキャッシュを使用');
    await recommendSites({ selectionText: '別の選択' }, sender);
    assert.equal(requests.length, 3, '選択の連打では通信しない');
    await configureJev({ action: 'context', enabled: true });
    config.enabledSites = ['searchMaps'];
    assert.deepEqual(await recommendSites(message, sender), { ids: ['searchMaps'], purposes: [{ id: 'map', label: '地図で見る', siteId: 'searchMaps' }] });
    assert.equal(requests.at(-1).body.state.nearby_text, '近所のスーパー');
    assert.deepEqual(Object.keys(requests.at(-1).body.questions), ['searchMaps', 'purpose_map']);
    permitted = false;
    assert.deepEqual(await recommendSites(message, sender), { ids: [] }, '権限がなければキャッシュも表示しない');
    permitted = true;
    await configureJev({ action: 'enable', enabled: false });
    const before = requests.length;
    await recommendSites(message, sender);
    assert.equal(requests.length, before);
    await configureJev({ action: 'enable', enabled: true });
    resetJevRequests();
    let finish;
    globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
    const pending = recommendSites(message, sender);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    await configureJev({ action: 'enable', enabled: false });
    finish(Response.json(scores({ searchMaps: { score: 3 } })));
    assert.deepEqual(await pending, { ids: [] }, 'オフにする前の遅い結果を無視');
    await configureJev({ action: 'delete' });
    assert.equal(config.jevApiKey, undefined);
    assert.equal(config.jevModel, undefined);
    assert.equal(config.jevEnabled, false);
  } finally {
    resetJevRequests();
    globalThis.fetch = originalFetch;
    delete globalThis.chrome;
  }
});


test('目的は有効な検索先・確信度で絞り、定型の検索語を使う', async () => {
  const { SEARCH_PURPOSES, buildPurposeQuery } = await import('../search-purposes.js');
  const response = { answers: {
    purpose_compare: { type: 'score', score: 3, confidence: 0.95 },
    purpose_review: { type: 'score', score: 2.9, confidence: 0.9 },
    purpose_howto: { type: 'score', score: 2.8, confidence: 0.8 },
    purpose_map: { type: 'score', score: 3, confidence: 0.1 },
    purpose_unknown: { type: 'score', score: 3, confidence: 1 },
  } };
  assert.deepEqual(selectPurposeRecommendations(response, SEARCH_SITES).map(p => p.id), ['compare', 'review']);
  assert.deepEqual(selectPurposeRecommendations(response, SEARCH_SITES.filter(s => s.id !== 'searchGoogle')).map(p => p.id), ['howto']);
  assert.deepEqual(selectPurposeRecommendations({}, SEARCH_SITES), []);
  assert.equal(buildPurposeQuery(SEARCH_PURPOSES.find(p => p.id === 'review'), '  製品 & 日本語 🎧  '), '製品 & 日本語 🎧 レビュー');
  assert.equal(buildPurposeQuery(SEARCH_PURPOSES.find(p => p.id === 'map'), ' 東京駅 '), '東京駅');
});

test('長文の検索語候補は原文内だけ、上限内だけに限定しJevの未知の回答を無視する', async () => {
  const { extractSearchQueries } = await import('../search-queries.js');
  const { selectQueryRecommendations } = await import('../jev.js');
  const text = '昨日購入した「Sony WH-1000XM6」で音が途切れるので、設定方法やレビューを調べてから交換するか考えたいです。';
  const queries = extractSearchQueries(text);
  assert.ok(queries.includes('Sony WH-1000XM6'));
  assert.ok(queries.every(query => text.includes(query) && Array.from(query).length <= 80));
  assert.equal(new Set(queries).size, queries.length);
  assert.deepEqual(extractSearchQueries('Sony WH-1000XM6'), []);
  assert.deepEqual(extractSearchQueries('あ'.repeat(2000) + '「範囲外の製品」'), []);
  const answers = Object.fromEntries(queries.map((query, i) => [`query_${i}`, { type: 'score', score: 3, confidence: 0.9 }]));
  answers.query_999 = { type: 'score', score: 3, confidence: 1 };
  const picked = selectQueryRecommendations({ answers }, text);
  assert.ok(picked.length <= 5 && picked.every(query => queries.includes(query)));
  answers.query_0.confidence = 0.1;
  assert.notEqual(selectQueryRecommendations({ answers }, text)[0], queries[0]);
  assert.ok(selectQueryRecommendations({}, text).includes('Sony WH-1000XM6'), 'AI回答がなくても原文候補を保持');
});

test('専門サイトは固定リストと確信度で限定し、サイト内検索に安全に符号化する', async () => {
  const { SPECIALIST_SITES, buildSpecialistUrl } = await import('../specialist-sites.js');
  const { buildSpecialistRequest, selectSpecialists } = await import('../jev.js');
  const body = buildSpecialistRequest({ model: 'jev-test', selectionText: 'JavaScript', context: '' });
  assert.equal(Object.keys(body.questions).length, SPECIALIST_SITES.length);
  const result = selectSpecialists({ answers: {
    mdn: { type: 'score', score: 3, confidence: 0.99 },
    github: { type: 'score', score: 3, confidence: 0.1 },
    malicious: { type: 'score', score: 3, confidence: 1 },
  } });
  assert.deepEqual(result.map(s => s.id), ['mdn']);
  const url = new URL(buildSpecialistUrl(result[0], '日本語 & #test'));
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.searchParams.get('q'), 'site:developer.mozilla.org 日本語 & #test');
  assert.equal(url.hash, '');
});

test('日本語の複合語・英語名・長文後半を拾い、活用語の断片を候補にしない', async () => {
  const { extractSearchQueries } = await import('../search-queries.js');
  const cases = [
    ['量子コンピューターの研究が進んでいて、東京大学による発表について詳しく調べたい。', ['量子コンピューター', '東京大学']],
    ['ReactとNext.jsを使ってサイトを作っているが、エラーが表示されてしまう。', ['React', 'Next.js']],
    ['昨日買ったSony WH-1000XM6の音が途切れるので設定を見直している。', ['Sony WH-1000XM6']],
  ];
  for (const [text, expected] of cases) {
    const picked = extractSearchQueries(text).slice(0, 5);
    for (const term of expected) assert.ok(picked.includes(term), `${term}: ${picked}`);
    assert.ok(!picked.includes('途切') && !picked.includes('昨日買') && !picked.includes('見直'));
  }
  const long = 'この文章には日常の出来事について書かれています。'.repeat(100) + '購入した「Sony WH-1000XM6」の設定方法を調べたい。';
  assert.ok(extractSearchQueries(long, 20000).slice(0, 5).includes('Sony WH-1000XM6'));
});
