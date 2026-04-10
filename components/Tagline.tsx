import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, Sparkles, TrendingUp, Brain } from 'lucide-react';

interface TaglineProps {
  variant?: 'hero' | 'subtle' | 'impact';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showIcon?: boolean;
  animated?: boolean;
}

const taglines = [
  {
    primary: "Where Research Becomes Strategy",
    secondary: "Intelligence That Anticipates Tomorrow",
    description: "Transform academic complexity into boardroom clarity"
  },
  {
    primary: "The Research Department Every Leader Needs",
    secondary: "Strategic Intelligence That Shapes Industries",
    description: "Institutional-grade research delivered at the speed of a decision"
  },
  {
    primary: "From Academic Noise to Strategic Clarity",
    secondary: "Intelligence That Anticipates Tomorrow", 
    description: "While others chase headlines, we anticipate what's next"
  },
  {
    primary: "Turning Academic Insights Into Boardroom Decisions",
    secondary: "Strategic Intelligence for Modern Leaders",
    description: "22 PhD researchers working exclusively for your strategic advantage"
  }
];

export default function Tagline({ 
  variant = 'hero', 
  size = 'lg', 
  showIcon = true,
  animated = true 
}: TaglineProps) {
  const [currentTagline, setCurrentTagline] = React.useState(0);

  React.useEffect(() => {
    if (!animated) return;
    
    const interval = setInterval(() => {
      setCurrentTagline((prev) => (prev + 1) % taglines.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [animated]);

  const tagline = taglines[currentTagline];

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          primary: "text-lg sm:text-xl",
          secondary: "text-base sm:text-lg",
          description: "text-sm"
        };
      case 'md':
        return {
          primary: "text-xl sm:text-2xl",
          secondary: "text-lg sm:text-xl",
          description: "text-sm sm:text-base"
        };
      case 'lg':
        return {
          primary: "text-2xl sm:text-3xl md:text-4xl",
          secondary: "text-xl sm:text-2xl md:text-3xl",
          description: "text-base sm:text-lg"
        };
      case 'xl':
        return {
          primary: "text-3xl sm:text-4xl md:text-5xl lg:text-6xl",
          secondary: "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
          description: "text-lg sm:text-xl md:text-2xl"
        };
      default:
        return {
          primary: "text-2xl sm:text-3xl",
          secondary: "text-xl sm:text-2xl",
          description: "text-base"
        };
    }
  };

  const sizeClasses = getSizeClasses();

  const getVariantClasses = () => {
    switch (variant) {
      case 'hero':
        return "text-center space-y-4";
      case 'subtle':
        return "text-left space-y-2";
      case 'impact':
        return "text-center space-y-6";
      default:
        return "text-center space-y-4";
    }
  };

  return (
    <div className={cn(getVariantClasses(), animated && "transition-all duration-1000 ease-in-out")}>
      {/* Icon */}
      {showIcon && (
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center">
            <Brain className="text-indigo-400" size={24} />
          </div>
        </div>
      )}

      {/* Primary Tagline */}
      <h1 className={cn(
        "font-display font-light leading-tight",
        sizeClasses.primary,
        variant === 'hero' && "animate-fade-in"
      )}>
        <span className="nx-gradient-text-light">{tagline.primary}</span>
        {variant === 'hero' && <br />}
        {variant === 'hero' && (
          <span className="text-white/90">{tagline.secondary}</span>
        )}
      </h1>

      {/* Secondary Tagline (non-hero variants) */}
      {variant !== 'hero' && (
        <h2 className={cn(
          "font-display font-light leading-tight text-white/90",
          sizeClasses.secondary
        )}>
          {tagline.secondary}
        </h2>
      )}

      {/* Description */}
      <p className={cn(
        "text-white/40 leading-relaxed max-w-3xl",
        sizeClasses.description,
        variant === 'hero' ? "mx-auto" : "mx-auto md:mx-0"
      )}>
        {tagline.description}
      </p>

      {/* CTA for impact variant */}
      {variant === 'impact' && (
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <button className="group px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-white font-medium hover:border-indigo-500/40 transition-all shadow-[0_0_30px_rgba(99,102,241,0.15)]">
            <span className="flex items-center justify-center gap-2">
              Get Strategic Intelligence
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </span>
          </button>
          <button className="px-8 py-4 rounded-xl border border-white/[0.1] text-white/70 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.03] transition-all">
            Browse Briefs
          </button>
        </div>
      )}

      {/* Animated indicator */}
      {animated && (
        <div className="flex justify-center gap-2 pt-4">
          {taglines.map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentTagline
                  ? "bg-indigo-400 w-8"
                  : "bg-white/20"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Value Proposition Component
interface ValuePropositionProps {
  tier?: 'TRIAL' | 'EXECUTIVE' | 'STRATEGY';
  compact?: boolean;
}

export function ValueProposition({ tier = 'TRIAL', compact = false }: ValuePropositionProps) {
  const propositions = {
    TRIAL: [
      {
        icon: <TrendingUp size={20} />,
        title: "Spot opportunities 6 months before competitors",
        description: "Our AI council identifies strategic shifts while others chase yesterday's news"
      },
      {
        icon: <Brain size={20} />,
        title: "Institutional-grade analysis without the six-figure retainer",
        description: "22 PhD-calibrated researchers delivering the analysis that used to require elite consulting firms"
      },
      {
        icon: <Sparkles size={20} />,
        title: "Never miss a strategic shift again",
        description: "Continuous monitoring of 250M+ academic sources for emerging strategic shifts"
      }
    ],
    EXECUTIVE: [
      {
        icon: <TrendingUp size={20} />,
        title: "Full strategic briefs delivered weekly",
        description: "2-3 page decision-ready analyses with complete source citations"
      },
      {
        icon: <Brain size={20} />,
        title: "Complete archives at your fingertips",
        description: "Access all historical briefs and strategic reports for comprehensive research"
      },
      {
        icon: <Sparkles size={20} />,
        title: "Industry-specific intelligence",
        description: "Tailored analysis for your sector with actionable recommendations"
      }
    ],
    STRATEGY: [
      {
        icon: <TrendingUp size={20} />,
        title: "Your personal research council",
        description: "Ask questions, get custom analysis from our Harvard Council of experts"
      },
      {
        icon: <Brain size={20} />,
        title: "Custom verticals and tracking",
        description: "Create personalized research areas and monitor specific strategic topics"
      },
      {
        icon: <Sparkles size={20} />,
        title: "Priority support and consulting",
        description: "Direct access to our research team and strategic consulting services"
      }
    ]
  };

  const tierProps = propositions[tier];

  if (compact) {
    return (
      <div className="grid md:grid-cols-3 gap-6">
        {tierProps.map((prop, index) => (
          <div key={index} className="text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              {prop.icon}
            </div>
            <h3 className="font-medium text-white/90 mb-2">{prop.title}</h3>
            <p className="text-sm text-white/40">{prop.description}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {tierProps.map((prop, index) => (
        <div key={index} className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            {prop.icon}
          </div>
          <div>
            <h3 className="font-display text-xl font-light text-white/90 mb-2">
              {prop.title}
            </h3>
            <p className="text-white/40 leading-relaxed">
              {prop.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
