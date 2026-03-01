import os
import logging
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma

try:
    from vector_config import (
        MAX_CONTEXT_CHUNKS,
        RELEVANCE_THRESHOLD,
        RETRIEVAL_TOP_K,
        create_embedding_function,
    )
except ImportError:
    from .vector_config import (
        MAX_CONTEXT_CHUNKS,
        RELEVANCE_THRESHOLD,
        RETRIEVAL_TOP_K,
        create_embedding_function,
    )


load_dotenv()

LOG_LEVEL = os.getenv("RAG_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
)
logger = logging.getLogger(__name__)


GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in .env file.")

genai.configure(api_key=GOOGLE_API_KEY)
llm_model = genai.GenerativeModel(os.getenv("LLM_MODEL_NAME", "gemini-flash-latest"))

BASE_DIR = Path(__file__).resolve().parent
CHROMA_PATH = BASE_DIR / "chroma"

PROMPT_TEMPLATE = """
You are Sarthi, an assistant for college and university document support.

You are given:
1) A user question.
2) Retrieved context chunks from official college documents.

Follow these rules strictly:
- Use ONLY the provided context. Do not use outside knowledge.
- Match the response language to the user's language and style (English, Hindi, Hinglish, Marathi, etc.).
- If the answer is present in context, provide a clear, direct answer.
- If steps, eligibility, deadlines, or required documents are asked, format clearly with short bullets.
- If context is partial or missing, explicitly say the information is not clearly available in the provided documents and ask a focused follow-up question.
- If multiple chunks conflict, mention that documents appear inconsistent and suggest contacting college staff for confirmation.
- Do not mention embeddings, vector database, retrieval scores, or internal system details.
- End with a compact source line using the provided Source values.

Output format:
1) Answer
2) Sources: <comma-separated source names and page numbers when available>

User Question:
{question}

Retrieved Context:
{context}
"""


def load_vector_db(embeddings):
    logger.info("Loading ChromaDB from %s...", CHROMA_PATH)
    if not CHROMA_PATH.exists():
        raise FileNotFoundError(f"ChromaDB not found at {CHROMA_PATH}. Run ingest.py first.")

    return Chroma(
        persist_directory=str(CHROMA_PATH),
        embedding_function=embeddings,
    )


def _source_name(raw_source: Any) -> str:
    if raw_source is None:
        return "Unknown source"
    source = str(raw_source).strip()
    if not source:
        return "Unknown source"
    cleaned = source.split("?", 1)[0].rstrip("/\\")
    if not cleaned:
        return "Unknown source"
    if cleaned.startswith(("http://", "https://")):
        return cleaned.rsplit("/", 1)[-1] or cleaned
    return Path(cleaned).name or cleaned


def _build_context(relevant_docs_with_scores) -> str:
    context_chunks = []
    for idx, (doc, score) in enumerate(relevant_docs_with_scores[:MAX_CONTEXT_CHUNKS], start=1):
        metadata = doc.metadata or {}
        source = _source_name(metadata.get("source"))
        page = metadata.get("page")
        if page is None:
            page = metadata.get("page_number")
        if page is None:
            page = "N/A"
        chunk_id = metadata.get("chunk_id") or metadata.get("id") or f"chunk-{idx}"
        if isinstance(doc.page_content, list):
            content = "\n".join(str(part) for part in doc.page_content)
        else:
            content = str(doc.page_content)

        block = (
            f"[Chunk {idx}]\n"
            f"Source: {source}\n"
            f"Page: {page}\n"
            f"Chunk ID: {chunk_id}\n"
            f"Similarity Score: {float(score):.4f}\n"
            f"Content:\n{content}"
        )
        context_chunks.append(block)

    return "\n\n---\n\n".join(context_chunks)


logger.info("Initializing RAG core components...")
embedding_function = create_embedding_function(logger)
db = load_vector_db(embedding_function)
logger.info("RAG core is ready.")


def query_rag(
    query_text: str,
    sender_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    query_text = (query_text or "").strip()
    if not query_text:
        return "I'm sorry, I didn't receive a valid question."

    safe_sender = sender_id or "anonymous"
    metadata_keys = sorted((metadata or {}).keys())
    logger.info(
        "New RAG query received. sender_id=%s metadata_keys=%s",
        safe_sender,
        metadata_keys,
    )

    try:
        results_with_scores = db.similarity_search_with_score(query=query_text, k=RETRIEVAL_TOP_K)
    except Exception as e:
        logger.error("Vector DB retrieval failed: %s", e, exc_info=True)
        return "I'm sorry, I could not search the knowledge base right now."

    if not results_with_scores:
        return "I'm sorry, I could not find any information related to your question."

    filtered = [
        (doc, score) for doc, score in results_with_scores if float(score) <= RELEVANCE_THRESHOLD
    ]

    if not filtered:
        logger.warning(
            "No chunks passed threshold %.3f. Falling back to top results.",
            RELEVANCE_THRESHOLD,
        )
        filtered = results_with_scores[: min(3, len(results_with_scores))]

    for idx, (doc, score) in enumerate(filtered[:MAX_CONTEXT_CHUNKS], start=1):
        logger.info(
            "Context chunk %d score=%.4f source=%s",
            idx,
            float(score),
            doc.metadata.get("source", "N/A"),
        )

    context_text = _build_context(filtered)
    if not context_text.strip():
        return "I'm sorry, I could not find enough relevant content to answer that."

    prompt = PROMPT_TEMPLATE.format(context=context_text, question=query_text)

    try:
        response = llm_model.generate_content(prompt)
        answer = getattr(response, "text", None)
        if not answer:
            logger.error("LLM response did not contain text output.")
            return "I found relevant information, but I could not generate a response."
        return answer.strip()
    except Exception as e:
        logger.error("LLM generation failed: %s", e, exc_info=True)
        return "I found relevant information, but I encountered an error while trying to generate an answer."
