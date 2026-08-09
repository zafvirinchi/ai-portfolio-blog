import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import QuestionAnswerCard from "./shared/QuestionAnswerCard";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepTechnicalQuestions({ report }: Props) {
  if (report.technicalQuestions.length === 0) {
    return <p className="text-sm text-slate-400">No technical questions generated.</p>;
  }

  return (
    <div className="space-y-3">
      {report.technicalQuestions.map((item, index) => {
        const isKnowledgeBase = "source" in item;

        return (
          <QuestionAnswerCard
            key={index}
            question={item.question}
            badge={`${item.difficulty} · ${item.topic}${isKnowledgeBase ? " · Knowledge Base" : " · AI Generated"}`}
            answer={isKnowledgeBase ? item.answer : item.idealAnswer}
          />
        );
      })}
    </div>
  );
}
