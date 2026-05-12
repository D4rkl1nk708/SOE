# TEC Scraper

Este é um projeto independente para extrair questões do TEC Concursos e salvá-las em formato JSON.

## Como usar

1.  **Instalação**:

    ```bash
    cd tec-scraper
    npm install
    npx playwright install chromium
    ```

2.  **Execução**:

    ```bash
    node index.js
    ```

3.  **Funcionamento**:
    - O script abrirá uma janela do navegador Chrome.
    - Faça login manualmente no TEC Concursos.
    - Quando você abrir um caderno ou navegar pelas questões, o script detectará as respostas JSON vindas do servidor do TEC e as salvará automaticamente na pasta `./data`.

## Vantagens

- **Independência**: Você salva os dados brutos e pode importá-los para o SOE sem depender da assinatura ativa no futuro.
- **Estruturado**: Captura o JSON original, que é muito mais fácil de processar que o HTML.

## Aviso

Use com moderação para evitar bloqueios de conta.
