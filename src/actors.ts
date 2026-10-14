/** One actor owns each conversation, its sockets, and its agent loop. */
import { Agent } from "@mastra/core/agent";
import { Actor, type ActorSocket, Persisted } from "durable-actors";

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };
export type ChatEvent =
  | { type: "history"; messages: Message[] }
  | { type: "start"; prompt: string }
  | { type: "delta"; text: string }
  | { type: "done" };

const agent = new Agent({
  id: "chat",
  name: "Chat",
  instructions: "Be a concise, helpful assistant.",
  model: `openai/${process.env.OPENAI_MODEL || "gpt-5-mini"}`,
});

export class ChatHistory extends Actor<null, string, ChatEvent> {
  @Persisted private messages: Message[] = [];

  async load() {
    return this.messages;
  }

  async reset() {
    this.messages = [];
    this.broadcast({ type: "history", messages: this.messages });
  }

  async onConnect(socket: ActorSocket<null, ChatEvent>) {
    socket.send({ type: "history", messages: this.messages });
  }

  // Keep the default ordered execution: a turn completes before the next begins.
  async onMessage(_socket: ActorSocket<null, ChatEvent>, message: string) {
    if (!message.trim()) return;
    this.broadcast({ type: "start", prompt: message });

    const result = await agent.stream([...this.messages, { role: "user", content: message }]);
    for await (const text of result.textStream) {
      this.broadcast({ type: "delta", text });
    }
    this.messages.push(
      { role: "user", content: message },
      { role: "assistant", content: await result.text },
    );
    this.broadcast({ type: "done" });
  }
}
