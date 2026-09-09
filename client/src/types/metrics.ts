export interface MetricField {
  key: string;
  label: string;
  type: "number" | "boolean";
  parameter: "TLR" | "RP" | "GO" | "OI" | "PR";
  /** Mandatory per the NIRF field catalog — compute is blocked until filled. */
  required?: boolean;
  /** Can only come from an external source (Scopus/WoS, NIRF surveys) — never from the PDF. */
  externalOnly?: boolean;
}

export const METRIC_FIELDS: MetricField[] = [
  // ── TLR ──
  { key: "sanctionedIntake", label: "Sanctioned Intake (NT)", type: "number", parameter: "TLR", required: true },
  { key: "enrolledStudents", label: "Enrolled Students (NE)", type: "number", parameter: "TLR", required: true },
  { key: "phdStudents", label: "PhD Students Enrolled (NP)", type: "number", parameter: "TLR", required: true },
  { key: "permanentFaculty", label: "Permanent Faculty (F)", type: "number", parameter: "TLR", required: true },
  { key: "facultyWithPhD", label: "Faculty with PhD", type: "number", parameter: "TLR" },
  { key: "facultyExp0to8", label: "Faculty Exp 0-8 yrs", type: "number", parameter: "TLR" },
  { key: "facultyExp8to15", label: "Faculty Exp 8-15 yrs", type: "number", parameter: "TLR" },
  { key: "facultyExp15plus", label: "Faculty Exp 15+ yrs", type: "number", parameter: "TLR" },
  { key: "capitalExpenditure", label: "Capital Expenditure (BC, INR)", type: "number", parameter: "TLR", required: true },
  { key: "operationalExpenditure", label: "Operational Expenditure (BO, INR)", type: "number", parameter: "TLR", required: true },
  // ── RP ──
  { key: "totalPublications", label: "Total Publications (P)", type: "number", parameter: "RP", required: true, externalOnly: true },
  { key: "totalCitations", label: "Total Citations (CC)", type: "number", parameter: "RP", required: true, externalOnly: true },
  { key: "top25Citations", label: "Citations in Top-25% Journals", type: "number", parameter: "RP", externalOnly: true },
  { key: "patentsFiled", label: "Patents Published/Filed (IPP)", type: "number", parameter: "RP" },
  { key: "patentsGranted", label: "Patents Granted (IPG)", type: "number", parameter: "RP" },
  { key: "sponsoredResearchAmount", label: "Sponsored Research Funds (RF, INR)", type: "number", parameter: "RP", required: true },
  { key: "consultancyRevenue", label: "Consultancy Revenue (CF, INR)", type: "number", parameter: "RP", required: true },
  { key: "retractedPapers", label: "Retracted Papers (Pret)", type: "number", parameter: "RP", externalOnly: true },
  { key: "retractedCitations", label: "Citations of Retracted Papers (Cret)", type: "number", parameter: "RP", externalOnly: true },
  // ── GO ──
  { key: "graduatesPlaced", label: "Graduates Placed (Np)", type: "number", parameter: "GO", required: true },
  { key: "graduatesHigherStudies", label: "Graduates in Higher Studies (Nhs)", type: "number", parameter: "GO", required: true },
  { key: "graduatesInTime", label: "Graduates in Stipulated Time (Ng)", type: "number", parameter: "GO" },
  { key: "medianSalary", label: "Median Salary (MS, INR/yr)", type: "number", parameter: "GO", required: true },
  { key: "phdGraduates", label: "PhD Graduated (Nphd)", type: "number", parameter: "GO", required: true },
  // ── OI ──
  { key: "womenStudents", label: "Women Students (NWS)", type: "number", parameter: "OI", required: true },
  { key: "womenFaculty", label: "Women Faculty (NWF)", type: "number", parameter: "OI" },
  { key: "studentsOtherStates", label: "Students from Other States", type: "number", parameter: "OI", required: true },
  { key: "studentsOtherCountries", label: "Students from Other Countries", type: "number", parameter: "OI", required: true },
  { key: "escsStudents", label: "Economically/Socially Disadvantaged (Nesc)", type: "number", parameter: "OI", required: true },
  { key: "pcsFacilities", label: "Facilities for Physically Challenged", type: "boolean", parameter: "OI", required: true },
  // ── PR ──
  { key: "perceptionScore", label: "Perception Score (0-100, peer/employer survey)", type: "number", parameter: "PR", externalOnly: true },
];