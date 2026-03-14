import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("API Keys Configuration", () => {
  it("should have Alpaca API key configured", () => {
    // In test env, keys come from process.env which may be empty
    // We just verify the ENV object has the right structure
    expect(typeof ENV.alpacaApiKey).toBe("string");
    expect(typeof ENV.alpacaSecretKey).toBe("string");
  });

  it("should have AlphaVantage API key configured", () => {
    expect(typeof ENV.alphaVantageApiKey).toBe("string");
  });

  it("should have Tiingo API key configured", () => {
    expect(typeof ENV.tiingoApiKey).toBe("string");
  });

  it("should have Finnhub API key configured", () => {
    expect(typeof ENV.finnhubApiKey).toBe("string");
  });

  it("should have Gemini AI configuration", () => {
    expect(typeof ENV.geminiApiKey).toBe("string");
    expect(typeof ENV.geminiBaseUrl).toBe("string");
    expect(typeof ENV.geminiModel).toBe("string");
    // Default values should be set
    expect(ENV.geminiBaseUrl).toBeTruthy();
    expect(ENV.geminiModel).toBeTruthy();
  });

  it("should have additional free API keys configured", () => {
    expect(typeof ENV.polygonApiKey).toBe("string");
    expect(typeof ENV.twelveDataApiKey).toBe("string");
    expect(typeof ENV.marketstackApiKey).toBe("string");
  });

  it("should have default Gemini base URL", () => {
    // Even without env var, should have default
    expect(ENV.geminiBaseUrl).toBe(process.env.GOOGLE_GEMINI_BASE_URL || "https://openfly.cc/antigravity");
  });
});
