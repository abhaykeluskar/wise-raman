from decimal import Decimal
from typing import Dict, Any

class IndianTaxCalculator:
    """
    Deterministic Indian Tax Calculator for FY 2024-25 / AY 2025-26.
    """
    
    @staticmethod
    def calculate_new_regime(gross_income: float) -> Dict[str, Any]:
        income = Decimal(str(gross_income))
        standard_deduction = Decimal('75000.00')
        
        taxable_income = max(Decimal('0.0'), income - standard_deduction)
        
        tax = Decimal('0.0')
        if taxable_income <= Decimal('700000.00'):
            # Rebate u/s 87A applies, effectively zero tax
            return {
                "regime": "NEW",
                "gross_income": float(income),
                "standard_deduction": float(standard_deduction),
                "taxable_income": float(taxable_income),
                "tax_before_cess": 0.0,
                "cess": 0.0,
                "total_tax": 0.0
            }
        
        # Calculate brackets
        brackets = [
            (Decimal('300000.00'), Decimal('700000.00'), Decimal('0.05')),
            (Decimal('700000.00'), Decimal('1000000.00'), Decimal('0.10')),
            (Decimal('1000000.00'), Decimal('1200000.00'), Decimal('0.15')),
            (Decimal('1200000.00'), Decimal('1500000.00'), Decimal('0.20')),
            (Decimal('1500000.00'), Decimal('999999999.00'), Decimal('0.30')),
        ]
        
        for lower, upper, rate in brackets:
            if taxable_income > lower:
                taxable_amount_in_bracket = min(taxable_income, upper) - lower
                tax += taxable_amount_in_bracket * rate
                
        cess = tax * Decimal('0.04')
        total_tax = tax + cess
        
        return {
            "regime": "NEW",
            "gross_income": float(income),
            "standard_deduction": float(standard_deduction),
            "taxable_income": float(taxable_income),
            "tax_before_cess": float(tax),
            "cess": float(cess),
            "total_tax": float(total_tax)
        }
        
    @staticmethod
    def calculate_old_regime(gross_income: float, deductions_80c: float = 0.0) -> Dict[str, Any]:
        income = Decimal(str(gross_income))
        standard_deduction = Decimal('50000.00')
        ded_80c = min(Decimal('150000.00'), Decimal(str(deductions_80c)))
        
        taxable_income = max(Decimal('0.0'), income - standard_deduction - ded_80c)
        
        tax = Decimal('0.0')
        if taxable_income <= Decimal('500000.00'):
            # Rebate u/s 87A
            return {
                "regime": "OLD",
                "gross_income": float(income),
                "standard_deduction": float(standard_deduction),
                "other_deductions": float(ded_80c),
                "taxable_income": float(taxable_income),
                "tax_before_cess": 0.0,
                "cess": 0.0,
                "total_tax": 0.0
            }
            
        brackets = [
            (Decimal('250000.00'), Decimal('500000.00'), Decimal('0.05')),
            (Decimal('500000.00'), Decimal('1000000.00'), Decimal('0.20')),
            (Decimal('1000000.00'), Decimal('999999999.00'), Decimal('0.30')),
        ]
        
        for lower, upper, rate in brackets:
            if taxable_income > lower:
                taxable_amount_in_bracket = min(taxable_income, upper) - lower
                tax += taxable_amount_in_bracket * rate
                
        cess = tax * Decimal('0.04')
        total_tax = tax + cess
        
        return {
            "regime": "OLD",
            "gross_income": float(income),
            "standard_deduction": float(standard_deduction),
            "other_deductions": float(ded_80c),
            "taxable_income": float(taxable_income),
            "tax_before_cess": float(tax),
            "cess": float(cess),
            "total_tax": float(total_tax)
        }

def reconcile_tax_documents(bank_interest: float, ais_interest: float) -> Dict[str, Any]:
    """
    Reconciles Bank Statements vs AIS records.
    """
    diff = abs(bank_interest - ais_interest)
    return {
        "bank_interest": bank_interest,
        "ais_interest": ais_interest,
        "difference": diff,
        "match": diff < 100.0, # Accept small rounding diff
        "alert": "⚠️ Mismatch detected" if diff >= 100.0 else "✓ Verified"
    }
