// Progressive enhancement for claiming. Without this, the links and forms
// still work as plain page loads.

const dialog = document.querySelector<HTMLDialogElement>('#claim-dialog');
const form = dialog?.querySelector<HTMLFormElement>('[data-claim-form]');
const toast = document.querySelector<HTMLElement>('[data-toast]');

const MESSAGES: Record<string, string> = {
  email: "That email doesn't look right. Fix it or leave it blank.",
  taken: 'Someone just claimed this one. Pick another?',
  gone: "This item isn't on the list anymore.",
  'not-found': "This item isn't on the list anymore.",
  server: 'Something went wrong saving that. Please try again.',
};

async function post(url: string, body: FormData): Promise<{ ok?: boolean; error?: string; claimCount?: number; claimed?: boolean }> {
  try {
    const res = await fetch(url, { method: 'POST', body, headers: { Accept: 'application/json' } });
    return await res.json();
  } catch {
    return { error: 'server' };
  }
}

function showToast(text: string) {
  if (!toast) return;
  toast.querySelector('[data-toast-text]')!.textContent = text;
  toast.hidden = false;
}

// Clean ?claim= / ?claimed= / ?error= out of the address bar so a refresh doesn't repeat them.
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

if (dialog && form) {
  const itemInput = form.querySelector<HTMLInputElement>('[name=itemId]')!;
  const titleEl = form.querySelector<HTMLElement>('[data-claim-title]')!;
  const errorEl = form.querySelector<HTMLElement>('[data-claim-error]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-claim-submit]')!;
  const showError = (code: string) => {
    errorEl.textContent = MESSAGES[code] ?? MESSAGES.server;
    errorEl.hidden = false;
  };

  // Opened by the server (no-JS fallback or an error redirect): make it a real modal.
  if (dialog.open) {
    dialog.close();
    dialog.showModal();
  }

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-claim]');
    if (!link) return;
    event.preventDefault();
    itemInput.value = link.dataset.claim!;
    titleEl.textContent = link.dataset.title ?? '';
    errorEl.hidden = true;
    dialog.showModal();
    form.querySelector<HTMLInputElement>('[name=name]')!.focus();
  });

  form.querySelector('[data-claim-cancel]')?.addEventListener('click', (event) => {
    event.preventDefault();
    dialog.close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const result = await post('/api/claim', new FormData(form));
    submit.disabled = false;
    if (!result.ok) return showError(result.error ?? 'server');

    const title = titleEl.textContent ?? '';
    const card = document.getElementById(`item-${itemInput.value}`);
    dialog.close();
    if (card) {
      card.querySelector<HTMLElement>('[data-claim]')?.setAttribute('hidden', '');
      card.querySelector<HTMLElement>('[data-giving]')!.hidden = false;
      if (result.claimed) {
        card.dataset.state = 'claimed';
        card.querySelector<HTMLElement>('[data-stamp]')!.hidden = false;
        const stat = document.querySelector<HTMLElement>('[data-stat-open]');
        if (stat) stat.textContent = String(Math.max(0, Number(stat.textContent) - 1));
      } else if (result.claimCount) {
        const count = card.querySelector<HTMLElement>('[data-multi-count]')!;
        count.textContent = `${result.claimCount} ${result.claimCount === 1 ? 'person is' : 'people are'} giving one`;
        count.hidden = false;
      }
    }
    showToast(`You're giving ${title}. Thank you!`);
  });
}

// Undo: remove the claim this browser just made, then show the fresh list.
document.querySelector<HTMLFormElement>('[data-undo-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await post('/api/unclaim', new FormData(event.currentTarget as HTMLFormElement));
  if (result.ok) location.reload();
  else showToast("Couldn't undo that one. It may have expired.");
});
