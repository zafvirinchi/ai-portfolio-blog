import { Project } from "@/types/project";

export const projects: Project[] = [
  {
    slug: "java-17-migration",
    title: "Java 8 to Java 17 Migration",
    description:
      "Migrated a legacy Java application to Java 17 by resolving dependency issues, deprecated APIs, security updates and performance problems.",
    techStack: ["Java", "Spring Boot", "Maven", "JUnit"],
  },
  {
    slug: "aws-file-upload-system",
    title: "AWS File Upload System",
    description:
      "Built a secure file upload and download system using AWS S3, Lambda and backend APIs.",
    techStack: ["AWS", "S3", "Lambda", "Node.js", "NestJS"],
  },
  {
    slug: "microservices-kafka-platform",
    title: "Event-Driven Microservices Platform",
    description:
      "Designed asynchronous communication between microservices using Kafka for better scalability and reliability.",
    techStack: ["Spring Boot", "Kafka", "Microservices", "PostgreSQL"],
  },
];