import { describe, expect, it } from 'vitest';
import {
  beginCreate,
  beginEdit,
  cancelEdit,
  createEditableSession,
  editableSaveFailed,
  editableSaveSucceeded,
  startEditableSave,
  syncEditableSaved,
  updateEditableDraft
} from '../src/ui/editable-session.js';

describe('editable sessions', () => {
  it('ignores draft updates until the editor has explicitly entered create or edit mode', () => {
    let session = createEditableSession({ enabled: true });

    session = updateEditableDraft(session, { enabled: false });
    expect(session).toMatchObject({ mode: 'idle', draft: { enabled: true }, dirty: false });

    session = beginEdit(session, { enabled: true, time: '18:30' }, 'offwork');
    session = updateEditableDraft(session, { time: '20:00' });
    expect(session).toMatchObject({ mode: 'editing', id: 'offwork', draft: { enabled: true, time: '20:00' }, dirty: true });
  });

  it('protects dirty drafts from external state ticks and accepts clean saved updates', () => {
    let session = beginEdit(createEditableSession({ title: '旧标题' }), { title: '旧标题' }, 'meeting-1');

    session = updateEditableDraft(session, { title: '正在输入' });
    expect(syncEditableSaved(session, { title: '服务端刷新' })).toEqual(session);

    session = cancelEdit(session);
    session = syncEditableSaved(session, { title: '服务端刷新' });
    expect(session).toMatchObject({ mode: 'idle', saved: { title: '服务端刷新' }, draft: { title: '服务端刷新' }, dirty: false });
  });

  it('retains failed drafts and exits editing only after a successful save', () => {
    let session = updateEditableDraft(beginCreate(createEditableSession({ title: '' }), { title: '' }), { title: '需求评审' });
    const attempt = startEditableSave(session);

    expect(attempt.accepted).toBe(true);
    expect(startEditableSave(attempt.session).accepted).toBe(false);

    session = editableSaveFailed(attempt.session, '保存失败');
    expect(session).toMatchObject({ mode: 'creating', draft: { title: '需求评审' }, dirty: true, saving: false, error: '保存失败' });

    session = editableSaveSucceeded(startEditableSave(session).session, { id: 'meeting-1', title: '需求评审' });
    expect(session).toMatchObject({ mode: 'idle', id: null, saved: { id: 'meeting-1', title: '需求评审' }, draft: { id: 'meeting-1', title: '需求评审' }, dirty: false, saving: false, error: null });
  });
});
