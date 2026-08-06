import type { CSSProperties } from "react";
import { getAgentVisual } from "./game/agent-presentation-rules.mjs";

type AgentPortraitProps = {
  agentId: string;
  size?: "sm" | "md" | "lg";
  state?: string;
  decorative?: boolean;
  className?: string;
};

const toDisplayName = (agentId: string) =>
  agentId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

export default function AgentPortrait({
  agentId,
  size = "md",
  state,
  decorative = false,
  className = "",
}: AgentPortraitProps) {
  const visual = getAgentVisual(agentId);
  const displayName = toDisplayName(agentId);
  const label = visual
    ? `${displayName} ${visual.roleLabel.toLowerCase()} agent`
    : `${displayName} agent`;
  const style = {
    "--agent-accent": visual?.accent ?? "#9ebfc0",
  } as CSSProperties;

  return (
    <span
      className={`agent-portrait agent-portrait--${size} ${visual?.fallbackClass ?? "is-unknown"} ${className}`.trim()}
      data-agent-id={agentId}
      data-state={state}
      style={style}
      aria-hidden={decorative ? true : undefined}
      title={decorative ? undefined : label}
    >
      <span className="agent-portrait__fallback" aria-hidden="true">
        {visual?.roleLabel.slice(0, 1) ?? "?"}
      </span>
      {visual && (
        <img
          src={visual.portraitSrc}
          alt={decorative ? "" : label}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}
