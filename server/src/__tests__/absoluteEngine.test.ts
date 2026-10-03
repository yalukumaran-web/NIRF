import { describe, it, expect } from "vitest";
import {
  computeAbsolute,
  computeFsr,
  computeGph,
  computeGue,
  computePcs,
  computeFqe,
  computeWd,
  computeRd,
} from "../services/nirf/absolute/engine";
import type {
  AbsoluteInput,
  FacultyRosterRow,
  PlacementCohort,
  ProgramStrengthRow,
} from "../services/nirf/absolute/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function faculty(
  n: number,
  designation: string,
  overrides: Partial<FacultyRosterRow> = {}
): FacultyRosterRow[] {
  return Array.from({ length: n }, (_, k) => ({
    serial: k + 1,
    designation,
    appointmentType: "Regular",
    gender: k % 2 === 0 ? "Male" : "Female",
    qualification: "Ph.D",
    experienceMonths: 200,
    working: true,
    ...overrides,
  }));
}

function cohort(
  program: string,
  admitYear: string,
  admitted: number,
  ng: number
): PlacementCohort {
  return {
    program,
    durationYears: Number(/\d+/.exec(program)?.[0] ?? 4),
    admitYear,
    firstYearIntake: admitted,
    firstYearAdmitted: admitted,
    lateralYear: null,
    lateralAdmitted: null,
    gradYear: `${Number(admitYear.split("-")[0]) + 4}-${String(Number(admitYear.split("-")[0]) + 4 + 1).slice(-2)}`,
    graduatedInTime: ng,
    graduatedInTimeLateral: null,
    placed: ng,
    medianSalary: 600000,
    higherStudies: 10,
  };
}

function strength(label: string, male: number, female: number, oos: number, ooc: number): ProgramStrengthRow {
  return {
    label,
    male,
    female,
    total: male + female,
    withinState: male + female - oos - ooc,
    outsideState: oos,
    outsideCountry: ooc,
    economicallyBackward: null,
    sociallyChallenged: null,
  };
}

function gphCohort(
  program: string,
  admitYear: string,
  admitted: number,
  lateral: number | null,
  placed: number,
  higher: number
): PlacementCohort {
  const dur = Number(/\d+/.exec(program)?.[0] ?? 4);
  const admit = Number(admitYear.split("-")[0]);
  return {
    program,
    durationYears: dur,
    admitYear,
    firstYearIntake: admitted,
    firstYearAdmitted: admitted,
    lateralYear: lateral === null ? null : `${admit + 1}-${String(admit + 2).slice(-2)}`,
    lateralAdmitted: lateral,
    gradYear: `${admit + dur}-${String(admit + dur + 1).slice(-2)}`,
    graduatedInTime: placed,
    graduatedInTimeLateral: null,
    placed,
    medianSalary: 450000,
    higherStudies: higher,
  };
}

const pcsFull: AbsoluteInput = {
  pcsQuestions: [
    { key: "liftsRamps", label: "Lifts/Ramps facilities", rawAnswer: "Yes, more than 80% of the buildings" },
    { key: "wheelchairTransport", label: "Wheelchair", rawAnswer: "Yes" },
    { key: "speciallyDesignedToilets", label: "Specially designed toilets", rawAnswer: "Yes, more than 80% of the buildings" },
  ],
};

// ── FSR ─────────────────────────────────────────────────────────────────────

