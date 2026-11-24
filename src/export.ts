import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportChunks() {
  console.log("Fetching document chunks and vector embeddings from database...");
  
  const { rows } = await db.query(
    `SELECT source, chunk_index, content, embedding::text
     FROM document_chunks
     ORDER BY chunk_index ASC`
  );

  console.log(`Retrieved ${rows.length} chunks. Formatting data...`);

  const formattedData = rows.map((r) => {
    // Parse pgvector vector string '[0.123, -0.456, ...]' into Float array
    const embeddingArray = JSON.parse(r.embedding);
    return {
      source: r.source,
      chunkIndex: r.chunk_index,
      content: r.content,
      embedding: embeddingArray,
    };
  });

  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "chunks.json");
  fs.writeFileSync(outputPath, JSON.stringify(formattedData, null, 2));

  console.log(`✅ Exported ${formattedData.length} chunks to ${outputPath}`);
  await db.end();
}

exportChunks().catch((err) => {
  console.error("Export Error:", err);
  process.exit(1);
});
