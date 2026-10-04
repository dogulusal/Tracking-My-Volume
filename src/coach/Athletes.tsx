import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agoText, needsAttention, summarizeAthlete, type AthleteSummary } from './summary';
import { InviteSheet } from './InviteSheet';
import { useCoach, type Athlete } from './store';

type Row = { athlete: Athlete; summary: AthleteSummary; reason: string | null };

// Longest without training first; someone with no record at all before them.
const byQuiet = (a: Row, b: Row) => (b.summary.daysSinceLast ?? Infinity) - (a.summary.daysSinceLast ?? Infinity);

function AthleteRow({ row }: { row: Row }) {
  const { athlete, summary, reason } = row;
  const days = summary.daysSinceLast;
  return (
    <li>
      <Link to={`/sporcular/${athlete.id}`} className="lb-press a-card flex items-center gap-3 px-4 py-3 min-h-[76px]">
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-semibold truncate">{athlete.name}</p>
          <p className="text-[13px] text-(--color-text-secondary) truncate">
            {athlete.group ? `${athlete.group} · ` : ''}{summary.weekTotal ? `${summary.weekLabel} · bu hafta ${summary.weekDone}/${summary.weekTotal}` : 'program kurulmadı'}
          </p>
          {reason ? (
            <p className="text-[13px]" style={{ color: 'var(--lb-drop)' }}>{reason}</p>
          ) : (
            <p className="text-[13px] text-(--color-text-secondary)">
              {summary.compared
                ? <><span className="font-semibold" style={{ color: summary.improved ? 'var(--lb-gain)' : undefined }}>{summary.improved}/{summary.compared}</span> hareket geçen haftayı geçti</>
                : 'bu hafta ilk kayıtlar'}
              {summary.stalled > 0 && ` · ${summary.stalled} yerinde sayıyor`}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="lb-figure text-[22px] font-semibold leading-none" style={{ color: reason ? 'var(--lb-drop)' : undefined }}>
            {days === null ? '—' : days <= 1 ? agoText(days) : `${days} gün`}
          </p>
          <p className="mt-1 text-[12px] text-(--color-text-secondary)">son antrenman</p>
        </div>
      </Link>
    </li>
  );
}

/** The coach's list: who trained, who did not, who is stuck. */
export function Athletes() {
  const coach = useCoach();
  const [filter, setFilter] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const rows = useMemo(() => {
    const today = new Date();
    return coach.athletes.flatMap(athlete => {
      const state = coach.athleteState(athlete.id);
      if (!state) return [];
      const summary = summarizeAthlete(state, today);
      return [{ athlete, summary, reason: needsAttention(summary) }];
    });
  }, [coach]);

  const shown = filter === null ? rows : rows.filter(row => row.athlete.group === filter);
  const attention = shown.filter(row => row.reason).sort(byQuiet);
  const fine = shown.filter(row => !row.reason).sort(byQuiet);
  const groups = coach.groups.filter(name => rows.some(row => row.athlete.group === name));

  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`;

  return (
    <div className="max-w-xl lg:max-w-5xl mx-auto px-5 pt-2 pb-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-(--color-text-secondary)">{rows.length ? `${rows.length} sporcu` : 'Antrenör'}</p>
          <h1 className="a-display text-[clamp(44px,15vw,72px)] tracking-[-0.01em] mt-0.5">Sporcularım</h1>
        </div>
        {rows.length > 0 && (
          <button onClick={() => setInviting(true)} className="shrink-0 mb-1 h-11 px-4 rounded-full bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold">
            Davet et
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="mt-6">
          <p className="text-[17px] leading-snug">
            Sporcularına bir davet linki gönder. Onaylayanların antrenmanlarını burada görürsün: kim antrenman yaptı, kim aksadı, kimin hareketi yerinde sayıyor.
          </p>
          <p className="mt-3 text-[15px] text-(--color-text-secondary)">Kayıtlarını değiştiremezsin; sporcu bağı istediği zaman kaldırabilir.</p>
          <button onClick={() => setInviting(true)} className="mt-6 w-full h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">
            Davet linki oluştur
          </button>
        </section>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="mt-4 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
              <button onClick={() => setFilter(null)} aria-pressed={filter === null} className={chip(filter === null)}>Tümü {rows.length}</button>
              {groups.map(name => (
                <button key={name} onClick={() => setFilter(name)} aria-pressed={filter === name} className={chip(filter === name)}>
                  {name} {rows.filter(row => row.athlete.group === name).length}
                </button>
              ))}
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start">
            {attention.length > 0 && (
              <section className="mt-6">
                <h2 className="text-[15px] font-semibold">İlgilenmen gerekenler</h2>
                <ul className="mt-2 grid gap-2">{attention.map(row => <AthleteRow key={row.athlete.id} row={row} />)}</ul>
              </section>
            )}
            {fine.length > 0 && (
              <section className="mt-6">
                <h2 className="text-[15px] font-semibold">Yolunda gidenler</h2>
                <ul className="mt-2 grid gap-2">{fine.map(row => <AthleteRow key={row.athlete.id} row={row} />)}</ul>
              </section>
            )}
          </div>
          {shown.length === 0 && <p className="mt-6 text-[15px] text-(--color-text-secondary)">Bu grupta sporcu yok.</p>}

          <p className="mt-6 text-[13px] leading-snug text-(--color-text-secondary)">
            Bir hafta antrenman yapmayan ya da hiç kaydı olmayan sporcu en üste çıkar. Yeşil: geçen haftayı geçtiği hareket sayısı.
          </p>
        </>
      )}

      <InviteSheet isOpen={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
