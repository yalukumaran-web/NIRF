/**
 * Regularized linear regression (ridge / lasso / elastic-net) via coordinate
 * descent on standardized features.
 *
 *   loss = ½ ||y − Xw||²  +  α·[ (1−l1Ratio)·½‖w‖²  +  l1Ratio·‖w‖₁ ]
 *
 * Ridge       : l1Ratio = 0
 * Lasso       : l1Ratio = 1
 * Elastic net : 0 < l1Ratio < 1
 *
 * Optional polynomial expansion (degree 2 appends squared terms) gives a
 * lightweight "PolynomialRegression".
 */

export interface LinearTrainParams {
  alpha?: number; // 1.0
  l1Ratio?: number; // 0 => ridge
  maxIter?: number; // 1000
  tol?: number; // 1e-9
  degree?: number; // 1 or 2
}

export interface LinearFit {
  intercept: number;
  weights: number[];
}

function softThreshold(z: number, lambda: number): number {
  if (lambda <= 0) return z;
  return Math.sign(z) * Math.max(Math.abs(z) - lambda, 0);
}

export function expandPoly(features: number[], degree: number): number[] {
  if (degree === 1) return features.slice();
  const out = features.slice();
  for (const x of features) out.push(x * x);
  return out;
}

export function fitLinear(
  X: number[][],
  y: number[],
  opts: LinearTrainParams = {}
): LinearFit {
  const alpha = opts.alpha ?? 1.0;
  const l1Ratio = opts.l1Ratio ?? 0.0;
  const maxIter = opts.maxIter ?? 1000;
  const tol = opts.tol ?? 1e-9;
  if (X.length === 0) return { intercept: 0, weights: [] };

  const p = X[0].length;
  const w = new Array(p).fill(0);
  let intercept = 0;
  for (const v of y) intercept += v;
  intercept /= y.length;

  const xj2 = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < X.length; i++) s += X[i][j] * X[i][j];
    xj2[j] = s;
  }

  const l2 = alpha * (1 - l1Ratio);
  const l1 = alpha * l1Ratio;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    for (let j = 0; j < p; j++) {
      // correlation of feature j with the residual (all terms except j)
      let c = 0;
      for (let i = 0; i < X.length; i++) {
        let pred = intercept;
        for (let k = 0; k < p; k++) pred += w[k] * X[i][k];
        pred -= w[j] * X[i][j];
        c += X[i][j] * (y[i] - pred);
      }
      const denom = xj2[j] + l2;
      const wNew = denom === 0 ? 0 : softThreshold(c, l1) / denom;
      maxChange = Math.max(maxChange, Math.abs(wNew - w[j]));
      w[j] = wNew;
    }
    if (maxChange < tol) break;
  }

  return { intercept, weights: w };
}

/** Predict after the same feature normalization the trainer applied. */
export function predictLinear(
  fitted: LinearFit,
  features: number[],
  featureMean: number[],
  featureStd: number[],
  degree: number
): number {
  const stdd = features.map((x, i) =>
    featureStd[i] === 0 ? (x - featureMean[i]) : (x - featureMean[i]) / featureStd[i]
  );
  const expanded = expandPoly(stdd, degree);
  let out = fitted.intercept;
  for (let j = 0; j < expanded.length; j++) out += fitted.weights[j] * expanded[j];
  return out;
}

export function linearImportance(
  fitted: LinearFit,
  featureStd: number[]
): number[] {
  // Effect size of each original feature expressed in target units:
  // |w_j| · σ_j (the squared term j≥nFeatures contributes via its square).
  const base = new Array(featureStd.length).fill(0);
  for (let j = 0; j < fitted.weights.length; j++) {
    if (j < base.length) {
      base[j] += Math.abs(fitted.weights[j] * featureStd[j]);
    } else {
      const orig = j - base.length;
      base[orig] += Math.abs(fitted.weights[j] * featureStd[orig] ** 2);
    }
  }
  return base;
}