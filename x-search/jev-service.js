import { SEARCH_SITES, getEnabledSiteIds } from './search-sites.js';
import { JEV_PERMISSION, buildJevRequest, limitText, MAX_SELECTION, MAX_CONTEXT, requestJev, selectRecommendations, selectPurposeRecommendations, selectQueryRecommendations, buildSpecialistRequest, selectSpecialists } from './jev.js';

const cache = new Map();
const active = new Map();
let lastRequestAt = 0;
let revision = 0;

export function resetJevRequests() {
  revision++;
  for (const request of active.values()) request.abort();
  active.clear();
  cache.clear();
  lastRequestAt = 0;
}

export async function getJevStatus() {
  const config = await chrome.storage.local.get(['jevEnabled', 'jevContext', 'jevApiKey', 'jevModel']);
  return {
    enabled: config.jevEnabled === true,
    includeContext: config.jevContext === true,
    hasKey: Boolean(config.jevApiKey),
    model: config.jevModel || '',
  };
}

export async function configureJev(message) {
  if (message.action === 'delete') {
    resetJevRequests();
    await chrome.storage.local.set({ jevEnabled: false });
    await chrome.storage.local.remove(['jevApiKey', 'jevModel']);
    return { ok: true, ...await getJevStatus() };
  }
  if (message.action === 'context') {
    await chrome.storage.local.set({ jevContext: message.enabled === true });
    return { ok: true, ...await getJevStatus() };
  }
  if (message.action === 'enable') {
    const status = await getJevStatus();
    if (message.enabled === true && (!status.hasKey || !await chrome.permissions.contains(JEV_PERMISSION))) {
      return { ok: false, error: 'APIキーを入力し、「接続を確認して保存」を押してください。' };
    }
    if (message.enabled !== true) resetJevRequests();
    await chrome.storage.local.set({ jevEnabled: message.enabled === true });
    return { ok: true, ...await getJevStatus() };
  }
  if (message.action !== 'connect') return { ok: false, error: '設定を保存できませんでした。' };
  const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
  if (!apiKey || apiKey.length > 512) return { ok: false, error: '有効なAPIキーを入力してください。' };
  if (!await chrome.permissions.contains(JEV_PERMISSION)) return { ok: false, error: 'Jevへの接続を許可してください。' };
  const models = await requestJev('/v1/models', { apiKey, timeoutMs: 8000 });
  const availableModels = Array.isArray(models.models) ? models.models : [];
  const model = availableModels.find(item => item.name === 'jev-latest')?.name
    ?? availableModels.find(item => typeof item.name === 'string' && item.name.startsWith('jev'))?.name;
  if (!model) return { ok: false, error: 'このAPIキーで利用できるJevモデルが見つかりませんでした。' };
  const started = performance.now();
  const response = await requestJev('/v1/systemone', {
    apiKey, timeoutMs: 8000,
    body: buildJevRequest({ model, selectionText: 'ベルクス', context: '近所のスーパーマーケットの場所を調べたい。', sites: SEARCH_SITES }),
  });
  if (!SEARCH_SITES.every(site => {
    const answer = response.answers?.[site.id];
    return answer?.type === 'score' && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= 3
      && Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1;
  })) {
    return { ok: false, error: 'Jevの応答形式を確認できませんでした。' };
  }
  const elapsedMs = Math.round(performance.now() - started);
  resetJevRequests();
  await chrome.storage.local.set({ jevApiKey: apiKey, jevModel: model, jevEnabled: true, jevContext: message.includeContext === true });
  return { ok: true, elapsedMs, ...await getJevStatus() };
}

export async function recommendSites(message, sender) {
  if (!sender.tab || !/^https?:\/\//.test(sender.url || '')) return { ids: [] };
  const requestRevision = revision;
  const config = await chrome.storage.local.get(['jevEnabled', 'jevContext', 'jevApiKey', 'jevModel', 'enabledSites', 'toolbarEnabled']);
  if (requestRevision !== revision || config.jevEnabled !== true || config.toolbarEnabled === false
      || !config.jevApiKey || !config.jevModel || !await chrome.permissions.contains(JEV_PERMISSION)) return { ids: [] };
  const selectionText = limitText(message.selectionText, MAX_SELECTION);
  const context = config.jevContext === true ? limitText(message.context, MAX_CONTEXT) : '';
  const ids = getEnabledSiteIds(config.enabledSites);
  if (!selectionText || !ids.length || requestRevision !== revision) return { ids: [] };
  const sites = SEARCH_SITES.filter(site => ids.includes(site.id));
  const specialist = message.type === 'recommendSpecialists';
  if (specialist && !ids.includes('searchGoogle')) return { specialists: [] };
  const key = JSON.stringify([specialist, selectionText, context, ids]);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  // 選択の連打によるAPI連続呼び出しを抑える。通常検索は常に使用可能。
  if (!specialist && Date.now() - lastRequestAt < 500) return { ids: [] };
  lastRequestAt = Date.now();
  const source = `${sender.tab.id}:${sender.frameId ?? 0}:${specialist}`;
  active.get(source)?.abort();
  const controller = new AbortController();
  active.set(source, controller);
  try {
    const response = await requestJev('/v1/systemone', {
      apiKey: config.jevApiKey, signal: controller.signal,
      body: specialist ? buildSpecialistRequest({ model: config.jevModel, selectionText, context })
        : buildJevRequest({ model: config.jevModel, selectionText, context, sites }),
    });
    if (controller.signal.aborted || requestRevision !== revision) return { ids: [] };
    if (specialist) {
      const result = { specialists: selectSpecialists(response).map(({ id, name, domain }) => ({ id, name, domain })) };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { result, until: Date.now() + 5 * 60_000 });
      return result;
    }
    const recommended = selectRecommendations(response, sites);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    const purposes = selectPurposeRecommendations(response, sites).map(({ id, label, siteId }) => ({ id, label, siteId }));
    const queries = selectQueryRecommendations(response, selectionText);
    const result = { ids: recommended, purposes, ...(queries.length ? { queries } : {}) };
    cache.set(key, { result, until: Date.now() + 5 * 60_000 });
    return result;
  } catch {
    return specialist ? { specialists: [], error: '専門サイトを取得できませんでした。もう一度お試しください。' } : { ids: [] };
  } finally {
    if (active.get(source) === controller) active.delete(source);
  }
}
