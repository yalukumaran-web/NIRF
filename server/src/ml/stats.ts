/** Basic numeric statistics used across the ML pipeline and reporting. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (ddof=1); returns 0 for n<2 or constant arrays. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - m;
    s += d * d;
  }
  return Math.sqrt(s / (xs.length - 1));
}

export function variance(xs: number[]): number {
  return std(xs) ** 2;
}

export function mae(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < actual.length; i++) s += Math.abs(actual[i] - predicted[i]);
  return s / actual.length;
}

export function rmse(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < actual.length; i++) {
    const d = actual[i] - predicted[i];
    s += d * d;
  }
  return Math.sqrt(s / actual.length);
}

/** Coefficient of determination R² (1 - SSE/SST). Handles degenerate SST. */
export function r2(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const m = mean(actual);
  let sst = 0;
  let sse = 0;
  for (let i = 0; i < actual.length; i++) {
    sst += (actual[i] - m) ** 2;
    sse += (actual[i] - predicted[i]) ** 2;
  }
  return sst === 0 ? (sse === 0 ? 1 : 0) : 1 - sse / sst;
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}