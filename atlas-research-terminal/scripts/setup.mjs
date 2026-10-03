import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const venvPython = join(
  root,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);

function pythonVersion(command) {
  const result = spawnSync(
    command,
    ["-c", 'import sys; print("%d.%d" % sys.version_info[:2])'],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  const match =
    result.status === 0 && result.stdout?.trim().match(/^(\d+)\.(\d+)$/);
  return match && { major: Number(match[1]), minor: Number(match[2]) };
}

function supportedPython(command) {
  const version = pythonVersion(command);
  return (
    version &&
    (version.major > 3 || (version.major === 3 && version.minor >= 10))
  );
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: windows && command === "npm",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(
            `${command} stopped ${signal ? `with ${signal}` : `with exit code ${code}`}.`,
          ),
        );
    });
  });
}

try {
  if (Number(process.versions.node.split(".")[0]) < 20) {
    throw new Error(
      "FinanceBro requires Node.js 20 or newer. Install a current Node.js LTS release, then run npm run setup again.",
    );
  }

  console.log("\nFinanceBro — local environment setup\n");
  if (!existsSync(venvPython)) {
    const configuredPython =
      process.env.FINANCEBRO_PYTHON || process.env.ATLAS_PYTHON;
    const candidates = configuredPython
      ? [configuredPython]
      : ["python3", "python"];
    const python = candidates.find(supportedPython);
    if (!python) {
      throw new Error(
        "Python 3.10 or newer is required. Install Python and try again, or set FINANCEBRO_PYTHON to its executable path.",
      );
    }
    console.log(`Creating an isolated Python environment with ${python}…`);
    await run(python, ["-m", "venv", ".venv"]);
  } else if (!supportedPython(venvPython)) {
    throw new Error(
      "The existing .venv uses an unsupported Python version. Rename or remove .venv, then run npm run setup with Python 3.10 or newer.",
    );
  }

  if (!existsSync(join(root, "backend", "requirements.txt"))) {
    throw new Error(
      "backend/requirements.txt is missing. Run setup from a complete FinanceBro checkout.",
    );
  }
  console.log("Installing backend dependencies in .venv…");
  await run(venvPython, [
    "-m",
    "pip",
    "--disable-pip-version-check",
    "install",
    "--cache-dir",
    join(root, ".venv", ".cache", "pip"),
    "-r",
    "backend/requirements.txt",
  ]);

  if (
    !existsSync(join(root, "node_modules", "vite", "bin", "vite.js")) ||
    !existsSync(join(root, "node_modules", "typescript", "bin", "tsc"))
  ) {
    console.log("Installing frontend dependencies…");
    await run("npm", ["install"]);
  } else {
    console.log("Frontend dependencies are already installed.");
  }

  console.log(
    "\nSetup complete. Run npm start, then open http://127.0.0.1:5173.\n",
  );
} catch (error) {
  console.error(`\nSetup failed: ${error.message}\n`);
  process.exitCode = 1;
}
