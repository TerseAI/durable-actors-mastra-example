import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";

import type { ChatSession, Connection, ToolCall } from "./chatSession";

export type SplitDirection = "horizontal" | "vertical";

type Props = {
  session: ChatSession;
  active: boolean;
  autoFocus: boolean;
  onActivate: () => void;
  onSplit: (direction: SplitDirection) => void;
  onClose: () => void;
};

const connectionLabels: Record<Connection, string> = {
  connecting: "Connecting",
  connected: "Connected",
  crashed: "Actor crashed",
};

const toolStatusLabels: Record<ToolCall["status"], string> = {
  running: "Running",
  done: "Finished",
  error: "Failed",
  interrupted: "Interrupted",
};

/** The most telling argument, like a command or a path, shown beside the tool name. */
function toolSummary(args: ToolCall["args"]) {
  if (!args) return;
  for (const key of ["command", "cmd", "path", "file_path", "filePath", "pattern", "query", "url"]) {
    if (typeof args[key] === "string") return args[key];
  }
  return Object.values(args).find((value): value is string => typeof value === "string");
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const summary = toolSummary(call.args);
  return (
    <div className="tool-call" data-status={call.status}>
      <span className="tool-icon" aria-hidden="true">
        {call.status === "running" && <span className="tool-spinner" />}
        {call.status === "done" && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
        )}
        {(call.status === "error" || call.status === "interrupted") && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        )}
      </span>
      <span className="tool-name">{call.toolName}</span>
      {summary && <span className="tool-summary" title={summary}>{summary}</span>}
      <span className="tool-status">{toolStatusLabels[call.status]}</span>
    </div>
  );
}

export function ChatPane({ session, active, autoFocus, onActivate, onSplit, onClose }: Props) {
  const { chatId, connection, busy, messages, draft } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [room, setRoom] = useState(chatId);
  const scrollArea = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const ready = connection === "connected";

  useEffect(() => session.start(), [session]);
  useEffect(() => setRoom(chatId), [chatId]);

  useEffect(() => {
    if (!active) return;
    const url = new URL(location.href);
    url.searchParams.set("chat", chatId);
    history.replaceState(null, "", url);
  }, [active, chatId]);

  useLayoutEffect(() => {
    const area = scrollArea.current;
    if (area && followReply.current) area.scrollTop = area.scrollHeight;
  }, [messages]);

  function onScroll() {
    const area = scrollArea.current!;
    followReply.current = area.scrollHeight - area.clientHeight - area.scrollTop < 96;
  }

  async function send() {
    const prompt = draft.trim();
    if (!ready || busy || !prompt) return;
    followReply.current = true;
    session.setDraft("");
    if (!(await session.prompt(prompt))) session.setDraft(session.getSnapshot().draft || prompt);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  function onRoomSubmit(event: FormEvent) {
    event.preventDefault();
    followReply.current = true;
    session.open(room);
  }

  return (
    <section
      className="pane"
      aria-label={`Chat: ${chatId}`}
      data-state={connection}
      data-active={active || undefined}
      onPointerDown={onActivate}
      onFocus={onActivate}
    >
      <header className="topbar">
        <div className="brand-group">
          <img className="brand-mark" src="/armadillo.png" width="38" height="38" alt="Armadillo" />
          <a className="brand" href="/">Durable Actors Chat</a>
          <span className="connection" data-state={connection} role="status" title={connectionLabels[connection]}>
            <span className="sr-only">{connectionLabels[connection]}</span>
          </span>
        </div>
        <form className="room-controls" onSubmit={onRoomSubmit}>
          <input
            aria-label="Chat ID"
            placeholder="enter in the id"
            maxLength={64}
            pattern="[a-zA-Z0-9_\-]+"
            required
            value={room}
            onChange={event => setRoom(event.target.value)}
          />
          <button type="submit">Open</button>
          <button
            className="reset"
            type="button"
            aria-label="Reset chat"
            title="Reset chat"
            disabled={!ready || busy}
            onClick={() => void session.reset()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </form>
        <div className="pane-tools" role="group" aria-label="Pane controls">
          <button type="button" data-action="horizontal" aria-label="Split horizontally" aria-keyshortcuts="Meta+N" title="Split horizontally · ⌘N" onClick={() => onSplit("horizontal")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18" /></svg>
          </button>
          <button type="button" data-action="vertical" aria-label="Split vertically" aria-keyshortcuts="Meta+M" title="Split vertically · ⌘M" onClick={() => onSplit("vertical")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></svg>
          </button>
          <button type="button" data-action="close" aria-label="Close pane" title="Close pane" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>
      <div className="workspace">
        <div ref={scrollArea} className="scroll-area" onScroll={onScroll}>
          <div className="messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
            {messages.map((message, index) => {
              // Text and tool calls from one assistant turn share a single speaker label.
              const continued = message.role !== "user" && index > 0 && messages[index - 1].role !== "user";
              return (
                <article
                  key={index}
                  className={`message ${message.role}${message.status ? ` ${message.status}` : ""}`}
                  data-continued={continued || undefined}
                >
                  {!continued && <div className="speaker">{message.role === "user" ? "You" : "Assistant"}</div>}
                  {message.role === "tool" ? <ToolCallRow call={message} /> : <div className="content">{message.content}</div>}
                </article>
              );
            })}
          </div>
        </div>
        <div className="composer-area">
          <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}>
            <textarea
              aria-label="Your message"
              rows={2}
              maxLength={8000}
              placeholder="Send a message…"
              required
              autoFocus={autoFocus}
              value={draft}
              onChange={event => session.setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <button className="send" type="submit" disabled={!ready || busy || !draft.trim()}>
              Send <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
            </button>
          </form>
          <div className="shortcut-hint"><span><kbd>⌘ N</kbd> split down</span><span><kbd>⌘ M</kbd> split right</span></div>
        </div>
        <div className="loading" role="status">
          <div className="loading-mascot"><img src="/armadillo.png" width="128" height="128" alt="" /><span className="loading-ground" /></div>
          <p className="loading-copy" data-copy="connecting">Getting your chat ready<span className="loading-dots" aria-hidden="true">…</span></p>
          <p className="loading-copy" data-copy="crashed">The actor crashed</p>
        </div>
      </div>
    </section>
  );
}
