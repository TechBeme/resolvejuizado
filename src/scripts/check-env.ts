#!/usr/bin/env tsx
import "dotenv/config";
import { env } from "../config/env.js";

console.log("🔍 Environment Check");
console.log("===================");
console.log("");

const checks = [
    { name: "WordPress URL", value: env.wordpressBaseUrl },
    { name: "WordPress User", value: env.wordpressAppUser },
    { name: "WordPress Password", value: env.wordpressAppPassword ? "***" : undefined },
    { name: "Supabase URL", value: env.supabaseUrl },
    { name: "Supabase Key", value: env.supabaseKey ? "***" : undefined },
    { name: "Text Model", value: env.textModel },
    { name: "Image Model", value: env.imageModel },
    { name: "Google API Key", value: env.googleApiKey ? "***" : undefined },
    { name: "OpenAI API Key", value: env.openaiApiKey ? "***" : undefined },
    { name: "Log Level", value: env.logLevel },
];

let hasErrors = false;

for (const check of checks) {
    const status = check.value ? "✅" : "❌";
    const display = check.value || "NOT SET";
    console.log(`${status} ${check.name}: ${display}`);

    if (!check.value && !["OpenAI API Key"].includes(check.name)) {
        hasErrors = true;
    }
}

console.log("");
console.log("===================");

if (hasErrors) {
    console.log("❌ Some required variables are missing!");
    console.log("   Check your .env file and compare with .env.example");
    process.exit(1);
} else {
    console.log("✅ All required environment variables are set!");
    process.exit(0);
}
