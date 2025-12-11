/**
 * Tipos para os prompts (usado apenas para fallback caso WordPress falhe)
 */

export type RewritePromptInput = {
    sourceUrl: string;
    content: string;
    today: string;
    currentYear: number;
};

export type ReviewerPromptInput = {
    sourceUrl: string;
    today: string;
    currentYear: number;
    title: string;
    bodyMarkdown: string;
    focusKeyword: string;
    seoTitle: string;
    seoDescription: string;
    slug: string;
    faqs: Array<{ question: string; answer: string }>;
    imagePrompts: string[];
    validationReport: {
        titleLength: number;
        titleValid: boolean;
        seoTitleLength: number;
        seoTitleValid: boolean;
        seoDescriptionLength: number;
        seoDescriptionValid: boolean;
        slugLength: number;
        slugValid: boolean;
        bodyWordCount: number;
        bodyValid: boolean;
        faqsCount: number;
        faqsValid: boolean;
        imagePromptsCount: number;
        imagePromptsValid: boolean;
        issues: string[];
    };
};

/**
 * Fallback simples caso WordPress não retorne nada
 * Retorna mensagem instruindo configuração no WordPress
 */
export const buildRewritePrompt = (_input: RewritePromptInput) => `
ERRO: Nenhum prompt configurado no WordPress.
Acesse WordPress Admin → "Notícias Automáticas" → aba "Prompts" para configurar o prompt de reescrita.
`;

export const buildReviewerPrompt = (_input: ReviewerPromptInput) => `
ERRO: Nenhum prompt configurado no WordPress.
Acesse WordPress Admin → "Notícias Automáticas" → aba "Prompts" para configurar o prompt de revisão.
`;
