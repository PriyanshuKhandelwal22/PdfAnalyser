# Atlas Vector Search setup

Phase 3 stores manually generated `all-MiniLM-L6-v2` vectors in the Mongoose collection `embeddingchunks`. The selected ONNX model produces 384-dimensional vectors. This phase does not generate embeddings, ingest application documents, or call Gemini.

## Create the Atlas index (M0 Free)

M0 Free supports creating the Vector Search index through Atlas UI when the cluster version supports Vector Search. Programmatic index creation can return `Command not found` on M0, so use the UI workflow:

1. In Atlas, open **Database & Network Access** / **Clusters** for `analyser-cluster`.
2. Open **Search & Vector Search** for the cluster and choose **Create Search Index**.
3. Choose the database used by `MONGO_URI` and the `embeddingchunks` collection.
4. Select **Vector Search** and the JSON Editor.
5. Set the index name to `embedding_chunks_vector_v1`.
6. Paste the `definition` object below (the JSON file also records the collection, index name, model, and dimensions for the application):

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 384,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "ownerId" },
    { "type": "filter", "path": "reportId" },
    { "type": "filter", "path": "source" },
    { "type": "filter", "path": "modelId" }
  ]
}
```

The source-of-truth configuration is [`embeddingChunks.vector-index.json`](../src/config/embeddingChunks.vector-index.json). Create the index before querying; no embeddings need to exist yet.

## M0 notes

- Use the Atlas UI to create the index; do not run a programmatic index-creation command against the M0 cluster.
- Free clusters allow at most three Search and Vector Search indexes combined. Check the cluster's existing index count before creating this one.
- Free clusters have fixed memory and storage and no dedicated Search nodes. Keep the prototype dataset small and monitor query latency from the application; Atlas Search metrics are unavailable for Free clusters.
- The service caps each request at 50 results and 1,000 candidate vectors as conservative application guardrails, not Atlas product limits.
- Index lifecycle and database connectivity are external deployment setup. Unit tests in this phase use synthetic in-memory model doubles and do not access Atlas.

## Isolation and data contract

Every service operation first verifies `{ _id: reportId, user: ownerId }` against the existing `InterviewReport` collection. Every chunk mutation and vector query is additionally filtered by both `ownerId` and `reportId`; search also filters by embedding model and optionally by source. Never use an owner ID supplied by a frontend as the authenticated owner; pass the ID derived from `req.user` when a later phase calls this service.

Stored chunks include `chunkId`, `source`, `section`, `text`, `contentHash`, `modelId`, and `embedding`. The compound unique key `{ ownerId, reportId, source, chunkId, modelId }` makes repeat upserts idempotent for a chunk and model version.
