import logging
import time
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from ragcore import query_rag
except ImportError:
    from .ragcore import query_rag


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Sarathi RAG Pipeline API",
    description="An API to query the campus knowledge base.",
    version="1.1.0",
)


class QueryRequest(BaseModel):
    query_text: str = Field(..., min_length=1)
    sender_id: str | None = None
    metadata: dict[str, Any] | None = None


class QueryResponse(BaseModel):
    answer: str
    latency_ms: int


@app.get("/", summary="API Health Check")
def read_root():
    return {"status": "RAG API is running"}


@app.get("/health", summary="Readiness Check")
def read_health():
    return {"status": "ok"}


@app.post("/query/", summary="Query the RAG Pipeline", response_model=QueryResponse)
def handle_query(request: QueryRequest):
    query = request.query_text.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query_text must not be blank.")

    start = time.perf_counter()
    logger.info("Received query via API. sender_id=%s", request.sender_id or "anonymous")

    try:
        answer = query_rag(query, sender_id=request.sender_id, metadata=request.metadata)
    except ValueError as e:
        logger.error("Validation error in RAG query: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Error processing query in RAG API: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process query.") from e

    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info("Query completed in %d ms.", latency_ms)
    return QueryResponse(answer=answer, latency_ms=latency_ms)


if __name__ == "__main__":
    logger.info("Starting RAG API server with Uvicorn...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
