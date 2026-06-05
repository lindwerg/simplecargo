import { describe, expect, it } from "vitest";

import { buildExtractionMessages, parseAudioDataUrl, SYSTEM_PROMPT } from "./prompt";

describe("buildExtractionMessages", () => {
  it("text modality returns a string user content with table hint when isTable", () => {
    const msgs = buildExtractionMessages("text", { text: "ст.погрузки...", isTable: true, clientHint: "ЦемТрейд" });
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe(SYSTEM_PROMPT);
    expect(typeof msgs[1].content).toBe("string");
    expect(msgs[1].content as string).toContain("ТАБЛИЦА");
    expect(msgs[1].content as string).toContain("ЦемТрейд");
  });

  it("image modality emits an image_url content part", () => {
    const msgs = buildExtractionMessages("image", { imageDataUrl: "data:image/png;base64,AAAA" });
    const parts = msgs[1].content;
    expect(Array.isArray(parts)).toBe(true);
    if (Array.isArray(parts)) {
      expect(parts.some((p) => p.type === "image_url")).toBe(true);
    }
  });

  it("audio modality emits an input_audio part with derived format", () => {
    const msgs = buildExtractionMessages("audio", { audioDataUrl: "data:audio/webm;base64,AAAA" });
    const parts = msgs[1].content;
    if (Array.isArray(parts)) {
      const audio = parts.find((p) => p.type === "input_audio");
      expect(audio).toBeTruthy();
      if (audio && audio.type === "input_audio") expect(audio.input_audio.format).toBe("webm");
    }
  });

  it("parseAudioDataUrl maps mpeg→mp3 and extracts base64", () => {
    expect(parseAudioDataUrl("data:audio/mpeg;base64,ZZZ")).toEqual({ data: "ZZZ", format: "mp3" });
    expect(parseAudioDataUrl("data:audio/wav;base64,WWW")).toEqual({ data: "WWW", format: "wav" });
  });
});
