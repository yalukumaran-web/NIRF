/**
 * Core type definitions for the NIRF methodology registry.
 *
 * A methodology is a category- and year-specific configuration of:
 *   - parameters (TLR, RP/RPC, GO, OI, PR)
 *   - sub-parameters with official marks allocation
 *   - parameter weights
 *   - formula/definition text with official source references
 *   - input fields (the data-submission schema)
 *   - validation rules
 *
 * Keeping this as data (not scattered formulas) allows future categories
 * (Management, Medical, Law, ...) and future years to be added without
 * rewriting the calculation engine.
 */

export type NIRFCategory =
  | "engineering"
  | "overall"
  | "university"
  | "management"
  | "medical"
  | "law"
  | "pharmacy"
  | "architecture"
  | "dental"
  | "agriculture";

export type Officiality =
  | "official" // formula/weightage explicitly published by NIRF
  | "calibrated_approximation" // structurally official but f() normalization is undisclosed; calibrated against data
  | "requires_verification"; // official methodology not available in public documents

export type DataType = "number" | "boolean" | "integer" | "string" | "percent";

export type FieldClass = "mandatory" | "needed" | "optional";

export interface FieldMetadata {
  fieldId: string; // e.g. "TLR_001"
  key: string; // RawMetrics-style camelCase key
  parameter: "TLR" | "RP" | "GO" | "OI" | "PR" | "INST";
  subParameter: string;
  officialFieldName: string; // as stated in official data-submission format
  shortLabel: string;
  description: string;
  dataType: DataType;
  unit?: string;
  sourceSection: string; // section of the official data-submission PDF
  class: FieldClass;
  required: boolean;
  min?: number;
  max?: number;
  minPercent?: number;
  maxPercent?: number;
  validationRule?: string;
  calculationDependencies?: string[];
  formulaReference?: string;
}

export interface SubParameterDef {
  key: string; // short code, e.g. "ss", "fsr"
  label: string; // display label
  officialName: string; // official NIRF name, e.g. "SS: Student Strength"
  marks: number; // max marks out of 100 for this sub-parameter
  officiality: Officiality;
  formula: string; // human-readable formula as published (or best known)
  formulaRef?: string; // official document reference / page
  normalization: string; // describe normalization rule
  inputFields: string[]; // field keys consumed
  explanation?: string;
}

export interface ParameterDef {
  code: "TLR" | "RP" | "GO" | "OI" | "PR";
  label: string; // display label
  officialName: string; // official parameter name
  weight: number; // 0.30 etc.
  weightRef: string;
  subParameters: SubParameterDef[];
  officiality: Officiality;
}

export interface MethodologyDef {
  category: NIRFCategory;
  year: number;
  version: string; // "1.0"
  name: string; // "NIRF Engineering 2025 Methodology"
  source: string; // official URL(s)
  scoreScale: number; // 100
  parameters: ParameterDef[];
  fields: FieldMetadata[];
  finalScoreFormula: string;
  notes: string[];
}

export interface MethodologyContext {
  category: NIRFCategory;
  year: number;
  methodology: MethodologyDef;
  fields: Map<string, FieldMetadata>;
  parameterByCode: Record<string, ParameterDef>;
}