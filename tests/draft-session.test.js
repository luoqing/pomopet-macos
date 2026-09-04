import { describe, expect, it } from 'vitest';
import {
  beginDraftSave,
  cancelDraft,
  createDraftSession,
  draftSaveFailed,
  draftSaveSucceeded,
  hasDirtyDrafts,
  syncDraftSaved,
  updateDraft
} from '../src/ui/draft-session.js';

describe('draft sessions', () => {
  it('protects an active draft from state ticks and restores saved values on cancel', () => {
    let session = createDraftSession({ title: '喝水', intervalMinutes: 30 });
    session = updateDraft(session, { title: '起来活动' });

    expect(syncDraftSaved(session, { title: '服务端刷新', intervalMinutes: 60 })).toEqual(session);
    expect(cancelDraft(session)).toMatchObject({
      saved: { title: '喝水', intervalMinutes: 30 },
      draft: { title: '喝水', intervalMinutes: 30 },
      dirty: false,
      saving: false,
      error: null
    });
  });

  it('submits once, retains failed drafts, and resets saved values after success', () => {
    let session = updateDraft(createDraftSession({ title: '喝水' }), { title: '喝三口水' });
    const first = beginDraftSave(session);
    const duplicate = beginDraftSave(first.session);

    expect(first.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    session = draftSaveFailed(first.session, '保存失败，请重试');
    expect(session).toMatchObject({ draft: { title: '喝三口水' }, dirty: true, saving: false, error: '保存失败，请重试' });

    session = draftSaveSucceeded(beginDraftSave(session).session);
    expect(session).toMatchObject({ saved: { title: '喝三口水' }, draft: { title: '喝三口水' }, dirty: false, saving: false, error: null });
  });

  it('reports aggregate dirty across independent editors', () => {
    const clean = createDraftSession({ enabled: true });
    const dirty = updateDraft(createDraftSession({ name: '末末' }), { name: '团子' });
    expect(hasDirtyDrafts({ reminder: clean, persona: dirty, todo: null })).toBe(true);
    expect(hasDirtyDrafts({ reminder: clean, persona: cancelDraft(dirty) })).toBe(false);
  });
});
