import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const venvPython = join(
  root,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);
const viteEntrypoint = join(root, "node_modules", "vite", "bin", "vite.js");
const children = [];
let stopping = false;
let forceTimer;

function portAvailable(port) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `Port ${port} is already in use. Stop the other process before starting FinanceBro.`
            : `Cannot listen on 127.0.0.1:${port}: ${error.message}`,
        ),
      );
    });
    server.listen(port, "127.0.0.1", () => server.close(resolvePort));
  });
}

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  try {
    child.kill(signal);
  } catch (error) {
    if (error.code !== "ESRCH")
      console.error(`Could not stop process ${child.pid}: ${error.message}`);
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) signalChild(child, "SIGTERM");
  forceTimer = setTimeout(() => {
    for (const child of children) signalChild(child, "SIGKILL");
  }, 4000);
  forceTimer.unref();
}

function launch(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  children.push(child);
  child.once("error", (error) => {
    console.error(`${label} could not start: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `${label} stopped ${signal ? `with ${signal}` : `with exit code ${code}`}. Stopping FinanceBro.`,
      );
      stop(code || 1);
    }
    if (
      children.every(
        (entry) => entry.exitCode !== null || entry.signalCode !== null,
      )
    )
      clearTimeout(forceTimer);
  });
  return child;
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
process.once("SIGHUP", () => stop());
process.on("exit", () => {
  for (const child of children) signalChild(child, "SIGTERM");
});

try {
  if (!existsSync(venvPython) || !existsSync(viteEntrypoint)) {
    throw new Error("Local dependencies are missing. Run npm run setup first.");
  }
  const check = spawnSync(
    venvPython,
    ["-c", "import fastapi, uvicorn, yfinance, httpx, numpy, pandas"],
    { cwd: root, encoding: "utf8" },
  );
  if (check.status !== 0) {
    throw new Error(
      "Backend dependencies are missing from .venv. Run npm run setup first.",
    );
  }
  await Promise.all([portAvailable(8000), portAvailable(5173)]);
  console.log(
    `\nFinanceBro — ${(process.env.FINANCEBRO_DATA_MODE || process.env.ATLAS_DATA_MODE) === "demo" ? "sample data" : "live providers with labeled fallback"}`,
  );
  console.log("Terminal: http://127.0.0.1:5173");
  console.log("API docs: http://127.0.0.1:8000/docs");
  console.log("Press Ctrl+C to stop both services.\n");

  launch("Backend", venvPython, [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ]);
  launch("Frontend", process.execPath, [
    viteEntrypoint,
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
    "--clearScreen",
    "false",
  ]);
} catch (error) {
  console.error(`\nCannot start FinanceBro: ${error.message}\n`);
  stop(1);
}
