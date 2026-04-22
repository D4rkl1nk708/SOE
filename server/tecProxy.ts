import { Router } from "express";
import axios from "axios";
import { readFileSync } from "fs";
import { join } from "path";

const router = Router();

// Cache do script de rastreio para performance
let cachedScript: string | null = null;
const getTecScript = () => {
    if (cachedScript) return cachedScript;
    try {
        // Lemos o script que já existe para o Electron e adaptamos para Web
        const path = join(process.cwd(), "electron", "tec-content.js");
        const content = readFileSync(path, "utf8");
        // Adicionamos uma ponte para o Iframe se comunicar com o Parent (SOE App)
        cachedScript = `
            (function() {
                const _postMessage = window.postMessage;
                window.postMessage = function(data, targetOrigin) {
                    if (data && data._soe_internal) {
                        // Tenta enviar para o pai e para o topo
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage(data, "*");
                        }
                        if (window.top && window.top !== window) {
                            window.top.postMessage(data, "*");
                        }
                    }
                    return _postMessage.apply(this, arguments);
                };
                ${content}
            })();
        `;
        return cachedScript;
    } catch (e) {
        console.error("Erro ao carregar tec-content.js:", e);
        return "";
    }
};

router.get("/proxy", async (req: any, res: any) => {
    const url = (req.query.url as string) || "https://www.tecconcursos.com.br/";

    try {
        const clientCookies = req.headers.cookie || "";
        console.log(`[TEC Proxy] Request: ${url}`);

        const response = await axios.get(url, {
            headers: {
                "Host": "www.tecconcursos.com.br",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://www.google.com/",
                "Cookie": clientCookies,
                "DNT": "1",
                "Upgrade-Insecure-Requests": "1",
                "Cache-Control": "max-age=0"
            },
            timeout: 20000,
            maxRedirects: 10,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Repassamos cookies do TEC de volta para o navegador
        const tecCookies = response.headers['set-cookie'];
        if (tecCookies) {
            res.setHeader("set-cookie", tecCookies);
        }

        let html = response.data;
        const scriptTag = `
        <script>
            (function() {
                const opm = window.postMessage;
                window.postMessage = function(d, t) {
                    if (d && d._soe_internal && window.parent !== window) {
                        window.parent.postMessage(d, "*");
                    }
                    return opm.apply(this, arguments);
                };
            })();
        </script>
        <script>${getTecScript()}</script>`;

        // Garante que o TEC carregue os assets dele mesmo estando no nosso proxy
        html = html.replace(/<head>/i, `<head><base href="https://www.tecconcursos.com.br/">${scriptTag}`);

        res.send(html);
    } catch (e: any) {
        // Fallback: Se o proxy falhar, tenta um redirecionamento direto (perde o rastreio, mas não dá erro 404)
        console.error("Proxy falhou, tentando redirecionar...", e.message);
        res.send(`
            <script>
                window.location.href = "https://www.tecconcursos.com.br/";
            </script>
        `);
    }
});

export default router;
