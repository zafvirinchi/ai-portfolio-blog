type BadgeProps = {
  children: React.ReactNode;
};

export default function Badge({ children }: BadgeProps) {
  return (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
      {children}
    </span>
  );
}