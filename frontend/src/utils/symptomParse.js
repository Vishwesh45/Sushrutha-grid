/**
 * Live client-side duration / severity hints from free-text symptoms
 * (mirrors backend semantic_nlp_service extractors so the form fills before confirm).
 */

export function extractDurationFromText(text) {
  if (!text || !String(text).trim()) return '';
  const t = String(text);

  const forMatch = t.match(
    /\b(?:for|since|from|last|past)\s+(\d+\s*(?:days?|weeks?|months?|hours?|years?|mins?|minutes?))\b/i
  );
  if (forMatch) return forMatch[1].toLowerCase();

  const hinglish = t.match(
    /\b(\d+\s*(?:days?|din|weeks?|mahine|months?|hours?|ghante))\s*se\b/i
  );
  if (hinglish) {
    return hinglish[1]
      .toLowerCase()
      .replace(/\bdin\b/g, 'days')
      .replace(/\bmahine\b/g, 'months')
      .replace(/\bghante\b/g, 'hours');
  }

  const wordNum = t.match(
    /\b(?:for|since|from|last|past)\s+((?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|hours?))\b/i
  );
  if (wordNum) return wordNum[1].toLowerCase();

  const bare = t.match(/\b(\d+\s*(?:days?|weeks?|months?|hours?|mins?|minutes?))\b/i);
  if (bare) return bare[1].toLowerCase();

  const since = t.match(
    /\b((?:since|from)\s+(?:yesterday(?:\s+night)?|last\s+\w+|morning|evening|childhood))\b/i
  );
  if (since) return since[1].toLowerCase();

  if (/\b(?:from\s+long\s+time|for\s+a\s+long\s+time|long\s+time|since\s+months)\b/i.test(t)) {
    return 'chronic (> 1 month)';
  }

  return '';
}

/** Soft severity hint from wording — does not override an explicit user pick unless clear. */
export function extractSeverityHint(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/(severe|unbearable|excruciating|crushing|extreme|worst|can't walk|cannot walk|bleeding heavily)/.test(lower)) {
    return 'severe';
  }
  if (/(mild|slight|little|light pain|manageable)/.test(lower)) {
    return 'mild';
  }
  return null;
}
