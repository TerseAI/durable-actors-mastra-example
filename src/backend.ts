/** Serve the page and grant permission to connect directly to an actor. */
import { Elysia, t } from "elysia";

import { actors } from "../generated/index.js";

const staticFile = (name: string) => Bun.file(new URL(`../static/${name}`, import.meta.url));
const chatParams = t.Object({ chatId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) });

export const app = new Elysia()
  .get("/", () => staticFile("index.html"))
  .get("/static/index.html", () => staticFile("index.html"))
  .get("/static/style.css", () => staticFile("style.css"))
  .get("/static/chat.js", () => staticFile("chat.js"))
  .get("/static/panes.js", () => staticFile("panes.js"))
  .get("/static/armadillo.png", () => staticFile("armadillo.png"))
  .post(
    "/api/chat/:chatId/socket",
    async ({ params, set }) => {
      const grant = await actors.ChatHistory.prepareWebsocket({ actorId: params.chatId, metadata: null });
      set.headers["Cache-Control"] = "no-store";
      return grant;
    },
    { params: chatParams },
  )
  .post(
    "/api/chat/:chatId/reset",
    async ({ params, set }) => {
      await actors.ChatHistory.get(params.chatId).reset();
      set.status = 204;
    },
    { params: chatParams },
  );

if (import.meta.main) {
  app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8000) });
  console.log(`Durable Actors Chat: http://127.0.0.1:${app.server!.port}`);
}
