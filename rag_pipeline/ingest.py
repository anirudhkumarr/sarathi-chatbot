import os
import sys
import shutil
import logging
import time
from pathlib import Path
from dotenv import load_dotenv

import pytesseract
from pdf2image import convert_from_path
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

try:
    from vector_config import CHROMA_DISTANCE_SPACE, create_embedding_function
except ImportError:
    from .vector_config import CHROMA_DISTANCE_SPACE, create_embedding_function


load_dotenv()
LOG_LEVEL = os.getenv("INGEST_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
)
logger = logging.getLogger(__name__)
STRICT_CUDA_FOR_INGEST = os.getenv("STRICT_CUDA_FOR_INGEST", "true").strip().lower() == "true"
EXPECTED_CUDA_NAME = os.getenv("EXPECTED_CUDA_NAME", "RTX 3060").strip()
DEBUG_SAMPLE_LIMIT = int(os.getenv("INGEST_DEBUG_SAMPLE_LIMIT", "5"))


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data_source"  # PDFs folder
CHROMA_PATH = BASE_DIR / "chroma"      # Vector DB folder

if os.name == 'nt':
    POPPLER_PATH = BASE_DIR / "poppler" / "Library" / "bin"
    TESSERACT_PATH = BASE_DIR / "Tesseract-OCR" / "tesseract.exe"
    

    if TESSERACT_PATH.exists():
        pytesseract.pytesseract.tesseract_cmd = str(TESSERACT_PATH)
        logging.info(f"Tesseract configured at: {TESSERACT_PATH}")
    else:
        logging.warning(f"Tesseract executable not found at: {TESSERACT_PATH}")
else:
    POPPLER_PATH = None


def _log_runtime_context() -> None:
    logger.info("Ingestion runtime context:")
    logger.info("Python executable: %s", sys.executable)
    logger.info("Current working directory: %s", Path.cwd())
    logger.info("Ingest log level: %s", LOG_LEVEL)
    logger.info("Data path: %s", DATA_PATH)
    logger.info("Chroma path: %s", CHROMA_PATH)
    logger.info("Strict CUDA mode: %s", STRICT_CUDA_FOR_INGEST)
    if STRICT_CUDA_FOR_INGEST:
        logger.info("Expected CUDA GPU name contains: '%s'", EXPECTED_CUDA_NAME or "<not-set>")

    if DATA_PATH.exists() and DATA_PATH.is_dir():
        pdf_count = len(list(DATA_PATH.glob("*.pdf")))
        logger.info("Detected %d PDFs in data source.", pdf_count)
    else:
        logger.warning("Data source folder does not exist yet: %s", DATA_PATH)

def ocr_pdf(pdf_path: Path) -> str:

    if not pdf_path.exists():
        logging.warning(f"OCR failed: File not found at {pdf_path}")
        return ""

    logging.info(f"OCR processing {pdf_path.name}...")
    try:
        pages = convert_from_path(
            pdf_path=str(pdf_path), 
            dpi=300, 
            poppler_path=str(POPPLER_PATH) if POPPLER_PATH else None
        )
        
        text = ""
        for i, page in enumerate(pages):
            page_text = pytesseract.image_to_string(page, lang="eng")
            text += page_text + "\n"
        
        logging.info(f"OCR complete for {pdf_path.name}.")
        return text.strip()
        
    except Exception as e:
        logging.error(f"Error during OCR for {pdf_path.name}: {e}")
        return ""


def load_documents() -> list[Document]:

    logging.info(f"Loading documents from {DATA_PATH}...")
    
    loader = DirectoryLoader(
        path=str(DATA_PATH), 
        glob="*.pdf", 
        loader_cls=PyPDFLoader,
        show_progress=True,
        use_multithreading=True
    )
    
    raw_docs = []
    try:
        raw_docs = loader.load()
        if not raw_docs:
            logging.warning("No PDF documents found in data_source directory.")
            return []
        logging.info(f"Loaded {len(raw_docs)} documents using PyPDFLoader.")
    except Exception as e:
        logging.error(f"PyPDFLoader failed: {e}")
        return []

    processed_docs = []
    ocr_fallback_count = 0
    for doc in raw_docs:
        if doc.page_content and len(doc.page_content.strip()) > 10:
            processed_docs.append(doc)
        else:

            ocr_fallback_count += 1
            logging.warning(f"Document {doc.metadata.get('source')} has no extractable text. Attempting OCR.")
            source_path_str = doc.metadata.get("source")
            
            if source_path_str:
                source_path = Path(source_path_str)
                ocr_text = ocr_pdf(source_path)
                if ocr_text:

                    processed_docs.append(Document(page_content=ocr_text, metadata=doc.metadata))
                else:
                    logging.warning(f"OCR failed to extract text from {source_path.name}.")
            else:
                logging.warning("Document has no 'source' metadata; cannot perform OCR.")

    logging.info(f"Total documents after processing: {len(processed_docs)}")
    logging.info("OCR fallback triggered for %d documents.", ocr_fallback_count)

    if logger.isEnabledFor(logging.DEBUG):
        for idx, doc in enumerate(processed_docs[:DEBUG_SAMPLE_LIMIT], start=1):
            text_preview = str(doc.page_content).replace("\n", " ")[:180]
            logger.debug(
                "Sample doc %d | source=%s | chars=%d | preview=%s",
                idx,
                doc.metadata.get("source", "N/A"),
                len(str(doc.page_content)),
                text_preview,
            )
    return processed_docs


