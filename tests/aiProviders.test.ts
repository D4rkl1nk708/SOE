import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callGeminiWithFallback,
  callOpenAi,
  callClaude,
  callAiProvider,
  testAiKey,
} from "../server/aiProviders";

describe("aiProviders", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("callGeminiWithFallback", () => {
    test("returns successful response on first try", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Gemini Success" }] } }],
        }),
      });

      const res = await callGeminiWithFallback("test-key", "Hello");
      expect(res).toBe("Gemini Success");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("falls back on 404 and throws if all fail", async () => {
      fetchMock.mockResolvedValue({
        status: 404,
        json: async () => ({
          error: { message: "Not found", status: "NOT_FOUND" },
        }),
      });

      await expect(callGeminiWithFallback("test-key", "Hello")).rejects.toThrow(
        "Nenhum modelo Gemini disponível",
      );
      // Should try multiple models
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    test("throws quota exceeded error immediately if true quota", async () => {
      fetchMock.mockResolvedValue({
        status: 429,
        json: async () => ({
          error: { message: "Quota exceeded for this key" },
        }),
      });

      await expect(callGeminiWithFallback("test-key", "Hello")).rejects.toThrow(
        "QUOTA_EXCEEDED",
      );
    });

    test("handles image payload", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Image seen" }] } }],
        }),
      });

      const res = await callGeminiWithFallback(
        "test-key",
        "Hello",
        1024,
        "data:image/png;base64,iVBORw0KGgo",
      );
      expect(res).toBe("Image seen");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.contents[0].parts[1].inlineData.mimeType).toBe(
        "image/png",
      );
    });
  });

  describe("callOpenAi", () => {
    test("returns successful response", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          choices: [{ message: { content: "OpenAI Success" } }],
        }),
      });

      const res = await callOpenAi("test-key", "Hello");
      expect(res).toBe("OpenAI Success");
    });

    test("handles errors", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({ error: { message: "OpenAI Error" } }),
      });

      await expect(callOpenAi("test-key", "Hello")).rejects.toThrow(
        "OpenAI Error",
      );
    });

    test("handles images", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          choices: [{ message: { content: "OpenAI image seen" } }],
        }),
      });

      await callOpenAi("test-key", "Hello", 1024, "data:image/jpeg;base64,abc");
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[1].type).toBe("image_url");
    });
  });

  describe("callClaude", () => {
    test("returns successful response", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          content: [{ text: "Claude Success" }],
        }),
      });

      const res = await callClaude("test-key", "Hello");
      expect(res).toBe("Claude Success");
    });

    test("handles errors", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({ error: { message: "Claude Error" } }),
      });

      await expect(callClaude("test-key", "Hello")).rejects.toThrow(
        "Claude Error",
      );
    });

    test("handles images", async () => {
      fetchMock.mockResolvedValueOnce({
        json: async () => ({
          content: [{ text: "Claude image seen" }],
        }),
      });

      await callClaude("test-key", "Hello", 1024, "data:image/png;base64,abc");
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.messages[0].content[0].type).toBe("image");
    });
  });

  describe("callAiProvider", () => {
    test("rotates keys on failure", async () => {
      fetchMock
        .mockResolvedValueOnce({
          status: 401,
          json: async () => ({ error: { message: "Invalid key" } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            choices: [{ message: { content: "Success on second key" } }],
          }),
        });

      const res = await callAiProvider("openai", "key1,key2", "Hello");
      expect(res).toBe("Success on second key");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("throws if all keys fail", async () => {
      fetchMock.mockResolvedValue({
        status: 401,
        json: async () => ({ error: { message: "Invalid key" } }),
      });

      await expect(
        callAiProvider("openai", "key1,key2", "Hello"),
      ).rejects.toThrow("Todas as 2 chaves falharam");
    });

    test("throws if unsupported provider", async () => {
      await expect(
        callAiProvider("unknown" as any, "key", "Hello"),
      ).rejects.toThrow("Provider não suportado");
    });
  });

  describe("testAiKey", () => {
    test("gemini models testing", async () => {
      fetchMock
        .mockResolvedValueOnce({
          json: async () => ({ error: { message: "Failed model 1" } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "Ok model 2" }] } }],
          }),
        })
        .mockResolvedValue({
          json: async () => ({ error: { message: "Failed rest" } }),
        });

      const res = await testAiKey("gemini", "key1");
      expect(res.success).toBe(true);
      expect(res.details[0].models.length).toBeGreaterThan(0);
    });

    test("openai mock test", async () => {
      const res = await testAiKey("openai", "key1,key2");
      expect(res.success).toBe(true);
      expect(res.details).toHaveLength(2);
      expect(res.details[0].models).toContain("Standard Model");
    });
  });
});
