import { SEARCH_SITES, getEnabledSiteIds } from './search-sites.js';
import { JEV_PERMISSION } from './jev.js';

const fieldset = document.querySelector('#site-settings');
const sitesElement = document.querySelector('#sites');
const status = document.querySelector('#status');
const count = document.querySelector('#selection-count');
const toolbarToggle = document.querySelector('#toolbar-enabled');
let savedIds = [];
let savedToolbarEnabled = true;

for (const site of SEARCH_SITES) {
  const label = document.createElement('label');
  label.className = 'site';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = site.id;
  input.name = 'sites';
  const text = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = site.name;
  const description = document.createElement('small');
  description.textContent = site.description;
  text.append(name, description);
  label.append(input, text);
  sitesElement.append(label);
}

function renderSelection(ids) {
  for (const input of sitesElement.querySelectorAll('input')) input.checked = ids.includes(input.value);
  count.textContent = `${ids.length} / ${SEARCH_SITES.length} サイトを表示`;
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function save(changes) {
  fieldset.disabled = true;
  showStatus('保存しています…');
  try {
    await chrome.storage.local.set(changes);
    if (Object.hasOwn(changes, 'enabledSites')) savedIds = changes.enabledSites;
    if (Object.hasOwn(changes, 'toolbarEnabled')) savedToolbarEnabled = changes.toolbarEnabled;
    renderSelection(savedIds);
    toolbarToggle.checked = savedToolbarEnabled;
    showStatus(savedIds.length ? '保存しました。次の文字選択・右クリックから反映されます。' : '保存しました。検索先はすべて非表示です。');
  } catch (error) {
    renderSelection(savedIds);
    toolbarToggle.checked = savedToolbarEnabled;
    showStatus('保存できませんでした。もう一度お試しください。', true);
    console.error(error);
  } finally {
    fieldset.disabled = false;
  }
}

document.querySelector('#settings-form').addEventListener('submit', event => event.preventDefault());
sitesElement.addEventListener('change', () => {
  const ids = [...sitesElement.querySelectorAll('input:checked')].map(input => input.value);
  void save({ enabledSites: ids });
});
document.querySelector('#enable-all').addEventListener('click', () => {
  void save({ enabledSites: SEARCH_SITES.map(site => site.id) });
});
toolbarToggle.addEventListener('change', () => {
  void save({ toolbarEnabled: toolbarToggle.checked });
});

try {
  const { enabledSites, toolbarEnabled } = await chrome.storage.local.get(['enabledSites', 'toolbarEnabled']);
  savedIds = getEnabledSiteIds(enabledSites);
  savedToolbarEnabled = toolbarEnabled !== false;
  renderSelection(savedIds);
  toolbarToggle.checked = savedToolbarEnabled;
  fieldset.disabled = false;
  showStatus('変更は自動で保存されます。');
} catch (error) {
  showStatus('設定を読み込めませんでした。このページを再読み込みしてください。', true);
  console.error(error);
}

const aiFieldset = document.querySelector('#ai-settings');
const aiToggle = document.querySelector('#ai-enabled');
const contextToggle = document.querySelector('#ai-context');
const keyInput = document.querySelector('#ai-key');
const aiStatus = document.querySelector('#ai-status');
let savedAI = { enabled: false, includeContext: false, hasKey: false };

function renderAI(config) {
  savedAI = config;
  aiToggle.checked = config.enabled;
  contextToggle.checked = config.includeContext;
  document.querySelector('#ai-delete').disabled = !config.hasKey;
  document.querySelector('#ai-key-state').textContent = config.hasKey ? `キー登録済み · ${config.model}` : 'APIキーは未登録です。AIおすすめは初期状態ではオフです。';
  keyInput.placeholder = config.hasKey ? 'キーを変更する場合だけ入力' : 'APIキーを入力';
}

function showAIStatus(message, isError = false) {
  aiStatus.textContent = message;
  aiStatus.classList.toggle('error', isError);
}

async function configureAI(action, values = {}) {
  aiFieldset.disabled = true;
  showAIStatus(action === 'connect' ? 'Jevへの接続を確認しています…' : '保存しています…');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'configureJev', action, ...values });
    if (!result?.ok) throw new Error(result?.error || '設定を保存できませんでした。');
    renderAI(result);
    if (action === 'connect' || action === 'delete') keyInput.value = '';
    showAIStatus(action === 'connect' ? `接続できました。サンプルの判定に${result.elapsedMs}msかかりました。AIおすすめはオンです。`
      : action === 'delete' ? 'キーを削除し、AIおすすめをオフにしました。' : '保存しました。');
  } catch (error) {
    renderAI(savedAI);
    showAIStatus(error.message, true);
  } finally {
    aiFieldset.disabled = false;
  }
}

document.querySelector('#ai-connect').addEventListener('click', async () => {
  if (!keyInput.value.trim()) {
    showAIStatus('APIキーを入力してください。', true);
    keyInput.focus();
    return;
  }
  try {
    const granted = await chrome.permissions.request(JEV_PERMISSION);
    if (!granted) { showAIStatus('Jevへの接続が許可されていません。', true); return; }
    await configureAI('connect', { apiKey: keyInput.value.trim(), includeContext: contextToggle.checked });
  } catch {
    showAIStatus('接続権限を確認できませんでした。もう一度お試しください。', true);
  }
});
aiToggle.addEventListener('change', async () => {
  if (aiToggle.checked && savedAI.hasKey) {
    try {
      if (!await chrome.permissions.request(JEV_PERMISSION)) {
        renderAI(savedAI);
        showAIStatus('Jevへの接続が許可されていません。', true);
        return;
      }
    } catch {
      renderAI(savedAI);
      showAIStatus('接続権限を確認できませんでした。', true);
      return;
    }
  }
  void configureAI('enable', { enabled: aiToggle.checked });
});
contextToggle.addEventListener('change', () => void configureAI('context', { enabled: contextToggle.checked }));
document.querySelector('#ai-delete').addEventListener('click', () => void configureAI('delete'));
keyInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') document.querySelector('#ai-connect').click();
});

try {
  const config = await chrome.runtime.sendMessage({ type: 'getJevStatus' });
  if (!config || config.ok === false) throw new Error();
  renderAI(config);
  aiFieldset.disabled = false;
  showAIStatus(config.enabled ? 'AIおすすめはオンです。' : 'AIおすすめはオフです。通常の検索はそのまま使えます。');
} catch {
  showAIStatus('AI設定を読み込めませんでした。拡張機能を再読み込みしてください。', true);
}
