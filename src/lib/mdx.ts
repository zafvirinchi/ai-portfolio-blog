import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const contentDir = path.join(process.cwd(), "src/content");

export function getBlogPosts() {
  const blogDir = path.join(contentDir, "blog");

  if (!fs.existsSync(blogDir)) return [];

  return fs.readdirSync(blogDir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const filePath = path.join(blogDir, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(fileContent);

      return {
        slug: file.replace(".mdx", ""),
        title: data.title,
        excerpt: data.excerpt,
        date: data.date,
        tags: data.tags || [],
        content,
        readingTime: readingTime(content).text,
      };
    });
}

export function getBlogPostBySlug(slug: string) {
  return getBlogPosts().find((post) => post.slug === slug);
}

export function getInterviewCategories() {
  const baseDir = path.join(contentDir, "interview-questions");

  if (!fs.existsSync(baseDir)) return [];

  return fs.readdirSync(baseDir).filter((folder) => {
    return fs.statSync(path.join(baseDir, folder)).isDirectory();
  });
}

export function getInterviewQuestionsByCategory(category: string) {
  const categoryDir = path.join(contentDir, "interview-questions", category);

  if (!fs.existsSync(categoryDir)) return [];

  return fs.readdirSync(categoryDir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const filePath = path.join(categoryDir, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(fileContent);

      return {
        slug: file.replace(".mdx", ""),
        category,
        title: data.title,
        level: data.level,
        tags: data.tags || [],
        content,
      };
    });
}

export function getInterviewQuestion(category: string, slug: string) {
  return getInterviewQuestionsByCategory(category).find(
    (question) => question.slug === slug
  );
}