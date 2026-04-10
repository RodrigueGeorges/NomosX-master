/**
 * Progress Bar Component
 * 
 * Utilité : Visualiser progress streaming en temps réel
 * UX Impact : User voit avancement réel, pas juste un spinner
 */

interface ProgressBarProps {
  progress: number; // 0-100
  message?: string;
  className?: string;
}

export default function ProgressBar({ progress, message, className = "" }: ProgressBarProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {message && (
        <p className="text-sm font-medium text-accent">{message}</p>
      )}
      
      <div className="relative h-2 bg-panel2 rounded-full overflow-hidden">
        {/* Background glow */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-sm"
          style={{
            transform: `translateX(${progress - 100}%)`,
            transition: 'transform 0.3s ease-out'
          }}
        />
        
        {/* Progress bar */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        >
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      </div>
      
      <div className="flex justify-between text-xs text-muted">
        <span>{Math.round(progress)}%</span>
        <span>{progress >= 100 ? 'Complété' : 'En cours...'}</span>
      </div>
    </div>
  );
}
