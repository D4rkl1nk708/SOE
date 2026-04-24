import { Router } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";

const router = Router();

// ── Headers de segurança que DEVEM ser removidos para o proxy funcionar ──────
// O TEC envia esses headers que impedem a exibição em iframe e bloqueiam scripts.
const BLOCKED_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "x-xss-protection",
  "strict-transport-security",
  "x-content-type-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "report-to",
  "nel",
];

// ── Cache do script de rastreio para performance ──────────────────────────────
let cachedScript: string | null = null;
const getTecScript = (): string => {
  if (cachedScript) return cachedScript;
  try {
    const scriptPath = path.join(process.cwd(), "electron", "tec-content.js");
    const content = fs.readFileSync(scriptPath, "utf8");

    // Wrapper que propaga postMessage para o frame pai (necessário para o SOE capturar eventos)
    cachedScript =
      "(function() {\n" +
      "const _postMessage = window.postMessage;\n" +
      "window.postMessage = function(data, targetOrigin) {\n" +
      "    if (data && data._soe_internal) {\n" +
      "        if (window.parent && window.parent !== window) {\n" +
      "            try { window.parent.postMessage(data, '*'); } catch(e) {}\n" +
      "        }\n" +
      "        if (window.top && window.top !== window) {\n" +
      "            try { window.top.postMessage(data, '*'); } catch(e) {}\n" +
      "        }\n" +
      "    }\n" +
      "    return _postMessage.apply(this, arguments);\n" +
      "};\n" +
      content +
      "\n})();";
    return cachedScript;
  } catch (e) {
    return "";
  }
};

// ── Sanitiza cookies recebidos do TEC para funcionar no contexto do proxy ─────
// Remove flags Secure/SameSite que bloqueiam cookies via HTTP local
const sanitizeCookies = (cookies: string[]): string[] => {
  return cookies.map(
    (cookie) =>
      cookie
        .replace(/;\s*Secure/gi, "")
        .replace(/;\s*SameSite=(Strict|Lax|None)/gi, "; SameSite=Lax")
        .replace(/;\s*Domain=[^;]*/gi, ""), // Remove Domain para não conflitar com localhost
  );
};

