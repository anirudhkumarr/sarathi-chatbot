# Agent Handoff Report (2026-02-20)

## 1) Project Scope and Goal

Build a multilingual college support chatbot that:

- answers user queries from official college documents (PDFs and notices),
- uses RAG over ChromaDB for factual grounding,
- is orchestrated by Rasa for dialogue management,
- is embedded as an overlay chat widget on the college website.

Primary quality target: accurate retrieval + grounded generation for mixed-language Indian user queries (English, Hindi, Hinglish, regional language usage).

---

## 2) Current Architecture (Implemented)

### Services

1. **Rasa Server** (NLU + dialogue)
   - Port: `5005`
   - Channels: `rest` (actively used by custom widget), `socketio` (still configured)
   - Key files: `config.yml`, `domain.yml`, `data/*`, `credentials.yml`

2. **Rasa Action Server** (bridge to RAG API)
   - Port: `5055`
   - Endpoint configured in `endpoints.yml`
   - Key file: `actions/actions.py`

3. **RAG API (FastAPI)**
   - Port: `8000`
   - Endpoint: `POST /query/`
   - Key files: `rag_pipeline/main.py`, `rag_pipeline/ragcore.py`

4. **Embedding + Vector DB pipeline**
   - Ingestion script: `rag_pipeline/ingest.py`
   - Embedding config/guardrails: `rag_pipeline/vector_config.py`
   - Vector store: `rag_pipeline/chroma/`

### Runtime request flow

`Website widget -> Rasa REST webhook -> Rasa policy predicts action_retrieve_and_answer -> Action server calls RAG API -> RAG retrieves from Chroma + Gemini answer -> response returned to widget`

---

## 3) Major Decisions Finalized

1. **Embedding model chosen:** `BAAI/bge-m3` (multilingual, strong retrieval quality).
2. **Two isolated Python envs:**  
   - `sarthi-venv` for Rasa stack  
   - `rag-venv` for RAG stack
3. **Torch security baseline enforced:** minimum torch `2.6.0` due CVE-related runtime checks.
4. **Strict GPU ingestion mode enabled by default:** embedding creation expects CUDA GPU (RTX 3060 target configured).
5. **Frontend channel strategy:** custom REST widget (not third-party rasa-webchat bundle).

---

## 4) Completed Work

## A. RAG Pipeline and Ingestion

- `rag_pipeline/vector_config.py`
  - Added secure torch version validation (`MIN_SAFE_TORCH_VERSION`, `STRICT_SAFE_TORCH`).
  - Added strict CUDA validation (`require_cuda`, expected GPU name checks, device logging).
  - Added configurable embedding device resolution and normalized embedding output.

- `rag_pipeline/ingest.py`
  - Added structured debug logging and runtime context logs.
  - Added strict CUDA ingest checks and expected GPU matching.
  - Added stage timing logs (load/split/embed/persist).
  - Added OCR fallback accounting and sample previews in debug mode.
  - Added explicit remediation guidance when torch security policy blocks model loading.

- Environment validation done:
  - `rag-venv` torch now verified as `2.6.0+cu124`.
  - CUDA availability verified on RTX 3060 laptop GPU.

## B. RAG API Contract and Session Context

- `rag_pipeline/main.py`
  - Query request schema now accepts optional `sender_id` and `metadata`.
  - Logs include sender context.

- `rag_pipeline/ragcore.py`
  - Prompt rewritten from scheme-specific style to general, retrieval-grounded, multilingual behavior.
  - Context builder now includes structured chunk metadata (Source/Page/Chunk ID/Score).
  - Query logging includes sender and metadata keys.

## C. Rasa Business Logic and Dialogue Expansion

- `domain.yml`
  - Expanded intents and responses:
    - `thank_you`, `bot_capabilities`, `contact_support`, `restart_chat`, `affirm`, `deny`.
  - Added richer response buttons and fallback recovery responses.

- `data/rules.yml`
  - Added/updated rules for greeting, goodbye, thanks, capabilities, support handoff, restart confirmation, RAG question routing, fallback branches.

- `data/stories.yml`
  - Added multi-turn stories to support smoother policy learning for realistic conversation paths.

- `data/nlu.yml`
  - Expanded examples significantly across English/Hindi/Hinglish and broader campus topics.

- `config.yml`
  - Updated NLU pipeline and policy settings to better support current scope.
  - Fallback configuration tightened for safer routing.

- Validation:
  - `rasa data validate` executed successfully (no story conflicts).

## D. Action Server Integration Hardening

- `actions/actions.py`
  - Sends `sender_id`, intent, and metadata to RAG API.
  - `RAG_SEND_PROGRESS_MESSAGE` env flag added (default off for cleaner UX).
  - Error handling and latency logging retained.

## E. Website Widget (Custom, Overlay)

- Replaced external `rasa-webchat` with custom widget:
  - `chat-widget.js`
  - Included in `index.html` via versioned script query.

- Widget capabilities:
  - bottom-right overlay chat panel,
  - open/close animation,
  - typing indicator,
  - quick prompts,
  - "New" session reset button,
  - session sender ID generation,
  - REST integration to `/webhooks/rest/webhook`,
  - source-aware rendering:
    - answer content formatted (lists/headings/bold/code),
    - `Sources:` split into visually distinct source bubble.

- Timeout fix:
  - Client-side hard abort is disabled by default (`REQUEST_TIMEOUT_MS=0`) to prevent premature cancellations.
  - Optional timeout remains configurable.

