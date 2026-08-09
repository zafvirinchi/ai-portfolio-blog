import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  report: InterviewPreparationReport;
};

const SUB_SCORES: { key: keyof InterviewPreparationReport["readinessScore"]; label: string }[] = [
  { key: "resumeQuality", label: "Resume Quality" },
  { key: "jdMatch", label: "JD Match" },
  { key: "missingSkillsPenalty", label: "Skill Coverage" },
  { key: "projectsScore", label: "Projects" },
  { key: "experienceScore", label: "Experience" },
  { key: "atsScore", label: "ATS" },
  { key: "knowledgeBaseCoverage", label: "Knowledge Base Coverage" },
];

export default function PrepOverview({ report }: Props) {
  const { readinessScore } = report;

  const stats = [
    { label: "Technical Questions", value: report.technicalQuestions.length },
    { label: "HR Questions", value: report.hrQuestions.length },
    { label: "Project Questions", value: report.projectQuestions.length },
    { label: "System Design", value: report.systemDesignQuestions.length },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Interview Readiness Score</p>
        <p className="mt-1 text-4xl font-bold text-slate-900">{readinessScore.overall}/100</p>

        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${readinessScore.overall}%` }} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {SUB_SCORES.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">{label}</span>
                <span className="font-semibold text-slate-900">{readinessScore[key]}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${readinessScore[key]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
