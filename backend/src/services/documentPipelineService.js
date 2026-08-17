const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const MAX_RETRIES = 3;

export const splitText = (text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) => {
  if (!text?.trim()) return [];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const paraLen = trimmed.length;

    if (currentLen + paraLen > chunkSize && currentLen > 0) {
      chunks.push(current.join('\n\n'));
      const overlapText = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0 && overlapLen < overlap; i--) {
        overlapText.unshift(current[i]);
        overlapLen += current[i].length;
      }
      current = overlapText;
      currentLen = overlapLen;
    }

    current.push(trimmed);
    currentLen += paraLen;
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'));
  }

  return chunks;
};

export const extractTextFromPdf = async (buffer) => {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      pages.push({ page: i, text });
    }
    return pages;
  } catch (error) {
    throw Object.assign(new Error(`PDF extraction failed: ${error.message}`), { code: 'PDF_EXTRACT_ERROR' });
  }
};

export const extractTextFromDocx = async (buffer) => {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return [{ page: 1, text: result.value }];
  } catch (error) {
    throw Object.assign(new Error(`DOCX extraction failed: ${error.message}`), { code: 'DOCX_EXTRACT_ERROR' });
  }
};

export const extractImagesFromPdf = async (buffer) => {
  const images = [];
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page = await doc.getPage(i);
      const operatorList = await page.getOperatorList();
      const imgIndexes = [];
      for (let j = 0; j < operatorList.fnArray.length; j++) {
        if (operatorList.fnArray[j] === pdfjsLib.OPS.paintImageXObject) {
          imgIndexes.push(operatorList.argsArray[j][0]);
        }
      }
      for (const idx of imgIndexes) {
        images.push({ page: i, objIdx: idx });
      }
    }
  } catch (error) {
    console.warn(`Image extraction warning: ${error.message}`);
  }
  return images;
};

export const detectFileType = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  return 'unknown';
};

export const ocrImage = async (imageBuffer, { openRouterApiKey } = {}) => {
  if (!openRouterApiKey) return null;
  try {
    const base64 = imageBuffer.toString('base64');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openRouterApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen-vl-plus:free',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Đọc và trích xuất toàn bộ văn bản từ hình ảnh này. Chỉ trả về nội dung văn bản, không thêm giải thích.' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }] }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
};

export const detectPdfHasTextLayer = async (buffer) => {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items.length > 5;
  } catch {
    return false;
  }
};

export const extractTextFromPdfWithOcr = async (buffer, ocrOptions = {}) => {
  const hasText = await detectPdfHasTextLayer(buffer);
  if (hasText) {
    return extractTextFromPdf(buffer);
  }
  // PDF không có text layer → dùng OCR
  const ocrText = await ocrImage(buffer, ocrOptions);
  if (ocrText) {
    return [{ page: 1, text: ocrText }];
  }
  throw Object.assign(new Error('PDF không có text layer và OCR không khả dụng'), { code: 'PDF_NO_TEXT' });
};