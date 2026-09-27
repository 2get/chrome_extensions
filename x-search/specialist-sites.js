export const SPECIALIST_SITES = [
  { id: 'mdn', name: 'MDN Web Docs', domain: 'developer.mozilla.org', description: 'HTML・CSS・JavaScript・Web APIの仕様と使い方' },
  { id: 'github', name: 'GitHub', domain: 'github.com', description: 'ソフトウェアのソースコード、不具合報告、Issues' },
  { id: 'python', name: 'Python公式', domain: 'docs.python.org', description: 'Python言語・標準ライブラリの公式ドキュメント' },
  { id: 'microsoft', name: 'Microsoft Learn', domain: 'learn.microsoft.com', description: 'Windows・Azure・.NETなどMicrosoft製品の技術資料' },
  { id: 'apple', name: 'Appleサポート', domain: 'support.apple.com', description: 'iPhone・MacなどApple製品の使い方とトラブル解決' },
  { id: 'sony', name: 'ソニーサポート', domain: 'sony.jp', description: 'ソニー製品の型番、取扱説明書、サポート情報' },
  { id: 'jstage', name: 'J-STAGE', domain: 'jstage.jst.go.jp', description: '日本の学協会が発行する論文・学術誌' },
  { id: 'arxiv', name: 'arXiv', domain: 'arxiv.org', description: '数学・物理・計算機科学などの研究論文・プレプリント' },
  { id: 'ndl', name: '国立国会図書館サーチ', domain: 'ndlsearch.ndl.go.jp', description: '本の書誌情報、著者、出版情報、図書館の所蔵' },
  { id: 'kotobank', name: 'コトバンク', domain: 'kotobank.jp', description: '日本語の用語・歴史・人物などの辞典解説' },
  { id: 'kakaku', name: '価格.com', domain: 'kakaku.com', description: '家電・パソコンなど具体的な商品の価格比較とレビュー' },
  { id: 'cookpad', name: 'クックパッド', domain: 'cookpad.com', description: '食材・料理名から調理方法やレシピを探す' },
];

export function buildSpecialistUrl(site, query) {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${site.domain} ${query.trim()}`)}`;
}
