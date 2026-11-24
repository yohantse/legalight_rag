# legalight_rag

A minimal RAG pipeline for legal documents: chunk → embed → store in pgvector → retrieve → generate.

Supports two modes:

- **Query mode** — ask a question and get an answer grounded in the retrieved document chunks.
- **Breakdown mode** — feed a document and get a plain-language explanation of every section, plus an overall summary.

No framework overhead — every step of the pipeline is visible in the source.

## Stack

| Layer | What |
| --- | --- |
| Embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` — runs **locally**, no API key, no cost |
| Vector store | Postgres + pgvector (`VECTOR(384)`) |
| Database | [Neon](https://neon.tech) (serverless Postgres) |
| Generation | Gemini (`gemini-flash-latest`) via `@google/generative-ai` |
| Runtime | Node.js + TypeScript (`tsx`) |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/yohantse/legalight_rag.git
cd legalight_rag
npm install
```

> **Note:** The first `ingest` or `query` run downloads the embedding model (~90 MB) and caches it locally. Subsequent runs are instant.

### 2. Set up the database

This project uses [Neon](https://neon.tech) (free tier works). Create a project, grab the connection string, then run the schema:

```bash
psql $DATABASE_URL -f schema.sql
```

If you prefer a local Postgres with pgvector:

```bash
docker run -d --name rag-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16
psql postgresql://postgres:postgres@localhost:5432/postgres -f schema.sql
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL=postgresql://...   # Neon connection string (or local)
GOOGLE_API_KEY=AIza...          # https://aistudio.google.com/apikey — free tier, no card needed
```

## Usage

Place any plain-text document in a `docs/` folder. PDF → export to `.txt` first, or paste the text directly.

### Ingest a document

```bash
npm run ingest -- ./docs/contract.txt
```

Each chunk is embedded and stored in Postgres. You'll see progress logged per chunk.

### Query a document

```bash
npm run query -- "What are the termination conditions?"
```

Retrieves the top-5 most similar chunks by cosine distance, then asks Gemini to answer using only that context. Distance scores are printed so you can see retrieval quality.

### Break down a document

```bash
npm run breakdown -- ./docs/contract.txt
```

Chunks the document into larger clause-sized pieces and sends each one to Gemini with a prompt asking for a plain-language explanation. Flags anything unusual or one-sided. Ends with a 5–8 sentence overall summary covering key obligations and what to watch out for before signing.

## Project structure

```text
src/
  lib.ts        # Shared utilities: DB pool, Gemini client, embed(), chunkText(), toVectorLiteral()
  ingest.ts     # Reads a .txt file, chunks it, embeds each chunk, stores in pgvector
  query.ts      # Embeds a question, retrieves top-5 chunks, generates a grounded answer
  breakdown.ts  # Section-by-section plain-language breakdown + overall summary
schema.sql      # Creates the document_chunks table and vector index (run once)
```

## Key implementation details

- **Chunking** (`lib.ts`): Fixed-size character chunking with overlap (`chunkSize=800, overlap=150` for ingest; `chunkSize=1500, overlap=100` for breakdown). Intentionally simple — swap in semantic/structure-aware chunking as a next step.
- **Embeddings**: `all-MiniLM-L6-v2` produces 384-dimensional vectors. Runs entirely locally after first download.
- **Retrieval**: Uses pgvector's cosine distance operator (`<=>`) with `ORDER BY distance ASC LIMIT 5`.
- **Generation**: Gemini is prompted to answer using *only* the retrieved context, and to explicitly say so if the context doesn't contain the answer.
- **Breakdown mode**: Uses larger chunks (1500 chars) so each piece represents a full clause rather than a fragment. Each chunk gets its own Gemini call, then a final summarization call over all explanations.

## Next steps / stretch goals

- [ ] Replace fixed-size chunking with structure-aware chunking (paragraph or clause boundaries)
- [ ] Add hybrid search (full-text + vector) — the `schema.sql` has commented-out columns ready for this
- [ ] Add an IVFFlat index on the embedding column once you have thousands of chunks
- [ ] Parse PDFs directly instead of requiring a `.txt` export
- [ ] Add a web UI
