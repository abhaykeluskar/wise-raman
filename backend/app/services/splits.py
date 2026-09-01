from decimal import Decimal
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from datetime import datetime

from app.models import SplitExpense, SplitParticipant

def calculate_split_summary(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Computes net split balances:
    - Owed to You: Expenses you paid where participants haven't settled.
    - You Owe: Expenses someone else paid where you haven't settled.
    - Person-wise breakdown.
    """
    expenses = db.query(SplitExpense).filter(SplitExpense.user_id == user_id).all()

    total_owed_to_you = Decimal("0.00")
    total_you_owe = Decimal("0.00")
    person_balances: Dict[str, Decimal] = {}

    for exp in expenses:
        for p in exp.participants:
            if not p.is_settled:
                share = Decimal(str(p.share_amount or 0))
                p_name = p.name.strip().title()

                if exp.paid_by_user:
                    # User paid, this participant owes user
                    total_owed_to_you += share
                    person_balances[p_name] = person_balances.get(p_name, Decimal("0.00")) + share
                else:
                    # Someone else paid, user owes them (or participant share tracking)
                    if p.name.lower() in ["me", "self", "you"]:
                        total_you_owe += share
                        payer = (exp.payer_name or "Friend").strip().title()
                        person_balances[payer] = person_balances.get(payer, Decimal("0.00")) - share

    net_balance = total_owed_to_you - total_you_owe

    breakdown = []
    for person, bal in person_balances.items():
        breakdown.append({
            "person": person,
            "net_amount": float(bal),
            "status": "OWES_YOU" if bal > 0 else ("YOU_OWE" if bal < 0 else "SETTLED")
        })

    return {
        "total_owed_to_you": float(total_owed_to_you),
        "total_you_owe": float(total_you_owe),
        "net_balance": float(net_balance),
        "person_balances": sorted(breakdown, key=lambda x: abs(x["net_amount"]), reverse=True)
    }

def settle_split_participant(db: Session, participant_id: str) -> bool:
    participant = db.query(SplitParticipant).filter(SplitParticipant.id == participant_id).first()
    if not participant:
        return False
    participant.is_settled = True
    participant.settled_at = datetime.utcnow()
    db.commit()
    return True
