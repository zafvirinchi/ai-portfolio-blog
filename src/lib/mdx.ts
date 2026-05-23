import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

export type BlogFrontmatter = {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
};

export type BlogPostMeta = BlogFrontmatter & {
  readingTime: string;
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

const blogDirectory = path.join(process.cwd(), "src/content/blog");

function getMdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir).filter((file) => file.endsWith(".mdx"));
}

export function getAllPosts(): BlogPostMeta[] {
  const files = getMdxFiles(blogDirectory);

  const posts = files.map((file) => {
    const fullPath = path.join(blogDirectory, file);
    const source = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(source);

    const frontmatter = data as BlogFrontmatter;

    return {
      ...frontmatter,
      readingTime: readingTime(content).text,
    };
  });

  return posts.sort((a, b) => {
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });
}

export function getPostBySlug(slug: string): BlogPost | null {
  const files = getMdxFiles(blogDirectory);

  for (const file of files) {
    const fullPath = path.join(blogDirectory, file);
    const source = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(source);

    const frontmatter = data as BlogFrontmatter;

    if (frontmatter.slug === slug) {
      return {
        ...frontmatter,
        content,
        readingTime: readingTime(content).text,
      };
    }
  }

  return null;
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tags = posts.flatMap((post) => post.tags);

  return Array.from(new Set(tags)).sort();
}

export function getPostsByTag(tag: string): BlogPostMeta[] {
  return getAllPosts().filter((post) =>
    post.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
  );
}

export function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit = 3
): BlogPostMeta[] {
  const posts = getAllPosts().filter((post) => post.slug !== currentSlug);

  const scored = posts.map((post) => {
    const commonTags = post.tags.filter((tag) =>
      tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
    ).length;

    return {
      post,
      score: commonTags,
    };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.post);
}