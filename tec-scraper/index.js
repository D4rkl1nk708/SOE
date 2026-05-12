require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function scrapeTec() {
  console.log('\x1b[42m\x1b[30m --- TEC SCRAPER v5.6 (OLHO DE ÁGUIA) --- \x1b[0m');
  console.log('Instruções: [i] Iniciar | [p] Pausar | [e] Extrair Aba Índice | [q] Sair');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const notebooks = {};
  let lastActiveId = 'avulso';
  let isRunning = false;
  let currentQuestionJson = null;
  let questionCount = 0;
  let lastScrapedQId = null;

  // AUTO-LOGIN
  await page.goto('https://www.tecconcursos.com.br/login');
  if (process.env.TEC_USER && process.env.TEC_PASS) {
    try {
      await page.fill('input[type="email"]', process.env.TEC_USER);
      await page.fill('input[type="password"]', process.env.TEC_PASS);
      await page.click('button[type="submit"]');
    } catch (e) {}
  }

  const loadNotebook = (id) => {
      if (notebooks[id]) return;
      let loaded = false;
      if (fs.existsSync(dataDir)) {
          const files = fs.readdirSync(dataDir);
          for (const f of files) {
              if (f.startsWith(`caderno_${id}`) && f.endsWith('.json') && !f.includes('incidencia')) {
                  try {
                      notebooks[id] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
                      loaded = true;
                      break;
                  } catch(e) {}
              }
          }
      }
      if (!loaded) notebooks[id] = { metadata: {}, questions: [] };
  };

  const saveToDisk = (id) => {
    const data = notebooks[id];
    if (!data || data.questions.length === 0) return;
    let subject = data.questions[0].materia || 'diversos';
    subject = subject.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '_').toLowerCase();
    const name = `caderno_${id}_${subject}`;
    const filename = path.join(dataDir, `${name}.json`);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\x1b[32m[DISCO] Sincronizado: ${name}.json (${data.questions.length} questões)\x1b[0m`);
  };

  const scrapeCycle = async () => {
    if (!isRunning) return;
    try {
      // 1. RESPONDER A QUESTÃO (Selecionar primeira alternativa)
      await page.evaluate(() => {
        // Primeiro tenta encontrar um input radio
        const firstRadio = document.querySelector('input[type="radio"]');
        if (firstRadio) {
            firstRadio.click();
        } else {
            // Fallback para divs/labels clicáveis
            const opt = document.querySelector('.q-alternativa, .option, [class*="alternativa"]');
            if (opt) opt.click();
        }
      });

      // Função para simular tempo humano (rápido)
      const delay = (min, max) => page.waitForTimeout(Math.floor(Math.random() * (max - min + 1)) + min);

      await delay(200, 400);

      // 2. REVELAR RESPOSTA (Pressionar Enter)
      await page.keyboard.press('Enter');

      // 2. ESPERA O GABARITO APARECER
      await delay(700, 1200);

      // 3. CAPTURA O GABARITO (LÓGICA REFORÇADA)
      const gabarito = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // 1. Busca explícita por texto
        const feedback = bodyText.match(/(?:Gabarito|Resposta):\s*([A-E]|Certo|Errado|C|E)\b/i);
        if (feedback) {
            const txt = feedback[1].toUpperCase();
            if (txt.includes('CERT') || txt === 'C') return 'C';
            if (txt.includes('ERRAD') || txt === 'E') return 'E';
            return txt;
        }

        // 2. Elementos com marcação visual de correto (incluindo novos seletores do TEC)
        const correctElement = document.querySelector('.correta, .q-certa, .success, .text-success, [class*="bg-success"], i.fa-check, svg.text-success, .resposta-correta, [style*="rgb(223, 240, 216)"]');
        if (correctElement) {
          const container = correctElement.closest('label, .q-alternativa, .option, [class*="alternativa"], li');
          if (container) {
              const text = container.innerText.trim().toUpperCase();
              if (/^CERTO|^C\b/.test(text)) return 'C';
              if (/^ERRADO|^E\b/.test(text)) return 'E';

              const all = Array.from(document.querySelectorAll('label, .q-alternativa, .option, [class*="alternativa"], li'));
              const validOptions = all.filter(el => el.querySelector('input[type="radio"]') || el.classList.contains('q-alternativa') || el.querySelector('.q-texto-alternativa'));
              const listToUse = validOptions.length > 0 ? validOptions : all;
              const idx = listToUse.indexOf(container);
              if (idx !== -1) {
                  if (listToUse.length === 2) return idx === 0 ? 'C' : 'E';
                  return String.fromCharCode(65 + idx);
              }
          }
        }

        // 3. Mensagem de Acerto (Como o robô chuta a primeira, se acertou a resposta é a primeira)
        if (/Você acertou|Parabéns|Resposta correta|Acertou\b/i.test(bodyText)) {
            const selected = document.querySelector('input[type="radio"]:checked');
            if (selected) {
                const container = selected.closest('label, .q-alternativa, li, div');
                if (container) {
                    const text = container.innerText.trim().toUpperCase();
                    if (/^CERTO|^C\b/.test(text)) return 'C';
                    if (/^ERRADO|^E\b/.test(text)) return 'E';
                }
                const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
                const idx = allRadios.indexOf(selected);
                if (idx !== -1) {
                    if (allRadios.length === 2) return idx === 0 ? 'C' : 'E';
                    return String.fromCharCode(65 + idx);
                }
            } else {
                const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
                if (allRadios.length === 2) return 'C';
                return 'A';
            }
        }

        // 4. Inputs com atributos de correto
        const correctRadio = document.querySelector('input[type="radio"][aria-invalid="false"], input[type="radio"].correta');
        if (correctRadio) {
            const val = correctRadio.value || correctRadio.getAttribute('data-value');
            if (val && /^[A-E]$/i.test(val)) return val.toUpperCase();
            if (val && /certo|C/i.test(val)) return 'C';
            if (val && /errado|E/i.test(val)) return 'E';
        }

        return null;
      });

      if (currentQuestionJson) {
        const q = currentQuestionJson;
        const id = lastActiveId;
        loadNotebook(id);
        const qId = q.idQuestao || q.id;

        if (qId && !notebooks[id].questions.find(item => item.id == qId)) {
          // Limpa as tags HTML do enunciado e das alternativas
          const cleanData = await page.evaluate(({ enunc, alts }) => {
              const div = document.createElement('div');
              const clean = (html) => {
                  if (!html) return '';
                  div.innerHTML = html;
                  return div.innerText.replace(/\s+/g, ' ').trim();
              };
              return {
                  enunciado: clean(enunc),
                  alternativas: alts.map(a => clean(a.texto || a))
              };
          }, { enunc: q.enunciado, alts: q.alternativas || [] });
          
          notebooks[id].questions.push({
            id: qId,
            enunciado: cleanData.enunciado,
            alternativas: cleanData.alternativas,
            gabarito: gabarito,
            materia: q.nomeMateria,
            assunto: q.nomeAssunto,
            banca: q.bancaSigla,
            ano: q.concursoAno
          });
          console.log(`\x1b[36m[OK] #${qId} | Gabarito: ${gabarito || '?'}\x1b[0m`);
          saveToDisk(id);
          
          lastScrapedQId = qId;
        }
      }

      // 4. VERIFICAÇÃO DE FIM DE CADERNO (Questão X de Y)
      const isFinished = await page.evaluate(() => {
        // Tenta encontrar o padrão "Questão 1 de 300" no texto da página
        const match = document.body.innerText.match(/Quest[ãa]o\s+(\d+)\s+de\s+(\d+)/i);
        if (match) {
            return parseInt(match[1], 10) >= parseInt(match[2], 10);
        }
        
        // Fallback: Procura um elemento isolado que tenha exatamente "1 de 300"
        const elements = Array.from(document.querySelectorAll('span, div, b, strong'));
        for (const el of elements) {
            const innerMatch = el.innerText.trim().match(/^(\d+)\s+de\s+(\d+)$/i);
            if (innerMatch) {
                return parseInt(innerMatch[1], 10) >= parseInt(innerMatch[2], 10);
            }
        }
        return false;
      });

      if (isFinished) {
         isRunning = false;
         console.log('\x1b[32m[SISTEMA] Fim do caderno detectado pela numeração na tela!\x1b[0m');
         console.log('\x1b[33m||| ROBÔ PAUSADO. Escolha outro caderno na tela e aperte [i] para iniciar uma nova coleta limpa.\x1b[0m');
         return; // Interrompe antes de apertar a seta pra direita
      }

      // 5. PRÓXIMA
      await page.keyboard.press('ArrowRight');
      
    } catch (e) {}
  };

  const extractIncidenceFromScreen = async () => {
      try {
          const id = lastActiveId;
          const treeData = await page.evaluate(() => {
              const lines = Array.from(document.querySelectorAll('.tv-node, .tree-node, li, tr, div'));
              let results = [];
              const regexInline = /^(.+?)\s+(\d+)\s*\(\s*([\d.,]+)\s*%\s*\)$/m;
              const regexTwoLines = /^(.+?)\n(\d+)\s*\(\s*([\d.,]+)\s*%\s*\)$/m;

              for (const el of lines) {
                  const textContent = el.innerText.trim();
                  if (!textContent) continue;
                  
                  let match = textContent.match(regexTwoLines) || textContent.match(regexInline);
                  if (match) {
                      let assunto = match[1].replace(/^[•\-\.]\s*/, '').trim();
                      if (assunto && !assunto.match(/^Expandir|Retrair|Questões|Imprimir|Raciocínio Lógico/i)) { // Evita cabeçalhos genéricos
                          results.push({
                              assunto: assunto,
                              quantidade: parseInt(match[2], 10),
                              percentual: match[3] + '%'
                          });
                      }
                  }
              }
              return results;
          });

          if (treeData && treeData.length > 0) {
              const uniqueMap = new Map();
              treeData.forEach(item => uniqueMap.set(item.assunto, item));
              const unique = Array.from(uniqueMap.values());
              
              const incFile = path.join(dataDir, `incidencia_aba_indice_${id}.json`);
              fs.writeFileSync(incFile, JSON.stringify(unique, null, 2));
              console.log(`\x1b[32m[DISCO] Incidência salva da tela: incidencia_aba_indice_${id}.json (${unique.length} assuntos)\x1b[0m`);
          } else {
              console.log('\x1b[33m[AVISO] Nenhum dado de incidência encontrado na tela. Você está na aba "Índice"?\x1b[0m');
          }
      } catch (e) { console.error(e); }
  };

  page.on('response', async (res) => {
    try {
      if (res.headers()['content-type']?.includes('json')) {
        const json = await res.json();
        if (json.questao) currentQuestionJson = json.questao;
        const url = res.url();
        const match = url.match(/cadernos\/(\d+)/);
        const id = json.id_caderno || json.id || (match ? match[1] : lastActiveId);
        if (id && id !== 'avulso') lastActiveId = id;

        if (url.includes('indice') || url.includes('estatistica') || url.includes('relevancia') || json.arvore) {
            const incFile = path.join(dataDir, `incidencia_api_${id}.json`);
            fs.writeFileSync(incFile, JSON.stringify(json, null, 2));
            console.log(`\x1b[35m[DISCO] Dados da aba Índice capturados via API: incidencia_api_${id}.json\x1b[0m`);
        }

        loadNotebook(id);
        if (json.caderno) notebooks[id].metadata = { ...notebooks[id].metadata, ...json.caderno };
      }
    } catch (e) {}
  });

  const run = async () => {
    if (isRunning) {
      await scrapeCycle();
      questionCount++;
      
      if (questionCount >= 20) {
          console.log('\x1b[33m[SISTEMA] Pausa estratégica de 15s para esfriar o radar do Cloudflare...\x1b[0m');
          await page.waitForTimeout(15000);
          questionCount = 0;
      } else {
          // Pausa entre questões (1000ms a 1800ms)
          await page.waitForTimeout(Math.floor(Math.random() * 800) + 1000);
      }
    }
    setTimeout(run, 100);
  };
  run();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    if (key === 'i') { isRunning = true; console.log('>>> OLHO DE ÁGUIA ATIVADO...'); }
    else if (key === 'p') { isRunning = false; console.log('||| PAUSADO'); }
    else if (key === 'e') { 
        console.log('>>> Extraindo informações de incidência da aba Índice atual...');
        extractIncidenceFromScreen();
    }
    else if (key === 'q' || key === '\u0003') {
        Object.keys(notebooks).forEach(id => saveToDisk(id));
        process.exit();
    }
  });
}

scrapeTec().catch(err => console.error('Erro fatal:', err));
