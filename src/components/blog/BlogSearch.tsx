"use client";

import { useState } from "react";
import BlogCard from "@/components/blog/BlogCard";
import SearchBox from "@/components/ui/SearchBox";
import { BlogPost } from "@/types/blog";

type BlogSearchProps = {
  posts: BlogPost[];
};

export default function BlogSearch({ posts }: BlogSearchProps) {
  const [query, setQuery] = useState("");

  const filteredPosts = posts.filter((post) => {
    const text = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
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
          <BlogCard key={post.slug} {...post} />
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <p className="mt-8 text-gray-500">No blog posts found.</p>
      )}
    </>
  );
}