/** Run the backend and the Vite app together; when either exits, stop both. */
import { spawn } from "bun";

const children = [
  spawn(["bun", "run", "dev:backend"], { stdio: ["ignore", "inherit", "inherit"] }),
  spawn(["bun", "run", "dev:web"], { stdio: ["inherit", "inherit", "inherit"] }),
];

const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const code = await Promise.race(children.map(child => child.exited));
stop();
process.exit(code);
