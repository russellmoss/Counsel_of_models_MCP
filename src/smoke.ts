#!/usr/bin/env node

import "dotenv/config";
import { askOpenAI } from "./providers/openai.js";
import { askGemini } from "./providers/gemini.js";

const TEST_PROMPT = "Reply with exactly: OK";

async function smoke() {
  console.error("=== Counsel of Models — Smoke Test ===\n");

  let passed = 0;
  let failed = 0;

  // Test OpenAI
  console.error("Testing OpenAI...");
  try {
    const openaiResult = await askOpenAI(TEST_PROMPT);
    if (openaiResult.text) {
      console.error(`  ✅ OpenAI OK (model: ${openaiResult.model})`);
      console.error(`  Response: "${openaiResult.text.trim().substring(0, 50)}"`);
      passed++;
    } else {
      console.error(`  ❌ OpenAI returned empty response`);
      if (openaiResult.error) console.error(`  Error: ${openaiResult.error}`);
      failed++;
    }
  } catch (error) {
    console.error(
      `  ❌ OpenAI threw: ${error instanceof Error ? error.message : String(error)}`
    );
    failed++;
  }

  console.error("");

  // Test Gemini
  console.error("Testing Gemini...");
  try {
    const geminiResult = await askGemini(TEST_PROMPT);
    if (geminiResult.text) {
      console.error(`  ✅ Gemini OK (model: ${geminiResult.model})`);
      console.error(`  Response: "${geminiResult.text.trim().substring(0, 50)}"`);
      passed++;
    } else {
      console.error(`  ❌ Gemini returned empty response`);
      if (geminiResult.error) console.error(`  Error: ${geminiResult.error}`);
      failed++;
    }
  } catch (error) {
    console.error(
      `  ❌ Gemini threw: ${error instanceof Error ? error.message : String(error)}`
    );
    failed++;
  }

  console.error(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error(
      "\n⚠️  Fix the failing provider(s) before proceeding to MCP registration."
    );
    console.error("   Common fixes:");
    console.error("   - Check API key in .env or shell profile");
    console.error("   - Verify model IDs in src/config.ts");
    console.error("   - Check provider status pages for outages");
    process.exit(1);
  }

  console.error("\n🎉 Both providers working. Safe to register with Claude Code.");
  process.exit(0);
}

smoke();
