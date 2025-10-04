import { useEffect, useState } from 'react';
import { formatTimeRemaining, getTimeRemainingColor } from '../constants';

interface ListingTimerProps {
  expiresAt: number;
  className?: string;
  showIcon?: boolean;
}

export function ListingTimer({ expiresAt, className = '', showIcon = true }: ListingTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(formatTimeRemaining(expiresAt));
  const [colorClass, setColorClass] = useState(getTimeRemainingColor(expiresAt));

  useEffect(() => {
    const updateTimer = () => {
      setTimeRemaining(formatTimeRemaining(expiresAt));
      setColorClass(getTimeRemainingColor(expiresAt));
    };

    // Update immediately
    updateTimer();

    // Update every minute
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = timeRemaining === 'Expired';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {showIcon && (
        <span className="text-sm">
          {isExpired ? '⏰' : '⏱️'}
        </span>
      )}
      <span className={`font-medium ${isExpired ? 'text-gray-500' : colorClass}`}>
        {timeRemaining}
      </span>
    </div>
  );
}
