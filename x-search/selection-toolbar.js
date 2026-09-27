(() => {
  let settings = { enabled: false, sites: [] };
  let host;
  let toolbar;
  let timer;
  let selecting = false;
  let settingsRequest = 0;
  let recommendationTimer;
  let selectionRevision = 0;

  // SVGを同梱し、検索バーを開くたびに外部へ画像を取得しない。
  const icons = {
    searchGoogle: [
      ['path', { fill: '#4285f4', d: 'M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z' }],
      ['path', { fill: '#34a853', d: 'M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z' }],
      ['path', { fill: '#fbbc05', d: 'M6.4 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2Z' }],
      ['path', { fill: '#ea4335', d: 'M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z' }],
    ],
    searchX: [
      ['path', { fill: 'currentColor', d: 'M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l5.3 7.1Zm-1.1 18h1.7L6.4 3.9H4.6Z' }],
    ],
    searchAmazon: [
      ['text', { x: '12', y: '17', 'text-anchor': 'middle', fill: 'currentColor', 'font-size': '24', 'font-weight': '700', 'font-family': 'Georgia, serif' }, 'a'],
      ['path', { d: 'M3 19c5 3.4 11 3.4 17-.2M17 18.5l3.5.1-.6 3', fill: 'none', stroke: '#f6a622', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
    searchRakuten: [
      ['rect', { x: '1', y: '1', width: '22', height: '22', rx: '5', fill: '#bf0000' }],
      ['text', { x: '12', y: '17', 'text-anchor': 'middle', fill: '#fff', 'font-size': '18', 'font-weight': '800', 'font-family': 'Arial, sans-serif' }, 'R'],
      ['path', { d: 'm5 20 14-2-2 2Z', fill: '#fff' }],
    ],
    searchYahoo: [
      ['text', { x: '1', y: '19', fill: '#ef3340', 'font-size': '21', 'font-weight': '800', 'font-family': 'Georgia, serif' }, 'Y!'],
    ],
    // メルカリ公式サイトのシンボルSVG（https://jp.mercari.com/）。
    searchMercari: [["path", {"fill": "#ff0211", "fill-rule": "evenodd", "d": "M42.65,14.15l0,21a3.55,3.55,0,0,1-2,3.17l-17.8,8.59a3.54,3.54,0,0,1-3.08,0L9.25,41.82,2,38.27A3.51,3.51,0,0,1,0,35.1l0-21a3.5,3.5,0,0,1,2-3.14L19.79,2.07a3.55,3.55,0,0,1,3.16,0L40.71,11A3.53,3.53,0,0,1,42.65,14.15Z"}], ["circle", {"fill": "#4dc9ff", "cx": "36.03", "cy": "14.65", "r": "9.56"}], ["path", {"fill": "#fff", "d": "M5.87,32.15,4,31.23V25.7c0-1.62.91-3.24,2.79-3.05a4.75,4.75,0,0,1,3.54,2.75,2.4,2.4,0,0,1,2.13-.6c1,.13,4.59,1.48,4.59,6.39V37.7l-2.05-1V30.58a3.25,3.25,0,0,0-2.57-3.44c-.61-.06-1.14.43-1.15,1.48s0,6.21,0,6.21L9.4,33.91V28.12c0-2.55-1.65-3.34-2.37-3.42-.41,0-1.16.21-1.16,1.52Z"}]],
    searchYouTube: [
      ['rect', { x: '1', y: '4', width: '22', height: '16', rx: '5', fill: '#f03' }],
      ['path', { d: 'm10 8 6 4-6 4Z', fill: '#fff' }],
    ],
    searchMaps: [
      ['path', { d: 'M12 1a8 8 0 0 0-8 8c0 5.5 8 14 8 14s8-8.5 8-14a8 8 0 0 0-8-8Z', fill: '#34a853' }],
      ['path', { d: 'M6.3 3.4A8 8 0 0 0 4 9c0 2.2 1.3 5 3 7.4L16.7 2.5A8 8 0 0 0 6.3 3.4Z', fill: '#4285f4' }],
      ['path', { d: 'M12 1a8 8 0 0 0-5.7 2.4l5.7 5.7 4.7-6.6A8 8 0 0 0 12 1Z', fill: '#ea4335' }],
      ['circle', { cx: '12', cy: '9', r: '3', fill: '#fff' }],
    ],
  };

  function createIcon(siteId) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', siteId === 'searchMercari' ? '0 0 49 49' : '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shapes = icons[siteId] ?? [
      ['circle', { cx: '10', cy: '10', r: '6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }],
      ['path', { d: 'm15 15 6 6', stroke: 'currentColor', 'stroke-width': '2' }],
    ];
    for (const [tag, attributes, text] of shapes) {
      const element = document.createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
      if (text) element.textContent = text;
      svg.append(element);
    }
    return svg;
  }

  function hide() {
    clearTimeout(timer);
    clearTimeout(recommendationTimer);
    selectionRevision++;
    host?.remove();
  }

  function isEditable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.isContentEditable || Boolean(element?.closest('input, textarea, select, [role="textbox"]'));
  }

  function createToolbar() {
    host = document.createElement('div');
    host.setAttribute('data-selection-search-toolbar', '');
    // ページ側のCSSと検索バーの見た目を互いに干渉させない。
    host.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important; display: block !important; margin: 0 !important; padding: 0 !important; border: 0 !important; width: max-content !important; height: auto !important; max-width: calc(100vw - 16px) !important; color-scheme: light dark !important;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .toolbar { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
        max-width: calc(100vw - 16px); padding: 4px; border: 1px solid #dbe1ed; border-radius: 10px;
        background: #fff; color: #202b3d; box-shadow: 0 5px 22px #172b4d26;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; direction: ltr; }
      .toolbar.with-purposes { min-width: min(240px, calc(100vw - 16px)); }
      button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; flex: 0 0 auto; border-radius: 6px;
        color: inherit; font: inherit; white-space: nowrap; cursor: pointer; }
      button:hover { background: #edf2ff; color: #3458ac; }
      button:focus-visible { outline: 2px solid #7397ef; outline-offset: -2px; }
      button:disabled { opacity: .5; cursor: wait; }
      button.recommended { position: relative; background: #eef2ff; box-shadow: inset 0 0 0 2px #8b78df; }
      button.recommended::after { content: '✦'; position: absolute; top: -3px; right: 0; color: #7155c6; font-size: 10px; line-height: 12px; }
      svg { display: block; width: 20px; height: 20px; pointer-events: none; }
      .queries { flex-basis: 100%; width: 0; min-width: 100%; height: 82px; overflow: auto;
        display: flex; flex-wrap: wrap; align-content: flex-start; gap: 3px; }
      .query-caption { width: 100%; font-size: 11px; color: #657086; padding: 0 3px; }
      .queries .query-choice { display: block; width: auto; max-width: 100%; height: 27px; padding: 0 7px;
        font-size: 12px; overflow: hidden; text-overflow: ellipsis; background: #edf2ff; }
      .query-choice[aria-pressed="true"] { box-shadow: inset 0 0 0 2px #8b78df; }
      .specialist-panel { flex-basis: 100%; width: 0; min-width: 100%; max-height: 145px; overflow: auto; }
      .specialist-panel button { width: 100%; height: auto; min-height: 28px; padding: 4px 6px; display: block;
        text-align: left; white-space: normal; font-size: 12px; }
      .specialist-panel small { display: block; font-size: 10px; opacity: .75; overflow-wrap: anywhere; }
      .specialist-status { display: block; font-size: 11px; padding: 4px; }
      .purposes { display: flex; align-items: center; gap: 4px; flex-basis: 100%; width: 0;
        min-width: 100%; height: 30px; overflow: hidden; }
      .purposes button { width: auto; min-width: 0; max-width: calc(50% - 2px); height: 26px;
        flex: 1 1 0; padding: 0 5px; background: #eef2ff; color: #6347ad; font-size: 11px;
        overflow: hidden; text-overflow: ellipsis; display: block; text-align: center; }
      .purposes button:hover { background: #e2dcfa; }
      .purpose-status { padding: 0 5px; color: #657086; font-size: 11px; }
      .close { color: #657086; font-size: 17px; width: 24px; margin-left: 2px; }
      .error { flex-basis: 100%; max-width: 260px; padding: 4px 9px; color: #b32c3d; }
      @media (prefers-color-scheme: dark) {
        .toolbar { background: #222b3b; color: #e6ebf5; border-color: #495772; }
        button:hover { background: #344360; color: #d4e0ff; }
        button.recommended { background: #37334f; box-shadow: inset 0 0 0 2px #a995f3; }
        button.recommended::after { color: #d2c6ff; }
        .query-caption { color: #abb7cc; }
        .queries .query-choice { background: #344360; }
        .purposes button { background: #37334f; color: #e0d7ff; }
        .purposes button:hover { background: #4a4169; }
        .purpose-status { color: #abb7cc; }
        .close { color: #abb7cc; } .error { color: #ffabb4; }
      }
    `;
    toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '選択したテキストを検索');
    shadow.append(style, toolbar);
    host.addEventListener('pointerdown', event => {
      event.stopPropagation();
      // マウスでボタンを押しても元のテキスト選択を維持する。
      if (event.button === 0) event.preventDefault();
    });
    host.addEventListener('click', event => event.stopPropagation());
  }

  function bindSearch(button, message) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage(message);
        if (!response?.ok) throw new Error('Search unavailable');
        hide();
      } catch {
        button.disabled = false;
        if (!toolbar.querySelector('.error')) {
          const error = document.createElement('span');
          error.className = 'error';
          error.setAttribute('role', 'status');
          error.textContent = '検索できませんでした。ページを再読み込みしてお試しください。';
          toolbar.append(error);
        }
      }
    });
  }

  function show(chosenQuery, queryOptions) {
    if (!settings.enabled || !settings.sites.length || selecting) return hide();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount
        || isEditable(selection.anchorNode) || isEditable(selection.focusNode)
        || isEditable(document.activeElement)) return hide();
    const originalQuery = selection.toString().trim();
    const query = typeof chosenQuery === 'string' ? chosenQuery : originalQuery;
    if (!query) return hide();
    const rects = [...selection.getRangeAt(0).getClientRects()];
    const rect = rects.findLast(rect => rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth);
    if (!rect) return hide();
    if (!host) createToolbar();
    const currentRevision = ++selectionRevision;
    clearTimeout(recommendationTimer);
    toolbar.replaceChildren();
    const aiEligible = settings.aiEnabled && Array.from(query).length <= 2000;
    toolbar.classList.toggle('with-purposes', aiEligible || (settings.aiEnabled && Array.from(originalQuery).length >= 20));
    let purposes;
    let queries;
    const hasQueryPicker = settings.aiEnabled && Array.from(originalQuery).length >= 20;
    if (hasQueryPicker) {
      queries = document.createElement('div');
      queries.className = 'queries';
      queries.setAttribute('role', 'group');
      queries.setAttribute('aria-label', '検索語を選ぶ');
      toolbar.append(queries);
    }
    function renderQueries(options) {
      if (!queries) return;
      queries.replaceChildren();
      const caption = document.createElement('span');
      caption.className = 'query-caption';
      caption.textContent = options.length ? '検索語候補（自動抽出）' : '検索語：原文のまま';
      queries.append(caption);
      for (const text of [originalQuery, ...options.filter(text => text !== originalQuery)]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'query-choice';
        button.textContent = text === originalQuery ? '原文のまま' : text;
        button.title = text;
        button.setAttribute('aria-pressed', String(text === query));
        button.addEventListener('click', () => show(text, options));
        queries.append(button);
      }
    }
    let availableQueries = queryOptions ?? [];
    if (queries) {
      renderQueries(availableQueries);
      if (!queryOptions) chrome.runtime.sendMessage({ type: 'getQueryCandidates', selectionText: originalQuery }).then(result => {
        if (currentRevision !== selectionRevision || !host?.isConnected) return;
        availableQueries = [...new Set([...availableQueries, ...(result?.queries ?? [])])].slice(0, 5);
        renderQueries(availableQueries);
      }).catch(() => {});
    }
    if (aiEligible) {
      purposes = document.createElement('div');
      purposes.className = 'purposes';
      purposes.setAttribute('role', 'group');
      purposes.setAttribute('aria-label', 'AIおすすめの検索目的');
      const status = document.createElement('span');
      status.className = 'purpose-status';
      status.setAttribute('role', 'status');
      status.textContent = '目的を判定中…';
      purposes.append(status);
      toolbar.append(purposes);
    }
    for (const site of settings.sites) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.siteId = site.id;
      button.append(createIcon(site.id));
      button.title = `${site.name}で選択したテキストを検索`;
      button.setAttribute('aria-label', `${site.name}で検索`);
      bindSearch(button, { type: 'searchFromToolbar', siteId: site.id, selectionText: query });
      toolbar.append(button);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.title = '閉じる（Esc）';
    close.setAttribute('aria-label', '検索バーを閉じる');
    close.addEventListener('click', hide);
    toolbar.append(close);
    let specialistPanel;
    if (aiEligible && settings.sites.some(site => site.id === 'searchGoogle')) {
      specialistPanel = document.createElement('div');
      specialistPanel.className = 'specialist-panel';
      const discover = document.createElement('button');
      discover.type = 'button';
      discover.className = 'discover-specialists';
      discover.textContent = '専門サイトを探す';
      discover.title = '専門サイト集からJevが選びます。Googleでサイト内検索します。';
      const results = document.createElement('div');
      results.setAttribute('aria-live', 'polite');
      specialistPanel.append(discover, results);
      toolbar.append(specialistPanel);
      discover.addEventListener('click', async () => {
        discover.disabled = true;
        results.replaceChildren();
        const status = document.createElement('span');
        status.className = 'specialist-status';
        status.textContent = '専門サイトを選んでいます…';
        results.append(status);
        positionToolbar();
        try {
          const range = selection.getRangeAt(0);
          const before = range.startContainer.nodeType === Node.TEXT_NODE ? Array.from(range.startContainer.textContent.slice(0, range.startOffset)).slice(-120).join('') : '';
          const after = range.endContainer.nodeType === Node.TEXT_NODE ? Array.from(range.endContainer.textContent.slice(range.endOffset)).slice(0, 120).join('') : '';
          const result = await chrome.runtime.sendMessage({ type: 'recommendSpecialists', selectionText: query, context: settings.includeContext ? `${before}\n${after}`.trim() : '' });
          if (currentRevision !== selectionRevision || !host?.isConnected || window.getSelection()?.toString().trim() !== originalQuery) return;
          const sites = Array.isArray(result?.specialists) ? result.specialists.slice(0, 3) : [];
          if (!sites.length) status.textContent = result?.error || '適した専門サイトが見つかりませんでした';
          else {
            results.replaceChildren();
            for (const site of sites) {
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.specialistId = site.id;
              button.textContent = site.name;
              const domain = document.createElement('small');
              domain.textContent = `${site.domain} · Googleでサイト内検索`;
              button.append(domain);
              button.title = `${site.name}内で「${query}」を検索`;
              bindSearch(button, { type: 'searchSpecialist', siteId: site.id, selectionText: query });
              results.append(button);
            }
          }
        } catch {
          status.textContent = '取得できませんでした。もう一度お試しください。';
        } finally {
          discover.disabled = false;
          if (currentRevision === selectionRevision && host?.isConnected) positionToolbar();
        }
      });
    }
    function positionToolbar() {
      const { width, height } = host.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = rect.bottom + 8;
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8);
      host.style.setProperty('left', `${left}px`, 'important');
      host.style.setProperty('top', `${top}px`, 'important');
    }
    host.style.setProperty('visibility', 'hidden', 'important');
    document.documentElement.append(host);
    positionToolbar();
    host.style.setProperty('visibility', 'visible', 'important');
    if (aiEligible) {
      // 隣接するテキスト部分だけを使用し、ページ全体は収集しない。
      const range = selection.getRangeAt(0);
      const before = range.startContainer.nodeType === Node.TEXT_NODE
        ? Array.from(range.startContainer.textContent.slice(0, range.startOffset)).slice(-120).join('') : '';
      const after = range.endContainer.nodeType === Node.TEXT_NODE
        ? Array.from(range.endContainer.textContent.slice(range.endOffset)).slice(0, 120).join('') : '';
      const context = settings.includeContext ? `${before}\n${after}`.trim() : '';
      recommendationTimer = setTimeout(async () => {
        try {
          const result = await chrome.runtime.sendMessage({ type: 'recommendSites', selectionText: query, context });
          if (currentRevision !== selectionRevision || !host?.isConnected || !settings.aiEnabled
              || window.getSelection()?.toString().trim() !== originalQuery) return;
          if (queries && !queryOptions && result?.queries?.length) {
            availableQueries = [...new Set([...result.queries, ...availableQueries])].slice(0, 5);
            renderQueries(availableQueries);
          }
          const suggestions = Array.isArray(result?.purposes) ? result.purposes.slice(0, 2) : [];
          if (suggestions.length) {
            purposes.replaceChildren();
            for (const purpose of suggestions) {
              const site = settings.sites.find(site => site.id === purpose.siteId);
              if (!site) continue;
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.purposeId = purpose.id;
              button.textContent = purpose.label;
              button.title = `${purpose.label} · ${site.name}で「${query}」を検索`;
              button.setAttribute('aria-label', button.title);
              bindSearch(button, { type: 'searchPurpose', purposeId: purpose.id, selectionText: query });
              purposes.append(button);
            }
          } else {
            purposes.querySelector('.purpose-status').textContent = '目的の提案はありません';
          }
          for (const button of toolbar.querySelectorAll('[data-site-id]')) {
            if (!result?.ids?.includes(button.dataset.siteId)) continue;
            button.classList.add('recommended');
            button.title = `AIおすすめ · ${button.title}`;
            button.setAttribute('aria-label', `AIおすすめ · ${button.getAttribute('aria-label')}`);
          }
        } catch {
          if (currentRevision === selectionRevision && host?.isConnected) {
            const status = purposes.querySelector('.purpose-status');
            if (status) status.textContent = '目的を取得できませんでした';
          }
        }
      }, 300);
    }
  }

  function scheduleShow() {
    clearTimeout(timer);
    clearTimeout(recommendationTimer);
    selectionRevision++;
    if (!selecting && settings.enabled) timer = setTimeout(show, 120);
  }

  async function loadSettings() {
    const request = ++settingsRequest;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'getToolbarSettings' });
      if (request !== settingsRequest) return;
      settings = result ?? { enabled: false, sites: [] };
      if (host?.isConnected) show();
      else scheduleShow();
    } catch {
      if (request !== settingsRequest) return;
      settings = { enabled: false, sites: [] };
      hide();
    }
  }

  document.addEventListener('selectionchange', scheduleShow);
  window.addEventListener('pointerdown', event => {
    if (event.composedPath().includes(host)) return;
    selecting = event.button === 0;
    hide();
  }, true);
  // ページや他の拡張機能がバブリングを止めても、選択終了を受け取る。
  window.addEventListener('pointerup', event => {
    selecting = false;
    if (event.button === 0 && !event.composedPath().includes(host)) scheduleShow();
  }, true);
  window.addEventListener('pointercancel', () => { selecting = false; hide(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, true);
  document.addEventListener('contextmenu', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', () => { selecting = false; hide(); });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && ['enabledSites', 'toolbarEnabled', 'jevEnabled', 'jevContext', 'jevApiKey', 'jevModel'].some(key => Object.hasOwn(changes, key))) {
      clearTimeout(recommendationTimer);
      selectionRevision++;
      void loadSettings();
    }
  });
  void loadSettings();
})();
