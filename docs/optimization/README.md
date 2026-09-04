# 🚀 WiseRaman System-Wide Optimization Suite

This directory contains the exhaustive technical audit, industry standards comparison, and optimization blueprints across all four pillars of the **WiseRaman** architecture:

```
docs/optimization/
├── README.md                          <-- Master Overview & Roadmap (This file)
├── 01_AI_OPTIMIZATION_REPORT.md       <-- Sub-Task 1: AI Subsystem
├── 02_DB_OPTIMIZATION_REPORT.md       <-- Sub-Task 2: Database Subsystem
├── 03_BACKEND_OPTIMIZATION_REPORT.md  <-- Sub-Task 3: Backend Subsystem
└── 04_FRONTEND_OPTIMIZATION_REPORT.md <-- Sub-Task 4: Frontend Subsystem
```

---

## 📊 High-Level Comparison & Impact Matrix

| Subsystem | Primary Current Bottleneck | Industry Standard Target | Expected Impact | Detailed Report |
| :--- | :--- | :--- | :--- | :--- |
| **🤖 1. AI Engine** | Sequential blocking Ollama calls (200 reqs/statement); pure vector search on math queries; mock Copilot agent. | Async batch embeddings (`httpx`); Hybrid RAG (FTS + Vector RRF); Text-to-SQL deterministic router; SSE streaming. | **12.5x faster** enrichment; **100% exact math**; sub-400ms chat time-to-first-token. | [AI Report](./01_AI_OPTIMIZATION_REPORT.md) |
| **🗄️ 2. Database** | Missing composite `(user_id, date)` index; missing `pgvector` HNSW index; in-memory `.all()` aggregations; $O(N \times M)$ reconciliation loop. | HNSW indexing (`vector_cosine_ops`); SQL `GROUP BY` rollups & materialized views; indexed SQL self-join for transfers; Alembic. | **90% lower query latency**; **3000x faster** aggregations; eliminates connection pool saturation. | [DB Report](./02_DB_OPTIMIZATION_REPORT.md) |
| **⚙️ 3. Backend** | 3,648-line monolithic `main.py`; synchronous CPU-heavy PDF/OCR parsing in HTTP handlers; ephemeral in-memory tasks. | Domain-Driven `APIRouter` modularization; `ProcessPoolExecutor` parser offload; durable task queue with retry; rate limiting. | Eliminates HTTP 504 timeouts; resilient background jobs; maintainable, testable codebase. | [Backend Report](./03_BACKEND_OPTIMIZATION_REPORT.md) |
| **🎨 4. Frontend** | 1.4 MB monolithic bundle (17 views imported synchronously); single context re-render thrashing; fetching 5,000 unvirtualized rows. | Route-level `React.lazy()` + `<Suspense>`; TanStack Query v5 server caching; `@tanstack/react-virtual` 60 FPS table; server-side paging. | **80% smaller initial JS bundle** (<300 KB); **60 FPS** silky scrolling; drops network payload from 5MB to <50KB. | [Frontend Report](./04_FRONTEND_OPTIMIZATION_REPORT.md) |

---

## 🗺️ Unified 4-Phase Optimization Roadmap

```mermaid
graph TD
    subgraph Phase 1 [Phase 1: Quick Wins & Database Stability]
        P1_1[Add Missing B-Tree & HNSW Indexes]
        P1_2[Expand DB Connection Pool & Recycle]
        P1_3[Route-based React.lazy Code Splitting]
    end

    subgraph Phase 2 [Phase 2: Data Pipeline & Query Speed]
        P2_1[Rewrite in-memory .all aggregations to SQL GROUP BY]
        P2_2[Implement Async Batch Embeddings in Ollama client]
        P2_3[Server-side Pagination & Virtualized Table]
    end

    subgraph Phase 3 [Phase 3: Backend Modularization & Task Durability]
        P3_1[Deconstruct main.py into Modular APIRouters]
        P3_2[Offload PDF Parsing & KDF to ProcessPoolExecutor]
        P3_3[Durable Task State Tracking with Live Progress]
    end

    subgraph Phase 4 [Phase 4: Advanced AI & Streaming UI]
        P4_1[Hybrid RAG & Text-to-SQL Deterministic Router]
        P4_2[Server-Sent Events SSE for AI Chat & Upload Progress]
        P4_3[Replace FinanceContext with TanStack Query v5]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```
