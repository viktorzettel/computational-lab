import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const python = join(
  root,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}).`);
}
try {
  run(windows ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"]);
  if (!existsSync(python))
    run(windows ? "python" : "python3", ["-m", "venv", join(root, ".venv")]);
  run(python, ["-m", "pip", "install", "-r", "backend/requirements.txt"]);
  console.log("WhaleWatch is ready. Run npm start.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
