import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
  showValue?: boolean;
  marks?: { value: number; label: string }[];
}

export function Slider({ 
  label, 
  min = 0, 
  max = 100, 
  step = 1, 
  value: controlledValue,
  onChange,
  showValue = true,
  marks = [],
  className,
  id,
  ...props 
}: SliderProps) {
  const [internalValue, setInternalValue] = useState(min);
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const sliderId = id || `slider-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    
    onChange?.(newValue);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-3", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={sliderId} className="block text-sm font-medium text-white/80">
            {label}
          </label>
          {showValue && (
            <span className="text-sm text-white/60 font-mono">{value}</span>
          )}
        </div>
      )}
      
      <div className="relative">
        <input
          type="range"
          id={sliderId}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className={cn(
            "w-full h-2 bg-white/[0.1] rounded-lg appearance-none cursor-pointer",
            "slider-thumb:appearance-none slider-thumb:w-4 slider-thumb:h-4 slider-thumb:rounded-full slider-thumb:bg-accent slider-thumb:cursor-pointer",
            "slider-thumb:hover:brightness-110 slider-thumb:focus:outline-none slider-thumb:focus:ring-2 slider-thumb:focus:ring-accent/50"
          )}
          style={{
            background: `linear-gradient(to right, rgb(99 102 241 / 0.5) 0%, rgb(99 102 241 / 0.5) ${percentage}%, rgb(255 255 255 / 0.1) ${percentage}%, rgb(255 255 255 / 0.1) 100%)`
          }}
          {...props}
        />
        
        {marks.length > 0 && (
          <div className="relative mt-2">
            {marks.map((mark) => {
              const markPercentage = ((mark.value - min) / (max - min)) * 100;
              return (
                <div
                  key={mark.value}
                  className="absolute transform -translate-x-1/2"
                  style={{ left: `${markPercentage}%` }}
                >
                  <div className="w-1 h-2 bg-white/[0.3] rounded-full" />
                  <div className="text-xs text-white/40 mt-1 transform -translate-x-1/2 whitespace-nowrap">
                    {mark.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface SliderRangeProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: [number, number];
  onChange?: (value: [number, number]) => void;
  showValues?: boolean;
  className?: string;
}

export function SliderRange({ 
  label, 
  min = 0, 
  max = 100, 
  step = 1, 
  value: controlledValue,
  onChange,
  showValues = true,
  className 
}: SliderRangeProps) {
  const [internalValue, setInternalValue] = useState<[number, number]>([min, max]);
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (index: 0 | 1, newValue: number) => {
    const newRange: [number, number] = [...value];
    newRange[index] = newValue;
    
    // Ensure min <= max
    if (index === 0 && newValue > newRange[1]) {
      newRange[1] = newValue;
    } else if (index === 1 && newValue < newRange[0]) {
      newRange[0] = newValue;
    }
    
    if (controlledValue === undefined) {
      setInternalValue(newRange);
    }
    
    onChange?.(newRange);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-white/80">
            {label}
          </label>
          {showValues && (
            <span className="text-sm text-white/60 font-mono">
              {value[0]} - {value[1]}
            </span>
          )}
        </div>
      )}
      
      <div className="space-y-3">
        <div>
          <div className="text-xs text-white/40 mb-1">Minimum</div>
          <Slider
            min={min}
            max={max}
            step={step}
            value={value[0]}
            onChange={(newValue) => handleChange(0, newValue)}
            showValue={false}
          />
        </div>
        
        <div>
          <div className="text-xs text-white/40 mb-1">Maximum</div>
          <Slider
            min={min}
            max={max}
            step={step}
            value={value[1]}
            onChange={(newValue) => handleChange(1, newValue)}
            showValue={false}
          />
        </div>
      </div>
    </div>
  );
}
