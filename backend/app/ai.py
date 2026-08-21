import json
import logging
import time
from urllib.parse import urlparse

import requests
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

KEEP_ALIVE = "30m"
RAG_CONTEXT_LIMIT = 24
CATEGORIZE_NUM_PREDICT = 192
RAG_NUM_PREDICT = 640

_session = requests.Session()
_adapter = HTTPAdapter(
    pool_connections=4,
    pool_maxsize=8,
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


def llm_options(num_predict: int, num_ctx: int | None = None) -> dict:
    return {
        "temperature": settings.LLM_TEMPERATURE,
        "num_ctx": num_ctx if num_ctx is not None else settings.LLM_NUM_CTX,
        "num_predict": num_predict,
    }


def ollama_generate(prompt: str, *, system: str | None = None, fmt=None, num_predict: int = RAG_NUM_PREDICT, timeout: int = 90):
    payload = {
        "model": settings.LLM_MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": {
            **llm_options(num_predict),
            "num_gpu": -1,
        },
    }
    if system:
        payload["system"] = system
    if fmt is not None:
        payload["format"] = fmt
    return _session.post(f"{settings.OLLAMA_URL}/api/generate", json=payload, timeout=timeout)


def ensure_models_exist():
    """Check if the required LLM and Embedding models exist in Ollama; if not, pull them."""
    try:
        response = _session.get(f"{settings.OLLAMA_URL}/api/tags", timeout=8)
        if response.status_code != 200:
            logger.error("Failed to check Ollama models.")
            return False

        installed_models = [m["name"] for m in response.json().get("models", [])]

        embed_model = settings.EMBEDDING_MODEL
        if embed_model not in installed_models and f"{embed_model}:latest" not in installed_models:
            logger.info(f"Pulling Embedding model: {embed_model}...")
            _session.post(
                f"{settings.OLLAMA_URL}/api/pull",
                json={"name": embed_model, "stream": False},
                timeout=600,
            )
            logger.info(f"Embedding model {embed_model} pulled successfully.")

        llm_model = settings.LLM_MODEL
        if llm_model not in installed_models and f"{llm_model}:latest" not in installed_models:
            logger.info(f"Pulling LLM model: {llm_model}. This might take a few minutes...")
            _session.post(
                f"{settings.OLLAMA_URL}/api/pull",
                json={"name": llm_model, "stream": False},
                timeout=1800,
            )
            logger.info(f"LLM model {llm_model} pulled successfully.")

        return True
    except Exception as e:
        logger.error(f"Error connecting to Ollama: {str(e)}")
        return False


def get_embedding(text_to_embed):
    """Generate vector embedding using Ollama (/api/embed, with legacy fallback)."""
    t0 = time.time()
    base = settings.OLLAMA_URL.rstrip("/")
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


def categorize_transaction(description, amount, categories=None):
    """Categorize a transaction using merchant rules first, then a short LLM call."""
    allowed_categories = categories if categories else CATEGORIES

    known_match = match_known_merchant(description)
    if known_match:
        clean_name, cat, subcat = known_match
        if cat in allowed_categories:
            telemetry.log(f"Fast-Matched '{description[:25]}' -> {cat} ({subcat}) via Indian merchant engine")
            return cat, subcat, clean_name

    cats = ", ".join(allowed_categories)
    prompt = (
        "Classify this Indian bank transaction. Reply JSON only.\n"
        f"Categories: {cats}\n"
        'Schema: {"category":"...","subcategory":"...","clean_description":"..."}\n'
        f'Description: "{description}"\n'
        f"Amount: {amount} (negative=spend)\n"
    )

    try:
        response = ollama_generate(
            prompt,
            fmt="json",
            num_predict=CATEGORIZE_NUM_PREDICT,
            timeout=25,
        )

        if response.status_code == 200:
            result = json.loads(response.json().get("response", "{}") or "{}")
            category = result.get("category")
            subcategory = result.get("subcategory")
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


def query_financial_rag(db, user_query):
    """Search relevant embedded transactions and answer with a compact local LLM call."""
    telemetry.log(f"RAG Query: '{user_query[:50]}...'")

    t0 = time.time()
    query_vector = get_embedding(user_query)
    embed_ms = (time.time() - t0) * 1000
    if not query_vector:
        telemetry.log("Vector embedding generation failed - generator offline", level="ERROR")
        return "Sorry, I could not process your query because the embedding generator is currently offline."

    telemetry.log(f"Generated 768-dim query embedding ({embed_ms:.1f}ms)")

    t_search = time.time()
    results = (
        db.query(Transaction)
        .options(joinedload(Transaction.account).joinedload(Account.bank))
        .filter(Transaction.embedding.isnot(None))
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
            telemetry.log(f"Inference complete: {eval_count} tokens in {llm_duration:.2f}s ({t_rate:.1f} t/s)")
            return response_text
        telemetry.log(f"LLM generation failed: HTTP {response.status_code}", level="ERROR")
        return "The local AI engine returned an error. Check that Ollama is running and the model is pulled."
    except Exception as e:
        telemetry.log("Connection error to Ollama", level="ERROR")
        logger.error(f"Error querying RAG: {str(e)}")
        return "Could not connect to the local AI service. Confirm Ollama is running."
