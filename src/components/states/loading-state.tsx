export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-4" role="status">
      <div className="flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-3 animate-bounce rounded-full bg-primary motion-reduce:animate-none"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <p className="text-sm font-bold text-muted">{label}</p>
    </div>
  );
}
