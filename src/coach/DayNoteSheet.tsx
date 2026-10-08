import { useState } from 'react';
import { BottomSheet } from '@/components/shared/BottomSheet';
import type { CoachComment } from './comments';

const noteDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

/**
 * One workout of the athlete's week: their own note on it, the coach's
 * notes, and (where a coach is looking) the box to leave one.
 */
export function DayNoteSheet({ title, status, athleteNote, notes, onAdd, onClose }: {
  title: string;
  status?: string;
  athleteNote?: string;
  notes: CoachComment[];
  onAdd?: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  // The text is cleared only once it has gone: on a weak connection it stays, to send again.
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const send = async () => {
    if (!onAdd || !text.trim() || state === 'sending') return;
    setState('sending');
    const ok = await onAdd(text.trim());
    if (ok) setText('');
    setState(ok ? 'sent' : 'failed');
  };
  return (
    <BottomSheet isOpen onClose={onClose} title={title}>
      {status && <p className="text-[14px] text-(--color-text-secondary)">{status}</p>}
      <div className="mt-3 space-y-3">
        {athleteNote?.trim() && (
          <div className="border-l-2 lb-rule-strong pl-3">
            <p className="lb-label">Sporcunun notu</p>
            <p className="mt-1 text-[15px] whitespace-pre-line">{athleteNote.trim()}</p>
          </div>
        )}
        {notes.map(note => (
          <div key={note.id} className="border-l-2 lb-rule-strong pl-3">
            <p className="lb-label">Antrenör notu · {note.author} · {noteDate.format(new Date(note.at))}</p>
            <p className="mt-1 text-[15px] whitespace-pre-line">{note.text}</p>
          </div>
        ))}
        {!athleteNote?.trim() && notes.length === 0 && !onAdd && <p className="text-[15px] text-(--color-text-secondary)">Not yok.</p>}
      </div>
      {onAdd && (
        <form className="mt-4" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label htmlFor="day-note" className="lb-label" style={state === 'failed' ? { color: 'var(--lb-drop)' } : undefined}>
            {state === 'sent' ? 'Bırakıldı. Bir not daha:' : state === 'failed' ? 'Gönderilemedi; yazdığın duruyor, tekrar dene.' : 'Bu antrenmana not bırak; sporcu antrenmana başlarken görür.'}
          </label>
          <textarea id="day-note" value={text} onChange={event => { setText(event.target.value); if (state !== 'sending') setState('idle'); }} rows={3}
            placeholder="Ör. bu hafta son setleri tükenişe götür, setler arası 2 dk dinlen"
            className="mt-1 w-full px-3 py-2 text-[16px] bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:outline-none resize-y" />
          <button type="submit" disabled={!text.trim() || state === 'sending'}
            className="mt-1 h-11 px-4 rounded-full bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold disabled:opacity-40">
            {state === 'sending' ? 'Gönderiliyor…' : 'Notu bırak'}
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
