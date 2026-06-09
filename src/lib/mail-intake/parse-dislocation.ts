// Разбор пономерного списка вагонов из письма-дислокации (тело + таблицы вложений,
// уже сведённые в текст). PURE — без БД/IO, чтобы юнит-тест гонялся без окружения.
// Контрольная цифра 8-значного номера вагона (РЖД) отсекает случайные 8-значные
// последовательности (даты, суммы), оставляя реальные номера.

export interface WagonLine {
  number: string; // 8 цифр
  loaded: boolean | null; // гружёный (true) / порожний (false) / неизвестно (null)
}

export interface DislocationSummary {
  wagons: WagonLine[];
  total: number; // всего уникальных вагонов
  loaded: number; // гружёных (погружено)
  empty: number; // порожних
}

/** Контрольная цифра 8-значного номера вагона: веса 2,1,2,…; цифры произведения
 *  суммируются; контроль = (10 − сумма % 10) % 10. */
export function isValidWagonNumber(num: string): boolean {
  if (!/^\d{8}$/.test(num)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    const product = Number(num[i]) * (i % 2 === 0 ? 2 : 1);
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
  }
  const control = (10 - (sum % 10)) % 10;
  return control === Number(num[7]);
}

// «ВЫГРУЖЕН/РАЗГРУЖЕН» содержит подстроку «ГРУЖ» — проверяем ДО LOADED_RE,
// иначе выгруженный вагон считается гружёным. Выгружен = порожний (loaded=false).
const UNLOADED_RE = /(ВЫГРУЖ|РАЗГРУЖ)/i;
const LOADED_RE = /(ГРУЖ|ПОГРУЖ|ЗАГРУЖ|загруж|погруж|груж)/i;
const EMPTY_RE = /(ПОРОЖ|порож|\bПОР\b|\bпор\b)/i;
const MAX_LINES = 50_000; // защита от гигантских вставок

/**
 * Достаёт уникальные номера вагонов и считает гружёные/порожние по признакам в
 * строке (для табличных дислокаций — самый надёжный сигнал состояния).
 */
export function parseDislocation(text: string): DislocationSummary {
  const seen = new Map<string, WagonLine>();
  const lines = text.split(/\r?\n/).slice(0, MAX_LINES);

  for (const line of lines) {
    const tokens = line.match(/\d{8}/g);
    if (!tokens) continue;
    let loadedState: boolean | null = null;
    if (UNLOADED_RE.test(line) || EMPTY_RE.test(line)) loadedState = false;
    else if (LOADED_RE.test(line)) loadedState = true;

    for (const token of tokens) {
      if (!isValidWagonNumber(token) || seen.has(token)) continue;
      seen.set(token, { number: token, loaded: loadedState });
    }
  }

  const wagons = [...seen.values()];
  const loaded = wagons.filter((w) => w.loaded === true).length;
  const empty = wagons.filter((w) => w.loaded === false).length;
  return { wagons, total: wagons.length, loaded, empty };
}
