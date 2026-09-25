# Otomatik Google Sheets kurulumu

Bu özellik Supabase Edge Function içinde çalışır. Composio veya Modal gerekmez.
Manuel Sheets gönderimi mevcut haliyle çalışmaya devam eder. Otomatik mod,
aynı dosyada faz başına `Oto · Faz adı · başlangıç haftası` sekmesi açar.
Bu sekmelerin içeriği uygulama verisinden yeniden üretilir.

## 1. Google Cloud

Mevcut web OAuth istemcisine ait **client secret** gerekli. Web istemcisinin
izin verilen JavaScript kaynakları arasına canlı uygulama kökenini ekle:
`https://dogulusal.github.io`. Yerel deneme için `http://localhost:5173` ekle.
Sheets API etkin olmalı. OAuth izin ekranında Sheets yazma kapsamı tanımlı
olmalı. Uzun süreli bağlantı için OAuth uygulamasını uygun yayın durumuna al.
Secret'ı bu repoya veya sohbete koyma.

## 2. Supabase

`supabase/migrations/20260925_sheets_auto_sync.sql` dosyasını SQL Editor'de
çalıştır veya migration olarak uygula. Ardından CLI oturumu açıp projeyi
bağlayarak `npx supabase functions deploy sheets-auto-sync --no-verify-jwt`
komutunu çalıştır.

Function Secrets içine şu değerleri koy:

- `GOOGLE_CLIENT_ID`: uygulamanın Sheets ayarındaki web OAuth istemci kimliği
- `GOOGLE_CLIENT_SECRET`: aynı istemcinin gizli anahtarı
- `SHEET_SYNC_ENCRYPTION_KEY`: 32 rastgele baytın Base64 gösterimi
- `SHEET_SYNC_WORKER_SECRET`: uzun, rastgele bir işçi anahtarı
- `APP_ORIGINS`: virgülle ayrılmış izinli kökenler, örneğin
  `https://dogulusal.github.io,http://localhost:5173`

`SUPABASE_URL`, `SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` Supabase
Edge Functions ortamında sağlanır. Secret ve servis anahtarı tarayıcıya gitmez.

Sonra `supabase/sheets-auto-cron.sql` içindeki proje URL'si ve işçi anahtarı
yer tutucularını değiştirip SQL Editor'de **bir kez** çalıştır. Cron her dakika
bekleyen değişiklikleri işler; geçici Google/API hataları tekrar denenir.

Otomatik aktarım arayüzü varsayılan olarak açıktır. Sunucu geçici olarak
kullanılamıyorsa ön yüz derlemesine `VITE_SHEETS_AUTO_SYNC_ENABLED=false`
ekleyerek düğmeyi gizleyebilirsin.

## 3. Doğrulama

1. Bulut hesabına giriş yap; Sheets ayarındaki client ID ile Function secret
   içindeki `GOOGLE_CLIENT_ID` aynı olsun.
2. Dışa / içe aktarma ekranından **Otomatik aktarımı aç** düğmesine bas ve
   Google iznini ver.
3. Bir antrenman kaydet. Kuyruk durumu kaybolup son aktarım saati göründüğünde
   Google dosyasında ilgili `Oto` faz sekmesini kontrol et.
4. Bir notu değiştir ve bir hareketi sil. Sonraki aktarımın yalnızca ilgili
   fazdaki otomatik sekmeye yansıdığını doğrula.

Henüz kaydedilmemiş antrenman taslakları `user_states` içinde olmadığı için
aktarılmaz. Otomatik sekmelerde elle düzenlenen hücreler sonraki aktarımda
uygulama verisiyle yenilenir. Bağlantıyı kapatmak yeni işleri durdurur ve
sunucudaki yenileme belirtecini siler; geçmişte oluşturulan sekmeler kalır.
