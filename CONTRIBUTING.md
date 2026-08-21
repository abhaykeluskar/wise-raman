# Contributing to WiseRaman

Thank you for your interest in contributing to WiseRaman! We welcome contributions to support new Indian banks, improve statement parsers, enhance financial intelligence algorithms, and refine the UI.

---

## 🛠️ Development Setup

### 1. Fork and Clone
```bash
git clone https://github.com/YOUR_USERNAME/wise-raman.git
cd wise-raman
```

### 2. Run Locally with Docker Compose
```bash
docker compose up -d --build
```

### 3. Local Development (Without Docker)
- **Backend:**
  ```bash
  cd backend
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --reload --port 8000
  ```
- **Frontend:**
  ```bash
  cd frontend
  npm install
  npm run dev
  ```

---

## 🏦 Adding a New Bank Statement Parser

When adding support for a new bank (e.g. Kotak, ICICI, IndusInd):
1. Add regex patterns and parser logic inside `backend/app/parser.py`.
2. Implement exact debit/credit sign convention:
   - **(+) Cash In / Deposit / Refund / CC Payment Received**
   - **(-) Cash Out / Purchase / Debit / Withdrawal**
3. Ensure mathematical verification (`Opening + Deposits - Withdrawals == Closing`).
4. Add sample unit tests.

---

## 📋 Pull Request Guidelines

1. **Create a branch:** `git checkout -b feat/your-feature-name` or `fix/your-bug-fix`.
2. **Commit changes:** Write clear, concise commit messages following Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`).
3. **Verify builds:** Ensure `npm run build` in `frontend` and FastAPI startup in `backend` succeed with no errors.
4. **Submit PR:** Open a Pull Request against the `master` branch with a clear summary of changes.
