const clone = (value) => value == null ? value : structuredClone(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createDraftSession(saved) {
  const value = clone(saved);
  return { saved: value, draft: clone(value), dirty: false, saving: false, error: null };
}

export function updateDraft(session, patch) {
  const draft = { ...session.draft, ...clone(patch) };
  return { ...session, draft, dirty: !equal(draft, session.saved), error: null };
}

export function syncDraftSaved(session, saved) {
  if (session.dirty || session.saving) return session;
  return createDraftSession(saved);
}

export function beginDraftSave(session) {
  if (session.saving) return { accepted: false, session };
  return { accepted: true, session: { ...session, saving: true, error: null } };
}

export function draftSaveSucceeded(session, saved = session.draft) {
  return createDraftSession(saved);
}

export function draftSaveFailed(session, error) {
  return { ...session, saving: false, dirty: true, error: String(error || '保存失败，请重试') };
}

export function cancelDraft(session) {
  return createDraftSession(session.saved);
}

export function hasDirtyDrafts(sessions) {
  return Object.values(sessions).some((session) => Boolean(session?.dirty || session?.saving));
}
