# 📝 WiseRaman — Project TODO & Roadmap

This document tracks pending optimizations, architectural improvements, and technical debt to address in upcoming iterations.

---

## ⚡ Performance & Scalability

### [ ] Optimize AI Background Transaction Enrichment Task
- **Priority:** High
- **Component:** `backend/app/main.py` (`enrich_transactions_task`), `backend/app/ai.py`
- **Issue:**
  - When importing statements with hundreds of transactions, `background_tasks.add_task(enrich_transactions_task, saved_tx_ids)` runs synchronous Ollama categorization and `pgvector` embedding generation in sequential order.
  - Each categorization takes ~2–4 seconds on local Ollama hardware.
  - During heavy batches, this monopolizes CPU/GPU and DB connections, leading to API latency spikes and request timeouts (e.g., `ClientDisconnected` causing temporary `500 Internal Server Error` on interactive endpoints like `/api/auth/login`).
- **Proposed Solutions:**
  1. **Decoupled Background Worker:**
     - Move long-running AI enrichment from Starlette `BackgroundTasks` into a separate worker queue (e.g., Celery, RQ, or a dedicated `asyncio` worker / thread with low process priority).
  2. **Batch Chunking & Throttling:**
     - Process transactions in smaller batches (e.g. 10 at a time) with brief sleep/yield intervals to let HTTP event loop and database connections breathe.
  3. **Non-Blocking DB Sessions:**
     - Ensure the background enrichment uses short-lived, isolated database sessions rather than retaining or thrashing connections with frequent commit/lock contention.
  4. **Frontend Progress Indicator:**
     - Provide an async status endpoint (e.g. `/api/tasks/enrichment-status`) so the UI displays non-intrusive progress ("Enriching 34/250 transactions with AI...") while allowing full navigation and login responsiveness.
