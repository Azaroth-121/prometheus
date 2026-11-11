/**
 * The model often returns a numbered brief as one paragraph ("…: 1. Objective: … 2. Scope: …").
 * Put each item on its own line so it reads as a list wherever it's shown or pasted. Only when
 * there are at least two items and the text has no line-started list already, and only before
 * "N. " followed by a capital, so "v2. x" and "3.5" stay as they are.
 */
function splitInlineList(text: string): string {
  const items = text.match(/(^|\s)\d{1,2}\.\s+[A-Z]/g) ?? [];
  if (items.length < 2 || /\n\s*\d{1,2}\.\s/.test(text)) return text;
  return text.replace(/\s+(\d{1,2})\.\s+(?=[A-Z])/g, '\n$1. ').replace(/:\n1\. /, ':\n\n1. ');
}

/**
 * Makes an optimized prompt read well in a plain chat box (ChatGPT, Claude, Gemini): strips
 * Markdown emphasis and heading markers, which show up there as literal `**` and `###`, and puts
 * an inline numbered list onto separate lines. Bullets, line breaks and single `*`
 * (multiplication) are kept. Not for code-mode prompts, where `**` can be real syntax
 * (`2**3`, `src/**`).
 */
export function plainTextPrompt(text: string): string {
  return splitInlineList(
    text
      .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '$1')
      .replace(/__(?=\S)([^_\n]+?)(?<=\S)__/g, '$1')
      .replace(/^#{1,6}[ \t]+/gm, ''),
  );
}
