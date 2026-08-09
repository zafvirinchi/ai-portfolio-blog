import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import QuestionAnswerCard from "./shared/QuestionAnswerCard";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepProjectQuestions({ report }: Props) {
  if (report.projectQuestions.length === 0) {
    return <p className="text-sm text-slate-400">No project questions generated — no projects were listed on the resume.</p>;
  }

  return (
    <div className="space-y-3">
      {report.projectQuestions.map((item, index) => (
        <QuestionAnswerCard
          key={index}
          question={item.question}
          badge={`${item.projectName} · ${item.focus}`}
          answer={item.idealAnswer}
        />
      ))}
    </div>
  );
}
