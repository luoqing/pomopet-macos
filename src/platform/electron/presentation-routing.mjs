export function createPresentationRouter({ sendPet, showBlocker, shouldShowBlocker }) {
  return {
    route(event) {
      if (event.actions?.offwork && shouldShowBlocker()) showBlocker(event);
      sendPet(event);
    }
  };
}

export function sendPresentationWhenReady(win, event) {
  if (!win || win.isDestroyed()) return false;
  const deliver = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed?.()) return;
    win.webContents.send('presentation', event);
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver);
  else deliver();
  return true;
}

export function showPresentationNotification(event, { isSupported, createNotification, openControl, muted = false }) {
  if (!['alarm', 'offwork', 'ignored'].includes(event?.category) || !isSupported()) return false;
  const notification = createNotification({
    title: event.title || (event.label ? `Pomopet · ${event.label}` : 'Pomopet 想提醒你'),
    body: event.body || event.text,
    silent: Boolean(muted)
  });
  notification.on('click', openControl);
  notification.show();
  return true;
}
