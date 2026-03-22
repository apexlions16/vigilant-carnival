import React from 'react'

export default function ProgressRing({
  value,
  label,
  color = '#6366f1',
  size = 84,
  stroke = 10,
  subLabel,
}: {
  value: number
  label: string
  color?: string
  size?: number
  stroke?: number
  subLabel?: string
}) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (safe / 100) * c

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(148,163,184,0.25)"
          strokeWidth={stroke}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="rgba(241,245,249,0.95)"
          fontSize="18"
          fontWeight="700"
        >
          {safe}%
        </text>
      </svg>

      <div className="min-w-0">
        <div className="text-sm font-medium text-surface-200">{label}</div>
        {subLabel && <div className="text-xs text-surface-500 mt-0.5">{subLabel}</div>}
      </div>
    </div>
  )
}