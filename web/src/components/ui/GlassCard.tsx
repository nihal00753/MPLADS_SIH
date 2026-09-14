'use client';

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  variant?: 'light' | 'dark' | 'gradient';
  hoverEffect?: boolean;
}

export function GlassCard({
  children,
  className = '',
  variant = 'light',
  hoverEffect = false,
  ...props
}: GlassCardProps) {
  const baseClasses = 'bg-white border border-zinc-200 rounded-xl text-zinc-900 shadow-sm transition-colors';

  const hoverAnimation = hoverEffect
    ? {
        whileHover: {
          borderColor: '#a1a1aa',
          transition: { duration: 0.15 },
        },
      }
    : {};

  return (
    <motion.div
      className={`${baseClasses} ${className}`}
      {...hoverAnimation}
      {...props}
    >
      {children}
    </motion.div>
  );
}
