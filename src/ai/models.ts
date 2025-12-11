import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { ImageModel, LanguageModel } from "ai";

const stripPrefix = (modelId: string) => modelId.split("/").slice(1).join("/");

export const resolveTextModel = (modelId: string): LanguageModel => {
  if (modelId.startsWith("google/")) {
    return google.languageModel(stripPrefix(modelId));
  }
  if (modelId.startsWith("openai/")) {
    // openai provider returns a LanguageModelV1; cast to the unified LanguageModel type.
    return openai.languageModel(stripPrefix(modelId)) as unknown as LanguageModel;
  }
  throw new Error(`Unsupported text model provider for: ${modelId}`);
};

export type ResolvedImageModel =
  | { kind: "image"; model: ImageModel }
  | { kind: "language"; model: LanguageModel };

export const resolveImageModel = (modelId: string): ResolvedImageModel => {
  if (modelId.startsWith("google/")) {
    const id = stripPrefix(modelId);
    if (id.includes("flash-image") || id.includes("image-preview")) {
      return { kind: "language", model: google.languageModel(id) };
    }
    return { kind: "image", model: google.image(id) };
  }
  if (modelId.startsWith("openai/")) {
    return { kind: "image", model: openai.image(stripPrefix(modelId)) as unknown as ImageModel };
  }
  throw new Error(`Unsupported image model provider for: ${modelId}`);
};

export const isGoogleImageModel = (modelId: string) =>
  modelId.startsWith("google/");
