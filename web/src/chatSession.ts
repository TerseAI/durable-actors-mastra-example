/** Owns one pane's actor socket outside React, so panes keep their connection when the layout changes. */

// Mirrors the event types in src/actors.ts.
export type Message = { role: "user" | "assistant"; content: string };
export type Preview =
  | { status: "starting" }
  | { status: "ready"; url: string }
  | { status: "stopped" }
  | { status: "error"; message: string };
// `toolCallId`, `args`, and `isError` are optional extras; calls pair by `toolCallId`, then `taskId`, then name.
type ToolEvent = { toolName: string; taskId?: string; toolCallId?: string };
type ChatEvent =
  | { type: "history"; messages: Message[] }
  | { type: "start"; prompt: string }
  | { type: "delta"; text: string }
  | ({ type: "tool_start"; args?: Record<string, unknown> } & ToolEvent)
  | ({ type: "tool_end"; isError?: boolean } & ToolEvent)
  | { type: "done" };

export type Connection = "connecting" | "connected" | "crashed";
export type ToolCall = {
  role: "tool";
  id?: string;
  toolName: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error" | "interrupted";
};
export type ChatMessage = (Message & { status?: "pending" | "interrupted" }) | ToolCall;
export type ChatSnapshot = {
  chatId: string;
  connection: Connection;
  busy: boolean;
  messages: ChatMessage[];
  draft: string;
  /** Unset until the actor reports its sandbox. */
  preview?: Preview;
};

export const chatIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;

export function newChatId() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => (byte % 36).toString(36)).join("");
  return `chat_${suffix}`;
}

const chatUrl = (chatId: string, action: string) => `/api/chat/${encodeURIComponent(chatId)}/${action}`;

export class ChatSession {
  private socket?: WebSocket;
  private generation = 0;
  private started = false;
  private listeners = new Set<() => void>();
  private snapshot: ChatSnapshot;

  constructor(chatId: string) {
    this.snapshot = { chatId, connection: "connecting", busy: false, messages: [], draft: "" };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  /** Safe to call on every mount; only the first call connects. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.connect();
  }

  open(chatId: string) {
    this.update({ chatId, messages: [], draft: "", preview: undefined });
    void this.connect();
  }

  setDraft(draft: string) {
    this.update({ draft });
  }

  /** Points the preview at any URL, until the actor reports its own. */
  setPreviewUrl(url: string) {
    this.update({ preview: { status: "ready", url } });
  }

  /** Replies stream back over the socket; this only reports whether the actor accepted the prompt. */
  async prompt(prompt: string) {
    this.update({ busy: true });
    try {
      const response = await fetch(chatUrl(this.snapshot.chatId, "prompt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error(`Prompt failed: ${response.status}`);
      return true;
    } catch (error) {
      console.error(error);
      this.update({ busy: false });
      return false;
    }
  }

  async reset() {
    await fetch(chatUrl(this.snapshot.chatId, "reset"), { method: "POST" });
  }

  close() {
    ++this.generation;
    this.socket?.close();
  }

  private update(patch: Partial<ChatSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private async connect() {
    const current = ++this.generation;
    this.socket?.close();
    this.update({ connection: "connecting", busy: false });

    try {
      const response = await fetch(chatUrl(this.snapshot.chatId, "socket"), { method: "POST" });
      if (!response.ok) throw new Error(`Socket grant failed: ${response.status}`);
      const grant: { websocketUrl: string } = await response.json();
      if (current !== this.generation) return;

      // Elysia grants access; events stream directly from the durable actor.
      const socket = new WebSocket(grant.websocketUrl);
      this.socket = socket;
      socket.onmessage = ({ data }) => {
        if (current === this.generation) this.receive(JSON.parse(data));
      };
      socket.onclose = () => {
        if (current === this.generation) this.crash();
      };
    } catch (error) {
      console.error(error);
      if (current === this.generation) this.crash();
    }
  }

  private crash() {
    this.update({
      connection: "crashed",
      busy: false,
      messages: this.snapshot.messages.map(message =>
        message.status === "pending" || message.status === "running" ? { ...message, status: "interrupted" } : message),
    });
  }

  private receive(event: ChatEvent | Preview) {
    if ("status" in event) {
      this.update({ preview: event });
      return;
    }
    const { messages } = this.snapshot;
    switch (event.type) {
      case "history":
        this.update({ connection: "connected", busy: false, messages: event.messages });
        break;
      case "start":
        this.update({
          busy: true,
          messages: [
            ...messages,
            { role: "user", content: event.prompt, status: "pending" },
            { role: "assistant", content: "", status: "pending" },
          ],
        });
        break;
      case "delta": {
        const last = messages.at(-1);
        if (last?.role !== "assistant" || last.status !== "pending") break;
        this.update({ messages: [...messages.slice(0, -1), { ...last, content: last.content + event.text }] });
        break;
      }
      case "tool_start": {
        // The call slots in after any text streamed so far; later text continues in a fresh segment below it.
        const last = messages.at(-1);
        const kept = last?.role === "assistant" && last.status === "pending" && !last.content ? messages.slice(0, -1) : messages;
        this.update({
          busy: true,
          messages: [
            ...kept,
            { role: "tool", id: event.toolCallId ?? event.taskId, toolName: event.toolName, args: event.args, status: "running" },
            { role: "assistant", content: "", status: "pending" },
          ],
        });
        break;
      }
      case "tool_end": {
        const id = event.toolCallId ?? event.taskId;
        const running = (message: ChatMessage): message is ToolCall => message.role === "tool" && message.status === "running";
        let index = id ? messages.findLastIndex(message => running(message) && message.id === id) : -1;
        if (index < 0) index = messages.findLastIndex(message => running(message) && message.toolName === event.toolName);
        const call = messages[index];
        if (call?.role !== "tool") break;
        this.update({ messages: messages.with(index, { ...call, status: event.isError ? "error" : "done" }) });
        break;
      }
      case "done":
        this.update({ busy: false, messages: settle(messages) });
        break;
    }
  }
}

/** Finalizes a turn: drops the empty segment a trailing tool call leaves behind. */
function settle(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap((message, index): ChatMessage[] => {
    if (message.role === "tool") return [message.status === "running" ? { ...message, status: "done" } : message];
    if (message.status !== "pending") return [message];
    if (!message.content && messages[index - 1]?.role === "tool") return [];
    const { status, ...settled } = message;
    return [settled];
  });
}
