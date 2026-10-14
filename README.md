# Durable Actors + Mastra

A multiplayer AI chat demo built with Elysia, Mastra, and Durable Actors.

A Vite + React app in `web/` talks to an Elysia API, which grants WebSocket access
and forwards prompts. Each chat has one durable actor
that owns its conversation history, connected clients, and Mastra agent turns.
Replies stream directly from the actor to everyone in the room.

## Run

Requires [Bun 1.4.2+](https://bun.sh) and your own OpenAI API key.

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd web
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. Mastra uses `OPENAI_MODEL`, defaulting to
`gpt-5-mini`. Every reply calls OpenAI.

Start the actors:

```sh
bun run dev:actors
```

Wait for `Ready`, then start Elysia and the Vite app in another terminal:

```sh
bun run dev
```

Open [localhost:5173](http://localhost:5173) to start an independent chat. Open the
same chat ID in two browser tabs to see shared replies.
Reload after a reply finishes to restore the saved history.
Use the reset icon beside **Open** to clear the current chat for everyone in the room.

Press **⌘N** to split the active pane above/below, or **⌘M** to split it side by
side. The header buttons do the same thing (and work when a browser reserves a
shortcut). Click a pane to focus it; use **×** to close it. Each new pane starts
an independent chat. Enter the same chat ID in multiple panes to share a room.

Both processes read `.env`. The first actor start downloads the Durable Actors
runtime. Actor state is stored locally in `.durable-actors/` and survives restarts.
Use `PORT` to change the Elysia port; Vite proxies `/api` to it. To change the actor port, set
`DURABLE_ACTORS_PORT` and update `DURABLE_ACTORS_CONTROL_PLANE_URL` to match.

## Architecture

```text
Browser                 Elysia                  ChatHistory actor          OpenAI
   |                       |                     (one per chat ID)           |
   |-- request socket ---->|                            |                    |
   |                       |-- prepare WebSocket ------>|                    |
   |                       |<-- connection grant -------|                    |
   |<-- WebSocket URL -----|                            |                    |
   |                                                    |                    |
   |================ direct WebSocket =================>|                    |
   |<---------------- saved history --------------------|                    |
   |                                                    |                    |
   |-- POST prompt ------->|                            |                    |
   |                       |-- prompt() --------------->|                    |
   |<---------------- start event ----------------------|                    |
   |                                                    |-- Mastra stream -->|
   |                                                    |   history + prompt |
   |<---------------- text deltas ----------------------|<-- streamed text --|
   |<---------------- done event -----------------------|                    |
   |                                                    |                    |
   |                                             Persist conversation        |
   |                                             when handler returns        |
```

- [Elysia backend](src/backend.ts): validates chat IDs, returns connection grants
  from `POST /api/chat/:chatId/socket`, and forwards prompts from
  `POST /api/chat/:chatId/prompt` to the actor.
- [Chat actor](src/actors.ts): sends history on connection, processes one turn at a
  time, and broadcasts `start`, `delta`, and `done` events to the room. Its `reset()`
  method clears saved messages and broadcasts an empty history.
- [Mastra agent](src/actors.ts): streams concise, helpful responses with the saved
  messages. Durable Actors owns persistence, so no Mastra memory store is needed.
- [Chat session](web/src/chatSession.ts): connects directly to the actor, streams
  text, sends prompts, and switches rooms. Lives outside React so panes keep their
  socket when the layout changes.
- [Chat pane](web/src/ChatPane.tsx) and [pane layout](web/src/App.tsx): render a chat
  and split the active pane; handle shortcuts.

After streaming, the actor saves both the user message and reply. New connections
wait for an active turn to finish before receiving history; streams are not resumed
after a process restart.

Rooms are shared by ID and have no authentication. Add authentication and chat
ownership checks to the connection-grant route before using private conversations.

## Development

```sh
bun run generate  # Regenerate typed actor clients after changing the contract
bun run check     # TypeScript (backend)
bun run --cwd web check  # TypeScript (web app)
```

Commit `generated/` after regeneration; do not edit it by hand. Commit both
`bun.lock` files when updating dependencies. `bun run start` runs the Elysia API
without file watching; `bun run --cwd web build` builds the web app into `web/dist`.

Built with [Durable Actors](https://github.com/TerseAI/durable-actors),
[Elysia](https://elysiajs.com), and [Mastra](https://mastra.ai/docs/agents/overview).
