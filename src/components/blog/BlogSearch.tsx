"use client";

import { useState } from "react";
import BlogCard from "@/components/blog/BlogCard";
import SearchBox from "@/components/ui/SearchBox";
import { Blog } from "@/types/blog";

type BlogSearchProps = {
  posts: Blog[];
};

export default function BlogSearch({ posts }: BlogSearchProps) {
  const [query, setQuery] = useState("");

  const filteredPosts = posts.filter((post) => {
    const tagsText = post.tags?.join(" ") || "";

    const text =
      `${post.title} ${post.excerpt ?? ""} ${tagsText}`.toLowerCase();

    return text.includes(query.toLowerCase());
  });

  return (
    <>
      <div className="mt-8 max-w-xl">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search blog posts..."
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {filteredPosts.map((post) => (
          <BlogCard
            key={post.slug}
            {...post}
            tags={post.tags ?? []}
          />
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <p className="mt-8 text-gray-500">No blog posts found.</p>
      )}
    </>
  );
}