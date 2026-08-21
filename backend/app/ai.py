import requests
import json
import logging
from sqlalchemy import text
from app.config import settings
from app.models import Transaction

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
    "Others"
]

def ensure_models_exist():
    """Check if the required LLM and Embedding models exist in Ollama; if not, pull them."""
    try:
        # Check installed models
        response = requests.get(f"{settings.OLLAMA_URL}/api/tags")
        if response.status_code != 200:
            logger.error("Failed to check Ollama models.")
            return False
            
        installed_models = [m["name"] for m in response.json().get("models", [])]
        
        # 1. Pull Embedding model first (since it is small ~274MB and critical for RAG/Ingestion database operations)
        embed_model = settings.EMBEDDING_MODEL
        if embed_model not in installed_models and f"{embed_model}:latest" not in installed_models:
            logger.info(f"Pulling Embedding model: {embed_model}...")
            requests.post(f"{settings.OLLAMA_URL}/api/pull", json={"name": embed_model, "stream": False})
            logger.info(f"Embedding model {embed_model} pulled successfully.")
            
        # 2. Pull LLM model (larger model ~4.7GB, takes a few minutes)
        llm_model = settings.LLM_MODEL
        if llm_model not in installed_models and f"{llm_model}:latest" not in installed_models:
            logger.info(f"Pulling LLM model: {llm_model}. This might take a few minutes...")
            requests.post(f"{settings.OLLAMA_URL}/api/pull", json={"name": llm_model, "stream": False})
            logger.info(f"LLM model {llm_model} pulled successfully.")
            
        return True
    except Exception as e:
        logger.error(f"Error connecting to Ollama: {str(e)}")
        return False

import time
from app.telemetry import ai_telemetry as telemetry

