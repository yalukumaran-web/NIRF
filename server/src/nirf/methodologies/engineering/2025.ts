/**
 * NIRF Engineering 2025 Methodology definition.
 *
 * Source of truth references:
 *   - NIRF Engineering framework: https://www.nirfindia.org/nirfpdfcdn/2025/framework/Engineering.pdf
 *   - NIRF 2025 results (published parameter scores):
 *       https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html
 *   - Standard NIRF data-submission (credentials) PDF layout as published per
 *     institution on the NIRF portal.
 *
 * IMPORTANT (source-of-truth rule):
 *   - Parameter codes, marks allocation and weights below are exactly as
 *     published by NIRF (TLR 100 @0.30, RP 100 @0.30, GO 100 @0.20,
 *     OI 100 @0.10, PR 100 @0.10).
 *   - NIRF publishes the structure of the sub-parameter formulae but the
 *     exact normalization function f() (and its saturation points) for many
 *     sub-metrics is not published. Where f() is undisclosed the
 *     implementation uses a calibrated linear/soft-cap approximation and is
 *     explicitly marked `calibrated_approximation`. It is NEVER presented as
 *     the official NIRF normalization.
 *
 * This module is the single configuration point; the calculation engine and
 * UI both read from it.
 */

import type { MethodologyDef } from "../../types";