def split_text(documents: list[Document]) -> list[Document]:

    if not documents:
        logging.warning("No documents to split.")
        return []
        
    logging.info("Splitting text into chunks...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        add_start_index=True
    )
    
    try:
        chunks = text_splitter.split_documents(documents)
        logging.info(f"Split {len(documents)} documents into {len(chunks)} chunks.")
        if chunks and logger.isEnabledFor(logging.DEBUG):
            chunk_lengths = [len(str(c.page_content)) for c in chunks]
            avg_len = sum(chunk_lengths) / len(chunk_lengths)
            logger.debug(
                "Chunk stats | min=%d max=%d avg=%.2f",
                min(chunk_lengths),
                max(chunk_lengths),
                avg_len,
            )
            for idx, chunk in enumerate(chunks[:DEBUG_SAMPLE_LIMIT], start=1):
                preview = str(chunk.page_content).replace("\n", " ")[:180]
                logger.debug(
                    "Sample chunk %d | source=%s | start_index=%s | chars=%d | preview=%s",
                    idx,
                    chunk.metadata.get("source", "N/A"),
                    chunk.metadata.get("start_index", "N/A"),
                    len(str(chunk.page_content)),
                    preview,
                )
        return chunks
    except Exception as e:
        logging.error(f"Error during text splitting: {e}")
        return []


def save_to_chroma(chunks: list[Document], embeddings):

    if not chunks:
        logging.warning("No chunks to save to ChromaDB.")
        return

    logging.info(f"Saving {len(chunks)} chunks to ChromaDB at {CHROMA_PATH}...")
    

    if CHROMA_PATH.exists():
        logging.info("Existing ChromaDB found. Deleting...")
        try:
            shutil.rmtree(CHROMA_PATH)
        except Exception as e:
            logging.error(f"Failed to delete old ChromaDB: {e}")
            return


    try:
        start = time.perf_counter()
        db = Chroma.from_documents(
            chunks,
            embeddings,
            persist_directory=str(CHROMA_PATH),
            collection_metadata={"hnsw:space": CHROMA_DISTANCE_SPACE},
        )
        
        db.persist()
        elapsed = time.perf_counter() - start
        logging.info(f"✅ Saved {len(chunks)} chunks to ChromaDB in {elapsed:.2f}s.")
    except Exception as e:
        logging.error(f"Failed to save to ChromaDB: {e}")



def main():

    logging.info("Starting ingestion pipeline...")
    _log_runtime_context()
    
    if not DATA_PATH.exists() or not DATA_PATH.is_dir():
        logging.error(f"Data source folder not found: {DATA_PATH}")
        return


    t0 = time.perf_counter()
    documents = load_documents()
    if not documents:
        logging.warning("No documents loaded. Exiting.")
        return
    logging.info("Load stage completed in %.2fs.", time.perf_counter() - t0)


    t1 = time.perf_counter()
    chunks = split_text(documents)
    if not chunks:
        logging.warning("No chunks created. Exiting.")
        return
    logging.info("Split stage completed in %.2fs.", time.perf_counter() - t1)


    t2 = time.perf_counter()
    try:
        embeddings = create_embedding_function(
            logger=logger,
            require_cuda=STRICT_CUDA_FOR_INGEST,
            expected_cuda_name=EXPECTED_CUDA_NAME if STRICT_CUDA_FOR_INGEST else None,
            preferred_device="cuda" if STRICT_CUDA_FOR_INGEST else None,
        )
    except Exception as e:
        err = str(e)
        if "CVE-2025-32434" in err or "required users to upgrade torch to at least v2.6" in err:
            logger.error(
                "Embedding load blocked by torch security policy. "
                "Install secure CUDA torch builds in rag-venv, e.g.:\n"
                "python -m pip install --upgrade --index-url https://download.pytorch.org/whl/cu124 "
                "torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0"
            )
        logging.error("Failed to load embeddings model: %s", e, exc_info=True)
        embeddings = None
    if not embeddings:
        logging.error("Failed to create embeddings. Exiting.")
        return
    logging.info("Embedding initialization completed in %.2fs.", time.perf_counter() - t2)


    t3 = time.perf_counter()
    save_to_chroma(chunks, embeddings)
    logging.info("Persist stage completed in %.2fs.", time.perf_counter() - t3)
    
    logging.info("✅ Ingestion pipeline complete!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logging.critical(f"Unhandled exception in main: {e}", exc_info=True)