describe("FSR (Faculty-Student Ratio)", () => {
  const tmpl: AbsoluteInput = {
    facultyRoster: [
      ...faculty(30, "Professor"),
      ...faculty(20, "Associate Professor"),
      ...faculty(10, "Assistant Professor"),
      ...faculty(10, "Other", { appointmentType: "Adhoc/Contractual" }),
      ...faculty(5, "Professor", { working: false }),
    ],
    studentStrength: [strength("UG [4 Years Program(s)]", 480, 320, 50, 5)],
    phdDetails: { fullTime: 80, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
  };

  it("counts as F only currently-working ∩ Regular-appointment ∩ experience ≥ 12 months", () => {
    const r = computeFsr(tmpl);
    // 30 Prof + 20 Aso. Prof + 10 Asst. Prof = 60 permanent; the 10 'Other'
    // rows are working+Regular? no → Adhoc/Contractual, excluded; 5 not working → excluded.
    const fStep = r.steps.find((s) => s.label.startsWith("F — STEP 1.4"));
    expect(fStep?.result).toBe(60);
    const finalF = r.steps.find((s) => s.label === "F — permanent faculty count");
    expect(finalF?.result).toBe(60);
    expect(r.flags.some((fl) => fl.message.includes('Appointment Type is not "Regular"'))).toBe(true);
    expect(r.flags.some((fl) => fl.message.includes("Currently working with the Institution") && fl.message.includes('"No"'))).toBe(true);
  });

  it("excludes regular working faculty with under 12 months experience from F", () => {
    const r = computeFsr({
      ...tmpl,
      facultyRoster: [
        ...faculty(10, "Professor", { experienceMonths: 6 }),
        ...faculty(8, "Associate Professor", { experienceMonths: 12 }),
        ...faculty(4, "Assistant Professor", { experienceMonths: 200 }),
      ],
    });
    // only the ≥12-month rows count (8 + 4), the 6-month ones are excluded.
    const finalF = r.steps.find((s) => s.label === "F — permanent faculty count");
    expect(finalF?.result).toBe(12);
    expect(r.flags.some((fl) => fl.message.includes("below 12"))).toBe(true);
  });

  it("sums ONLY the FSR program rows (UG4, UG5, PG2) into NT and adds Ph.D", () => {
    const r = computeFsr({
      ...tmpl,
      studentStrength: [
        strength("UG [4 Years Program(s)]", 480, 320, 50, 5),   // total 800
        strength("UG [5 Years Program(s)]", 100, 50, 5, 0),      // total 150
        strength("PG [2 Years Program(s)]", 200, 100, 20, 2),    // total 300
        strength("PG [3 Years Program(s)]", 90, 60, 10, 1),      // excluded
      ],
      phdDetails: { fullTime: 80, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
    });
    // NT = 800+150+300 = 1250 (PG3 excluded), Np = 100 → N = 1350
    const nt = r.steps.find((s) => s.label.startsWith("NT — UG/PG students in FSR denominator"));
    expect(nt?.result).toBe(1250);
    const N = r.steps.find((s) => s.label === "N — total students (FSR denominator)");
    expect(N?.result).toBe(1350);
    expect(r.flags.some((fl) => fl.message.includes("PG [3 Years Program(s)]") && fl.message.includes("excluded"))).toBe(true);
  });

  it("matches FSR program rows even when labels carry trailing numeric cells (extractor-style)", () => {
    const r = computeFsr({
      ...tmpl,
      studentStrength: [
        { ...strength("UG [4 Years Program(s)]", 600, 400, 50, 5), label: "UG [4 Years Program(s)] 600 400 1000 0 50 5 0 0 0 0 0 0" },
        { ...strength("PG [2 Years Program(s)]", 150, 50, 10, 1), label: "PG [2 Year Program(s)] 150 50 200 0 10 1 0 0 0 0 0 0" },
      ],
      phdDetails: { fullTime: 20, partTime: 10, graduatedFullTime: null, graduatedPartTime: null },
    });
    // NT = 1000+200 = 1200, Np = 30 → N = 1230 (not null, not "unable")
    const nt = r.steps.find((s) => s.label.startsWith("NT — UG/PG students in FSR denominator"));
    expect(nt?.result).toBe(1200);
    expect(r.status).toBe("computed");
  });

  it("computes FSR with full trace and 2-dp round only at the end", () => {
    const r = computeFsr(tmpl);
    // NT = 800, Np = 100 → N = 900; F = 60
    // ratio = 15 × (60/900) = 1.0 → exactly 30 → capped
    // use a variant to avoid the exact cap:
    const variant: AbsoluteInput = {
      ...tmpl,
      studentStrength: [strength("UG [4 Years Program(s)]", 540, 335, 50, 5)],
      phdDetails: { fullTime: 75, partTime: 25, graduatedFullTime: null, graduatedPartTime: null },
    };
    const rr = computeFsr(variant);
    // F=60, NT=875, Np=100 → N=975; ratio=15×60/975=0.92307692; FSR=27.69230769
    expect(rr.status).toBe("computed");
    expect(rr.score).toBe(27.69);
    const Nstep = rr.steps.find((s) => s.label === "N — total students (FSR denominator)");
    expect(Nstep?.equation).toContain("875");
    expect(rr.steps.length).toBeGreaterThan(3);
    // 4+ decimals carried in intermediate, 2 decimals on the final score
    expect(rr.steps.some((s) => s.equation.includes("0.9231"))).toBe(true);
    expect(rr.steps.some((s) => s.label === "min(15 × F/N, 1)")).toBe(true);
  });

  it("caps at 30 when the ratio reaches the limit and reports both values", () => {
    const r = computeFsr({
      ...tmpl,
      facultyRoster: [
        ...faculty(70, "Professor"),
        ...faculty(30, "Assistant Professor", { working: false }),
      ],
      studentStrength: [strength("UG [4 Years Program(s)]", 60, 40, 0, 0)],
      phdDetails: { fullTime: 0, partTime: 0, graduatedFullTime: null, graduatedPartTime: null },
    });
    // F=70 regular & working, NT=100, Np=0 → ratio=15×70/100=10.5 → min(·,1)=1 → FSR=30
    expect(r.status).toBe("computed");
    expect(r.score).toBe(30);
    expect(r.steps.some((s) => s.label === "min(15 × F/N, 1)" && s.equation.includes("(cap applied)"))).toBe(true);
    expect(r.steps.some((s) => s.equation.includes("10.5000"))).toBe(true);
  });

  it("overrides FSR to 0 when N/F > 50 (F/N < 1/50)", () => {
    const r = computeFsr({
      ...tmpl,
      facultyRoster: faculty(2, "Professor"),
      studentStrength: [strength("UG [4 Years Program(s)]", 2000, 1000, 0, 0)],
      phdDetails: { fullTime: 0, partTime: 0, graduatedFullTime: null, graduatedPartTime: null },
    });
    // N/F = 3000/2 = 1500 > 50 → FSR = 0
    expect(r.status).toBe("computed");
    expect(r.score).toBe(0);
    expect(r.steps.some((s) => s.label.startsWith("override N/F > 50"))).toBe(true);
    expect(r.flags.some((fl) => fl.message.includes("N/F = 1500.0000 > 50"))).toBe(true);
  });

  it("scores 0 (computed) when F is genuinely 0", () => {
    const r = computeFsr({
      facultyRoster: faculty(20, "Assistant Professor", { working: false }),
      studentStrength: [strength("UG [4 Years Program(s)]", 500, 500, 30, 5)],
      phdDetails: { fullTime: 50, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
    });
    expect(r.status).toBe("computed");
    expect(r.score).toBe(0);
    expect(r.flags.some((fl) => fl.message.includes("F = 0"))).toBe(true);
  });

  it("reports unable when the roster is absent (summary count only)", () => {
    const r = computeFsr({
      facultySummary: 40,
      studentStrength: [strength("UG [4 Years Program(s)]", 400, 300, 30, 2)],
      phdDetails: { fullTime: 50, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
    });
    expect(r.status).toBe("unable");
    expect(r.score).toBeNull();
    expect(r.missingTables).toContain("Faculty Details (row-wise roster)");
    expect(r.flags.some((fl) => fl.message.includes("source table absent"))).toBe(true);
  });
});

// ── GUE ─────────────────────────────────────────────────────────────────────

describe("GUE (Graduation in Stipulated Time)", () => {
  it("pools the 3 most recent cohorts per program and applies the 80% threshold scale", () => {
    const input: AbsoluteInput = {
      placementCohorts: [
        cohort("UG [4 Years Program(s)]", "2021-22", 1000, 700),
        cohort("UG [4 Years Program(s)]", "2020-21", 1000, 700),
        cohort("UG [4 Years Program(s)]", "2019-20", 1000, 700),
      ],
    };
    const r = computeGue(input);
    // pooled = 2100/3000 = 0.7 → 0.7/0.8 = 0.875 → 15 × 0.875 = 13.125 → 13.13
    expect(r.status).toBe("computed");
    expect(r.score).toBe(13.13);
    expect(r.steps.some((s) => s.equation.includes("0.7000"))).toBe(true);
  });

  it("caps at 15 when pooled graduation rate is 100%", () => {
    const input: AbsoluteInput = {
      placementCohorts: [
        cohort("UG [4 Years Program(s)]", "2021-22", 500, 500),
        cohort("UG [4 Years Program(s)]", "2020-21", 500, 500),
        cohort("UG [4 Years Program(s)]", "2019-20", 500, 500),
      ],
    };
    expect(computeGue(input).score).toBe(15);
  });

  it("excludes blank-cell rows and zero-admitted rows explicitly", () => {
    const input: AbsoluteInput = {
      placementCohorts: [
        cohort("UG [4 Years Program(s)]", "2021-22", 1000, 900),
        { ...cohort("UG [4 Years Program(s)]", "2020-21", 1000, 800), graduatedInTime: null },
        cohort("UG [4 Years Program(s)]", "2019-20", 0, 0),
      ],
    };
    const r = computeGue(input);
    expect(r.flags.some((fl) => fl.message.includes("excluded") && fl.severity === "warning")).toBe(true);
    expect(r.flags.some((fl) => fl.message.includes("0"))).toBe(true);
    expect(r.status).toBe("computed");
  });

  it("is unable when the cohort table is absent", () => {
    const r = computeGue({});
    expect(r.status).toBe("unable");
    expect(r.score).toBeNull();
    expect(r.missingTables).toContain("Placement & Higher Studies cohort table");
  });
});

// ── GPH ─────────────────────────────────────────────────────────────────────

describe("GPH (Placement & Higher Studies)", () => {
  it("computes cohort ratios, program averages and the 40-mark score across the 4 program tables", () => {
    const r = computeGph({
      placementCohorts: [
        // UG [4 Years]: ratios 0.9, 0.8, 0.7 → avg 0.8
        gphCohort("UG [4 Years Program(s)]", "2021-22", 1000, 0, 900, 0),
        gphCohort("UG [4 Years Program(s)]", "2020-21", 1000, 0, 800, 0),
        gphCohort("UG [4 Years Program(s)]", "2019-20", 1000, 0, 700, 0),
        // UG [5 Years]: ratios 0.9, 0.5, 0.4 → avg 0.6
        gphCohort("UG [5 Years Program(s)]", "2020-21", 1000, 0, 900, 0),
        gphCohort("UG [5 Years Program(s)]", "2019-20", 1000, 0, 500, 0),
        gphCohort("UG [5 Years Program(s)]", "2018-19", 1000, 0, 400, 0),
        // PG [2 Years]: no lateral columns (lateral null) → ratios 1.0, 0.5, 0.0 → avg 0.5
        gphCohort("PG [2 Years Program(s)]", "2022-23", 500, null, 500, 0),
        gphCohort("PG [2 Years Program(s)]", "2021-22", 500, null, 250, 0),
        gphCohort("PG [2 Years Program(s)]", "2020-21", 500, null, 0, 0),
        // PG [3 Years]: ratios 0.8, 0.7, 0.6 → avg 0.7
        gphCohort("PG [3 Years Program(s)]", "2021-22", 800, 0, 640, 0),
        gphCohort("PG [3 Years Program(s)]", "2020-21", 800, 0, 560, 0),
        gphCohort("PG [3 Years Program(s)]", "2019-20", 800, 0, 480, 0),
      ],
    });
    // fraction = (0.8 + 0.6 + 0.5 + 0.7) / 4 = 0.65 → GPH = 40 × 0.65 = 26
    expect(r.status).toBe("computed");
    expect(r.score).toBe(26);
    expect(r.contribution).toBe(5.2);
    expect(r.steps.some((s) => s.label.startsWith("cohorts selected — UG [4 Years Program(s)]"))).toBe(true);
    expect(r.steps.some((s) => s.label.startsWith("program average — PG [2 Years Program(s)]"))).toBe(true);
    // Absent lateral-entry columns (PG [2 Years] table) are treated as 0.
    expect(
      r.steps.some(
        (s) => s.label.startsWith("N — PG [2 Years Program(s)]") && s.equation.includes("lateral 0")
      )
    ).toBe(true);
    const frac = r.steps.find((s) => s.label === "GPH fraction (mean of program averages)");
    expect(frac?.equation).toContain("0.8000 + 0.6000 + 0.5000 + 0.7000");
  });

  it("keeps full precision in intermediates and rounds only the final score to 2 dp", () => {
    const r = computeGph({
      placementCohorts: [
        gphCohort("UG [4 Years Program(s)]", "2021-22", 980, 20, 850, 60), // N=1000, outcome 910 → 0.91
        gphCohort("UG [4 Years Program(s)]", "2020-21", 1000, 0, 720, 80), // 0.8
        gphCohort("UG [4 Years Program(s)]", "2019-20", 1000, 0, 810, 40), // 0.85
      ],
    });
    // program avg = 0.853333... → GPH = 34.133333 → 34.13
    expect(r.score).toBe(34.13);
    expect(r.steps.some((s) => s.equation.includes("0.9100"))).toBe(true);
    const avg = r.steps.find((s) => s.label.startsWith("program average —"));
    expect(avg?.equation).toContain("= 0.8533");
  });

  it("caps at 40 when the mean fraction reaches or exceeds 1", () => {
    const r = computeGph({
      placementCohorts: [
        gphCohort("UG [4 Years Program(s)]", "2021-22", 1000, 0, 900, 300), // 1.2
        gphCohort("UG [4 Years Program(s)]", "2020-21", 1000, 0, 900, 210), // 1.11
        gphCohort("UG [4 Years Program(s)]", "2019-20", 1000, 0, 800, 250), // 1.05
      ],
    });
    // program avg = 1.12 → capped fraction 1.00 → GPH = 40
    expect(r.status).toBe("partial"); // only 1 of 4 program tables present
    expect(r.score).toBe(40);
    const cap = r.steps.find((s) => s.label === "cap min(fraction, 1)");
    expect(cap?.equation).toContain("min(1.1200, 1) = 1.0000");
  });

  it("reports partial when a program table is missing and never fabricates it", () => {
    const r = computeGph({
      placementCohorts: [
        gphCohort("UG [4 Years Program(s)]", "2021-22", 1000, 0, 900, 0),
        gphCohort("UG [4 Years Program(s)]", "2020-21", 1000, 0, 800, 0),
        gphCohort("UG [4 Years Program(s)]", "2019-20", 1000, 0, 700, 0),
      ],
    });
    expect(r.status).toBe("partial");
    expect(r.note).toContain("1/4");
    expect(r.flags.some((fl) => fl.severity === "warning" && fl.message.includes("absent or without cohorts"))).toBe(true);
    // missing program tables contribute nothing to the mean
    const frac = r.steps.find((s) => s.label === "GPH fraction (mean of program averages)");
    expect(frac?.equation).toContain("(0.8000) / 1");
  });

  it("excludes blank-cell rows explicitly (never treating blanks as zero)", () => {
    const r = computeGph({
      placementCohorts: [
        { ...gphCohort("UG [4 Years Program(s)]", "2021-22", 1000, 0, 900, 0), placed: null },
        gphCohort("UG [4 Years Program(s)]", "2020-21", 1000, 0, 800, 50), // 0.85
        gphCohort("UG [4 Years Program(s)]", "2019-20", 1000, 0, 800, 100), // 0.9
      ],
    });
    // avg of remaining = (0.85 + 0.9) / 2 = 0.875 → GPH = 35
    expect(r.status).toBe("partial");
    expect(r.score).toBe(35);
    expect(r.flags.some((fl) => fl.message.includes("excluded") && fl.message.includes("'placed' cell blank"))).toBe(true);
  });

  it("is unable when the cohort table is absent", () => {
    const r = computeGph({});
    expect(r.status).toBe("unable");
    expect(r.score).toBeNull();
    expect(r.missingTables).toContain("Placement & Higher Studies cohort table");
  });
});

// ── PCS ─────────────────────────────────────────────────────────────────────

describe("PCS (Physically Challenged Facilities)", () => {
  it("credits each answered facility and applies the 20-mark cap", () => {
    const r = computePcs(pcsFull);
    expect(r.status).toBe("computed");
    expect(r.score).toBe(20);
    expect(r.flags.some((fl) => fl.message.includes("6.6667"))).toBe(true);
  });

  it("reports partial status when some questions are unanswered", () => {
    const r = computePcs({
      pcsQuestions: [
        { key: "liftsRamps", label: "Lifts", rawAnswer: "Yes, more than 80% of the buildings" },
      ],
    });
    expect(r.status).toBe("partial");
    expect(r.score).toBe(6.67);
    const sum = r.steps.find((s) => s.label.startsWith("Σ"));
    expect(sum?.equation).toContain("6.6667");
  });

  it("is unable when no PCS question table exists", () => {
    const r = computePcs({});
    expect(r.status).toBe("unable");
    expect(r.missingTables.some((m) => m.includes("Physically Challenged"))).toBe(true);
  });
});

// ── FQE ─────────────────────────────────────────────────────────────────────

describe("FQE (Faculty Quality & Experience)", () => {
  const roster: FacultyRosterRow[] = [
    ...faculty(4, "Professor", { experienceMonths: 72 }), // ≤ 96
    ...faculty(2, "Associate Professor", { experienceMonths: 120 }), // 97–180
    ...faculty(4, "Assistant Professor", { experienceMonths: 240 }), // > 180
    // 3 professors with M.Tech (non-PhD), working, exp 300 → FQ drops below 95%
  ];
  const phdLess = faculty(3, "Professor", {
    qualification: "M.Tech",
    experienceMonths: 300,
    gender: "Male",
  });
  const input: AbsoluteInput = { facultyRoster: [...roster, ...phdLess] };

  it("derives FQ proportionally below the 95% PhD threshold", () => {
    const r = computeFqe(input);
    // teaching = 13; PhD = 10 → 0.76923077; FQ = 10 × (0.76923077/0.95) = 8.09678715
    const fq = r.steps.find((s) => s.label.startsWith("FQ (proportional)"));
    expect(fq?.equation).toContain("10 × (0.7692 / 0.95)");
    expect(r.flags.some((fl) => fl.message.includes("proportional slab"))).toBe(true);
  });

  it("scores FQE = FQ + FE with capping of per-bucket factors", () => {
    const r = computeFqe(input);
    // teaching = 13; PhD = 10 → fPhd = 0.76923077
    // FQ = 10 × (0.76923077/0.95) = 8.09717
    // buckets over 13 rows: F1=4 (72m), F2=2 (120m), F3=7 (4×240m + 3×300m)
    // ef1=0.30769→t1=0.92308 (kept), ef2=0.15385→t2=0.46154, ef3=0.53846→t3=1.61538→capped 1
    // FE = 3×0.92308 + 3×0.46154 + 4×1 = 2.76923 + 1.38462 + 4 = 8.15385
    // FQE = 8.09717 + 8.15385 = 16.25101 → 16.25
    expect(r.status).toBe("computed");
    expect(r.score).toBe(16.25);
  });

  it("is unable without a roster", () => {
    const r = computeFqe({ facultySummary: 30 });
    expect(r.status).toBe("unable");
    expect(r.missingTables).toContain("Faculty Details (row-wise roster)");
  });
});

// ── WD ──────────────────────────────────────────────────────────────────────

describe("WD (Women Diversity)", () => {
  it("scores both the student and the faculty component (capped at 30)", () => {
    const input: AbsoluteInput = {
      studentStrength: [strength("UG [4 Years Program(s)]", 700, 300, 60, 5)],
      facultyRoster: faculty(100, "Assistant Professor"), // 50 female / 100 → NWF = 0.5
    };
    const r = computeWd(input);
    // NWS = 300/1000 = 0.3 → /0.5 = 0.6 → student part 9
    // NWF = 0.5 → /0.2 = 2.5 → capped 1 → faculty part 15 → WD = 24
    expect(r.status).toBe("computed");
    expect(r.score).toBe(24);
    expect(r.contribution).toBe(2.4);
  });

  it("goes partial (student-only score) when the roster is absent", () => {
    const r = computeWd({
      studentStrength: [strength("UG [4 Years Program(s)]", 700, 300, 60, 5)],
      facultySummary: 100,
    });
    expect(r.status).toBe("partial");
    expect(r.score).toBe(9);
    expect(r.flags.some((fl) => fl.severity === "error")).toBe(true);
  });
});

// ── RD ──────────────────────────────────────────────────────────────────────

describe("RD (Region Diversity)", () => {
  it("computes 25×OOS share + 5×OOC share", () => {
    const r = computeRd({
      studentStrength: [strength("UG [4 Years Program(s)]", 600, 400, 200, 10)],
    });
    // OOS=0.2 → 5; OOC=0.01 → 0.05; RD = 5.05
    expect(r.status).toBe("computed");
    expect(r.score).toBe(5.05);
    expect(r.steps.some((s) => s.equation.includes("25 × 0.2000 + 5 × 0.0100"))).toBe(true);
  });

  it("flags variance when enrolled PhD students lack a state/country breakup", () => {
    const r = computeRd({
      studentStrength: [strength("UG [4 Years Program(s)]", 600, 400, 200, 10)],
      phdDetails: { fullTime: 50, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
    });
    expect(r.flags.some((fl) => fl.message.includes("70 enrolled PhD students"))).toBe(true);
  });

  it("is unable when the Outside columns are blank", () => {
    const r = computeRd({
      studentStrength: [{ ...strength("UG [4 Years Program(s)]", 600, 400, 200, 10), outsideState: null }],
    });
    expect(r.status).toBe("unable");
  });
});

// ── Report assembly & contributions ─────────────────────────────────────────

describe("computeAbsolute report", () => {
  it("builds the summary table with contributions in overall-100 points", () => {
    const input: AbsoluteInput = {
      facultyRoster: faculty(60, "Professor"),
      studentStrength: [strength("UG [4 Years Program(s)]", 700, 300, 200, 10)],
      phdDetails: { fullTime: 80, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
      placementCohorts: [
        cohort("UG [4 Years Program(s)]", "2021-22", 1000, 900),
        cohort("UG [4 Years Program(s)]", "2020-21", 1000, 900),
        cohort("UG [4 Years Program(s)]", "2019-20", 1000, 900),
      ],
      pcsQuestions: pcsFull.pcsQuestions,
    };
    const rep = computeAbsolute(input, { category: "engineering", year: 2025, institution: { name: "Test" } });
    expect(rep.summary.totalMax).toBe(34);
    expect(rep.category).toBe("engineering");
    expect(rep.year).toBe(2025);
    expect(rep.institution?.name).toBe("Test");

    const gue = rep.subs.find((s) => s.key === "gue")!;
    // contribution = (subScore/maxMarks) × maxContribution
    expect(gue.contribution).toBe(3); // GUE max contribution = 15 × 0.2 = 3
    const gph = rep.subs.find((s) => s.key === "gph")!;
    // 3 cohorts of 1000 admitted, 900 placed + 10 higher studies → ratio 0.91
    // → fraction 0.91 → GPH 36.4 → contribution 36.4/40 × 8 = 7.28
    expect(gph.contribution).toBe(7.28);
    const wd = rep.subs.find((s) => s.key === "wd")!;
    const rd = rep.subs.find((s) => s.key === "rd")!;
    expect(rd.contribution).toBe(0.51); // 5.05/30 × 3 = 0.505 → rounds to 0.51
    void wd;
  });

  it("marks hasUnable and lists unable keys when tables are missing", () => {
    const rep = computeAbsolute({ facultySummary: 20 });
    expect(rep.summary.hasUnable).toBe(true);
    expect(rep.summary.unableKeys).toEqual(["fsr", "gue", "gph", "pcs", "fqe", "wd", "rd"]);
    expect(rep.summary.totalComputed).toBeLessThan(rep.summary.totalMax);;
  });
});