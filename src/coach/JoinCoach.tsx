import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/shared/Icon';
import { useCoach } from './store';

const SEES = [
  'Programların ve antrenman günlerin',
  'Her setin kilosu, tekrarı ve kaç tekrar daha yapabildiğin',
  'Antrenman ve hareket notların',
  'Haftalık özetin: kaç gün gittin, nerede ilerledin',
];
const CAN_DO = [
  'Programını düzenlemek: her değişikliği Bugün\'de görürsün, geçmiş haftaların kayıtları değişmez',
  'Antrenmanlarına yorum yazmak: o hareketi yaparken görürsün',
];
const DOES_NOT_SEE = ['E-posta adresin ve hesap bilgilerin', 'Google Sheet dosyan'];

/**
 * What an athlete sees on opening a coach's invite link: who is asking,
 * exactly what they will see, and that it can be undone. Nothing is shared
 * before "Kabul et".
 */
export function JoinCoach() {
  const { code = '' } = useParams();
  const coach = useCoach();
  const navigate = useNavigate();
  const invite = coach.inviteFor(code);
  const already = invite && coach.coaches.some(item => item.name === invite.coach);

  const shell = 'max-w-xl mx-auto min-h-[calc(100dvh-var(--demo-bar,0px))] flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+20px)]';

  if (!invite || already) {
    return (
      <div className={shell}>
        <p className="text-[15px] text-(--color-text-secondary)">Antrenör daveti</p>
        <h1 className="a-display text-[44px] mt-1 leading-[0.95]">{already ? 'Zaten bağlısın' : 'Link geçersiz'}</h1>
        <p className="mt-3 text-[17px] leading-snug">
          {already
            ? `${invite!.coach} antrenmanlarını zaten görebiliyor.`
            : 'Bu davet linkinin süresi dolmuş ya da antrenörün linki yenilemiş. Antrenöründen yeni bir link iste.'}
        </p>
        <Link to={already ? '/antrenorum' : '/'} className="mt-auto h-14 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[18px] font-semibold flex items-center justify-center">
          {already ? 'Antrenörüm' : 'Uygulamaya dön'}
        </Link>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="text-[15px] text-(--color-text-secondary)">Antrenör daveti{invite.group ? ` · ${invite.group}` : ''}</p>
      <h1 className="a-display text-[clamp(44px,14vw,64px)] mt-1 leading-[0.95]">{invite.coach}</h1>
      <p className="mt-2 text-[18px] leading-snug">antrenmanlarını takip etmek istiyor.</p>

      <section className="mt-7">
        <h2 className="text-[15px] font-semibold">Kabul edersen görebilir</h2>
        <ul className="mt-2 grid gap-2.5">
          {SEES.map(item => (
            <li key={item} className="flex gap-3 text-[16px] leading-snug">
              <Icon name="check" className="mt-0.5 w-5 h-5 shrink-0" />{item}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-[15px] font-semibold">Yapabilir</h2>
        <ul className="mt-2 grid gap-2.5">
          {CAN_DO.map(item => (
            <li key={item} className="flex gap-3 text-[16px] leading-snug">
              <Icon name="check" className="mt-0.5 w-5 h-5 shrink-0" />{item}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-[15px] font-semibold">Göremez</h2>
        <ul className="mt-2 grid gap-2.5">
          {DOES_NOT_SEE.map(item => (
            <li key={item} className="flex gap-3 text-[16px] leading-snug text-(--color-text-secondary)">
              <Icon name="minus" className="mt-0.5 w-5 h-5 shrink-0" />{item}
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-6 text-[15px] leading-snug text-(--color-text-secondary)">
        Antrenman kayıtlarını değiştiremez. Bağı istediğin zaman Ayarlar → Antrenörüm'den kaldırırsın.
      </p>

      <div className="mt-auto pt-6 grid gap-1">
        <button onClick={() => { coach.acceptInvite(code); navigate('/antrenorum', { replace: true, state: { joined: invite.coach } }); }}
          className="h-14 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[18px] font-semibold">
          Kabul et
        </button>
        <button onClick={() => navigate('/', { replace: true })} className="h-12 text-[16px] text-(--color-text-secondary)">Şimdi değil</button>
      </div>
    </div>
  );
}
