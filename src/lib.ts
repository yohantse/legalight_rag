import "dotenv/config";
import pg from "pg";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Agent, setGlobalDispatcher } from "undici";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// Some connections are slow enough that the default fetch timeout cuts off
// the embedding model's first-time download. This removes that limit.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Loaded once and reused — the model file (~90MB) downloads automatically
// the first time you run ingest/query, then it's cached locally.
let embedder: FeatureExtractionPipeline | null = null;

/**
 * Turns text into a 384-dim embedding vector, running fully locally —
 * no API key, no cost, no internet needed after the first model download.
 * Uses all-MiniLM-L6-v2, a small but solid general-purpose embedding model.
 */
export async function embed(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Naive fixed-size chunking with overlap. This is intentionally simple —
 * Week 2 is where you'll upgrade this to semantic/structure-aware chunking.
 */
export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

// pgvector expects a string like '[0.1,0.2,...]'
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
