import { InterviewPreparationReport } from "./prep-schema";

export interface PrepGenerateInput {
  resumeId: string;
  jdMatchId: string;
}

export interface PrepRecord {
  prepId: string;
  resumeId: string;
  jdMatchId: string;
  report: InterviewPreparationReport;
  createdAt: string;
}