router.all("*", async (req: any, res: any) => {
  let targetUrl = req.query.url as string;

  // ── Resolução da URL de destino ────────────────────────────────────────────
  // Se não há ?url=, trata o path como caminho relativo no TEC
  if (!targetUrl) {
    const relativePath = req.path;

    if (relativePath.startsWith("/cdn/")) {
      targetUrl = "https://cdn.tecconcursos.com.br" + relativePath.substring(4);
    } else {
      targetUrl = "https://www.tecconcursos.com.br" + (relativePath || "/");
    }

    // Repassa todos os query params exceto 'url'
    const query = { ...req.query };
    delete query.url;
    const qs = new URLSearchParams(query as any).toString();
    if (qs) targetUrl += "?" + qs;
  }

  // Garante protocolo correto
  if (!targetUrl.startsWith("http")) {
    targetUrl =
      "https://www.tecconcursos.com.br" +
      (targetUrl.startsWith("/") ? "" : "/") +
      targetUrl;
  }

  // Evita loops circulares
  if (targetUrl.includes("/api/tec-browser")) {
    targetUrl = "https://www.tecconcursos.com.br/questoes";
  }

  // console.log(`[TEC Proxy] [${req.method}] -> ${targetUrl}`);

  try {
    const clientCookies = req.headers.cookie || "";

    const headers: any = {
      "User-Agent":
        req.headers["user-agent"] ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: req.headers.accept || "text/html,*/*",
      "Accept-Language": req.headers["accept-language"] || "pt-BR,pt;q=0.9",
      Referer: targetUrl, // Dinâmico para não quebrar login
      Cookie: clientCookies,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    };

    // Adiciona Origin para POST/PUT/DELETE
    if (req.method !== "GET" && req.method !== "HEAD") {
      headers["Origin"] = "https://www.tecconcursos.com.br";
    }

    // Sem compressão: simplifica o processamento do corpo HTML
    delete headers["accept-encoding"];

    const axiosConfig: any = {
      method: req.method,
      url: targetUrl,
      headers,
      timeout: 35000,
      responseType: "arraybuffer",
      maxRedirects: 0, // CRITICAL: let the browser handle redirects to save cookies
      validateStatus: () => true,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      axiosConfig.data = req.body;
      if (req.headers["content-type"]) {
        axiosConfig.headers["Content-Type"] = req.headers["content-type"];
      }
    }

    const response = await axios(axiosConfig);

    // ── Remove headers que bloqueiam iframe/scripts ────────────────────────
    for (const h of BLOCKED_RESPONSE_HEADERS) {
      res.removeHeader(h);
    }
    // Garante que o Express não adicione automaticamente
    response.headers["content-security-policy"] = undefined;
    response.headers["x-frame-options"] = undefined;

    // ── Tratamento da Resposta ──────────────────────────────────────────────
    res.status(response.status);

    // Repassamos cabeçalhos permitidos
    Object.keys(response.headers).forEach((key) => {
      if (!BLOCKED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key]);
      }
    });

    // ── Tratamento de Cookies ──────────────────────────────────────────────
    let tecCookies = response.headers["set-cookie"];
    if (tecCookies) {
      if (typeof tecCookies === "string") tecCookies = [tecCookies];
      const modifiedCookies = tecCookies.map((c) =>
        c
          .replace(/Domain=[^;]+/gi, "") // Remove domínio original
          .replace(/Secure/gi, "") // Remove Secure
          .replace(/SameSite=[^;]+/gi, "SameSite=Lax"),
      );
      res.setHeader("set-cookie", modifiedCookies);
    }

    // ── Redirecionamento ────────────────────────────────────────────────────
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.location
    ) {
      let redirectUrl = response.headers.location;
      if (!redirectUrl.startsWith("http")) {
        redirectUrl = new URL(redirectUrl, "https://www.tecconcursos.com.br")
          .href;
      }

      if (redirectUrl.includes("tecconcursos.com.br")) {
        // Mantém no proxy
        redirectUrl = `/api/tec-browser/proxy?url=${encodeURIComponent(redirectUrl)}`;
      }
      return res.redirect(redirectUrl);
    }

    let body = Buffer.from(response.data);
    const contentType = String(
      response.headers["content-type"] || "",
    ).toLowerCase();

    // ── Injeção e Reescrita (HTML e CSS) ───────────────────────────────────
    if (contentType.includes("text/html")) {
      let html = body.toString("utf8");

      // Script de ponte SOE
      const tecScript = getTecScript();
      const bridgeScript =
        "<script>" +
        "(function(){" +
        "window.__SOE_PROXY__=true;" +
        "var opm=window.postMessage;" +
        "window.postMessage=function(d,t){" +
        "if(d&&d._soe_internal){" +
        "if(window.parent!==window){try{window.parent.postMessage(d,'*');}catch(e){}}" +
        "if(window.top!==window){try{window.top.postMessage(d,'*');}catch(e){}}" +
        "}" +
        "return opm.apply(window,arguments);" +
        "};" +
        "})();" +
        "</script>" +
        (tecScript ? "<script>" + tecScript + "</script>" : "");

      // Injeta logo após abertura do <head>
      if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head([\s>])/i, "<head$1" + bridgeScript);
      } else if (/<body[\s>]/i.test(html)) {
        html = html.replace(/<body([\s>])/i, "<body$1" + bridgeScript);
      } else {
        html = bridgeScript + html;
      }

      // Reescrita de links para manter no proxy
      // 1. URLs absolutas do TEC e do CDN
      html = html.replace(
        /https?:\/\/(?:www\.|m\.)?tecconcursos\.com\.br/g,
        "/api/tec-browser",
      );
      html = html.replace(
        /https?:\/\/cdn\.tecconcursos\.com\.br/g,
        "/api/tec-browser/cdn",
      );

      // 2. URLs relativas em atributos HTML — evita duplicar prefixo
      html = html.replace(
        /((?:href|src|action|data-url)=")\/(?!api\/tec-browser|\/)/g,
        "$1/api/tec-browser/",
      );

      // 3. Meta refresh redirects
      html = html.replace(
        /(<meta[^>]+content=["'][^"']*url=)https?:\/\/www\.tecconcursos\.com\.br/gi,
        "$1/api/tec-browser",
      );

      res.send(html);
    } else if (contentType.includes("text/css")) {
      let css = body.toString("utf8");
      // Reescrita de fontes no CSS para passar pelo proxy de CDN
      css = css.replace(
        /https?:\/\/cdn\.tecconcursos\.com\.br/g,
        "/api/tec-browser/cdn",
      );
      res.send(css);
    } else {
      res.send(body);
    }
  } catch (e: any) {
    console.error("[TEC Proxy] Erro Critico:", e.message);

    const isHtmlRequest =
      req.path === "/" ||
      req.path === "/proxy" ||
      (req.headers.accept && req.headers.accept.includes("text/html"));

    if (isHtmlRequest) {
      res
        .status(500)
        .send(
          "<html><body style='padding:40px;font-family:system-ui;text-align:center;background:#0f172a;color:white;height:100vh;box-sizing:border-box;'>" +
            "<h1 style='color:#f87171;'>Falha na Conexao</h1>" +
            "<p style='opacity:0.7;'>Nao foi possivel carregar o TEC Concursos atraves do tunel SOE.</p>" +
            "<code style='display:block;padding:15px;background:#1e293b;border-radius:8px;margin:20px 0;word-break:break-all;'>" +
            e.message +
            "</code>" +
            "<button onclick='window.location.reload()' style='padding:12px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;'>Tentar Novamente</button>" +
            "<p style='margin-top:40px;font-size:12px;opacity:0.4;'>URL: " +
            targetUrl +
            "</p>" +
            "</body></html>",
        );
    } else {
      res.status(500).send(e.message);
    }
  }
});

export default router;
