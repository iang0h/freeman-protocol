import {
  CO_OP_PROTOCOL_VERSION,
  normalizeDisplayName,
  parseClientMessage,
} from "../app/game/co-op-protocol.mjs";
import {
  RECONNECT_GRACE_MS,
  applyClientMessage,
  createRoom,
  disconnectPlayer,
  endRoom,
  getEndedMessage,
  getEventMessages,
  getExpiredDisconnectedPlayerIds,
  getNextDisconnectDeadline,
  getRoomMessage,
  getSnapshot,
  joinRoom,
  reconnectPlayer,
  tickRoom,
} from "../app/game/co-op-room.mjs";

type RoomState = ReturnType<typeof createRoom>;

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm?(scheduledTime: number): Promise<void>;
  deleteAlarm?(): Promise<void>;
}

interface RoomSocket extends WebSocket {
  accept(): void;
  serializeAttachment?(attachment: SocketAttachment): void;
  deserializeAttachment?(): SocketAttachment | null;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket?(socket: RoomSocket): void;
  getWebSockets?(): RoomSocket[];
}

interface WebSocketResponseInit extends ResponseInit {
  webSocket: WebSocket;
}

interface CoOpPlayer {
  id: string | null;
  name: string | null;
  connected: boolean;
  ready: boolean;
}

interface SocketAttachment {
  roomCode: string;
  socketId: string;
  playerId: string | null;
  greeted: boolean;
}

declare const WebSocketPair: new () => { 0: WebSocket; 1: RoomSocket };

const ROOM_STORAGE_KEY = "co-op:room";
const TICK_INTERVAL_MS = 100;
const BROADCAST_INTERVAL_MS = 200;
const ROOM_IDLE_EXPIRY_MS = RECONNECT_GRACE_MS;

function errorMessage(code: string, message: string) {
  return { type: "error", code, message } as const;
}

