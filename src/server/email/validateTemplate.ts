import { EMAIL_VARIABLES } from "./variables";
import { extractTemplateTokens } from "./interpolate";

interface ValidateTemplateParams {
  subject: string;
  previewText?: string | null;
  tiptapJson: Record<string, unknown>;
}

/**
 * Validates a template by scanning subject, preview text, and TipTap JSON for variable tokens.
 * Returns { unknownTokens: string[], usedTokens: string[] }.
 */
export function validateTemplate(params: ValidateTemplateParams): {
  unknownTokens: string[];
  usedTokens: string[];
} {
  const usedTokensSet = new Set<string>();

  // Extract from subject
  if (params.subject) {
    extractTemplateTokens(params.subject).forEach((t) => usedTokensSet.add(t));
  }

  // Extract from preview text
  if (params.previewText) {
    extractTemplateTokens(params.previewText).forEach((t) => usedTokensSet.add(t));
  }

  // Extract from TipTap JSON (both text nodes and attributes/marks)
  function walk(n: any) {
    if (!n || typeof n !== "object") return;

    if (n.type === "text" && typeof n.text === "string") {
      extractTemplateTokens(n.text).forEach((t) => usedTokensSet.add(t));
    }

    if (n.attrs && typeof n.attrs === "object") {
      for (const val of Object.values(n.attrs)) {
        if (typeof val === "string") {
          extractTemplateTokens(val).forEach((t) => usedTokensSet.add(t));
        }
      }
    }

    if (n.marks && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (mark.attrs && typeof mark.attrs === "object") {
          for (const val of Object.values(mark.attrs)) {
            if (typeof val === "string") {
              extractTemplateTokens(val).forEach((t) => usedTokensSet.add(t));
            }
          }
        }
      }
    }

    if (n.content && Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  }

  walk(params.tiptapJson);

  const usedTokens = Array.from(usedTokensSet);
  const validKeys = new Set(EMAIL_VARIABLES.map((v) => v.key));
  const unknownTokens = usedTokens.filter((t) => !validKeys.has(t));

  return {
    unknownTokens,
    usedTokens,
  };
}