def get_embedding(text_to_embed):
    """Generate vector embedding for the text using Ollama's embedding endpoint."""
    t0 = time.time()
    try:
        response = requests.post(
            f"{settings.OLLAMA_URL}/api/embeddings",
            json={
                "model": settings.EMBEDDING_MODEL,
                "prompt": text_to_embed
            },
            timeout=30
        )
        if response.status_code == 200:
            duration_ms = (time.time() - t0) * 1000
            emb = response.json().get("embedding")
            return emb
        else:
            logger.error(f"Ollama embedding request failed: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        return None

from app.merchant_map import match_known_merchant

def categorize_transaction(description, amount, categories=None):
    """Categorize a transaction based on its description and amount using fast deterministic rules or Ollama."""
    allowed_categories = categories if categories else CATEGORIES

    # 1. Fast path: Deterministic merchant map lookup
    known_match = match_known_merchant(description)
    if known_match:
        clean_name, cat, subcat = known_match
        if cat in allowed_categories:
            telemetry.log(f"Fast-Matched '{description[:25]}' -> {cat} ({subcat}) via Indian merchant engine")
            return cat, subcat, clean_name

    # 2. AI classification fallback with few-shot Indian context examples
    prompt = f"""
    You are a precise personal finance classifier specialized in Indian banking formats. Categorize the transaction description into exactly ONE of the following categories:
    {", ".join(allowed_categories)}
    
    Provide a specific subcategory (1-2 words).
    
    Context Rules:
    - UPI payments often contain VPA/UPI IDs (e.g. @okicici, @paytm, @ybl) and merchant names.
    - NEFT/IMPS/RTGS/NACH denote bank transfers, salaries, or bill auto-debits.
    - If the description indicates Swiggy, Zomato, Blinkit, Zepto, categorize appropriately as Dining or Groceries.
    - If the description indicates CRED, Paytm, or BillDesk, it may be a credit card bill or utility.
    - Strip out UTRs, IMPS reference numbers, UPI handles, and VPA strings from the raw description.
    - Standardize raw merchant descriptions (e.g., convert 'ZOMATO LTD-ZOMATO' to simply 'Zomato').
    
    Few-Shot Examples:
    - Raw: "UPI/321456789012/SWIGGY/swiggy@icici" -> {{"category": "Dining", "subcategory": "Food Delivery", "clean_description": "Swiggy"}}
    - Raw: "POS 412345678901 IRCTC NEXTGEN NEW DELHI" -> {{"category": "Travel", "subcategory": "Train Tickets", "clean_description": "IRCTC"}}
    - Raw: "ACH D- HDFC LIFE INSURANCE" -> {{"category": "Investment", "subcategory": "Life Insurance", "clean_description": "HDFC Life"}}
    - Raw: "NETFLIX ENTERTAINMENT SVCS" -> {{"category": "Entertainment", "subcategory": "OTT Subscription", "clean_description": "Netflix"}}
    - Raw: "SALARY CREDIT FOR JULY 2026" -> {{"category": "Salary/Income", "subcategory": "Employment Income", "clean_description": "Salary Credit"}}
    
    Transaction Details:
    - Description: "{description}"
    - Amount: {amount} (negative indicates spending/debit, positive indicates refund/income/payment)
    
    You MUST respond ONLY with a JSON object in this exact schema:
    {{
      "category": "Selected Category",
      "subcategory": "Subcategory Name",
      "clean_description": "Standardized Merchant Name"
    }}
    """
    
    try:
        t0 = time.time()
        response = requests.post(
            f"{settings.OLLAMA_URL}/api/generate",
            json={
                "model": settings.LLM_MODEL,
                "prompt": prompt,
                "format": "json",
                "stream": False
            },
            timeout=45
        )
        
        if response.status_code == 200:
            result = json.loads(response.json().get("response", "{}"))
            category = result.get("category")
            subcategory = result.get("subcategory")
            clean_description = result.get("clean_description", description)
            
            if category not in allowed_categories:
                category = "Others"
                
            telemetry.log(f"Categorized '{description[:25]}' -> {category} ({subcategory})")
            return category, subcategory, clean_description
        else:
            logger.error(f"Ollama categorization request failed: {response.text}")
            return "Others", "Uncategorized", description
    except Exception as e:
        logger.error(f"Error categorizing transaction: {str(e)}")
        return "Others", "Uncategorized", description

def query_financial_rag(db, user_query):
    """Search for relevant transactions using vector similarity and query the LLM for a RAG response."""
    telemetry.log(f"RAG Query: '{user_query[:50]}...'")
    
    # 1. Generate query embedding
    t0 = time.time()
    query_vector = get_embedding(user_query)
    embed_ms = (time.time() - t0) * 1000
    if not query_vector:
        telemetry.log("Vector embedding generation failed - generator offline", level="ERROR")
        return "Sorry, I could not process your query because the embedding generator is currently offline."
        
    telemetry.log(f"Generated 768-dim query embedding ({embed_ms:.1f}ms)")

    # 2. Query database for context using pgvector cosine distance
    t_search = time.time()
    results = db.query(Transaction).order_by(
        Transaction.embedding.cosine_distance(query_vector)
    ).limit(30).all()
    search_ms = (time.time() - t_search) * 1000
    
    if not results:
        telemetry.log("pgvector search returned 0 matching records")
        return "I couldn't find any transactions in your history. Please upload a statement first."
        
    telemetry.log(f"Matched {len(results)} context transactions via pgvector ({search_ms:.1f}ms)")

    # 3. Format context
    context_lines = []
    for tx in results:
        amount_type = "Spent" if tx.amount < 0 else "Received/Refunded"
        abs_amount = abs(tx.amount)
        bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Bank"
        context_lines.append(
            f"- Date: {tx.date}, Description: '{tx.description}', Amount: {abs_amount} ({amount_type}), Category: {tx.category}, Subcategory: {tx.subcategory}, Bank: {bank_name}"
        )
    context_text = "\n".join(context_lines)
    
    # 4. Construct prompt for Ollama
    system_prompt = """You are an expert personal finance assistant. 
Analyze the provided transaction history and answer the user's question accurately.
Provide insights and details like total sums, date ranges, and categories if relevant.
If the provided context does not contain the answer, state that clearly.
Keep your answer clear, informative, and formatted using Markdown.
"""

    prompt = f"""
Context (Relevant Transactions):
{context_text}

Question:
{user_query}

Answer:
"""

    prompt_words = len(prompt.split())
    telemetry.log(f"Invoking {settings.LLM_MODEL} with {prompt_words} prompt tokens...")

    try:
        t_llm = time.time()
        response = requests.post(
            f"{settings.OLLAMA_URL}/api/generate",
            json={
                "model": settings.LLM_MODEL,
                "system": system_prompt,
                "prompt": prompt,
                "stream": False
            },
            timeout=120
        )
        llm_duration = time.time() - t_llm
        if response.status_code == 200:
            res_data = response.json()
            response_text = res_data.get("response", "No answer received.")
            eval_count = res_data.get("eval_count", len(response_text.split()))
            t_rate = (eval_count / llm_duration) if llm_duration > 0 else 0
            telemetry.log(f"Inference complete: {eval_count} tokens in {llm_duration:.2f}s ({t_rate:.1f} t/s)")
            return response_text
        else:
            telemetry.log(f"LLM generation failed: HTTP {response.status_code}", level="ERROR")
            return f"Error from AI engine: {response.text}"
    except Exception as e:
        telemetry.log(f"Connection error to Ollama: {str(e)}", level="ERROR")
        logger.error(f"Error querying RAG: {str(e)}")
        return f"Could not connect to local AI service. Error: {str(e)}"
