import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agoText, needsAttention, standingOf, type AthleteSummary, type Standing } from './summary';
import { InviteSheet } from './InviteSheet';
import { Avatar, WeekMarks } from './parts';
import { useCoach, type Athlete } from './store';

type Row = { athlete: Athlete; summary: AthleteSummary; reason: string | null; note: string };

// Longest without training first; someone with no record at all before them.
const byQuiet = (a: Row, b: Row) => (b.summary.daysSinceLast ?? Infinity) - (a.summary.daysSinceLast ?? Infinity);

function AthleteRow({ row }: { row: Row }) {
  const { athlete, summary, reason, note } = row;
  return (
    <li>
      <Link to={`/sporcular/${athlete.id}`} className="lb-press a-card flex gap-3 px-3.5 py-3">
        <Avatar name={athlete.name} alert={Boolean(reason)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[17px] font-semibold truncate">{athlete.name}</p>
            {summary.daysSinceLast !== null && (
              <p className="shrink-0 text-[14px] font-medium" style={{ color: reason ? 'var(--lb-drop)' : 'var(--color-text-secondary)' }}>
                {agoText(summary.daysSinceLast)}
              </p>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[13px] text-(--color-text-secondary)">
            {summary.weekTotal > 0 ? (
              <><WeekMarks days={summary.days} /><span className="truncate">{summary.weekDone}/{summary.weekTotal}{athlete.group ? ` · ${athlete.group}` : ''}</span></>
            ) : <span className="truncate">Program kurulmadı{athlete.group ? ` · ${athlete.group}` : ''}</span>}
          </div>
          {reason ? (
            <p className="mt-1 text-[13px]" style={{ color: 'var(--lb-drop)' }}>{reason}</p>
          ) : (
            <p className="mt-1 text-[13px] text-(--color-text-secondary)">
              {summary.compared
                ? <><span className="font-semibold" style={{ color: summary.improved ? 'var(--lb-gain)' : 'var(--color-text-primary)' }}>{summary.improved}/{summary.compared}</span> hareket geçen haftayı geçti</>
                : 'Bu hafta ilk kayıtlar'}
              {summary.stalled > 0 && ` · ${summary.stalled} yerinde sayıyor`}
            </p>
          )}
          {note && <p className="mt-1.5 text-[13px] leading-snug text-(--color-text-secondary) line-clamp-1">Notun: {note}</p>}
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

  const rows = useMemo(() => coach.athletes.flatMap(athlete => {
    const summary = coach.summaries[athlete.id];
    return summary ? [{ athlete, summary, reason: needsAttention(summary), note: coach.notes[athlete.id] ?? '' }] : [];
  }), [coach.athletes, coach.summaries, coach.notes]);

  const shown = filter === null ? rows : rows.filter(row => row.athlete.group === filter);
  const inStanding = (rowsToSplit: Row[], standing: Standing) =>
    rowsToSplit.filter(row => standingOf(row.summary) === standing).sort(byQuiet);
  const sections: [Standing, string][] = [['not-started', 'Henüz başlamayanlar'], ['on-break', 'Ara verenler'], ['training', 'Devam edenler']];
  const onBreak = inStanding(rows, 'on-break').length;
  const notStarted = inStanding(rows, 'not-started').length;
  const groups = coach.groups.filter(name => rows.some(row => row.athlete.group === name));
  const trained = rows.filter(row => row.summary.weekDone > 0).length;

  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`;

  return (
    <div className="max-w-xl lg:max-w-5xl mx-auto px-5 pt-2 pb-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="min-w-0 a-display text-[clamp(44px,15vw,72px)] tracking-[-0.01em]">Antrenör</h1>
        {rows.length > 0 && (
          <button onClick={() => setInviting(true)} className="shrink-0 mb-1 h-11 px-4 rounded-full bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold">
            Davet et
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="mt-6">
          <p className="text-[17px] leading-snug">
            Ekibine katılmasını istediğin kişilere bir davet linki gönder. Onaylayanların antrenmanlarını burada görürsün: kim antrenman yaptı, kim aksadı, kimin hareketi yerinde sayıyor.
          </p>
          <p className="mt-3 text-[15px] text-(--color-text-secondary)">Kayıtlarını değiştiremezsin; sporcu bağı istediği zaman kaldırabilir.</p>
          <button onClick={() => setInviting(true)} className="mt-6 w-full h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">
            Davet linki oluştur
          </button>
        </section>
      ) : (
        <>
          <p className="mt-2 text-[17px] leading-snug">
            Bu hafta {rows.length} kişilik ekibinden {trained} kişi antrenman yaptı.
            {(onBreak > 0 || notStarted > 0) && (
              <> <span style={{ color: 'var(--lb-drop)' }}>
                {[onBreak && `${onBreak} kişi ara verdi`, notStarted && `${notStarted} kişi henüz başlamadı`].filter(Boolean).join(', ')}.
              </span></>
            )}
          </p>

          <Link to="/sporcular/kutuphane" className="mt-4 inline-flex items-center h-11 px-4 rounded-full bg-(--color-bg-card) text-[15px] font-medium">
            Program kütüphanesi · {coach.library.length}
          </Link>

          {groups.length > 0 && (
            <div className="mt-5 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
              <button onClick={() => setFilter(null)} aria-pressed={filter === null} className={chip(filter === null)}>Tümü {rows.length}</button>
              {groups.map(name => (
                <button key={name} onClick={() => setFilter(name)} aria-pressed={filter === name} className={chip(filter === name)}>
                  {name} {rows.filter(row => row.athlete.group === name).length}
                </button>
              ))}
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start">
            {sections.map(([standing, title]) => {
              const list = inStanding(shown, standing);
              return list.length > 0 && (
                <section key={standing} className="mt-5">
                  <h2 className="text-[15px] font-semibold">{title} <span className="font-normal text-(--color-text-secondary)">{list.length}</span></h2>
                  <ul className="mt-2 grid gap-2">{list.map(row => <AthleteRow key={row.athlete.id} row={row} />)}</ul>
                </section>
              );
            })}
          </div>
          {shown.length === 0 && <p className="mt-6 text-[15px] text-(--color-text-secondary)">Bu grupta sporcu yok.</p>}

          <p className="mt-6 text-[13px] leading-snug text-(--color-text-secondary)">
            Bir hafta antrenman yapmayan ara verenlere geçer. Çizgiler haftanın antrenman günleri; dolu olan yapıldı. Yeşil: geçen haftayı geçtiği hareket sayısı.
          </p>
        </>
      )}

      <InviteSheet isOpen={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
