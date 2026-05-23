import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => (
      <h1 className="mb-6 mt-8 text-4xl font-bold tracking-tight" {...props} />
    ),
    h2: (props) => (
      <h2 className="mb-4 mt-10 text-2xl font-semibold tracking-tight" {...props} />
    ),
    h3: (props) => (
      <h3 className="mb-3 mt-8 text-xl font-semibold" {...props} />
    ),
    p: (props) => (
      <p className="mb-5 leading-8 text-gray-700" {...props} />
    ),
    ul: (props) => (
      <ul className="mb-5 list-disc space-y-2 pl-6 text-gray-700" {...props} />
    ),
    ol: (props) => (
      <ol className="mb-5 list-decimal space-y-2 pl-6 text-gray-700" {...props} />
    ),
    li: (props) => <li className="leading-8" {...props} />,
    code: (props) => (
      <code className="rounded bg-gray-100 px-1.5 py-1 text-sm" {...props} />
    ),
    pre: (props) => (
      <pre
        className="mb-6 overflow-x-auto rounded-xl bg-gray-950 p-4 text-sm text-white"
        {...props}
      />
    ),
    blockquote: (props) => (
      <blockquote
        className="mb-6 border-l-4 border-blue-500 pl-4 italic text-gray-700"
        {...props}
      />
    ),
    ...components,
  };
}