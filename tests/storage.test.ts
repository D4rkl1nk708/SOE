/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockEnv = {
  forgeApiUrl: "http://mock-api.com",
  forgeApiKey: "mock-key",
};

vi.mock("../server/_core/env", () => ({
  get ENV() {
    return mockEnv;
  },
}));

import { storagePut, storageGet } from "../server/storage";

describe("storage helper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockEnv.forgeApiUrl = "http://mock-api.com";
    mockEnv.forgeApiKey = "mock-key";
  });

  it("should throw if config is missing (line 13 coverage)", async () => {
    mockEnv.forgeApiUrl = "";
    await expect(storagePut("a", "b")).rejects.toThrow(
      "Storage proxy credentials missing",
    );

    mockEnv.forgeApiUrl = "http://mock-api.com";
    mockEnv.forgeApiKey = "";
    await expect(storagePut("a", "b")).rejects.toThrow(
      "Storage proxy credentials missing",
    );
  });

  it("storagePut should upload file and return url", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://download.com/file.txt" }),
    } as Response);

    const result = await storagePut("test/file.txt", "content", "text/plain");
    expect(result.url).toBe("http://download.com/file.txt");
    expect(result.key).toBe("test/file.txt");
  });

  it("storageGet should return download url", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://download.com/signed-url" }),
    } as Response);

    const result = await storageGet("test/file.txt");
    expect(result.url).toBe("http://download.com/signed-url");
    expect(result.key).toBe("test/file.txt");
  });

  it("should handle buffer and Uint8Array data (line 60 coverage)", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "u" }),
    } as Response);

    await storagePut("b.bin", Buffer.from("data"));
    await storagePut("u.bin", new Uint8Array([1, 2, 3]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should handle failure with text/statusText (line 86 coverage)", async () => {
    const mockFetch = vi.mocked(fetch);
    // Case 1: has text()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Err",
      text: async () => "Internal Server Error",
    } as Response);

    await expect(storagePut("err.txt", "d")).rejects.toThrow(
      "Internal Server Error",
    );

    // Case 2: text() fails, uses statusText
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "CriticalFailure",
      text: async () => {
        throw new Error("No text");
      },
    } as Response);

    await expect(storagePut("err.txt", "d")).rejects.toThrow("CriticalFailure");
  });
});
