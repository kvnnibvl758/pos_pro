// ===== LECTURE DU TEXTE SUR LES PHOTOS (OCR, 100 % dans le navigateur) =====
// Utilise Tesseract.js (Apache-2.0, copie locale dans src/vendor/ocr) : aucune photo n'est envoyée sur internet.

const BASE = 'src/vendor/ocr/';
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (window.Tesseract ? resolve() : reject(new Error('lecteur de texte indisponible')));
    script.onerror = () => reject(new Error('lecteur de texte indisponible'));
    document.head.appendChild(script);
  });
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      const abs = (path) => new URL(path, document.baseURI).href;
      return window.Tesseract.createWorker('fra', 1, {
        workerPath: abs(BASE + 'worker.min.js'),
        corePath: abs(BASE),
        langPath: abs(BASE + 'lang'),
        workerBlobURL: false,
        gzip: true
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function stopOcr() {
  if (!workerPromise) return;
  try { (await workerPromise).terminate(); } catch { /* déjà arrêté */ }
  workerPromise = null;
}

const titleCase = (text) => text
  .toLowerCase()
  .replace(/(^|[\s'’-])(\p{L})/gu, (match, sep, letter) => sep + letter.toUpperCase());

// Garde les lignes les plus visibles de l'emballage (texte le plus grand) = en général la marque et le nom du produit.
export function pickProductName(lines) {
  const usable = lines
    .map((line) => ({
      text: String(line.text || '').replace(/[^\p{L}\p{N}%&'’.+\- ]/gu, ' ').replace(/\s+/g, ' ').trim(),
      height: Math.max(1, (line.bbox?.y1 ?? 0) - (line.bbox?.y0 ?? 0)),
      confidence: Number(line.confidence) || 0
    }))
    .filter((line) => line.confidence >= 55 && /\p{L}{3,}/u.test(line.text) && line.text.length >= 4 && line.text.length <= 40);
  if (!usable.length) return '';
  const tallest = Math.max(...usable.map((line) => line.height));
  const big = usable.filter((line) => line.height >= tallest * 0.55);
  // On les remet dans l'ordre de lecture (haut vers bas) : l'ordre d'origine est déjà celui-là.
  const chosen = big.slice(0, 3).map((line) => line.text);
  return titleCase(chosen.join(' ')).slice(0, 80);
}

// canvas → nom de produit probable ('' si rien de lisible)
export async function readProductName(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const lines = [];
  (data.blocks || []).forEach((block) => (block.paragraphs || []).forEach((paragraph) => (paragraph.lines || []).forEach((line) => lines.push(line))));
  if (!lines.length && Array.isArray(data.lines)) lines.push(...data.lines);
  return pickProductName(lines);
}
