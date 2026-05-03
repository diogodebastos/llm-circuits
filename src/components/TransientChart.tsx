export interface TransientSeries {
  capId: string;
  label: string;
  /** storedChars at each step (index 0 = before run 1). */
  values: number[];
}

const COLORS = ["#0ea5e9", "#f6821f", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

export default function TransientChart({ series }: { series: TransientSeries[] }) {
  if (series.length === 0) return null;
  const W = 300;
  const H = 100;
  const PAD = { l: 28, r: 8, t: 8, b: 18 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const allValues = series.flatMap((s) => s.values);
  const maxY = Math.max(1, ...allValues);
  const maxX = Math.max(1, ...series.map((s) => s.values.length - 1));

  const x = (i: number) => PAD.l + (maxX === 0 ? 0 : (i / maxX) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / maxY) * innerH;

  return (
    <div className="rounded border border-stone-200 bg-white p-2 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
        <span>Capacitor charge over time</span>
        <span className="tabular-nums">max {maxY} ch</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* axes */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} stroke="currentColor" strokeOpacity="0.15" />
        <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke="currentColor" strokeOpacity="0.15" />
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} y1={PAD.t + innerH * (1 - f)} x2={PAD.l + innerW} y2={PAD.t + innerH * (1 - f)} stroke="currentColor" strokeOpacity="0.05" strokeDasharray="2 2" />
        ))}
        {/* x labels */}
        {Array.from({ length: maxX + 1 }, (_, i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-stone-400 dark:fill-stone-600" fontSize={8}>
            {i}
          </text>
        ))}
        {/* y axis label */}
        <text x={4} y={PAD.t + 8} className="fill-stone-400 dark:fill-stone-600" fontSize={8}>chars</text>
        {/* series */}
        {series.map((s, i) => {
          const color = COLORS[i % COLORS.length]!;
          const pts = s.values.map((v, idx) => `${x(idx)},${y(v)}`).join(" ");
          return (
            <g key={s.capId}>
              <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
              {s.values.map((v, idx) => (
                <circle key={idx} cx={x(idx)} cy={y(v)} r={2} fill={color}>
                  <title>{`${s.label} · step ${idx} · ${v} chars`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
        {series.map((s, i) => (
          <span key={s.capId} className="flex items-center gap-1 text-stone-600 dark:text-stone-400">
            <span className="h-1.5 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
