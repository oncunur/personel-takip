function sayfaGoster(sayfa) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (sayfa === 'login') {
    document.getElementById('login-page').classList.add('active');
  } else if (sayfa === 'dashboard') {
    document.getElementById('dashboard-page').classList.add('active');
  }
}

// Giriş formu
document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const kullanici_adi = document.getElementById('kullanici_adi').value.trim();
  const sifre = document.getElementById('sifre').value;

  document.getElementById('hata-mesaji').classList.add('gizli');
  yukleniyorDurumu(true);

  try {
    const veri = await api.giris(kullanici_adi, sifre);
    Auth.kaydet(veri.access_token, veri.kullanici);
    sayfaGoster('dashboard');
    dashboardYukle(veri.kullanici);
  } catch (err) {
    hataMesajiGoster(err.message || 'Giriş sırasında bir hata oluştu');
  } finally {
    yukleniyorDurumu(false);
  }
});

// Sayfa yüklendiğinde oturum kontrolü
window.addEventListener('DOMContentLoaded', () => {
  if (Auth.girisliMi()) {
    sayfaGoster('dashboard');
    dashboardYukle(Auth.getKullanici());
  } else {
    sayfaGoster('login');
  }
});
