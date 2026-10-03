/**
 * Step 1 — Training dataset (ground truth) handling.
 *
 * Record shape: { college_id, year, category, rank, raw_inputs, targets }.
 *  - raw_inputs with per-field provenance (from_dcs_pdf / cross_validated_web).
 *  - targets = NIRF-published sub-parameter scores for that college/year.
 *
 * Rules enforced here:
 *  - A per-record completeness fraction (0..1 over the 18 raw fields).
 *  - Only records above COMPLETENESS_THRESHOLD (80%) are eligible for training.
 *  - Records below the threshold are still returned but flagged eligible=false —
 *    never silently imputed.
 *
 * A CALIBRATED BASELINE seed dataset ships with the module so the pipeline can
 * run end-to-end. Every seed record is tagged `seed_baseline_demo` — it is a
 * structurally plausible, self-consistent demo of the schema, NOT scraped
 * ground truth. Ingesting real Step-1 data (via train API/script) replaces it.
 */

import { mulberry32 } from "../../../ml/random";
import { RELATIVE_RAW_FIELD_KEYS, RELATIVE_PARAMS } from "./parameters";
import type { RelativeFieldKey, RelativeTrainingRecord, SourceTag } from "./types";

export const COMPLETENESS_THRESHOLD = 0.8;

// ── Seed baseline: college base profiles (demo magnitudes) ───────────────────

interface SeedProfile {
  id: string;
  name: string;
  baseRank2025: number;
  // base magnitudes (order-of-magnitude realistic for an engineering cohort)
  students: number; // enrolled UG/PG + PhD
  intake: number; // sanctioned intake per year
  faculty: number;
  phdEnrolled: number;
  capEx: number; // INR crores
  opex: number; // INR crores
  pubs: number;
  cites: number;
  top25: number;
  patents: number;
  sponsor: number; // INR crores
  consultancy: number; // INR crores
  placed: number;
  higherStudies: number;
  medianSalary: number; // INR lakhs/yr
  phdGrads: number;
  quality: number; // 0..1 overall strength multiplier
}

