const $ = id => document.getElementById(id);

// Carrega config salva
chrome.storage.sync.get(['soeUrl', 'soeToken'], ({ soeUrl, soeToken }) => {
  if (soeUrl)   { $('soe-url').value = soeUrl;     $('url-saved').style.display = ''; }
  if (soeToken) { $('soe-token').value = soeToken; $('token-saved').style.display = ''; }
});

function showStatus(msg, type = 'info') {
  const el = $('status');
  el.className = `status ${type}`;
  el.innerHTML = msg;
}

// Salvar
$('btn-save').addEventListener('click', () => {
  const soeUrl   = $('soe-url').value.trim();
  const soeToken = $('soe-token').value.trim();
  if (!soeUrl || !soeToken) {
    showStatus('Preencha a URL e o token antes de salvar.', 'err');
    return;
  }
  chrome.storage.sync.set({ soeUrl, soeToken }, () => {
    $('url-saved').style.display   = '';
    $('token-saved').style.display = '';
    showStatus('✅ Configuração salva! Agora abra qualquer caderno no TEC Concursos.', 'ok');
  });
});

// Testar conexão
$('btn-test').addEventListener('click', () => {
  const soeUrl   = $('soe-url').value.trim();
  const soeToken = $('soe-token').value.trim();
  if (!soeUrl || !soeToken) {
    showStatus('Preencha a URL e o token para testar.', 'err');
    return;
  }
  showStatus('Testando conexão…', 'info');
  chrome.runtime.sendMessage({ type: 'SOE_TEST_CONNECTION', soeUrl, soeToken }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('Erro interno: ' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (response?.ok) {
      showStatus(`✅ Conectado! Olá, <strong>${response.userName || 'usuário'}</strong>.<br/>A extensão está pronta para sincronizar.`, 'ok');
    } else {
      showStatus(`❌ Falha na conexão:<br/>${response?.error || 'Verifique a URL e o token.'}<br/><br/>O SOE está rodando em <code>${soeUrl}</code>?`, 'err');
    }
  });
});
