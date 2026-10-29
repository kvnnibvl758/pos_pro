// Gestion des catégories : renommer ou supprimer (les produits ne sont jamais supprimés : ils passent dans « Autres »).
import { state } from './state.js';
import * as store from './store.js';
import { confirmDialog } from './confirmDialog.js';

const FALLBACK_CATEGORY = 'Autres';

function categoryCounts() {
  const map = new Map();
  state.products.forEach((product) => {
    const name = String(product.category || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const entry = map.get(key) || { name, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function openCategoriesManager(onChange) {
  document.getElementById('categoriesManager')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'categoriesManager';
  overlay.className = 'confirm-notice-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = document.createElement('div');
  box.className = 'confirm-notice-box categories-box';
  overlay.appendChild(box);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  const render = (message = '') => {
    box.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = 'Gérer les catégories';
    const hint = document.createElement('p');
    hint.className = 'categories-hint';
    hint.textContent = 'Supprimer une catégorie ne supprime pas ses produits : ils passent dans « Autres ».';
    box.append(title, hint);
    if (message) {
      const note = document.createElement('p');
      note.className = 'product-saved-msg';
      note.textContent = message;
      box.appendChild(note);
    }

    const list = document.createElement('div');
    list.className = 'categories-list';
    const categories = categoryCounts();
    if (!categories.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Aucune catégorie pour le moment.';
      list.appendChild(empty);
    }
    categories.forEach((category) => {
      const row = document.createElement('div');
      row.className = 'categories-row';
      const label = document.createElement('span');
      label.className = 'categories-name';
      label.textContent = `${category.name} (${category.count})`;
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'categories-btn';
      rename.textContent = 'Renommer';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'categories-btn categories-btn-danger';
      remove.textContent = 'Supprimer';

      rename.addEventListener('click', () => {
        row.replaceChildren();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = category.name;
        input.maxLength = 40;
        input.className = 'categories-input';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'categories-btn';
        save.textContent = 'Enregistrer';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'categories-btn';
        cancel.textContent = 'Annuler';
        row.append(input, save, cancel);
        input.focus();
        input.select();
        const apply = async () => {
          const next = input.value.trim();
          if (!next || next === category.name) { render(); return; }
          save.disabled = true;
          try {
            await store.recategorize(category.name, next);
            onChange();
            render(`Catégorie renommée en « ${next} ».`);
          } catch (error) {
            render(error.message);
          }
        };
        save.addEventListener('click', apply);
        cancel.addEventListener('click', () => render());
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') apply(); if (event.key === 'Escape') render(); });
      });

      remove.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'Supprimer cette catégorie ?',
          message: `La catégorie « ${category.name} » sera supprimée. Ses ${category.count} produit${category.count > 1 ? 's' : ''} ne seront pas supprimé${category.count > 1 ? 's' : ''} : ils passeront dans « ${FALLBACK_CATEGORY} ».`,
          confirmLabel: 'Oui, supprimer la catégorie',
          cancelLabel: 'Non, garder',
          danger: true
        });
        if (!confirmed) return;
        try {
          await store.recategorize(category.name, FALLBACK_CATEGORY);
          onChange();
          render(`Catégorie « ${category.name} » supprimée.`);
        } catch (error) {
          render(error.message);
        }
      });

      row.append(label, rename, remove);
      list.appendChild(row);
    });
    box.appendChild(list);

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'confirm-notice-btn';
    done.textContent = 'Fermer';
    done.addEventListener('click', close);
    box.appendChild(done);
  };

  render();
  document.body.appendChild(overlay);
}
