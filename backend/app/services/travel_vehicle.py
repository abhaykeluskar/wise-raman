from decimal import Decimal
from typing import Dict, Any, List
from app.models import Vehicle, VehicleExpense, TravelTrip, TripExpense

def calculate_vehicle_analytics(vehicle: Vehicle) -> Dict[str, Any]:
    """
    Computes total ownership cost, cost per km, and fuel/FASTag breakdown for a vehicle.
    """
    expenses = vehicle.expenses
    total_spend = Decimal("0.00")
    breakdown = {}
    total_fuel_liters = Decimal("0.00")
    
    for exp in expenses:
        amt = Decimal(str(exp.amount or 0))
        total_spend += amt
        etype = exp.expense_type
        breakdown[etype] = breakdown.get(etype, Decimal("0.00")) + amt
        if exp.fuel_liters:
            total_fuel_liters += Decimal(str(exp.fuel_liters))

    odo = float(vehicle.odometer_reading or 0.0)
    cost_per_km = float((total_spend / Decimal(str(odo))).quantize(Decimal("0.01"))) if odo > 0 else None

    return {
        "vehicle_id": str(vehicle.id),
        "vehicle_name": vehicle.vehicle_name,
        "registration_number": vehicle.registration_number,
        "fuel_type": vehicle.fuel_type,
        "odometer_reading": odo,
        "total_spend": float(total_spend),
        "cost_per_km": cost_per_km,
        "total_fuel_liters": float(total_fuel_liters),
        "expense_breakdown": {k: float(v) for k, v in breakdown.items()}
    }

def calculate_trip_analytics(trip: TravelTrip) -> Dict[str, Any]:
    """
    Computes trip total spend, budget utilization, and category breakdown.
    """
    expenses = trip.expenses
    total_spend = Decimal("0.00")
    breakdown = {}

    for exp in expenses:
        amt = Decimal(str(exp.amount or 0))
        total_spend += amt
        cat = exp.category
        breakdown[cat] = breakdown.get(cat, Decimal("0.00")) + amt

    budget = Decimal(str(trip.budget or 0))
    remaining_budget = budget - total_spend if budget > 0 else None
    pct_used = float((total_spend / budget * 100).quantize(Decimal("0.1"))) if budget > 0 else None

    return {
        "trip_id": str(trip.id),
        "trip_name": trip.trip_name,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date) if trip.end_date else None,
        "budget": float(budget),
        "total_spend": float(total_spend),
        "remaining_budget": float(remaining_budget) if remaining_budget is not None else None,
        "budget_percentage_used": pct_used,
        "category_breakdown": {k: float(v) for k, v in breakdown.items()}
    }
