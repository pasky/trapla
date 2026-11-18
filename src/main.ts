// The page's entry: what a visitor sees first, kept small so it shows at once. A browser that cannot draw the map
// or a screen too small for it is told so; then the start screen, usable while the game's own code (src/app.ts,
// three.js and the engine) loads behind it; a picked mission starts downloading its map at once, with a
// loading card.
import './style.css';
import { scenarioParams } from './core/data/scenario';
import { hasProjectSave } from './project-store-contract';
import { StorageGuard } from './ui/storage-guard';
import { pickScenario } from './ui/scenario-picker';
import { deviceCheck } from './ui/device-check';
import { Loading } from './ui/loading';
import { prefetchPack } from './packs';

const game = import('./app');
game.catch(() => { /* reported when it is needed */ });

async function boot() {
  await deviceCheck();
  const storage = new StorageGuard();
  const picked = await pickScenario({ hasSaved: (scenarioId, presetId) => {
    try { return hasProjectSave(storage, { scenarioId, presetId }) || (presetId === scenarioParams(scenarioId).presetId || presetId === scenarioId)
      && storage.getItem(`trapla.${scenarioId}.design`) !== null; } catch { return false; }
  } });
  const scenario = scenarioParams(picked.scenarioId, picked.presetId);
  document.title = `${scenario.title} — Trapla`;
  const status = document.getElementById('status');
  if (status) status.style.display = 'none';
  const loading = new Loading(document.getElementById('view')!, scenario.title);
  loading.track(prefetchPack(scenario.id));
  try {
    const { startApp } = await game;
    await startApp({ picked, storage, loading });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    if (loading.el.isConnected) loading.fail(/webgl|context/i.test(message) ? 'This browser could not start the 3D map.' : 'Check the connection and try again.');
    else { const s = document.getElementById('status'); if (s) { s.textContent = `Something went wrong: ${message}`; s.style.display = ''; } }
  }
}

void boot();
