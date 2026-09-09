import { z } from "zod";

/** All raw-metric fields that can be submitted from the UI (after extraction/confirmation). */
export const rawMetricsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  // TLR
  sanctionedIntake: z.number().nullable().optional(),
  enrolledStudents: z.number().nullable().optional(),
  phdStudents: z.number().nullable().optional(),
  permanentFaculty: z.number().nullable().optional(),
  facultyWithPhD: z.number().nullable().optional(),
  facultyExp0to8: z.number().nullable().optional(),
  facultyExp8to15: z.number().nullable().optional(),
  facultyExp15plus: z.number().nullable().optional(),
  capitalExpenditure: z.number().nullable().optional(),
  operationalExpenditure: z.number().nullable().optional(),
  // RP
  totalPublications: z.number().nullable().optional(),
  totalCitations: z.number().nullable().optional(),
  top25Citations: z.number().nullable().optional(),
  patentsFiled: z.number().nullable().optional(),
  patentsGranted: z.number().nullable().optional(),
  sponsoredResearchAmount: z.number().nullable().optional(),
  consultancyRevenue: z.number().nullable().optional(),
  retractedPapers: z.number().nullable().optional(),
  retractedCitations: z.number().nullable().optional(),
  // GO
  graduatesPlaced: z.number().nullable().optional(),
  graduatesHigherStudies: z.number().nullable().optional(),
  graduatesInTime: z.number().nullable().optional(),
  medianSalary: z.number().nullable().optional(),
  phdGraduates: z.number().nullable().optional(),
  // OI
  womenStudents: z.number().nullable().optional(),
  womenFaculty: z.number().nullable().optional(),
  studentsOtherStates: z.number().nullable().optional(),
  studentsOtherCountries: z.number().nullable().optional(),
  escsStudents: z.number().nullable().optional(),
  pcsFacilities: z.boolean().nullable().optional(),
  // PR
  perceptionScore: z.number().min(0).max(100).nullable().optional(),
});

export type RawMetricsInput = z.infer<typeof rawMetricsSchema>;

export const categorySchema = z.enum([
  "overall",
  "engineering",
  "university",
  "management",
  "pharmacy",
  "medical",
  "architecture",
]);