---

## 5) Current Data / Runtime State Snapshot

- PDFs in `rag_pipeline/data_source/`: **66**
- Active Chroma DB present at `rag_pipeline/chroma/` (sqlite + collection directory).
- Latest visible model artifact:
  - `models/20260220-022355-watery-tundra.tar.gz`
- `config.yml` assistant id points to latest trained model id.

---

## 6) Known Gaps / Technical Debt (Not Done Yet)

## High Priority

1. **No automated evaluation harness for retrieval quality**
   - Need benchmark set (50-100 multilingual queries) + recall@k / answer correctness checks.

2. **No reranking stage implemented**
   - Currently retrieval uses similarity + threshold fallback only.
   - Add cross-encoder reranker for higher precision on ambiguous queries.

3. **No production tracker store setup**
   - Current setup does not include durable production conversation storage strategy.

4. **No comprehensive integration tests (Rasa + Action + RAG + Widget)**
   - Only manual validation and syntax checks done.

## Medium Priority

1. **Prompt output reliability for strict source formatting**
   - Widget assumes `Sources:` marker to split source bubble.
   - If LLM deviates from format, source split may not trigger.

2. **Widget source list UX**
   - Sources are styled distinctly but not hyperlink-resolved yet.

3. **README and docs drift**
   - README is partially outdated relative to latest widget and config behavior.

4. **`requirements.txt` drift**
   - Root `requirements.txt` is prototype-era and not authoritative for current two-venv setup.

## Low Priority

1. **Repository hygiene**
   - `.gitignore` venv patterns do not match current folder names exactly:
     - actual dirs: `sarthi-venv`, `rag-venv`
     - ignore patterns currently include `.sarthi-venv/`, `rag_venv/`
   - Should be corrected to avoid accidental venv tracking.

2. **Legacy folders**
   - `backup_files`, `old_ingestion_scripts`, old DB snapshots exist and can confuse future edits.

---

## 7) Required Environment Variables

## Required

- `GOOGLE_API_KEY` (in `.env`)

## Optional (actively used)

- RAG/action:
  - `RAG_API_URL`
  - `RAG_API_TIMEOUT_SECONDS`
  - `RAG_QUERY_SOURCE`
  - `RAG_SEND_PROGRESS_MESSAGE`

- RAG generation:
  - `LLM_MODEL_NAME`
  - `RAG_LOG_LEVEL`

- Retrieval/embedding:
  - `EMBEDDING_MODEL_NAME`
  - `CHROMA_DISTANCE_SPACE`
  - `RETRIEVAL_TOP_K`
  - `MAX_CONTEXT_CHUNKS`
  - `RELEVANCE_THRESHOLD`
  - `USE_GPU`
  - `STRICT_SAFE_TORCH`
  - `MIN_SAFE_TORCH_VERSION`

- Ingestion:
  - `INGEST_LOG_LEVEL`
  - `STRICT_CUDA_FOR_INGEST`
  - `EXPECTED_CUDA_NAME`
  - `INGEST_DEBUG_SAMPLE_LIMIT`

- Widget (set on page before script if needed):
  - `window.SARATHI_RASA_URL`
  - `window.SARATHI_REQUEST_TIMEOUT_MS`

---

## 8) Runbook (Current Known Good)

## Terminal 1: RAG API

```powershell
cd g:\SARATHI_BACKUP\Sarthi\sih-chatbot-sarathi
.\rag-venv\Scripts\activate
uvicorn rag_pipeline.main:app --host 0.0.0.0 --port 8000
```

## Terminal 2: Action Server

```powershell
cd g:\SARATHI_BACKUP\Sarthi\sih-chatbot-sarathi
.\sarthi-venv\Scripts\activate
rasa run actions --debug
```

## Terminal 3: Rasa Server

```powershell
cd g:\SARATHI_BACKUP\Sarthi\sih-chatbot-sarathi
.\sarthi-venv\Scripts\activate
rasa run --port 5005 --credentials credentials.yml --endpoints endpoints.yml --cors "*"
```

## If NLU/domain files changed

```powershell
rasa train
```

## Validate training data consistency

```powershell
rasa data validate --domain domain.yml --data data --config config.yml
```

---

## 9) Immediate Next Tasks for Incoming Agent

1. **Stabilize output contract between prompt and widget**
   - enforce robust structured response for sources (or return sources as separate JSON field from RAG API).

2. **Implement retrieval evaluation harness**
   - fixed test set, scoring script, report metrics.

3. **Add reranker layer**
   - optional cross-encoder rerank of top-k retrieved chunks before prompt construction.

4. **Clean repository operational hygiene**
   - fix `.gitignore`,
   - document exact dependency lock strategy for both envs,
   - archive/remove legacy script folders.

5. **Production readiness controls**
   - add rate limiting and retries,
   - set explicit request/response timeout policy across widget, Rasa, action server, RAG API.

---

## 10) Notes for Continuity

- Current system is **functionally working end-to-end** (ingestion, retrieval, generation, and widget interaction).
- Most recent fixes focused on:
  - robust CUDA/torch compatibility,
  - Rasa dialogue breadth,
  - frontend widget UX and rendering quality,
  - timeout behavior in REST channel interactions.
- If you see `rest.message.received.timeout` again, check client-side abort config first (`SARATHI_REQUEST_TIMEOUT_MS`) and service availability/latency second.
