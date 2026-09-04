import json
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
import requests
from pydantic import BaseModel, Field
from requests.adapters import HTTPAdapter
from sqlalchemy.orm import joinedload
from urllib3.util.retry import Retry

from app.config import settings
from app.merchant_map import match_known_merchant
from app.models import Account, Transaction
from app.telemetry import ai_telemetry as telemetry

logger = logging.getLogger(__name__)

CATEGORIES = [
    "Groceries",
    "Utilities",
    "Dining",
    "Travel",
    "Shopping",
    "Entertainment",
    "Investment",
    "Salary/Income",
    "Healthcare",
    "Fuel",
    "Education",
    "Transfer",
    "Others",
]

KEEP_ALIVE = "60m"
RAG_CONTEXT_LIMIT = 24
CATEGORIZE_NUM_PREDICT = 192
RAG_NUM_PREDICT = 640

_session = requests.Session()
_adapter = HTTPAdapter(
    pool_connections=8,
    pool_maxsize=16,
    max_retries=Retry(total=2, backoff_factor=0.25, status_forcelist=[502, 503, 504]),
)
_session.mount("http://", _adapter)
_session.mount("https://", _adapter)

ALLOWED_OLLAMA_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "ollama",
    "finance_ollama",
    "host.docker.internal",
}


class CategorizationResult(BaseModel):
    category: str = Field(description="One of the allowed categories")
    subcategory: str = Field(description="Specific subcategory")
    clean_description: str = Field(description="Clean merchant or vendor name")


def find_working_ollama_url() -> str:
    """Check configured OLLAMA_URL or candidate URLs to find a live Ollama instance."""
    candidates = []
    if settings.OLLAMA_URL:
        candidates.append(settings.OLLAMA_URL.strip().rstrip("/"))
    for u in [
        "http://finance_ollama:11434",
        "http://ollama:11434",
        "http://host.docker.internal:11434",
        "http://localhost:11434",
        "http://127.0.0.1:11434",
    ]:
        if u not in candidates:
            candidates.append(u)

    for url in candidates:
        try:
            res = _session.get(f"{url}/api/tags", timeout=1.5)
            if res.status_code == 200:
                if settings.OLLAMA_URL != url:
                    logger.info(f"Ollama auto-detected and connected at: {url}")
                    settings.OLLAMA_URL = url
                return url
        except Exception:
            continue
    return settings.OLLAMA_URL.strip().rstrip("/")


def is_safe_ollama_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_OLLAMA_HOSTS:
        return False
    if parsed.port not in (None, 80, 443, 11434):
        return False
    return True


def llm_options(
    num_predict: int,
    num_ctx: int | None = None,
    enable_thinking: bool | None = None,
    temperature: float | None = None,
) -> dict:
    thinking = enable_thinking if enable_thinking is not None else settings.LLM_ENABLE_THINKING
    opts = {
        "num_ctx": num_ctx if num_ctx is not None else settings.LLM_NUM_CTX,
        "num_predict": num_predict,
    }
    if thinking:
        # Prevent runaway loops in small models with calibrated sampling
        opts["temperature"] = settings.THINKING_TEMPERATURE
        opts["top_p"] = settings.THINKING_TOP_P
        opts["min_p"] = settings.THINKING_MIN_P
    else:
        opts["temperature"] = temperature if temperature is not None else settings.LLM_TEMPERATURE
    return opts


def ollama_generate(
    prompt: str,
    *,
    model: str | None = None,
    system: str | None = None,
    fmt=None,
    num_predict: int = RAG_NUM_PREDICT,
    timeout: int = 90,
    enable_thinking: bool | None = None,
    temperature: float | None = None,
):
    active_url = find_working_ollama_url()
    target_model = model or settings.LLM_MODEL
    opts = {
        **llm_options(num_predict, enable_thinking=enable_thinking, temperature=temperature),
        "num_gpu": -1,
    }
    payload = {
        "model": target_model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": opts,
    }
    if system:
        payload["system"] = system
    if fmt is not None:
        payload["format"] = fmt

    try:
        res = _session.post(f"{active_url}/api/generate", json=payload, timeout=timeout)
        # Automatic fallback if primary model is not installed/found
        if res.status_code == 404 and target_model != settings.LLM_FALLBACK_MODEL and settings.LLM_FALLBACK_MODEL:
            logger.warning(
                f"Model {target_model} not found in Ollama (HTTP 404). Falling back to {settings.LLM_FALLBACK_MODEL}."
            )
            payload["model"] = settings.LLM_FALLBACK_MODEL
            res = _session.post(f"{active_url}/api/generate", json=payload, timeout=timeout)
        return res
    except Exception as e:
        logger.error(f"Error calling ollama_generate with model {target_model}: {e}")
        raise


