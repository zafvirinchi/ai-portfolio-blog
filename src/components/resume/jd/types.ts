import type { JobDescription, JdMatchResult } from "@/lib/ai/job-description/jd-schema";

// What POST /api/ai/resume/jd-match returns: jdMatchId + jobDescription at
// the top level, plus every JdMatchResult field flattened alongside them.
export interface JdMatchApiResult extends JdMatchResult {
  jdMatchId: string;
  jobDescription: JobDescription;
}
