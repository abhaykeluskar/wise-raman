import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { calculateNextCardBill } from '../../utils/analytics';
import { Bell, CreditCard } from 'lucide-react';

export const HeroAlertRibbon = () => {
  const { theme } = useTheme();
  const { cards } = useFinance();
  const isDark = theme === 'dark';

  const nextBillInfo = React.useMemo(() => calculateNextCardBill(cards), [cards]);

  return (
    <div className={`w-full p-4 px-5 rounded-[14px] border shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 transition-all ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="p-2.5 rounded-[10px] bg-[#3F8F5E]/15 text-[#3F8F5E] shrink-0">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs sm:text-sm font-semibold tracking-tight">
            {nextBillInfo ? (
              <>
                Next statement for <span className="font-bold">{nextBillInfo.card.card_name}</span> generates on <span className="text-[#3F8F5E] font-bold">{nextBillInfo.formattedDate}</span>
              </>
            ) : (
              "All credit card statements and cashflow events are up to date"
            )}
          </span>
          <span className={`text-xs mt-0.5 font-normal ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {nextBillInfo ? (
              nextBillInfo.daysRemaining === 0 
                ? "Statement generates today • Automated cycle tracking active"
                : `Automated cycle tracking active • ${nextBillInfo.daysRemaining} days remaining in current billing cycle`
            ) : (
              "Connect statements or register new cards to track monthly payment cycles"
            )}
          </span>
        </div>
      </div>

      {nextBillInfo && (
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className={`px-3 py-1 rounded-[8px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
            nextBillInfo.daysRemaining <= 3 
              ? 'bg-[#B78332]/15 text-[#B78332] border-[#B78332]/30'
              : isDark 
                ? 'bg-[#1C251F] text-[#C2CCC5] border-[#2A352D]' 
                : 'bg-[#FBFCFA] text-[#4F5D55] border-[#E4E8E3]'
          }`}>
            <Bell className="h-3 w-3" />
            {nextBillInfo.daysRemaining === 0 ? 'BILL GENERATES TODAY' : nextBillInfo.daysRemaining === 1 ? 'BILL IN 1 DAY' : `BILL IN ${nextBillInfo.daysRemaining} DAYS`}
          </span>
        </div>
      )}
    </div>
  );
};
