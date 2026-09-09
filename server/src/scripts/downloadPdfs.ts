import fs from "fs";
import path from "path";

const csvPath = path.resolve(
  __dirname,
  "../../../nirf_2025_engineering_top90.csv"
);
const outDir = path.resolve(__dirname, "../../nirf_pdfs");
fs.mkdirSync(outDir, { recursive: true });

interface Row {
  rank: string;
  institute_id: string;
  institute_name: string;
  pdf_url: string;
}

async function main() {
  const lines = fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const rows: Row[] = lines.slice(1).map((l) => {
    const [rank, id, name, url] = l.split(",");
    return { rank, institute_id: id, institute_name: name, pdf_url: url };
  });

  console.log(`Found ${rows.length} rows`);

  const results: string[] = [];
  for (const [i, r] of rows.entries()) {
    const dest = path.join(outDir, `${r.institute_id}.pdf`);
    results.push(`${r.rank}\t${r.institute_id}\t${r.institute_name}`);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      results.push(`\tSKIP (already exists)`);
      continue;
    }
    try {
      const res = await fetch(r.pdf_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buff = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buff);
      results.push(`\tOK ${buff.length}B`);
    } catch (e: any) {
      results.push(`\tFAIL ${e.message}`);
    }
  }

  console.log(results.join("\n"));
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
