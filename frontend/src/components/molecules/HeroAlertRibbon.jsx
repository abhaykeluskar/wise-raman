import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { calculateNextCardBill } from '../../utils/analytics';
import { Bell, CreditCard } from 'lucide-react';

export const HeroAlertRibbon = () => {
  const { style } = useTheme();
  const { cards } = useFinance();

  const nextBillInfo = React.useMemo(() => calculateNextCardBill(cards), [cards]);

  return (
    <div className={`w-full p-4 px-6 rounded-2xl border-0 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300 ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className={`p-2.5 rounded-xl flex items-center justify-center ${style('neu-inset-dark text-[#FF7E67]', 'neu-inset-light text-[#4A90E2]')}`}>
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs sm:text-sm font-semibold tracking-tight">
            {nextBillInfo ? (
              <>
                Welcome Abhay — Next statement for <span className="font-bold">{nextBillInfo.card.card_name}</span> generates on <span className={style('text-[#FF7E67]', 'text-[#4A90E2]')}>{nextBillInfo.formattedDate}</span>
              </>
            ) : (
              "Welcome Abhay — All credit card statements are up to date"
            )}
          </span>
          <span className="text-xs text-slate-400 mt-0.5 font-normal">
            {nextBillInfo ? (
              nextBillInfo.daysRemaining === 0 
                ? "Statement generates today • Automated cycle optimization active"
                : `Automated cycle optimization active • ${nextBillInfo.daysRemaining} days remaining in current billing cycle`
            ) : (
              "Connect statements or register new cards to track monthly payment cycles"
            )}
          </span>
        </div>
      </div>

      {nextBillInfo && (
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            nextBillInfo.daysRemaining <= 3 
              ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse'
              : style('neu-inset-dark text-slate-300', 'neu-inset-light text-slate-700')
          }`}>
            <Bell className="h-3 w-3" />
            {nextBillInfo.daysRemaining === 0 ? 'BILL GENERATES TODAY' : nextBillInfo.daysRemaining === 1 ? 'BILL IN 1 DAY' : `BILL IN ${nextBillInfo.daysRemaining} DAYS`}
          </span>
        </div>
      )}
    </div>
  );
};
