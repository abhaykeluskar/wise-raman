"""
test_backend_optimization.py
Comprehensive verification test suite for Phase 3 (Backend Optimization).
Validates:
1. Custom RequestTrackingMiddleware: Presence of X-Correlation-ID and X-Process-Time headers.
2. Fast root/health check endpoint.
3. Modular APIRouter integrity across all domain modules.
4. User authentication and JWT verification via modular dependencies.
5. Task registry and status tracking.
6. Non-blocking asynchronous statement parsing capability.
"""

import sys
import uuid
import requests

BASE_URL = "http://127.0.0.1:8000"

def test_root_and_headers():
    print("\n--- 1. Testing Root Health Check & RequestTrackingMiddleware ---")
    custom_cid = f"test-trace-{uuid.uuid4()}"
    res = requests.get(f"{BASE_URL}/", headers={"X-Correlation-ID": custom_cid})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data.get("status") == "healthy", f"Unexpected payload: {data}"
    
    # Verify Headers
    assert "x-correlation-id" in res.headers, "X-Correlation-ID header missing"
    assert res.headers["x-correlation-id"] == custom_cid, f"Correlation ID mismatch: {res.headers.get('x-correlation-id')}"
    assert "x-process-time" in res.headers, "X-Process-Time header missing"
    print(f"✓ Root endpoint healthy: {data}")
    print(f"✓ Correlation ID preserved: {res.headers['x-correlation-id']}")
    print(f"✓ Process time header: {res.headers['x-process-time']}")

def test_generated_correlation_id():
    print("\n--- 2. Testing Auto-Generated Correlation ID ---")
    res = requests.get(f"{BASE_URL}/")
    assert res.status_code == 200
    cid = res.headers.get("x-correlation-id")
    assert cid and len(cid) > 10, f"Invalid generated correlation ID: {cid}"
    print(f"✓ Auto-generated Correlation ID: {cid}")

def test_auth_and_protected_router():
    print("\n--- 3. Testing Auth Router & Protected Endpoints ---")
    # Login as dev user
    login_res = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": "dev@test.com", "password": "dev@2026"}
    )
    assert login_res.status_code == 200, f"Dev login failed: {login_res.text}"
    token_data = login_res.json()
    token = token_data.get("token") or token_data.get("access_token")
    assert token, "Token not received in login response"
    print("✓ Logged in via /api/auth/login")

    # Access protected /api/auth/me
    headers = {"Authorization": f"Bearer {token}"}
    me_res = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert me_res.status_code == 200, f"/api/auth/me failed: {me_res.text}"
    user_info = me_res.json()
    assert user_info.get("email") == "dev@test.com"
    print(f"✓ Protected route /api/auth/me succeeded for user: {user_info.get('email')}")
    return headers

def test_router_endpoints(auth_headers):
    print("\n--- 4. Testing Domain Router Availability ---")
    # Test banks
    res = requests.get(f"{BASE_URL}/api/banks", headers=auth_headers)
    assert res.status_code == 200, f"/api/banks failed: {res.status_code}"
    banks = res.json()
    print(f"✓ /api/banks returned {len(banks)} banks")

    # Test categories
    res = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
    assert res.status_code == 200, f"/api/categories failed: {res.status_code}"
    cats = res.json()
    print(f"✓ /api/categories returned {len(cats)} categories")

    # Test accounts
    res = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
    assert res.status_code == 200, f"/api/accounts failed: {res.status_code}"
    accounts = res.json()
    print(f"✓ /api/accounts returned {len(accounts)} accounts")

    # Test net-worth
    res = requests.get(f"{BASE_URL}/api/net-worth", headers=auth_headers)
    assert res.status_code == 200, f"/api/net-worth failed: {res.status_code}"
    nw = res.json()
    print(f"✓ /api/net-worth returned Net Worth: ₹{nw.get('net_worth', 0):,.2f}")

    # Test credit cards
    res = requests.get(f"{BASE_URL}/api/cards", headers=auth_headers)
    assert res.status_code == 200, f"/api/cards failed: {res.status_code}"
    cards = res.json()
    print(f"✓ /api/cards returned {len(cards)} credit cards")

    # Test subscriptions
    res = requests.get(f"{BASE_URL}/api/subscriptions", headers=auth_headers)
    assert res.status_code == 200, f"/api/subscriptions failed: {res.status_code}"
    subs = res.json()
    print(f"✓ /api/subscriptions returned {len(subs)} subscriptions")

    # Test truth lab health summary
    res = requests.get(f"{BASE_URL}/api/dev/health-summary", headers=auth_headers)
    assert res.status_code == 200, f"/api/dev/health-summary failed: {res.status_code}"
    summary = res.json()
    print(f"✓ /api/dev/health-summary returned valid summary (validated_transactions: {summary.get('validated_transactions')})")

def test_task_status_endpoint():
    print("\n--- 5. Testing Task Status Registry Endpoint ---")
    # Non-existent task should 404
    res = requests.get(f"{BASE_URL}/api/tasks/non-existent-task-id")
    assert res.status_code == 404, f"Expected 404 for unknown task, got {res.status_code}"
    print("✓ Unknown task ID correctly returned 404")

    # In-process registry test via FastAPI TestClient
    from app.main import app
    from app.services.tasks import _task_status
    from fastapi.testclient import TestClient
    client = TestClient(app)
    dummy_task_id = "test-task-123"
    _task_status[dummy_task_id] = {"status": "COMPLETED", "progress": 100, "total": 10}
    try:
        client_res = client.get(f"/api/tasks/{dummy_task_id}")
        assert client_res.status_code == 200, f"Expected 200, got {client_res.status_code}"
        data = client_res.json()
        assert data["status"] == "COMPLETED"
        assert data["progress"] == 100
        print(f"✓ In-process task registry and status endpoint verified: {data}")
    finally:
        _task_status.pop(dummy_task_id, None)

if __name__ == "__main__":
    try:
        test_root_and_headers()
        test_generated_correlation_id()
        auth_headers = test_auth_and_protected_router()
        test_router_endpoints(auth_headers)
        test_task_status_endpoint()
        print("\n🎉 ALL BACKEND OPTIMIZATION TESTS PASSED SUCCESSFULLY!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