const SEED_PROFILES: SeedProfile[] = [
  { id: "IR-E-U-0456", name: "Indian Institute of Technology Madras", baseRank2025: 1, students: 10500, intake: 1800, faculty: 700, phdEnrolled: 3600, capEx: 420, opex: 690, pubs: 5300, cites: 68000, top25: 23000, patents: 420, sponsor: 520, consultancy: 95, placed: 950, higherStudies: 380, medianSalary: 14.5, phdGrads: 520, quality: 1.0 },
  { id: "IR-E-I-1074", name: "Indian Institute of Technology Delhi", baseRank2025: 2, students: 9800, intake: 1700, faculty: 700, phdEnrolled: 3300, capEx: 350, opex: 610, pubs: 4800, cites: 61000, top25: 20000, patents: 360, sponsor: 460, consultancy: 80, placed: 900, higherStudies: 320, medianSalary: 13.8, phdGrads: 470, quality: 0.98 },
  { id: "IR-E-U-0306", name: "Indian Institute of Technology Bombay", baseRank2025: 3, students: 9900, intake: 1750, faculty: 710, phdEnrolled: 3400, capEx: 360, opex: 640, pubs: 4900, cites: 62000, top25: 21000, patents: 380, sponsor: 470, consultancy: 85, placed: 920, higherStudies: 340, medianSalary: 14.0, phdGrads: 480, quality: 0.98 },
  { id: "IR-E-I-1075", name: "Indian Institute of Technology Kanpur", baseRank2025: 4, students: 8800, intake: 1550, faculty: 640, phdEnrolled: 2900, capEx: 290, opex: 520, pubs: 4200, cites: 54000, top25: 17500, patents: 300, sponsor: 410, consultancy: 70, placed: 800, higherStudies: 300, medianSalary: 13.2, phdGrads: 430, quality: 0.95 },
  { id: "IR-E-U-0573", name: "Indian Institute of Technology Kharagpur", baseRank2025: 5, students: 10100, intake: 1900, faculty: 700, phdEnrolled: 3400, capEx: 310, opex: 560, pubs: 4300, cites: 55000, top25: 17500, patents: 310, sponsor: 430, consultancy: 75, placed: 880, higherStudies: 310, medianSalary: 12.8, phdGrads: 450, quality: 0.94 },
  { id: "IR-E-U-0560", name: "Indian Institute of Technology Roorkee", baseRank2025: 6, students: 9200, intake: 1750, faculty: 650, phdEnrolled: 3000, capEx: 270, opex: 500, pubs: 3900, cites: 49000, top25: 15500, patents: 260, sponsor: 380, consultancy: 65, placed: 810, higherStudies: 280, medianSalary: 12.4, phdGrads: 400, quality: 0.92 },
  { id: "IR-E-U-0013", name: "Indian Institute of Technology Hyderabad", baseRank2025: 7, students: 7600, intake: 1400, faculty: 520, phdEnrolled: 2600, capEx: 320, opex: 440, pubs: 3600, cites: 45000, top25: 15000, patents: 240, sponsor: 360, consultancy: 60, placed: 700, higherStudies: 240, medianSalary: 12.0, phdGrads: 350, quality: 0.9 },
  { id: "IR-E-U-0053", name: "Indian Institute of Technology Guwahati", baseRank2025: 8, students: 7300, intake: 1350, faculty: 500, phdEnrolled: 2500, capEx: 260, opex: 400, pubs: 3400, cites: 42000, top25: 13500, patents: 220, sponsor: 330, consultancy: 55, placed: 660, higherStudies: 220, medianSalary: 11.6, phdGrads: 330, quality: 0.88 },
  { id: "IR-E-U-0467", name: "National Institute of Technology Tiruchirappalli", baseRank2025: 9, students: 7800, intake: 1700, faculty: 480, phdEnrolled: 1900, capEx: 150, opex: 260, pubs: 2400, cites: 28000, top25: 9000, patents: 120, sponsor: 150, consultancy: 45, placed: 850, higherStudies: 210, medianSalary: 9.5, phdGrads: 200, quality: 0.8 },
  { id: "IR-E-U-0701", name: "Indian Institute of Technology (BHU) Varanasi", baseRank2025: 10, students: 8400, intake: 1650, faculty: 540, phdEnrolled: 2600, capEx: 210, opex: 360, pubs: 2900, cites: 35000, top25: 11000, patents: 190, sponsor: 290, consultancy: 50, placed: 700, higherStudies: 230, medianSalary: 11.0, phdGrads: 310, quality: 0.85 },
  { id: "IR-E-U-0391", name: "Birla Institute of Technology & Science Pilani", baseRank2025: 11, students: 11000, intake: 2400, faculty: 620, phdEnrolled: 1200, capEx: 180, opex: 320, pubs: 2600, cites: 30000, top25: 10000, patents: 110, sponsor: 90, consultancy: 55, placed: 1350, higherStudies: 300, medianSalary: 11.2, phdGrads: 120, quality: 0.8 },
  { id: "IR-E-U-0273", name: "Indian Institute of Technology Indore", baseRank2025: 12, students: 6800, intake: 1300, faculty: 480, phdEnrolled: 2300, capEx: 250, opex: 380, pubs: 3200, cites: 40000, top25: 13000, patents: 210, sponsor: 310, consultancy: 50, placed: 600, higherStudies: 210, medianSalary: 11.4, phdGrads: 290, quality: 0.86 },
  { id: "IR-E-U-0357", name: "National Institute of Technology Rourkela", baseRank2025: 13, students: 7600, intake: 1650, faculty: 470, phdEnrolled: 1800, capEx: 140, opex: 240, pubs: 2200, cites: 25000, top25: 8000, patents: 110, sponsor: 130, consultancy: 40, placed: 780, higherStudies: 190, medianSalary: 9.0, phdGrads: 190, quality: 0.77 },
  { id: "IR-E-U-0473", name: "S.R.M. Institute of Science and Technology", baseRank2025: 14, students: 22000, intake: 4500, faculty: 1400, phdEnrolled: 1200, capEx: 200, opex: 400, pubs: 2000, cites: 22000, top25: 5500, patents: 190, sponsor: 60, consultancy: 50, placed: 2100, higherStudies: 350, medianSalary: 6.5, phdGrads: 140, quality: 0.74 },
  { id: "IR-E-U-0205", name: "Indian Institute of Technology (ISM) Dhanbad", baseRank2025: 15, students: 7600, intake: 1500, faculty: 520, phdEnrolled: 2200, capEx: 200, opex: 340, pubs: 2700, cites: 33000, top25: 10500, patents: 170, sponsor: 280, consultancy: 45, placed: 620, higherStudies: 210, medianSalary: 11.2, phdGrads: 280, quality: 0.84 },
  { id: "IR-E-U-0490", name: "Vellore Institute of Technology", baseRank2025: 16, students: 26000, intake: 5000, faculty: 1700, phdEnrolled: 1400, capEx: 220, opex: 430, pubs: 2300, cites: 25000, top25: 6200, patents: 200, sponsor: 70, consultancy: 55, placed: 2400, higherStudies: 380, medianSalary: 6.8, phdGrads: 160, quality: 0.76 },
  { id: "IR-E-U-0237", name: "National Institute of Technology Karnataka Surathkal", baseRank2025: 17, students: 7200, intake: 1600, faculty: 450, phdEnrolled: 1600, capEx: 130, opex: 220, pubs: 2000, cites: 23000, top25: 7200, patents: 100, sponsor: 120, consultancy: 35, placed: 720, higherStudies: 180, medianSalary: 8.8, phdGrads: 170, quality: 0.75 },
  { id: "IR-E-U-0575", name: "Jadavpur University", baseRank2025: 18, students: 8200, intake: 1900, faculty: 520, phdEnrolled: 1800, capEx: 90, opex: 210, pubs: 2100, cites: 26000, top25: 8500, patents: 90, sponsor: 110, consultancy: 30, placed: 800, higherStudies: 240, medianSalary: 8.2, phdGrads: 190, quality: 0.76 },
  { id: "IR-E-U-0064", name: "Indian Institute of Technology Patna", baseRank2025: 19, students: 6200, intake: 1250, faculty: 420, phdEnrolled: 2100, capEx: 240, opex: 340, pubs: 3000, cites: 37000, top25: 12000, patents: 190, sponsor: 290, consultancy: 48, placed: 570, higherStudies: 190, medianSalary: 11.6, phdGrads: 260, quality: 0.85 },
  { id: "IR-E-U-0220", name: "Chandigarh University", baseRank2025: 35, students: 30000, intake: 7000, faculty: 1100, phdEnrolled: 900, capEx: 160, opex: 300, pubs: 1500, cites: 12000, top25: 2800, patents: 140, sponsor: 40, consultancy: 25, placed: 3400, higherStudies: 450, medianSalary: 5.5, phdGrads: 90, quality: 0.62 },
  { id: "IR-E-U-0201", name: "Anna University", baseRank2025: 36, students: 12000, intake: 3200, faculty: 700, phdEnrolled: 1600, capEx: 110, opex: 250, pubs: 1800, cites: 19000, top25: 5800, patents: 80, sponsor: 90, consultancy: 28, placed: 1300, higherStudies: 320, medianSalary: 6.2, phdGrads: 220, quality: 0.68 },
  { id: "IR-E-U-0198", name: "Indian Institute of Technology Bhubaneswar", baseRank2025: 37, students: 5400, intake: 1100, faculty: 380, phdEnrolled: 1800, capEx: 220, opex: 300, pubs: 2700, cites: 33000, top25: 10800, patents: 160, sponsor: 260, consultancy: 40, placed: 480, higherStudies: 160, medianSalary: 11.0, phdGrads: 230, quality: 0.83 },
];

