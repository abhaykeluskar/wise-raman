import React from 'react';

export const StatusDot = ({ status = 'default', size = 'sm', pulse = false, className = '' }) => {
  const getColor = () => {
    switch (status) {
      case 'verified':
      case 'positive':
      case 'success':
      case 'active':
        return 'bg-[#3F8F5E]';
      case 'brand':
      case 'green':
        return 'bg-[#5BAE78]';
      case 'brown':
      case 'earth':
        return 'bg-[#A77B58]';
      case 'negative':
      case 'error':
      case 'danger':
        return 'bg-[#C85C5C]';
      case 'warning':
      case 'review':
        return 'bg-[#B78332]';
      case 'info':
        return 'bg-[#5B82A8]';
      case 'ai':
        return 'bg-[#8A78A8]';
      case 'offline':
      case 'muted':
      default:
        return 'bg-[#8B978F]';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'xs':
        return 'h-1.5 w-1.5';
      case 'md':
        return 'h-2.5 w-2.5';
      case 'lg':
        return 'h-3 w-3';
      case 'sm':
      default:
        return 'h-2 w-2';
    }
  };

  return (
    <span className="relative inline-flex items-center justify-center shrink-0">
      {pulse && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${getColor()}`} />
      )}
      <span className={`relative inline-flex rounded-full ${getColor()} ${getSizeClasses()} ${className}`} />
    </span>
  );
};
