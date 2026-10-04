import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/shared/Modal';
import { useCoach } from './store';

const savedDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

/** The coach's saved programs: what they are, and the way to drop one. */
export function Library() {
  const coach = useCoach();
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const toRemove = coach.library.find(item => item.id === removing);

  return (
    <div className="max-w-xl lg:max-w-5xl mx-auto px-5 pt-1 pb-8">
      <Link to="/sporcular" className="inline-flex items-center h-11 -ml-1 px-1 text-[15px] text-(--color-text-secondary)">‹ Antrenör</Link>
      <h1 className="a-display text-[clamp(40px,13vw,64px)] tracking-[-0.01em] leading-[0.95]">Program kütüphanesi</h1>
      <p className="mt-2 text-[15px] leading-snug text-(--color-text-secondary)">
        Bir sporcunun Program sekmesinde "Kütüphaneye kaydet" ile eklenir; başka bir sporcuya "Kütüphaneden yapıştır" ile kopyalanır, sonra ona göre düzenlenir.
      </p>

      <ul className="mt-5 grid gap-2 lg:grid-cols-2 lg:items-start">
        {coach.library.map(template => {
          const expanded = open === template.id;
          const moves = template.days.reduce((sum, day) => sum + day.exercises.length, 0);
          return (
            <li key={template.id} className="a-card px-4 py-3">
              <button onClick={() => setOpen(expanded ? null : template.id)} aria-expanded={expanded} className="w-full text-left">
                <span className="block text-[18px] font-semibold">{template.name}</span>
                <span className="block mt-0.5 text-[13px] text-(--color-text-secondary)">
                  {template.days.length} gün · {moves} hareket · {savedDate.format(new Date(template.savedAt))}
                </span>
              </button>
              {expanded && (
                <div className="mt-2">
                  {template.days.map(day => (
                    <div key={day.name} className="py-2 border-t border-(--color-border)">
                      <p className="text-[15px] font-semibold">{day.name}</p>
                      <p className="mt-0.5 text-[14px] leading-snug text-(--color-text-secondary)">
                        {day.exercises.map(exercise => `${exercise.name} ${exercise.defaultSets}×${exercise.defaultReps || '—'}`).join(' · ')}
                      </p>
                    </div>
                  ))}
                  <button onClick={() => setRemoving(template.id)} className="h-11 text-[14px]" style={{ color: 'var(--lb-drop)' }}>Kütüphaneden sil</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {coach.library.length === 0 && <p className="mt-5 text-[16px]">Kütüphanen boş.</p>}

      <Modal isOpen={toRemove !== undefined} onClose={() => setRemoving(null)} confirmVariant="danger" confirmText="Sil"
        title={`${toRemove?.name ?? ''} silinsin mi?`}
        message="Yalnız kütüphaneden silinir. Bu programı yapıştırdığın sporcuların programları değişmez."
        onConfirm={() => { if (removing) coach.removeTemplate(removing); setRemoving(null); setOpen(null); }} />
    </div>
  );
}
