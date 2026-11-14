import { doclingEnabled, doclingParsePdf } from "../docling-client";

describe("docling-client", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("disabled without NOMOSX_DOCLING=1", () => {
    process.env.QUANT_SERVICE_URL = "https://quant.example.com";
    delete process.env.NOMOSX_DOCLING;
    expect(doclingEnabled()).toBe(false);
  });

  it("disabled without QUANT_SERVICE_URL even when opted in", () => {
    process.env.NOMOSX_DOCLING = "1";
    delete process.env.QUANT_SERVICE_URL;
    expect(doclingEnabled()).toBe(false);
  });

  it("enabled only with both env vars", () => {
    process.env.NOMOSX_DOCLING = "1";
    process.env.QUANT_SERVICE_URL = "https://quant.example.com/";
    expect(doclingEnabled()).toBe(true);
  });

  it("doclingParsePdf returns null when disabled (no network call)", async () => {
    delete process.env.NOMOSX_DOCLING;
    process.env.QUANT_SERVICE_URL = "https://quant.example.com";
    await expect(doclingParsePdf("https://x.test/a.pdf")).resolves.toBeNull();
  });
});
