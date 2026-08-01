"use client";

import { useCallback, useState } from "react";
import FreemanProtocol, {
  type CoOpAction,
  type CoOpCombatSnapshot,
  type RecruitmentAdvisorViewState,
} from "./FreemanProtocol";
import CoOpLobby, { type CoOpMatchResult, type MatchSummary } from "./CoOpLobby";
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

function summarizeCoOpSnapshot(snapshot: CoOpCombatSnapshot | null): MatchSummary {
  const state = snapshot?.state;
  return {
    wavesSurvived: Math.max(0, (state?.wave.number ?? 1) - 1),
    coreHealth: Math.max(0, Math.round(state?.core.health ?? 0)),
    agentsRecruited: Math.min(8, state?.warband.agents.length ?? 0),
    resourcesGathered: {
      compute: Math.max(0, Math.round(state?.resources.compute ?? 0)),
      components: Math.max(0, Math.round(state?.resources.components ?? 0)),
      shards: Math.max(0, Math.round(state?.resources.shards ?? 0)),
    },
    players: (state?.players ?? [])
      .filter((player): player is typeof player & { id: string } => Boolean(player.id))
      .map((player) => ({
        id: player.id,
        name: player.name ?? "Defender",
        contribution: {},
      })),
  };
}

type CoOpRoom = {
  roomCode: string;
  hostPlayerId?: string;
  players: Array<{ id: string; name: string; ready: boolean; connected: boolean }>;
};

type CoOpSession = {
  roomCode: string;
  playerId: string;
};

export default function Home() {
  const [coOpLobbyOpen, setCoOpLobbyOpen] = useState(false);
  const [coOpRoom, setCoOpRoom] = useState<CoOpRoom | null>(null);
  const [coOpSession, setCoOpSession] = useState<CoOpSession | null>(null);
  const [coOpSnapshot, setCoOpSnapshot] = useState<CoOpCombatSnapshot | null>(null);
  const [coOpConnectionState, setCoOpConnectionState] = useState("idle");
  const [coOpEndedResult, setCoOpEndedResult] = useState<CoOpMatchResult | "">("");
  const [coOpEndedSummary, setCoOpEndedSummary] = useState<MatchSummary | null>(null);
  const [overlayState, setOverlayState] = useState(createOverlayState);
  const [advisorState, setAdvisorState] =
    useState<RecruitmentAdvisorViewState | null>(null);
  const [advisorRequestKey, setAdvisorRequestKey] = useState(0);
  const [coOpClient] = useState(() => new CoOpClient({
    onRoom: (message: CoOpRoom) => setCoOpRoom(message),
    onSnapshot: (message: CoOpCombatSnapshot) => setCoOpSnapshot(message),
    onEnded: (message: { result: CoOpMatchResult; summary: MatchSummary }) => {
      setCoOpRoom(null);
      setCoOpSession(null);
      setCoOpSnapshot(null);
      setCoOpEndedResult(message.result);
      setCoOpEndedSummary(message.summary);
      setCoOpLobbyOpen(true);
    },
    onConnectionChange: (state: string) => {
      setCoOpConnectionState(state);
      if (state === "connecting") {
        setCoOpRoom(null);
        setCoOpEndedResult("");
        setCoOpEndedSummary(null);
      }
    },
  }));
  const handleCoOpAction = useCallback((action: CoOpAction) => {
    if (!coOpSession || coOpConnectionState === "reconnecting") return false;
    return coOpClient.sendAction(action);
  }, [coOpClient, coOpConnectionState, coOpSession]);
  const handleCoOpLeave = useCallback(() => {
    const summary = summarizeCoOpSnapshot(coOpSnapshot);
    coOpClient.disconnect();
    setCoOpRoom(null);
    setCoOpSession(null);
    setCoOpSnapshot(null);
    setCoOpEndedResult("manual");
    setCoOpEndedSummary(summary);
    setCoOpLobbyOpen(true);
  }, [coOpClient, coOpSnapshot]);
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
        endedSummary={coOpEndedSummary}
        onStartSession={({ roomCode, playerId }) => {
          setCoOpSession({ roomCode, playerId });
          setCoOpSnapshot(null);
          setCoOpLobbyOpen(false);
        }}
        onCreateNewRoom={() => {
          setCoOpRoom(null);
          setCoOpSession(null);
          setCoOpSnapshot(null);
          setCoOpEndedResult("");
          setCoOpEndedSummary(null);
          setCoOpConnectionState("idle");
        }}
        onLeave={() => {
          setCoOpRoom(null);
          setCoOpSession(null);
          setCoOpSnapshot(null);
          setCoOpEndedResult("");
          setCoOpEndedSummary(null);
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
      coOpSnapshot={coOpSnapshot}
      coOpPlayerId={coOpSession?.playerId ?? null}
      coOpConnectionState={coOpConnectionState}
      coOpClient={coOpSession ? coOpClient : null}
      onCoOpAction={handleCoOpAction}
      onCoOpLeave={handleCoOpLeave}
    />
    </div>
  );
}
