import React from 'react';
import { cn } from '@/lib/utils';
import { nx } from '@/lib/brand/public-ui';

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(nx.input, "min-h-[80px]", props.className)} />;
}
