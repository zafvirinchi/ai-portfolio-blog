import { Resume, SkillGap } from "./resume-schema";

// Skill-gap matching is a taxonomy comparison (candidate skills vs. a
// reference list per category), not a judgment call — so, like scoring,
// it's implemented deterministically rather than as an LLM call. This
// mirrors the keyword-matching approach already used by ToolSelector
// (tools/tool-selector.ts) elsewhere in this codebase.

interface SkillCategory {
  key: keyof Pick<
    SkillGap,
    | "missingJavaSkills"
    | "missingSpringSkills"
    | "missingCloudSkills"
    | "missingDevOpsSkills"
    | "missingAiSkills"
    | "missingDatabaseSkills"
  >;
  label: string;
  referenceSkills: string[];
  courses: string[];
  certifications: string[];
  projects: string[];
}

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    key: "missingJavaSkills",
    label: "Java",
    referenceSkills: [
      "java",
      "java 8",
      "java 11",
      "java 17",
      "collections",
      "multithreading",
      "concurrency",
      "streams api",
      "lambda expressions",
      "generics",
      "exception handling",
      "jvm",
    ],
    courses: ["Java Programming Masterclass (Udemy)", "Java Multithreading, Concurrency (Udemy)"],
    certifications: ["Oracle Certified Professional: Java SE Developer"],
    projects: [
      "Build a multithreaded task scheduler using Java's ExecutorService",
      "Implement a generic in-memory cache with LRU eviction in core Java",
    ],
  },
  {
    key: "missingSpringSkills",
    label: "Spring",
    referenceSkills: [
      "spring boot",
      "spring mvc",
      "spring security",
      "spring data jpa",
      "spring cloud",
      "hibernate",
      "rest api",
      "microservices",
      "dependency injection",
    ],
    courses: ["Spring Boot Microservices with Spring Cloud (Udemy)", "Spring Security Core Guide"],
    certifications: ["VMware Spring Professional Certification"],
    projects: [
      "Build a REST API with Spring Boot + Spring Data JPA backed by PostgreSQL",
      "Add JWT-based authentication to a Spring Boot service with Spring Security",
    ],
  },
  {
    key: "missingCloudSkills",
    label: "Cloud",
    referenceSkills: [
      "aws",
      "azure",
      "gcp",
      "google cloud",
      "ec2",
      "s3",
      "lambda",
      "cloudformation",
      "terraform",
      "cloud architecture",
    ],
    courses: ["AWS Certified Solutions Architect prep course", "Terraform for Beginners"],
    certifications: ["AWS Certified Solutions Architect – Associate", "Microsoft Azure Fundamentals (AZ-900)"],
    projects: [
      "Deploy a containerized app to AWS ECS/Fargate behind an Application Load Balancer",
      "Provision cloud infrastructure for a small app using Terraform",
    ],
  },
  {
    key: "missingDevOpsSkills",
    label: "DevOps",
    referenceSkills: [
      "docker",
      "kubernetes",
      "jenkins",
      "ci/cd",
      "github actions",
      "gitlab ci",
      "ansible",
      "helm",
    ],
    courses: ["Docker & Kubernetes: The Complete Guide", "CI/CD with GitHub Actions"],
    certifications: ["Certified Kubernetes Administrator (CKA)", "Docker Certified Associate"],
    projects: [
      "Containerize an existing app with Docker and orchestrate it with Kubernetes",
      "Set up a full CI/CD pipeline with GitHub Actions that builds, tests, and deploys automatically",
    ],
  },
  {
    key: "missingAiSkills",
    label: "AI",
    referenceSkills: [
      "machine learning",
      "artificial intelligence",
      "langchain",
      "langgraph",
      "openai",
      "llm",
      "rag",
      "vector database",
      "nlp",
      "tensorflow",
      "pytorch",
    ],
    courses: ["LangChain & LLM App Development", "Machine Learning Specialization (Coursera)"],
    certifications: ["AWS Certified Machine Learning – Specialty"],
    projects: [
      "Build a RAG chatbot over your own documents using LangChain/LangGraph and a vector database",
      "Fine-tune or prompt-engineer an LLM to perform a domain-specific classification task",
    ],
  },
  {
    key: "missingDatabaseSkills",
    label: "Database",
    referenceSkills: [
      "sql",
      "mysql",
      "postgresql",
      "mongodb",
      "redis",
      "oracle",
      "nosql",
      "database design",
      "indexing",
    ],
    courses: ["The Complete SQL Bootcamp", "MongoDB for Developers"],
    certifications: ["Oracle Database SQL Certified Associate", "MongoDB Certified Developer"],
    projects: [
      "Design and normalize a relational schema for a real application, then optimize slow queries with indexes",
      "Model the same domain in both PostgreSQL and MongoDB to compare relational vs. document design",
    ],
  },
];

function candidateSkillText(resume: Resume): string {
  return [...resume.skills, ...resume.technicalSkills].join(" | ").toLowerCase();
}

function findMissing(referenceSkills: string[], candidateText: string): string[] {
  return referenceSkills.filter((skill) => !candidateText.includes(skill.toLowerCase()));
}

export class ResumeSuggestionsEngine {
  analyzeSkillGap(resume: Resume): SkillGap {
    const candidateText = candidateSkillText(resume);

    const missingByCategory = new Map<SkillCategory["key"], string[]>();
    const gapCategories: SkillCategory[] = [];

    for (const category of SKILL_CATEGORIES) {
      const missing = findMissing(category.referenceSkills, candidateText);
      missingByCategory.set(category.key, missing);

      // Only recommend courses/certs/projects for categories with a real,
      // meaningful gap (more than a token or two missing), so a candidate
      // strong in Java doesn't get noisy "learn Java" recommendations.
      if (missing.length >= Math.ceil(category.referenceSkills.length / 2)) {
        gapCategories.push(category);
      }
    }

    const recommendedCourses = gapCategories.flatMap((category) => category.courses);
    const recommendedCertifications = gapCategories.flatMap((category) => category.certifications);
    const recommendedProjects = gapCategories.flatMap((category) => category.projects);

    return {
      missingJavaSkills: missingByCategory.get("missingJavaSkills") ?? [],
      missingSpringSkills: missingByCategory.get("missingSpringSkills") ?? [],
      missingCloudSkills: missingByCategory.get("missingCloudSkills") ?? [],
      missingDevOpsSkills: missingByCategory.get("missingDevOpsSkills") ?? [],
      missingAiSkills: missingByCategory.get("missingAiSkills") ?? [],
      missingDatabaseSkills: missingByCategory.get("missingDatabaseSkills") ?? [],
      recommendedCourses,
      recommendedCertifications,
      recommendedProjects,
    };
  }
}

export const resumeSuggestionsEngine = new ResumeSuggestionsEngine();
