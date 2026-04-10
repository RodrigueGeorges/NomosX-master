import { useRouter } from 'next/navigation';
import { X,Shield,Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card,CardContent } from '@/components/ui/Card';

type UpgradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  reason?: "trial_expired" | "limit_reached" | "feature_locked";
  message?: string;
};

export default function UpgradeModal({ isOpen, onClose, reason, message }: UpgradeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const getTitle = () => {
    switch (reason) {
      case "trial_expired":
        return "Your trial has ended";
      case "limit_reached":
        return "Weekly publication limit reached";
      case "feature_locked":
        return "Feature requires NomosX Access";
      default:
        return "Upgrade to continue";
    }
  };

  const getMessage = () => {
    if (message) return message;
    
    switch (reason) {
      case "trial_expired":
        return "Continue your private think tank with full access to all features.";
      case "limit_reached":
        return "Maintain editorial discipline or upgrade for higher limits.";
      case "feature_locked":
        return "This feature is available with NomosX Access.";
      default:
        return "Unlock the full potential of your autonomous think tank.";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card variant="default" className="max-w-lg w-full bg-gradient-to-br from-indigo-500/5 to-violet-500/5 border-indigo-500/20 shadow-[0_0_60px_rgba(99,102,241,0.2)]">
        <CardContent className="pt-8 pb-8 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white/60 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <Shield size={32} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-light text-white mb-2">{getTitle()}</h2>
            <p className="text-sm text-white/50">{getMessage()}</p>
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6 mb-6">
            <div className="flex items-baseline justify-center gap-2 mb-4">
              <span className="text-4xl font-light text-white">149€</span>
              <span className="text-lg text-white/40">/month</span>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex items-start gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-white/70">Autonomous signal detection</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-white/70">Editorial gate & quality control</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-white/70">Institutional publications</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-white/70">PDF exports & Studio access</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button 
              variant="ghost" 
              className="flex-1"
              onClick={onClose}
            >
              Not now
            </Button>
            <Button 
              variant="ai" 
              className="flex-1"
              onClick={() => router.push("/pricing")}
            >
              View pricing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
