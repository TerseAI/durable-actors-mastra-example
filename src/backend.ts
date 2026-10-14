/** Serve the page and grant permission to connect directly to an actor. */
import { staticPlugin } from "@elysia/static";
import { Elysia, t } from "elysia";

import { actors } from "../generated/index.js";

const chatParams = t.Object({ chatId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) });

export const app = new Elysia()
  .use(staticPlugin({ assets: "static", prefix: "/static" }))
  .get("/", () => Bun.file("static/index.html"))
  .post(
    "/api/chat/:chatId/socket",
    ({ params }) => actors.ChatHistory.prepareWebsocket({ actorId: params.chatId, metadata: null }),
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
