/** Renders a Pi conversation view: the committed transcript, then the live generation. */
import type { AssistantMessage, ToolCall, UserMessage } from "@earendil-works/pi-ai";
import type { ConversationView, LiveState } from "@earendil-works/pi-durable";

type ToolStatus = "running" | "done" | "error" | "interrupted";

const toolStatusLabels: Record<ToolStatus, string> = {
  running: "Running",
  done: "Finished",
  error: "Failed",
  interrupted: "Interrupted",
};

export function Transcript({ view }: { view: ConversationView }) {
  const live = view.docs["pi.live"] as LiveState | undefined;
  const partial = live?.generation?.message as AssistantMessage | undefined;
  const results = new Map<string, boolean>();
  for (const entry of view.entries) {
    const message = entry.model?.[0];
    if (message?.role === "toolResult") results.set(message.toolCallId, message.isError);
  }
  const toolStatus = (call: ToolCall): ToolStatus => {
    const isError = results.get(call.id);
    if (isError !== undefined) return isError ? "error" : "done";
    return live?.run ? "running" : "interrupted";
  };

  // Consecutive assistant entries form one turn under a single speaker label.
  let continued = false;
  const rows = view.entries.map(entry => {
    if (entry.kind === "pi.user") {
      continued = false;
      return (
        <article key={entry.id} className="message user">
          <div className="speaker">You</div>
          <div className="content">{userText(entry.model![0] as UserMessage)}</div>
        </article>
      );
    }
    if (entry.kind !== "pi.assistant") return null;
    const row = (
      <article key={entry.id} className="message assistant" data-continued={continued || undefined}>
        {!continued && <div className="speaker">Assistant</div>}
        <AssistantParts message={entry.model![0] as AssistantMessage} toolStatus={toolStatus} />
      </article>
    );
    continued = true;
    return row;
  });
  const visible = partial?.content.some(part => part.type === "toolCall" || (part.type === "text" && part.text));

  return (
    <>
      {rows}
      {live?.run && (
        <article className="message assistant pending" data-continued={continued || undefined}>
          {!continued && <div className="speaker">Assistant</div>}
          {partial && <AssistantParts message={partial} toolStatus={toolStatus} />}
          {!visible && <div className="content" />}
        </article>
      )}
    </>
  );
}

function userText(message: UserMessage) {
  return typeof message.content === "string"
    ? message.content
    : message.content.map(part => part.type === "text" ? part.text : "").join("");
}

function AssistantParts({ message, toolStatus }: { message: AssistantMessage; toolStatus: (call: ToolCall) => ToolStatus }) {
  return message.content.map((part, index) => {
    if (part.type === "text") return part.text && <div key={index} className="content">{part.text}</div>;
    if (part.type === "toolCall") return <ToolCallRow key={index} call={part} status={toolStatus(part)} />;
    return null;
  });
}

/** The most telling argument, like a command or a path, shown beside the tool name. */
function toolSummary(args: ToolCall["arguments"]) {
  for (const key of ["command", "cmd", "path", "file_path", "filePath", "pattern", "query", "url"]) {
    if (typeof args[key] === "string") return args[key];
  }
  return Object.values(args).find((value): value is string => typeof value === "string");
}

function ToolCallRow({ call, status }: { call: ToolCall; status: ToolStatus }) {
  const summary = toolSummary(call.arguments);
  return (
    <div className="tool-call" data-status={status}>
      <span className="tool-icon" aria-hidden="true">
        {status === "running" && <span className="tool-spinner" />}
        {status === "done" && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
        )}
        {(status === "error" || status === "interrupted") && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        )}
      </span>
      <span className="tool-name">{call.name}</span>
      {summary && <span className="tool-summary" title={summary}>{summary}</span>}
      <span className="tool-status">{toolStatusLabels[status]}</span>
    </div>
  );
}
