import { z } from "zod";

// Phase 13 — Resume Version Management. API request-body validation
// schemas, matching every other package's *-schema.ts convention.

export const createVersionSchema = z.object({
  resumeId: z.string().uuid().optional(),
  sourceVersionId: z.string().uuid().optional(),
  versionName: z.string().trim().min(1).max(200).optional(),
  targetJobTitle: z.string().trim().max(200).optional(),
  targetCompany: z.string().trim().max(200).optional(),
  targetLocation: z.string().trim().max(200).optional(),
  jobDescriptionText: z.string().trim().min(1).max(20_000).optional(),
});

export const updateVersionSchema = z.object({
  versionName: z.string().trim().min(1).max(200).optional(),
  targetJobTitle: z.string().trim().max(200).nullable().optional(),
  targetCompany: z.string().trim().max(200).nullable().optional(),
  targetLocation: z.string().trim().max(200).nullable().optional(),
});

export const duplicateVersionSchema = z.object({
  versionName: z.string().trim().min(1).max(200).optional(),
});

export const compareVersionsSchema = z.object({
  versionAId: z.string().uuid(),
  versionBId: z.string().uuid(),
});

export const applyJdOptimizationSchema = z.object({
  jobDescriptionText: z.string().trim().min(1).max(20_000),
});
