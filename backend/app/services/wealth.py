from typing import List, Dict, Any, Optional
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from pyxirr import xirr

from app.models import InvestmentAccount, InvestmentHolding

def calculate_portfolio_summary(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Aggregates all investment holdings for a user and calculates the absolute return.
    """
    holdings = db.query(InvestmentHolding).filter(InvestmentHolding.user_id == user_id).all()
    
    total_invested = Decimal('0.0')
    total_current = Decimal('0.0')
    
    for holding in holdings:
        total_invested += holding.invested_value
        total_current += holding.current_value
        
    absolute_return = total_current - total_invested
    percentage_return = (absolute_return / total_invested * 100) if total_invested > 0 else Decimal('0.0')
    
    return {
        "total_invested": float(total_invested),
        "total_current": float(total_current),
        "absolute_return": float(absolute_return),
        "percentage_return": float(percentage_return),
    }

def calculate_xirr(dates: List[date], amounts: List[float]) -> Optional[float]:
    """
    Calculates XIRR given a series of cashflows.
    Amounts should be negative for investments (cash out) and positive for current value/withdrawals (cash in).
    """
    if len(dates) != len(amounts) or len(dates) < 2:
        return None
    
    try:
        # pyxirr takes dates and amounts as iterables
        result = xirr(dates, amounts)
        if result is None:
            return None
        return result * 100.0 # Convert to percentage
    except Exception as e:
        print(f"Error calculating XIRR: {e}")
        return None
