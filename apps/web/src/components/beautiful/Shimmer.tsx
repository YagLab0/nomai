// Vendored from beautiful-ui (MIT) — see VENDORED.md
import "./styles.css";

/** Shimmering label — signals the agent is processing. */
export function Shimmer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-muted) 35%, var(--ink) 50%, var(--ink-muted) 65%)",
        backgroundSize: "200% 100%",
        animation: "bui-shimmer-text 1.8s linear infinite",
      }}
    >
      {children}
    </span>
  );
}
