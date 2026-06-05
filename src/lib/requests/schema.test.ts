import { describe, expect, it } from "vitest";

import {
  extractInputSchema,
  extractionResultSchema,
  linkClientSchema,
  requestCreateSchema,
  requestLineInputSchema,
  requestTransitionSchema,
} from "./schema";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("request schemas", () => {
  it("parses a valid create payload and defaults channel to manual", () => {
    const parsed = requestCreateSchema.parse({
      clientRaw: "ЦемТрейд (новый)",
      lines: [{ originRaw: "Асбест", destRaw: "Голышманово", wagonsRequested: 40 }],
    });
    expect(parsed.channel).toBe("manual");
    expect(parsed.lines).toHaveLength(1);
  });

  it("rejects a line with zero wagons", () => {
    expect(() =>
      requestLineInputSchema.parse({ originRaw: "А", destRaw: "Б", wagonsRequested: 0 }),
    ).toThrow();
  });

  it("rejects a line without origin", () => {
    expect(() =>
      requestLineInputSchema.parse({ destRaw: "Б", wagonsRequested: 5 }),
    ).toThrow();
  });

  it("rejects a create payload with no lines", () => {
    expect(() => requestCreateSchema.parse({ lines: [] })).toThrow();
  });

  it("rejects an invalid transition target", () => {
    expect(() => requestTransitionSchema.parse({ to: "nonsense" })).toThrow();
    expect(requestTransitionSchema.parse({ to: "sourcing" }).to).toBe("sourcing");
  });

  it("accepts link-client by id or by name, rejects empty", () => {
    expect(linkClientSchema.parse({ counterparty: { id: VALID_UUID } })).toBeTruthy();
    expect(linkClientSchema.parse({ counterparty: { name: "Ураласбест" } })).toBeTruthy();
    expect(() => linkClientSchema.parse({ counterparty: {} })).toThrow();
  });

  it("extractionResultSchema fills nullable defaults", () => {
    const r = extractionResultSchema.parse({ lines: [{ originRaw: "А", destRaw: "Б", wagonsRequested: 10 }] });
    expect(r.clientGuess).toBeNull();
    expect(r.warnings).toEqual([]);
    expect(r.lines[0].cargoName).toBeNull();
  });

  it("extractInputSchema discriminates modalities", () => {
    expect(extractInputSchema.parse({ modality: "text", text: "дай вагоны" }).modality).toBe("text");
    expect(() => extractInputSchema.parse({ modality: "image", dataUrl: "not-a-data-url" })).toThrow();
    expect(
      extractInputSchema.parse({ modality: "image", dataUrl: "data:image/png;base64,AAAA" }).modality,
    ).toBe("image");
  });
});
