const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function extractPdfText() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('\x1b[31m[ERRO] Por favor, forneça o caminho do arquivo PDF.\x1b[0m');
        console.log('Exemplo: node pdf-to-text.js meu_curso.pdf');
        process.exit(1);
    }

    const pdfPath = args[0];
    if (!fs.existsSync(pdfPath)) {
        console.error(`\x1b[31m[ERRO] Arquivo não encontrado: ${pdfPath}\x1b[0m`);
        process.exit(1);
    }

    console.log(`\x1b[36m[SISTEMA] Lendo PDF: ${path.basename(pdfPath)}...\x1b[0m`);

    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdf(dataBuffer);

        const outputFileName = 'extracted_pdf_text.txt';
        fs.writeFileSync(outputFileName, data.text);

        console.log('\x1b[32m[SUCESSO] Texto extraído com sucesso!\x1b[0m');
        console.log(`\x1b[33m[PRÓXIMO PASSO] O texto está em: ${outputFileName}\x1b[0m`);
        console.log('\x1b[33mAbra este arquivo, copie o conteúdo e mande para a IA transformar em JSON.\x1b[0m');
        
        // Exibe um resumo
        console.log('\x1b[34m--- Resumo do Arquivo ---\x1b[0m');
        console.log(`Páginas: ${data.numpages}`);
        console.log(`Caracteres: ${data.text.length}`);
        console.log('-------------------------');

    } catch (error) {
        console.error('\x1b[31m[ERRO FATAL] Falha ao processar o PDF:\x1b[0m', error.message);
    }
}

extractPdfText();
