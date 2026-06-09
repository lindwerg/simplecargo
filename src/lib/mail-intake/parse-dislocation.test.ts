import { describe, expect, it } from "vitest";

import { isValidWagonNumber, parseDislocation } from "./parse-dislocation";

// Валидные номера (контрольная цифра сходится), посчитаны по алгоритму РЖД.
const VALID_A = "52345675";
const VALID_B = "60112349";

describe("isValidWagonNumber", () => {
  it("принимает номера с верной контрольной цифрой", () => {
    expect(isValidWagonNumber(VALID_A)).toBe(true);
    expect(isValidWagonNumber(VALID_B)).toBe(true);
  });

  it("отвергает неверную контрольную цифру", () => {
    expect(isValidWagonNumber("52345670")).toBe(false);
  });

  it("отвергает не 8-значные строки", () => {
    expect(isValidWagonNumber("1234567")).toBe(false);
    expect(isValidWagonNumber("123456789")).toBe(false);
    expect(isValidWagonNumber("abcdefgh")).toBe(false);
  });
});

describe("parseDislocation", () => {
  it("достаёт уникальные вагоны и считает гружёные/порожние", () => {
    const text = [
      `${VALID_A}  ст. Кузнецк  ГРУЖ  щебень`,
      `${VALID_B}  ст. Инская   ПОРОЖ`,
      `99999999  мусорная строка`, // невалидная контрольная цифра — отсекается
      `${VALID_A}  дубликат строки  ГРУЖ`, // дубль номера — не считаем дважды
    ].join("\n");

    const s = parseDislocation(text);
    expect(s.total).toBe(2);
    expect(s.loaded).toBe(1);
    expect(s.empty).toBe(1);
    expect(s.wagons.map((w) => w.number).sort()).toEqual([VALID_A, VALID_B].sort());
  });

  it("«ВЫГРУЖЕН» — порожний, а не гружёный (подстрока ГРУЖ не должна ловиться)", () => {
    const s = parseDislocation(`${VALID_A}  ст. Дёма  ВЫГРУЖЕН`);
    expect(s.total).toBe(1);
    expect(s.wagons[0].loaded).toBe(false);
    expect(s.loaded).toBe(0);
    expect(s.empty).toBe(1);
  });

  it("«ВЫГРУЖЕНА НА ПП» и «РАЗГРУЖЕН» — тоже порожние", () => {
    const s = parseDislocation(
      [`${VALID_A}  ВЫГРУЖЕНА НА ПП`, `${VALID_B}  РАЗГРУЖЕН на станции`].join("\n"),
    );
    expect(s.total).toBe(2);
    expect(s.loaded).toBe(0);
    expect(s.empty).toBe(2);
  });

  it("помечает состояние null, когда в строке нет признака гружёный/порожний", () => {
    const s = parseDislocation(`${VALID_A}  ст. Кузнецк  прибытие`);
    expect(s.total).toBe(1);
    expect(s.wagons[0].loaded).toBeNull();
    expect(s.loaded).toBe(0);
    expect(s.empty).toBe(0);
  });

  it("возвращает пустую сводку, когда вагонов нет", () => {
    expect(parseDislocation("просто текст без номеров")).toEqual({
      wagons: [],
      total: 0,
      loaded: 0,
      empty: 0,
    });
  });
});
