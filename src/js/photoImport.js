// ===== IMPORT DE PRODUITS PAR PHOTOS =====
// Pour chaque photo : lecture du code-barres, sinon lecture du texte de l'emballage (OCR local), puis création
// d'un produit avec la photo, le nom trouvé et un prix par défaut. Tout est vérifiable et modifiable avant l'enregistrement.
import { state } from './state.js';
import * as store from './store.js';
import { decodeBarcodeFromFile, lookupProductByBarcode } from './barcode.js';
import { readProductName, stopOcr } from './ocr.js';

const DEFAULT_PRICE = 100000;
const THUMB_SIZE = 320;
const OCR_SIZE = 1600;

const SOURCE_LABELS = {
  barcode: 'nom trouvé par le code-barres',
  ocr: 'nom lu sur l’emballage — à vérifier',
  file: 'nom du fichier — à vérifier',
  none: 'à nommer'
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function drawScaled(bitmap, maxSide, gray = false) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (gray) ctx.filter = 'grayscale(1) contrast(1.2)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function nameFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\p{L}{3,}/u.test(base)) return '';
  if (/^(img|dsc|dcim|image|photo|screenshot|capture|whatsapp|pxl|wp|p)\b/i.test(base)) return '';
  return base.slice(0, 80);
}

async function analysePhoto(file, defaults) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const thumb = drawScaled(bitmap, THUMB_SIZE).toDataURL('image/jpeg', 0.75);

  let name = '';
  let source = 'none';
  let barcode = '';

  const code = await decodeBarcodeFromFile(file);
  if (code) {
    barcode = code;
    if (/^\d{6,14}$/.test(code)) {
      const found = await lookupProductByBarcode(code);
      if (found?.name) { name = found.name; source = 'barcode'; }
    }
  }
  if (!name) {
    try {
      name = await readProductName(drawScaled(bitmap, OCR_SIZE));
      if (name) source = 'ocr';
    } catch {
      name = '';
    }
  }
  if (!name) {
    name = nameFromFileName(file.name);
    if (name) source = 'file';
  }
  bitmap.close?.();
  return { fileName: file.name, image: thumb, name, source, barcode, price: defaults.price, include: true, note: '' };
}

