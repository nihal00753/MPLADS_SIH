'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

interface TrendChartProps {
  data: any[];
  type?: 'area' | 'bar';
  dataKeyX?: string;
  dataKeys: Array<{
    key: string;
    name?: string;
    color?: string;
    fill?: string;
  }>;
  height?: number;
  yAxisPrefix?: string;
  yAxisSuffix?: string;
}

export function TrendChart({
  data,
  type = 'area',
  dataKeyX = 'name',
  dataKeys,
  height = 280,
  yAxisPrefix = '',
  yAxisSuffix = '',
}: TrendChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white text-zinc-900 px-3 py-2 rounded-lg border border-zinc-200 shadow-xl text-xs">
          <p className="font-semibold text-zinc-500 mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-zinc-700">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold font-inter text-zinc-950">
                {yAxisPrefix}
                {typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
                {yAxisSuffix}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'area' ? (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="gradientVibrantBlue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradientVibrantEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey={dataKeyX} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${yAxisPrefix}${v}${yAxisSuffix}`}
            />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((dk, idx) => (
              <Area
                key={dk.key}
                type="monotone"
                dataKey={dk.key}
                name={dk.name || dk.key}
                stroke={dk.color || (idx === 0 ? '#2563eb' : '#10b981')}
                strokeWidth={2.5}
                fill={dk.fill || (idx === 0 ? 'url(#gradientVibrantBlue)' : 'url(#gradientVibrantEmerald)')}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey={dataKeyX} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${yAxisPrefix}${v}${yAxisSuffix}`}
            />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((dk, idx) => (
              <Bar
                key={dk.key}
                dataKey={dk.key}
                name={dk.name || dk.key}
                fill={dk.color || (idx === 0 ? '#09090b' : '#a1a1aa')}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
