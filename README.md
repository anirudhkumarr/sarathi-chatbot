# 🧭 Sarathi — AI Campus Assistant

A multilingual, document-grounded chatbot you can inject into any website with a single `<script>` tag. Powered by **Rasa**, **LangChain**, **ChromaDB**, and **Google Gemini**.

---

## Architecture

```
┌──────────────┐   HTTP    ┌──────────────────┐   HTTP    ┌────────────────────┐
│  Chat Widget │ ────────► │  Rasa Server     │ ────────► │  Rasa Action       │
│  (JS/CSS)    │ ◄──────── │  :5005           │ ◄──────── │  Server :5055      │
└──────────────┘           └──────────────────┘           └────────┬───────────┘
                                                                   │ HTTP
                                                                   ▼
                                                          ┌────────────────────┐
                                                          │  RAG API (FastAPI) │
                                                          │  :8000             │
                                                          │  ┌──────────────┐  │
                                                          │  │ ChromaDB     │  │
                                                          │  │ + BGE-M3     │  │
                                                          │  │ + Gemini LLM │  │
                                                          │  └──────────────┘  │
                                                          └────────────────────┘
```

## Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| Python | 3.10.x | Required for Rasa 3.6 compatibility |
| Tesseract-OCR | 5.x | For OCR on image-based PDFs |
| Poppler | 24.x | For `pdf2image` PDF rendering |
| CUDA Toolkit | 12.4 (optional) | For GPU-accelerated embeddings |
| Git | 2.x | Version control |

---

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/<your-org>/sarathi-chatbot.git
cd sarathi-chatbot

# Create your environment file
cp .env.example .env
# Edit .env and add your Google API key
```

### 2. Set Up Rasa Virtual Environment (`sarthi-venv`)

```bash
python -m venv sarthi-venv

# Activate
sarthi-venv\Scripts\activate          # Windows
source sarthi-venv/bin/activate       # Linux/Mac

pip install -r requirements-rasa.txt
```

### 3. Set Up RAG Pipeline Virtual Environment (`rag-venv`)

```bash
python -m venv rag-venv

# Activate
rag-venv\Scripts\activate             # Windows
source rag-venv/bin/activate          # Linux/Mac

# (Optional) Install CUDA PyTorch first for GPU support:
pip install torch==2.6.0+cu124 torchvision==0.21.0+cu124 torchaudio==2.6.0+cu124 \
    --index-url https://download.pytorch.org/whl/cu124

pip install -r requirements-rag.txt
```

### 4. Train Rasa Model

```bash
# In sarthi-venv
rasa train
```

### 5. Ingest Documents

Place your PDF documents in `rag_pipeline/data_source/`, then run:

```bash
# In rag-venv
python -m rag_pipeline.ingest
```

### 6. Start All Servers

Open **4 separate terminals** and run:

```bash
# Terminal 1 — HTTP Server (serves the chat widget page)
python -m http.server 8787

# Terminal 2 — RAG API
rag-venv\Scripts\activate
uvicorn rag_pipeline.main:app --host 0.0.0.0 --port 8000

# Terminal 3 — Rasa Action Server
sarthi-venv\Scripts\activate
rasa run actions --debug

# Terminal 4 — Rasa Core Server
sarthi-venv\Scripts\activate
rasa run --port 5005 --credentials credentials.yml --enable-api --cors "*" --debug
```

Then open **http://localhost:8787/** in your browser.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | *(required)* | Google Gemini API key |
| `LLM_MODEL_NAME` | `gemini-flash-latest` | Gemini model to use |
| `EMBEDDING_MODEL_NAME` | `BAAI/bge-m3` | HuggingFace embedding model |
| `USE_GPU` | `auto` | `true` / `false` / `auto` |
| `RAG_API_URL` | `http://localhost:8000/query/` | RAG endpoint for Rasa actions |

---

## Project Structure

```
sih-chatbot-sarathi/
├── .env.example            # Environment variable template
├── .gitignore              # Git exclusions
├── index.html              # Demo page with embedded chat widget
├── credentials.yml         # Rasa channel credentials
├── endpoints.yml           # Rasa action endpoint config
├── config.yml              # Rasa NLU/Core pipeline config
├── domain.yml              # Rasa domain (intents, actions, responses)
├── requirements-rasa.txt   # Deps for sarthi-venv (Rasa)
├── requirements-rag.txt    # Deps for rag-venv (RAG pipeline)
│
├── data/                   # Rasa training data
│   ├── nlu.yml
│   ├── rules.yml
│   └── stories.yml
│
├── actions/                # Rasa custom actions
│   └── actions.py          # ActionRetrieveAndAnswer → calls RAG API
│
├── rag_pipeline/           # RAG pipeline (FastAPI)
│   ├── main.py             # FastAPI app entry point
│   ├── ragcore.py          # Query engine (ChromaDB + Gemini)
│   ├── ingest.py           # Document ingestion pipeline
│   ├── vector_config.py    # Embedding & retrieval config
│   ├── data_source/        # (gitignored) Place PDFs here
│   └── chroma/             # (gitignored) Vector DB storage
│
├── widget/                 # Injectable chat widget
│   └── sarathi-widget.js   # Self-contained IIFE (JS + CSS)
│
├── models/                 # (gitignored) Rasa trained models
└── docs/                   # Project documentation
```

---

## Chat Widget Integration

To embed Sarathi on any webpage:

```html
<script src="path/to/sarathi-widget.js"></script>
<script>
  SarathiWidget.init({
    serverUrl: "http://localhost:5005",
    botName: "Sarathi",
    greeting: "Hello! How can I help you today?",
  });
</script>
```

The widget automatically adapts to light/dark mode via `prefers-color-scheme`.

---

## License

MIT
