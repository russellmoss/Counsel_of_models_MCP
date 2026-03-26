# Agentic Implementation Guide v3: Workflow Layer + npm Publish

## Reference

This guide adds the workflow layer and npm publishing to the existing Counsel of Models MCP server. The MCP server (tools layer) is already built and working. This guide adds:

1. Support for both `GEMINI_API_KEY` and `GOOGLE_API_KEY` env var names (code fix)
2. Example Claude Code command templates in `examples/claude-commands/` — a setup wizard, a generic `/counsel`, and a generic `/refine` that work out of the box
3. A QA phase that verifies the wizard and templates actually work in Claude Code
4. npm publish setup so users can `npm install -g counsel-of-models-mcp`
5. Updated README with npm install as primary method + workflow layer docs
6. Updated QUICKSTART with npm install as primary method + Step 6 for workflow setup

**Remote**: `https://github.com/russellmoss/Counsel_of_models_MCP`
**Branch**: `master`
**npm package**: `counsel-of-models-mcp` (confirmed available)
**npm account**: `~mossrussell`
**Existing state**: Fully built and tested MCP server with `ask_openai`, `ask_gemini`, `ask_all` tools. See `actual_implementation.md` for complete details.

## Pre-Flight Checklist

```bash
git status
# Expected: on master branch

ls README.md QUICKSTART.md actual_implementation.md
# Expected: all three exist

ls src/providers/gemini.ts src/config.ts
# Expected: both exist

ls examples/ 2>/dev/null
# Expected: directory does not exist yet (we're creating it)

node --version
# Expected: v18+ (v24.14.0 or similar)

npm --version
# Expected: 9+
```

---

# PHASE 1: Fix GEMINI_API_KEY / GOOGLE_API_KEY Support

## Context

Many Google/Gemini tutorials use `GOOGLE_API_KEY` as the env var name, but our code only reads `GEMINI_API_KEY`. This is the #1 predicted newcomer onboarding failure (identified by cross-LLM counsel review). We'll support both names, preferring `GEMINI_API_KEY` if both are set.

## Step 1.1: Update src/providers/gemini.ts

**Claude Code prompt**: "Edit `src/providers/gemini.ts` to support both `GEMINI_API_KEY` and `GOOGLE_API_KEY` environment variables. Prefer `GEMINI_API_KEY` if both are set. Update the error message to mention both names."

Find the `getClient()` function and replace the API key lookup:

**Current code** (lines 7-19 of `src/providers/gemini.ts`):

```typescript
function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env[GEMINI_CONFIG.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(
        `Missing ${GEMINI_CONFIG.apiKeyEnvVar} environment variable. ` +
          `Set it in your shell profile (~/.bashrc or ~/.zshrc) or in a .env file.`
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
```

**Replace with**:

```typescript
function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey =
      process.env[GEMINI_CONFIG.apiKeyEnvVar] ||
      process.env["GOOGLE_API_KEY"];
    if (!apiKey) {
      throw new Error(
        `Missing Gemini API key. Set either ${GEMINI_CONFIG.apiKeyEnvVar} or GOOGLE_API_KEY ` +
          `in your shell profile (~/.bashrc or ~/.zshrc) or in a .env file.`
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
```

## Step 1.2: Update .env.example

**Claude Code prompt**: "Update `.env.example` to mention that `GOOGLE_API_KEY` also works."

**Replace the Gemini comment line**:

```
# Get your Google Gemini API key from https://aistudio.google.com/apikey
# Either GEMINI_API_KEY or GOOGLE_API_KEY works — set one of them
GEMINI_API_KEY=your-key-here
```

## Step 1.3: Build and smoke test

**Claude Code prompt**: "Run `npm run rebuild` to compile the changes, then `npm run smoke` to verify both providers still work."

```bash
npm run rebuild
# Expected: clean compilation, no errors

npm run smoke
# Expected: both providers pass
# ✅ OpenAI OK (model: gpt-5.4)
# ✅ Gemini OK (model: gemini-3.1-pro-preview)
# === Results: 2 passed, 0 failed ===
```

## PHASE 1 — VALIDATION GATE

```bash
# Verify the code change compiled correctly
npm run rebuild 2>&1 | tail -1
# Expected: no error output (clean compile)

# Verify both providers work with the new code
npm run smoke
# Expected: 2 passed, 0 failed

# Verify the dual-key support is in the compiled output
grep -c "GOOGLE_API_KEY" dist/providers/gemini.js
# Expected: 1+ (the fallback env var name is present)

# Verify .env.example mentions both names
grep -c "GOOGLE_API_KEY" .env.example
# Expected: 1
```

**STOP AND REPORT**: Tell the user:
- "Phase 1 complete: `GEMINI_API_KEY` / `GOOGLE_API_KEY` dual support added."
- "Build and smoke test passed."
- "Ready to proceed to Phase 2?"

---

# PHASE 2: Create examples/claude-commands/ with Templates

## Context

We're shipping three files in `examples/claude-commands/`:

1. **`setup-counsel.md`** — Interactive wizard that generates tailored `/counsel` and `/refine` commands. This is the "upgrade path" for users who want project-specific review prompts.
2. **`counsel.md`** — Generic, ready-to-use `/counsel` command that works for any project out of the box. Users copy it, it works immediately.
3. **`refine.md`** — Generic, ready-to-use `/refine` command that works alongside the generic counsel command.

Users copy whichever files they want into their project's `.claude/commands/` directory. The generic templates work instantly; the wizard generates more tailored versions.

## Step 2.1: Create the directory

```bash
mkdir -p examples/claude-commands
```

## Step 2.2: Create examples/claude-commands/counsel.md

**Claude Code prompt**: "Create `examples/claude-commands/counsel.md` — a generic `/counsel` command that works for any project. This is a Claude Code slash command file. It should read the project's implementation plan or guide, send it to GPT and Gemini for cross-validation, synthesize the feedback, and write it to `counsel-feedback.md`."

**File**: `examples/claude-commands/counsel.md`

```markdown
# /counsel — Cross-LLM Review of Implementation Plan

<!-- Generated by Counsel of Models MCP | https://github.com/russellmoss/Counsel_of_models_MCP -->
<!-- Version: 1.0.0 | Date: 2026-03-26 -->
<!-- This is the generic template. For a project-tailored version, use /setup-counsel -->

You are running a cross-validation workflow. Your job is to send the implementation plan for this project to GPT and Gemini for adversarial review, then synthesize their feedback for the user.

## Step 1: Find the implementation plan

Look for these files in the project (check in this order):
- Any file matching `*implementation*guide*.md`
- Any file matching `*build*guide*.md`
- Any file matching `*implementation*plan*.md`
- `ARCHITECTURE.md` or `DESIGN.md`
- Any recent `.md` file that looks like a plan or guide

If no plan is found, ask the user: "Which file should I send for cross-LLM review?"

Also read these files if they exist (they provide project context):
- `README.md`
- `package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, or equivalent
- Any existing `counsel-feedback.md` (to see what was already reviewed)

