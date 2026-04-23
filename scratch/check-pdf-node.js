import { createRequire } from "module";
const require = createRequire(import.meta.url);
const nodeMod = require("pdf-parse/node");
console.log("Keys of pdf-parse/node:", Object.keys(nodeMod));
if (nodeMod.default) {
    console.log("Keys of pdf-parse/node.default:", Object.keys(nodeMod.default));
}
