import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Modal } from '@/components/shared/Modal';
import { sinceText, useCoach } from './store';

/** The athlete side: who can see my workouts, and the way to stop it. */
export function MyCoach() {
  const coach = useCoach();
  const joined = (useLocation().state as { joined?: string } | null)?.joined;
  const [leaving, setLeaving] = useState<string | null>(null);

  return (
    <div className="max-w-xl mx-auto px-5 pt-2 pb-8">
      <h1 className="a-display text-[clamp(44px,15vw,64px)] tracking-[-0.01em]">Antrenörüm</h1>

      {joined && coach.coaches.some(item => item.name === joined) && (
        <p className="mt-4 a-card px-4 py-3 text-[16px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--lb-gain)' }}>
          {joined} artık antrenmanlarını görebiliyor.
        </p>
      )}

      {coach.coaches.length === 0 ? (
        <p className="mt-4 text-[17px] leading-snug">
          Antrenörün yok. Antrenörün sana bir davet linki gönderince, linki açıp onayladığında burada görünür.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {coach.coaches.map(item => (
            <li key={item.name} className="a-card px-4 py-4">
              <p className="text-[19px] font-semibold">{item.name}</p>
              <p className="mt-1 text-[15px] leading-snug text-(--color-text-secondary)">
                {sinceText(item.since)} antrenmanlarını görüyor. Kayıtlarını değiştiremez.
              </p>
              <button onClick={() => setLeaving(item.name)} className="mt-3 h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium">
                Bağı kaldır
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12">
        <h2 className="a-display text-[30px]">Antrenör müsün?</h2>
        <p className="mt-1 text-[16px] leading-snug text-(--color-text-secondary)">
          Ekibini kur; kim antrenman yaptı, kim aksadı, kimin hareketi yerinde sayıyor, tek listede gör.
        </p>
        <Link to="/sporcular" className="mt-4 flex items-center justify-center h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">
          Ekibim
        </Link>
      </section>

      <Modal isOpen={leaving !== null} onClose={() => setLeaving(null)} confirmVariant="danger" confirmText="Bağı kaldır"
        title="Bağ kaldırılsın mı?"
        message={`${leaving ?? ''} artık antrenmanlarını göremeyecek. Yeniden bağlanmak için yeni bir davet linki gerekir.`}
        onConfirm={() => { if (leaving) coach.leaveCoach(leaving); setLeaving(null); }} />
    </div>
  );
}
