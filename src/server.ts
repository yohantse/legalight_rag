import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { db, embed, geminiModel, toVectorLiteral } from "./lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve web frontend from public directory
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

/**
 * API Endpoint: Process user question via RAG pipeline
 */
app.post("/api/query", async (req, res) => {
  const startTime = Date.now();
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "Question is required and must be text." });
    }

    const cleanQuestion = question.trim();

    // 1. Embed question using Xenova transformer (384-dim)
    const queryEmbedding = await embed(cleanQuestion);

    // 2. Retrieve top 5 matching chunks from pgvector database
    const { rows } = await db.query(
      `SELECT source, chunk_index, content, embedding <=> $1 AS distance
       FROM document_chunks
       ORDER BY distance ASC
       LIMIT 5`,
      [toVectorLiteral(queryEmbedding)]
    );

    // 3. Build grounded context block
    const context = rows
      .map((r, i) => `[Source ${i + 1}: ${r.source} (Chunk #${r.chunk_index})]\n${r.content}`)
      .join("\n\n---\n\n");

    // 4. Generate grounded response using Gemini
    const result = await geminiModel.generateContent(
      `Answer the question using only the context below. If the context doesn't contain the answer, say so clearly instead of guessing.

Context:
${context}

Question: ${cleanQuestion}`
    );

    const answer = result.response.text();
    const durationMs = Date.now() - startTime;

    const sources = rows.map((r) => ({
      source: r.source,
      chunkIndex: r.chunk_index,
      content: r.content,
      distance: parseFloat(Number(r.distance).toFixed(4)),
    }));

    return res.json({
      question: cleanQuestion,
      answer,
      sources,
      durationMs,
    });
  } catch (err: any) {
    console.error("Query Error:", err);
    return res.status(500).json({
      error: err.message || "An error occurred while processing your request.",
    });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Fallback to index.html for SPA routing
app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Legalight RAG Server running at http://localhost:${PORT}`);
});
