const { ipcRenderer, webFrame } = require("electron");

// ── FIX: jQuery Conflict ──────────────────────────────────────────────────
// Removendo globais do Node.js do objeto window para que o jQuery (e outras libs)
// do site do TEC não se confundam e carreguem corretamente no escopo global.
if (typeof window !== "undefined") {
  const _require = window.require;
  const _module = window.module;
  const _exports = window.exports;
  
  delete window.require;
  delete window.module;
  delete window.exports;
  
  // Opcional: disponibilizar o ipcRenderer de forma segura se necessário
  // window.__SOE_IPC__ = ipcRenderer; 
}




// ── INJECT CONTENT SCRIPT NATIVELY IN ISOLATED WORLD ──
// Isto evita falhas de CSP (Content Security Policy) da página.
/**
 * SOE Content Script v2 — roda no contexto da página TEC Concursos (MAIN world).
 *
 * Novidades v2:
 * - Captura incidência, total de questões e banca dominante por assunto
 * - Varre automaticamente a lista de cadernos do usuário na página /cadernos
 * - Envia stats de banca por questão via SOE_TEC_BANCA_INCREMENT
 * - Captura filtros ativos (banca, ano, concurso) para enriquecer contexto
 */

(function () {
  'use strict';

  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK_EXT__) return;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK_EXT__ = true;

  const CADERNO_ID = location.pathname.match(/\/cadernos\/(\d+)/)?.[1] || null;

  // ─── Captura de incidência e metadados enriquecidos ───────────────────────

  function parseTecResponse(data) {
    const rows = [];
    let disciplinaAtual = '';

    const candidates = [
      data?.assuntos, data?.estatisticas, data?.items, data?.data,
      data?.questoes_por_assunto, data?.desempenho,
      data?.caderno?.assuntos, data?.caderno?.estatisticas,
      data?.result, data?.results,
      Array.isArray(data) ? data : null,
    ];

    const list = candidates.find(c => Array.isArray(c) && c.length > 0);
    if (!list) return rows;

    const nomePayload =
      data?.caderno?.nome || data?.nome || data?.title ||
      data?.caderno?.disciplina || data?.disciplina || '';

    for (const item of list) {
      if (item.isDisciplina || item.type === 'disciplina' || item.tipo === 'disciplina') {
        disciplinaAtual = item.nome || item.name || item.disciplina || '';
        continue;
      }
      const disc    = item.disciplina || item.materia || item.discipline || item.categoria || disciplinaAtual || nomePayload || 'TEC Concursos';
      const acertos = item.acertos ?? item.corretas ?? item.correct ?? item.hits ?? item.certas ?? 0;
      const erros   = item.erros   ?? item.incorretas ?? item.wrong  ?? item.errors ?? item.erradas ?? 0;
      const nome    = item.assunto || item.nome || item.name || item.topico || item.titulo || '';

      if (!nome || (acertos + erros) === 0) continue;

      // ── Campos enriquecidos (novidade v2) ──
      const totalQuestoesBanca =
        item.total || item.total_questoes || item.qtd_questoes ||
        item.quantidade || item.count || item.questoes_disponiveis || undefined;

      // Incidência: aceita valor absoluto (%) ou decimal (0-1)
      const incidenciaRaw =
        item.incidencia ?? item.percentual ?? item.peso ??
        item.frequencia ?? item.relevancia ?? undefined;
      const incidencia = incidenciaRaw !== undefined
        ? (incidenciaRaw > 1 ? incidenciaRaw / 100 : incidenciaRaw)
        : undefined;

      const bancaDominante =
        item.banca || item.bancas?.[0] || item.organizadora || undefined;

      const dificuldade =
        item.dificuldade !== undefined ? (item.dificuldade > 1 ? item.dificuldade / 100 : item.dificuldade)
        : undefined;

      rows.push({
        disciplina: disc,
        assunto: nome,
        acertos: Number(acertos),
        erros: Number(erros),
        ...(incidencia !== undefined ? { incidencia } : {}),
        ...(totalQuestoesBanca !== undefined ? { totalQuestoesBanca: Number(totalQuestoesBanca) } : {}),
        ...(bancaDominante ? { bancaDominante } : {}),
        ...(dificuldade !== undefined ? { dificuldade } : {}),
      });
    }
    return rows;
  }

  // ─── Detecção de lista de cadernos ───────────────────────────────────────

  function parseCadernosList(data) {
    const candidates = [
      data?.cadernos, data?.items, data?.data, data?.results,
      Array.isArray(data) ? data : null,
    ];
    const list = candidates.find(c => Array.isArray(c) && c.length > 0);
    if (!list) return [];

    return list
      .filter(c => c.id || c.caderno_id || c.cadernoId)
      .map(c => ({
        id: String(c.id || c.caderno_id || c.cadernoId),
        nome: c.nome || c.name || c.titulo || c.title || 'Caderno',
        disciplina: c.disciplina || c.materia || c.subject || '',
        url: c.url || `https://www.tecconcursos.com.br/cadernos/${c.id || c.caderno_id}`,
        totalQuestoes: c.total_questoes || c.questoes || c.count || 0,
        assuntos: c.assuntos_count || c.num_assuntos || 0,
      }));
  }

  function scrapeCadernosFromDOM() {
    const cadernos = [];
    // TEC renders cadernos in cards/list items
    const cards = document.querySelectorAll(
      '[class*="caderno-item"], [class*="CadernoItem"], [class*="caderno_card"], ' +
      '[data-caderno-id], a[href*="/cadernos/"]'
    );
    for (const card of cards) {
      const href = card.getAttribute('href') || card.querySelector('a')?.getAttribute('href') || '';
      const idMatch = href.match(/\/cadernos\/(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const nome = (card.querySelector('[class*="nome"], [class*="title"], h2, h3, strong') || card)
        .textContent?.trim()?.split('\n')[0] || `Caderno ${id}`;
      cadernos.push({ id, nome, url: `https://www.tecconcursos.com.br${href}`, disciplina: '', totalQuestoes: 0, assuntos: 0 });
    }
    if (cadernos.length > 0) {
      ipcRenderer.send("soe-tec-message", { type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true });
    }
  }

  // ─── Captura de banca nos filtros ativos ─────────────────────────────────

  function getActiveBanca() {
    const text = document.body?.innerText || '';
    // TEC shows active filters as chips: "CEBRASPE (CESPE)" etc.
    const filterArea = document.querySelector('[class*="filtro"], [class*="filter"], [class*="tag-banca"]');
    if (filterArea) {
      const bancaChip = filterArea.querySelector('[class*="banca"], [class*="organizadora"]');
      if (bancaChip) return bancaChip.textContent?.trim() || null;
    }
    // Fallback: extract from URL
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('banca') || urlParams.get('organizadora') || null;
  }

  // ─── URL relevance ────────────────────────────────────────────────────────

  function isRelevantUrl(url) {
    if (!url) return false;
    const u = url.toString();
    return (
      u.includes('estatisticas') || u.includes('desempenho') ||
      u.includes('assunto')      || u.includes('caderno') ||
      u.includes('desempenho-por') ||
      (CADERNO_ID && u.includes(CADERNO_ID))
    );
  }

  function isCadernosListUrl(url) {
    return url.toString().match(/\/cadernos($|\?|\/\?|\/list|\/all)/i) !== null;
  }

  // ─── DOM scraping ─────────────────────────────────────────────────────────

  function scrapeQuestionHeader() {
    const text = document.body?.innerText || '';
    if (!text) return [];

    const statsMatch = text.match(/(?:(\d+)\s*Resolvidas?,\s*)?(\d+)\s*Acertos?\s+e\s+(\d+)\s*Erros?/i);
    const cleanBtns = s => s.replace(/[\u2715\u2716\u2297\u2A2F\u00D7]/g, '').trim();

    // Strategy 1: Text labels "Matéria:" / "Assunto:" (classic TEC layout)
    const materiaMatch = text.match(/Mat[eé]ria:\s*([^\n]+)/i);
    const assuntoMatch = text.match(/Assunto:\s*([^\n]+)/i);
    if (materiaMatch && assuntoMatch) {
      const disciplina = cleanBtns(materiaMatch[1]);
      const assunto = cleanBtns(assuntoMatch[1]);
      if (disciplina && assunto) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina, assunto, acertos, erros }];
      }
    }

    // Strategy 2: CSS selectors (TEC React/Vue components)
    try {
      const selMateria = document.querySelector(
        '[class*="materia"], [class*="disciplina"], [class*="subject"], ' +
        '[data-materia], [data-disciplina], .question-subject'
      );
      const selAssunto = document.querySelector(
        '[class*="assunto"], [class*="topico"], [class*="topic"], ' +
        '[data-assunto], [data-topico], .question-topic'
      );
      if (selMateria && selAssunto) {
        const disciplina = cleanBtns(selMateria.textContent || '');
        const assunto    = cleanBtns(selAssunto.textContent  || '');
        if (disciplina && assunto) {
          const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
          const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
          return [{ disciplina, assunto, acertos, erros }];
        }
      }
    } catch (_) {}

    // Strategy 3: Breadcrumb / navigation trail (TEC often shows "Disc > Topic")
    try {
      const breadcrumbs = document.querySelectorAll(
        '[class*="breadcrumb"] a, [class*="breadcrumb"] span, nav a, [aria-label*="breadcrumb"] a'
      );
      const crumbs = Array.from(breadcrumbs)
        .map(el => cleanBtns(el.textContent || ''))
        .filter(t => t.length > 2 && t !== 'Início' && t !== 'Home' && t !== 'TEC');
      if (crumbs.length >= 2) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina: crumbs[0], assunto: crumbs[crumbs.length - 1], acertos, erros }];
      }
    } catch (_) {}

    // Strategy 4: Question metadata block — look for "Disciplina: X / Assunto: Y" patterns
    const discMatch   = text.match(/Disciplina:\s*([^\n\/]+)/i);
    const topicoMatch = text.match(/T[oó]pico:\s*([^\n]+)/i) || text.match(/Conte[uú]do:\s*([^\n]+)/i);
    if (discMatch && topicoMatch) {
      const disciplina = cleanBtns(discMatch[1]);
      const assunto    = cleanBtns(topicoMatch[1]);
      if (disciplina && assunto) {
        const acertos = statsMatch ? parseInt(statsMatch[2], 10) || 0 : 0;
        const erros   = statsMatch ? parseInt(statsMatch[3], 10) || 0 : 0;
        return [{ disciplina, assunto, acertos, erros }];
      }
    }

    return [];
  }

  let questionStartTime = Date.now();
  let lastUrl = location.href;

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      questionStartTime = Date.now();
      setTimeout(() => {
        const bodyText = document.body.innerText || '';
        const headerMatch = bodyText.match(/#(\d+)\s+([^\-]+)/);
        if (headerMatch) {
          const qId = headerMatch[1];
          const acertoMatch = bodyText.match(/Você acertou!/i);
          const erroMatch = bodyText.match(/Você errou!/i);
          if ((acertoMatch || erroMatch) && !sessionStorage.getItem('_react_app_cache_' + qId)) {
            sessionStorage.setItem('_react_app_cache_' + qId, '1');
          }
        }
        // Se chegou na página de cadernos, raspa a lista
        if (location.pathname.match(/\/cadernos($|\?)/)) {
          setTimeout(scrapeCadernosFromDOM, 2000);
        }
      }, 1500);
    }
  }, 500);

  function tryScrapeDOM() {
    const rows = scrapeQuestionHeader();
    const bodyText = document.body.innerText;

    // Strategy 1: "#12345" in visible text (classic TEC)
    const headerMatch = bodyText.match(/#(\d+)\s+([^\-]+)/);
    // Strategy 2: question ID from URL (/questoes/12345 or ?questao=12345)
    const urlIdMatch = location.pathname.match(/\/questoes\/(\d+)/) ||
                       location.search.match(/[?&]questao=(\d+)/) ||
                       location.pathname.match(/\/(\d{5,})(?:\/|$)/);
    // Strategy 3: data attribute
    let domId = null;
    try {
      const qEl = document.querySelector('[data-questao-id], [data-question-id], [data-id]');
      domId = qEl?.getAttribute('data-questao-id') || qEl?.getAttribute('data-question-id') || qEl?.getAttribute('data-id') || null;
    } catch (_) {}

    const questionId = headerMatch?.[1] || urlIdMatch?.[1] || domId || null;

    const acertoMatch = bodyText.match(/Você acertou!/i) ||
                        document.querySelector('[class*="acertou"], [class*="correct"], [class*="success"]');
    const erroMatch   = bodyText.match(/Você errou!/i) ||
                        document.querySelector('[class*="errou"], [class*="wrong"], [class*="error-answer"], [class*="incorrect"]');

    // If we can't find questionId at all, use URL as dedup key
    const dedupKey = questionId || location.href;

    if (dedupKey && (acertoMatch || erroMatch)) {
      const storageKey = '_react_app_cache_' + dedupKey.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
      if (!sessionStorage.getItem(storageKey)) {
        const timeSpentSeconds = Math.max(1, Math.floor((Date.now() - questionStartTime) / 1000));
        if (timeSpentSeconds < 2) return;
        sessionStorage.setItem(storageKey, '1');
        const isError = !!erroMatch;
        questionStartTime = Date.now();

        // Use scraped row or fallback to URL-derived identifiers
        const disciplina = rows[0]?.disciplina || '';
        const assunto    = rows[0]?.assunto    ||
          // Fallback: extract from URL path e.g. /cadernos/123/topico/456
          location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g,' ') ||
          'Questão TEC';

        {
          const activeBanca = getActiveBanca();
          
          ipcRenderer.send("soe-tec-message", {
            type: 'SOE_TEC_INCREMENT_STATS',
            payload: {
              cadernoId: CADERNO_ID || location.pathname.split('/').filter(Boolean).pop() || 'unknown',
              cadernoUrl: location.href,
              disciplina,
              assunto,
              correctAdd: isError ? 0 : 1,
              errorAdd: isError ? 1 : 0,
              timeSpentSeconds,
            },
            _soe_internal: true,
          });

          if (activeBanca && disciplina && assunto !== 'Questão TEC') {
            ipcRenderer.send("soe-tec-message", {
              type: 'SOE_TEC_BANCA_INCREMENT',
              payload: { disciplina, assunto, banca: activeBanca, correctAdd: isError ? 0 : 1, errorAdd: isError ? 1 : 0 },
              _soe_internal: true,
            });
          }

        } // end increment block

        // Sirene de Ilusão de Competência
        if (isError) {
          const now = Date.now();
          let errorTimes = JSON.parse(sessionStorage.getItem('_react_app_state_') || '[]');
          errorTimes = errorTimes.filter(t => now - t.time < 3 * 60 * 1000);
          const currentSubject = rows[0]?.assunto || assunto;
          errorTimes.push({ time: now, subject: currentSubject });
          sessionStorage.setItem('_react_app_state_', JSON.stringify(errorTimes));
          const sameErrors = errorTimes.filter(t => t.subject === currentSubject);
          if (sameErrors.length >= 3) {
            sessionStorage.setItem('_react_app_state_', '[]');
          }
        } else {
          let errorTimes = JSON.parse(sessionStorage.getItem('_react_app_state_') || '[]');
          const currentSubject = rows[0]?.assunto || assunto;
          errorTimes = errorTimes.filter(t => t.subject !== currentSubject);
          sessionStorage.setItem('_react_app_state_', JSON.stringify(errorTimes));
        }

        if (isError) {
          const wq = scrapeWrongQuestion(bodyText, document.body);
          if (wq && wq.statement) {
            wq.disciplina = disciplina;
            wq.assunto    = assunto;
            wq.timeSpentSeconds = timeSpentSeconds;
            ipcRenderer.send("soe-tec-message", { type: 'SOE_TEC_WRONG_QUESTION', payload: wq, _soe_internal: true });
          }
        }
      }
    }
  }



  function scrapeWrongQuestion(text, bodyElement) {
    if (!text.match(/Você errou!/i)) return null;
    const errorMatch = text.match(/Você errou!(?:[\s\S]{0,500}Gabarito:\s*([A-E]|[CERTORADcertorad]+\b))?/i);
    const headerMatch = text.match(/#(\d+)\s+([^\-]+)\s*-\s*(\d{4})?\s*-\s*([^\n]+)/);
    const questionId = headerMatch ? headerMatch[1] : '';
    const banca = headerMatch ? headerMatch[2].trim() : '';
    const year = headerMatch && headerMatch[3] ? parseInt(headerMatch[3], 10) : new Date().getFullYear();
    const contest = headerMatch ? headerMatch[4].trim() : '';

    const alternativesRegex = /\(\s*([A-E])\s*\)\s*([^\n]+)/g;
    const alternatives = [];
    let firstAltIndex = -1;
    let m;
    while ((m = alternativesRegex.exec(text)) !== null) {
      if (firstAltIndex === -1) firstAltIndex = m.index;
      alternatives.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
    }
    if (alternatives.length === 0) {
      const ceRegex = /\b(Certo|Errado)\b/gi;
      let ceMatch;
      while ((ceMatch = ceRegex.exec(text)) !== null) {
        if (firstAltIndex === -1) firstAltIndex = ceMatch.index;
        alternatives.push({ letter: ceMatch[1].toLowerCase().startsWith('c') ? 'C' : 'E', text: ceMatch[1] });
        if (alternatives.length >= 2) break;
      }
    }

    let statement = '';
    if (headerMatch && firstAltIndex !== -1) {
      statement = text.substring(headerMatch.index + headerMatch[0].length, firstAltIndex).trim();
    } else if (headerMatch) {
      statement = text.substring(headerMatch.index + headerMatch[0].length, headerMatch.index + 1000).trim();
    }

    const correctAnswerText = errorMatch?.[1]?.trim() || '';
    let correctAnswer = '';
    if (correctAnswerText) {
      const matched = alternatives.find(a => a.text.toLowerCase() === correctAnswerText.toLowerCase() || a.letter.toLowerCase() === correctAnswerText.toLowerCase());
      correctAnswer = matched ? matched.letter : correctAnswerText.charAt(0).toUpperCase();
    }
    const userChoiceMatch = text.match(/Sua resposta:\s*([A-E]|Certo|Errado)/i);
    const userAnswer = userChoiceMatch ? userChoiceMatch[1].toUpperCase().charAt(0) : '';

    let resolution = '';
    if (bodyElement) {
      const resNode = bodyElement.querySelector('.resolucao-professor, .resolucao, [class*="resolution"], [class*="resolucao"], .feedback-prof');
      if (resNode) resolution = resNode.textContent.trim().replace(/\s+/g, ' ');
    }

    return { questionId, banca, year, contest, statement, alternatives, correctAnswer, userAnswer, resolution };
  }

  function dispatch(rows, sourceUrl) {
    if (!rows || rows.length === 0) return;
    ipcRenderer.send("soe-tec-message", {
      type: 'SOE_TEC_DATA',
      payload: {
        cadernoId:  CADERNO_ID || location.pathname.split('/').filter(Boolean).pop() || 'unknown',
        cadernoUrl: location.href,
        disciplina: rows[0]?.disciplina || '',
        rows,
        sourceUrl,
      },
      _soe_internal: true,
    });
  }

  // ─── Intercept fetch ──────────────────────────────────────────────────────

  window.fetch = new Proxy(window.fetch, {
    apply: async function (target, thisArg, argumentsList) {
      const response = await Reflect.apply(target, thisArg, argumentsList);
      try {
        const url = typeof argumentsList[0] === 'string' ? argumentsList[0] : argumentsList[0]?.url || '';

        if (url.includes('api') || url.includes('questoes')) {
          setTimeout(tryScrapeDOM, 1000);
          setTimeout(tryScrapeDOM, 3000);
          setTimeout(tryScrapeDOM, 5000);
        }

        if (isRelevantUrl(url)) {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('json')) {
            response.clone().json().then(data => {
              const rows = parseTecResponse(data);
              if (rows.length > 0) {
                dispatch(rows, url);
              }
              // Tenta detectar lista de cadernos
              if (isCadernosListUrl(url)) {
                const cadernos = parseCadernosList(data);
                if (cadernos.length > 0) {
                  ipcRenderer.send("soe-tec-message", { type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true });
                }
              }
            }).catch(() => {});
          }
        }
      } catch (_) {}
      return response;
    }
  });

  // ─── Intercept XHR ───────────────────────────────────────────────────────

  XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
    apply: function (target, thisArg, argumentsList) {
      thisArg._soe_url = argumentsList[1];
      return Reflect.apply(target, thisArg, argumentsList);
    }
  });

  XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, {
    apply: function (target, thisArg, argumentsList) {
      thisArg.addEventListener('load', function () {
        try {
          const url = this._soe_url || '';
          if (url.includes('api')) { setTimeout(tryScrapeDOM, 1000); setTimeout(tryScrapeDOM, 3000); }
          if (!isRelevantUrl(url)) return;
          const ct = this.getResponseHeader('content-type') || '';
          if (!ct.includes('json')) return;
          const data = JSON.parse(this.responseText);
          const rows = parseTecResponse(data);
          if (rows.length > 0) {
            dispatch(rows, url);
          }
          if (isCadernosListUrl(url)) {
            const cadernos = parseCadernosList(data);
            if (cadernos.length > 0) {
              ipcRenderer.send("soe-tec-message", { type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true });
            }
          }
        } catch (_) {}
      });
      return Reflect.apply(target, thisArg, argumentsList);
    }
  });

  // ─── HTML table fallback + DOM init ──────────────────────────────────────

  function scrapeHtmlTable() {
    const rows = [];
    let disciplinaAtual = '';
    const trs = document.querySelectorAll('table tr, [class*="table"] [class*="row"]');
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td, [class*="cell"]'));
      if (tds.length === 0) continue;
      const textos = tds.map(td => td.innerText.trim());
      const numeros = textos.filter(t => /^\d+$/.test(t)).map(Number);
      if (numeros.length < 2 && textos[0] && textos[0].length > 3) {
        const hasBold = tr.querySelector('strong, b, [style*="bold"], [class*="bold"], [class*="header"], [class*="disciplina"]');
        const hasColspan = tds.some(td => parseInt(td.getAttribute('colspan') || '1') > 2);
        if (hasBold || hasColspan || tds.length === 1) {
          disciplinaAtual = textos[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
          continue;
        }
      }
      if (numeros.length >= 2 && textos[0] && disciplinaAtual) {
        rows.push({ disciplina: disciplinaAtual, assunto: textos[0], acertos: numeros[0], erros: numeros[1] });
      }
    }
    if (rows.length > 0) {
      dispatch(rows, location.href);
    }
    return rows.length;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      tryScrapeDOM();
      if (scrapeHtmlTable() === 0) setTimeout(scrapeHtmlTable, 3000);

      // Auto-scan lista de cadernos se estiver na página certa
      if (location.pathname.match(/\/cadernos($|\?)/)) {
        setTimeout(scrapeCadernosFromDOM, 2000);
        setTimeout(scrapeCadernosFromDOM, 5000);
      }
    }, 2000);

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input[type="radio"], label')) {
        setTimeout(tryScrapeDOM, 1000);
        setTimeout(tryScrapeDOM, 2500);
        setTimeout(tryScrapeDOM, 5000);
      }
    });
  });

  /* SOE v2.5 content script ativo */
})();

