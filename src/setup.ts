#!/usr/bin/env node

import "dotenv/config";

import * as p from "@clack/prompts";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { OPENAI_CONFIG, GEMINI_CONFIG } from "./config.js";

// ─── Path Resolution ──────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const EXAMPLES_DIR = join(PACKAGE_ROOT, "examples", "claude-commands");

// ─── Helpers ──────────────────────────────────────────────────────────

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(homedir(), input.slice(2));
  }
  return input;
}

function isCloneContext(): boolean {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.name === "counsel-of-models-mcp";
  } catch {
    return false;
  }
}

function isNpxContext(): boolean {
  const normalized = PACKAGE_ROOT.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/_npx/") || normalized.includes("\\_npx\\")
    || normalized.includes("/.npm/") || normalized.includes("\\.npm\\");
}

function mergeEnvFile(envPath: string, updates: Record<string, string>): string {
  const managedKeys = new Set(Object.keys(updates));
  let existingLines: string[] = [];

  if (existsSync(envPath)) {
    existingLines = readFileSync(envPath, "utf-8").split("\n");
  }

  // Preserve lines that aren't managed keys
  const preserved = existingLines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return true;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return true;
    const key = trimmed.substring(0, eqIdx).trim();
    return !managedKeys.has(key);
  });

  // Build new content: preserved lines + managed keys
  const lines = [
    ...preserved,
    "",
    "# Managed by counsel-mcp-setup",
  ];

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      lines.push(`${key}=${value}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildRegistrationArgs(): string[] {
  // Try global binary first, fall back to node + path
  try {
    execFileSync("counsel-mcp", ["--help"], { stdio: "pipe", timeout: 3000 });
    return ["mcp", "add", "--scope", "user", "counsel-mcp", "--", "counsel-mcp"];
  } catch {
    const indexPath = join(__dirname, "index.js");
    return ["mcp", "add", "--scope", "user", "counsel-mcp", "--", "node", indexPath];
  }
}

function copyTemplates(targetDir: string): boolean {
  const counselSrc = join(EXAMPLES_DIR, "counsel.md");
  const refineSrc = join(EXAMPLES_DIR, "refine.md");

  if (!existsSync(counselSrc) || !existsSync(refineSrc)) {
    p.log.error(
      `Template files not found in ${EXAMPLES_DIR}.\n` +
        "If you installed via npm, try reinstalling: npm install -g counsel-of-models-mcp"
    );
    return false;
  }

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(counselSrc, join(targetDir, "counsel.md"));
  copyFileSync(refineSrc, join(targetDir, "refine.md"));

  p.log.success(`Copied counsel.md -> ${targetDir}`);
  p.log.success(`Copied refine.md  -> ${targetDir}`);
  return true;
}

function cancel() {
  p.cancel("Setup cancelled.");
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  p.intro("Counsel of Models - Setup");

  const inClone = isCloneContext();
  const inNpx = isNpxContext();

  if (inNpx) {
    p.log.warn(
      "Running from a temporary npx cache. MCP registration paths may break when the cache clears.\n" +
        "   For a stable installation, run: npm install -g counsel-of-models-mcp"
    );
  }

  // ─── Step 1: API Keys ───────────────────────────────────────────────

  if (inClone) {
    p.log.info("Clone detected. Keys will be saved to .env in this directory (gitignored).");
  } else {
    p.log.info(
      "Global install detected. Keys should be set in your shell profile (~/.bashrc or ~/.zshrc).\n" +
        "   The wizard will set them in memory for verification, but won't write a .env file."
    );
  }

  // Check for existing keys in environment
  const existingOpenAI = process.env[OPENAI_CONFIG.apiKeyEnvVar];
  const existingGemini =
    process.env[GEMINI_CONFIG.apiKeyEnvVar] || process.env["GOOGLE_API_KEY"];

  let openaiKey: string | undefined = existingOpenAI;
  let geminiKey: string | undefined = existingGemini;

  // ─── OpenAI Key ─────────────────────────────────────────────────────

  if (existingOpenAI) {
    const keepOpenAI = await p.confirm({
      message: `OpenAI key found (${existingOpenAI.substring(0, 8)}...). Keep it?`,
      initialValue: true,
    });
    if (p.isCancel(keepOpenAI)) return cancel();
    if (!keepOpenAI) openaiKey = undefined;
  }

  if (!openaiKey) {
    const action = await p.select({
      message: "OpenAI API key:",
      options: [
        { value: "enter", label: "Enter key now" },
        { value: "skip", label: "Skip OpenAI (you can add it later)" },
      ],
    });
    if (p.isCancel(action)) return cancel();

    if (action === "enter") {
      const key = await p.password({
        message: "OpenAI API key (from platform.openai.com/api-keys):",
        validate: (v) => {
          if (!v || v.trim().length === 0) return "Key is required";
        },
      });
      if (p.isCancel(key)) return cancel();
      openaiKey = key;
      process.env[OPENAI_CONFIG.apiKeyEnvVar] = key;
    }
  }

  // ─── Gemini Key ─────────────────────────────────────────────────────

  if (existingGemini) {
    const keepGemini = await p.confirm({
      message: `Gemini key found (${existingGemini.substring(0, 8)}...). Keep it?`,
      initialValue: true,
    });
    if (p.isCancel(keepGemini)) return cancel();
    if (!keepGemini) geminiKey = undefined;
  }

  if (!geminiKey) {
    const action = await p.select({
      message: "Gemini API key:",
      options: [
        { value: "enter", label: "Enter key now" },
        { value: "skip", label: "Skip Gemini (you can add it later)" },
      ],
    });
    if (p.isCancel(action)) return cancel();

    if (action === "enter") {
      const key = await p.password({
        message: "Gemini API key (from aistudio.google.com/apikey):",
        validate: (v) => {
          if (!v || v.trim().length === 0) return "Key is required";
        },
      });
      if (p.isCancel(key)) return cancel();
      geminiKey = key;
      process.env[GEMINI_CONFIG.apiKeyEnvVar] = key;
    }
  }

  if (!openaiKey && !geminiKey) {
    p.log.error("At least one provider key is required. Re-run the wizard when you have a key.");
    p.outro("Setup incomplete.");
    process.exit(1);
  }

  if (!openaiKey || !geminiKey) {
    const missing = !openaiKey ? "OpenAI" : "Gemini";
    p.log.warn(`${missing} skipped. Cross-validation works best with both providers.`);
  }

  // ─── Write .env (clone context only) ────────────────────────────────

  if (inClone) {
    const envPath = join(process.cwd(), ".env");
    const updates: Record<string, string> = {};
    if (openaiKey) updates["OPENAI_API_KEY"] = openaiKey;
    if (geminiKey) updates["GEMINI_API_KEY"] = geminiKey;

    const envContent = mergeEnvFile(envPath, updates);
    writeFileSync(envPath, envContent, "utf-8");
    p.log.success(".env file saved.");
  } else {
    // Global install — show the export commands
    const exportLines: string[] = [];
    if (openaiKey) exportLines.push(`export OPENAI_API_KEY="${openaiKey}"`);
    if (geminiKey) exportLines.push(`export GEMINI_API_KEY="${geminiKey}"`);

    if (exportLines.length > 0) {
      p.note(
        "Add these lines to your ~/.bashrc or ~/.zshrc:\n\n" +
          exportLines.join("\n") +
          "\n\nThen reload: source ~/.bashrc",
        "Shell profile setup"
      );
    }
  }

  // ─── Step 2: Verify Providers ───────────────────────────────────────

  const s = p.spinner();
  let openaiOk = false;
  let geminiOk = false;

  if (openaiKey) {
    // Dynamic import after env vars are set
    const { askOpenAI } = await import("./providers/openai.js");

    s.start("Testing OpenAI...");
    try {
      const result = await askOpenAI("Reply with exactly: OK");
      if (result.text) {
        openaiOk = true;
        s.stop(`OpenAI connected (${result.model})`);
      } else {
        s.stop(`OpenAI failed: ${result.error || "empty response"}`);
      }
    } catch (e) {
      s.stop(`OpenAI failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (geminiKey) {
    const { askGemini } = await import("./providers/gemini.js");

    s.start("Testing Gemini...");
    try {
      const result = await askGemini("Reply with exactly: OK");
      if (result.text) {
        geminiOk = true;
        s.stop(`Gemini connected (${result.model})`);
      } else {
        s.stop(`Gemini failed: ${result.error || "empty response"}`);
      }
    } catch (e) {
      s.stop(`Gemini failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // At least one key was provided (enforced above), check if any verification passed
  const anyProviderConfigured = openaiKey || geminiKey;
  const anyProviderOk = openaiOk || geminiOk;

  if (anyProviderConfigured && !anyProviderOk) {
    p.log.error("All configured providers failed. Check your API keys and try again.");
    p.outro("Setup incomplete.");
    process.exit(1);
  }

  // ─── Step 3: MCP Registration ──────────────────────────────────────

  let claudeAvailable = false;
  try {
    execFileSync("claude", ["--version"], { stdio: "pipe" });
    claudeAvailable = true;
  } catch {
    claudeAvailable = false;
  }

  if (claudeAvailable) {
    // Check if already registered
    let alreadyRegistered = false;
    try {
      const mcpList = execFileSync("claude", ["mcp", "list"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      alreadyRegistered = mcpList.includes("counsel-mcp");
    } catch {
      // claude mcp list failed — skip registration check
    }

    if (alreadyRegistered) {
      p.log.success("counsel-mcp is already registered with Claude Code.");
    } else {
      const shouldRegister = await p.confirm({
        message: "Register counsel-mcp with Claude Code? (recommended)",
        initialValue: true,
      });

      if (p.isCancel(shouldRegister)) return cancel();

      if (shouldRegister) {
        s.start("Registering with Claude Code...");
        const regArgs = buildRegistrationArgs();
        const regCmd = `claude ${regArgs.join(" ")}`;

        try {
          execFileSync("claude", regArgs, { stdio: "pipe" });
          s.stop("Registered! counsel-mcp is available in all Claude Code sessions.");
        } catch {
          s.stop("Registration failed.");
          p.log.warn(`Could not auto-register. Run this manually:\n   ${regCmd}`);
        }
      }
    }
  } else {
    p.log.warn(
      "Claude Code CLI not found on PATH.\n" +
        "   Install it from claude.ai/code, then register manually:\n" +
        "   claude mcp add --scope user counsel-mcp -- counsel-mcp"
    );
  }

  // ─── Step 4: Copy Templates to a Project ───────────────────────────

  const shouldSetupProject = await p.confirm({
    message: "Set up /counsel and /refine commands in a project now?",
    initialValue: true,
  });

  if (p.isCancel(shouldSetupProject)) return cancel();

  let templatesCopied = true;

  if (shouldSetupProject) {
    p.log.info(
      "Enter the folder where your project lives — the one you open in your editor.\n" +
        "   Example: ~/Documents/my-app  or  C:\\Users\\you\\Projects\\my-app"
    );

    const projectPath = await p.text({
      message: "Where is your project folder?",
      placeholder: "~/Documents/my-project",
      validate: (v) => {
        if (!v || v.trim().length === 0) return "Please enter a folder path";
        const resolved = resolve(expandHome(v.trim()));
        if (!existsSync(resolved)) return `Folder not found: ${resolved}`;
        if (!statSync(resolved).isDirectory()) return `That's a file, not a folder: ${resolved}`;
      },
    });

    if (p.isCancel(projectPath)) return cancel();

    const targetDir = join(resolve(expandHome(projectPath.trim())), ".claude", "commands");

    // Check for existing commands
    const counselExists = existsSync(join(targetDir, "counsel.md"));
    const refineExists = existsSync(join(targetDir, "refine.md"));

    if (counselExists || refineExists) {
      const overwrite = await p.confirm({
        message: "Existing /counsel or /refine commands found. Overwrite? (backups saved as .bak)",
        initialValue: false,
      });

      if (p.isCancel(overwrite)) return cancel();

      if (!overwrite) {
        p.log.info("Skipped — existing commands preserved.");
      } else {
        if (counselExists) {
          copyFileSync(
            join(targetDir, "counsel.md"),
            join(targetDir, "counsel.md.bak")
          );
        }
        if (refineExists) {
          copyFileSync(
            join(targetDir, "refine.md"),
            join(targetDir, "refine.md.bak")
          );
        }
        p.log.info("Backups saved as .bak files.");
        templatesCopied = copyTemplates(targetDir);
      }
    } else {
      templatesCopied = copyTemplates(targetDir);
    }
  }

  // ─── Done ──────────────────────────────────────────────────────────

  if (!templatesCopied) {
    p.log.warn("Template copying failed. See error above.");
    p.outro("Setup partially complete.");
    process.exit(1);
  }

  const nextSteps: string[] = [];

  if (openaiOk && geminiOk) {
    nextSteps.push("Both providers working");
  } else if (openaiOk || geminiOk) {
    nextSteps.push(
      `${openaiOk ? "OpenAI" : "Gemini"} working (add the other provider for cross-validation)`
    );
  }

  if (shouldSetupProject) {
    nextSteps.push("Start a new Claude Code session in your project");
  } else {
    nextSteps.push("Copy templates to a project later with: counsel-mcp-setup");
  }

  nextSteps.push("Try: /counsel to cross-validate an implementation plan");

  p.note(nextSteps.join("\n"), "Next steps");
  p.outro("Happy building!");
}

main().catch((err) => {
  p.log.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
