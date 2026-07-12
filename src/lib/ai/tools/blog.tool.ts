import { blogKnowledge } from "../knowledge/blog.service";
import { AITool } from "./types";

export class BlogTool implements AITool {

  name = "blog-tool";

  description =
    "Blog related questions";

  keywords = [

    "blog",

    "blogs",

    "article",

    "articles",

    "post",

    "posts"

  ];

  priority = 90;

  async execute(question: string) {

    const result =
      await blogKnowledge.searchBlogs(
        question
      );

    return {

      success: true,

      tool: this.name,

      result,

    };

  }

}

export const blogTool =
  new BlogTool();