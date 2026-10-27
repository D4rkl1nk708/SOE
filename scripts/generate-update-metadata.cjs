const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const [, , platform, version, filePath, outputPath] = process.argv;
if (!platform || !version || !filePath || !outputPath) {
  console.error("Uso: node generate-update-metadata.cjs <win|linux> <version> <arquivo> <saida>");
  process.exit(1);
}

const absoluteFile = path.resolve(filePath);
if (!fs.existsSync(absoluteFile)) {
  console.error("Arquivo não encontrado:", absoluteFile);
  process.exit(1);
}

const data = fs.readFileSync(absoluteFile);
const sha512 = crypto.createHash("sha512").update(data).digest("base64");
const size = data.length;
const fileName = path.basename(absoluteFile);
const releaseDate = new Date().toISOString();
const yaml = [
  `version: ${version}`,
  "files:",
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  "",
].join("\n");

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), yaml, "utf8");
console.log(`[update] ${platform} ${version} -> ${outputPath} (${fileName}, ${size} bytes)`);
