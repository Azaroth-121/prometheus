/**
 * Strips Markdown emphasis and heading markers from an optimized prompt. The prompt is pasted
 * into a plain chat box (ChatGPT, Claude, Gemini), where `**Title**` and `### Title` show up as
 * literal symbols. Numbered lists, line breaks and single `*` (bullets, multiplication) are
 * kept. Not for code-mode prompts, where `**` can be real syntax (`2**3`, `src/**`).
 */
export function plainTextPrompt(text: string): string {
  return text
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '$1')
    .replace(/__(?=\S)([^_\n]+?)(?<=\S)__/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '');
}
