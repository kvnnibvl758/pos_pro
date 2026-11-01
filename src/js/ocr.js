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
    .filter((line) => line.confidence >= 45 && /\p{L}{3,}/u.test(line.text) && line.text.length >= 4 && line.text.length <= 40);
  if (!usable.length) return '';
  const tallest = Math.max(...usable.map((line) => line.height));
  const big = usable.filter((line) => line.height >= tallest * 0.55);
  // On les remet dans l'ordre de lecture (haut vers bas) : l'ordre d'origine est déjà celui-là.
  const chosen = big.slice(0, 3).map((line) => line.text);
  return titleCase(chosen.join(' ')).slice(0, 80);
}

function collectLines(data) {
  const lines = [];
  (data.blocks || []).forEach((block) => (block.paragraphs || []).forEach((paragraph) => (paragraph.lines || []).forEach((line) => lines.push(line))));
  if (!lines.length && Array.isArray(data.lines)) lines.push(...data.lines);
  return lines;
}

// Variantes de l'image : l'emballage peut avoir du texte clair sur fond foncé, des reflets, etc.
function variants(canvas) {
  const make = (filter) => {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.filter = filter;
    ctx.drawImage(canvas, 0, 0);
    return out;
  };
  return [
    make('grayscale(1) contrast(1.25)'),
    make('grayscale(1) invert(1) contrast(1.25)'),
    make('contrast(1.4) saturate(0)')
  ];
}

// canvas → nom de produit probable ('' si rien de lisible). Plusieurs essais, on garde le plus lisible.
export async function readProductName(canvas) {
  const worker = await getWorker();
  let best = { score: 0, name: '' };
  for (const candidate of variants(canvas)) {
    for (const mode of ['11', '3']) { // 11 = texte épars (emballages), 3 = automatique
      try {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(candidate, {}, { blocks: true });
        const lines = collectLines(data);
        const name = pickProductName(lines);
        const score = lines
          .filter((line) => /\p{L}{3,}/u.test(String(line.text || '')) && (Number(line.confidence) || 0) >= 50)
          .reduce((sum, line) => sum + (Number(line.confidence) || 0) * Math.max(1, (line.bbox?.y1 ?? 0) - (line.bbox?.y0 ?? 0)), 0);
        if (name && score > best.score) best = { score, name };
      } catch {
        // cet essai a échoué : on passe au suivant
      }
    }
    if (best.score > 0 && best.name.length >= 8) break; // résultat déjà bon, inutile de continuer
  }
  return best.name;
}
