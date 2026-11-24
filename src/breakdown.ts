import fs from "node:fs";
import path from "node:path";
import { chunkText, geminiModel } from "./lib.js";

/**
 * Document breakdown mode — different from RAG retrieval.
 * The whole document IS the context. We chunk it (by clause/section ideally,
 * falling back to size-based chunking), explain each piece in plain language,
 * flag anything risky or unusual, then produce a summary.
 *
 * Usage: npm run breakdown -- ./docs/sample-contract.txt
 */

interface ClauseBreakdown {
  chunkIndex: number;
  original: string;
  explanation: string;
}

async function explainChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<ClauseBreakdown> {
  const result = await geminiModel.generateContent(
    `You are a legal assistant explaining a contract to a non-lawyer. This is section ${chunkIndex + 1} of ${totalChunks} from a legal document.

Explain what this section means in plain, simple language. If there's anything unusual, one-sided, or worth paying attention to, flag it clearly. If the section is standard boilerplate with nothing noteworthy, say so briefly rather than padding the explanation.

Section text:
"""
${chunk}
"""

Respond with just the explanation, no preamble.`
  );

  const explanation = result.response.text();

  return { chunkIndex, original: chunk, explanation };
}

async function summarize(breakdowns: ClauseBreakdown[]): Promise<string> {
  const allExplanations = breakdowns
    .map((b) => `Section ${b.chunkIndex + 1}: ${b.explanation}`)
    .join("\n\n");

  const result = await geminiModel.generateContent(
    `Below are section-by-section explanations of a legal document. Write a short overall summary (5-8 sentences) covering: what kind of document this is, the key obligations for each party, and the 2-3 most important things a non-lawyer should pay attention to before signing.

${allExplanations}`
  );

  return result.response.text();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run breakdown -- <path-to-document.txt>");
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, "utf-8");
  // Larger chunks than the RAG pipeline — we want roughly clause-sized pieces,
  // not tiny fragments, since each one gets explained on its own.
  const chunks = chunkText(text, 1500, 100);

  console.log(`Breaking down "${path.basename(filePath)}": ${chunks.length} sections\n`);

  const breakdowns: ClauseBreakdown[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Explaining section ${i + 1}/${chunks.length}...`);
    breakdowns.push(await explainChunk(chunks[i], i, chunks.length));
  }

  console.log("\n=== SECTION-BY-SECTION BREAKDOWN ===\n");
  breakdowns.forEach((b) => {
    console.log(`--- Section ${b.chunkIndex + 1} ---`);
    console.log(b.explanation);
    console.log();
  });

  console.log("Generating overall summary...\n");
  const summary = await summarize(breakdowns);

  console.log("=== OVERALL SUMMARY ===\n");
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
