// Короткий сниппет тела письма для списка «Входящих». PURE — без БД/IO, чтобы и
// воркер (на приёме), и бэкофилл-скрипт считали его одинаково.

const SNIPPET_MAX = 200;

/** Убрать HTML-теги и схлопнуть пробелы — грубый text/plain из HTML-тела. */
function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Сниппет из тела письма: предпочитаем text/plain, иначе вычищаем HTML.
 * Возвращает null, если оба пустые. Обрезает до ~200 символов по границе слова.
 */
export function makeSnippet(text: string | null | undefined, html?: string | null): string | null {
  const sourceRaw = text && text.trim().length > 0 ? text : html ? stripHtml(html) : "";
  const collapsed = sourceRaw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length <= SNIPPET_MAX) return collapsed;

  const slice = collapsed.slice(0, SNIPPET_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > SNIPPET_MAX * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