// ── Deterministic year-variation rng ─────────────────────────────────────────

const YEAR_FACTOR: Record<number, number> = { 2023: 0.92, 2024: 0.96, 2025: 1.0 };

/** Growth-trend per college rank (better-ranked colleges grow faster). */
function growthFactor(rank: number): number {
  return 1 + (0.1 * (101 - Math.min(rank, 100))) / 100;
}

/**
 * Build the shipped calibrated baseline dataset (demo provenance).
 * Self-consistent: targets are derived from the same formula family the
 * module predicts with, using that year's seed cohort. This validates the
 * pipeline mechanics end-to-end but is NOT ground truth.
 */
export function buildSeedBaselineDataset(): RelativeTrainingRecord[] {
  const rng = mulberry32(2025);
  const records: RelativeTrainingRecord[] = [];

  for (const profile of SEED_PROFILES) {
    for (const year of [2023, 2024, 2025]) {
      const yf = YEAR_FACTOR[year] * growthFactor(profile.baseRank2025);
      const jitter = (k: number) => (1 + (rng() - 0.5) * k);
      const rank = Math.max(1, Math.round(profile.baseRank2025 * (1 + (2025 - year) * 0.02) + (rng() - 0.5) * 3));
      const v = (base: number, jk = 0.06) => Math.round(base * yf * jitter(jk));

      const enrolled = v(profile.students, 0.04);
      const intake = v(profile.intake, 0.03);
      const phd = v(profile.phdEnrolled, 0.04);
      const faculty = v(profile.faculty, 0.03);
      const capEx = v(profile.capEx, 0.1) * 1e7; // crores → INR
      const opex = v(profile.opex, 0.08) * 1e7;
      const pubs = v(profile.pubs, 0.07);
      const cites = v(profile.cites, 0.08);
      const top25 = Math.round(cites * 0.32 * jitter(0.1));
      const patents = Math.max(0, v(profile.patents, 0.12));
      const sponsor = v(profile.sponsor, 0.1) * 1e7;
      const consultancy = v(profile.consultancy, 0.12) * 1e7;
      const placed = v(profile.placed, 0.05);
      const higher = v(profile.higherStudies, 0.06);
      const median = Math.round(profile.medianSalary * yf * jitter(0.05)) * 1e5; // lakhs → INR
      const phdGrads = v(profile.phdGrads, 0.1);

      const raw: Partial<Record<RelativeFieldKey, number | null>> = {
        capitalExpenditure: capEx,
        operationalExpenditure: opex,
        totalPublications: pubs,
        totalCitations: cites,
        top25Citations: top25,
        patentsFiled: Math.round(patents * 0.65),
        patentsGranted: Math.round(patents * 0.35),
        sponsoredResearchAmount: sponsor,
        consultancyRevenue: consultancy,
        phdGraduates: phdGrads,
      };
      const rawSources: Partial<Record<RelativeFieldKey, SourceTag>> = {};
      for (const k of RELATIVE_RAW_FIELD_KEYS) rawSources[k] = "from_dcs_pdf";

      // Targets: apply this module's formula family per cohort (self-consistent demo)
      const targets = seedTargets(raw, rank);

      const completeness = computeCompleteness(raw, rawSources);

      records.push({
        collegeId: profile.id,
        collegeName: profile.name,
        year,
        category: "engineering",
        rank,
        raw,
        rawSources,
        targets,
        completeness,
        eligible: completeness >= COMPLETENESS_THRESHOLD,
        provenance: "seed_baseline_demo",
      });
    }
  }
  return records;
}

