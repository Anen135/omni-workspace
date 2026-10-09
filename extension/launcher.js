async function open() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'connect', input: {} });
    if (result?.error) throw new Error(result.error.message);
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.remove(tab.id);
  } catch {
    document.getElementById('status').textContent = 'Не удалось открыть Omni. Повторите попытку.';
    document.getElementById('retry').hidden = false;
  }
}
document.getElementById('retry').addEventListener('click', () => { void open(); });
void open();
