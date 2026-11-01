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

// Pour mise au point : toutes les lignes lues (texte, confiance, hauteur, position).
export async function debugLines(canvas, mode = '11') {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: mode });
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  return collectLines(data).map((line) => ({ text: line.text.trim(), conf: Math.round(line.confidence), h: line.bbox.y1 - line.bbox.y0, y: line.bbox.y0 }));
}

export async function stopOcr() {
  if (!workerPromise) return;
  try { (await workerPromise).terminate(); } catch { /* déjà arrêté */ }
  workerPromise = null;
}

const titleCase = (text) => text
  .toLowerCase()
  .replace(/(^|[\s'’-])(\p{L})/gu, (match, sep, letter) => sep + letter.toUpperCase());

// Marques courantes : sert à corriger une marque lue avec des défauts (« Ca ntu » → « Cantu »).
const BRANDS = [
  'Nivea', 'Dove', 'Rexona', 'Cantu', 'Garnier', 'Vaseline', 'Palmer’s', 'Mixa', 'CeraVe', 'La Roche-Posay', 'Eucerin',
  'Neutrogena', 'L’Oréal', 'Maybelline', 'Revlon', 'Clear', 'Axe', 'Sunsilk', 'Pantene', 'Head & Shoulders', 'Johnson’s',
  'Aveeno', 'Bioderma', 'Vichy', 'Avène', 'Uriage', 'Lacoste', 'Fa', 'Lux', 'Camay', 'Protex', 'Colgate', 'Signal',
  'Oral-B', 'Gillette', 'Old Spice', 'Carefree', 'Always', 'Dettol', 'Carolight', 'Fair & White', 'Clear Men', 'Movate',
  'Black Opal', 'Fashion Fair', 'Shea Moisture', 'Dark & Lovely', 'Soft & Beautiful', 'Organics', 'Cantu', 'Mielle',
  'Eco Style', 'Africa’s Best', 'ORS', 'Luster’s', 'Pink Lotion', 'Jergens', 'Olay', 'Elidor', 'Purederm', 'Skin Doctor',
  'Parley', 'Golden Girl', 'Diana', 'Caro White', 'Bioclarant', 'Epiderm', 'Venus', 'Zaron', 'Sheen', 'Nuxe', 'Yves Rocher'
];

const norm = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function fixBrand(text) {
  const key = norm(text);
  if (key.length < 3) return text;
  for (const brand of BRANDS) {
    const target = norm(brand);
    const limit = target.length >= 7 ? 2 : target.length >= 5 ? 1 : 0;
    if (editDistance(key, target) <= limit) return brand;
  }
  return text;
}

// Mots de publicité ou de contenance : ils ne font pas partie du nom du produit.
const NOISE = /^(moisture|hydration|care)$|\b(new|improved|made with|fair trade|net wt|net|wt|oz|ml|g|kg|more|free|complex|vitamin|with|extra|upto|up to|% )\b|\d+\s?(x|%|ml|g|oz)|\bfl\b/i;

function cleanLine(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N}%&'’.+\- ]/gu, ' ').replace(/\s+/g, ' ').replace(/^[-.+ ]+|[-.+ ]+$/g, '').trim();
}

const looksLikeSentence = (text) => {
  const words = text.split(' ');
  const lower = words.filter((word) => /^\p{Ll}/u.test(word)).length;
  return words.length >= 3 && lower >= 2;
};

// Garde les lignes qui ressemblent à un nom de produit (marque + type), dans l'ordre de lecture.
export function pickProductName(lines) {
  const usable = lines
    .map((line) => ({
      text: cleanLine(line.text),
      height: Math.max(1, (line.bbox?.y1 ?? 0) - (line.bbox?.y0 ?? 0)),
      y: line.bbox?.y0 ?? 0,
      confidence: Number(line.confidence) || 0
    }))
    .filter((line) => line.confidence >= 60 && /\p{L}{3,}/u.test(line.text) && line.text.length >= 3 && line.text.length <= 40)
    .filter((line) => !NOISE.test(line.text) && !looksLikeSentence(line.text));
  if (!usable.length) return '';

  // Les plus visibles d'abord (la marque et le type de produit sont en gros), puis on remet dans l'ordre de lecture.
  const byHeight = [...usable].sort((a, b) => b.height - a.height);
  const reference = byHeight[Math.min(2, byHeight.length - 1)].height;
  const seen = new Set();
  const chosen = [];
  byHeight.forEach((line) => {
    const key = norm(line.text);
    if (chosen.length >= 5 || seen.has(key) || line.height < reference * 0.45) return;
    seen.add(key);
    chosen.push(line);
  });
  chosen.sort((a, b) => a.y - b.y);
  const parts = chosen.map((line, index) => (index === 0 ? fixBrand(line.text) : line.text));
  const SHORT_OK = new Set(['la', 'le', 'les', 'de', 'du', 'des', 'of', 'in', 'to', 'et', 'and', '&', '+']);
  const words = parts.join(' ').split(' ').filter((word) => word.length > 2 || /\d/.test(word) || SHORT_OK.has(word.toLowerCase()));
  // Supprime les passages répétés (ex. « Shea Butter » lu deux fois).
  const dedup = [];
  words.forEach((word, i) => {
    const pair = `${words[i]} ${words[i + 1] || ''}`.toLowerCase();
    const prev = dedup.join(' ').toLowerCase();
    if (words[i + 1] && prev.includes(pair)) { words[i + 1] = ''; return; }
    if (word) dedup.push(word);
  });
  const joined = dedup.filter(Boolean).join(' ');
  const name = titleCase(joined).replace(/\b(Spf|Uv|Pc|Ph|Ml|Gnf)\b/gi, (m) => m.toUpperCase());
  return name.slice(0, 80);
}

function collectLines(data) {
  const lines = [];
  (data.blocks || []).forEach((block) => (block.paragraphs || []).forEach((paragraph) => (paragraph.lines || []).forEach((line) => lines.push(line))));
  if (!lines.length && Array.isArray(data.lines)) lines.push(...data.lines);
  return lines;
}

// Variantes de l'image : l'emballage peut avoir du texte clair sur fond foncé, des reflets, etc.
// Les petites images sont agrandies : le texte est ainsi assez gros pour être lu.
function variants(canvas) {
  const target = 2000;
  const scale = Math.min(4, Math.max(1, target / Math.max(canvas.width, canvas.height)));
  const make = (filter) => {
    const out = document.createElement('canvas');
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = filter;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  };
  return [
    make('grayscale(1) contrast(1.25)'),
    make('grayscale(1) invert(1) contrast(1.25)'),
    make('grayscale(1) contrast(1.6) brightness(1.1)')
  ];
}

const countLetters = (lines) => lines
  .filter((line) => (Number(line.confidence) || 0) >= 60)
  .reduce((sum, line) => sum + (String(line.text || '').match(/\p{L}/gu) || []).length, 0);

// canvas → nom de produit probable ('' si rien de lisible). Plusieurs essais, on garde le plus lisible.
export async function readProductName(canvas) {
  const worker = await getWorker();
  let bestLines = [];
  let bestScore = 0;
  for (const candidate of variants(canvas)) {
    for (const mode of ['11', '3']) { // 11 = texte épars (emballages), 3 = automatique
      try {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(candidate, {}, { blocks: true });
        const lines = collectLines(data);
        const score = countLetters(lines);
        if (score > bestScore) { bestScore = score; bestLines = lines; }
      } catch {
        // cet essai a échoué : on passe au suivant
      }
    }
  }
  return pickProductName(bestLines);
}
