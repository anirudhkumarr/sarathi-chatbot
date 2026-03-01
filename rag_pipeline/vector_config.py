import os
import logging
from typing import Optional

from langchain_huggingface import HuggingFaceEmbeddings


EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
CHROMA_DISTANCE_SPACE = os.getenv("CHROMA_DISTANCE_SPACE", "cosine")
RETRIEVAL_TOP_K = int(os.getenv("RETRIEVAL_TOP_K", "8"))
MAX_CONTEXT_CHUNKS = int(os.getenv("MAX_CONTEXT_CHUNKS", "5"))
RELEVANCE_THRESHOLD = float(os.getenv("RELEVANCE_THRESHOLD", "0.85"))
MIN_SAFE_TORCH_VERSION = os.getenv("MIN_SAFE_TORCH_VERSION", "2.6.0")
STRICT_SAFE_TORCH = os.getenv("STRICT_SAFE_TORCH", "true").strip().lower() == "true"


def _resolve_device(preferred_device: Optional[str] = None) -> str:
    """Decide whether to use CUDA or CPU based on USE_GPU env var."""
    if preferred_device:
        return preferred_device

    use_gpu = os.getenv("USE_GPU", "auto").strip().lower()
    if use_gpu == "true":
        return "cuda"
    if use_gpu == "false":
        return "cpu"

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _parse_semver(version_text: str) -> tuple[int, int, int]:
    base = version_text.split("+", 1)[0]
    parts = base.split(".")
    major = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 0
    minor = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    patch = 0
    if len(parts) > 2:
        patch_num = "".join(ch for ch in parts[2] if ch.isdigit())
        patch = int(patch_num) if patch_num else 0
    return (major, minor, patch)


def _assert_safe_torch_version(logger: Optional[logging.Logger] = None) -> None:
    if not STRICT_SAFE_TORCH:
        if logger:
            logger.warning(
                "STRICT_SAFE_TORCH is disabled. Proceeding without minimum torch version enforcement."
            )
        return

    try:
        import torch
    except Exception as e:
        raise RuntimeError("Unable to import torch while validating secure torch version.") from e

    current = _parse_semver(torch.__version__)
    minimum = _parse_semver(MIN_SAFE_TORCH_VERSION)

    if current < minimum:
        raise RuntimeError(
            "Unsafe torch version detected for current transformers load policy. "
            f"Found torch={torch.__version__}, required>={MIN_SAFE_TORCH_VERSION}. "
            "Upgrade torch to a secure version to avoid CVE-2025-32434 related runtime blocks."
        )

    if logger:
        logger.info(
            "Torch security check passed. torch=%s (required >= %s).",
            torch.__version__,
            MIN_SAFE_TORCH_VERSION,
        )


def _strict_cuda_check(
    logger: Optional[logging.Logger] = None,
    expected_cuda_name: Optional[str] = None,
) -> None:
    try:
        import torch
    except Exception as e:
        raise RuntimeError(
            "Strict CUDA mode is enabled, but torch is not available to validate GPU/CUDA."
        ) from e

    if not torch.cuda.is_available():
        raise RuntimeError(
            "Strict CUDA mode is enabled, but CUDA is not available. "
            "Check NVIDIA driver/CUDA toolkit/PyTorch CUDA build."
        )

    device_count = torch.cuda.device_count()
    if device_count < 1:
        raise RuntimeError("Strict CUDA mode is enabled, but no CUDA devices were detected.")

    current_idx = torch.cuda.current_device()
    current_name = torch.cuda.get_device_name(current_idx)
    props = torch.cuda.get_device_properties(current_idx)
    total_mem_gb = props.total_memory / (1024 ** 3)
    capability = f"{props.major}.{props.minor}"

    if logger:
        logger.info(
            "CUDA strict check passed. Using GPU #%d: %s | VRAM: %.2f GB | Compute Capability: %s",
            current_idx,
            current_name,
            total_mem_gb,
            capability,
        )
        if device_count > 1:
            names = [torch.cuda.get_device_name(i) for i in range(device_count)]
            logger.debug("Detected CUDA devices: %s", names)

    if expected_cuda_name:
        if expected_cuda_name.lower() not in current_name.lower():
            raise RuntimeError(
                f"Strict CUDA mode expected GPU containing '{expected_cuda_name}', "
                f"but active device is '{current_name}'."
            )


def create_embedding_function(
    logger: Optional[logging.Logger] = None,
    require_cuda: bool = False,
    expected_cuda_name: Optional[str] = None,
    preferred_device: Optional[str] = None,
) -> HuggingFaceEmbeddings:
    _assert_safe_torch_version(logger=logger)

    if require_cuda:
        _strict_cuda_check(logger=logger, expected_cuda_name=expected_cuda_name)
        device = "cuda"
    else:
        device = _resolve_device(preferred_device=preferred_device)

    if logger:
        logger.info("Loading embedding model '%s' on device '%s'.", EMBEDDING_MODEL_NAME, device)

    return HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs={"device": device},
        encode_kwargs={"normalize_embeddings": True},
    )
