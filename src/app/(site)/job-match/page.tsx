import type { Metadata } from "next";
import JobMatchPageClient from "./JobMatchPageClient";

export const metadata: Metadata = {
  title: "AI Job Match — Resume vs. Job Description Analysis",
  description:
    "Upload your resume and a job description to get an instant AI match score, missing skills and keywords, experience gaps, and a prioritized improvement plan.",
};

export default function JobMatchPage() {
  return <JobMatchPageClient />;
}
