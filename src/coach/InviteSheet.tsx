import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { INVITE_DAYS, inviteUrl, useCoach } from './store';

/** The link a coach sends; whoever opens it and agrees joins the list. */
export function InviteSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const coach = useCoach();
  const navigate = useNavigate();
  const [group, setGroup] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const code = coach.invites[group ?? ''];
  const url = code ? inviteUrl(code) : '';
  const message = `Antrenmanlarını Tracking My Volume'den takip edeceğim. Linki aç ve onayla: ${url}`;

  const copy = () => {
    // Called inside the tap; if the browser refuses, the link is selectable text.
    navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
  };
  const pick = (next: string | null) => { setGroup(next); setCopied(false); };
  const addGroup = () => {
    const name = newGroup?.trim();
    if (!name) return;
    coach.addGroup(name);
    pick(name);
    setNewGroup(null);
  };

  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-input)'}`;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Ekibine davet et">
      <p className="text-[15px] leading-snug text-(--color-text-secondary)">
        Linki açan kişi onay verirse antrenmanlarını görürsün. Kayıtlarını değiştiremezsin; bağı o da sen de istediğin zaman koparabilirsiniz.
      </p>

      <p className="mt-5 text-[13px] text-(--color-text-secondary)">Bu linkle katılanlar</p>
      <div className="mt-1.5 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
        <button onClick={() => pick(null)} aria-pressed={group === null} className={chip(group === null)}>Grupsuz</button>
        {coach.groups.map(name => (
          <button key={name} onClick={() => pick(name)} aria-pressed={group === name} className={chip(group === name)}>{name}</button>
        ))}
        {newGroup === null && <button onClick={() => setNewGroup('')} className={chip(false)}>+ Yeni grup</button>}
      </div>
      {newGroup !== null && (
        <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); addGroup(); }}>
          <input id="invite-new-group" autoFocus value={newGroup} onChange={event => setNewGroup(event.target.value)} placeholder="Grubun adı, ör. Akşam grubu"
            className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-(--color-bg-input) text-[16px] outline-none" />
          <button type="submit" className="h-11 px-4 rounded-xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold">Ekle</button>
        </form>
      )}

      <div className="mt-4 rounded-2xl bg-(--color-bg-input) px-4 py-3">
        <p className="lb-figure text-[16px] break-all select-all">{url}</p>
        <p className="mt-1 text-[12px] text-(--color-text-secondary)">{INVITE_DAYS} gün geçerli · birden fazla kişi katılabilir</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={copy} className="h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">
          {copied ? 'Kopyalandı' : 'Linki kopyala'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
          className="h-12 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium flex items-center justify-center">WhatsApp'ta gönder</a>
      </div>
      <button onClick={() => { coach.renewInvite(group); setCopied(false); }} className="mt-1 h-11 text-[14px] text-(--color-text-secondary) underline">
        Linki yenile (eski link çalışmaz)
      </button>

      <div className="mt-4 pt-4 border-t border-(--color-border)">
        <p className="text-[13px] text-(--color-text-secondary)">Demo: sporcunun bu linki açınca ne gördüğüne bak.</p>
        <button onClick={() => { onClose(); navigate(`/katil/${code}`); }}
          className="mt-2 w-full h-12 rounded-2xl border border-(--color-border) text-[16px] font-medium">Linki sporcu gibi aç</button>
      </div>
    </BottomSheet>
  );
}
