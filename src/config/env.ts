import "dotenv/config";

type Optional = string | undefined;

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const optional = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image-preview";

export const env = {
  wordpressBaseUrl: required("WORDPRESS_BASE_URL"),
  wordpressAppUser: required("WORDPRESS_APP_USER"),
  wordpressAppPassword: required("WORDPRESS_APP_PASSWORD"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseKey: optional("SUPABASE_SERVICE_ROLE_KEY") ?? optional("SUPABASE_ANON_KEY"),
  textModel: process.env.AI_TEXT_MODEL ?? DEFAULT_TEXT_MODEL,
  imageModel: process.env.AI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
  openaiApiKey: process.env.OPENAI_API_KEY as Optional,
  googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as Optional,
  logLevel: process.env.LOG_LEVEL ?? "info",
  httpProxy: optional("HTTP_PROXY") ?? optional("HTTPS_PROXY"),
};

const wantsGoogle =
  env.textModel.startsWith("google/") || env.imageModel.startsWith("google/");
const wantsOpenAI =
  env.textModel.startsWith("openai/") || env.imageModel.startsWith("openai/");

if (wantsGoogle && !env.googleApiKey) {
  throw new Error(
    "Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY for fallback) for configured google provider.",
  );
}
if (wantsOpenAI && !env.openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY for configured openai provider.");
}

// Ensure provider can read the key; prefer GOOGLE_GENERATIVE_AI_API_KEY.
if (env.googleApiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = env.googleApiKey;
}
