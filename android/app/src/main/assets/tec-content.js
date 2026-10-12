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

  if (window.__SOE_INJECTED_V2__) return;
  
  // No modo proxy, o script é injetado em tudo que é HTML.
  // Só queremos rodar no frame principal do TEC. 
  // No mobile ou Electron, relaxamos a trava se for o frame principal ou se houver indícios do SOE.
  const isMainFrame = window.self === window.top;
  const isSoeProxy = window.__SOE_PROXY__ || window.__SOE_MOBILE__ || window.__SOE_ELECTRON__ || !!window.SoeAndroidBridge || (document.documentElement && document.documentElement.innerHTML.includes('soe-hud'));
  if (!isMainFrame && window.name !== 'TEC_MAIN_FRAME' && !isSoeProxy) {
    return;
  }
  
  window.__SOE_INJECTED_V2__ = true;

  const CADERNO_ID = location.pathname.match(/\/cadernos\/(\d+)/)?.[1] || null;

  function debugLog(msg) {
    // console.log('[SOE DEBUG]', msg);
    /* 
    window.postMessage({
      type: 'SOE_DEBUG_LOG',
      payload: { msg: `[${new Date().toISOString()}] ${msg}` },
      _soe_internal: true,
    }, '*');
    */
  }

  debugLog('Script SOE v2.1 carregado. URL: ' + location.href + ' CadernoID: ' + CADERNO_ID);

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
      console.log('[SOE v2] Cadernos detectados via DOM:', cadernos.length);
      window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
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

    // Suporta formatos: "10 Resolvidas, 8 Acertos e 2 Erros" ou "319 R, 242 A e 77 E"
    const statsMatch = text.match(/(?:(\d+)\s*(?:Resolvidas?|R),\s*)?(\d+)\s*(?:Acertos?|A)\s+e\s+(\d+)\s*(?:Erros?|E)/i);
    const cleanBtns = s => s.replace(/[\u2715\u2716\u2297\u2A2F\u00D7]/g, '').trim();

    debugLog(`Scraping header. StatsMatch: ${statsMatch ? 'Yes (' + statsMatch[0] + ')' : 'No'}. Text length: ${text.length}`);

    // Strategy 1: Text labels "Matéria:" / "Assunto:" (classic/mobile TEC layout)
    const materiaMatch = text.match(/Mat[eé]ria:\s*([^\n\r]+)/i);
    const assuntoMatch = text.match(/Assunto:\s*([^\n\r]+)/i);
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
        '[data-materia], [data-disciplina], .question-subject, ' +
        '.materia-area, .disciplina-info' // Mobile selectors
      );
      const selAssunto = document.querySelector(
        '[class*="assunto"], [class*="topico"], [class*="topic"], ' +
        '[data-assunto], [data-topico], .question-topic, ' +
        '.assunto-area, .topico-info' // Mobile selectors
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
          if ((acertoMatch || erroMatch) && !sessionStorage.getItem('soe_scored_' + qId)) {
            sessionStorage.setItem('soe_scored_' + qId, '1');
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

    const acertoMatch = bodyText.match(/Você acertou/i) ||
                        document.querySelector('[class*="acertou"], [class*="correct"], [class*="success"], .q-status-correct, .text-success');
    const erroMatch   = bodyText.match(/Você errou/i) ||
                        document.querySelector('[class*="errou"], [class*="wrong"], [class*="error-answer"], [class*="incorrect"], .q-status-wrong, .text-danger');

    // If we can't find questionId at all, use URL as dedup key
    const dedupKey = questionId || location.href;

    if (dedupKey && (acertoMatch || erroMatch)) {
      const storageKey = 'soe_scored_' + dedupKey.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
      const isError = !!erroMatch;

      // 1. Contabilizar estatísticas na primeira detecção
      if (!sessionStorage.getItem(storageKey)) {
        const timeSpentSeconds = Math.max(1, Math.floor((Date.now() - questionStartTime) / 1000));
        if (timeSpentSeconds < 2) return;
        sessionStorage.setItem(storageKey, '1');
        questionStartTime = Date.now();

        // Use scraped row or fallback to URL-derived identifiers
        const disciplina = rows[0]?.disciplina || '';
        const assunto    = rows[0]?.assunto    ||
          // Fallback: extract from URL path e.g. /cadernos/123/topico/456
          location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g,' ') ||
          'Questão TEC';

        {
          const activeBanca = getActiveBanca();
          console.log('[SOE v2] Incrementando stats para', assunto, '-', timeSpentSeconds, 's');

          window.postMessage({
            type: 'SOE_TEC_INCREMENT_STATS',
              payload: {
                cadernoId: CADERNO_ID || location.pathname.split('/').filter(Boolean).pop() || 'unknown',
                cadernoUrl: location.href,
                disciplina,
                assunto,
                correctAdd: isError ? 0 : 1,
                errorAdd: isError ? 1 : 0,
                timeSpentSeconds,
                dedupKey: dedupKey,
              },
            _soe_internal: true,
          }, '*');

          if (activeBanca && disciplina && assunto !== 'Questão TEC') {
            window.postMessage({
              type: 'SOE_TEC_BANCA_INCREMENT',
              payload: { disciplina, assunto, banca: activeBanca, correctAdd: isError ? 0 : 1, errorAdd: isError ? 1 : 0 },
              _soe_internal: true,
            }, '*');
          }
        } // end increment block
      }

      // 2. Salvar questão errada no Caderno de Erros (com chave própria para não perder se o DOM demorar alguns ms)
      if (isError) {
        const wqKey = storageKey + '_wq';
        if (!sessionStorage.getItem(wqKey)) {
          const disciplina = rows[0]?.disciplina || '';
          const assunto    = rows[0]?.assunto    ||
            location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g,' ') ||
            'Questão TEC';
          const timeSpentSeconds = Math.max(1, Math.floor((Date.now() - questionStartTime) / 1000));

          const wq = scrapeWrongQuestion(bodyText, document.body, questionId, disciplina, assunto, dedupKey);
          if (wq) {
            sessionStorage.setItem(wqKey, '1');
            wq.disciplina = wq.disciplina || disciplina;
            wq.assunto    = wq.assunto    || assunto;
            wq.timeSpentSeconds = timeSpentSeconds;
            console.log('[SOE v2] Enviando questão errada para o Caderno de Erros:', wq.questionId);
            window.postMessage({ type: 'SOE_TEC_WRONG_QUESTION', payload: wq, _soe_internal: true }, '*');
          }
        }
      }
    }
  }

  function scrapeWrongQuestion(text, bodyElement, knownQuestionId, knownDisciplina, knownAssunto, dedupKey) {
    debugLog('Tentando raspar questão errada...');
    
    // 1. Identificar questionId, banca, year, contest
    let questionId = knownQuestionId || '';
    let banca = '';
    let year = new Date().getFullYear();
    let contest = '';

    const headerMatch = text.match(/#(\d+)\s+([^\n\r-]+)?\s*(?:-\s*(\d{4})?)?\s*(?:-\s*([^\n\r]+))?/);
    if (!questionId && headerMatch) questionId = headerMatch[1];
    if (headerMatch) {
      if (headerMatch[2]) banca = headerMatch[2].trim();
      if (headerMatch[3]) year = parseInt(headerMatch[3], 10);
      if (headerMatch[4]) contest = headerMatch[4].trim();
    }
    if (!questionId) {
      const idMatch = text.match(/#(\d{4,8})/) || location.pathname.match(/\/questoes\/(\d+)/);
      if (idMatch) questionId = idMatch[1];
    }

    if (!banca && bodyElement) {
      const bancaEl = bodyElement.querySelector('[class*="banca"], [class*="orgao"], [class*="instituicao"]');
      if (bancaEl) banca = bancaEl.textContent.trim();
    }
    if (!banca) {
      banca = getActiveBanca() || '';
    }

    // 2. Extrair enunciado (Statement)
    let statement = '';
    if (bodyElement) {
      const stmtEl = bodyElement.querySelector(
        '[class*="enunciado"], [class*="texto-enunciado"], [class*="texto-questao"], [class*="statement"], [class*="question-text"], .questao-conteudo, .q-text, [class*="corpo-questao"]'
      );
      if (stmtEl && stmtEl.innerText && stmtEl.innerText.trim().length > 15) {
        statement = stmtEl.innerText.trim();
      }
    }

    if (!statement || statement.length < 15) {
      let cleanText = text;
      if (headerMatch) {
        cleanText = text.substring(headerMatch.index + headerMatch[0].length).trim();
      } else {
        const hashIdx = cleanText.search(/#\d{4,8}/);
        if (hashIdx !== -1) {
          const nextNl = cleanText.indexOf('\n', hashIdx);
          if (nextNl !== -1) cleanText = cleanText.substring(nextNl + 1).trim();
        }
      }

      const cutMatch = cleanText.match(/(?:^|\n)\s*(?:\([A-E]\)|[A-E]\s*[\)\.\:]|[A-E]\s*\n|(?:Certo|Errado)\b|Você errou|Você acertou|Gabarito:)/i);
      if (cutMatch && cutMatch.index > 10) {
        statement = cleanText.substring(0, cutMatch.index).trim();
      } else {
        const errIdx = cleanText.search(/Você errou|Gabarito:/i);
        if (errIdx > 10) {
          statement = cleanText.substring(0, errIdx).trim();
        } else {
          statement = cleanText.substring(0, 1000).trim();
        }
      }
    }

    // Fallback garantido para o enunciado nunca ficar vazio
    if (!statement || statement.length < 5) {
      statement = `Questão #${questionId || 'TEC'} - ${knownAssunto || 'Geral'}${banca ? ' (' + banca + ')' : ''}`;
    }

    // 3. Extrair Alternativas
    const alternatives = [];
    if (bodyElement) {
      const altEls = bodyElement.querySelectorAll(
        '.alternativas [class*="opcao"], .alternativas [class*="item"], [class*="alternativa"], [class*="option-item"], .q-option, .questao-opcao, li[class*="opcao"], [class*="alternativa-opcao"]'
      );
      if (altEls && altEls.length >= 2) {
        altEls.forEach((el, idx) => {
          const letterEl = el.querySelector('[class*="letra"], [class*="letter"], b, strong, input[type="radio"]');
          let letter = '';
          if (letterEl) {
            letter = (letterEl.value || letterEl.textContent || '').trim().toUpperCase();
            if (letter.length > 1) letter = letter.charAt(0);
          }
          if (!letter || !letter.match(/^[A-E]$/)) {
            letter = String.fromCharCode(65 + idx);
          }
          const textEl = el.querySelector('[class*="texto"], [class*="text"], [class*="content"]') || el;
          let altText = textEl.textContent.trim();
          altText = altText.replace(new RegExp('^\\s*\\(?' + letter + '[\\)\\.\\-\\:\\s]+', 'i'), '').trim();
          alternatives.push({ letter, text: altText });
        });
      }
    }

    if (alternatives.length < 2) {
      const altRegex = /(?:^|\n)\s*(?:\(([A-E])\)|([A-E])\s*[\)\.\:]|([A-E])\s*\n)\s*([^\n]+)/g;
      let m;
      while ((m = altRegex.exec(text)) !== null) {
        const letter = (m[1] || m[2] || m[3]).toUpperCase();
        const altText = m[4].trim();
        alternatives.push({ letter, text: altText });
      }
    }

    if (alternatives.length < 2) {
      if (/\bCerto\b/i.test(text) && /\bErrado\b/i.test(text)) {
        alternatives.push({ letter: 'C', text: 'Certo' });
        alternatives.push({ letter: 'E', text: 'Errado' });
      }
    }

    // 4. Extrair Gabarito (correctAnswer) e Resposta do Usuário (userAnswer)
    let correctAnswer = '';
    let userAnswer = '';

    if (bodyElement) {
      const correctEl = bodyElement.querySelector(
        '[class*="correta"], [class*="gabarito"], [class*="correct"], .opcao-certa, .is-correct'
      );
      if (correctEl) {
        const letEl = correctEl.querySelector('[class*="letra"], b, strong') || correctEl;
        const m = (letEl.textContent || '').match(/([A-E]|Certo|Errado)/i);
        if (m) correctAnswer = m[1].toUpperCase().charAt(0);
      }

      const userEl = bodyElement.querySelector(
        '[class*="marcada"], [class*="selecionada"], [class*="user-choice"], input[type="radio"]:checked, [aria-checked="true"]'
      );
      if (userEl) {
        const letEl = userEl.querySelector('[class*="letra"], b, strong') || userEl;
        const m = (letEl.textContent || '').match(/([A-E]|Certo|Errado)/i);
        if (m) userAnswer = m[1].toUpperCase().charAt(0);
      }
    }

    if (!correctAnswer) {
      const gabMatch = text.match(/(?:Gabarito|Resposta correta|Correta|a correta é):\s*([A-E]|Certo|Errado)/i);
      if (gabMatch) correctAnswer = gabMatch[1].toUpperCase().charAt(0);
    }

    if (!userAnswer) {
      const userMatch = text.match(/(?:Sua resposta|Você marcou|Você selecionou|Sua escolha):\s*([A-E]|Certo|Errado)/i);
      if (userMatch) userAnswer = userMatch[1].toUpperCase().charAt(0);
    }

    // 5. Extrair Resolução do Professor
    let resolution = '';
    if (bodyElement) {
      const resNode = bodyElement.querySelector(
        '.resolucao-professor, .resolucao, [class*="resolution"], [class*="resolucao"], .feedback-prof, [class*="comentario-professor"]'
      );
      if (resNode) resolution = resNode.textContent.trim().replace(/\s+/g, ' ');
    }

    return {
      questionId: questionId || dedupKey || 'unknown',
      banca,
      year,
      contest,
      statement,
      alternatives,
      correctAnswer,
      userAnswer,
      resolution,
      disciplina: knownDisciplina,
      assunto: knownAssunto,
    };
  }

  function dispatch(rows, sourceUrl) {
    if (!rows || rows.length === 0) return;
    window.postMessage({
      type: 'SOE_TEC_DATA',
      payload: {
        cadernoId:  CADERNO_ID || location.pathname.split('/').filter(Boolean).pop() || 'unknown',
        cadernoUrl: location.href,
        disciplina: rows[0]?.disciplina || '',
        rows,
        sourceUrl,
      },
      _soe_internal: true,
    }, '*');
  }

  // ─── Intercept fetch (Passivo — NUNCA modifica URLs nem dados da requisição) ──
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      if (url.includes('api') || url.includes('questoes')) {
        setTimeout(tryScrapeDOM, 1000);
        setTimeout(tryScrapeDOM, 2500);
      }

      if (isRelevantUrl(url)) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          response.clone().json().then(data => {
            const rows = parseTecResponse(data);
            if (rows.length > 0) {
              dispatch(rows, url);
            }
            if (isCadernosListUrl(url)) {
              const cadernos = parseCadernosList(data);
              if (cadernos.length > 0) {
                window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
              }
            }
          }).catch(() => {});
        }
      }
    } catch (_) {}
    return response;
  };

  // ─── Intercept XHR (Passivo — NUNCA modifica URLs) ───────────────────────────
  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._soe_url = url;
    return _XHROpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this._soe_url || '';
        if (url.includes('api') || url.includes('questoes')) {
          setTimeout(tryScrapeDOM, 1000);
          setTimeout(tryScrapeDOM, 2500);
        }
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
            window.postMessage({ type: 'SOE_TEC_CADERNOS_LIST', payload: { cadernos }, _soe_internal: true }, '*');
          }
        }
      } catch (_) {}
    });
    return _XHRSend.apply(this, args);
  };

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
      console.log('[SOE v2] capturados', rows.length, 'assuntos via HTML scraping');
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
      }
    });
  });

  // ─── Force Scrape Listener (para Mobile Browser) ─────────────────────────
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SOE_FORCE_SCRAPE' && e.data._soe_internal) {
      console.log('[SOE v2] Forçando varredura manual...');
      tryScrapeDOM();
      scrapeHtmlTable();
      if (location.pathname.match(/\/cadernos($|\?)/)) scrapeCadernosFromDOM();
    }
  });

  console.log('[SOE v2] content script ativo — captura enriquecida (incidência + bancas + cadernos)');
})();
