import { extractSearchQueries } from './search-queries.js';
import { SPECIALIST_SITES, buildSpecialistUrl } from './specialist-sites.js';
import { SEARCH_PURPOSES, buildPurposeQuery } from './search-purposes.js';
import { SEARCH_SITES, getEnabledSiteIds, buildSearchUrl } from './search-sites.js';
import { configureJev, getJevStatus, recommendSites, resetJevRequests } from './jev-service.js';

const SETTINGS_MENU_ID = 'searchSettings';
let menuUpdate = Promise.resolve();

function createMenu(properties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

async function rebuildMenus() {
  const { enabledSites } = await chrome.storage.local.get('enabledSites');
  const enabledIds = getEnabledSiteIds(enabledSites);
  await chrome.contextMenus.removeAll();
  for (const site of SEARCH_SITES) {
    if (!enabledIds.includes(site.id)) continue;
    await createMenu({ id: site.id, title: `${site.name}で「%s」を検索`, contexts: ['selection'] });
  }
  if (enabledIds.length) {
    await createMenu({ id: 'searchSeparator', type: 'separator', contexts: ['selection'] });
  }
  await createMenu({ id: SETTINGS_MENU_ID, title: '検索先の設定…', contexts: ['selection'] });
}

// 設定の連続変更でも、メニューの削除・作成が重ならないようにする。
function refreshMenus() {
  menuUpdate = menuUpdate.then(rebuildMenus).catch(console.error);
  return menuUpdate;
}

chrome.runtime.onInstalled.addListener(refreshMenus);
chrome.runtime.onStartup.addListener(refreshMenus);
chrome.permissions?.onRemoved?.addListener(permissions => {
  if (permissions.origins?.includes('https://api.typesafe.ai/*')) {
    resetJevRequests();
    void chrome.storage.local.set({ jevEnabled: false });
  }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && ['jevEnabled', 'jevContext', 'jevApiKey', 'jevModel', 'enabledSites', 'toolbarEnabled'].some(key => Object.hasOwn(changes, key))) resetJevRequests();
  if (areaName === 'local' && Object.hasOwn(changes, 'enabledSites')) return refreshMenus();
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function search(siteId, selectionText, fromToolbar = false) {
  const site = SEARCH_SITES.find(candidate => candidate.id === siteId);
  const query = typeof selectionText === 'string' ? selectionText.trim() : '';
  if (!site || !query) return false;
  const { enabledSites, toolbarEnabled } = await chrome.storage.local.get(['enabledSites', 'toolbarEnabled']);
  if (fromToolbar && toolbarEnabled === false) return false;
  if (!getEnabledSiteIds(enabledSites).includes(site.id)) return false;
  await chrome.tabs.create({ url: buildSearchUrl(site, query) });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'getQueryCandidates') {
    if (!sender.tab || !/^https?:\/\//.test(sender.url || '')) return;
    chrome.storage.local.get(['jevEnabled', 'toolbarEnabled']).then(config => {
      sendResponse({ queries: config.jevEnabled === true && config.toolbarEnabled !== false
        ? extractSearchQueries(message.selectionText, 20000).slice(0, 5) : [] });
    }).catch(() => sendResponse({ queries: [] }));
    return true;
  }
  if (message?.type === 'recommendSites' || message?.type === 'recommendSpecialists') {
    recommendSites(message, sender).then(sendResponse).catch(() => sendResponse({ ids: [] }));
    return true;
  }
  if (message?.type === 'getJevStatus' || message?.type === 'configureJev') {
    if (sender.url !== chrome.runtime.getURL('options.html')) return;
    const operation = message.type === 'getJevStatus' ? getJevStatus() : configureJev(message);
    operation.then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'getToolbarSettings') {
    chrome.storage.local.get(['enabledSites', 'toolbarEnabled', 'jevEnabled', 'jevContext', 'jevApiKey']).then(({ enabledSites, toolbarEnabled, jevEnabled, jevContext, jevApiKey }) => {
      const enabledIds = getEnabledSiteIds(enabledSites);
      sendResponse({
        enabled: toolbarEnabled !== false,
        aiEnabled: jevEnabled === true && Boolean(jevApiKey),
        includeContext: jevContext === true,
        sites: SEARCH_SITES.filter(site => enabledIds.includes(site.id)).map(({ id, name }) => ({ id, name })),
      });
    }).catch(() => sendResponse({ enabled: false, sites: [] }));
    return true;
  }
  if (message?.type === 'searchSpecialist') {
    const site = SPECIALIST_SITES.find(site => site.id === message.siteId);
    const query = typeof message.selectionText === 'string' ? message.selectionText.trim() : '';
    if (!site || !query || Array.from(query).length > 2000 || !sender.tab || !/^https?:\/\//.test(sender.url || '')) {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.local.get(['jevEnabled', 'toolbarEnabled', 'enabledSites']).then(async config => {
      if (config.jevEnabled !== true || config.toolbarEnabled === false || !getEnabledSiteIds(config.enabledSites).includes('searchGoogle')) return false;
      await chrome.tabs.create({ url: buildSpecialistUrl(site, query) });
      return true;
    }).then(ok => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'searchPurpose') {
    const purpose = SEARCH_PURPOSES.find(item => item.id === message.purposeId);
    if (!purpose || typeof message.selectionText !== 'string' || !message.selectionText.trim()
        || Array.from(message.selectionText.trim()).length > 2000 || !sender.tab || !/^https?:\/\//.test(sender.url || '')) {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.local.get('jevEnabled').then(config => config.jevEnabled === true
      ? search(purpose.siteId, buildPurposeQuery(purpose, message.selectionText), true) : false)
      .then(ok => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'searchFromToolbar') {
    search(message.siteId, message.selectionText, true)
      .then(ok => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === SETTINGS_MENU_ID) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  await search(info.menuItemId, info.selectionText);
});
