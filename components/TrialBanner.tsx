import React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle,X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type TrialBannerProps = {
  daysRemaining: number;
  onDismiss?: () => void;
};

export default function TrialBanner({ daysRemaining, onDismiss }: TrialBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const urgency = daysRemaining <= 3 ? "high" : daysRemaining <= 7 ? "medium" : "low";
  const bgColor = urgency === "high" ? "bg-rose-500/10" : urgency === "medium" ? "bg-amber-500/10" : "bg-indigo-500/10";
  const borderColor = urgency === "high" ? "border-rose-500/30" : urgency === "medium" ? "border-amber-500/30" : "border-indigo-500/30";
  const textColor = urgency === "high" ? "text-rose-400" : urgency === "medium" ? "text-amber-400" : "text-indigo-400";

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-4 mb-6 relative`}>
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-white/40 hover:text-white/60 transition-colors"
      >
        <X size={16} />
      </button>
      
      <div className="flex items-start gap-3 pr-6">
        <AlertCircle size={20} className={`${textColor} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${textColor} mb-1`}>
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining in your trial
          </p>
          <p className="text-sm text-white/50 mb-3">
            Continue your private think tank with NomosX Access
          </p>
          <Button 
            variant="ghost" 
            size="sm"
            className={`${textColor} hover:${textColor}/80`}
            onClick={() => router.push("/pricing")}
          >
            View pricing →
          </Button>
        </div>
      </div>
    </div>
  );
}
