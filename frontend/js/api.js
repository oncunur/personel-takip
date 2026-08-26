const API_URL = 'http://localhost:8000';

// Demo mod: backend erişilemediğinde test için
const DEMO_KULLANICILAR = {
  admin:    { sifre: 'Admin1234!', bilgi: { id:1, ad:'Sistem', soyad:'Yöneticisi', email:'admin@sirket.com', kullanici_adi:'admin', rol:'admin', aktif:true } },
  yonetici: { sifre: 'Yonetici1!', bilgi: { id:2, ad:'Ayşe', soyad:'Kaya', email:'ayse@sirket.com', kullanici_adi:'yonetici', rol:'yonetici', aktif:true } },
  personel: { sifre: 'Personel1!', bilgi: { id:3, ad:'Mehmet', soyad:'Demir', email:'mehmet@sirket.com', kullanici_adi:'personel', rol:'personel', aktif:true } },
};

const api = {
  async giris(kullanici_adi, sifre) {
    const form = new URLSearchParams();
    form.append('username', kullanici_adi);
    form.append('password', sifre);
    try {
      const res = await fetch(`${API_URL}/auth/giris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Giriş başarısız');
      }
      return res.json();
    } catch (e) {
      // Backend erişilemiyorsa demo mod devreye girer
      if (e.name === 'TimeoutError' || e.name === 'TypeError' || e.name === 'AbortError') {
        return api._demoGiris(kullanici_adi, sifre);
      }
      throw e;
    }
  },

  _demoGiris(kullanici_adi, sifre) {
    const kayit = DEMO_KULLANICILAR[kullanici_adi];
    if (!kayit || kayit.sifre !== sifre) {
      throw new Error('Kullanıcı adı veya şifre hatalı (Demo Mod)');
    }
    return { access_token: 'demo-token', token_type: 'bearer', kullanici: kayit.bilgi, _demo: true };
  },

  async ben(token) {
    if (token === 'demo-token') return Auth.getKullanici();
    const res = await fetch(`${API_URL}/auth/ben`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Oturum geçersiz');
    return res.json();
  },
};
