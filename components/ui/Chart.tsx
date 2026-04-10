import React from 'react';
import { cn } from '@/lib/utils';

interface ChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data?: any[]
  type?: 'line' | 'bar' | 'pie'
}

const Chart = React.forwardRef<HTMLDivElement, ChartProps>(
  ({ className, data = [], type = 'line', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center rounded-lg border bg-muted text-muted-foreground",
        className
      )}
      {...props}
    >
      <div className="text-sm">
        Chart Component ({type}) - {data.length} data points
      </div>
    </div>
  )
)
Chart.displayName = "Chart"

export { Chart };