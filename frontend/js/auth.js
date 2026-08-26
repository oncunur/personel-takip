const Auth = {
  getToken() { return localStorage.getItem('token'); },
  getKullanici() {
    try { return JSON.parse(localStorage.getItem('kullanici')); } catch { return null; }
  },
  kaydet(token, kullanici) {
    localStorage.setItem('token', token);
    localStorage.setItem('kullanici', JSON.stringify(kullanici));
  },
  temizle() {
    localStorage.removeItem('token');
    localStorage.removeItem('kullanici');
  },
  girisliMi() { return !!this.getToken() && !!this.getKullanici(); },
};

function sifreGoster() {
  const inp = document.getElementById('sifre');
  const ikon = document.getElementById('eye-icon');
  if (inp.type === 'password') {
    inp.type = 'text';
    ikon.innerHTML = '<path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>';
  } else {
    inp.type = 'password';
    ikon.innerHTML = '<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>';
  }
}

function hataMesajiGoster(mesaj) {
  const el = document.getElementById('hata-mesaji');
  el.innerHTML = `<svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg> ${mesaj}`;
  el.classList.remove('gizli');
}

function yukleniyorDurumu(aktif) {
  const btn = document.getElementById('giris-btn');
  const text = document.getElementById('btn-text');
  const yukleniyor = document.getElementById('btn-yukleniyor');
  btn.disabled = aktif;
  text.classList.toggle('gizli', aktif);
  yukleniyor.classList.toggle('gizli', !aktif);
}

async function cikisYap() {
  Auth.temizle();
  sayfaGoster('login');
}
