import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatSet } from '@/utils/formatters';
import { agoText, needsAttention, type AthleteSummary } from './summary';
import { InviteSheet } from './InviteSheet';
import { Avatar, WeekMarks } from './parts';
import { useCoach, type Athlete } from './store';

type Row = { athlete: Athlete; summary: AthleteSummary; reason: string | null; note: string };

// Longest without training first; someone with no record at all before them.
const byQuiet = (a: Row, b: Row) => (b.summary.daysSinceLast ?? Infinity) - (a.summary.daysSinceLast ?? Infinity);

function greeting(hour: number) {
  if (hour >= 5 && hour < 11) return 'Günaydın';
  if (hour >= 11 && hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

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

type Moment = { athlete: Athlete; text: string; detail: string | null };

/** What is worth a word from the coach this week: a finished week, a new best, a first workout. */
function moments(rows: Row[]): Moment[] {
  return rows.flatMap(({ athlete, summary }) => {
    const parts: string[] = [];
    if (summary.weekTotal > 0 && summary.weekDone === summary.weekTotal) parts.push('Haftayı bitirdi');
    if (summary.bests.length > 1) parts.push(`${summary.bests.length} harekette yeni en iyi`);
    else if (summary.bests.length === 1) parts.push('Yeni en iyi set');
    if (summary.workouts > 0 && summary.workouts <= summary.weekDone && !summary.compared) parts.push('İlk antrenmanını yaptı');
    if (!parts.length) return [];
    const best = summary.bests[0];
    return [{ athlete, text: parts.join(' · '), detail: best ? `${best.name} ${formatSet(best.set)}` : null }];
  }).sort((a, b) => Number(b.text.startsWith('Haftayı')) - Number(a.text.startsWith('Haftayı')));
}

/** The coach's list: who trained, who did not, who is stuck, and what to celebrate. */
export function Athletes() {
  const coach = useCoach();
  const [filter, setFilter] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const rows = useMemo(() => coach.athletes.flatMap(athlete => {
    const summary = coach.summaries[athlete.id];
    return summary ? [{ athlete, summary, reason: needsAttention(summary), note: coach.notes[athlete.id] ?? '' }] : [];
  }), [coach.athletes, coach.summaries, coach.notes]);

  const shown = filter === null ? rows : rows.filter(row => row.athlete.group === filter);
  const attention = shown.filter(row => row.reason).sort(byQuiet);
  const fine = shown.filter(row => !row.reason).sort(byQuiet);
  const groups = coach.groups.filter(name => rows.some(row => row.athlete.group === name));
  const highlights = moments(shown);
  const trained = rows.filter(row => row.summary.weekDone > 0).length;

  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`;

  return (
    <div className="max-w-xl lg:max-w-5xl mx-auto px-5 pt-2 pb-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-(--color-text-secondary)">{greeting(new Date().getHours())}, {coach.coachName}</p>
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
          <p className="mt-2 text-[17px] leading-snug">
            Bu hafta {rows.length} sporcundan {trained} kişi antrenman yaptı.
            {coach.attentionCount > 0 && <> <span style={{ color: 'var(--lb-drop)' }}>{coach.attentionCount} kişi seni bekliyor.</span></>}
          </p>

          {highlights.length > 0 && (
            <section className="mt-6">
              <h2 className="text-[15px] font-semibold">Tebrik etmeye değer</h2>
              <ul className="mt-2 -mx-5 px-5 flex gap-2 overflow-x-auto scrollbar-hide lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3">
                {highlights.map(({ athlete, text, detail }) => (
                  <li key={athlete.id} className="shrink-0 w-[min(15rem,72vw)] lg:w-auto">
                    <Link to={`/sporcular/${athlete.id}`} className="lb-press a-card h-full flex gap-3 px-3.5 py-3">
                      <Avatar name={athlete.name} size={36} />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold truncate">{athlete.name.split(' ')[0]}</p>
                        <p className="text-[13px] leading-snug" style={{ color: 'var(--lb-gain)' }}>{text}</p>
                        {detail && <p className="lb-figure mt-0.5 text-[15px] truncate">{detail}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <div className="mt-6 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
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
              <section className="mt-5">
                <h2 className="text-[15px] font-semibold">Seni bekleyenler</h2>
                <ul className="mt-2 grid gap-2">{attention.map(row => <AthleteRow key={row.athlete.id} row={row} />)}</ul>
              </section>
            )}
            {fine.length > 0 && (
              <section className="mt-5">
                <h2 className="text-[15px] font-semibold">Yolunda gidenler</h2>
                <ul className="mt-2 grid gap-2">{fine.map(row => <AthleteRow key={row.athlete.id} row={row} />)}</ul>
              </section>
            )}
          </div>
          {shown.length === 0 && <p className="mt-6 text-[15px] text-(--color-text-secondary)">Bu grupta sporcu yok.</p>}

          <p className="mt-6 text-[13px] leading-snug text-(--color-text-secondary)">
            Bir hafta antrenman yapmayan ya da hiç kaydı olmayan sporcu en üste çıkar. Çizgiler haftanın antrenman günleri; dolu olan yapıldı. Yeşil: geçen haftayı geçtiği hareket sayısı.
          </p>
        </>
      )}

      <InviteSheet isOpen={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
