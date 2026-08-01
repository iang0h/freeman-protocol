"use client";

import { useMemo, useState } from "react";
import { createRoomCode, normalizeDisplayName } from "./game/co-op-protocol.mjs";

type LobbyState =
  | "landing"
  | "creating"
  | "joining"
  | "waiting"
  | "ready"
  | "connecting"
  | "reconnecting"
  | "ended";

type RoomPlayer = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
};

type RoomMessage = {
  roomCode: string;
  hostPlayerId?: string;
  players: RoomPlayer[];
};

export type CoOpMatchResult = "victory" | "defeat" | "abandoned" | "manual";

export type MatchSummary = {
  wavesSurvived: number;
  coreHealth: number;
  agentsRecruited: number;
  resourcesGathered: {
    compute: number;
    components: number;
    shards: number;
  };
  players: Array<{
    id: string;
    name: string;
    contribution: Record<string, number>;
  }>;
};

type CoOpLobbyClient = {
  connectionState?: string;
  onRoom?: (message: RoomMessage) => void;
  onEnded?: (message: { result: string }) => void;
  onConnectionChange?: (state: string) => void;
  connect: (url: string, displayName: string) => unknown;
  sendReady: (ready: boolean) => boolean;
  sendStart: () => boolean;
  disconnect: () => void;
};

type CoOpLobbyProps = {
  client: CoOpLobbyClient;
  endpoint?: string;
  featureEnabled: boolean;
  room?: RoomMessage | null;
  connectionState?: string;
  endedResult?: CoOpMatchResult | "";
  endedSummary?: MatchSummary | null;
  onStartSession: (session: { roomCode: string; playerId: string; client: CoOpLobbyClient }) => void;
  onCreateNewRoom: () => void;
  onLeave: () => void;
};

const displayNameStorageKey = "freeman-co-op-display-name";

function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function initialDisplayName() {
  if (typeof window === "undefined") return "Defender";
  return normalizeDisplayName(window.localStorage.getItem(displayNameStorageKey) ?? "Defender");
}

