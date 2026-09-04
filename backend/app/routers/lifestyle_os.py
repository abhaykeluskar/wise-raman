import uuid
import logging
from decimal import Decimal
from typing import List, Optional
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Loan, FinancialGoal, InsurancePolicy, SplitExpense, SplitParticipant,
    HouseholdMember, Vehicle, VehicleExpense, TravelTrip, TripExpense, Transaction
)
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Household Financial OS"])

class LoanCreate(BaseModel):
    loan_name: str
    loan_type: str = "HOME_LOAN"
    lender_name: str
    principal_amount: Decimal
    outstanding_balance: Decimal
    annual_interest_rate: Decimal
    emi_amount: Optional[Decimal] = None
    tenure_months: int
    start_date: date_type
    account_id: Optional[uuid.UUID] = None

class PrepaymentSimRequest(BaseModel):
    lump_sum: float = 0.0
    extra_monthly_emi: float = 0.0

class InsurancePolicyCreate(BaseModel):
    policy_name: str
    policy_type: str = "HEALTH"
    insurer_name: str
    policy_number: Optional[str] = None
    sum_insured: Decimal
    premium_amount: Decimal
    premium_frequency: str = "ANNUAL"
    renewal_date: date_type
    covered_members: Optional[str] = None

class SplitParticipantCreate(BaseModel):
    name: str
    share_amount: Decimal

class SplitExpenseCreate(BaseModel):
    title: str
    total_amount: Decimal
    paid_by_user: bool = True
    payer_name: Optional[str] = "Me"
    expense_date: date_type
    category: Optional[str] = "Dining"
    notes: Optional[str] = None
    participants: List[SplitParticipantCreate] = []

class HouseholdMemberCreate(BaseModel):
    name: str
    relationship: str = "SPOUSE"
    avatar_color: str = "#6366F1"

class VehicleCreate(BaseModel):
    vehicle_name: str
    vehicle_type: str = "CAR"
    registration_number: Optional[str] = None
    fuel_type: str = "PETROL"
    odometer_reading: Optional[float] = 0.0

class VehicleExpenseCreate(BaseModel):
    expense_type: str = "FUEL"
    amount: Decimal
    expense_date: date_type
    odometer: Optional[float] = None
    fuel_liters: Optional[float] = None
    notes: Optional[str] = None

class TravelTripCreate(BaseModel):
    trip_name: str
    destination: str
    start_date: date_type
    end_date: Optional[date_type] = None
    budget: Optional[Decimal] = None

class TripExpenseCreate(BaseModel):
    category: str = "FOOD"
    amount: Decimal
    expense_date: date_type
    description: str

# 1. Loans & Amortization
@router.get("/loans")
def get_loans(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Loan).filter(Loan.user_id == current_user.id).order_by(Loan.created_at.desc()).all()

