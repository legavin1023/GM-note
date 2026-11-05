// Split plain text without treating user input as HTML.
export function autoLinkParts(value) {
  const text = String(value || "");
  const parts = [];
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    let label = match[0].replace(/[.,!?;:，。！？]+$/u, "");
    // Keep parentheses inside URLs, but exclude surrounding punctuation.
    const pairs = { ")": "(", "]": "[", "}": "{" };
    while (label) {
      const closing = label.slice(-1);
      const opening = pairs[closing];
      if (!opening) break;
      const count = (char) => label.split(char).length - 1;
      if (count(closing) <= count(opening)) break;
      label = label.slice(0, -1).replace(/[.,!?;:，。！？]+$/u, "");
    }
    const href = /^www\./i.test(label) ? `https://${label}` : label;
    try {
      const url = new URL(href);
      if (!url.hostname || !["http:", "https:"].includes(url.protocol))
        continue;
    } catch {
      continue;
    }
    if (match.index > offset) {
      parts.push({ text: text.slice(offset, match.index) });
    }
    parts.push({ text: label, href });
    offset = match.index + label.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