/** Self-consistent target generator used ONLY by the seed baseline. */
function seedTargets(
  raw: Partial<Record<RelativeFieldKey, number | null>>,
  rank: number
): RelativeTrainingRecord["targets"] {
  const band = rankBands(rank);
  const pr = Math.round((band.prMin + (band.prMax - band.prMin) * 0.55) * 10) / 10;

  return {
    pu: Math.min(35, Math.round((Math.log(1 + (raw.totalPublications ?? 0)) / Math.log(1 + 5400)) * 35 * 10) / 10),
    qp: Math.min(40, Math.round((Math.log(1 + (raw.totalCitations ?? 0)) / Math.log(1 + 70000)) * 40 * 10) / 10),
    ipr: Math.min(15, Math.round((((raw.patentsGranted ?? 0) + (raw.patentsFiled ?? 0)) / 420) * 15 * 10) / 10),
    fppp: Math.min(10, Math.round((((raw.sponsoredResearchAmount ?? 0) + (raw.consultancyRevenue ?? 0)) / 600e7) * 10 * 10) / 10),
    gphd: Math.min(20, Math.max(0, Math.round(((raw.phdGraduates ?? 0) / 500) * 20 * 10) / 10)),
    pr,
  };
}

function rankBands(rank: number): { prMin: number; prMax: number } {
  if (rank <= 10) return { prMin: 86, prMax: 100 };
  if (rank <= 25) return { prMin: 66, prMax: 88 };
  if (rank <= 50) return { prMin: 46, prMax: 72 };
  return { prMin: 28, prMax: 52 };
}

// ── Completeness ─────────────────────────────────────────────────────────────

const REQUIRED_RAW_FIELDS: RelativeFieldKey[] = RELATIVE_RAW_FIELD_KEYS;