def query_ollama_json(
    prompt: str,
    schema: dict | None = None,
    model: str | None = None,
    system: str | None = None,
    timeout: int = 90,
) -> Dict[str, Any]:
    """Execute a structured JSON prompt against Ollama and parse result."""
    active_url = find_working_ollama_url()
    target_model = model or settings.LLM_MODEL
    payload = {
        "model": target_model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": {
            **llm_options(RAG_NUM_PREDICT, enable_thinking=False, temperature=0.1),
            "num_gpu": -1,
        },
    }
    if system:
        payload["system"] = system
    if schema is not None:
        payload["format"] = schema
    else:
        payload["format"] = "json"

    res = _session.post(f"{active_url}/api/generate", json=payload, timeout=timeout)
    if res.status_code == 404 and target_model != settings.LLM_FALLBACK_MODEL and settings.LLM_FALLBACK_MODEL:
        logger.warning(
            f"Model {target_model} not found for JSON query. Falling back to {settings.LLM_FALLBACK_MODEL}."
        )
        payload["model"] = settings.LLM_FALLBACK_MODEL
        res = _session.post(f"{active_url}/api/generate", json=payload, timeout=timeout)

    res.raise_for_status()
    raw = res.json().get("response", "{}")
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    if raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    return json.loads(raw)


