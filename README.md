# Durable Actors + Mastra

A multiplayer AI chat demo built with Elysia, Mastra, and Durable Actors.

Elysia serves the UI and grants WebSocket access. Each chat has one durable actor
that owns its conversation history, connected clients, and Mastra agent turns.
Replies stream directly from the actor to everyone in the room.

## Run

Requires [Bun 1.4.2+](https://bun.sh) and your own OpenAI API key.

```sh
bun install --frozen-lockfile
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. Mastra uses `OPENAI_MODEL`, defaulting to
`gpt-5-mini`. Every reply calls OpenAI.

Start the actors:

```sh
bun run dev:actors
```

Wait for `Ready`, then start Elysia in another terminal:

```sh
bun run dev
```

Open [localhost:8000](http://127.0.0.1:8000). Open the same chat ID in two browser
tabs to see shared replies. Change the chat ID to start a separate conversation.
Reload after a reply finishes to restore the saved history.
Use the reset icon beside **Open** to clear the current chat for everyone in the room.

Press **⌘N** to split the active pane above/below, or **⌘M** to split it side by
side. The header buttons do the same thing (and work when a browser reserves a
shortcut). Click a pane to focus it; use **×** to close it. Each new pane opens the
same chat, so replies stay in sync. Change its chat ID to open a separate room.

Both processes read `.env`. The first actor start downloads the Durable Actors
runtime. Actor state is stored locally in `.durable-actors/` and survives restarts.
Use `PORT` to change the Elysia port. To change the actor port, set
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
   |----------------- user message -------------------->|                    |
   |<---------------- start event ----------------------|                    |
   |                                                    |-- Mastra stream -->|
   |                                                    |   history + prompt |
   |<---------------- text deltas ----------------------|<-- streamed text --|
   |<---------------- done event -----------------------|                    |
   |                                                    |                    |
   |                                             Persist conversation        |
   |                                             when handler returns        |
```

- [Elysia backend](src/backend.ts): serves the page and static assets, validates chat
  IDs, and returns uncached connection grants from `POST /api/chat/:chatId/socket`.
- [Chat actor](src/actors.ts): sends history on connection, processes one turn at a
  time, and broadcasts `start`, `delta`, and `done` events to the room. Its `reset()`
  method clears saved messages and broadcasts an empty history.
- [Mastra agent](src/actors.ts): streams concise, helpful responses with the saved
  messages. Durable Actors owns persistence, so no Mastra memory store is needed.
- [Browser client](static/chat.js): connects directly to the actor, streams text,
  and switches rooms.
- [Pane layout](static/panes.js): splits the active chat view and handles shortcuts.

After streaming, the actor saves both the user message and reply. New connections
wait for an active turn to finish before receiving history; streams are not resumed
after a process restart.

Rooms are shared by ID and have no authentication. Add authentication and chat
ownership checks to the connection-grant route before using private conversations.

## Development

```sh
bun run generate  # Regenerate typed actor clients after changing the contract
bun run check     # TypeScript
```

Commit `generated/` after regeneration; do not edit it by hand. Commit `bun.lock`
when updating dependencies. `bun run start` runs Elysia without file watching.

Built with [Durable Actors](https://github.com/TerseAI/durable-actors),
[Elysia](https://elysiajs.com), and [Mastra](https://mastra.ai/docs/agents/overview).
