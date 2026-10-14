/** Owns one pane's actor socket outside React, so panes keep their connection when the layout changes. */

// Mirrors the event types in src/actors.ts.
export type Message = { role: "user" | "assistant"; content: string };
type ChatEvent =
  | { type: "history"; messages: Message[] }
  | { type: "start"; prompt: string }
  | { type: "delta"; text: string }
  | { type: "done" };

export type Connection = "connecting" | "connected" | "crashed";
export type ChatMessage = Message & { status?: "pending" | "interrupted" };
export type ChatSnapshot = {
  chatId: string;
  connection: Connection;
  busy: boolean;
  messages: ChatMessage[];
  draft: string;
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
    this.update({ chatId, messages: [], draft: "" });
    void this.connect();
  }

  setDraft(draft: string) {
    this.update({ draft });
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
        message.status === "pending" ? { ...message, status: "interrupted" } : message),
    });
  }

  private receive(event: ChatEvent) {
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
      case "done":
        this.update({
          busy: false,
          messages: messages.map(({ status, ...message }) => status === "pending" ? message : { ...message, status }),
        });
        break;
    }
  }
}
