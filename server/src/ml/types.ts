/**
 * Shared types for the pure-TypeScript NIRF predictive pipeline.
 *
 * All artifacts are plain JSON-serializable objects (no functions) so they can
 * be stored in the rank_model/training_runs tables and loaded without the
 * training code path being present at prediction time.
 */

export type AlgorithmId = "linear" | "cart" | "forest" | "gbm";

export interface DatasetRow {
  /** Stable identifier of the institution/instance (e.g. "IR-ENG-XX" or row id). */
  id: string;
  /** Feature vector aligned with featureKeys. */
  features: number[];
  /** Regression target (e.g. official NIRF final score 0-100). */
  target: number;
}

export interface SplitResult {
  trainIdx: number[];
  testIdx: number[];
}

export interface TreeNode {
  /** Index of the splitting feature; -1 on a leaf. */
  featureIndex: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  /** Mean of the target at this node. */
  value: number;
  n: number;
  /** Impurity reduction contributed by this node (n × gain) — for importance. */
  featGain?: number;
}

export interface FeatureImportance {
  key: string;
  importance: number;
}

export interface LinearArtifact {
  intercept: number;
  weights: number[]; // length == expanded dimension (degree-aware)
  featureMean: number[];
  featureStd: number[];
  degree: number;
  nFeatures: number;
  nIter: number;
}

export interface MetricSummary {
  mae: number;
  rmse: number;
  r2: number;
  n: number;
}

export interface ModelArtifact {
  algo: AlgorithmId;
  schemaVersion: string;
  featureKeys: string[];
  targetName?: string;
  params: Record<string, unknown>;
  /** regularization_linear */
  linear?: LinearArtifact;
  /** single CART root */
  tree?: TreeNode;
  /** bagged CART roots */
  forest?: TreeNode[];
  /** boosted stumps */
  staged?: { init: number; lr: number; trees: TreeNode[] };
  importance?: FeatureImportance[];
  fitMeta: {
    nTrain: number;
    nTest: number;
    targetMean: number;
    datasetVersion?: string;
    modelVersion?: string;
    trainedAt: string;
  };
}

/** Predictor handle returned by loadModelArtifact. */
export interface ModelPredictor {
  artifact: ModelArtifact;
  predict: (features: number[]) => number;
}

export interface TrainOptions {
  algorithm: AlgorithmId;
  featureKeys: string[];
  targetName?: string;
  datasetVersion: string;
  modelVersion?: string;
  seed?: number;
  testFraction?: number;
  params?: Partial<Record<AlgorithmId, Record<string, unknown>>> & Record<string, unknown>;
}

export interface TrainingResult {
  artifact: ModelArtifact;
  metrics: MetricSummary;
  importance: FeatureImportance[];
  predictions: { id: string; actual: number; predicted: number }[];
  split: SplitResult;
  datasetVersion: string;
  modelVersion: string;
}

export interface TrainedInstance {
  trainIdx: number[];
  testIdx: number[];
}