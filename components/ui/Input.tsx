import React from 'react';
import { cn } from '@/lib/utils';
import { nx } from '@/lib/brand/public-ui';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(nx.input, props.className)} />;
}