function roomUrl(endpoint: string, roomCode: string) {
  const url = new URL(`/api/co-op/rooms/${roomCode}`, endpoint || window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function statusLabel(state: LobbyState) {
  switch (state) {
    case "connecting":
    case "creating":
    case "joining":
      return "CONNECTING TO CO-OP ROOM";
    case "waiting":
      return "WAITING FOR A SECOND DEFENDER";
    case "ready":
      return "SQUAD READY — HOST CAN START";
    case "reconnecting":
      return "RECONNECTING TO ROOM";
    case "ended":
      return "CO-OP RUN ENDED";
    default:
      return "CREATE A ROOM OR JOIN YOUR PARTNER";
  }
}

function resultLabel(result: CoOpMatchResult | "") {
  switch (result) {
    case "victory":
      return "NETWORK SECURED";
    case "defeat":
      return "CORE OVERRUN";
    case "abandoned":
      return "ROOM ABANDONED";
    case "manual":
      return "RUN LEFT BY DEFENDER";
    default:
      return "CO-OP RUN ENDED";
  }
}

export default function CoOpLobby({
  client,
  endpoint = "",
  featureEnabled,
  room = null,
  connectionState = "idle",
  endedResult = "",
  endedSummary = null,
  onStartSession,
  onCreateNewRoom,
  onLeave,
}: CoOpLobbyProps) {
  const [view, setView] = useState<LobbyState>("landing");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [roomCode, setRoomCode] = useState("");
  const [createdRoom, setCreatedRoom] = useState(false);
  const [copyHint, setCopyHint] = useState("");

  const lobbyState: LobbyState = endedResult
    ? "ended"
    : connectionState === "reconnecting"
      ? "reconnecting"
      : connectionState === "connecting"
        ? "connecting"
        : room
          ? room.players.length === 2 ? "ready" : "waiting"
          : view;

  const allReady = Boolean(room && room.players.length === 2 && room.players.every((player) => player.ready));
  const isHost = createdRoom;
  // The authoritative room assigns p1 to the creator and p2 to the joiner.
  // Names are intentionally not identities: both defenders may choose "Defender".
  const localPlayerId = createdRoom ? "p1" : "p2";
  const joinDisabled = !featureEnabled || roomCode.length !== 6;
  const startDisabled = !isHost || !allReady || lobbyState === "reconnecting";
  const startReason = !isHost
    ? "Only the room host starts the run."
    : !allReady
      ? "Both defenders must mark READY before starting."
      : lobbyState === "reconnecting"
        ? "Wait for the connection to recover."
        : "";
  const roomStatus = useMemo(() => statusLabel(lobbyState), [lobbyState]);

  function rememberName() {
    const normalized = normalizeDisplayName(displayName);
    setDisplayName(normalized);
    window.localStorage.setItem(displayNameStorageKey, normalized);
    return normalized;
  }

  function connectToRoom(nextRoomCode: string, nextView: LobbyState, isCreated: boolean) {
    if (!featureEnabled) return;
    const normalizedCode = normalizeRoomCode(nextRoomCode);
    const name = rememberName();
    setCreatedRoom(isCreated);
    setRoomCode(normalizedCode);
    setView(nextView);
    setCopyHint("");
    client.connect(roomUrl(endpoint, normalizedCode), name);
  }

  function createRoom() {
    const nextRoomCode = createRoomCode(() => Math.random());
    connectToRoom(nextRoomCode, "creating", true);
  }

  function joinRoom() {
    connectToRoom(roomCode, "joining", false);
  }

  async function copyRoomCode() {
    if (!roomCode) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(roomCode);
      setCopyHint("ROOM CODE COPIED");
    } catch {
      setCopyHint(`SELECT AND COPY: ${roomCode}`);
    }
  }

  function toggleReady() {
    const localPlayer = room?.players.find((player) => player.id === localPlayerId);
    client.sendReady(!localPlayer?.ready);
  }

  function startRun() {
    if (startDisabled || !roomCode) return;
    if (client.sendStart()) onStartSession({ roomCode, playerId: localPlayerId, client });
  }

  function leaveRoom() {
    client.disconnect();
    setRoomCode("");
    setCreatedRoom(false);
    setCopyHint("");
    setView("landing");
    onLeave();
  }

  function createFreshRoom() {
    client.disconnect();
    onCreateNewRoom();
    setRoomCode("");
    setCopyHint("");
    setView("landing");
    createRoom();
  }

  return (
    <main className="co-op-lobby" aria-labelledby="co-op-lobby-title">
      <div className="co-op-lobby__grid" aria-hidden="true" />
      <header className="co-op-lobby__header">
        <span className="co-op-lobby__sigil">F</span>
        <div>
          <p>FREEMAN / PROTOCOL</p>
          <small>CO-OP NETWORK DEFENSE</small>
        </div>
        <button type="button" className="co-op-lobby__leave" onClick={leaveRoom}>
          LEAVE ROOM
        </button>
      </header>

      <section className="co-op-lobby__panel">
        <p className="co-op-lobby__eyebrow">TWO DEFENDERS · ONE SHARED CORE</p>
        <h1 id="co-op-lobby-title">BUILD A CO-OP RUN</h1>
        <p className="co-op-lobby__intro">
          Share a Core, resources, sentries, and an autonomous AI warband. Your campaign and watch progress stay local.
        </p>

        <p className="co-op-lobby__status" aria-live="polite" role="status">
          {featureEnabled ? roomStatus : "CO-OP COMING SOON — THE MULTIPLAYER ENDPOINT IS NOT CONFIGURED."}
        </p>

        <label className="co-op-lobby__field" htmlFor="co-op-display-name">
          <span>DISPLAY NAME</span>
          <input
            id="co-op-display-name"
            value={displayName}
            maxLength={20}
            autoComplete="nickname"
            onChange={(event) => setDisplayName(event.target.value)}
            onBlur={rememberName}
          />
        </label>

        {lobbyState === "landing" && (
          <div className="co-op-lobby__entry-actions">
            <button type="button" className="co-op-lobby__primary" disabled={!featureEnabled} onClick={createRoom}>
              CREATE ROOM
            </button>
            <button type="button" className="co-op-lobby__secondary" disabled={!featureEnabled} onClick={() => setView("joining")}>
              JOIN ROOM
            </button>
          </div>
        )}

        {lobbyState === "joining" && !room && (
          <div className="co-op-lobby__join">
            <label className="co-op-lobby__field" htmlFor="co-op-room-code">
              <span>ROOM CODE</span>
              <input
                id="co-op-room-code"
                value={roomCode}
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
                placeholder="ABC123"
                onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              />
            </label>
            <button type="button" className="co-op-lobby__primary" disabled={joinDisabled} onClick={joinRoom}>
              JOIN ROOM
            </button>
          </div>
        )}

        {room && (
          <div className="co-op-lobby__room" aria-label={`Co-op room ${room.roomCode}`}>
            <div className="co-op-lobby__code-row">
              <div>
                <span>ROOM CODE</span>
                <strong>{room.roomCode}</strong>
              </div>
              <button type="button" className="co-op-lobby__copy" onClick={copyRoomCode}>
                COPY CODE
              </button>
            </div>
            {copyHint && <p className="co-op-lobby__copy-hint" aria-live="polite">{copyHint}</p>}
            <div className="co-op-lobby__players" aria-label="Defender readiness">
              {room.players.map((player) => (
                <div className="co-op-lobby__player" key={player.id}>
                  <span>{player.name}</span>
                  <strong>{player.connected ? (player.ready ? "READY" : "IN ROOM") : "RECONNECTING"}</strong>
                </div>
              ))}
              {room.players.length < 2 && <div className="co-op-lobby__player is-empty">AWAITING DEFENDER</div>}
            </div>
            <div className="co-op-lobby__room-actions">
              <button type="button" className="co-op-lobby__secondary" disabled={lobbyState === "reconnecting"} onClick={toggleReady}>
                READY
              </button>
              <div>
                <button type="button" className="co-op-lobby__primary" disabled={startDisabled} onClick={startRun}>
                  START RUN
                </button>
                {startReason && <p className="co-op-lobby__disabled-reason">{startReason}</p>}
              </div>
            </div>
          </div>
        )}

        {lobbyState === "ended" && (
          <div className="co-op-lobby__ended">
            <section className="co-op-lobby__summary" aria-labelledby="co-op-summary-title">
              <p className="co-op-lobby__eyebrow">MATCH SUMMARY</p>
              <h2 id="co-op-summary-title">{resultLabel(endedResult)}</h2>
              {endedSummary ? (
                <>
                  <div className="co-op-lobby__summary-grid">
                    <div>
                      <span>WAVES SURVIVED</span>
                      <strong>{endedSummary.wavesSurvived}</strong>
                    </div>
                    <div>
                      <span>CORE HEALTH</span>
                      <strong>{endedSummary.coreHealth}</strong>
                    </div>
                    <div>
                      <span>AGENTS RECRUITED</span>
                      <strong>{endedSummary.agentsRecruited}</strong>
                    </div>
                  </div>
                  <div className="co-op-lobby__summary-resources">
                    <span>RESOURCES REMAINING</span>
                    <strong>
                      {endedSummary.resourcesGathered.compute} C · {endedSummary.resourcesGathered.components} COMP · {endedSummary.resourcesGathered.shards} SHARDS
                    </strong>
                  </div>
                  <div className="co-op-lobby__contributions" aria-label="Defender contributions">
                    <span>DEFENDER CONTRIBUTIONS</span>
                    {endedSummary.players.map((player) => (
                      <div key={player.id}>
                        <strong>{player.name}</strong>
                        <small>
                          {Object.entries(player.contribution).map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ") || "NO RECORDED ACTIONS"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <p className="co-op-lobby__summary-note">RUN RESULTS ARE LOCAL TO THIS ROOM · NOTHING IS SAVED TO AN ACCOUNT</p>
                </>
              ) : (
                <p className="co-op-lobby__end-note">{endedResult.toUpperCase()} · No contribution data was received before the room closed.</p>
              )}
            </section>
            <div className="co-op-lobby__ended-actions">
              <button type="button" className="co-op-lobby__primary" disabled={!featureEnabled} onClick={createFreshRoom}>
                PLAY AGAIN · CREATE NEW ROOM
              </button>
              <button type="button" className="co-op-lobby__secondary" onClick={leaveRoom}>
                LEAVE ROOM
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
