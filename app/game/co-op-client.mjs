import {
  CO_OP_PROTOCOL_VERSION,
  normalizeDisplayName,
  parseClientMessage,
  parseServerMessage,
} from "./co-op-protocol.mjs";

export const CO_OP_CONNECTION_STATES = Object.freeze([
  "idle",
  "connecting",
  "waiting",
  "ready",
  "playing",
  "reconnecting",
  "ended",
  "error",
]);

export const MAX_RECONNECT_ATTEMPTS = 3;

const DEFAULT_RECONNECT_DELAYS = Object.freeze([500, 1000, 2000]);
const PERMANENT_PROTOCOL_ERRORS = new Set([
  "HELLO_REQUIRED",
  "HELLO_ALREADY_ACCEPTED",
  "INVALID_MESSAGE",
  "PROTOCOL_VERSION",
  "ROOM_FULL",
  "ROOM_UNAVAILABLE",
  "PLAYER_REQUIRED",
  "SOCKET_STATE",
]);

function callback(value) {
  return typeof value === "function" ? value : () => {};
}

function socketIsOpen(socket, WebSocketConstructor) {
  if (!socket || socket.readyState === undefined) return Boolean(socket);
  const openState = typeof WebSocketConstructor?.OPEN === "number" ? WebSocketConstructor.OPEN : 1;
  return socket.readyState === openState;
}

function normalizedReconnectDelays(value) {
  const candidate = Array.isArray(value) ? value : DEFAULT_RECONNECT_DELAYS;
  return candidate
    .slice(0, MAX_RECONNECT_ATTEMPTS)
    .map((delay, index) => Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_RECONNECT_DELAYS[index]);
}

/**
 * Browser-side transport for authoritative co-op rooms. It has no renderer or
 * game-engine dependency so Campaign and Watch Mode remain entirely local.
 */
export class CoOpClient {
  constructor(options = {}) {
    this.WebSocket = options.WebSocket ?? globalThis.WebSocket;
    this.setTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.reconnectDelays = normalizedReconnectDelays(options.reconnectDelays);

    this.onRoom = callback(options.onRoom);
    this.onSnapshot = callback(options.onSnapshot);
    this.onEvent = callback(options.onEvent);
    this.onEnded = callback(options.onEnded);
    this.onError = callback(options.onError);
    this.onConnectionChange = callback(options.onConnectionChange);

    this.connectionState = "idle";
    this.lastSnapshot = null;
    this.lastSnapshotId = 0;
    this.lastEventId = 0;
    this.inputSequence = 0;
    this.actionSequence = 0;

    this.socket = null;
    this.url = null;
    this.displayName = "Guest";
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.manualDisconnect = false;
    this.permanentProtocolError = false;
    this.ignoredSockets = new WeakSet();
    this.openedSockets = new WeakSet();
  }

  get lastSnapshotState() {
    return this.lastSnapshot?.state ?? null;
  }

  connect(url, displayName = "Guest") {
    this.disconnect();
    this.url = typeof url === "string" ? url : "";
    this.displayName = normalizeDisplayName(displayName);
    this.manualDisconnect = false;
    this.permanentProtocolError = false;
    this.reconnectAttempts = 0;
    this.lastSnapshot = null;
    this.lastSnapshotId = 0;
    this.lastEventId = 0;
    this.inputSequence = 0;
    this.actionSequence = 0;
    this.openSocket(false);
    return this;
  }

  sendReady(ready) {
    const message = parseClientMessage({ type: "ready", ready });
    if (!message) return false;
    const sent = this.send(message);
    if (sent) this.setConnectionState(ready ? "ready" : "waiting");
    return sent;
  }

  sendStart() {
    return this.send({ type: "start" });
  }

  sendInput(input = {}) {
    const message = parseClientMessage({ ...input, type: "input", sequence: this.inputSequence + 1 });
    if (!message) return false;
    const sent = this.send(message);
    if (sent) this.inputSequence = message.sequence;
    return sent;
  }

  sendAction(action = {}) {
    const message = parseClientMessage({ ...action, type: "action", sequence: this.actionSequence + 1 });
    if (!message) return false;
    const sent = this.send(message);
    if (sent) this.actionSequence = message.sequence;
    return sent;
  }

  sendPriority(priority) {
    const message = parseClientMessage({ type: "priority", priority });
    return message ? this.send(message) : false;
  }

  resume(snapshotId = this.lastSnapshotId) {
    const message = parseClientMessage({ type: "resume", lastSnapshotId: snapshotId });
    return message ? this.send(message) : false;
  }

  disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      this.ignoredSockets.add(socket);
      try {
        socket.close();
      } catch {
        // A browser can throw while closing an already-closed socket.
      }
    }
    this.url = null;
    this.setConnectionState("idle");
  }

  handleMessage(value) {
    const rawMessage = value && typeof value === "object" && "data" in value ? value.data : value;
    const message = parseServerMessage(rawMessage);
    if (!message) {
      this.reportError({ type: "error", code: "INVALID_SERVER_MESSAGE", message: "Server message failed protocol validation" });
      return false;
    }

    switch (message.type) {
      case "room":
        this.onRoom(message);
        return true;
      case "snapshot":
        if (message.snapshotId <= this.lastSnapshotId) return false;
        this.lastSnapshot = message;
        this.lastSnapshotId = message.snapshotId;
        if (message.state.wave.status === "playing" || message.state.wave.status === "intermission") {
          this.setConnectionState("playing");
        }
        this.onSnapshot(message);
        return true;
      case "event":
        if (message.eventId <= this.lastEventId) return false;
        this.lastEventId = message.eventId;
        this.onEvent(message);
        return true;
      case "ended":
        this.clearReconnectTimer();
        this.setConnectionState("ended");
        this.onEnded(message);
        return true;
      case "error":
        this.reportError(message);
        if (PERMANENT_PROTOCOL_ERRORS.has(message.code)) this.stopForPermanentProtocolError();
        return false;
      default:
        return false;
    }
  }

  openSocket(isReconnect) {
    if (!this.url || typeof this.WebSocket !== "function") {
      this.reportError({ type: "error", code: "WEBSOCKET_UNAVAILABLE", message: "Co-op WebSocket support is unavailable" });
      this.setConnectionState("error");
      return;
    }
    this.setConnectionState(isReconnect ? "reconnecting" : "connecting");
    let socket;
    try {
      socket = new this.WebSocket(this.url);
    } catch {
      this.reportError({ type: "error", code: "CONNECTION_FAILED", message: "Unable to open the co-op connection" });
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    const open = () => this.handleSocketOpen(socket, isReconnect);
    const close = () => this.handleSocketClose(socket);
    const error = () => this.reportError({ type: "error", code: "SOCKET_ERROR", message: "The co-op connection encountered an error" });
    const message = (event) => this.handleMessage(event);
    if (typeof socket.addEventListener === "function") {
      socket.addEventListener("open", open);
      socket.addEventListener("close", close);
      socket.addEventListener("error", error);
      socket.addEventListener("message", message);
    } else {
      socket.onopen = open;
      socket.onclose = close;
      socket.onerror = error;
      socket.onmessage = message;
    }
    if (socketIsOpen(socket, this.WebSocket)) open();
  }

  handleSocketOpen(socket, isReconnect) {
    if (this.openedSockets.has(socket) || socket !== this.socket || this.manualDisconnect || this.permanentProtocolError) return;
    this.openedSockets.add(socket);
    const greeted = this.send({ type: "hello", protocolVersion: CO_OP_PROTOCOL_VERSION, displayName: this.displayName });
    if (!greeted) return;
    this.reconnectAttempts = 0;
    this.setConnectionState("waiting");
    if (isReconnect) this.resume();
  }

  handleSocketClose(socket) {
    if (this.ignoredSockets.has(socket) || socket !== this.socket) return;
    this.socket = null;
    if (this.manualDisconnect || this.permanentProtocolError || this.connectionState === "ended") return;
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manualDisconnect || this.permanentProtocolError || this.connectionState === "ended") return;
    if (this.reconnectAttempts >= Math.min(MAX_RECONNECT_ATTEMPTS, this.reconnectDelays.length)) {
      this.setConnectionState("error");
      this.reportError({ type: "error", code: "RECONNECT_EXHAUSTED", message: "Unable to reconnect to the co-op room" });
      return;
    }
    const delay = this.reconnectDelays[this.reconnectAttempts];
    this.reconnectAttempts += 1;
    this.setConnectionState("reconnecting");
    this.reconnectTimer = this.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect && !this.permanentProtocolError && this.connectionState !== "ended") this.openSocket(true);
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer !== null) this.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  stopForPermanentProtocolError() {
    this.permanentProtocolError = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      this.ignoredSockets.add(socket);
      try {
        socket.close();
      } catch {
        // Closing an already closed browser socket is harmless for the client.
      }
    }
    this.setConnectionState("error");
  }

  send(message) {
    if (!this.socket || !socketIsOpen(this.socket, this.WebSocket) || typeof this.socket.send !== "function") return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.reportError({ type: "error", code: "SEND_FAILED", message: "Unable to send a co-op intent" });
      return false;
    }
  }

  setConnectionState(nextState) {
    if (this.connectionState === nextState) return;
    this.connectionState = nextState;
    this.onConnectionChange(nextState);
  }

  reportError(error) {
    this.onError(error);
  }
}
