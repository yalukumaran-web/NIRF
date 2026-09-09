/**
 * Adapters: build the AbsoluteInput tables from an ExtractedNirf payload
 * (the output of nirfExtractor) so the absolute engine can be fed directly
 * from the PDF pipeline.
 *
 * Discipline: the adapter copies row-level detail VERBATIM. When a detail
 * table is absent from the payload, the field is left empty and the engine
 * reports the missing source table — the adapter never manufactures rows.
 */

import type { ExtractedNirf } from "../../nirfExtractor";
import type {
  AbsoluteInput,
  FacultyRosterRow,
  PcsQuestion,
  PhdDetails,
  PlacementCohort,
  ProgramStrengthRow,
} from "./types";

/** Roster rows are already in the engine's shape. */
function rosterFrom(e: ExtractedNirf): FacultyRosterRow[] | undefined {
  return e.facultyRoster;
}

function strengthFrom(e: ExtractedNirf): ProgramStrengthRow[] | undefined {
  return e.studentStrengthRows;
}

function phdFrom(e: ExtractedNirf): PhdDetails | undefined {
  if (!e.phdDetails && !e.phdStudents && !e.phdGraduates) return undefined;
  return {
    fullTime: e.phdDetails?.fullTime ?? null,
    partTime: e.phdDetails?.partTime ?? null,
    graduatedFullTime: e.phdDetails?.graduatedFullTime ?? null,
    graduatedPartTime: e.phdDetails?.graduatedPartTime ?? null,
  };
}

function cohortsFrom(e: ExtractedNirf): PlacementCohort[] {
  return e.placementCohorts ?? [];
}

function pcsFrom(e: ExtractedNirf): PcsQuestion[] {
  return e.pcsQuestions ?? [];
}

/**
 * Build AbsoluteInput from the extracted payload. `facultySummary` mirrors the
 * "Number of faculty members entered" summary count and is ONLY surfaced when
 * the row-wise roster is absent (the engine uses it purely diagnostically and
 * still refuses roster-dependent formulas that need the designation filter).
 */
export function absoluteInputFromExtracted(e: ExtractedNirf): AbsoluteInput {
  const roster = rosterFrom(e);
  return {
    facultyRoster: roster,
    facultySummary:
      roster && roster.length > 0
        ? null
        : typeof e.permanentFaculty === "number"
          ? e.permanentFaculty
          : null,
    studentStrength: strengthFrom(e),
    phdDetails: phdFrom(e),
    placementCohorts: cohortsFrom(e),
    pcsQuestions: pcsFrom(e),
    coverageNote:
      "Assembled from the NIRF DCS extraction payload. Row-level tables (faculty roster, student-strength rows, PhD details, placement cohorts, PCS questions) are copied verbatim when present; otherwise left absent so the engine reports the exact missing source table.",
  };
}

/** Build AbsoluteInput directly from complete table objects (manual entry). */
export function absoluteInputFromTables(tables: AbsoluteInput): AbsoluteInput {
  return {
    facultyRoster: tables.facultyRoster,
    facultySummary: tables.facultySummary ?? null,
    studentStrength: tables.studentStrength,
    phdDetails: tables.phdDetails,
    placementCohorts: tables.placementCohorts ?? [],
    pcsQuestions: tables.pcsQuestions ?? [],
    coverageNote: tables.coverageNote ?? "Supplied as complete table objects.",
  };
}

export { rosterFrom, strengthFrom, phdFrom, cohortsFrom, pcsFrom };