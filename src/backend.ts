/** Chat API: grant permission to connect directly to an actor, and call into it. */
import { Elysia, t } from "elysia";

import { actors } from "../generated/index.js";

const chatParams = t.Object({ chatId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) });
const chatBody = t.Object({ prompt: t.String({ minLength: 1, maxLength: 10_000 }) });

export const app = new Elysia()
  .post(
    "/api/chat/:chatId/socket",
    ({ params }) => actors.PiAgent.prepareWebsocket({ actorId: params.chatId, metadata: null }),
    { params: chatParams },
  )
  .post(
    "/api/chat/:chatId/reset",
    async ({ params, set }) => {
      await actors.PiAgent.get(params.chatId).reset();
      set.status = 204;
    },
    { params: chatParams },
  )
  .post("/api/chat/:chatId/prompt",
    async ({ params, body, set }) => {
      await actors.PiAgent.get(params.chatId).prompt(body.prompt);
      set.status = 204;
    },
    { params: chatParams, body: chatBody },
  )
  .post("/api/chat/:chatId/meteor", 
    async ({ params, set }) => {
    await actors.PiAgent.get(params.chatId).ringGoesInMountDoom();
    set.status = 204;
  }, { params: chatParams });

if (import.meta.main) {
  app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8000) });
  console.log(`Durable Actors Chat API: http://127.0.0.1:${app.server!.port}`);
}