function markDuplicates(rows) {
  const knownBarcodes = new Set(state.products.map((p) => p.barcode).filter(Boolean));
  const usedNames = new Set(state.products.map((p) => String(p.name || '').trim().toLowerCase()));
  const seenBarcodes = new Set();
  rows.forEach((row) => {
    row.note = '';
    if (row.barcode && (knownBarcodes.has(row.barcode) || seenBarcodes.has(row.barcode))) {
      row.include = false;
      row.note = 'Déjà enregistré (même code-barres)';
    }
    if (row.barcode) seenBarcodes.add(row.barcode);
    // Même nom qu'un autre produit (cas courant : plusieurs produits de la même marque) : on les distingue par un numéro.
    const base = row.name.trim();
    if (!base) return;
    let candidate = base;
    let n = 1;
    while (usedNames.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${base} ${n}`;
    }
    usedNames.add(candidate.toLowerCase());
    if (candidate !== base) {
      row.name = candidate;
      if (!row.note) row.note = 'Même nom qu’un autre produit : précisez-le (ex. Crème, Huile, Lait…)';
    }
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openPhotoImport(onChange) {
  document.getElementById('photoImport')?.remove();
  const overlay = el('div', 'confirm-notice-overlay');
  overlay.id = 'photoImport';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', 'confirm-notice-box photo-import-box');
  overlay.appendChild(box);
  let cancelled = false;

  const close = () => {
    cancelled = true;
    stopOcr();
    overlay.remove();
  };

  const existing = [...new Set(state.products.map((p) => String(p.category || '').trim()).filter(Boolean))];
  const defaults = { price: DEFAULT_PRICE, category: existing[0] || 'Cosmétiques' };

  // ----- Étape 1 : choix des photos -----
  const renderSetup = () => {
    box.replaceChildren();
    box.append(el('h2', '', 'Importer des produits depuis des photos'));
    box.append(el('p', 'categories-hint', 'Choisissez les photos des produits (une photo par produit, emballage bien visible). Le nom est lu automatiquement sur le code-barres ou sur l’emballage. Vous pourrez tout vérifier avant d’enregistrer.'));

    const priceLabel = el('label', 'photo-field', 'Prix de départ de tous les produits (GNF)');
    const price = el('input');
    price.type = 'number'; price.min = '0'; price.step = '1000'; price.value = String(defaults.price);
    priceLabel.append(price);

    const catLabel = el('label', 'photo-field', 'Catégorie de ces produits');
    const category = el('input');
    category.type = 'text'; category.maxLength = 40; category.value = defaults.category;
    catLabel.append(category);

    const filesLabel = el('label', 'photo-field', 'Photos');
    const files = el('input');
    files.type = 'file'; files.accept = 'image/*'; files.multiple = true;
    filesLabel.append(files);

    const start = el('button', 'confirm-notice-btn', 'Lire les photos');
    start.type = 'button';
    start.disabled = true;
    files.addEventListener('change', () => {
      start.disabled = !files.files.length;
      start.textContent = files.files.length ? `Lire ${files.files.length} photo${files.files.length > 1 ? 's' : ''}` : 'Lire les photos';
    });
    const cancel = el('button', 'categories-btn', 'Annuler');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    start.addEventListener('click', () => {
      defaults.price = Math.max(0, Number(price.value) || DEFAULT_PRICE);
      defaults.category = category.value.trim() || 'Autres';
      runAnalysis([...files.files]);
    });
    box.append(priceLabel, catLabel, filesLabel, start, cancel);
  };

  // ----- Étape 2 : lecture des photos -----
  const runAnalysis = async (files) => {
    box.replaceChildren();
    box.append(el('h2', '', 'Lecture des photos…'));
    const status = el('p', '', 'Préparation du lecteur de texte…');
    const bar = el('progress'); bar.max = files.length; bar.value = 0; bar.className = 'photo-progress';
    const stop = el('button', 'categories-btn', 'Annuler');
    stop.type = 'button';
    stop.addEventListener('click', close);
    box.append(status, bar, el('p', 'categories-hint', 'Ne fermez pas cette fenêtre. Comptez quelques secondes par photo.'), stop);

    const rows = [];
    for (let i = 0; i < files.length; i += 1) {
      if (cancelled) return;
      status.textContent = `Photo ${i + 1} sur ${files.length}…`;
      try {
        rows.push(await analysePhoto(files[i], defaults));
      } catch {
        rows.push({ fileName: files[i].name, image: '', name: '', source: 'none', barcode: '', price: defaults.price, include: false, note: 'Photo illisible' });
      }
      bar.value = i + 1;
      await tick();
    }
    if (cancelled) return;
    stopOcr();
    markDuplicates(rows);
    renderReview(rows);
  };

  // ----- Étape 3 : vérification et enregistrement -----
  const renderReview = (rows) => {
    box.replaceChildren();
    box.append(el('h2', '', 'Vérifiez les produits'));
    box.append(el('p', 'categories-hint', `Catégorie : « ${defaults.category} ». Corrigez les noms signalés « à vérifier », décochez ceux que vous ne voulez pas.`));

    const bulk = el('div', 'photo-bulk');
    const bulkLabel = el('span', '', 'Prix pour tous :');
    const bulkPrice = el('input', 'categories-input');
    bulkPrice.type = 'number'; bulkPrice.min = '0'; bulkPrice.step = '1000'; bulkPrice.value = String(defaults.price);
    const bulkApply = el('button', 'categories-btn', 'Appliquer');
    bulkApply.type = 'button';
    bulk.append(bulkLabel, bulkPrice, bulkApply);

    const list = el('div', 'photo-list');
    const saveBtn = el('button', 'confirm-notice-btn');
    saveBtn.type = 'button';
    const message = el('p', 'photo-error');
    message.hidden = true;

    const refreshCount = () => {
      const n = rows.filter((row) => row.include).length;
      saveBtn.textContent = n ? `Enregistrer ${n} produit${n > 1 ? 's' : ''}` : 'Rien à enregistrer';
      saveBtn.disabled = !n;
    };

    const priceInputs = [];
    rows.forEach((row) => {
      const line = el('div', 'photo-row');
      const check = el('input'); check.type = 'checkbox'; check.checked = row.include;
      const img = el('img', 'photo-thumb'); img.alt = ''; if (row.image) img.src = row.image;
      const fields = el('div', 'photo-fields');
      const name = el('input', 'categories-input'); name.type = 'text'; name.maxLength = 80; name.value = row.name; name.placeholder = 'Nom du produit';
      const priceInput = el('input', 'categories-input photo-price'); priceInput.type = 'number'; priceInput.min = '0'; priceInput.step = '1000'; priceInput.value = String(row.price);
      priceInputs.push([row, priceInput]);
      const note = el('small', row.note || row.source !== 'barcode' ? 'photo-note warn' : 'photo-note', row.note || SOURCE_LABELS[row.source]);
      fields.append(name, note);
      check.addEventListener('change', () => { row.include = check.checked; refreshCount(); });
      name.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const inputs = [...list.querySelectorAll('.photo-fields input')];
        const next = inputs[inputs.indexOf(name) + 1];
        if (next) { next.focus(); next.select(); }
      });
      name.addEventListener('input', () => { row.name = name.value; if (row.source === 'none' && name.value.trim()) { row.source = 'file'; note.textContent = 'nom saisi'; } });
      priceInput.addEventListener('input', () => { row.price = Number(priceInput.value) || 0; });
      line.append(check, img, fields, priceInput);
      list.append(line);
    });
    bulkApply.addEventListener('click', () => {
      const value = Math.max(0, Number(bulkPrice.value) || 0);
      priceInputs.forEach(([row, input]) => { row.price = value; input.value = String(value); });
    });

    saveBtn.addEventListener('click', async () => {
      const chosen = rows.filter((row) => row.include);
      const bad = chosen.find((row) => !row.name.trim() || !(row.price > 0));
      if (bad) {
        message.hidden = false;
        message.textContent = 'Chaque produit coché doit avoir un nom et un prix supérieur à 0.';
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement…';
      try {
        await store.saveProductsBulk(chosen.map((row) => ({
          name: row.name.trim().slice(0, 80),
          category: defaults.category,
          price: row.price,
          trackStock: false,
          stock: 0,
          barcode: row.barcode || '',
          image: row.image
        })));
        onChange();
        renderDone(chosen.length);
      } catch (error) {
        message.hidden = false;
        message.textContent = /duplicate|unique|23505/i.test(String(error.message))
          ? 'Un des codes-barres est déjà enregistré. Décochez-le puis réessayez.'
          : error.message;
        refreshCount();
      }
    });

    const cancel = el('button', 'categories-btn', 'Annuler');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    box.append(bulk, list, message, saveBtn, cancel);
    refreshCount();
    const firstEmpty = [...list.querySelectorAll('.photo-fields input')].find((input) => !input.value.trim());
    if (firstEmpty) firstEmpty.focus();
  };

  const renderDone = (count) => {
    box.replaceChildren();
    box.append(el('h2', '', '✅ Terminé'));
    box.append(el('p', '', `${count} produit${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''}.`));
    const again = el('button', 'categories-btn', 'Importer d’autres photos');
    again.type = 'button';
    again.addEventListener('click', () => { cancelled = false; renderSetup(); });
    const done = el('button', 'confirm-notice-btn', 'Fermer');
    done.type = 'button';
    done.addEventListener('click', close);
    box.append(done, again);
  };

  renderSetup();
  document.body.appendChild(overlay);
}
