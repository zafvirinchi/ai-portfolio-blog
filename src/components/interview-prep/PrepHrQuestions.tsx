import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import QuestionAnswerCard from "./shared/QuestionAnswerCard";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepHrQuestions({ report }: Props) {
  if (report.hrQuestions.length === 0) {
    return <p className="text-sm text-slate-400">No HR questions generated.</p>;
  }

  return (
    <div className="space-y-3">
      {report.hrQuestions.map((item, index) => (
        <QuestionAnswerCard key={index} question={item.question} badge={item.category} answer={item.idealAnswer} />
      ))}
    </div>
  );
}
