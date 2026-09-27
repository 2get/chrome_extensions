// 原文内の語句をローカルで抽出する。ネットワークに送る上限とは分ける。
export const MAX_QUERY_SELECTION = 2000;
const GENERIC = /^(?:昨日|今日|明日|今回|最近|現在|自分|私|購入|設定|方法|使用|利用|確認|問題|場合|情報|記事|説明|結果|検索|製品|商品|交換|考|調|レビュー|サポート|サービス|クリック|ページ|サイト|テキスト|内容|以上|以下|必要|可能|対応|原因|時間|日本語|発表|話題|開催|表示|イベント|研究チーム|研究)$/u;
export function extractSearchQueries(value, maxLength = MAX_QUERY_SELECTION) {
  const text = Array.from(typeof value === 'string' ? value.trim() : '').slice(0, maxLength).join('');
  if (Array.from(text).length < 20) return [];
  const candidates = new Map();
  const words = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)];
  const add = (value, priority) => {
    let query = value.trim();
    if (priority <= 6) {
      const end = text.indexOf(query) + query.length;
      const word = words.find(word => word.index < end && (word.index + word.segment.length > end
        || (word.index + word.segment.length === end && text[end] === 'っ')));
      // 「途切れる」の「途切」など、活用語の途中で切った候補を除く。
      if (word && (/[ぁ-ん]/u.test(word.segment) || text[end] === 'っ')) query = query.slice(0, Math.max(0, word.index - text.indexOf(query)));
    }
    const length = Array.from(query).length;
    if (length < 2 || length > 80 || query === text || !text.includes(query)
        || GENERIC.test(query) || /^\d+[年月日時分秒個件円%]?$/u.test(query)) return;
    const score = priority + Math.min(length, 20) / 20;
    if (!candidates.has(query) || candidates.get(query) < score) candidates.set(query, score);
  };
  for (const match of text.matchAll(/[「『“"]([^「」『』“”"\n]{2,80})[」』”"]/gu)) add(match[1], 8);
  // 空白を含む英語名、型番、エラー文を壊さない。
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9._+:/-]*(?:[ \t]+[A-Za-z0-9][A-Za-z0-9._+:/-]*){0,7}/g)) {
    const query = match[0];
    if (/^(?:the|this|that|and|with|from|have|was|for|to|is|it)$/i.test(query)) continue;
    add(query, /\d|error|exception|failed/i.test(query) ? 7 : 5);
  }
  // 漢字とカタカナの混合語を分割しない（例: 量子コンピューター）。
  for (const match of text.matchAll(/[\p{Script=Han}ァ-ヶーA-Za-z0-9][\p{Script=Han}ァ-ヶーA-Za-z0-9・._+-]+/gu)) {
    add(match[0], /[ァ-ヶ]/u.test(match[0]) && /\p{Script=Han}/u.test(match[0]) ? 6 : /[ァ-ヶ]/u.test(match[0]) ? 5 : match[0].length >= 4 ? 5.5 : 3);
  }
  // 同じ語が長文内で繰り返される場合も優先する。
  return [...candidates].map(([query, score]) => ({ query, score: score + Math.min(text.split(query).length - 2, 3) * .5 }))
    .sort((a, b) => b.score - a.score)
    .filter((item, index, ranked) => !ranked.slice(0, index).some(other => other.query.includes(item.query)))
    .slice(0, 24).map(item => item.query);
}
