/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractJSON, callAiProvider } from "../client/src/lib/aiHelpers";

describe("aiHelpers - extractJSON", () => {
  it("should extract JSON from markdown blocks", () => {
    const text = 'Aqui está o JSON: ```json\n{"id": 1}\n```';
    expect(extractJSON(text)).toEqual({ id: 1 });
  });

  it("should handle truncated JSON", () => {
    const text = '{"id": 1, "name": "Trunc';
    // Should recover to {"id": 1} or similar depending on the logic
    const result = extractJSON(text);
    expect(result).toHaveProperty("id", 1);
  });
});

describe("aiHelpers - callAiProvider Rotation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("should rotate keys on quota error", async () => {
    const mockFetch = vi.mocked(fetch);

    // First call fails with quota
    mockFetch.mockResolvedValueOnce({
      status: 429,
      json: async () => ({ error: { message: "Quota exceeded" } }),
    } as Response);

    // Second call succeeds
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Success" }] } }],
      }),
    } as Response);

    const result = await callAiProvider("gemini", "key1, key2", "prompt");
    expect(result).toBe("Success");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should fail if all keys fail", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      status: 401,
      json: async () => ({ error: { message: "Invalid key" } }),
    } as Response);

    await expect(
      callAiProvider("gemini", "key1, key2", "prompt"),
    ).rejects.toThrow("Todas as 2 chaves falharam");
  });
});
