import { addScenariosButton } from './scenario-picker';

/** Never replace malformed/newer save bytes with a fresh road just to get the editor running. */
export function showSaveRecovery(raw: string) {
  const root = document.getElementById('hud')!;
  root.replaceChildren();
  const card = document.createElement('section'); card.className = 'card save-recovery';
  const title = document.createElement('h2'); title.textContent = 'Cannot open this save';
  const message = document.createElement('p'); message.textContent = 'Your saved work is unchanged.';
  const download = document.createElement('button'); download.textContent = 'Download save';
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trapla-saved-work.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  card.append(title, message, download); addScenariosButton(card); root.append(card);
  document.getElementById('status')!.style.display = 'none';
}
