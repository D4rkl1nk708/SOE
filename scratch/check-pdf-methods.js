import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse/node");
const parser = new PDFParse();
console.log("Keys of parser instance:", Object.keys(parser));
console.log("Proto keys:", Object.keys(Object.getPrototypeOf(parser)));