@router.post("/loans")
def create_loan(loan_data: LoanCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.loans import calculate_emi
    emi = loan_data.emi_amount
    if not emi or float(emi) <= 0:
        calculated = calculate_emi(float(loan_data.principal_amount), float(loan_data.annual_interest_rate), loan_data.tenure_months)
        emi = Decimal(str(calculated))

    loan = Loan(
        user_id=current_user.id,
        loan_name=loan_data.loan_name,
        loan_type=loan_data.loan_type,
        lender_name=loan_data.lender_name,
        principal_amount=loan_data.principal_amount,
        outstanding_balance=loan_data.outstanding_balance,
        annual_interest_rate=loan_data.annual_interest_rate,
        emi_amount=emi,
        tenure_months=loan_data.tenure_months,
        remaining_tenure_months=loan_data.tenure_months,
        start_date=loan_data.start_date,
        account_id=loan_data.account_id
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan

@router.get("/loans/{loan_id}/amortization")
def get_loan_amortization(loan_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.loans import generate_amortization_schedule
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.user_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    schedule = generate_amortization_schedule(
        principal=float(loan.principal_amount),
        annual_rate=float(loan.annual_interest_rate),
        tenure_months=loan.tenure_months,
        start_date=loan.start_date
    )
    return {"loan_id": str(loan.id), "loan_name": loan.loan_name, "schedule": schedule}

@router.post("/loans/{loan_id}/prepayment-sim")
def simulate_loan_prepayment(loan_id: uuid.UUID, sim_data: PrepaymentSimRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.loans import simulate_prepayment
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.user_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    return simulate_prepayment(
        outstanding_balance=float(loan.outstanding_balance),
        annual_rate=float(loan.annual_interest_rate),
        current_emi=float(loan.emi_amount),
        lump_sum=sim_data.lump_sum,
        extra_monthly_emi=sim_data.extra_monthly_emi
    )

@router.delete("/loans/{loan_id}")
def delete_loan(loan_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.user_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    db.delete(loan)
    db.commit()
    return {"status": "deleted"}

# 2. Split Expenses
@router.get("/splits")
def get_splits(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.splits import calculate_split_summary
    splits = db.query(SplitExpense).options(joinedload(SplitExpense.participants)).filter(SplitExpense.user_id == current_user.id).order_by(SplitExpense.expense_date.desc()).all()
    summary = calculate_split_summary(db, str(current_user.id))
    return {
        "summary": summary,
        "expenses": splits
    }

@router.post("/splits")
def create_split_expense(data: SplitExpenseCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    exp = SplitExpense(
        user_id=current_user.id,
        title=data.title,
        total_amount=data.total_amount,
        paid_by_user=data.paid_by_user,
        payer_name=data.payer_name,
        expense_date=data.expense_date,
        category=data.category,
        notes=data.notes
    )
    db.add(exp)
    db.flush()

    for p in data.participants:
        part = SplitParticipant(
            split_expense_id=exp.id,
            name=p.name,
            share_amount=p.share_amount,
            is_settled=False
        )
        db.add(part)

    db.commit()
    db.refresh(exp)
    return exp

@router.post("/splits/participant/{participant_id}/settle")
def settle_participant(participant_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.splits import settle_split_participant
    success = settle_split_participant(db, str(participant_id))
    if not success:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {"status": "settled"}

@router.delete("/splits/{split_id}")
def delete_split(split_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    s = db.query(SplitExpense).filter(SplitExpense.id == split_id, SplitExpense.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Split not found")
    db.delete(s)
    db.commit()
    return {"status": "deleted"}

# 3. Insurance Policies
@router.get("/insurance")
def get_insurance(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    policies = db.query(InsurancePolicy).filter(InsurancePolicy.user_id == current_user.id).order_by(InsurancePolicy.renewal_date.asc()).all()
    total_coverage = sum([Decimal(str(p.sum_insured or 0)) for p in policies])
    total_annual_premium = sum([Decimal(str(p.premium_amount or 0)) for p in policies])
    return {
        "total_coverage": float(total_coverage),
        "total_annual_premium": float(total_annual_premium),
        "policies": policies
    }

@router.post("/insurance")
def create_insurance(data: InsurancePolicyCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    p = InsurancePolicy(
        user_id=current_user.id,
        policy_name=data.policy_name,
        policy_type=data.policy_type,
        insurer_name=data.insurer_name,
        policy_number=data.policy_number,
        sum_insured=data.sum_insured,
        premium_amount=data.premium_amount,
        premium_frequency=data.premium_frequency,
        renewal_date=data.renewal_date,
        covered_members=data.covered_members
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

@router.delete("/insurance/{policy_id}")
def delete_insurance(policy_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    p = db.query(InsurancePolicy).filter(InsurancePolicy.id == policy_id, InsurancePolicy.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(p)
    db.commit()
    return {"status": "deleted"}

# 4. Household & Family Mode
@router.get("/household/dashboard")
def get_household(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.household import get_household_dashboard
    return get_household_dashboard(db, str(current_user.id))

@router.get("/household/members")
def get_household_members(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    members = db.query(HouseholdMember).filter(HouseholdMember.user_id == current_user.id).all()
    return [{
        "id": str(m.id),
        "name": m.name,
        "relationship": m.relationship,
        "avatar_color": m.avatar_color
    } for m in members]

@router.post("/household/members")
def add_household_member(data: HouseholdMemberCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    m = HouseholdMember(
        user_id=current_user.id,
        name=data.name,
        relationship=data.relationship,
        avatar_color=data.avatar_color
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return {
        "id": str(m.id),
        "name": m.name,
        "relationship": m.relationship,
        "avatar_color": m.avatar_color
    }

@router.delete("/household/members/{member_id}")
def delete_household_member(member_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    m = db.query(HouseholdMember).filter(HouseholdMember.id == member_id, HouseholdMember.user_id == current_user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(m)
    db.commit()
    return {"status": "deleted"}

# 5. Vehicles
@router.get("/vehicles")
def get_vehicles(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.travel_vehicle import calculate_vehicle_analytics
    vehicles = db.query(Vehicle).options(joinedload(Vehicle.expenses)).filter(Vehicle.user_id == current_user.id).all()
    return [calculate_vehicle_analytics(v) for v in vehicles]

@router.post("/vehicles")
def create_vehicle(data: VehicleCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    v = Vehicle(
        user_id=current_user.id,
        vehicle_name=data.vehicle_name,
        vehicle_type=data.vehicle_type,
        registration_number=data.registration_number,
        fuel_type=data.fuel_type,
        odometer_reading=Decimal(str(data.odometer_reading or 0))
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v

@router.post("/vehicles/{vehicle_id}/expenses")
def add_vehicle_expense(vehicle_id: uuid.UUID, data: VehicleExpenseCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    exp = VehicleExpense(
        vehicle_id=v.id,
        expense_type=data.expense_type,
        amount=data.amount,
        expense_date=data.expense_date,
        odometer=Decimal(str(data.odometer)) if data.odometer else None,
        fuel_liters=Decimal(str(data.fuel_liters)) if data.fuel_liters else None,
        notes=data.notes
    )
    db.add(exp)
    if data.odometer and float(data.odometer) > float(v.odometer_reading or 0):
        v.odometer_reading = Decimal(str(data.odometer))
    db.commit()
    return exp

# 6. Travel Trips
@router.get("/trips")
def get_trips(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.travel_vehicle import calculate_trip_analytics
    trips = db.query(TravelTrip).options(joinedload(TravelTrip.expenses)).filter(TravelTrip.user_id == current_user.id).order_by(TravelTrip.start_date.desc()).all()
    return [calculate_trip_analytics(t) for t in trips]

@router.post("/trips")
def create_trip(data: TravelTripCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    t = TravelTrip(
        user_id=current_user.id,
        trip_name=data.trip_name,
        destination=data.destination,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=data.budget
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t

@router.post("/trips/{trip_id}/expenses")
def add_trip_expense(trip_id: uuid.UUID, data: TripExpenseCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    t = db.query(TravelTrip).filter(TravelTrip.id == trip_id, TravelTrip.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")

    exp = TripExpense(
        trip_id=t.id,
        category=data.category,
        amount=data.amount,
        expense_date=data.expense_date,
        description=data.description
    )
    db.add(exp)
    db.commit()
    return exp

# 7. Lifestyle Inflation & Mandates/Fees
@router.get("/analytics/lifestyle-inflation")
def get_lifestyle_inflation_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.lifestyle_inflation import (
        calculate_lifestyle_inflation,
        calculate_true_economic_savings_rate,
        detect_subscription_waste
    )

    txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
    txn_dicts = [
        {"id": str(t.id), "amount": float(t.amount), "date": str(t.date), "raw_text": t.raw_text, "description": t.description, "category": t.category}
        for t in txns
    ]

    lifestyle_gap = calculate_lifestyle_inflation(
        past_period_income=120000.0,
        current_period_income=150000.0,
        past_period_discretionary=25000.0,
        current_period_discretionary=32000.0
    )

    true_savings = calculate_true_economic_savings_rate(
        gross_income=150000.0,
        cash_savings=35000.0,
        investments_made=25000.0,
        loan_principal_repaid=12000.0
    )

    sub_waste = detect_subscription_waste(txn_dicts)

    return {
        "lifestyle_inflation": lifestyle_gap,
        "true_savings_rate": true_savings,
        "subscription_waste": sub_waste
    }

@router.get("/analytics/mandates-fees")
def get_mandates_and_fees_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.bank_fees import scan_for_bank_fees, summarize_bank_fees
    from app.services.mandates import detect_mandates, summarize_mandates

    txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
    txn_dicts = [
        {"id": str(t.id), "amount": float(t.amount), "date": str(t.date), "raw_text": t.raw_text, "description": t.description}
        for t in txns
    ]

    fees = scan_for_bank_fees(txn_dicts)
    fee_summary = summarize_bank_fees(fees)

    mandates = detect_mandates(txn_dicts)
    mandate_summary = summarize_mandates(mandates)

    return {
        "fees": fee_summary,
        "mandates": mandate_summary
    }
