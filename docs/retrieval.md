# Retrieval

## Current behavior

Chunks use `BAAI/bge-small-en-v1.5` at 384 dimensions when the model is available. The stored `embedding_model` identifies the embedding source. PostgreSQL stores `tsvector` generated from chunk content and a GIN index, plus a pgvector HNSW cosine index.

The assistant performs lexical ranking with `ts_rank` and semantic ranking by cosine distance. When an embedding can be created, reciprocal-rank fusion sums `1 / (60 + rank)` from both ranked lists. Without a local model, it falls back to full-text retrieval. SQL RLS and document scope policies are the authorization filter; application-side post-filtering is not used as the boundary.

Semantic retrieval filters by the configured model identifier. The worker marks ingestion failed if it finds chunks from another model in the tenant, preventing silent vector mixing. The application does not provide an automatic reindex workflow; changing models requires a deliberate full reindex.

Chunk size is a bounded character window. PDF page numbers are preserved; TXT and Markdown chunks have no invented page. Source offsets are tracked within extracted text. Markdown headings are not preserved robustly, and token counts are estimates rather than model-tokenizer counts.

## Limits

The sample handles one intent family: upcoming lease expirations and renewal notices. It does not infer legal obligations from clauses. Structured lease values are treated as entered facts; document excerpts are displayed separately as evidence. The application does not provide general-purpose contradiction resolution, broad domain routing, recall/precision benchmarking, or model-specific reindex tooling.
