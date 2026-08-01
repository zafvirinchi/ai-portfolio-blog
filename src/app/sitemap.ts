import type { MetadataRoute } from "next";
import { getPublishedBlogs } from "@/lib/admin/blog-service";
import { getInterviewCategories } from "@/lib/admin/interview-category-service";
import { getTopicsByCategory } from "@/lib/admin/interview-topic-service";

const SITE_URL = "https://zafrultechstack.com";

const STATIC_ROUTES = [
  "",
  "/about",
  "/blog",
  "/contact",
  "/interview-questions",
  "/interview-questions/chat",
  "/projects",
  "/resume-analyzer",
  "/ai",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));

  const blogs = await getPublishedBlogs();

  const blogEntries: MetadataRoute.Sitemap = blogs.map((blog) => ({
    url: `${SITE_URL}/blog/${blog.slug}`,
    lastModified: blog.updated_at ? new Date(blog.updated_at) : undefined,
  }));

  const categories = await getInterviewCategories();

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${SITE_URL}/interview-questions/${category.slug}`,
    lastModified: category.updated_at ? new Date(category.updated_at) : undefined,
  }));

  const topicsByCategory = await Promise.all(
    categories.map((category) => getTopicsByCategory(category.slug))
  );

  const topicEntries: MetadataRoute.Sitemap = categories.flatMap((category, index) =>
    topicsByCategory[index].map((topic) => ({
      url: `${SITE_URL}/interview-questions/${category.slug}/${topic.slug}`,
      lastModified: topic.updated_at ? new Date(topic.updated_at) : undefined,
    }))
  );

  return [...staticEntries, ...blogEntries, ...categoryEntries, ...topicEntries];
}
