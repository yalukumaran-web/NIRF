import { describe, it, expect } from "vitest";
import { detectPdfFormat, splitPageMarkers } from "../services/pdfFormatDetector";
import { extractNirfMetrics } from "../services/nirfExtractor";
import { absoluteInputFromExtracted } from "../services/nirf/absolute/adapters";
import { computeFsr } from "../services/nirf/absolute/engine";

describe("splitPageMarkers", () => {
  it("splits combined page-tagged text into chunks", () => {
    const text = "[PAGE 1] Institute Name: X\n[PAGE 3] Faculty Details: 10";
    const pages = splitPageMarkers(text);
    expect(pages.map((p) => p.page)).toEqual([1, 3]);
    expect(pages[0].text).toContain("Institute Name");
    expect(pages[1].text).toContain("Faculty Details");
  });

  it("returns a single page-0 chunk when no markers exist", () => {
    const pages = splitPageMarkers("plain text without markers");
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(0);
  });
});

function credsPages(): { page: number; text: string }[] {
  return [
    { page: 1, text: "Institute Name: Tamil Nadu College\n NIRF ID IR-E-U-0456" },
    { page: 2, text: "Student Enrolment for the last three years: UG [4 Years Program(s)] 600 2400 480 300 20 400 300" },
    { page: 3, text: "Ph.D students enroled: Full Time 120 Part Time 40 Number of faculty members entered: 300" },
    { page: 4, text: "Annual Capital Expenditure: Library etc 100000000 Annual Operational Expenditure: Salaries 150000000" },
    { page: 5, text: "Research Publications and Citations: Total number of research publications: 700 Total number of citations: 12000" },
    { page: 6, text: "Graduating Students & Placement: Median Salary 900000" },
    { page: 7, text: "Facilities of Physically Challenged: Yes No" },
  ];
}

describe("detectPdfFormat", () => {
  it("recognizes a full NIRF DCS layout", () => {
    const report = detectPdfFormat(credsPages());
    expect(report.format).toBe("nirf_credentials");
    expect(report.coreFound).toBeGreaterThanOrEqual(4);
    expect(report.pageCount).toBe(7);
    const institute = report.sections.find((s) => s.id === "institute")!;
    expect(institute.page).toBe(1);
  });

  it("classifies a bare page as unsupported", () => {
    const report = detectPdfFormat([{ page: 1, text: "Meeting minutes only" }]);
    expect(report.format).toBe("unsupported");
  });

  it("classifies a partial document as nirf_pdf_other", () => {
    const report = detectPdfFormat([
      { page: 1, text: "Institute Name: Some College" },
      { page: 2, text: "Random content without NIRF sections" },
    ]);
    expect(report.format).toBe("nirf_pdf_other");
  });
});

