// Jevは目的の適合度だけを判定し、表示文言・検索先・追加語は拡張側で固定する。
export const SEARCH_PURPOSES = [
  { id: 'compare', label: '価格を比べる', siteId: 'searchGoogle', suffix: '価格 比較', description: '購入できる具体的な商品・型番の価格を比較したい' },
  { id: 'review', label: 'レビューを見る', siteId: 'searchGoogle', suffix: 'レビュー', description: '商品や作品の使用感・評価を知りたい' },
  { id: 'howto', label: '使い方を見る', siteId: 'searchYouTube', suffix: '使い方', description: '製品や道具・ソフトの操作手順を動画で知りたい' },
  { id: 'map', label: '地図で見る', siteId: 'searchMaps', suffix: '', description: '実在する店・施設・地名・住所の場所を知りたい' },
  { id: 'reputation', label: '口コミを見る', siteId: 'searchGoogle', suffix: '口コミ', description: '店・施設・サービスの利用者の評判を知りたい' },
  { id: 'solve', label: '解決方法を探す', siteId: 'searchGoogle', suffix: '解決方法', description: 'エラーメッセージや具体的な不具合・困りごとの対処を調べたい' },
  { id: 'meaning', label: '意味を調べる', siteId: 'searchGoogle', suffix: '意味', description: '理解したい専門用語・略語・知らない言葉の意味を調べたい' },
];

export function getSearchPurposes(sites) {
  return SEARCH_PURPOSES.filter(purpose => sites.some(site => site.id === purpose.siteId));
}

export function buildPurposeQuery(purpose, selectionText) {
  return [selectionText.trim(), purpose.suffix].filter(Boolean).join(' ');
}
