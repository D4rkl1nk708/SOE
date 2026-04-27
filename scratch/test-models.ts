const apiKey = process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE";

async function main() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  const data = await res.json();
  console.log(data.models.map((m: any) => m.name).join(", "));
}
main();
