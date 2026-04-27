import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

async function main() {
  const buffer = fs.readFileSync(
    "Tec Concursos - Questões para concursos, provas, editais, simulados_.pdf",
  );
  const data = await pdfParse(buffer);
  console.log("Total length:", data.text.length);
  console.log("Sample (first 1000):", data.text.substring(0, 1000));
}

main();
