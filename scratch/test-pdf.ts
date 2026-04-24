import fs from "fs";
import pdf from "pdf-parse";

async function testPdf() {
  const dataBuffer = fs.readFileSync("./edital_teste.pdf");
  try {
    const data = await pdf(dataBuffer);
    console.log("Text content:", data.text.substring(0, 500));
  } catch (err) {
    console.error("Error parsing PDF:", err);
  }
}

// testPdf();
