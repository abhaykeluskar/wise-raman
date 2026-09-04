from .auth import router as auth_router, user_router
from .banks_accounts import router as banks_accounts_router
from .statements import router as statements_router
from .transactions import router as transactions_router
from .credit_cards import router as credit_cards_router
from .analytics import router as analytics_router
from .subscriptions import router as subscriptions_router
from .copilot import router as copilot_router
from .settings_router import router as settings_router
from .truth_lab import router as truth_lab_router
from .backup import router as backup_router
from .transfers_webhooks import router as transfers_webhooks_router
from .lifestyle_os import router as lifestyle_os_router

all_routers = [
    auth_router,
    user_router,
    banks_accounts_router,
    statements_router,
    transactions_router,
    credit_cards_router,
    analytics_router,
    subscriptions_router,
    copilot_router,
    settings_router,
    truth_lab_router,
    backup_router,
    transfers_webhooks_router,
    lifestyle_os_router,
]

__all__ = [
    "auth_router",
    "banks_accounts_router",
    "statements_router",
    "transactions_router",
    "credit_cards_router",
    "analytics_router",
    "subscriptions_router",
    "copilot_router",
    "settings_router",
    "truth_lab_router",
    "backup_router",
    "transfers_webhooks_router",
    "lifestyle_os_router",
    "all_routers",
]
