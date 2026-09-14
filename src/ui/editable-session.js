const clone = (value) => value == null ? value : structuredClone(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createEditableSession(saved) {
  const value = clone(saved);
  return { mode: 'idle', id: null, saved: value, draft: clone(value), dirty: false, saving: false, error: null };
}

export function beginCreate(session, draft) {
  const value = clone(draft);
  return { ...session, mode: 'creating', id: null, saved: clone(value), draft: clone(value), dirty: false, saving: false, error: null };
}

export function beginEdit(session, saved, id = saved?.id ?? null) {
  const value = clone(saved);
  return { ...session, mode: 'editing', id, saved: value, draft: clone(value), dirty: false, saving: false, error: null };
}

export function updateEditableDraft(session, patch) {
  if (session.mode === 'idle' || session.saving) return session;
  const draft = { ...session.draft, ...clone(patch) };
  return { ...session, draft, dirty: !equal(draft, session.saved), error: null };
}

export function syncEditableSaved(session, saved) {
  if (session.mode !== 'idle' || session.dirty || session.saving) return session;
  return createEditableSession(saved);
}

export function startEditableSave(session) {
  if (session.mode === 'idle' || session.saving) return { accepted: false, session };
  return { accepted: true, session: { ...session, saving: true, error: null } };
}

export function editableSaveSucceeded(session, saved = session.draft) {
  return createEditableSession(saved);
}

export function editableSaveFailed(session, error) {
  return { ...session, saving: false, dirty: true, error: String(error || '保存失败，请重试') };
}

export function cancelEdit(session) {
  return createEditableSession(session.saved);
}

export function isEditing(session) {
  return Boolean(session && session.mode !== 'idle');
}
