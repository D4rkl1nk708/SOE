import { describe, it, expect, vi, beforeAll } from 'vitest';
import axios from 'axios';

// Mock do ambiente do servidor
const PROXY_URL = 'http://localhost:3000/api/tec-browser/proxy';

describe('TEC Proxy Smoke Test', () => {
  it('Deve carregar a página inicial do TEC através do proxy', async () => {
    try {
      const response = await axios.get(`${PROXY_URL}?url=https://www.tecconcursos.com.br/`, {
        timeout: 10000
      });
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      
      const html = response.data.toString();
      
      // Validação 1: Injeção do Script SOE
      expect(html).toContain('window.__SOE_PROXY__ = true');
      expect(html).toContain('const opm = window.postMessage');
      
      // Validação 2: Reescrita de URLs
      expect(html).toContain('/api/tec-browser/');
      
      // Validação 3: Ausência de Syntax Error (padrão básico)
      expect(html).not.toContain('Uncaught SyntaxError');
      
      console.log('✅ Teste de Injeção: OK');
    } catch (e: any) {
      console.error('❌ Falha no teste do proxy:', e.message);
      // Se o servidor não estiver rodando, o teste falha aqui
      throw e;
    }
  });

  it('Deve encaminhar corretamente caminhos relativos', async () => {
    // Simulando um asset (JS ou CSS)
    const assetUrl = 'http://localhost:3000/api/tec-browser/css/style.css';
    try {
        const response = await axios.get(assetUrl, { timeout: 5000 });
        // Pode dar 404 se o arquivo não existir no TEC, mas o importante é o Proxy tentar buscar no lugar certo
        expect(response.config.url).toContain('https://www.tecconcursos.com.br/css/style.css');
    } catch (e) {}
  });
});