export function computeCompleteness(
  raw: Partial<Record<RelativeFieldKey, number | null>>,
  sources?: Partial<Record<RelativeFieldKey, SourceTag>>
): number {
  let present = 0;
  for (const k of REQUIRED_RAW_FIELDS) {
    const val = raw[k];
    const src = sources?.[k];
    if (typeof val === "number" && Number.isFinite(val) && src && src !== "missing") present++;
    else if (typeof val === "number" && Number.isFinite(val)) present++;
  }
  return present / REQUIRED_RAW_FIELDS.length;
}

// ── JSON ingestion (Step 1 source records) ───────────────────────────────────

export interface Step1SourceRecord {
  college_id?: string;
  college_name?: string;
  year?: number;
  category?: string;
  rank?: number | null;
  raw_inputs?: Partial<Record<RelativeFieldKey, number | null>>;
  raw_sources?: Partial<Record<RelativeFieldKey, SourceTag>>;
  targets?: Partial<Record<string, number | null>>; // keyed by parameter code ("pu","qp","ipr","fppp","gphd","pr")
  provenance?: string;
}

export function parseRelativeDatasetJson(records: Step1SourceRecord[]): RelativeTrainingRecord[] {
  const out: RelativeTrainingRecord[] = [];
  for (const r of records) {
    const raw = r.raw_inputs ?? {};
    const rawSources = r.raw_sources ?? {};
    const targetsField = r.targets ?? {};
    const targets: RelativeTrainingRecord["targets"] = {};
    for (const p of RELATIVE_PARAMS) {
      const v = (targetsField as any)[p.key];
      targets[p.key as keyof typeof targets] = typeof v === "number" ? v : null;
    }
    const completeness = computeCompleteness(raw, rawSources);
    out.push({
      collegeId: String(r.college_id ?? ""),
      collegeName: String(r.college_name ?? r.college_id ?? ""),
      year: Number(r.year ?? 0),
      category: r.category ?? "engineering",
      rank: r.rank ?? null,
      raw,
      rawSources,
      targets,
      completeness,
      eligible: completeness >= COMPLETENESS_THRESHOLD,
      provenance: r.provenance ?? "from_dcs_pdf",
    });
  }
  return out;
}

// ── CSV ingestion ────────────────────────────────────────────────────────────

/**
 * Expected CSV columns:
 *   college_id, college_name, year, rank,
 *   raw__<fieldKey>…, source__<fieldKey>… (optional), target__<paramKey>…
 * e.g. raw__enrolledStudents, raw__totalPublications, target__pu, target__qp.
 */
export function parseRelativeDatasetCsv(text: string): RelativeTrainingRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must contain a header row and at least one data row.");
  const header = parseCsvRow(lines[0]);
  const records: Step1SourceRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h.trim()] = (cells[idx] ?? "").trim();
    });
    if (!row.college_id && !row.college_name) continue;

    const raw: Partial<Record<RelativeFieldKey, number | null>> = {};
    const sources: Partial<Record<RelativeFieldKey, SourceTag>> = {};
    const targets: Record<string, number | null> = {};

    Object.entries(row).forEach(([col, val]) => {
      if (col.startsWith("raw__")) {
        const key = col.slice("raw__".length) as RelativeFieldKey;
        const num = val === "" ? null : Number(val.replace(/,/g, ""));
        raw[key] = Number.isFinite(num as number) ? (num as number) : null;
      } else if (col.startsWith("source__")) {
        const key = col.slice("source__".length) as RelativeFieldKey;
        sources[key] = (val || "missing") as SourceTag;
      } else if (col.startsWith("target__")) {
        const key = col.slice("target__".length);
        const num = val === "" ? null : Number(val.replace(/,/g, ""));
        targets[key] = Number.isFinite(num as number) ? (num as number) : null;
      }
    });

    records.push({
      college_id: row.college_id || undefined,
      college_name: row.college_name || undefined,
      year: row.year ? Number(row.year) : undefined,
      rank: row.rank ? Number(row.rank) : null,
      raw_inputs: raw,
      raw_sources: Object.keys(sources).length ? sources : undefined,
      targets,
      provenance: row.provenance || "from_dcs_pdf",
    });
  }
  return parseRelativeDatasetJson(records);
}

/** Minimal RFC-4180-ish row parser (quotes + comma). */
export function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}