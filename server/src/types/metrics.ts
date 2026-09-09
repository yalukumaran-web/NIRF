export type NIRFCategory =
  | "overall"
  | "engineering"
  | "university"
  | "management"
  | "pharmacy"
  | "medical"
  | "architecture";

/**
 * Raw metrics as submitted by institutions via NIRF data-submission PDFs.
 * All monetary values are in INR (raw, not lakh).
 * Fields correspond to the NIRF 2025 Engineering data-submission format.
 */
export interface RawMetrics {
  year: number;
  // ── TLR ──────────────────────────────────────────────────────────
  sanctionedIntake: number;         // NT: total sanctioned intake (UG+PG)
  enrolledStudents: number;         // NE: total enrolled (UG+PG)
  phdStudents: number;              // NP: doctoral students enrolled
  permanentFaculty: number;         // F: full-time regular faculty
  facultyWithPhD: number;           // faculty holding PhD (or equivalent)
  facultyExp0to8: number;           // F1: faculty with experience 0-8 years
  facultyExp8to15: number;          // F2: faculty with experience 8-15 years
  facultyExp15plus: number;         // F3: faculty with experience >15 years
  capitalExpenditure: number;       // BC: annual capital expenditure (INR)
  operationalExpenditure: number;   // BO: annual operational expenditure (INR)
  // ── RP ──────────────────────────────────────────────────────────
  totalPublications: number;        // P: publications in peer-reviewed journals
  totalCitations: number;           // CC: total citations (Scopus/WoS)
  top25Citations: number;           // citations in top-25% journals
  patentsFiled: number;             // IPP: patents published/filed
  patentsGranted: number;           // IPG: patents granted
  sponsoredResearchAmount: number;  // RF: sponsored research funds (INR)
  consultancyRevenue: number;       // CF: consultancy revenue (INR)
  retractedPapers: number;          // Pret: retracted publications
  retractedCitations: number;       // Cret: citations of retracted papers
  // ── GO ──────────────────────────────────────────────────────────
  graduatesPlaced: number;          // Np: graduates placed
  graduatesHigherStudies: number;   // Nhs: graduates pursuing higher studies
  graduatesInTime: number;          // Ng: graduates finishing in stipulated time
  medianSalary: number;             // MS: median salary of graduates (INR/yr)
  phdGraduates: number;             // Nphd: PhD students graduated
  // ── OI ──────────────────────────────────────────────────────────
  womenStudents: number;            // NWS: women students
  womenFaculty: number;             // NWF: women faculty
  studentsOtherStates: number;      // students from other states
  studentsOtherCountries: number;   // students from other countries
  escsStudents: number;             // Nesc: economically & socially challenged
  pcsFacilities: boolean;           // PCS: facilities for physically challenged
  // ── PR ──────────────────────────────────────────────────────────
  perceptionScore?: number;         // 0-100, from peer/employer surveys
}

export type MetricKey = keyof RawMetrics;
