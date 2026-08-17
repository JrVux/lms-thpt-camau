export const cleanAndParseJson = (rawText) => {
  let str = String(rawText || '').trim();

  if (!str) return {};

  // 1. Remove markdown code block fences if present: ```json ... ``` or ``` ... ```
  str = str.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  // 2. Find the first '{' or '[' and the last '}' or ']'
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = str.lastIndexOf('}');
  } else if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIdx = firstBracket;
    endIdx = str.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    str = str.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(str);
  } catch (err) {
    // Attempt fallback fixes for unquoted type placeholders and trailing commas
    const fixedStr = str
      .replace(/:\s*string\b/gi, ':""')
      .replace(/:\s*integer\b/gi, ':0')
      .replace(/:\s*int\b/gi, ':0')
      .replace(/:\s*number\b/gi, ':0')
      .replace(/:\s*boolean\b/gi, ':false')
      .replace(/:\s*array\b/gi, ':[]')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(fixedStr);
    } catch {
      throw err;
    }
  }
};
