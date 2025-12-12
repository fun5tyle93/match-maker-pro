import { cn } from '@/lib/utils';

interface TippKickBallProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
}

export function TippKickBall({ size = 'md', className, animated = false }: TippKickBallProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
  };

  return (
    <div 
      className={cn(
        sizeClasses[size],
        "relative rounded-full overflow-hidden",
        animated && "animate-pulse-glow",
        className
      )}
    >
      {/* Main ball with yellow/red gradient */}
      <div className="absolute inset-0 bg-gradient-hero rounded-full shadow-glow" />
      
      {/* Hexagon pattern overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 40 40" className="w-full h-full">
          {/* Center hexagon - red */}
          <polygon 
            points="20,8 28,14 28,26 20,32 12,26 12,14" 
            fill="hsl(0, 75%, 50%)" 
            stroke="hsl(0, 0%, 20%)"
            strokeWidth="0.5"
          />
          {/* Top hexagon */}
          <polygon 
            points="20,0 26,4 26,12 20,16 14,12 14,4" 
            fill="hsl(48, 100%, 50%)" 
            stroke="hsl(0, 0%, 30%)"
            strokeWidth="0.3"
            opacity="0.9"
          />
          {/* Bottom left */}
          <polygon 
            points="8,24 14,28 14,36 8,40 2,36 2,28" 
            fill="hsl(48, 100%, 50%)" 
            stroke="hsl(0, 0%, 30%)"
            strokeWidth="0.3"
            opacity="0.8"
          />
          {/* Bottom right */}
          <polygon 
            points="32,24 38,28 38,36 32,40 26,36 26,28" 
            fill="hsl(48, 100%, 50%)" 
            stroke="hsl(0, 0%, 30%)"
            strokeWidth="0.3"
            opacity="0.8"
          />
          {/* Highlight */}
          <ellipse cx="15" cy="12" rx="4" ry="2" fill="white" opacity="0.3" />
        </svg>
      </div>
      
      {/* Subtle border */}
      <div className="absolute inset-0 rounded-full border-2 border-foreground/20" />
    </div>
  );
}
