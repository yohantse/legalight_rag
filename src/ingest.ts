import fs from "node:fs";
import path from "node:path";
import { db, embed, chunkText, toVectorLiteral } from "./lib.js";

/**
 * Usage: npm run ingest -- ./docs/some-file.txt
 *
 * Point this at any plain-text file to start (export a PDF/doc to .txt for now —
 * proper PDF/HTML parsing is a nice Week 1 stretch goal once this works end to end).
 */
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run ingest -- <path-to-text-file>");
    process.exit(1);
  }

  const source = path.basename(filePath);
  const text = fs.readFileSync(filePath, "utf-8");
  const chunks = chunkText(text);

  console.log(`Ingesting "${source}": ${chunks.length} chunks`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await embed(chunk);

    await db.query(
      `INSERT INTO document_chunks (source, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4)`,
      [source, i, chunk, toVectorLiteral(embedding)]
    );

    console.log(`  chunk ${i + 1}/${chunks.length} embedded and stored`);
  }

  console.log("Done.");
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
