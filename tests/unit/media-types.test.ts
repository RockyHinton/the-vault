import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  detectMediaType,
  isInlineSafe,
  sanitiseFilename,
} from "../../server/modules/files/media-types";

const head = (bytes: number[] | string) =>
  typeof bytes === "string"
    ? Buffer.from(bytes.padEnd(16, "x"), "latin1")
    : Buffer.from([...bytes, ...new Array(16 - bytes.length).fill(0x20)]);

describe("media type detection", () => {
  it("classifies by signature, not by the declared name", () => {
    expect(detectMediaType(head("%PDF-1.7"), "anything.exe")).toBe(
      "application/pdf",
    );
    expect(detectMediaType(head([0x89, 0x50, 0x4e, 0x47]), "photo")).toBe(
      "image/png",
    );
    expect(detectMediaType(head([0xff, 0xd8, 0xff, 0xe0]), "x.jpg")).toBe(
      "image/jpeg",
    );
    expect(detectMediaType(head("GIF89a"), "x.gif")).toBe("image/gif");
  });

  it("accepts zip containers only as the Office formats their extension claims", () => {
    expect(
      detectMediaType(head([0x50, 0x4b, 0x03, 0x04]), "deck.docx"),
    ).toContain("wordprocessingml");
    expect(
      detectMediaType(head([0x50, 0x4b, 0x03, 0x04]), "sheet.xlsx"),
    ).toContain("spreadsheetml");
    expect(
      detectMediaType(head([0x50, 0x4b, 0x03, 0x04]), "archive.zip"),
    ).toBeUndefined();
    expect(
      detectMediaType(head([0x50, 0x4b, 0x03, 0x04]), "payload.exe"),
    ).toBeUndefined();
  });

  it("accepts text formats by extension when the bytes look like text, and refuses binaries", () => {
    expect(detectMediaType(head("Hello, world"), "notes.txt")).toBe(
      "text/plain",
    );
    expect(detectMediaType(head("a,b,c\n1,2,3"), "data.csv")).toBe("text/csv");
    expect(detectMediaType(head('<?xml version="1.0"?>'), "script.fdx")).toBe(
      "application/xml",
    );
    expect(detectMediaType(head("Hello"), "notes.html")).toBeUndefined();
    expect(
      detectMediaType(head([0x4d, 0x5a, 0x90, 0x00]), "setup.txt"),
    ).toBeUndefined();
  });

  it("marks only PDFs and images as safe to render inline", () => {
    expect(isInlineSafe("application/pdf")).toBe(true);
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("text/plain")).toBe(false);
    expect(isInlineSafe("application/xml")).toBe(false);
  });
});

describe("filename handling", () => {
  it("strips directories, control characters and overlong names", () => {
    expect(sanitiseFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitiseFilename("C:\\Users\\me\\Deal Memo.pdf")).toBe(
      "Deal Memo.pdf",
    );
    expect(sanitiseFilename("bad\u0000name\n.pdf")).toBe("badname.pdf");
    expect(sanitiseFilename("..")).toBe("upload");
    expect(sanitiseFilename(undefined)).toBe("upload");
    const long = sanitiseFilename("a".repeat(300) + ".pdf");
    expect(long).toHaveLength(255);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("builds a Content-Disposition with an ASCII fallback and a UTF-8 name", () => {
    const header = contentDisposition("attachment", 'Résumé "final".pdf');
    expect(header).toMatch(
      /^attachment; filename="R_sum_ _final_.pdf"; filename\*=UTF-8''/,
    );
    expect(header).toContain(encodeURIComponent('Résumé "final".pdf'));
  });
});
