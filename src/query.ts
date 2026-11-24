import { db, embed, geminiModel, toVectorLiteral } from "./lib.js";

/**
 * Usage: npm run query -- "What does the document say about X?"
 */
async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: npm run query -- "your question"');
    process.exit(1);
  }

  // 1. Embed the question the same way we embedded the chunks
  const queryEmbedding = await embed(question);

  // 2. Retrieve the most similar chunks via cosine distance (<=> operator, pgvector)
  const { rows } = await db.query(
    `SELECT source, chunk_index, content, embedding <=> $1 AS distance
     FROM document_chunks
     ORDER BY distance ASC
     LIMIT 5`,
    [toVectorLiteral(queryEmbedding)]
  );

  console.log(`Retrieved ${rows.length} chunks:`);
  rows.forEach((r, i) =>
    console.log(`  [${i + 1}] ${r.source} #${r.chunk_index} (distance: ${r.distance.toFixed(4)})`)
  );

  // 3. Build a grounded context block from retrieved chunks
  const context = rows
    .map((r, i) => `[Source ${i + 1}: ${r.source}]\n${r.content}`)
    .join("\n\n---\n\n");

  // 4. Ask Gemini to answer using ONLY the retrieved context
  const result = await geminiModel.generateContent(
    `Answer the question using only the context below. If the context doesn't contain the answer, say so clearly instead of guessing.

Context:
${context}

Question: ${question}`
  );

  const answer = result.response.text();

  console.log("\n--- Answer ---\n");
  console.log(answer);

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