describe("extractNirfMetrics (page awareness)", () => {
  it("extracts value and records its source page", () => {
    const combined = credsPages()
      .map((p) => `[PAGE ${p.page}] ${p.text}`)
      .join("\n");
    const out = extractNirfMetrics(combined);
    expect(out.permanentFaculty).toBe(300);
    expect(out.fieldPages?.permanentFaculty).toBe(3);
    expect(out.fieldPages?.instituteName).toBe(1);
    expect(out.fieldPages?.medianSalary).toBe(6);
    expect(out.includesEstimates).toBe(true); // estimated_default / external values exist by design
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Corrected extraction semantics (source taxonomy, designation filter,
// most-recent-year rules, external-source tagging, ESCS both columns).
// ──────────────────────────────────────────────────────────────────────────

function realisticCreds(): string {
  return `
Institute Name: Test College [IR-E-T-0001]

Ph.D Student Details
Ph.D (Student pursuing doctoral program till 2023-24)
Total Students Full Time 100 Part Time 20
No. of Ph.D students graduated (including Integrated Ph.D) 2023-24 2022-23 2021-22
Full Time 30 25 20 Part Time 5 4 3

Student Enrolment for the last three years
Sanctioned (Approved) Intake
Academic Year 2023-24 2022-23 2021-22 2020-21
UG [4 Years Program(s)] 500 480 470 460
UG [5 Years Program(s)] - - - -
PG [2 Year Program(s)] 200 190 180 170

Total Actual Student Strength
UG [4 Years Program(s)] 2000 700 2700 400 1900 100 300 600 0 0 0 0
PG [2 Year Program(s)] 400 100 500 0 450 20 50 60 0 0 0 0

Annual Capital Expenditure
Financial Year 2023-24 2022-23 2021-22 Utilised Amount Utilised Amount Utilised Amount
Library 100000(One Lakh) 90000(Ninety Thousand) 80000(Eighty Thousand)
New Equipment 500000(Five Lakh) 400000(Four Lakh) 300000(Three Lakh)
Annual Operational Expenditure
Salaries 200000(Two Lakh) 180000(One Lakh Eighty Thousand) 150000(One Lakh Fifty Thousand)
Maintenance 70000(Seventy Thousand) 60000(Sixty Thousand) 50000(Fifty Thousand)
Seminars 30000(Thirty Thousand) 20000(Twenty Thousand) 10000(Ten Thousand)

IPR
No. of Patents Published 12 10 8
No. of Patents Granted 5 4 3

Sponsored Research Details
Total Amount Received (Amount in Rupees) 1000000(Ten Lakh) 900000 800000
Consultancy Project Details
Total Amount Received (Amount in Rupees) 250000(Two Lakh Fifty Thousand) 200000 150000

Placement & Higher Studies
UG [4 Years Program(s)]:
2019-20 400 450 2020-21 10 2022-23 390 300 600000(Six Lakh) 20
2020-21 420 460 2021-22 5 2023-24 400 350 700000(Seven Lakh) 25
PG [2 Year Program(s)]:
2021-22 190 200 2023-24 180 120 900000(Nine Lakh) 10

Facilities of Physically Challenged
Yes Yes No

Faculty Details
1 Alice Smith 40 Professor Female Ph.D 220 Yes 10-01-2015 -- Regular
2 Bob Jones 35 Associate Professor Male M.Tech 90 Yes 02-05-2020 -- Regular
3 Carol White 50 Other Female M.A. 300 No 05-03-2010 -- Regular
4 Dave Black 60 Professor Male Ph.D 200 No 01-01-2005 -- Regular
Number of faculty members entered 4
`;
}

describe("corrected extraction semantics", () => {
  it("sums sanctioned intake from the most recent year column only", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.sanctionedIntake).toBe(700); // 500 (UG4) + 200 (PG2) — 2023-24 column, dashes skipped
    expect(out.fields?.sanctionedIntake?.source).toBe("pdf");
    expect(out.fields?.sanctionedIntake?.basis).toContain("2023-24");
  });

  it("reads student strength by column and sums both ESCS columns", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.enrolledStudents).toBe(3200); // Total col 2700+500
    expect(out.womenStudents).toBe(800); // Female col 700+100
    expect(out.studentsOtherStates).toBe(2350); // 1900+450
    expect(out.studentsOtherCountries).toBe(120); // 100+20
    expect(out.escsStudents).toBe(1010); // EC(300+50) + SC(600+60)
    expect(out.fields?.escsStudents?.basis).toContain("Economically Backward");
    expect(out.fields?.escsStudents?.basis).toContain("Socially Challenged");
  });

  it("applies the faculty designation filter and experience bands", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.permanentFaculty).toBe(2); // Alice + Bob; Carol(Other) & Dave(not working) excluded
    expect(out.fields?.permanentFaculty?.basis).toContain("excluded");
    expect(out.facultyWithPhD).toBe(1); // Alice only
    expect(out.facultyExp0to8).toBe(1); // Bob 90 months
    expect(out.facultyExp8to15).toBe(0);
    expect(out.facultyExp15plus).toBe(1); // Alice 220 months
    expect(out.womenFaculty).toBe(1);
  });

  it("extracts the most recent fiscal year for capital and operational", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.capitalExpenditure).toBe(600000); // 2023-24: 100000+500000
    expect(out.operationalExpenditure).toBe(300000); // 2023-24: 200000+70000+30000
    expect(out.fields?.capitalExpenditure?.source).toBe("pdf");
  });

  it("uses the most recent graduating cohort and largest placed cohort median", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.graduatesPlaced).toBe(470); // 350 (UG4 2023-24) + 120 (PG2 2023-24)
    expect(out.graduatesInTime).toBe(580); // 400 + 180
    expect(out.graduatesHigherStudies).toBe(35); // 25 + 10
    expect(out.medianSalary).toBe(700000); // largest placed cohort (350) median
  });

  it("extracts phd students and graduated from the FT+PT table", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.phdStudents).toBe(120);
    expect(out.phdGraduates).toBe(35); // 2023-24: FT 30 + PT 5
  });

  it("tags external bibliometrics/perception as requires_external_source", () => {
    const out = extractNirfMetrics(realisticCreds());
    for (const k of ["totalPublications", "totalCitations", "top25Citations", "retractedPapers", "retractedCitations", "perceptionScore"]) {
      const rec = out.fields?.[k];
      expect(rec?.source).toBe("requires_external_source");
      expect(rec?.value).toBeNull();
    }
    expect(out.totalPublications).toBeUndefined();
    expect(out.requiresExternalSources).toBe(true);
  });

  it("marks placement fields missing when the outcomes table is absent", () => {
    const text = realisticCreds().replace(/Placement & Higher Studies[\s\S]*?Physically Challenged/, "");
    const out = extractNirfMetrics(text);
    expect(out.fields?.graduatesPlaced?.source).toBe("missing");
    expect(out.medianSalary).toBeUndefined();
    expect(out.graduatesPlaced).toBeUndefined();
  });

  it("falls back transparently (estimated_default) when the roster is absent", () => {
    const text = realisticCreds().replace(/1 Alice Smith[\s\S]*?Number of faculty members entered 4/, "Number of faculty members entered 76");
    const out = extractNirfMetrics(text);
    expect(out.permanentFaculty).toBe(76);
    expect(out.fields?.permanentFaculty?.source).toBe("estimated_default");
    expect(out.fields?.permanentFaculty?.basis).toContain("Number of faculty members entered");
    expect(out.fields?.facultyWithPhD?.source).toBe("missing");
  });

  it("extracts clean program labels and the far-right Appointment Type column", () => {
    const out = extractNirfMetrics(realisticCreds());
    // labels must NOT carry the trailing numeric cells
    expect((out.studentStrengthRows ?? []).map((r) => r.label)).toEqual([
      "UG [4 Years Program(s)]",
      "PG [2 Year Program(s)]",
    ]);
    // appointment type is read from the last field (after the date columns)
    const roster = out.facultyRoster ?? [];
    expect(roster.map((r) => r.appointmentType)).toEqual(["Regular", "Regular", "Regular", "Regular"]);
    // working flag + month experience survive verbatim
    expect(roster[0].working).toBe(true);
    expect(roster[0].experienceMonths).toBe(220);
  });

  it("computes FSR from the extracted payload (roster + student-strength + PhD)", () => {
    const out = extractNirfMetrics(realisticCreds());
    const input = absoluteInputFromExtracted(out);
    const r = computeFsr(input);
    // F = Alice (working, Regular, 220m) + Bob (working, Regular, 90m) = 2
    //   Carol (not working) & Dave (not working) excluded
    // NT = 2700 (UG4) + 500 (PG2) = 3200; Np = 100 + 20 = 120; N = 3320
    // N/F = 3320/2 = 1660 > 50 → official override: FSR = 0
    const finalF = r.steps.find((s) => s.label === "F — permanent faculty count");
    expect(finalF?.result).toBe(2);
    const N = r.steps.find((s) => s.label === "N — total students (FSR denominator)");
    expect(N?.result).toBe(3320);
    expect(r.status).toBe("computed");
    expect(r.score).toBe(0);
    expect(r.steps.some((s) => s.label.startsWith("override N/F > 50"))).toBe(true);
  });

  it("keeps a consistent nested fields / flat view", () => {
    const out = extractNirfMetrics(realisticCreds());
    expect(out.fields?.enrolledStudents?.value).toBe(3200);
    expect(out.fieldSources?.enrolledStudents).toBe("pdf");
    expect(out.fieldBases?.enrolledStudents).toContain("Total");
    expect(out.missingCount).toBe(0);
  });
});