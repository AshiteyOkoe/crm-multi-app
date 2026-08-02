// ============================================================
//  Sales intelligence: lead scoring + revenue forecasting
// ============================================================

// Heuristic lead score (0-100). Weights are configurable but simple.
const SOURCE_WEIGHTS: Record<string, number> = {
  REFERRAL: 20,
  WEBSITE: 12,
  SOCIAL_MEDIA: 8,
  WALK_IN: 15,
  CALL: 10,
  OTHER: 5,
};

const STAGE_WEIGHTS: Record<string, number> = {
  NEW: 0,
  CONTACTED: 10,
  QUALIFIED: 25,
  PROPOSAL_SENT: 45,
  NEGOTIATION: 65,
  WON: 100,
  LOST: 0,
};

export function leadScore(opts: {
  value: number;
  source: string;
  stage: string;
  daysOpen: number;
  interactions: number;
  assigned: boolean;
}): number {
  const { value, source, stage, daysOpen, interactions, assigned } = opts;
  const sourceScore = SOURCE_WEIGHTS[source] ?? 5;
  const stageScore = STAGE_WEIGHTS[stage] ?? 0;
  const valueScore = Math.min(Math.max(value / 100, 0), 30);
  const recencyScore = Math.max(20 - Math.min(daysOpen, 20), 0); // fresher = hotter
  const engagementScore = Math.min(interactions * 3, 10);
  const assignmentScore = assigned ? 5 : 0;

  let score = sourceScore + stageScore + valueScore + recencyScore + engagementScore + assignmentScore;
  // Won/Lost are terminal: clamp
  if (stage === 'WON') score = 100;
  if (stage === 'LOST') score = 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

// Simple linear-regression forecast for the next `days` days based on the last `historyDays`.
export function forecastRevenue(history: { date: string; revenue: number }[], days = 30): {
  series: { date: string; actual: number; forecast: number }[];
  totalForecast: number;
  avgDaily: number;
} {
  if (history.length < 2) {
    const avg = history.length ? history[0].revenue : 0;
    const base = new Date();
    const series: { date: string; actual: number; forecast: number }[] = [];
    for (let i = 1; i <= days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      series.push({ date: d.toISOString().slice(0, 10), actual: 0, forecast: avg });
    }
    return { series, totalForecast: avg * days, avgDaily: avg };
  }

  // index by time
  const points = history
    .map((h, i) => ({ x: i, y: h.revenue }))
    .filter((p) => p.y > 0 || p.x === 0);
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = sumY / n - slope * (sumX / n);

  const lastDate = new Date(history[history.length - 1].date);
  const series: { date: string; actual: number; forecast: number }[] = history.map((h) => ({ date: h.date, actual: h.revenue, forecast: 0 }));
  let totalForecast = 0;
  for (let i = 1; i <= days; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    const x = n + i;
    const f = Math.max(slope * x + intercept, 0);
    totalForecast += f;
    series.push({ date: d.toISOString().slice(0, 10), actual: 0, forecast: Math.round(f) });
  }
  const avgDaily = days > 0 ? totalForecast / days : 0;
  return { series, totalForecast, avgDaily };
}
