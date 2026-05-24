# Supabase Kurulum (Ucretsiz)

## 1) Supabase projesi olustur
- https://supabase.com adresinden yeni proje ac.
- Free plan yeterli.

## 2) SQL tablo ve RLS kur
- Supabase Dashboard > SQL Editor > New query.
- `supabase/schema.sql` dosyasindaki SQL'i calistir.

## 3) Auth ayari
- Authentication > Providers > Email acik olsun.
- Authentication > Providers > Google acik olsun.
- Google acarken Google Cloud Console uzerinden OAuth Client olusturup Client ID/Secret gir.
- URL Configuration:
  - Site URL: `http://localhost:5173`
  - Additional Redirect URLs:
    - `http://localhost:5173`
    - `https://dogulusal.github.io/Tracking-My-Volume/`

## 4) Env degerleri
- Project Settings > API kismina git.
- URL ve anon key degerlerini al.
- Kopyalayip `.env` dosyasina yaz:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 5) Lokal test
```bash
npm run dev
```
- Uygulamada `Bulut Giris` butonuna bas.
- `Google ile giris yap` ile tek tikla giris yap.
- Istersen e-posta magic link secenegi yedek olarak durur.
- Giris sonrasi state buluta yazilir ve cihazlar arasi senkron calisir.

## 6) GitHub Pages'de calisma
- Ayni e-posta ile mobilde ve bilgisayarda giris yap.
- Veri otomatik olarak `user_states` tablosunda saklanir.

## Not
- Supabase yoksa uygulama localStorage fallback ile calismaya devam eder.
- Supabase bagliysa yerel kayit + bulut senkron birlikte calisir.
