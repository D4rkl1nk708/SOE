/**
 * SOE Background Service Worker — Manifest V3
 *
 * Responsabilidades:
 * 1. Receber dados capturados pelo content script via chrome.runtime.onMessage
 * 2. Enviar para a API do SOE via fetch (tem permissão de rede irrestrita)
 * 3. Controlar debounce (evita envios duplicados em < 5s)
 * 4. Atualizar badge do ícone com status
 * 5. Disparar notificação ao sincronizar
 */

const DEBOUNCE_MS = 5000; // ignora envios duplicados em menos de 5s por caderno
const lastSent = {}; // { cadernoId: timestamp }

// ── Lê configuração salva ──────────────────────────────────────────────────
async function getConfig() {
  const data = await chrome.storage.sync.get(['soeUrl', 'soeToken']);
  return {
    soeUrl:   (data.soeUrl   || 'http://localhost:3000').replace(/\/$/, ''),
    soeToken: data.soeToken  || 'ELECTRON_MODE',
  };
}

// ── Atualiza badge do ícone ────────────────────────────────────────────────
function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || '' });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

// ── Envia dados para o SOE ─────────────────────────────────────────────────
async function syncToSOE(payload, tabId) {
  const { soeUrl, soeToken } = await getConfig();

  if (!soeToken) {
    setBadge('!', '#ef4444');
    console.warn('[SOE BG] Token não configurado. Abra o popup da extensão.');
    return { ok: false, error: 'Token não configurado' };
  }

  // Debounce por caderno
  const now = Date.now();
  const key = payload.cadernoId || 'unknown';
  if (lastSent[key] && (now - lastSent[key]) < DEBOUNCE_MS) {
    console.log('[SOE BG] Debounce — ignorando envio duplicado para caderno', key);
    return { ok: false, error: 'debounce' };
  }
  lastSent[key] = now;

  setBadge('...', '#6366f1');

  console.log('[SOE BG] Tentando sincronizar com:', `${soeUrl}/api/tec/caderno-push`);
  try {
    const resp = await fetch(`${soeUrl}/api/tec/caderno-push`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-SOE-Token':   soeToken,
      },
      body: JSON.stringify(payload),
    });

    console.log('[SOE BG] Status da resposta:', resp.status);
    const data = await resp.json();
    console.log('[SOE BG] Dados da resposta:', data);

    if (resp.ok && data.success) {
      setBadge('✓', '#22c55e');
      // Limpa badge após 4s
      setTimeout(() => setBadge('', ''), 4000);

      // Notificação
      chrome.notifications.create({
        type:    'basic',
        iconUrl: '../icons/icon48.png',
        title:   'SOE — Sincronizado!',
        message: data.message || `${data.updated ?? 0} assunto(s) atualizado(s).`,
        priority: 0,
      });

      console.log('[SOE BG] ✅ Enviado:', data.message);
      return { ok: true, data };
    } else {
      setBadge('✗', '#ef4444');
      console.error('[SOE BG] Erro na resposta:', data);
      return { ok: false, error: data.error || 'Erro desconhecido' };
    }
  } catch (err) {
    setBadge('✗', '#ef4444');
    console.error('[SOE BG] Erro de rede:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Listener único: mensagens do content script e do popup ────────────────
// IMPORTANTE: No Manifest V3 deve existir apenas UM onMessage.addListener.
// Múltiplos listeners causam "Timeout calling extension background" porque
// o segundo listener recebe a mensagem mas nunca retorna `true`, fazendo o
// canal fechar antes de sendResponse ser chamado.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOE_TEC_DATA') {
    console.log('[SOE BG] Dados absolutos recebidos:', message.payload?.rows?.length, 'assuntos');
    syncToSOE(message.payload, sender.tab?.id)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEC_INCREMENT_STATS') {
    console.log('[SOE BG] Incremento recebido:', message.payload?.assunto);
    syncIncrementToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEC_WRONG_QUESTION') {
    console.log('[SOE BG] Questão errada recebida:', message.payload?.questionId);
    syncWrongQuestionToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEC_AI_MENTOR') {
    syncAIMentorToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_GENERATE_FLASHCARD') {
    syncGenerateFlashcardToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEC_CADERNOS_LIST') {
    console.log('[SOE BG] Lista de cadernos recebida:', message.payload?.cadernos?.length);
    syncCadernosListToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEC_BANCA_INCREMENT') {
    syncBancaIncrementToSOE(message.payload)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'SOE_TEST_CONNECTION') {
    const { soeUrl, soeToken } = message;
    fetch(`${soeUrl.replace(/\/$/, '')}/api/tec/status`, {
      headers: { 'X-SOE-Token': soeToken },
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: data.ok, userName: data.userName }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function syncGenerateFlashcardToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };

  try {
    const resp = await fetch(`${soeUrl}/api/tec/generate-flashcard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok && data.success) {
      return { ok: true, data };
    } else {
      return { ok: false, error: data.error };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function syncAIMentorToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };

  try {
    const resp = await fetch(`${soeUrl}/api/tec/ai-mentor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok && data.success) {
      return { ok: true, data };
    } else {
      return { ok: false, error: data.error };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function syncWrongQuestionToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };

  console.log('[SOE BG] Enviando questão errada para:', `${soeUrl}/api/tec/wrong-question`);
  try {
    const resp = await fetch(`${soeUrl}/api/tec/wrong-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    console.log('[SOE BG] Status (wrong-question):', resp.status);
    const data = await resp.json();
    console.log('[SOE BG] Resposta (wrong-question):', data);
    if (resp.ok && data.success) {
      setBadge('E', '#eab308');
      setTimeout(() => setBadge('', ''), 4000);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: 'SOE — Questão Errada!',
        message: 'A questão que você errou foi enviada para o banco do Mentor IA.',
      });
      return { ok: true, data };
    } else {
      console.error('[SOE BG] Erro na resposta:', data);
      return { ok: false, error: data.error };
    }
  } catch (err) {
    console.error('[SOE BG] Erro de rede:', err.message);
    return { ok: false, error: err.message };
  }
}

async function syncIncrementToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };

  console.log('[SOE BG] Incrementando stats em:', `${soeUrl}/api/tec/increment`);
  try {
    const resp = await fetch(`${soeUrl}/api/tec/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    console.log('[SOE BG] Status (increment):', resp.status);
    const data = await resp.json();
    console.log('[SOE BG] Resposta (increment):', data);
    if (resp.ok && data.success) {
      setBadge('+1', '#22c55e');
      setTimeout(() => setBadge('', ''), 3000);
      return { ok: true, data };
    } else {
      console.error('[SOE BG] Erro no incremento:', data);
      return { ok: false, error: data.error };
    }
  } catch (err) {
    console.error('[SOE BG] Erro de rede (increment):', err.message);
    return { ok: false, error: err.message };
  }
}

async function syncCadernosListToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };
  try {
    const resp = await fetch(`${soeUrl}/api/tec/cadernos-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      setBadge('📋', '#6366f1');
      setTimeout(() => setBadge('', ''), 3000);
      if (data.newCount > 0) {
        chrome.notifications.create({
          type: 'basic', iconUrl: '../icons/icon48.png',
          title: 'SOE — Cadernos detectados!',
          message: data.message || `${data.total} caderno(s) encontrado(s).`,
        });
      }
      return { ok: true, data };
    }
    return { ok: false, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function syncBancaIncrementToSOE(payload) {
  const { soeUrl, soeToken } = await getConfig();
  if (!soeToken) return { ok: false, error: 'Token não configurado' };
  try {
    const resp = await fetch(`${soeUrl}/api/tec/banca-increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SOE-Token': soeToken },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return { ok: resp.ok && data.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

console.log('[SOE BG] Service worker iniciado');
