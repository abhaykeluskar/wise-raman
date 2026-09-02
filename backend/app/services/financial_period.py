from datetime import date, datetime
from pydantic import BaseModel

class FinancialYearInfo(BaseModel):
    fy_string: str       # e.g., "FY2025-26"
    ay_string: str       # e.g., "AY2026-27"
    start_date: date
    end_date: date
    is_current: bool

class FinancialPeriodService:
    """
    Centralized service to manage Calendar Year, Indian Financial Year, and Assessment Year logic.
    Do not store FY primarily in database columns; derive it dynamically to prevent stale data.
    Indian Financial Year runs from April 1 to March 31.
    """

    @staticmethod
    def get_indian_fy(dt: date) -> FinancialYearInfo:
        """
        Given a date, return the corresponding Indian Financial Year and Assessment Year.
        Example: dt = 2026-02-15 -> FY2025-26, AY2026-27
        """
        year = dt.year
        if dt.month >= 4:
            start_year = year
            end_year = year + 1
        else:
            start_year = year - 1
            end_year = year
            
        today = date.today()
        is_current = False
        if dt.month >= 4:
            current_fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
        else:
            current_fy_start = date(today.year - 1 if today.month < 4 else today.year, 4, 1)
            
        current_fy_end = date(current_fy_start.year + 1, 3, 31)
        
        if current_fy_start <= dt <= current_fy_end:
            is_current = True
            
        return FinancialYearInfo(
            fy_string=f"FY{start_year}-{str(end_year)[-2:]}",
            ay_string=f"AY{end_year}-{str(end_year + 1)[-2:]}",
            start_date=date(start_year, 4, 1),
            end_date=date(end_year, 3, 31),
            is_current=is_current
        )

    @staticmethod
    def get_current_indian_fy() -> FinancialYearInfo:
        """Returns the current Indian Financial Year info based on today's date."""
        return FinancialPeriodService.get_indian_fy(date.today())

    @staticmethod
    def get_fy_range(fy_string: str) -> tuple[date, date]:
        """
        Given an FY string like 'FY2025-26', return the start and end dates.
        """
        try:
            start_year = int(fy_string[2:6])
            end_year = start_year + 1
            return date(start_year, 4, 1), date(end_year, 3, 31)
        except (ValueError, IndexError):
            raise ValueError(f"Invalid FY string format: {fy_string}. Expected format 'FYYYYY-YY'")

    @staticmethod
    def is_in_same_fy(date1: date, date2: date) -> bool:
        """Check if two dates belong to the same Indian Financial Year."""
        fy1 = FinancialPeriodService.get_indian_fy(date1)
        fy2 = FinancialPeriodService.get_indian_fy(date2)
        return fy1.fy_string == fy2.fy_string
