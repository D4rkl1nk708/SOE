/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import axios from "axios";
import fs from "fs";
import tecProxy from "../server/tecProxy";

vi.mock("axios");

describe("tecProxy detailed coverage", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/tec-browser", tecProxy);
    vi.mocked(axios).mockReset();
  });

  it("should cover path resolution and circular loop", async () => {
    vi.mocked(axios).mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/png" },
      data: Buffer.from("img"),
    });
    await request(app).get("/api/tec-browser/cdn/test.png");
    await request(app).get("/api/tec-browser/proxy?url=www.google.com");
    await request(app).get("/api/tec-browser/api/tec-browser");
  });

  it("should cover POST data, validateStatus and cookie sanitization branches", async () => {
    vi.mocked(axios).mockResolvedValue({
      status: 404,
      headers: {
        "set-cookie": ["id=1; Domain=tec.com; Secure; SameSite=Strict"], // Covers lines 59, 60, 61
      },
      data: Buffer.from(""),
    });

    const res = await request(app)
      .post("/api/tec-browser/login")
      .send({ x: 1 });
    const postCall = vi
      .mocked(axios)
      .mock.calls.find((c) => (c[0] as any).method === "POST");
    expect((postCall![0] as any).validateStatus(404)).toBe(true);

    const cookies = res.headers["set-cookie"][0];
    expect(cookies).not.toContain("Domain=");
    expect(cookies).not.toContain("Secure");
    expect(cookies).toContain("SameSite=Lax");
  });

  it("should cover body-only injection and head injection", async () => {
    // 1. Head injection
    vi.mocked(axios).mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "text/html" },
      data: Buffer.from("<html><head></head><body></body></html>"),
    });
    await request(app).get("/api/tec-browser/");

    // 2. Body injection (Line 228)
    vi.mocked(axios).mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "text/html" },
      data: Buffer.from("<html><body>Content</body></html>"), // No <head>
    });
    const res = await request(app).get("/api/tec-browser/");
    expect(res.text).toContain("__SOE_PROXY__");
  });

  it("should handle error cases (HTML vs non-HTML)", async () => {
    vi.mocked(axios).mockRejectedValue(new Error("Fail"));

    // 1. HTML error (Line 277)
    await request(app).get("/api/tec-browser/").set("Accept", "text/html");

    // 2. Non-HTML error (Line 293)
    const res = await request(app).get("/api/tec-browser/api/json");
    expect(res.status).toBe(500);
    expect(res.text).toBe("Fail");
  });

  it("should cover script read failure (Line 52)", async () => {
    vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
      throw new Error("fail");
    });
    vi.mocked(axios).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: Buffer.from("<html><head></head></html>"),
    });
    await request(app).get("/api/tec-browser/");
  });

  it("should cover targetUrl without leading slash", async () => {
    vi.mocked(axios).mockResolvedValue({
      status: 200,
      headers: {},
      data: Buffer.from(""),
    });
    await request(app).get("/api/tec-browser/proxy?url=testpath");
  });

  it("should cover HTML injection when no head or body tags exist", async () => {
    vi.mocked(axios).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: Buffer.from("Just raw text content"),
    });
    const res = await request(app).get("/api/tec-browser/");
    expect(res.text).toContain("__SOE_PROXY__");
    expect(res.text).toContain("Just raw text content");
  });

  it("should cover CSS content type rewriting", async () => {
    vi.mocked(axios).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/css" },
      data: Buffer.from(
        "body { background: url('https://cdn.tecconcursos.com.br/img.png'); }",
      ),
    });
    const res = await request(app).get("/api/tec-browser/style.css");
    expect(res.text).toContain("/api/tec-browser/cdn/img.png");
  });

  it("should cover redirect handling", async () => {
    // Redirect to relative url
    vi.mocked(axios).mockResolvedValueOnce({
      status: 302,
      headers: { location: "/login" },
      data: Buffer.from(""),
    });
    const res1 = await request(app).get("/api/tec-browser/questoes");
    expect(res1.status).toBe(302);
    expect(res1.headers.location).toContain("/api/tec-browser/proxy?url=");

    // Redirect to external URL not in tec
    vi.mocked(axios).mockResolvedValueOnce({
      status: 301,
      headers: { location: "https://www.google.com" },
      data: Buffer.from(""),
    });
    const res2 = await request(app).get("/api/tec-browser/questoes");
    expect(res2.status).toBe(302); // express res.redirect uses 302
    expect(res2.headers.location).toBe("https://www.google.com");
  });
});
