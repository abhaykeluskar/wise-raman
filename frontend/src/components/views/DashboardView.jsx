import React from 'react';
import { HeroAlertRibbon } from '../molecules/HeroAlertRibbon';
import { CreditCardSummaryCard } from '../organisms/CreditCardSummaryCard';
import { SavingsAssetsCard } from '../organisms/SavingsAssetsCard';
import { IncomeSpendTrendChart } from '../organisms/IncomeSpendTrendChart';
import { MonthVelocityCard } from '../organisms/MonthVelocityCard';
import { CategoryDonutCard } from '../organisms/CategoryDonutCard';
import { RecurringBillsWatchdog } from '../organisms/RecurringBillsWatchdog';
import { useFinance } from '../../context/FinanceContext';

export const DashboardView = ({ onSelectCard }) => {
  const { transactions, openInLedger } = useFinance();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      
      {/* 1. Dynamic Hero Header Ribbon */}
      <HeroAlertRibbon />

      {/* 2. Top Row: Credit Cards Summary (Liabilities) & Savings Assets (Liquid Net Assets) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreditCardSummaryCard onSelectCard={onSelectCard} />
        <SavingsAssetsCard />
      </div>

      <RecurringBillsWatchdog
        transactions={transactions}
        onSelectMerchant={(merchant) => openInLedger({ search: merchant, flow: 'OUTFLOW' })}
      />

      {/* 3. Middle Row: Multi-Timeframe Income vs. Spend Trend */}
      <div className="w-full">
        <IncomeSpendTrendChart />
      </div>

      {/* 4. Bottom Row: Current Month Velocity & Category Distribution Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthVelocityCard />
        <CategoryDonutCard />
      </div>

    </div>
  );
};
