// Между вкладками передаётся только сигнал: ни профиль, ни cookie, ни CSRF не сохраняются.
const KEY = 'mm-session-change';
let channel = null;
try { channel = new BroadcastChannel(KEY); } catch { /* storage работает и без BroadcastChannel */ }

export function announceSessionChange() {
  try { channel?.postMessage('changed'); } catch { /* закрытый канал */ }
  try {
    localStorage.setItem(KEY, `${Date.now()}:${Math.random()}`);
    localStorage.removeItem(KEY);
  } catch { /* хранилище может быть запрещено */ }
}

export function onSessionChange(callback) {
  channel?.addEventListener('message', (event) => {
    if (event.data === 'changed') callback();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === KEY && event.newValue) callback();
  });
}