function isWebSocketUpgrade(request: Request) {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function roomCodeFromRequest(request: Request) {
  const header = request.headers.get("X-Co-Op-Room-Code") ?? "";
  return /^[A-Z0-9]{6}$/.test(header) ? header : null;
}

/**
 * Server-authoritative two-player co-op room. The browser sends only versioned
 * intents; snapshots are always derived from the shared room reducer.
 */
export class MultiplayerRoom {
  private readonly state: DurableObjectState;
  private room: RoomState | null = null;
  private readonly sockets = new Map<string, RoomSocket>();
  private readonly socketAttachments = new Map<RoomSocket, SocketAttachment>();
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastElapsedMs = 0;
  private lastBroadcastEventId = 0;
  private nextSocketId = 1;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly handledSockets = new WeakSet<RoomSocket>();
  private finishingRoom = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Co-op rooms accept GET WebSocket upgrades only.", { status: 405 });
    }
    if (!isWebSocketUpgrade(request)) {
      return new Response("Upgrade Required", { status: 426, headers: { Upgrade: "websocket" } });
    }

    const roomCode = roomCodeFromRequest(request);
    if (!roomCode) return new Response("Invalid room code", { status: 400 });
    await this.ensureRoom(roomCode);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      roomCode,
      socketId: `socket-${this.nextSocketId++}`,
      playerId: null,
      greeted: false,
    };
    server.serializeAttachment?.(attachment);
    this.sockets.set(attachment.socketId, server);
    this.socketAttachments.set(server, attachment);

    if (typeof this.state.acceptWebSocket === "function") {
      this.state.acceptWebSocket(server);
    } else {
      server.accept();
      server.addEventListener("message", (event) => void this.receive(server, event.data));
      server.addEventListener("close", () => void this.closeSocket(server));
      server.addEventListener("error", () => void this.closeSocket(server));
    }
    await this.scheduleNextAlarm();

    return new Response(null, { status: 101, webSocket: client } as WebSocketResponseInit);
  }

  async webSocketMessage(socket: RoomSocket, message: string | ArrayBuffer): Promise<void> {
    await this.receive(socket, typeof message === "string" ? message : "");
  }

  async webSocketClose(socket: RoomSocket): Promise<void> {
    await this.closeSocket(socket);
  }

  async webSocketError(socket: RoomSocket): Promise<void> {
    await this.closeSocket(socket);
  }

  async alarm(): Promise<void> {
    this.expiryTimer = null;
    if (!this.room) this.room = await this.state.storage.get<RoomState>(ROOM_STORAGE_KEY) ?? null;
    if (!this.room) return;
    if (this.room.phase === "ended") {
      await this.finishRoom(this.room.result ?? "abandoned");
      return;
    }
    if (await this.finishExpiredDisconnects()) return;
    if (this.connectedSockets().length === 0) {
      await this.expireRoom();
      return;
    }
    await this.scheduleNextAlarm();
  }

  private socketAttachment(socket: RoomSocket): SocketAttachment | null {
    const attachment = socket.deserializeAttachment?.() ?? this.socketAttachments.get(socket);
    if (!attachment || typeof attachment !== "object") return null;
    return attachment;
  }

  private async ensureRoom(roomCode: string): Promise<RoomState> {
    if (this.room) return this.room;
    const stored = await this.state.storage.get<RoomState>(ROOM_STORAGE_KEY);
    if (stored && stored.roomCode === roomCode && stored.phase !== "ended") {
      this.room = stored;
    } else {
      this.room = createRoom({ roomCode, seed: roomCode });
      this.lastBroadcastEventId = 0;
    }
    if (stored?.phase === "ended") await this.state.storage.delete(ROOM_STORAGE_KEY);
    return this.room;
  }

  private async persistRoom(): Promise<void> {
    if (this.room) await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
  }

  private send(socket: RoomSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private connectedSockets(): RoomSocket[] {
    const hibernatedSockets = this.state.getWebSockets?.();
    return hibernatedSockets ?? [...this.sockets.values()];
  }

  private broadcast(message: unknown): void {
    for (const socket of this.connectedSockets()) this.send(socket, message);
  }

  private broadcastRoomAndSnapshot(): void {
    if (!this.room) return;
    this.broadcast(getRoomMessage(this.room));
    this.broadcast(getSnapshot(this.room));
    this.broadcastPendingEvents();
  }

  private broadcastPendingEvents(room: RoomState | null = this.room): void {
    if (!room) return;
    const events = getEventMessages(room, this.lastBroadcastEventId);
    for (const event of events) this.broadcast(event);
    if (events.length > 0) this.lastBroadcastEventId = events.at(-1)?.eventId ?? this.lastBroadcastEventId;
  }

  private async receive(socket: RoomSocket, rawMessage: string): Promise<void> {
    const attachment = this.socketAttachment(socket);
    if (!attachment) {
      this.send(socket, errorMessage("SOCKET_STATE", "Socket state is unavailable"));
      socket.close(1011, "Socket state unavailable");
      return;
    }
    this.sockets.set(attachment.socketId, socket);
    await this.ensureRoom(attachment.roomCode);
    if (await this.finishExpiredDisconnects()) return;

    const message = parseClientMessage(rawMessage);
    if (!message) {
      this.send(socket, errorMessage("INVALID_MESSAGE", "Client message failed protocol validation"));
      return;
    }
    if (!attachment.greeted) {
      if (message.type !== "hello" || message.protocolVersion !== CO_OP_PROTOCOL_VERSION) {
        this.send(socket, errorMessage("HELLO_REQUIRED", "Send a versioned hello before gameplay messages"));
        socket.close(1008, "HELLO_REQUIRED");
        return;
      }
      await this.acceptHello(socket, attachment, message.displayName);
      return;
    }

    if (!attachment.playerId || !this.room) {
      this.send(socket, errorMessage("PLAYER_REQUIRED", "Complete the hello handshake first"));
      return;
    }
    if (message.type === "hello") {
      this.send(socket, errorMessage("HELLO_ALREADY_ACCEPTED", "This socket is already assigned a player"));
      return;
    }
    if (message.type === "resume") {
      this.send(socket, getRoomMessage(this.room));
      this.send(socket, getSnapshot(this.room));
      for (const event of getEventMessages(this.room)) this.send(socket, event);
      return;
    }

    const transition = applyClientMessage(this.room, attachment.playerId, message);
    if (transition.error) {
      this.send(socket, errorMessage(transition.error.code, transition.error.message));
      return;
    }
    this.room = transition.room;
    await this.persistRoom();
    this.broadcastRoomAndSnapshot();
    await this.scheduleNextAlarm();
    this.scheduleTick();
  }

  private async acceptHello(socket: RoomSocket, attachment: SocketAttachment, displayName: string): Promise<void> {
    const room = await this.ensureRoom(attachment.roomCode);
    const name = normalizeDisplayName(displayName);
    const reconnectable = room.players.find((player: CoOpPlayer) => (
      player.id && !player.connected && player.name === name && room.disconnectDeadlines[player.id] > Date.now()
    ));
    try {
      if (reconnectable?.id) {
        this.room = reconnectPlayer(room, reconnectable.id);
        attachment.playerId = reconnectable.id;
      } else {
        const playerId = `p${room.players.filter((player: CoOpPlayer) => player.id).length + 1}`;
        this.room = joinRoom(room, { id: playerId, name });
        attachment.playerId = playerId;
      }
      attachment.greeted = true;
      socket.serializeAttachment?.(attachment);
      await this.persistRoom();
      this.broadcastRoomAndSnapshot();
      await this.scheduleNextAlarm();
      this.scheduleTick();
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "ROOM_UNAVAILABLE";
      this.send(socket, errorMessage(code, code === "ROOM_FULL" ? "This co-op room already has two players" : "Unable to join this room"));
      socket.close(1008, code);
    }
  }

  private scheduleTick(): void {
    if (this.tickTimer || this.room?.phase !== "playing") return;
    this.tickTimer = setTimeout(() => void this.tick(), TICK_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    this.tickTimer = null;
    if (!this.room || this.room.phase !== "playing") return;
    if (await this.finishExpiredDisconnects()) return;
    this.room = tickRoom(this.room, TICK_INTERVAL_MS);
    this.broadcastElapsedMs += TICK_INTERVAL_MS;
    if (this.room.phase === "ended") {
      await this.finishRoom(this.room.result ?? "defeat");
      return;
    }
    await this.persistRoom();
    if (this.broadcastElapsedMs >= BROADCAST_INTERVAL_MS) {
      this.broadcastElapsedMs = 0;
      this.broadcastRoomAndSnapshot();
    }
    this.scheduleTick();
  }

  private stopTick(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }

  private async closeSocket(socket: RoomSocket): Promise<void> {
    if (this.handledSockets.has(socket)) return;
    this.handledSockets.add(socket);
    const attachment = this.socketAttachment(socket);
    if (!attachment) return;
    this.sockets.delete(attachment.socketId);
    this.socketAttachments.delete(socket);
    await this.ensureRoom(attachment.roomCode);
    if (attachment.playerId && this.room?.phase !== "ended") {
      try {
        this.room = disconnectPlayer(this.room, attachment.playerId);
        await this.persistRoom();
        this.broadcastRoomAndSnapshot();
      } catch {
        // The socket may have already been replaced or the room may have expired.
      }
    }
    await this.scheduleNextAlarm();
  }

  private async cancelScheduledAlarm(): Promise<void> {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    await this.state.storage.deleteAlarm?.();
  }

  private async scheduleNextAlarm(): Promise<void> {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const disconnectDeadline = this.room ? getNextDisconnectDeadline(this.room) : null;
    const scheduledTime = disconnectDeadline ?? (this.connectedSockets().length === 0 ? Date.now() + ROOM_IDLE_EXPIRY_MS : null);
    if (scheduledTime === null) {
      await this.state.storage.deleteAlarm?.();
      return;
    }
    if (this.state.storage.setAlarm) {
      await this.state.storage.setAlarm(scheduledTime);
      return;
    }
    this.expiryTimer = setTimeout(() => void this.alarm(), Math.max(0, scheduledTime - Date.now()));
  }

  private async finishExpiredDisconnects(now = Date.now()): Promise<boolean> {
    if (!this.room || getExpiredDisconnectedPlayerIds(this.room, now).length === 0) return false;
    await this.finishRoom("abandoned");
    return true;
  }

  private async finishRoom(result: "victory" | "defeat" | "abandoned"): Promise<void> {
    if (!this.room || this.finishingRoom) return;
    this.finishingRoom = true;
    const endedRoom = this.room.phase === "ended" && ["victory", "defeat", "abandoned"].includes(this.room.result)
      ? this.room
      : endRoom(this.room, result);
    const endedMessage = getEndedMessage(endedRoom);
    const sockets = this.connectedSockets();
    for (const socket of sockets) this.handledSockets.add(socket);
    this.stopTick();
    this.broadcast(getSnapshot(endedRoom));
    this.broadcastPendingEvents(endedRoom);
    this.broadcast(endedMessage);
    await this.cancelScheduledAlarm();
    this.room = null;
    this.lastBroadcastEventId = 0;
    await this.state.storage.delete(ROOM_STORAGE_KEY);
    for (const socket of sockets) socket.close(1000, "ROOM_ENDED");
    this.sockets.clear();
    this.socketAttachments.clear();
    this.finishingRoom = false;
  }

  private async expireRoom(): Promise<void> {
    this.expiryTimer = null;
    if (this.connectedSockets().length > 0) return;
    this.stopTick();
    this.room = null;
    await this.state.storage.delete(ROOM_STORAGE_KEY);
  }
}
