const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateTokens(input: string): string[] {
  if (!input) return [];
  const tokens: string[] = [];
  let match;
  // Reset regex lastIndex
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(input)) !== null) {
    if (match[1]) {
      tokens.push(match[1].trim());
    }
  }
  return Array.from(new Set(tokens));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateSubject(text: string, variables: Record<string, string>): { text: string; unknownTokens: string[] } {
  if (!text) return { text: "", unknownTokens: [] };
  const tokens = extractTemplateTokens(text);
  const unknownTokens: string[] = [];
  let result = text;

  for (const token of tokens) {
    if (token in variables) {
      const val = variables[token] ?? "";
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), () => val);
    } else {
      unknownTokens.push(token);
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}(?:'s|s')?`, "g"), "");
    }
  }

  return { text: result, unknownTokens };
}

export function interpolateHtml(text: string, variables: Record<string, string>): { text: string; unknownTokens: string[] } {
  if (!text) return { text: "", unknownTokens: [] };
  const tokens = extractTemplateTokens(text);
  const unknownTokens: string[] = [];
  let result = text;

  for (const token of tokens) {
    if (token in variables) {
      const val = escapeHtml(variables[token] ?? "");
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), () => val);
    } else {
      unknownTokens.push(token);
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}(?:'s|s'|&#x27;s|s&#x27;)?`, "g"), "");
    }
  }

  return { text: result, unknownTokens };
}

export function interpolateUrl(text: string, variables: Record<string, string>): { text: string; unknownTokens: string[] } {
  if (!text) return { text: "", unknownTokens: [] };
  const tokens = extractTemplateTokens(text);
  const unknownTokens: string[] = [];
  let result = text;

  for (const token of tokens) {
    if (token in variables) {
      const val = variables[token] ?? "";
      let escaped = "";
      if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("data:")) {
        // Full URLs and Data URLs are attribute escaped to prevent HTML injection
        escaped = val.replace(/"/g, "%22").replace(/'/g, "%27");
      } else {
        escaped = encodeURIComponent(val);
      }
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), () => escaped);
    } else {
      unknownTokens.push(token);
      result = result.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}(?:'s|s')?`, "g"), "");
    }
  }

  return { text: result, unknownTokens };
}

export function interpolateTipTapJson(node: any, variables: Record<string, string>): { node: any; unknownTokens: string[] } {
  if (!node || typeof node !== "object") {
    return { node, unknownTokens: [] };
  }

  const unknownTokensSet = new Set<string>();
  const addUnknowns = (tokens: string[]) => {
    tokens.forEach((t) => unknownTokensSet.add(t));
  };

  const cloned = JSON.parse(JSON.stringify(node));

  function walk(n: any) {
    if (!n || typeof n !== "object") return;

    // 1. Interpolate text nodes
    if (n.type === "text" && typeof n.text === "string") {
      const interpolated = interpolateSubject(n.text, variables);
      n.text = interpolated.text;
      addUnknowns(interpolated.unknownTokens);
    }

    // 2. Interpolate node attributes
    if (n.attrs && typeof n.attrs === "object") {
      for (const key of Object.keys(n.attrs)) {
        const val = n.attrs[key];
        if (typeof val === "string") {
          if (key === "href" || key === "src") {
            const interpolated = interpolateUrl(val, variables);
            n.attrs[key] = interpolated.text;
            addUnknowns(interpolated.unknownTokens);
          } else {
            const interpolated = interpolateSubject(val, variables);
            n.attrs[key] = interpolated.text;
            addUnknowns(interpolated.unknownTokens);
          }
        }
      }
    }

    // 3. Interpolate mark attributes (e.g. links)
    if (n.marks && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (mark.attrs && typeof mark.attrs === "object") {
          for (const key of Object.keys(mark.attrs)) {
            const val = mark.attrs[key];
            if (typeof val === "string") {
              if (key === "href" || key === "src") {
                const interpolated = interpolateUrl(val, variables);
                mark.attrs[key] = interpolated.text;
                addUnknowns(interpolated.unknownTokens);
              } else {
                const interpolated = interpolateSubject(val, variables);
                mark.attrs[key] = interpolated.text;
                addUnknowns(interpolated.unknownTokens);
              }
            }
          }
        }
      }
    }

    // 4. Recurse content
    if (n.content && Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  }

  walk(cloned);

  return { node: cloned, unknownTokens: Array.from(unknownTokensSet) };
}