async def stream_ollama_chat(
    messages: List[Dict[str, str]],
    system: Optional[str] = None,
    num_predict: int = RAG_NUM_PREDICT,
    temperature: Optional[float] = None,
    model: Optional[str] = None,
    enable_thinking: Optional[bool] = None,
) -> AsyncGenerator[str, None]:
    """Streams token chunks from Ollama chat API using Server-Sent Events / async stream."""
    active_url = find_working_ollama_url()
    chat_messages = []
    if system:
        chat_messages.append({"role": "system", "content": system})
    chat_messages.extend(messages)

    target_model = model or settings.LLM_MODEL
    opts = {
        **llm_options(num_predict, enable_thinking=enable_thinking, temperature=temperature),
        "num_gpu": -1,
    }

    payload = {
        "model": target_model,
        "messages": chat_messages,
        "stream": True,
        "keep_alive": KEEP_ALIVE,
        "options": opts,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{active_url}/api/chat", json=payload) as response:
            if response.status_code == 404 and target_model != settings.LLM_FALLBACK_MODEL and settings.LLM_FALLBACK_MODEL:
                logger.warning(f"Model {target_model} not found for stream. Falling back to {settings.LLM_FALLBACK_MODEL}.")
                payload["model"] = settings.LLM_FALLBACK_MODEL
                async with client.stream("POST", f"{active_url}/api/chat", json=payload) as fb_response:
                    async for line in fb_response.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                content = chunk.get("message", {}).get("content", "")
                                if content:
                                    yield content
                            except Exception:
                                continue
                return

            async for line in response.aiter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                    except Exception:
                        continue


def ensure_models_exist():
    """Check if the required LLM and Embedding models exist in Ollama; if not, pull them."""
    try:
        active_url = find_working_ollama_url()
        response = _session.get(f"{active_url}/api/tags", timeout=8)
        if response.status_code != 200:
            logger.error("Failed to check Ollama models.")
            return False

        installed_models = [m["name"] for m in response.json().get("models", [])]

        embed_model = settings.EMBEDDING_MODEL
        if embed_model not in installed_models and f"{embed_model}:latest" not in installed_models:
            logger.info(f"Pulling Embedding model: {embed_model}...")
            _session.post(
                f"{active_url}/api/pull",
                json={"name": embed_model, "stream": False},
                timeout=600,
            )
            logger.info(f"Embedding model {embed_model} pulled successfully.")

        # Check primary model first; if fails, ensure fallback model
        llm_model = settings.LLM_MODEL
        fallback_model = settings.LLM_FALLBACK_MODEL
        has_primary = (llm_model in installed_models) or (f"{llm_model}:latest" in installed_models)
        has_fallback = (fallback_model in installed_models) or (f"{fallback_model}:latest" in installed_models)

        if not has_primary and not has_fallback:
            logger.info(f"Pulling LLM model: {llm_model}...")
            pull_res = _session.post(
                f"{active_url}/api/pull",
                json={"name": llm_model, "stream": False},
                timeout=1800,
            )
            if pull_res.status_code != 200 and fallback_model:
                logger.info(f"Pulling fallback LLM model: {fallback_model}...")
                _session.post(
                    f"{active_url}/api/pull",
                    json={"name": fallback_model, "stream": False},
                    timeout=1800,
                )
            logger.info("LLM model ready.")

        return True
    except Exception as e:
        logger.error(f"Error connecting to Ollama: {str(e)}")
        return False


async def get_embeddings_batch(
    texts: List[str], batch_size: int = 64
) -> List[Optional[List[float]]]:
    """Generate 768-dim vector embeddings for a list of texts in concurrent batches via Ollama /api/embed."""
    if not texts:
        return []

    active_url = find_working_ollama_url()
    all_embeddings: List[Optional[List[float]]] = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(texts), batch_size):
            chunk = texts[i : i + batch_size]
            try:
                res = await client.post(
                    f"{active_url}/api/embed",
                    json={
                        "model": settings.EMBEDDING_MODEL,
                        "input": chunk,
                        "keep_alive": KEEP_ALIVE,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    chunk_embs = data.get("embeddings", [])
                    all_embeddings.extend(chunk_embs)
                else:
                    # Fallback single item legacy endpoint
                    for t in chunk:
                        legacy_res = await client.post(
                            f"{active_url}/api/embeddings",
                            json={"model": settings.EMBEDDING_MODEL, "prompt": t},
                        )
                        if legacy_res.status_code == 200:
                            all_embeddings.append(legacy_res.json().get("embedding"))
                        else:
                            all_embeddings.append(None)
            except Exception as e:
                logger.error(f"Batch embedding error for chunk {i}: {e}")
                all_embeddings.extend([None] * len(chunk))

    return all_embeddings


def get_embedding(text_to_embed: str) -> Optional[List[float]]:
    """Generate vector embedding using Ollama (/api/embed, with legacy fallback)."""
    t0 = time.time()
    base = find_working_ollama_url()
    try:
        response = _session.post(
            f"{base}/api/embed",
            json={
                "model": settings.EMBEDDING_MODEL,
                "input": text_to_embed,
                "keep_alive": KEEP_ALIVE,
            },
            timeout=20,
        )
        if response.status_code == 404:
            response = _session.post(
                f"{base}/api/embeddings",
                json={"model": settings.EMBEDDING_MODEL, "prompt": text_to_embed},
                timeout=20,
            )
        if response.status_code != 200:
            logger.error(f"Ollama embedding request failed: {response.text[:300]}")
            return None
        data = response.json()
        emb = None
        if data.get("embeddings"):
            emb = data["embeddings"][0]
        elif data.get("embedding"):
            emb = data["embedding"]
        _ = (time.time() - t0) * 1000
        return emb
    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        return None


def categorize_transaction(
    description: str, amount: float, categories: Optional[List[str]] = None
) -> Tuple[str, str, str]:
    """Categorize a transaction using merchant rules first, then schema-constrained LLM call."""
    allowed_categories = categories if categories else CATEGORIES

    known_match = match_known_merchant(description)
    if known_match:
        clean_name, cat, subcat = known_match
        if cat in allowed_categories:
            telemetry.log(
                f"Fast-Matched '{description[:25]}' -> {cat} ({subcat}) via Indian merchant engine"
            )
            return cat, subcat, clean_name

    cats = ", ".join(allowed_categories)
    prompt = (
        "Classify this Indian bank transaction. Return strictly JSON.\n"
        f"Categories: {cats}\n"
        f'Description: "{description}"\n'
        f"Amount: {amount} (negative=spend, positive=income)\n"
    )

    try:
        schema = CategorizationResult.model_json_schema()
        response = ollama_generate(
            prompt,
            fmt=schema,
            num_predict=CATEGORIZE_NUM_PREDICT,
            timeout=25,
        )

        if response.status_code == 200:
            raw_text = response.json().get("response", "{}") or "{}"
            result = json.loads(raw_text)
            category = result.get("category", "Others")
            subcategory = result.get("subcategory", "General")
            clean_description = result.get("clean_description", description)

            if category not in allowed_categories:
                category = "Others"

            telemetry.log(f"Categorized '{description[:25]}' -> {category} ({subcategory})")
            return category, subcategory, clean_description
        logger.error(f"Ollama categorization request failed: {response.text[:300]}")
        return "Others", "Uncategorized", description
    except Exception as e:
        logger.error(f"Error categorizing transaction: {str(e)}")
        return "Others", "Uncategorized", description


def query_financial_rag(db, user_query: str, user_id: Any) -> str:
    """Search relevant embedded transactions and answer with a compact local LLM call."""
    telemetry.log(f"RAG Query: '{user_query[:50]}...'")

    t0 = time.time()
    query_vector = get_embedding(user_query)
    embed_ms = (time.time() - t0) * 1000
    if not query_vector:
        telemetry.log("Vector embedding generation failed - generator offline", level="ERROR")
        return (
            "Sorry, I could not process your query because the embedding generator is currently offline."
        )

    telemetry.log(f"Generated 768-dim query embedding ({embed_ms:.1f}ms)")

    t_search = time.time()
    results = (
        db.query(Transaction)
        .options(joinedload(Transaction.account).joinedload(Account.bank))
        .filter(Transaction.user_id == user_id, Transaction.embedding.isnot(None))
        .order_by(Transaction.embedding.cosine_distance(query_vector))
        .limit(RAG_CONTEXT_LIMIT)
        .all()
    )
    search_ms = (time.time() - t_search) * 1000

    if not results:
        telemetry.log("pgvector search returned 0 matching records")
        return "I couldn't find any transactions in your history. Please upload a statement first."

    telemetry.log(f"Matched {len(results)} context transactions via pgvector ({search_ms:.1f}ms)")

    context_lines = []
    for tx in results:
        direction = "out" if tx.amount < 0 else "in"
        bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Bank"
        context_lines.append(
            f"{tx.date} | {tx.description} | {abs(tx.amount)} {direction} | {tx.category}/{tx.subcategory} | {bank_name}"
        )
    context_text = "\n".join(context_lines)

    system_prompt = (
        "You are a concise personal finance assistant. "
        "Answer only from the given transactions. Include totals when relevant. "
        "If the context is insufficient, say so. Use short Markdown."
    )
    prompt = f"Transactions:\n{context_text}\n\nQuestion: {user_query}\nAnswer:"

    telemetry.log(f"Invoking {settings.LLM_MODEL} with {len(prompt.split())} prompt tokens...")

    try:
        t_llm = time.time()
        response = ollama_generate(
            prompt,
            system=system_prompt,
            num_predict=RAG_NUM_PREDICT,
            timeout=90,
        )
        llm_duration = time.time() - t_llm
        if response.status_code == 200:
            res_data = response.json()
            response_text = res_data.get("response", "No answer received.")
            eval_count = res_data.get("eval_count", len(response_text.split()))
            t_rate = (eval_count / llm_duration) if llm_duration > 0 else 0
            telemetry.log(
                f"Inference complete: {eval_count} tokens in {llm_duration:.2f}s ({t_rate:.1f} t/s)"
            )
            return response_text
        telemetry.log(f"LLM generation failed: HTTP {response.status_code}", level="ERROR")
        return "The local AI engine returned an error. Check that Ollama is running and the model is pulled."
    except Exception as e:
        telemetry.log("Connection error to Ollama", level="ERROR")
        logger.error(f"Error querying RAG: {str(e)}")
        return "Could not connect to the local AI service. Confirm Ollama is running."
