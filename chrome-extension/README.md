# SOE — Extensão Chrome para Sync TEC Concursos

Sincroniza automaticamente seu desempenho no TEC Concursos com o SOE, sem Tampermonkey, sem configuração complicada.

## Como instalar

1. Abra o Chrome e acesse `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (toggle no canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `chrome-extension/` deste projeto
5. A extensão aparece na barra do Chrome com o ícone roxo 📚

## Como configurar (uma vez só)

1. Clique no ícone da extensão na barra do Chrome
2. No campo **URL do SOE**, coloque o endereço onde o SOE está rodando:
   - Uso local: `http://localhost:3000`
   - Uso em rede: `http://192.168.1.X:3000`
3. No SOE, vá em **Mentor → Sync TEC → Gerar Token** e copie o token
4. Cole o token no campo **Token de Acesso** do popup
5. Clique **Salvar** e depois **Testar conexão**

## Como funciona

Depois de configurar, você não precisa fazer mais nada.

Ao abrir qualquer caderno no TEC Concursos (`tecconcursos.com.br/questoes/cadernos/*`), a extensão:

1. **Intercepta silenciosamente** as respostas da API interna do TEC (fetch + XHR)
2. **Detecta dados de desempenho** por assunto automaticamente
3. **Envia para o SOE em background** via `POST /api/tec/caderno-push`
4. **Mostra ✓ no ícone** após sincronizar com sucesso
5. **Dispara uma notificação** com o resumo (ex: "3 assuntos atualizados")

Se a API do TEC não for interceptada (ex: dados já carregados em cache), a extensão faz um scraping da tabela HTML como fallback.

## Diferenças em relação ao Tampermonkey

| | Tampermonkey | Extensão Chrome |
|---|---|---|
| Instalação | Instala Tampermonkey + copia script manualmente | Instala a pasta uma vez |
| Atualização | Requer copiar novo script | Só recarregar em `chrome://extensions` |
| Arquitetura | Script único no MAIN world | Content + Background com MV3 |
| Permissões | `@grant GM_*` — API própria | `chrome.storage`, `chrome.notifications` |
| Notificações | Não tem | Sim — notificação nativa do Chrome |
| Badge no ícone | Não tem | Sim — mostra ✓ / ✗ / ... |
| Confiabilidade | Depende de GreaseMonkey API | API nativa do Chrome |

## Troubleshooting

**"Token não configurado"** — Abra o popup e configure o token.

**"Erro de rede"** — Verifique se o SOE está rodando na URL configurada. Se estiver em localhost, certifique-se que a porta está correta.

**Dados não sincronizados** — Abra o DevTools do Chrome (F12) na aba do TEC e filtre por `[SOE]` no console. Você verá os logs de captura.

**Extensão não aparece** — Certifique-se que o "Modo do desenvolvedor" está ativado em `chrome://extensions`.