## Step 2: Read all relevant files

Read the implementation plan and all context files found above. You need the full picture before constructing review prompts.

**Important**: Do NOT read `.env`, `node_modules/`, `dist/`, `.git/`, or any file likely to contain secrets.

## Step 3: Investigate the project

Before constructing prompts, silently investigate:
- Read the top-level directory listing and `src/` (or equivalent source folder)
- Identify the tech stack, key dependencies, and project purpose
- Note any existing tests, CI config, or deployment setup

Keep investigation bounded — only read config files and source directory listings, not entire codebases.

## Step 4: Send review prompts

Tell the user: "Sending to OpenAI and Gemini for cross-validation..."

Construct and send these prompts. Send them in parallel where possible using `ask_openai` and `ask_gemini` separately (not `ask_all`) so you can tailor each prompt.

### Prompt A — Send to `ask_openai` (with reasoning_effort: "high")

> You are a senior engineer reviewing an implementation plan.
>
> Context: [Brief description of the project based on what you learned]
>
> Here is the implementation plan:
> [FULL plan text — do not summarize or truncate]
>
> Review for:
> 1. **Missing steps** — Things the plan assumes are done but never tells you to do
> 2. **Wrong paths or commands** — File paths, CLI invocations, or code that won't work
> 3. **Phase ordering problems** — Circular dependencies or steps that should come earlier/later
> 4. **Ambiguous instructions** — Where would someone (or an LLM) get stuck or make a wrong assumption?
> 5. **Missing error handling** — What happens when things fail? Are failure paths covered?
>
> Structure your response as:
> - **CRITICAL** (will break the build or mislead users — must fix before execution)
> - **SHOULD FIX** (won't break things but will cause problems in practice)
> - **DESIGN QUESTIONS** (need the builder's input — include tradeoffs for each option)
>
> For each issue: state what's wrong, where it is (phase/step number), and what the fix should be.

Tell the user: "OpenAI review sent. Waiting for response..."

### Prompt B — Send to `ask_gemini`

> You are a senior engineer challenging an implementation plan from a design perspective.
>
> Context: [Brief description of the project based on what you learned]
>
> Here is the implementation plan:
> [FULL plan text — do not summarize or truncate]
>
> Challenge this plan:
> 1. **Is the approach right?** — Are there simpler or more robust alternatives?
> 2. **What's missing from the architecture?** — Error recovery, edge cases, security, observability?
> 3. **What happens when things break?** — Dependencies update, APIs change, users make mistakes?
> 4. **Business logic assumptions** — Are calculations, data interpretations, and user flows correct?
> 5. **What questions should the builder be asking that they aren't?**
>
> Structure your response as:
> - **CRITICAL** (will break the build or mislead users — must fix before execution)
> - **SHOULD FIX** (won't break things but will cause problems in practice)
> - **DESIGN QUESTIONS** (need the builder's input — include tradeoffs for each option)
>
> For each issue: state what's wrong, where it is, and what the fix should be.

Tell the user: "Gemini review sent. Waiting for response..."

## Step 5: Synthesize feedback

After receiving all responses, tell the user: "Both reviews received. Synthesizing..."

Create a file called `counsel-feedback.md` in the project root with:

1. **Critical Issues** — Things that are wrong or will break (from any reviewer)
2. **Design Questions** — Open questions the user should answer before proceeding
3. **Suggested Improvements** — Good ideas ranked by impact vs effort
4. **Things to Consider** — Points raised that aren't urgent but worth thinking about
5. **Raw Responses** — The full text from each reviewer, labeled

## Step 6: Present to the user

Show the user:
- A short summary of what the reviewers found (3-5 bullet points)
- The critical issues (if any)
- The design questions that need answers
- Tell them: "Review the full feedback in `counsel-feedback.md`. Answer the design questions above, then run `/refine` to apply the feedback to the plan."

**Stop here. Do not modify any files other than `counsel-feedback.md`. Wait for the user.**
```

## Step 2.3: Create examples/claude-commands/refine.md

**Claude Code prompt**: "Create `examples/claude-commands/refine.md` — a generic `/refine` command that reads counsel feedback and the user's answers to design questions, then updates the implementation plan."

**File**: `examples/claude-commands/refine.md`

```markdown
# /refine — Apply Counsel Feedback to Implementation Plan

<!-- Generated by Counsel of Models MCP | https://github.com/russellmoss/Counsel_of_models_MCP -->
<!-- Version: 1.0.0 | Date: 2026-03-26 -->
<!-- This is the generic template. For a project-tailored version, use /setup-counsel -->

You are applying cross-LLM review feedback to an implementation plan. Read the feedback, triage it, apply what's clear, and ask about what isn't.

## Prerequisites

You need two things to exist before running this command:
1. An implementation plan (the file that was reviewed by `/counsel`)
2. `counsel-feedback.md` (created by the `/counsel` command)

If either is missing, tell the user and stop.

## Step 1: Read everything

Read:
- The implementation plan file
- `counsel-feedback.md`
- The conversation history (the user's answers to design questions are in the conversation above)

## Step 2: Triage feedback

Sort every piece of feedback into one of three buckets:

### Apply Immediately (no human input needed)
- Missing files or functions that need updating
- Wrong file paths or names
- Incorrect field names, API calls, or commands
- Pattern inconsistencies (align with established patterns)
- Missing NULL/edge case handling
- Missing error handling
- Phase ordering fixes

### Apply Based on User's Answers
- Business logic interpretation choices
- Design tradeoffs where multiple approaches are valid
- Any item flagged as a "Design Question" in the counsel feedback
- Items where the user gave a clear answer in the conversation

### Note but Don't Apply
- Nice-to-have suggestions that expand scope beyond what was originally planned
- Alternative approaches where the current approach is valid
- Items the user explicitly declined when answering design questions
- Suggestions that would require significant architectural changes

## Step 3: Apply changes

Edit the implementation plan directly:
- Find the exact location of each issue
- Make the change
- If the change affects a validation gate, update the gate too
- If the change affects phase ordering, reorder as needed

## Step 4: Append a Refinement Log

At the bottom of the implementation plan, append:

```
---

## Refinement Log

**Date**: [today's date]
**Source**: counsel-feedback.md (GPT + Gemini cross-validation)

### Changes Applied
- [List each change: what was wrong, what was fixed, which reviewer caught it]

### Design Decisions
- [List each design question and the user's answer with rationale]

### Noted but Not Applied
- [List items that were acknowledged but deferred, with reason]
```

## Step 5: Self-review

Read the entire updated plan from top to bottom. Verify:
- Phase ordering is still consistent
- No step references a file or function that was renamed/moved
- Validation gates still match what the steps produce
- The refinement log accurately reflects all changes

## Step 6: Report

Tell the user:
- What changed (bullet list)
- What design decisions were made
- What was noted but not applied
- "The plan is updated. You can run `/counsel` again on the refined plan for another round, or proceed to execution."

**Stop here. Do not begin executing the plan. Wait for the user.**
```

## Step 2.4: Create examples/claude-commands/setup-counsel.md

**Claude Code prompt**: "Create `examples/claude-commands/setup-counsel.md` — the interactive wizard that generates project-specific `/counsel` and `/refine` commands."

**File**: `examples/claude-commands/setup-counsel.md`

```markdown
# /setup-counsel — Generate Project-Specific Counsel Commands

<!-- Counsel of Models MCP | https://github.com/russellmoss/Counsel_of_models_MCP -->
<!-- This is a one-time generator. After it creates your commands, you can delete this file. -->

You are an interactive setup wizard that generates project-specific `/counsel` and `/refine` slash commands for this project. You will ask the user a few questions, then create tailored orchestration files that use the counsel-mcp MCP server.

## Step 1: Verify MCP Server

First, confirm the counsel-mcp server is available by checking that you can see the `ask_openai`, `ask_gemini`, and `ask_all` tools. Do NOT make a test API call — just check tool availability.

If the tools are NOT available, tell the user:

"The counsel-mcp MCP server isn't registered yet. You need to register it first.

If you installed via npm:
```
claude mcp add --scope user counsel-mcp -- counsel-mcp
```

If you cloned the repo:
```
claude mcp add --scope user counsel-mcp -- node /path/to/Counsel_of_models_MCP/dist/index.js
```

Then start a **new** Claude Code session and run `/setup-counsel` again."

Stop here if the server isn't available. Do not proceed without it.

## Step 2: Check which providers are available

Silently test which providers work by checking for tool availability. Note whether `ask_openai`, `ask_gemini`, and `ask_all` are all present.

If only one provider's tool is available, note this — you'll generate commands that use only that provider and tell the user what they're missing.

## Step 3: Learn About the Project

Before asking questions, silently investigate the project. **Only read these files** — do not explore broadly:
- `package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, or equivalent build config
- `README.md` or `README.*`
- Top-level directory listing (just `ls`, not recursive)
- `.claude/commands/` directory (to check for existing commands)

**Do NOT read**: `.env`, `.env.*`, `node_modules/`, `dist/`, `build/`, `.git/`, or any file likely to contain secrets.

Then ask these questions conversationally. Confirm what you already figured out rather than asking from scratch. Do NOT dump all questions at once — have a conversation.

**Question 1**: "I can see this is a [tech stack] project. What does it do in a nutshell?"

Listen for: the project's purpose, who uses it, what kind of data it handles.

**Question 2**: "When you're building a new feature, what are the parts most likely to go wrong or cause bugs?"

Listen for: database/schema changes, type safety, data integrity, API contracts, UI state management, business logic correctness, performance, security, CSV/export issues, etc. These become the focus areas for the counsel prompts.

**Question 3**: "Who uses what you build, and what would a bad bug look like for them?"

Listen for: internal team, external customers, daily users, financial data sensitivity, etc. This determines how aggressive the business logic review should be.

**Question 4**: "Do you have an existing workflow for planning features — like exploration docs, build guides, design docs, architecture decision records? What files does that workflow produce?"

Listen for: existing slash commands like /new-feature, /build-guide, or manual processes. This determines what files the counsel command should look for.

If the user has no existing workflow, that's fine — counsel can still review any implementation plan, PR, or set of code changes.

**Question 5**: "Is there anything specific you always want the external models to check? For example, 'always verify SQL field names exist' or 'always challenge the business logic assumptions' or 'always check for missing error handling'?"

Listen for: project-specific review criteria that should always be included.

## Step 4: Check for existing commands

Before generating files, check if `.claude/commands/counsel.md` or `.claude/commands/refine.md` already exist.

If either file exists:
- Tell the user: "I found existing `/counsel` and/or `/refine` commands. Do you want me to overwrite them? I'll save backups as `.bak` files first."
- If the user says yes, copy existing files to `counsel.md.bak` / `refine.md.bak` before overwriting
- If the user says no, ask what filenames they'd prefer (e.g., `counsel-v2.md`)

## Step 5: Create the commands directory

```bash
mkdir -p .claude/commands
```

## Step 6: Generate counsel.md

Based on the user's answers, generate `.claude/commands/counsel.md`.

Include this header at the top:

```markdown
<!-- Generated by /setup-counsel | Counsel of Models MCP -->
<!-- Date: [today's date] -->
<!-- Tailored for: [project name from Q1] -->
<!-- To regenerate, run /setup-counsel again -->
```

### Structure Rules:
- Start with a clear description of what the command does
- List the prerequisite files the command expects to find (based on Q4)
- Include a step to verify the counsel-mcp server is available
- Include a step to read ALL relevant documents before constructing prompts
- Build 2-3 review prompts, each targeting a different risk area (based on Q2)
- Each prompt must include the FULL text of the documents being reviewed — do not summarize or truncate
- Each prompt must tell the external model exactly how to structure its response (Critical / Should Fix / Design Questions)
- Map prompts to the right provider based on the risk area table below
- For OpenAI calls that involve deep analysis, set reasoning_effort to "high"
- Include progress reporting: tell the user what's happening at each step ("Sending to OpenAI...", "Waiting for Gemini...", "Synthesizing feedback...")
- Include a synthesis step that merges all feedback into `counsel-feedback.md`
- End by presenting critical issues and design questions to the user, and tell them to run `/refine` after answering
- If only one provider is available, generate commands that use only that provider and note what cross-validation they're missing

### Risk Area → Prompt Mapping:

| Risk Area | What the Prompt Should Focus On | Best Provider |
|---|---|---|
| Type safety / missing code paths | Find every construction site for modified types, verify all files are covered | OpenAI |
| Database / query correctness | Verify field names exist, NULL handling, query performance | OpenAI |
| Business logic | Challenge assumptions, check calculations, verify data interpretation | Gemini |
| Data quality / exports | Edge cases in data (nulls, special chars, long text), CSV integrity | Gemini |
| API contracts / backwards compat | Breaking changes, error handling, response shape consistency | OpenAI |
| UI / display logic | Will the data make sense to end users, formatting, sort orders | Gemini |
| Security / auth | Permission checks, data exposure, injection risks | OpenAI |
| Pattern consistency | Compare against existing codebase patterns, flag drift | OpenAI |

Pick the 2-3 most relevant based on the user's answers. Don't include all of them.

### Prompt Template:

Each review prompt should follow this pattern:

```
You are a senior engineer reviewing [WHAT] for [PURPOSE].

Context: [BRIEF PROJECT DESCRIPTION FROM Q1]
Users: [WHO USES IT FROM Q3]

You have been given the following documents:
[LIST THE DOCUMENTS AND WHAT EACH ONE CONTAINS]

Review for:

1. [SPECIFIC RISK AREA]: [DETAILED DESCRIPTION OF WHAT TO CHECK]
2. [SPECIFIC RISK AREA]: [DETAILED DESCRIPTION OF WHAT TO CHECK]
3. [SPECIFIC RISK AREA]: [DETAILED DESCRIPTION OF WHAT TO CHECK]

[ANY ALWAYS-CHECK ITEMS FROM Q5]

Structure your response as:
- CRITICAL (will break the build or mislead users — must fix before execution)
- SHOULD FIX (won't break things but will cause problems in practice)
- DESIGN QUESTIONS (need the builder's input before proceeding — include the tradeoffs for each option)

For each issue: state what's wrong, where it is, and what the fix should be.

[FULL DOCUMENT TEXT BELOW]
```

## Step 7: Generate refine.md

Generate `.claude/commands/refine.md` based on the same project context.

Include the same header format as counsel.md.

### Structure Rules:
- Start with prerequisites: the implementation plan file + counsel-feedback.md
- Step 1: Read all files AND the conversation history (user's answers to design questions are in the conversation)
- Step 2: Triage feedback into "apply immediately" (no ambiguity), "apply based on user's answers" (design decisions), and "note but don't apply" (scope expansions)
- Step 3: Edit the implementation plan directly — find exact locations, make changes, update validation gates if affected
- Step 4: Append a Refinement Log documenting every change made and every design decision with rationale
- Step 5: Self-review — read the plan top to bottom, verify consistency
- Step 6: Report what changed and provide the execution command

### Triage Rules to Include:

**Apply Immediately** (no human input needed):
- Missing files or functions that need updating
- Wrong file paths or names
- Incorrect field names or SQL
- Pattern inconsistencies (align with established patterns)
- Missing NULL/edge case handling
- Missing error handling

**Apply Based on User's Answers**:
- Field labels and display formatting
- Sort orders and default visibility
- Business logic interpretation choices
- Calculation formula choices
- Any item flagged as a "Design Question" in the counsel feedback

**Note but Don't Apply**:
- Nice-to-have suggestions that expand scope beyond what was originally requested
- Alternative approaches where the current approach is valid
- Items the user explicitly declined when answering design questions

## Step 8: Confirm and Test

After creating both files, tell the user:

"Done! I created two slash commands for this project:

- **`/counsel`** — Sends your [list the specific document types] to GPT and Gemini for cross-validation
- **`/refine`** — Updates your plan based on their feedback and your answers to design questions

**Generated commands contain no secrets — commit them to git** so your whole team uses the same review workflow.

**To verify:** Exit this session, start a new Claude Code session in this directory, and type `/counsel` — you should see it autocomplete. Same for `/refine`.

**Your workflow is now:**
[LIST THEIR SPECIFIC WORKFLOW FROM Q4, WITH /counsel AND /refine INSERTED]

You can delete `.claude/commands/setup-counsel.md` now — it was just the generator."
```

## PHASE 2 — VALIDATION GATE

```bash
# Verify all three files exist
ls examples/claude-commands/counsel.md
ls examples/claude-commands/refine.md
ls examples/claude-commands/setup-counsel.md
# Expected: all three exist

# Verify counsel.md has the key sections
grep -c "Step 1: Find the implementation plan" examples/claude-commands/counsel.md
grep -c "Send review prompts" examples/claude-commands/counsel.md
grep -c "Synthesize feedback" examples/claude-commands/counsel.md
grep -c "counsel-feedback.md" examples/claude-commands/counsel.md
# Expected: 1+ for each

# Verify refine.md has the key sections
grep -c "Triage feedback" examples/claude-commands/refine.md
grep -c "Apply Immediately" examples/claude-commands/refine.md
grep -c "Refinement Log" examples/claude-commands/refine.md
# Expected: 1+ for each

# Verify setup-counsel.md has the key sections
grep -c "Verify MCP Server" examples/claude-commands/setup-counsel.md
grep -c "Learn About the Project" examples/claude-commands/setup-counsel.md
grep -c "Generate counsel.md" examples/claude-commands/setup-counsel.md
grep -c "Generate refine.md" examples/claude-commands/setup-counsel.md
grep -c "existing commands" examples/claude-commands/setup-counsel.md
# Expected: 1+ for each

# Verify version headers are present
grep -c "Version:" examples/claude-commands/counsel.md
grep -c "Version:" examples/claude-commands/refine.md
# Expected: 1 each

# Verify setup-counsel has overwrite detection
grep -c "\.bak" examples/claude-commands/setup-counsel.md
# Expected: 1+

# Verify setup-counsel has progress reporting guidance
grep -c "Sending to" examples/claude-commands/setup-counsel.md || grep -c "progress" examples/claude-commands/setup-counsel.md
# Expected: 1+

# Verify setup-counsel has bounded investigation rules
grep -c "Do NOT read" examples/claude-commands/setup-counsel.md
# Expected: 1+
```

**STOP AND REPORT**: Tell the user:
- "Phase 2 complete: three template files created in `examples/claude-commands/`."
- "  - `counsel.md` — generic, works for any project out of the box"
- "  - `refine.md` — generic, works alongside counsel.md"
- "  - `setup-counsel.md` — interactive wizard for tailored commands"
- "Ready to proceed to Phase 3 (QA)?"

---

# PHASE 3: QA — Verify Commands Work in Claude Code

## Context

Before updating any docs, we need to verify the wizard and templates actually work. We'll copy them into this repo's own `.claude/commands/` and verify they're discoverable. This is the QA phase that was missing from the previous guide version.

## Step 3.1: Copy generic templates to this repo's .claude/commands/

**Claude Code prompt**: "Copy the generic counsel.md and refine.md into this project's `.claude/commands/` directory so we can verify they work. Also copy setup-counsel.md for testing."

```bash
mkdir -p .claude/commands
cp examples/claude-commands/counsel.md .claude/commands/counsel.md
cp examples/claude-commands/refine.md .claude/commands/refine.md
cp examples/claude-commands/setup-counsel.md .claude/commands/setup-counsel.md
```

## Step 3.2: Verify slash commands are discoverable

**Claude Code prompt**: "Exit this Claude Code session and start a new one. Verify that `/counsel`, `/refine`, and `/setup-counsel` appear in autocomplete. Then come back and report."

**Manual verification steps** (the user or agent must do this):

1. Exit the current Claude Code session
2. Start a new Claude Code session in this project directory
3. Type `/counsel` — it should autocomplete
4. Type `/refine` — it should autocomplete
5. Type `/setup-counsel` — it should autocomplete
6. Do NOT run any of them yet — just verify they appear

If any command doesn't appear:
- Verify the files are in `.claude/commands/` (not `examples/claude-commands/`)
- Verify the filenames have no extra extensions
- Try exiting and re-entering Claude Code

## Step 3.3: Quick functional test of /counsel

**Claude Code prompt**: "Run `/counsel` to verify it works end-to-end. It should find the `agentic_guide_implementation.md` file in this project, send it to GPT and Gemini, and create `counsel-feedback.md`. This tests the real workflow."

Expected behavior:
- The command reads the implementation guide
- It sends prompts to OpenAI and Gemini (you should see the MCP tool calls)
- It creates or updates `counsel-feedback.md`
- It presents findings to the user

If the command fails, fix the template in `examples/claude-commands/counsel.md`, re-copy to `.claude/commands/`, and retry.

## Step 3.4: Clean up QA artifacts

**Claude Code prompt**: "Remove the QA copies from `.claude/commands/` and any generated `counsel-feedback.md` from this test. The `.claude/commands/` directory in this repo was only for testing — users will copy templates into their own projects."

```bash
rm -rf .claude/commands/
rm -f counsel-feedback.md
```

## PHASE 3 — VALIDATION GATE

```bash
# Verify QA cleanup is done
ls .claude/commands/ 2>/dev/null
# Expected: directory does not exist (cleaned up)

# Verify the source templates are still intact
ls examples/claude-commands/counsel.md examples/claude-commands/refine.md examples/claude-commands/setup-counsel.md
# Expected: all three exist

# Verify no test artifacts remain
ls counsel-feedback.md 2>/dev/null
# Expected: file does not exist (cleaned up)
```

**STOP AND REPORT**: Tell the user:
- "Phase 3 complete: QA passed."
- "  - `/counsel`, `/refine`, and `/setup-counsel` all appeared in Claude Code autocomplete"
- "  - `/counsel` successfully sent prompts to GPT and Gemini and generated feedback"
- "  - QA artifacts cleaned up"
- "Ready to proceed to Phase 4 (npm publish setup)?"

---

# PHASE 4: npm Publish Setup

## Context

Prepare the package for publishing to npm as `counsel-of-models-mcp`. After this, users can install with `npm install -g counsel-of-models-mcp` instead of cloning the repo. The npm install path becomes the primary install method.

## Step 4.1: Verify shebang in src/index.ts

**Claude Code prompt**: "Verify that `src/index.ts` starts with `#!/usr/bin/env node`. If it's already there, skip this step. If not, add it as the very first line."

The current `src/index.ts` already starts with:
```typescript
#!/usr/bin/env node
```

Verify this is present. If it is, no change needed.

## Step 4.2: Update package.json for npm publishing

**Claude Code prompt**: "Update `package.json` to add `files`, `engines`, and `prepublishOnly` fields for npm publishing. Do NOT change the existing `name`, `version`, `bin`, `dependencies`, or `devDependencies`."

Add these fields to `package.json` (merge with existing content):

```json
{
  "files": [
    "dist/",
    "examples/",
    ".env.example",
    "README.md",
    "QUICKSTART.md"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "clean": "rimraf dist",
    "rebuild": "npm run clean && npm run build",
    "smoke": "node dist/smoke.js",
    "prepublishOnly": "npm run rebuild"
  }
}
```

The key additions are:
- `files` — controls what gets published to npm (keeps the package small)
- `engines` — documents the minimum Node.js version
- `prepublishOnly` — ensures a clean build before every publish

## Step 4.3: Rebuild and verify the package

**Claude Code prompt**: "Run a clean rebuild, then use `npm pack --dry-run` to see exactly what would be published. Verify the file list looks right."

```bash
npm run rebuild
# Expected: clean compile

npm pack --dry-run 2>&1
# Expected output should include:
#   dist/index.js
#   dist/config.js
#   dist/providers/openai.js
#   dist/providers/gemini.js
#   dist/providers/types.js
#   dist/providers/index.js
#   dist/smoke.js
#   examples/claude-commands/counsel.md
#   examples/claude-commands/refine.md
#   examples/claude-commands/setup-counsel.md
#   .env.example
#   README.md
#   QUICKSTART.md
#   package.json
#
# Should NOT include:
#   src/ (source TypeScript)
#   .env (secrets!)
#   node_modules/
#   .git/
#   actual_implementation.md
#   agentic_guide_implementation.md
#   counsel-feedback.md
```

## Step 4.4: Verify the binary works when invoked by name

**Claude Code prompt**: "Test that the package binary works when run directly."

```bash
# Test the binary entry point
node dist/index.js &
BGPID=$!
sleep 1
kill $BGPID 2>/dev/null
# Expected: no crash, server starts on stdio (the kill is expected)

# Verify the bin field is correct
node -e "const pkg = require('./package.json'); console.log(pkg.bin)"
# Expected: { 'counsel-mcp': 'dist/index.js' }
```

## PHASE 4 — VALIDATION GATE

```bash
# Verify package.json has the new fields
node -e "const p = require('./package.json'); console.log('files:', !!p.files, 'engines:', !!p.engines, 'prepublishOnly:', !!p.scripts.prepublishOnly)"
# Expected: files: true engines: true prepublishOnly: true

# Verify files array includes the right things
node -e "const p = require('./package.json'); console.log(p.files.join(', '))"
# Expected: dist/, examples/, .env.example, README.md, QUICKSTART.md

# Verify engines field
node -e "const p = require('./package.json'); console.log(p.engines.node)"
# Expected: >=18.0.0

# Verify build is clean
npm run rebuild 2>&1 | tail -1
# Expected: no errors

# Verify pack dry run doesn't include secrets or source
npm pack --dry-run 2>&1 | grep -c "\.env$"
# Expected: 0 (the .env file should NOT be included)

npm pack --dry-run 2>&1 | grep -c "src/"
# Expected: 0 (TypeScript source should NOT be included)
```

**STOP AND REPORT**: Tell the user:
- "Phase 4 complete: package.json updated for npm publishing."
- "  - `files` array controls what gets published"
- "  - `engines` field documents Node.js >=18 requirement"
- "  - `prepublishOnly` ensures clean build before publish"
- "  - `npm pack --dry-run` shows correct file list"
- "Ready to proceed to Phase 5 (README update)?"

---

# PHASE 5: Update README.md

## Context

Major README rewrite to:
1. Add `npm install -g` as the PRIMARY install method (above clone)
2. Add workflow layer documentation (two-layer architecture, templates, wizard)
3. Mention `GOOGLE_API_KEY` support
4. Add path hints for finding examples after npm install
5. Keep all existing content that's still accurate

## Step 5.1: Read the current README.md

**Claude Code prompt**: "Read the current README.md completely. I need you to understand its exact structure before making changes."

## Step 5.2: Restructure the Quick Start section

**Claude Code prompt**: "Rewrite the '5-Minute Quick Start' section of README.md. Make npm install the PRIMARY method (Option A) and clone the SECONDARY method (Option B). Keep the same friendly tone. Preserve the smoke test, registration, and demo prompts sections."

**Replace the current Quick Start section with**:

```markdown
## 5-Minute Quick Start

### Option A: Install via npm (recommended)

```bash
npm install -g counsel-of-models-mcp
```

Create a `.env` file anywhere convenient (e.g., `~/.counsel-env`):

```
OPENAI_API_KEY=sk-your-actual-key-here
GEMINI_API_KEY=your-actual-key-here
```

Register with Claude Code:

```bash
claude mcp add --scope user counsel-mcp -- counsel-mcp
```

> **Note:** The server reads API keys from environment variables. Either export them in your shell profile, or set `DOTENV_CONFIG_PATH` to point to your `.env` file.

### Option B: Clone the repo

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```

Add your API keys:

```bash
cp .env.example .env
# Edit .env with your real keys
```

Register with Claude Code:

```bash
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

### Verify it works

```bash
# If you cloned the repo, run the smoke test:
npm run smoke
```

Start a **new** Claude Code session (existing sessions don't see newly added servers), then try:

```
Use ask_openai to summarize what this repo does in one paragraph.
```
```

## Step 5.3: Update the Common First-Run Problems section

**Claude Code prompt**: "Add a troubleshooting entry for `GOOGLE_API_KEY` vs `GEMINI_API_KEY` confusion. Insert it in the Common First-Run Problems section."

**Add this entry**:

```markdown
### Smoke test says "Missing Gemini API key"
The server accepts either `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Check that you've set at least one of them. Many Google tutorials use `GOOGLE_API_KEY` — that works too.
```

## Step 5.4: Add the "Using It in Your Projects" section

**Claude Code prompt**: "Add a new section called 'Using It in Your Projects' AFTER the 'Demo Prompts' section and BEFORE the 'What It Does' section. This explains the workflow layer — the two-layer architecture, generic templates, and the setup wizard."

**Content to insert**:

```markdown
---

## Using It in Your Projects

The tools above (`ask_openai`, `ask_gemini`, `ask_all`) are the building blocks. The real power comes from **project-specific slash commands** that orchestrate those tools into a cross-validation workflow.

### The two-layer architecture

```
┌──────────────────────────────────────────────────┐
│  Your Project (.claude/commands/)                 │
│                                                   │
│  /counsel  — what to review, what questions to    │
│              ask each model, how to synthesize     │
│                                                   │
│  /refine   — takes feedback + your answers,       │
│              updates the implementation plan       │
│                                                   │
│  These are project-specific. A dashboard app      │
│  asks different questions than a data pipeline.    │
├──────────────────────────────────────────────────┤
│  Counsel MCP Server (global, registered once)     │
│                                                   │
│  ask_openai  — sends prompts to GPT               │
│  ask_gemini  — sends prompts to Gemini            │
│  ask_all     — sends to both in parallel          │
│                                                   │
│  Same everywhere. Doesn't know what project       │
│  you're in.                                       │
└──────────────────────────────────────────────────┘
```

You set up the MCP server once. The slash commands are different for every project because every project has different risks, different files to review, and different questions to ask.

### Quick start: use the generic templates

This package ships with ready-to-use `/counsel` and `/refine` commands that work for any project:

**1. Find the templates:**

```bash
# If you installed via npm:
npm root -g
# Look in: <global_root>/counsel-of-models-mcp/examples/claude-commands/

# If you cloned the repo, they're in:
# examples/claude-commands/
```

**2. Copy them into your project:**

```bash
cd /path/to/your/project
mkdir -p .claude/commands
cp /path/to/examples/claude-commands/counsel.md .claude/commands/counsel.md
cp /path/to/examples/claude-commands/refine.md .claude/commands/refine.md
```

**3. Start a new Claude Code session** in your project and run:

```
/counsel
```

That's it. The generic templates auto-detect your project's implementation plans and send them for cross-LLM review.

### Upgrade: the interactive wizard

For project-specific review prompts tailored to your risk areas, use the setup wizard:

```bash
cp /path/to/examples/claude-commands/setup-counsel.md .claude/commands/setup-counsel.md
```

Start a new Claude Code session and run `/setup-counsel`. Answer 5 questions about your project, and it generates custom `/counsel` and `/refine` commands that focus on what matters most for your codebase. Delete the wizard after — it's a one-time generator.

### Example workflow

```
/new-feature      →  explore codebase, discover what needs to change
/build-guide      →  generate a phased implementation plan
/counsel          →  GPT + Gemini cross-validate the plan
  ↳ you answer the design questions they surface
/refine           →  update the plan with all feedback
  ↳ optionally run /counsel again on the refined plan
Execute           →  follow the refined guide phase by phase
```

### What each model is good at

| Review Type | Best Provider | Why |
|---|---|---|
| Missing code paths / construction sites | OpenAI (GPT) | Strong at exhaustive enumeration and finding gaps |
| Business logic / data assumptions | Gemini | Strong at challenging assumptions and reasoning about intent |
| Pattern consistency | OpenAI (GPT) | Strong at comparing code against established conventions |
| Data quality / edge cases | Gemini | Strong at thinking through edge cases and distributions |
| Security / auth | OpenAI (GPT) | Strong at systematic security review |

### Generated commands should be committed

The `/counsel` and `/refine` commands contain no secrets — they're just instructions. **Commit them to git** so your whole team uses the same cross-validation workflow.
```

## Step 5.5: Update the file structure if one exists

**Claude Code prompt**: "If the README has a file structure section, update it to include the new `examples/` directory. If there's no file structure section, skip this step."

If there's a file structure to update, add:

```
examples/
└── claude-commands/
    ├── counsel.md         # Generic /counsel — works for any project
    ├── refine.md          # Generic /refine — works with counsel.md
    └── setup-counsel.md   # Interactive wizard for tailored commands
```

## PHASE 5 — VALIDATION GATE

```bash
# Verify npm install is now the primary method
grep -c "npm install -g counsel-of-models-mcp" README.md
# Expected: 1+

# Verify clone is still present as alternative
grep -c "git clone" README.md
# Expected: 1+

# Verify GOOGLE_API_KEY is mentioned
grep -c "GOOGLE_API_KEY" README.md
# Expected: 1+

# Verify workflow layer sections exist
grep -c "Using It in Your Projects" README.md
# Expected: 1

grep -c "two-layer" README.md
# Expected: 1+

grep -c "setup-counsel" README.md
# Expected: 3+ (referenced in multiple places)

grep -c "examples/claude-commands" README.md
# Expected: 2+

# Verify existing sections are preserved
grep -c "Demo Prompts" README.md
# Expected: 1

grep -c "Common First-Run Problems" README.md
# Expected: 1

grep -c "Advanced" README.md
# Expected: 1+

# Verify npm root hint is present
grep -c "npm root -g" README.md
# Expected: 1
```

**STOP AND REPORT**: Tell the user:
- "Phase 5 complete: README.md updated."
- "  - npm install is now the primary install method"
- "  - Clone is preserved as Option B"
- "  - Workflow layer docs added (two-layer architecture, generic templates, wizard)"
- "  - GOOGLE_API_KEY mentioned in troubleshooting"
- "  - All existing sections preserved"
- "Ready to proceed to Phase 6?"

---

# PHASE 6: Update QUICKSTART.md

## Context

Update QUICKSTART to match the README changes: npm install as primary method, clone as alternative, and add Step 6 for project workflow setup. Keep it brief — this is a quickstart.

## Step 6.1: Read the current QUICKSTART.md

**Claude Code prompt**: "Read QUICKSTART.md completely before editing."

## Step 6.2: Add npm install as Step 1, make clone the alternative

**Claude Code prompt**: "Restructure QUICKSTART.md so Step 1 offers npm install as the primary path and clone as the alternative. Keep the same concise style."

**Replace Step 1 with**:

```markdown
## Step 1: Install

**Option A — npm (recommended):**

```bash
npm install -g counsel-of-models-mcp
```

**Option B — clone the repo:**

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```
```

## Step 6.3: Update Step 2 (API keys)

**Claude Code prompt**: "Update Step 2 to mention GOOGLE_API_KEY and to handle both npm and clone paths."

```markdown
## Step 2: Add your API keys

**If you cloned the repo:**

```bash
cp .env.example .env
```

Open `.env` in any text editor. Replace the placeholder values with your real keys.

**If you installed via npm**, export the keys in your shell profile:

```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.profile
export OPENAI_API_KEY="sk-your-key-here"
export GEMINI_API_KEY="your-key-here"
```

> **Tip**: Either `GEMINI_API_KEY` or `GOOGLE_API_KEY` works — set whichever you prefer.
```

## Step 6.4: Update Step 4 (registration)

**Claude Code prompt**: "Update Step 4 to show the correct registration command for both npm and clone paths."

```markdown
## Step 4: Register with Claude Code

**If you installed via npm:**

```bash
claude mcp add --scope user counsel-mcp -- counsel-mcp
```

**If you cloned the repo:**

```bash
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

Verify:

```bash
claude mcp list
```

Look for `counsel-mcp` with `✓ Connected`.
```

## Step 6.5: Add Step 6 for project workflow setup

**Claude Code prompt**: "Add a Step 6 to QUICKSTART.md, inserted BEFORE the 'Something not working?' section. Keep it concise."

**Content to insert**:

```markdown
## Step 6: Set up your first project workflow (optional)

The tools are globally available now. To get the full cross-validation workflow in a specific project:

```bash
cd /path/to/your/project
mkdir -p .claude/commands

# Find the templates:
# npm install: look in $(npm root -g)/counsel-of-models-mcp/examples/claude-commands/
# Clone: look in examples/claude-commands/

cp /path/to/examples/claude-commands/counsel.md .claude/commands/counsel.md
cp /path/to/examples/claude-commands/refine.md .claude/commands/refine.md
```

Start a new Claude Code session in your project and run `/counsel`.

For tailored commands, also copy `setup-counsel.md` and run `/setup-counsel`.

See [README.md](README.md#using-it-in-your-projects) for the full explanation.
```

## Step 6.6: Update the troubleshooting table

**Claude Code prompt**: "Add `GOOGLE_API_KEY` to the troubleshooting table in QUICKSTART.md."

Add this row:

```markdown
| "Missing Gemini API key" | Either `GEMINI_API_KEY` or `GOOGLE_API_KEY` works — set one of them |
```

## PHASE 6 — VALIDATION GATE

```bash
# Verify npm install is primary
grep -c "npm install -g counsel-of-models-mcp" QUICKSTART.md
# Expected: 1

# Verify clone is still present
grep -c "git clone" QUICKSTART.md
# Expected: 1

# Verify Step 6 exists
grep -c "Step 6" QUICKSTART.md
# Expected: 1+

# Verify setup-counsel is referenced
grep -c "setup-counsel" QUICKSTART.md
# Expected: 1+

# Verify GOOGLE_API_KEY is mentioned
grep -c "GOOGLE_API_KEY" QUICKSTART.md
# Expected: 1+

# Verify existing steps are intact
grep -c "Step 1" QUICKSTART.md
grep -c "Step 2" QUICKSTART.md
grep -c "Step 3" QUICKSTART.md
grep -c "Step 4" QUICKSTART.md
grep -c "Step 5" QUICKSTART.md
# Expected: 1+ for each

# Verify troubleshooting section still exists
grep -c "Something not working" QUICKSTART.md
# Expected: 1
```

**STOP AND REPORT**: Tell the user:
- "Phase 6 complete: QUICKSTART.md updated."
- "  - npm install is now the primary method"
- "  - Clone preserved as alternative"
- "  - Step 6 added for project workflow setup"
- "  - GOOGLE_API_KEY mentioned in troubleshooting"
- "Ready to proceed to Phase 7 (commit, push, publish)?"

---

# PHASE 7: Git Commit, Push, and npm Publish

## Context

Commit all changes, push to GitHub, then publish to npm. The npm publish is the final step.

## Step 7.1: Stage and review changes

**Claude Code prompt**: "Stage all new and modified files. Show me `git status` and `git diff --cached --stat` so I can review before committing."

```bash
# Stage new files
git add examples/claude-commands/counsel.md
git add examples/claude-commands/refine.md
git add examples/claude-commands/setup-counsel.md

# Stage modified files
git add src/providers/gemini.ts
git add .env.example
git add package.json
git add README.md
git add QUICKSTART.md

# Review
git status
git diff --cached --stat

# Verify no secrets in staged changes
git diff --cached | grep -i "sk-" | grep -v "your-key" | grep -v "placeholder" | grep -v "example"
# Expected: no output
```

## Step 7.2: Commit

**Claude Code prompt**: "Commit the staged changes."

```bash
git commit -m "Add workflow layer, npm publish setup, GOOGLE_API_KEY support

- examples/claude-commands/: generic counsel.md, refine.md, and
  setup-counsel.md wizard — copy into any project's .claude/commands/
- src/providers/gemini.ts: accept both GEMINI_API_KEY and GOOGLE_API_KEY
- package.json: added files, engines, prepublishOnly for npm publishing
- README.md: npm install as primary method, workflow layer docs with
  two-layer architecture, generic templates, and wizard instructions
- QUICKSTART.md: npm install as primary, Step 6 for workflow setup
- .env.example: mentions GOOGLE_API_KEY as alternative

Users can now: npm install -g counsel-of-models-mcp, register with
Claude Code, then copy example templates into any project for instant
cross-LLM validation of implementation plans."
```

## Step 7.3: Push to GitHub

**Claude Code prompt**: "Push to master."

```bash
git push origin master
```

## Step 7.4: Publish to npm

**Claude Code prompt**: "Log in to npm (if not already logged in) and publish the package."

```bash
# Check if already logged in
npm whoami
# Expected: mossrussell
# If not logged in, the user needs to run: npm login

# Publish
npm publish
# Expected: + counsel-of-models-mcp@1.0.0
```

**Important**: If `npm whoami` fails, tell the user to run `! npm login` to log in interactively, then retry `npm publish`.

## Step 7.5: Verify the published package

**Claude Code prompt**: "Verify the package was published successfully."

```bash
# Check it exists on npm
npm view counsel-of-models-mcp version
# Expected: 1.0.0

# Verify the binary name is registered
npm view counsel-of-models-mcp bin
# Expected: { 'counsel-mcp': 'dist/index.js' }
```

## PHASE 7 — VALIDATION GATE

```bash
# Verify git commit
git log --oneline -1
# Expected: shows the commit message

git show --stat HEAD
# Expected: shows all changed files

# Verify push succeeded
git status
# Expected: "Your branch is up to date with 'origin/master'"

# Verify npm publish
npm view counsel-of-models-mcp version
# Expected: 1.0.0

npm view counsel-of-models-mcp bin
# Expected: { 'counsel-mcp': 'dist/index.js' }
```

**STOP AND REPORT**: Tell the user:
- "Phase 7 complete: pushed to GitHub and published to npm."
- ""
- "**The package is live!** Anyone can now install with:"
- "```"
- "npm install -g counsel-of-models-mcp"
- "```"
- ""
- "**What's in the package:**"
- "  - MCP server with `ask_openai`, `ask_gemini`, `ask_all` tools"
- "  - Example templates in `examples/claude-commands/`"
- "  - Supports both `GEMINI_API_KEY` and `GOOGLE_API_KEY`"
- ""
- "**Quick test of the npm install path:**"
- "```"
- "npm install -g counsel-of-models-mcp"
- "claude mcp add --scope user counsel-mcp -- counsel-mcp"
- "# Start new Claude Code session, try: Use ask_openai to say hello"
- "```"

---

# Troubleshooting Appendix

## /setup-counsel doesn't autocomplete

Slash commands require the `.claude/commands/` directory to be in the **project root** where you launched Claude Code (not in the MCP server repo). Verify:

```bash
ls .claude/commands/setup-counsel.md
```

If it exists but doesn't autocomplete, exit Claude Code completely and restart it.

## setup-counsel says the MCP server isn't available

The counsel-mcp server must be registered at user scope.

```bash
claude mcp list | grep counsel
```

If not listed, register it:

```bash
# If installed via npm:
claude mcp add --scope user counsel-mcp -- counsel-mcp

# If cloned the repo:
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

Then start a **new** Claude Code session.

## "Missing Gemini API key"

The server accepts either `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Set at least one of them. Many Google tutorials use `GOOGLE_API_KEY` — that works too.

## Generated /counsel or /refine commands don't work

If the wizard generates commands that reference files your workflow doesn't actually produce, edit `.claude/commands/counsel.md` manually to match your real file names. Or, start fresh by copying the generic templates from `examples/claude-commands/` — those work for any project.

## npm install -g doesn't work

If you get permission errors:

```bash
# Option 1: Use npx instead (no global install needed)
npx counsel-of-models-mcp

# Option 2: Fix npm permissions
# See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```

## "Cannot find module" after npm install

The package should work immediately after `npm install -g`. If it doesn't:

```bash
# Check where it's installed
npm root -g
# Verify the binary is linked
which counsel-mcp
```

## Which repo gets .claude/commands/?

**Your project** — not the MCP server repo. The MCP server is a global tool. The slash commands go in whatever project you're working on:

```bash
cd /path/to/your/actual/project
mkdir -p .claude/commands
# Copy templates here
```

---

## File Map After This Guide

```
Counsel_of_models_mcp/
├── examples/
│   └── claude-commands/
│       ├── counsel.md             # NEW — generic /counsel, works for any project
│       ├── refine.md              # NEW — generic /refine, works with counsel.md
│       └── setup-counsel.md       # NEW — interactive wizard for tailored commands
├── src/
│   ├── index.ts                   # unchanged (shebang already present)
│   ├── config.ts                  # unchanged
│   ├── smoke.ts                   # unchanged
│   └── providers/
│       ├── index.ts               # unchanged
│       ├── types.ts               # unchanged
│       ├── openai.ts              # unchanged
│       └── gemini.ts              # UPDATED — accepts GEMINI_API_KEY or GOOGLE_API_KEY
├── dist/                          # rebuilt
├── .env                           # unchanged (gitignored)
├── .env.example                   # UPDATED — mentions GOOGLE_API_KEY
├── .gitignore                     # unchanged
├── package.json                   # UPDATED — added files, engines, prepublishOnly
├── tsconfig.json                  # unchanged
├── README.md                      # UPDATED — npm primary, workflow layer docs
├── QUICKSTART.md                  # UPDATED — npm primary, Step 6, GOOGLE_API_KEY
└── actual_implementation.md       # unchanged
```
