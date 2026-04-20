/**
 * SOE Relay Script — ponte entre MAIN world (content.js) e o service worker.
 *
 * O content.js roda em MAIN world (necessário para interceptar fetch/XHR),
 * mas MAIN world não tem acesso a chrome.runtime.sendMessage.
 * Este relay roda em ISOLATED world (padrão), escuta postMessage e encaminha
 * para o background via chrome.runtime.sendMessage.
 */
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // Filtro rigoroso para evitar capturar mensagens de outros scripts (ex: GTM, Facebook)
  if (!event.data || !event.data._soe_internal) return;
  
  const validTypes = [
    'SOE_TEC_DATA',
    'SOE_TEC_INCREMENT_STATS',
    'SOE_TEC_WRONG_QUESTION',
    'SOE_TEC_AI_MENTOR',
    'SOE_GENERATE_FLASHCARD',
    'SOE_TEC_CADERNOS_LIST',
    'SOE_TEC_BANCA_INCREMENT',
  ];
  
  if (!validTypes.includes(event.data.type)) return;

  chrome.runtime.sendMessage(event.data, (response) => {
    const err = chrome.runtime.lastError?.message;
    if (err) {
      console.warn('[SOE Relay] Erro ao enviar:', err);
    }
    if (event.data.messageId) {
      window.postMessage({ 
        type: event.data.type + '_RESPONSE', 
        messageId: event.data.messageId, 
        response, 
        error: err 
      }, '*');
    }
  });
});
