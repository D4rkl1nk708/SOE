# SOE - Sistema de Organização de Estudos

Uma plataforma adaptativa baseada no método 25/50 dias + testes aleatórios. Focada em otimizar e acompanhar a curva do esquecimento do estudante.

## 1. Visão Geral

O SOE atua como um companheiro inteligente de aprendizagem. Mais do que um rastreador de editais, atua automatizando picos de revisão e rastreando métricas de retenção (acertos vs. erros).
Os dados não exigem conectividade de nuvem central; residem de modo **100% offline via Local JSON Storage** em seu aparelho rodando SOE, protegendo a privacidade e removendo dependência de servidores web.

### 1.1 Ecossistema Multi-Plataforma

Este projeto foi arquitetado em Electron/React/Capacitor para rodar de forma pervasiva:

- **Computador Local:** Windows / Linux via Electron gerando uma janela focada sem distrações.
- **Android:** Um aplicativo (.apk) fechado empacotado usando Capacitor. Totalmente offline e com suporte à API QR Code para sincronização PC-Celular.
- **Acesso Web (PWA):** Construção `dist` pronta que pode ser publicada como página hospedada online suportando instalação de PWA progressiva em aparelhos móveis via navegadores web (Chrome/Safari).

---

## 2. Construção & Empacotamento

A compilação e a distribuição cobrem tanto ambientes experimentais com dados fictícios ("Dados de Exemplo") quanto _limpos_ para empacotar o executável do usuário final.

### Setup de Desenvolvimento

Inicia a plataforma com dados `mocked` para desenvolvimento interativo rápido:

```bash
npm install
npm run dev               # Abre pelo navegador padrão na porta 3000
npm run desktop:dev       # Abre com a janela nativa Desktop Electron
```

### Build Limpa (Produção Final Sem Dados Falsos)

```bash
npm run build:clean
```

### Geração de Executáveis de Distribuição

Os artefatos são cuspíveis na pasta oculta local `./release/`.

```bash
# Distribuição Linux (.AppImage independente)
npm run desktop:build:linux

# Distribuição Windows Installer (.exe baseado em NSIS)
npm run desktop:build:win

# Build Android (APK assinado não necessita servidor web)
npm run android:apk
# Retirada do pacote debug: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 3. Gestão de Dados & Sync

Por não possuir banco _Cloud_ proprietário por questões de simplicidade técnica e portabilidade, a plataforma atua **exportando** e **importando** faxes da sua vida escolar (Extensão de Save `.json`).

- Exporte via `Dashboard > Exportar Dados` num equipamento.
- Importe este mesmo arquivo `.json` gerado para atualizar ou recuperar seu progresso vital (Cuidado: A função "Importar" sobrescreve massivamente o banco de dados da máquina instaladora e sua ação de apagar é permanente).
- No Desktop, o núcleo reside na pasta secreta `DATA_DIR` ligada ao Electron. No mobile (Android e iOS Web), o volume transaciona sob as entranhas invisíveis de armazenamento nativo IndexedDB.

---

## 4. O Mentor Socrático (Inteligência Artificial)

Na base da evolução pedagógica do App reside o Algoritmo Tutor Adaptativo, integrando suporte de LLM externo no lado do cliente:

- **Configuração Primordial:** Navegue pelo menu `Mentor IA` -> e posicione individualmente a sua chave de Provedor IA favorita (suporta Google Gemini, OpenAI ou Anthropic Claude). Nenhuma API de Inteligência vai vazar pro SOE principal, é tudo no `localStorage`.
- **F-M1 Perfil Fraco:** Faz pontuação (Score= 1 a 100) baseada nos seus calcanhares (0= Forte, 100= Total Dificuldade). É avaliado por intermédio das respostas das sessões prévias do sistema.
- **F-M2 Briefing Diário:** Sumariza atividades do dia (Sessões agendadas vs Disciplinas caídas), e formula dicas na página frontal todos os dias matutinos.
- **Janela de Diagnóstico Exato (F-M4):** Com base num gabarito mal batido na hora do Socrático (ou Navegador Especial na Nuvem), formula de modo cirúrgico o seu erro, criando macetes técnicos em "Dicas de Sobrevivência" e obrigando 2 questões inéditas de fixação artificial antes de avanços.
- **Navegador Concursos Híbrido Próprio:** Embutido de forma nativa e ilimitada no núcleo Electron para interceptar as respostas com sucesso através de interceptadores IPC seguros; ele não é dependente de Extensão do Google Chrome isolada e funciona limpo.

---

## 5. Changelog / Histórico

- **v5.5.0**: Sistema de Mineração Sequential AI (motor massivo para 200+ questões com chunking e desduplicação), Redesign do Command Center no Calendário (timeline vertical de alta densidade), Integração do Treino de Elite com o Mentor IA, e correções críticas de tipagem e performance.
- **v5.4.0**: Super Inteligência Preditiva. Implementação de Mapeamento Psicológico de Distratores (detecção automática de viés cognitivo por tipo de alternativa errada), Auditoria de Pico de Performance (Time-of-Day Tracking com médias por horário), Peso Dinâmico por Edital (ROI inteligente), Simulador de Questão Maliciosa (já integrado ao briefing), e Simulação de Monte Carlo (predictive readiness com 1000 simulações).
- **v5.3.0**: Salto evolutivo na Cognição da Inteligência Artificial. Implementação de Memória Histórica Punitiva (recordação dos últimos 5 diagnósticos), Modulação Psicológica Automática (Tone-Shifting de burnout/general), Detecção de Fuga Cognitiva (Ego-Inflation) e Bypass de Emergência no agendamento (inclusão de revisões críticas no mesmo dia).
- **v5.2.1**: Implementada robustez avançada no "Mentor de IA" (aumento do limite de tokens para evitar truncamento no Gemini 2.0/3.0, novo fallback em Regex para lidar com quebras de linha e aspas soltas, e testes automatizados).
- Saída do backend SQL global para modelo de arquitetura _Serverless/Client-Side_ IndexedDB / Data JSON local.
- Adição dos fluxos de Flashcards dinâmicos.
- Otimização mobile-first do React (remoção de falhas e bugs de overflow no layout, implantação progressiva do Capacitor PWA).
- Refatoração total para comunicação nativa com o **TEC Concursos** abrindo em janela dedicada `BrowserWindow` usando IPC ao invés de webview, evadindo limitação de `ContextIsolation` e Chrome Extensions.