export const engineering2025: MethodologyDef = {
  category: "engineering",
  year: 2025,
  version: "1.0",
  name: "NIRF Engineering 2025 Methodology",
  source:
    "https://www.nirfindia.org/nirfpdfcdn/2025/framework/Engineering.pdf ; " +
    "https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html",
  scoreScale: 100,
  finalScoreFormula:
    "FinalScore = 0.30×TLR + 0.30×RP + 0.20×GO + 0.10×OI + 0.10×PR",
  parameters: [
    {
      code: "TLR",
      label: "Teaching, Learning & Resources",
      officialName: "Teaching, Learning and Resources (TLR)",
      weight: 0.30,
      weightRef: "Official NIRF 2025 Engineering framework: weightage 30%",
      officiality: "official",
      subParameters: [
        {
          key: "ss",
          label: "Student Strength",
          officialName: "SS: Student Strength including Ph.D students",
          marks: 20,
          officiality: "calibrated_approximation",
          formula:
            "SS = f(NT, NE) × 15 + f(NP) × 5, where NT = sanctioned intake, NE = enrolled students, NP = Ph.D students",
          formulaRef:
            "Official framework lists SS (20 marks); the exact f() normalization is not published — calibrated approximation used.",
          normalization:
            "f(NT,NE) ≈ min(NE/NT, 1) fill-rate; f(NP) ≈ min(NP/500, 1) scaled so 500+ doctoral students saturate the Ph.D component.",
          inputFields: ["sanctionedIntake", "enrolledStudents", "phdStudents"],
          explanation:
            "Rewards full enrolment of sanctioned seats and a strong doctoral (research) student body.",
        },
        {
          key: "fsr",
          label: "Faculty-Student Ratio",
          officialName: "FSR: Faculty-Student Ratio (with emphasis on permanent faculty)",
          marks: 30,
          officiality: "official",
          formula:
            "FSR = 30 × min(15 × (F / (NT + NP)), 1)  [zero if F/(NT+NP) < 1/50]",
          formulaRef:
            "Official framework publishes FSR formula including the 1/50 minimum threshold.",
          normalization:
            "Linear in faculty-per-student ratio, saturated at a 15:1-equivalent ratio.",
          inputFields: ["permanentFaculty", "sanctionedIntake", "phdStudents"],
          explanation:
            "A higher ratio of permanent faculty to students (including Ph.D students) scores more.",
        },
        {
          key: "fqe",
          label: "Faculty Qualification & Experience",
          officialName: "FQE: Combined metric for Faculty with PhD (FQ) and Experience (FE)",
          marks: 20,
          officiality: "calibrated_approximation",
          formula:
            "FQE = FQ + FE; FQ = max(10 × (%PhD / 95), cap); FE = 3×min(3F1,1) + 3×min(3F2,1) + 4×min(3F3,1)",
          formulaRef:
            "Official framework publishes FQ (10 marks) and FE (10 marks) structure; saturation points approximated.",
          normalization:
            "%PhD normalized to a 95% saturation; experience bands F1 (0-8y), F2 (8-15y), F3 (>15y) weighted 3/3/4.",
          inputFields: [
            "permanentFaculty",
            "facultyWithPhD",
            "facultyExp0to8",
            "facultyExp8to15",
            "facultyExp15plus",
          ],
          explanation:
            "Rewards doctoral qualification and balanced senior faculty experience.",
        },
        {
          key: "fru",
          label: "Financial Resources and their Utilisation",
          officialName: "FRU: Financial Resources and their Utilisation",
          marks: 30,
          officiality: "calibrated_approximation",
          formula:
            "FRU = f((BC + BO + RF + CF) / totalStudents); sub-linear (soft-cap) normalization",
          formulaRef:
            "Official framework states FRU (30 marks) based on capital + operational expenditure per student; exact f() not published — calibrated soft-cap.",
          normalization:
            "Per-student total resource utilisation mapped through a sub-linear scale (cap ~31.9L/student).",
          inputFields: [
            "capitalExpenditure",
            "operationalExpenditure",
            "sponsoredResearchAmount",
            "consultancyRevenue",
            "enrolledStudents",
            "phdStudents",
          ],
          explanation:
            "Rewards investment in infrastructure and learning resources per student.",
        },
      ],
    },
    {
      code: "RP",
      label: "Research and Professional Practice",
      officialName: "Research and Professional Practice (RP)",
      weight: 0.30,
      weightRef: "Official NIRF 2025 Engineering framework: weightage 30%",
      officiality: "official",
      subParameters: [
        {
          key: "pu",
          label: "Publications",
          officialName: "PU: Publications",
          marks: 35,
          officiality: "calibrated_approximation",
          formula:
            "PU = 35 × f(P / FRQ) − 5 × f(Pret / FRQ),  FRQ = required faculty = max(N/15, F)",
          formulaRef:
            "Official framework publishes PU = 35×f(P/FRQ) − 5×f(Pret/FRQ); f() saturation calibrated.",
          normalization:
            "Publications per required-faculty (FRQ) mapped via min(x,1); retractions impose a penalty.",
          inputFields: ["totalPublications", "retractedPapers", "permanentFaculty", "sanctionedIntake", "phdStudents"],
          explanation:
            "Rewards publications scaled per research-capable faculty, penalising retractions.",
        },
        {
          key: "qp",
          label: "Quality of Publications",
          officialName: "QP: Quality of Publications (citations / top-25% journals)",
          marks: 40,
          officiality: "calibrated_approximation",
          formula:
            "QP = 20 × f(CC/FRQ) + 20 × f(TOP25P/P) − 5 × f(Cret/FRQ)",
          formulaRef:
            "Official framework publishes QP = 20×f(CC/FRQ) + 20×f(TOP25P/P) − 5×f(Cret/FRQ); f() saturation calibrated.",
          normalization:
            "Citations per required faculty + share of citations in top-25% journals; retraction-citation penalty.",
          inputFields: ["totalCitations", "top25Citations", "retractedCitations", "totalPublications", "permanentFaculty"],
          explanation:
            "Rewards citation impact and publication in high-impact journals.",
        },
        {
          key: "ipr",
          label: "IPR and Patents",
          officialName: "IPR: Intellectual Property Rights and Patents",
          marks: 15,
          officiality: "calibrated_approximation",
          formula: "IPR = 10 × f(IPG) + 5 × f(IPP)",
          formulaRef:
            "Official framework publishes IPR structure (10 granted + 5 filed); absolute saturation calibrated.",
          normalization:
            "Patents granted (10) and filed/published (5) normalized with absolute soft caps.",
          inputFields: ["patentsGranted", "patentsFiled"],
          explanation: "Rewards both granted patents and filed/published applications.",
        },
        {
          key: "fppp",
          label: "Projects and Professional Practice",
          officialName: "FPPP: Combined metric for Financial (sponsored + consultancy) Projects and Professional Practice",
          marks: 10,
          officiality: "calibrated_approximation",
          formula: "FPPP = 7.5 × f(RF/FRQ) + 2.5 × f(CF/FRQ)",
          formulaRef:
            "Official framework publishes FPPP structure (sponsored 7.5 + consultancy 2.5); f() saturation calibrated.",
          normalization:
            "Sponsored research funds (RF) and consultancy revenue (CF) per required faculty.",
          inputFields: ["sponsoredResearchAmount", "consultancyRevenue", "permanentFaculty"],
          explanation:
            "Rewards externally funded research and consultancy activity.",
        },
      ],
    },
    {
      code: "GO",
      label: "Graduation Outcomes",
      officialName: "Graduation Outcome (GO)",
      weight: 0.20,
      weightRef: "Official NIRF 2025 Engineering framework: weightage 20%",
      officiality: "official",
      subParameters: [
        {
          key: "gph",
          label: "Placement & Higher Studies",
          officialName: "GPH: Placement and Higher Studies",
          marks: 40,
          officiality: "calibrated_approximation",
          formula: "GPH = 40 × g((Np + Nhs)/NT), where g() is the official (unpublished) normalization",
          formulaRef:
            "Official framework publishes GPH (40 marks) based on (Np + Nhs)/NT against reference values; g() not fully published — calibrated (c≈0.89, p≈1.05).",
          normalization:
            "Placement + higher-studies share of sanctioned intake mapped through (r/c)^p.",
          inputFields: ["graduatesPlaced", "graduatesHigherStudies", "sanctionedIntake"],
          explanation:
            "Rewards the proportion of graduates placed or pursuing higher studies.",
        },
        {
          key: "gue",
          label: "University Examinations",
          officialName: "GUE: Metric for University Examinations",
          marks: 15,
          officiality: "calibrated_approximation",
          formula: "GUE = 15 × min(Ng / (0.8 × NT), 1)",
          formulaRef:
            "Official framework publishes GUE based on graduates completing in time relative to intake (approx. 80% threshold).",
          normalization:
            "Graduates in stipulated time (Ng) relative to 80% of sanctioned intake.",
          inputFields: ["graduatesInTime", "sanctionedIntake"],
          explanation: "Rewards on-time completion of programmes.",
        },
        {
          key: "gms",
          label: "Median Salary",
          officialName: "GMS: Combined metric for Placement Median Salary",
          marks: 25,
          officiality: "calibrated_approximation",
          formula: "GMS = 25 × f(MS)",
          formulaRef:
            "Official framework publishes GMS (25 marks) based on median salary; saturation (~20L) calibrated.",
          normalization:
            "Median salary normalized with a soft cap at ~₹20 lakh/year.",
          inputFields: ["medianSalary"],
          explanation: "Rewards the median salary of placed graduates.",
        },
        {
          key: "gphd",
          label: "PhD Graduates",
          officialName: "GPHD: PhD Student Graduated",
          marks: 20,
          officiality: "calibrated_approximation",
          formula: "GPHD = 20 × f(Nphd)",
          formulaRef:
            "Official framework publishes GPHD (20 marks) based on PhD graduates (3-year window); saturation (~200) calibrated.",
          normalization:
            "Number of PhD graduates normalized with a soft cap.",
          inputFields: ["phdGraduates"],
          explanation: "Rewards production of PhD graduates.",
        },
      ],
    },
    {
      code: "OI",
      label: "Outreach and Inclusivity",
      officialName: "Outreach and Inclusivity (OI)",
      weight: 0.10,
      weightRef: "Official NIRF 2025 Engineering framework: weightage 10%",
      officiality: "official",
      subParameters: [
        {
          key: "rd",
          label: "Region Diversity",
          officialName: "RD: Region Diversity",
          marks: 30,
          officiality: "calibrated_approximation",
          formula: "RD = 25 × f(otherStates/total) + 5 × f(otherCountries/total)",
          formulaRef:
            "Official framework publishes RD (30 marks) split 25 (other states) + 5 (other countries); f() calibrated.",
          normalization:
            "Share of students from other states (25) and other countries (5).",
          inputFields: ["studentsOtherStates", "studentsOtherCountries", "enrolledStudents"],
          explanation: "Rewards national and international diversity of the student body.",
        },
        {
          key: "wd",
          label: "Women Diversity",
          officialName: "WD: Women Diversity",
          marks: 30,
          officiality: "calibrated_approximation",
          formula:
            "WD = A × f(NWS/(TWS×total)) + B × f(NWF/(TWF×F))  [A=14.4, B=15.6, TWS≈0.56, TWF≈0.20]",
          formulaRef:
            "Official framework publishes WD (30 marks) from women-student and women-faculty shares; exact coefficients calibrated from published OI scores.",
          normalization:
            "Women-student share (target ≈ 56%) weighted 14.4 and women-faculty share (target ≈ 20%) weighted 15.6.",
          inputFields: ["womenStudents", "womenFaculty", "enrolledStudents", "permanentFaculty"],
          explanation: "Rewards gender diversity of students and faculty.",
        },
        {
          key: "escs",
          label: "Economically & Socially Challenged",
          officialName: "ESCS: Students from Economically and Socially Challenged Sections",
          marks: 20,
          officiality: "calibrated_approximation",
          formula: "ESCS = 20 × f(Nesc / (share × total)), share ≈ 0.268",
          formulaRef:
            "Official framework publishes ESCS (20 marks); reference share approximated.",
          normalization:
            "Share of ESCS students relative to a reference enrolment share.",
          inputFields: ["escsStudents", "enrolledStudents"],
          explanation: "Rewards enrolment of economically and socially challenged students.",
        },
        {
          key: "pcs",
          label: "Facilities for Physically Challenged",
          officialName: "PCS: Facilities for Physically Challenged",
          marks: 20,
          officiality: "calibrated_approximation",
          formula: "PCS = 20 if facilities checklist complete, else 0",
          formulaRef:
            "Official framework publishes PCS (20 marks) as a facilities checklist; binary treatment is an approximation.",
          normalization: "Ratio of affirmative checklist items for physically-challenged facilities.",
          inputFields: ["pcsFacilities"],
          explanation: "Rewards availability of facilities for persons with disabilities.",
        },
      ],
    },
    {
      code: "PR",
      label: "Perception",
      officialName: "Perception (PR)",
      weight: 0.10,
      weightRef: "Official NIRF 2025 Engineering framework: weightage 10%",
      officiality: "official",
      subParameters: [
        {
          key: "pr",
          label: "Peer & Employer Perception",
          officialName: "PR: Perception (Academic Peer + Employer)",
          marks: 100,
          officiality: "official",
          formula: "PR = Perception (0-100) from peer and employer surveys",
          formulaRef:
            "Official framework publishes PR as the perception score from surveys; not part of submitted credentials.",
          normalization: "Published NIRF perception score used as-is (0-100).",
          inputFields: ["perceptionScore"],
          explanation:
            "Reputation measured by academic peers and employers. Not extractable from the credentials PDF — supplied from NIRF publications or user input.",
        },
      ],
    },
  ],
  fields: [], // fields live in the (category) field catalog; referenced for the engine
  notes: [
    "RP is published by NIRF as 'RPC' (Research and Professional Practice) in 2025 results; the application uses RP.",
    "NIRF does not publicly disclose the complete f() normalization function. Sub-metrics marked 'calibrated_approximation' use data-calibrated approximations and must be labelled as such in the UI/report.",
    "Perception (PR) is not part of the institution data-submission PDF. If unknown, it should be entered manually or left out (resulting in a partial calculation).",
  ],
};