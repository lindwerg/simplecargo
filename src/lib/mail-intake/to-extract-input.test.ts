import { describe, expect, it } from "vitest";

import { decidePartCategory } from "./to-extract-input";

describe("decidePartCategory", () => {
  it("detects xlsx by mime and by extension", () => {
    expect(
      decidePartCategory("план.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("xlsx");
    expect(decidePartCategory("zayavka.XLS", "application/octet-stream")).toBe("xlsx");
  });

  it("detects pdf", () => {
    expect(decidePartCategory("schet.pdf", "application/pdf")).toBe("pdf");
    expect(decidePartCategory("СЧЁТ", "application/pdf")).toBe("pdf");
  });

  it("detects images", () => {
    expect(decidePartCategory("scan.png", "image/png")).toBe("image");
    expect(decidePartCategory("photo.jpeg", "image/jpeg")).toBe("image");
  });

  it("detects audio", () => {
    expect(decidePartCategory("voice.ogg", "audio/ogg")).toBe("audio");
    expect(decidePartCategory("vm.m4a", "application/octet-stream")).toBe("audio");
  });

  it("detects plain text / csv", () => {
    expect(decidePartCategory("note.txt", "text/plain")).toBe("text");
    expect(decidePartCategory("rows.csv", "text/csv")).toBe("text");
  });

  it("flags everything else as unsupported", () => {
    expect(decidePartCategory("archive.zip", "application/zip")).toBe("unsupported");
    expect(decidePartCategory("app.exe", "application/x-msdownload")).toBe("unsupported");
  });
});
