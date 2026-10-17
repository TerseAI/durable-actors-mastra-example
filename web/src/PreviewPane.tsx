import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import type { ChatSession } from "./chatSession";

type PreviewState = "connecting" | "idle" | "starting" | "ready" | "stopped" | "error";

const stateLabels: Record<PreviewState, string> = {
  connecting: "Connecting",
  idle: "No sandbox",
  starting: "Starting sandbox",
  ready: "Live",
  stopped: "Sandbox stopped",
  error: "Sandbox error",
};

/** Accepts bare hosts like `abc.modal.host`; rejects anything that isn't http(s). */
function parseUrl(input: string) {
  const text = input.trim();
  if (!text) return;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return;
  }
}

export function PreviewPane({ session }: { session: ChatSession }) {
  const { connection, preview } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const url = preview?.status === "ready" ? preview.url : "";
  const state: PreviewState = preview?.status ?? (connection === "connecting" ? "connecting" : "idle");
  const [address, setAddress] = useState(url);
  const [reloads, setReloads] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => setAddress(url), [url]);
  useEffect(() => setLoading(Boolean(url)), [url, reloads]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = parseUrl(address);
    if (!next) return;
    if (next === url) setReloads(count => count + 1);
    else session.setPreviewUrl(next);
  }

  return (
    <section className="preview" aria-label="App preview" data-state={state} data-loading={loading || undefined}>
      <header className="preview-bar">
        <span className="connection" data-state={state} role="status" title={stateLabels[state]}>
          <span className="sr-only">{stateLabels[state]}</span>
        </span>
        <form className="address" onSubmit={onSubmit}>
          <input
            aria-label="Preview URL"
            placeholder="Waiting for the sandbox, or paste a URL"
            spellCheck={false}
            autoComplete="off"
            value={address}
            onChange={event => setAddress(event.target.value)}
          />
        </form>
        <div className="pane-tools" role="group" aria-label="Preview controls">
          <button type="button" aria-label="Reload preview" title="Reload preview" disabled={!url} onClick={() => setReloads(count => count + 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
          <a className="icon-link" aria-label="Open preview in a new tab" title="Open in a new tab" href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url || undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
          </a>
        </div>
      </header>
      <div className="preview-body">
        {url && (
          <iframe
            key={`${url}#${reloads}`}
            src={url}
            title="Sandbox preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            onLoad={() => setLoading(false)}
          />
        )}
        <div className="preview-empty" role="status">
          <div className="loading-mascot"><img src="/armadillo.png" width="96" height="96" alt="" /><span className="loading-ground" /></div>
          <p data-copy="connecting">Connecting to the agent<span aria-hidden="true">…</span></p>
          <p data-copy="idle">This chat has no sandbox yet. Its preview will show up here.</p>
          <p data-copy="starting">Starting the sandbox<span aria-hidden="true">…</span></p>
          <p data-copy="ready">Loading the preview<span aria-hidden="true">…</span></p>
          <p data-copy="stopped">The sandbox stopped.</p>
          <p data-copy="error">{preview?.status === "error" ? preview.message : "The sandbox failed to start."}</p>
        </div>
      </div>
    </section>
  );
}
