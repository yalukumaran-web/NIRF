import { describe, it, expect } from "vitest";
import {
  computeAbsolute,
  computeFsr,
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
      ...faculty(10, "Other"),
      ...faculty(5, "Professor", { working: false }),
    ],
    studentStrength: [strength("UG [4 Years Program(s)]", 480, 320, 50, 5)],
    phdDetails: { fullTime: 80, partTime: 20, graduatedFullTime: null, graduatedPartTime: null },
  };

  it("counts only teaching-designation ∩ currently-working rows as F", () => {
    const r = computeFsr(tmpl);
    const fStep = r.steps.find((s) => s.label === "F — teaching-faculty count");
    expect(fStep?.result).toBe(60);
    expect(r.flags.some((fl) => fl.message.includes('"Other"'))).toBe(true);
    expect(r.flags.some((fl) => fl.message.includes('"currently working" flag is "No"'))).toBe(true);
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
    const Nstep = rr.steps.find((s) => s.label === "N — total students (excl. lateral aggregation)");
    expect(Nstep?.equation).toContain("875");
    expect(rr.steps.length).toBeGreaterThan(3);
    // 4+ decimals carried in intermediate, 2 decimals on the final score
    expect(rr.steps.some((s) => s.equation.includes("0.9231"))).toBe(true);
  });

  it("caps at 30 when the ratio exceeds the limit and reports both values", () => {
    const r = computeFsr({
      ...tmpl,
      facultyRoster: [
        ...faculty(70, "Professor"),
        ...faculty(30, "Assistant Professor", { working: false }),
      ],
      studentStrength: [strength("UG [4 Years Program(s)]", 60, 40, 0, 0)],
      phdDetails: { fullTime: 0, partTime: 0, graduatedFullTime: null, graduatedPartTime: null },
    });
    // F=70 working, NT=100, Np=0 → ratio=15×70/100=10.5 → uncapped=315 → capped 30
    expect(r.status).toBe("computed");
    expect(r.score).toBe(30);
    expect(r.steps.some((s) => s.label.startsWith("cap"))).toBe(true);
    expect(r.steps.some((s) => s.equation.includes("315"))).toBe(true);
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
    expect(rep.summary.totalMax).toBe(26);
    expect(rep.category).toBe("engineering");
    expect(rep.year).toBe(2025);
    expect(rep.institution?.name).toBe("Test");

    const gue = rep.subs.find((s) => s.key === "gue")!;
    // contribution = (subScore/maxMarks) × maxContribution
    expect(gue.contribution).toBe(3); // GUE max contribution = 15 × 0.2 = 3
    const wd = rep.subs.find((s) => s.key === "wd")!;
    const rd = rep.subs.find((s) => s.key === "rd")!;
    expect(rd.contribution).toBe(0.51); // 5.05/30 × 3 = 0.505 → rounds to 0.51
    void wd;
  });

  it("marks hasUnable and lists unable keys when tables are missing", () => {
    const rep = computeAbsolute({ facultySummary: 20 });
    expect(rep.summary.hasUnable).toBe(true);
    expect(rep.summary.unableKeys).toEqual(["fsr", "gue", "pcs", "fqe", "wd", "rd"]);
    expect(rep.summary.totalComputed).toBeLessThan(rep.summary.totalMax);;
  });
});