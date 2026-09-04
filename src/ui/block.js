import { companionAnimationSrc } from './asset-paths.js';

const api = window.pomopet || { command: async () => {}, hideBlocker: async () => {} };

function show(event) {
  const angry = ['annoyed', 'angryStanding'].includes(event.kind);
  document.querySelector('#blockLabel').textContent = angry ? '末末生气了' : '今天收工';
  document.querySelector('#blockText').textContent = event.text;
  document.querySelector('#blockSnooze').textContent = `再忙 ${Math.max(1, Number(event.actions?.snoozeMinutes) || 10)} 分钟`;
  document.querySelector('#blockPet').src = companionAnimationSrc(event.kind === 'angryStanding' ? 'angry-standing' : event.kind === 'annoyed' ? 'annoyed' : 'fainted');
}

async function closeWith(commandName) {
  const note = document.querySelector('#offworkNote').value.trim();
  if (!note) return;
  if (commandName === 'offwork:snooze') await api.command(commandName, { note });
  if (commandName === 'offwork:dismiss') await api.command(commandName, { note });
  await api.hideBlocker();
}

document.querySelector('#blockSnooze').onclick = () => closeWith('offwork:snooze');
document.querySelector('#blockDismiss').onclick = () => closeWith('offwork:dismiss');
document.querySelector('#offworkNote').oninput = (event) => {
  const disabled = !event.target.value.trim();
  document.querySelector('#blockSnooze').disabled = disabled;
  document.querySelector('#blockDismiss').disabled = disabled;
};
api.onPresentation?.(show);
show({ kind: 'fainted', text: '下班啦。电脑不睡，你也得睡会儿。', actions: { snoozeMinutes: 10 } });
