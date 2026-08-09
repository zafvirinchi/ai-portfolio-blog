import { Resume } from "../resume/resume-schema";
import { FeaturedItem, FeaturedSuggestion } from "./linkedin-schema";

// Deterministic, no LLM call — "Featured" needs real links/items (a
// real GitHub URL, a real portfolio link, real project names), not
// creative writing. Builds suggestions directly from what the resume
// actually contains; flags gaps as actionable suggestions rather than
// ever inventing a URL.

export function computeFeaturedSuggestions(resume: Resume): FeaturedSuggestion {
  const items: FeaturedItem[] = [];

  if (resume.contact.github) {
    items.push({ type: "GitHub", title: "GitHub Profile", detail: resume.contact.github, isGap: false });
  } else {
    items.push({
      type: "GitHub",
      title: "Add your GitHub profile",
      detail: "No GitHub link found on the resume — add one to Featured if you have public repositories.",
      isGap: true,
    });
  }

  if (resume.contact.website) {
    items.push({ type: "Portfolio", title: "Portfolio Site", detail: resume.contact.website, isGap: false });
  } else {
    items.push({
      type: "Portfolio",
      title: "Add a portfolio link",
      detail: "No portfolio or personal site found on the resume.",
      isGap: true,
    });
  }

  for (const project of resume.projects.slice(0, 5)) {
    items.push({
      type: "Project",
      title: project.name,
      detail: project.description ?? project.technologies.join(", "),
      isGap: false,
    });
  }

  if (resume.certifications.length > 0) {
    for (const cert of resume.certifications) {
      items.push({ type: "Certification", title: cert.name, detail: cert.issuer ?? "", isGap: false });
    }
  } else {
    items.push({
      type: "Certification",
      title: "Add a certification",
      detail: "No certifications found on the resume.",
      isGap: true,
    });
  }

  items.push({
    type: "Blog",
    title: "Add blog posts or technical articles",
    detail: "Featured supports linking published writing — add any technical articles you've written.",
    isGap: true,
  });

  return { items };
}
