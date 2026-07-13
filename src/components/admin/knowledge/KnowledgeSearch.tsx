"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const DEBOUNCE_MS = 300;

export default function KnowledgeSearch({ value, onChange }: Props) {
  const [term, setTerm] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => onChange(term), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [term, onChange]);

  return (
    <input
      type="search"
      value={term}
      onChange={(event) => setTerm(event.target.value)}
      placeholder="Search by title, type or content..."
      className="w-full rounded-xl border px-4 py-3 text-sm sm:w-72"
    />
  );
}
