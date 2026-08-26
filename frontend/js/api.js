const API_URL = 'http://localhost:8000';

const api = {
  async giris(kullanici_adi, sifre) {
    const form = new URLSearchParams();
    form.append('username', kullanici_adi);
    form.append('password', sifre);

    let res;
    try {
      res = await fetch(`${API_URL}/auth/giris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Giriş başarısız');
    }
    return res.json();
  },

  async ben(token) {
    const res = await fetch(`${API_URL}/auth/ben`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Oturum geçersiz');
    return res.json();
  },
};
