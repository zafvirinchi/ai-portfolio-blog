export type InterviewQuestion = {
  slug: string;
  category: string;
  title: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  tags: string[];
  content: string;
};