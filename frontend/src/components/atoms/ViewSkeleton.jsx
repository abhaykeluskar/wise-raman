import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const ViewSkeleton = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const baseBg = isDark ? 'bg-white/5' : 'bg-black/5';
  const shimmerBg = isDark ? 'bg-[#1C251F]' : 'bg-[#FBFCFA]';
  const borderCol = isDark ? 'border-[#2A352D]' : 'border-[#E4E8E3]';

  return (
    <div className="w-full space-y-6 animate-pulse p-1" role="status" aria-label="Loading workspace">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className={`h-8 w-48 rounded-lg ${baseBg}`} />
          <div className={`h-4 w-72 rounded-md ${baseBg}`} />
        </div>
        <div className="flex items-center gap-3">
          <div className={`h-9 w-24 rounded-lg ${baseBg}`} />
          <div className={`h-9 w-32 rounded-lg ${baseBg}`} />
        </div>
      </div>

      {/* KPI Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            className={`p-5 rounded-2xl border ${borderCol} ${shimmerBg} space-y-3`}
          >
            <div className="flex items-center justify-between">
              <div className={`h-3.5 w-24 rounded ${baseBg}`} />
              <div className={`h-7 w-7 rounded-lg ${baseBg}`} />
            </div>
            <div className={`h-7 w-32 rounded-lg ${baseBg}`} />
            <div className={`h-3 w-20 rounded ${baseBg}`} />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className={`p-6 rounded-2xl border ${borderCol} ${shimmerBg} space-y-4`}>
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
          <div className={`h-5 w-36 rounded ${baseBg}`} />
          <div className={`h-4 w-20 rounded ${baseBg}`} />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-2">
              <div className="flex items-center gap-3 flex-1">
                <div className={`h-9 w-9 rounded-xl shrink-0 ${baseBg}`} />
                <div className="space-y-1.5 flex-1">
                  <div className={`h-4 w-40 rounded ${baseBg}`} />
                  <div className={`h-3 w-24 rounded ${baseBg}`} />
                </div>
              </div>
              <div className={`h-5 w-24 rounded ${baseBg}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ViewSkeleton;
