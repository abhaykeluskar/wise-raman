# ⚙️ Sub-Task 3: Backend Subsystem Optimization Report
**Project:** WiseRaman — AI-Powered Personal Finance & Statement Intelligence  
**Document Type:** Technical Audit, Gap Analysis & Optimization Blueprint  
**Status:** Complete Analysis & Target Architecture  

---

## 1. Executive Summary

WiseRaman’s backend is built with **FastAPI 0.110**, **SQLAlchemy 2.0**, and **Pydantic v2**, designed to process complex multi-page Indian banking statements, calculate financial metrics, and serve a real-time single-page application.

Despite an extensive feature set covering 15 core financial workspaces, the backend architecture exhibits severe technical debt and scaling limitations:
1. **The 3,600+ Line Monolith:** [`backend/app/main.py`](file:///home/abhay/Documents/antigravity/wise-raman/backend/app/main.py) is a 146 KB "God file" containing over 65 route handlers, database session management, background task dispatchers, math proofs, auth flows, and schema definitions in a single file.
2. **Blocking CPU & I/O on Event Loop:** Long-running, compute-heavy tasks—including multi-page PDF parsing (`pdfplumber`), optical character recognition (`pytesseract`), memory-hard cryptographic key derivation (`Argon2id` in [`backup_service.py`](file:///home/abhay/Documents/antigravity/wise-raman/backend/app/services/backup_service.py)), and synchronous `requests` to Ollama—run inside standard request threads, causing latency spikes and worker threadpool exhaustion.
3. **Fragile In-Memory Background Tasks:** Statement categorization and vector embedding creation rely on FastAPI’s ephemeral in-memory `BackgroundTasks`. If the container restarts or crashes, all queued processing is permanently lost with zero retry capability or persistent progress tracking.
4. **Unstructured Logging & Lack of Distributed Tracing:** Logging consists of unstructured string interpolation (`logger.info(f"...")`) lacking correlation IDs, user context, or execution timestamps, making production debugging and latency profiling difficult.
5. **Security & API Surface Vulnerabilities:** Wildcard CORS (`allow_origins=["*"]`), absence of rate limiting on sensitive authentication and file upload routes, and inconsistent error handling with broad `except Exception: pass` blocks.

---

## 2. Current Architecture & Code Audit

### 2.1 File & Module Distribution

```
backend/app/
├── main.py              [146 KB / 3,648 lines]  <-- CRITICAL MONOLITH
├── models.py            [44.5 KB / 926 lines]   <-- 20+ Models
├── parser.py            [87.8 KB / 1,822 lines] <-- 7 Bank Parsers + OCR
├── database.py          [1.9 KB / 48 lines]     <-- Engine config
├── ai.py                [11.1 KB / 308 lines]   <-- Ollama client
├── ai_copilot/          [6.8 KB / 3 files]      <-- Agent & Planner
└── services/            [225 KB / 25 files]     <-- Domain engines
```

### 2.2 Deep Dive: Monolithic `main.py` Route Clutter

[`backend/app/main.py`](file:///home/abhay/Documents/antigravity/wise-raman/backend/app/main.py) mixes unrelated domains without FastAPI `APIRouter` separation:
- Authentication & JWT (`/api/auth/*`)
- Bank & Account CRUD (`/api/banks`, `/api/accounts`)
- File Upload & PDF Parsing (`/api/upload`, `/api/payslips/upload`)
- Transactions & Ledger (`/api/transactions/*`)
- Credit Card Cycles (`/api/cards`, `/api/statements`)
- Subscriptions & Mandates (`/api/subscriptions/*`, `/api/mandates/*`)
- Financial Health & Truth Lab (`/api/health-score`, `/api/truth-lab/*`)
- Backup, Portability & Crypto Restore (`/api/backup/*`)
- Dev & Diagnostics (`/api/dev/*`)

**Maintainability & Performance Impact:**
- Changes to auth or backup logic require modifying the same file that manages core transaction routing.
- Circular imports frequently require inline imports within route functions (e.g. `from app.models import AccountSubtype` inside line 507, `from app.services.reconciliation import reconcile_transfers` inside line 730).
- Inhibits isolated unit testing and route-level middleware application (e.g., specific rate limits or caching headers).

### 2.3 Deep Dive: Blocking Synchronous Workloads in Request Cycle

In `upload_bank_statement` (`@app.post("/api/upload")` in `main.py` lines 485–520):
```python
contents = file.file.read()
parsed_result = parse_statement(
    contents, 
    file.filename, 
    ...
    processing_engine=processing_engine
)
```
- A 35-page PDF statement parsed with `pdfplumber` or scanned statement processed with `pytesseract` takes **12 to 45 seconds** of intense, single-core CPU computation.
- Because this runs directly inside the HTTP request handler, the client HTTP connection is kept open. Proxies, load balancers, or browsers can drop the connection with `504 Gateway Timeout`.
- Worker threads in Uvicorn’s threadpool are blocked from handling incoming lightweight requests (e.g. status polls, telemetry, dashboard views).

Similarly, in [`backend/app/services/backup_service.py`](file:///home/abhay/Documents/antigravity/wise-raman/backend/app/services/backup_service.py):
```python
kdf = Argon2id(salt=salt, length=32, iterations=3, lanes=4, memory_cost=65536)
return kdf.derive(passphrase.encode('utf-8'))
```
Argon2id key derivation intentionally consumes 64 MB of RAM and multiple CPU cores, blocking the thread for 800ms–2000ms.

### 2.4 Deep Dive: Ephemeral Background Tasks

In `main.py` lines 724–737:
```python
if saved_tx_ids:
    background_tasks.add_task(enrich_transactions_task, saved_tx_ids)
    background_tasks.add_task(run_reconcile_transfers, str(current_user.id))
```
- FastAPI’s `BackgroundTasks` executes in-memory after the HTTP response is dispatched.
- **Data Loss Vulnerability:** If the application process terminates (e.g. Docker container restart, OOM killer, server deployment), all pending enrichment tasks are lost.
- Transactions remain in `"category": "Processing..."` indefinitely.
- The user has no endpoint to inspect task progress percentage or re-trigger enrichment for stuck transactions.

---

## 3. Industry Standards & Best Practices Gap Analysis

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             GAP ANALYSIS MATRIX                                  │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│ Industry Standard       │ WiseRaman Current State   │ Severity / Impact         │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Modular APIRouter       │ 3,648-line monolithic      │ CRITICAL (Violates SRP;   │
│ Architecture per Domain │ `main.py`                  │ causes circular imports)  │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Offloaded Compute       │ Synchronous parsing & KDF  │ CRITICAL (HTTP timeouts,  │
│ (Worker / ProcessPool)  │ inside request lifecycle   │ threadpool exhaustion)    │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Persistent Task Queue   │ Ephemeral in-memory        │ HIGH (Data loss on crash; │
│ (ARQ / Celery / Redis)  │ `BackgroundTasks`          │ no task observability)    │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Rate Limiting           │ Zero rate limiting on      │ HIGH (Vulnerable to brute │
│ (`slowapi` / Redis)     │ login, uploads, or AI      │ force and resource denial)│
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Structured JSON Logging │ Unstructured text strings  │ MEDIUM (Difficult APM &   │
│ with Correlation IDs    │ with `logger.info(f"...")` │ log aggregation)          │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Strict CORS Policy      │ Wildcard `["*"]`           │ MEDIUM (CSRF / security   │
│                         │ allowed origins            │ exposure)                 │
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

---

## 4. Target Optimization Blueprint

### 4.1 Modular APIRouter Architecture

Deconstruct `main.py` into dedicated, self-contained router modules following Domain-Driven Design (DDD):

```
backend/app/
├── main.py                        <-- Lightweight application factory (100 lines)
├── api/
│   ├── deps.py                    <-- Shared dependencies (get_db, get_current_user)
│   ├── v1/
│   │   ├── api.py                 <-- Unified v1 router aggregator
│   │   ├── routers/
│   │   │   ├── auth.py            <-- Login, registration, token refresh
│   │   │   ├── accounts.py        <-- Banks & Accounts CRUD
│   │   │   ├── statements.py      <-- File upload, parsing, balance proof
│   │   │   ├── transactions.py    <-- Ledger, filtering, categorization
│   │   │   ├── credit_cards.py    <-- Cycles, dues, statement tracking
│   │   │   ├── payslips.py        <-- Salary slip ingestion & tax analysis
│   │   │   ├── analytics.py       <-- Cashflow, burn rate, net worth
│   │   │   ├── subscriptions.py   <-- Mandates & recurring bill watchdog
│   │   │   ├── copilot.py         <-- AI assistant & RAG endpoints
│   │   │   ├── backup.py          <-- Encrypted .wbr export & restore
│   │   │   └── truth_lab.py       <-- Invariants, audit trail & diagnostics
```

**Target `backend/app/main.py` (Clean Entry Point):**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.core.config import settings
from app.core.middleware import RequestLoggingMiddleware

app = FastAPI(
    title="WiseRaman Financial API",
    version="1.1.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
```

### 4.2 Asynchronous Offloading of CPU-Bound Parsers

Move compute-heavy PDF parsing (`pdfplumber`, `pypdfium2`, OCR) to a dedicated `ProcessPoolExecutor` or asynchronous background worker:

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

# Reusable process pool for CPU-bound parsing
_parser_pool = ProcessPoolExecutor(max_workers=2)

@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    ...
):
    contents = await file.read()
    loop = asyncio.get_running_loop()
    
    # Run heavy PDF parsing in isolated worker process (does not block event loop)
    parsed_result = await loop.run_in_executor(
        _parser_pool,
        parse_statement_sync,
        contents,
        file.filename,
        account_type_str,
        bank_name,
        processing_engine,
        password
    )
```

### 4.3 Persistent Task Queue with ARQ or Celery
Replace ephemeral `BackgroundTasks` with a durable task queue backed by Redis (or PostgreSQL-backed queue like `procrastinate` for zero-additional-container deployments):

```python
# Tasks retain state, retry count, and live progress percentage
@task
async def enrich_transactions_durable(job_id: str, transaction_ids: list[str]):
    await update_job_status(job_id, progress=0, status="RUNNING")
    
    # Batch embeddings via async httpx
    # Batch categorization
    
    await update_job_status(job_id, progress=100, status="COMPLETED")
```
Allows the frontend to query `GET /api/tasks/{task_id}` and render a real-time progress bar with automatic retry on failure.

### 4.4 Rate Limiting & Security Hardening
Deploy `slowapi` to protect authentication and expensive AI / upload endpoints:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@router.post("/auth/login")
@limiter.limit("5/minute")
def login(request: Request, ...):
    ...

@router.post("/upload")
@limiter.limit("10/hour")
def upload(request: Request, ...):
    ...
```

### 4.5 Structured JSON Logging with Request Correlation IDs

```python
import structlog
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.bind_contextvars(request_id=request_id)
        
        start_time = time.time()
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2)
        )
        response.headers["X-Request-ID"] = request_id
        return response
```

---

## 5. Implementation Action Plan

| Step | Milestone | Expected Impact |
| :--- | :--- | :--- |
| **Step 1** | Refactor `backend/app/main.py` into modular domain routers (`app/api/v1/routers/`). | Decreases monolithic file from 3,648 lines to 100 lines; enables isolated unit testing. |
| **Step 2** | Offload PDF parsing & Argon2id KDF to `ProcessPoolExecutor`. | Prevents HTTP 504 gateway timeouts; keeps FastAPI event loop responsive. |
| **Step 3** | Implement `slowapi` rate limiting on `/auth/login`, `/upload`, and `/copilot`. | Protects backend against denial of service and brute force credential attacks. |
| **Step 4** | Implement structured JSON logging middleware with Request IDs. | Provides end-to-end auditability and latency metrics for all API requests. |
| **Step 5** | Upgrade background tasks to durable job status tracking. | Prevents silent enrichment failures; enables live upload progress bars in the UI. |
