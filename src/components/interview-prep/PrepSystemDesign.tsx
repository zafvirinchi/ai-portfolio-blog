import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import QuestionAnswerCard from "./shared/QuestionAnswerCard";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepSystemDesign({ report }: Props) {
  if (report.systemDesignQuestions.length === 0) {
    return <p className="text-sm text-slate-400">No system design questions generated.</p>;
  }

  return (
    <div className="space-y-3">
      {report.systemDesignQuestions.map((item, index) => (
        <QuestionAnswerCard key={index} question={item.question} badge={item.difficulty} answer={item.idealAnswer} />
      ))}
    </div>
  );
}
