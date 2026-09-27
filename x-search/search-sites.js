export const SEARCH_SITES = [
  { id: 'searchGoogle', name: 'Google', description: 'Web全体から情報を探す', url: 'https://www.google.com/search?q=' },
  { id: 'searchX', name: 'X', description: '話題やリアルタイムの評判を探す', url: 'https://x.com/search?q=' },
  { id: 'searchAmazon', name: 'Amazon.co.jp', description: '商品やレビューを探す', url: 'https://www.amazon.co.jp/s?k=' },
  { id: 'searchRakuten', name: '楽天市場', description: '商品を探して価格を比較する', url: 'https://search.rakuten.co.jp/search/mall/', suffix: '/' },
  { id: 'searchYahoo', name: 'Yahoo!ショッピング', description: 'ショップや販売価格を比較する', url: 'https://shopping.yahoo.co.jp/search?p=' },
  { id: 'searchMercari', name: 'メルカリ', description: '中古品・フリマ出品や商品の相場を探す', url: 'https://jp.mercari.com/search?keyword=' },
  { id: 'searchYouTube', name: 'YouTube', description: 'レビュー動画や使い方を探す', url: 'https://www.youtube.com/results?search_query=' },
  { id: 'searchMaps', name: 'Googleマップ', description: '店名や住所から場所を探す', url: 'https://www.google.com/maps/search/?api=1&query=' },
];

export function getEnabledSiteIds(savedIds) {
  return SEARCH_SITES
    .filter(site => !Array.isArray(savedIds) || savedIds.includes(site.id))
    .map(site => site.id);
}

export function buildSearchUrl(site, query) {
  return `${site.url}${encodeURIComponent(query.trim())}${site.suffix ?? ''}`;
}
