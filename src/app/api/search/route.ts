import { NextResponse } from "next/server";
import { getBlogPosts, getInterviewCategories, getInterviewQuestionsByCategory } from "@/lib/mdx";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase() || "";

  const blogPosts = getBlogPosts().map((post) => ({
    type: "blog",
    title: post.title,
    slug: `/blog/${post.slug}`,
    excerpt: post.excerpt,
    tags: post.tags,
  }));

  const interviewQuestions = getInterviewCategories().flatMap((category) =>
    getInterviewQuestionsByCategory(category).map((question) => ({
      type: "interview",
      title: question.title,
      slug: `/interview-questions/${category}/${question.slug}`,
      excerpt: `${question.level} level question`,
      tags: question.tags,
    }))
  );

  const allResults = [...blogPosts, ...interviewQuestions];

  const filteredResults = allResults.filter((item) => {
    const searchableText = `${item.title} ${item.excerpt} ${item.tags.join(" ")}`.toLowerCase();
    return searchableText.includes(query);
  });

  return NextResponse.json({
    results: query ? filteredResults : allResults,
  });
}