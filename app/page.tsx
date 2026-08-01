"use client";

import { useState } from "react";
import FreemanProtocol, {
  type RecruitmentAdvisorViewState,
} from "./FreemanProtocol";
import CoOpLobby from "./CoOpLobby";
import { createOverlayState, toggleOverlay } from "./game/combat-presentation-rules.mjs";
import { CoOpClient } from "./game/co-op-client.mjs";

const CO_OP_WS_URL = process.env.NEXT_PUBLIC_CO_OP_WS_URL ?? "";

const ADVISOR_LABELS = {
  recruit: "RECRUIT ADVISED",
  repair: "REPAIR FIRST",
  defend: "DEFEND CORE",
  save: "HOLD COMPUTE",
} as const;

const GUIDANCE_ACTIONS = {
  recruit: "OPEN WARBAND",
  repair: "RECOVER FIRST",
  defend: "HOLD THE CORE",
  save: "KEEP SAVING",
} as const;

const formatResources = (
  resources: { compute: number; components: number; shards: number } | null,
) => resources
  ? `${resources.compute} C · ${resources.components} COMP · ${resources.shards} SHARDS`
  : "NONE";

type CoOpRoom = {
  roomCode: string;
  hostPlayerId?: string;
  players: Array<{ id: string; name: string; ready: boolean; connected: boolean }>;
};

export default function Home() {
  const [coOpLobbyOpen, setCoOpLobbyOpen] = useState(false);
  const [coOpRoom, setCoOpRoom] = useState<CoOpRoom | null>(null);
  const [coOpConnectionState, setCoOpConnectionState] = useState("idle");
  const [coOpEndedResult, setCoOpEndedResult] = useState("");
  const [overlayState, setOverlayState] = useState(createOverlayState);
  const [advisorState, setAdvisorState] =
    useState<RecruitmentAdvisorViewState | null>(null);
  const [advisorRequestKey, setAdvisorRequestKey] = useState(0);
  const [coOpClient] = useState(() => new CoOpClient({
    onRoom: (message: CoOpRoom) => setCoOpRoom(message),
    onEnded: (message: { result: string }) => setCoOpEndedResult(message.result),
    onConnectionChange: (state: string) => {
      setCoOpConnectionState(state);
      if (state === "connecting") {
        setCoOpRoom(null);
        setCoOpEndedResult("");
      }
    },
  }));
  const recruitmentAdvice = advisorState?.recruitmentAdvice ?? null;
  const advisorAgentId =
    recruitmentAdvice?.state === "recruit"
      ? recruitmentAdvice.agentId
      : null;
  const advisorResources = advisorState?.resources ?? null;
  const advisorSessionMode = advisorState?.sessionMode ?? "campaign";
  const advisorWatchPriority = advisorState?.watchPriority ?? "survive";
  const advisorCard = recruitmentAdvice ? (
    <aside
      className={`recruitment-advisor recruitment-advisor--${recruitmentAdvice.state}`}
      aria-label="Recruitment advisor"
    >
      <div className="recruitment-advisor__copy">
        <small>{ADVISOR_LABELS[recruitmentAdvice.state]}</small>
        <strong>{recruitmentAdvice.title}</strong>
        <p className="recruitment-advisor__reason">
          {recruitmentAdvice.detail}
        </p>
        {advisorSessionMode === "watch" && (
          <p className="recruitment-advisor__watch">
            WATCH MODE · AI PRIORITY {advisorWatchPriority.toUpperCase()} ·{" "}
            {recruitmentAdvice.detail}
          </p>
        )}
      </div>
      <dl className="recruitment-advisor__resources">
        <div>
          <dt>CURRENT</dt>
          <dd>{formatResources(advisorResources)}</dd>
        </div>
        <div>
          <dt>COST</dt>
          <dd>{formatResources(recruitmentAdvice.cost)}</dd>
        </div>
        {recruitmentAdvice.missing &&
          Object.values(recruitmentAdvice.missing).some((value) => value > 0) && (
            <div className="is-missing">
              <dt>MISSING</dt>
              <dd>{formatResources(recruitmentAdvice.missing)}</dd>
            </div>
          )}
      </dl>
      {recruitmentAdvice.action === "recruit" && recruitmentAdvice.agentId ? (
        <button
          type="button"
          className="recruitment-advisor__action"
          onClick={() => {
            setAdvisorRequestKey((key) => key + 1);
          }}
        >
          RECRUIT NOW
        </button>
      ) : (
        <span className="recruitment-advisor__action is-guidance">
          {GUIDANCE_ACTIONS[recruitmentAdvice.action]}
        </span>
      )}
    </aside>
  ) : null;

  if (coOpLobbyOpen) {
    return (
      <CoOpLobby
        client={coOpClient}
        endpoint={CO_OP_WS_URL}
        featureEnabled={Boolean(CO_OP_WS_URL)}
        room={coOpRoom}
        connectionState={coOpConnectionState}
        endedResult={coOpEndedResult}
        onStartSession={() => {
          // Task 6 projects this authoritative session into the combat renderer.
        }}
        onLeave={() => {
          setCoOpRoom(null);
          setCoOpEndedResult("");
          setCoOpConnectionState("idle");
          setCoOpLobbyOpen(false);
        }}
      />
    );
  }

  return (
    <div className="co-op-entry-shell">
      <button
        type="button"
        className="co-op-entry"
        onClick={() => setCoOpLobbyOpen(true)}
        aria-label="Open co-op lobby"
      >
        CO-OP
      </button>
    <FreemanProtocol
      overlayState={overlayState}
      onToggleOverlay={(panel) =>
        setOverlayState(toggleOverlay(overlayState, panel))
      }
      recruitmentAdvisor={advisorCard}
      onRecruitmentAdvisorChange={setAdvisorState}
      advisorAgentId={advisorAgentId}
      advisorRequestKey={advisorRequestKey}
    />
    </div>
  );
}
