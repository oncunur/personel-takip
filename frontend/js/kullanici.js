// ─── Kullanıcı Yönetimi Modülü ────────────────────────────────────
// Sistem kullanıcılarını listeler, oluşturur, rolünü değiştirir ve
// şifre sıfırlar. Yalnızca admin erişebilir; backend de bunu zorlar.
const KullaniciModul = (() => {
  const O = Ortak;
  let kullanicilar = [];
  let yedekler = [];

  const ROL = { admin: 'Admin', yonetici: 'Yönetici', personel: 'Personel' };
  const ROL_RENK = { admin: '#006CE0', yonetici: '#3B82F6', personel: '#00802F' };

  async function veriYukle() {
    kullanicilar = await O.api('/auth/kullanicilar');
    // Yedekleme yalnızca admin'e açık; hata panelin tamamını düşürmesin
    yedekler = await O.api('/yedek').then(d => d.veriler).catch(() => []);
  }

  const boyutMetni = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  const tarihMetni = t => new Date(t).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function render() {
    const ben = Auth.getKullanici();
    const aktifler = kullanicilar.filter(k => k.aktif);
    O.icerik(`
      ${O.statGrid([
        { label: 'Kullanıcı', deger: kullanicilar.length, alt: `${aktifler.length} aktif` },
        { label: 'Admin', deger: aktifler.filter(k => k.rol === 'admin').length, alt: 'tam yetkili', renk: '#006CE0' },
        { label: 'Yönetici', deger: aktifler.filter(k => k.rol === 'yonetici').length, alt: 'personel verisi görebilir', renk: '#3B82F6' },
        { label: 'Personel', deger: aktifler.filter(k => k.rol === 'personel').length, alt: 'kendi verisi', renk: '#00802F' },
      ])}
      <div class="personel-toolbar">
        <div class="arama-grup">
          <span style="font-size:13px;color:var(--gray-500)">${kullanicilar.length} kullanıcı</span>
        </div>
        <div class="toolbar-sagda">
          <button class="btn-yeni" onclick="KullaniciModul.yeniKullanici()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Yeni Kullanıcı</button>
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr>
            <th>Ad Soyad</th><th>Kullanıcı Adı</th><th>E-posta</th>
            <th>Rol</th><th>Durum</th><th>İşlemler</th>
          </tr></thead>
          <tbody>${kullanicilar.length ? kullanicilar.map(k => satir(k, ben)).join('') : O.bosSatir('Kullanıcı bulunamadı', 6)}</tbody>
        </table>
      </div>

      <div class="panel" style="margin-top:var(--sp-m)">
        <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between">
          <span>Veritabanı Yedekleri</span>
          <button class="btn-yeni" onclick="KullaniciModul.yedekAl()" id="yedek-al-btn">Yedek Al</button>
        </div>
        <div style="padding:var(--sp-s) var(--sp-l);font-size:13px;color:var(--text-2)">
          Tüm veri tek bir dosyada tutuluyor. Yedekler sunucuda saklanır ve
          en yeni 30 tanesi korunur. <span id="yedek-durum"></span>
        </div>
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Yedek</th><th>Tarih</th><th>Boyut</th><th>İşlem</th></tr></thead>
          <tbody id="yedek-tbody">${yedekSatirlari()}</tbody>
        </table>
      </div>`);
  }

  function satir(k, ben) {
    const kendisi = ben && k.id === ben.id;
    return `
      <tr${k.aktif ? '' : ' style="opacity:.55"'}>
        <td><strong>${O.kacir(k.ad)} ${O.kacir(k.soyad)}</strong>${kendisi ? '<span class="hucre-alt">bu hesap sizsiniz</span>' : ''}</td>
        <td>${O.kacir(k.kullanici_adi)}</td>
        <td style="color:var(--gray-500)">${O.kacir(k.email)}</td>
        <td>${O.rozet(ROL[k.rol] || k.rol, ROL_RENK[k.rol] || '#656871')}</td>
        <td>${k.aktif ? O.rozet('Aktif', '#00802F') : O.rozet('Pasif', '#8C8C94')}</td>
        <td class="islem-td">
          <button class="btn-mini" onclick="KullaniciModul.duzenle(${k.id})">Düzenle</button>
          <button class="btn-mini" onclick="KullaniciModul.sifreSifirla(${k.id})">Şifre</button>
          ${kendisi || !k.aktif ? '' : `<button class="btn-mini ret" onclick="KullaniciModul.pasifeAl(${k.id})">Pasife Al</button>`}
        </td>
      </tr>`;
  }

  function yedekSatirlari() {
    if (!yedekler.length) return O.bosSatir('Henüz yedek alınmamış', 4);
    return yedekler.map(y => `
      <tr>
        <td><strong>${O.kacir(y.ad)}</strong></td>
        <td>${tarihMetni(y.tarih)}</td>
        <td>${boyutMetni(y.boyut)}</td>
        <td class="islem-td">
          <button class="btn-mini" onclick="KullaniciModul.yedekIndir('${O.kacir(y.ad)}')">İndir</button>
        </td>
      </tr>`).join('');
  }

  return {
    async yukle() { await veriYukle(); render(); },

    async yedekAl() {
      const btn = document.getElementById('yedek-al-btn');
      const durum = document.getElementById('yedek-durum');
      btn.disabled = true;
      durum.textContent = 'Yedek alınıyor…';
      try {
        const s = await O.api('/yedek', { method: 'POST' });
        const kayit = Object.values(s.kayit_sayilari).reduce((a, b) => a + b, 0);
        durum.textContent = `${s.ad} alındı — ${kayit} kayıt, ${boyutMetni(s.boyut)}.`;
        yedekler = await O.api('/yedek').then(d => d.veriler);
        document.getElementById('yedek-tbody').innerHTML = yedekSatirlari();
      } catch (err) {
        durum.textContent = 'Alınamadı: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    },

    yedekIndir(ad) {
      // Dosya indirme fetch ile değil, tarayıcının kendi akışıyla yapılır
      const token = Auth.getToken();
      fetch(`http://localhost:8000/yedek/indir/${encodeURIComponent(ad)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.blob() : Promise.reject(new Error('İndirilemedi')))
        .then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = ad;
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(err => alert(err.message));
    },

    yeniKullanici() {
      const g = O.modalAc('Yeni Kullanıcı', `
        <form id="kul-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ad *</label><input name="ad" required /></div>
            <div class="form-group"><label>Soyad *</label><input name="soyad" required /></div>
            <div class="form-group"><label>E-posta *</label><input type="email" name="email" required placeholder="ad.soyad@sirket.com" /></div>
            <div class="form-group"><label>Kullanıcı Adı *</label>
              <input name="kullanici_adi" required minlength="3" pattern="[a-zA-Z0-9._\\-]+"
                     title="Harf, rakam, nokta, alt çizgi ve tire kullanılabilir" /></div>
            <div class="form-group"><label>Şifre *</label>
              <input type="password" name="sifre" required minlength="8" />
              <span class="hucre-alt">En az 8 karakter, harf ve rakam içermeli</span></div>
            <div class="form-group"><label>Rol</label>
              <select name="rol">${O.enumSecenek(ROL, 'personel')}</select></div>
          </div>
          ${O.formHata()}${O.modalFooter('Oluştur')}
        </form>`);

      g.querySelector('#kul-form').onsubmit = async e => {
        e.preventDefault();
        try {
          await O.api('/auth/kullanicilar', { method: 'POST', body: JSON.stringify(O.formVeri(e.target)) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    duzenle(id) {
      const k = kullanicilar.find(x => x.id === id);
      if (!k) return;
      const g = O.modalAc(`${k.ad} ${k.soyad} — Düzenle`, `
        <form id="kul-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ad *</label><input name="ad" required value="${O.kacir(k.ad)}" /></div>
            <div class="form-group"><label>Soyad *</label><input name="soyad" required value="${O.kacir(k.soyad)}" /></div>
            <div class="form-group"><label>E-posta *</label><input type="email" name="email" required value="${O.kacir(k.email)}" /></div>
            <div class="form-group"><label>Rol</label>
              <select name="rol">${O.enumSecenek(ROL, k.rol)}</select></div>
            <div class="form-group"><label>Durum</label>
              <select name="aktif">
                <option value="true" ${k.aktif ? 'selected' : ''}>Aktif</option>
                <option value="false" ${k.aktif ? '' : 'selected'}>Pasif</option>
              </select></div>
          </div>
          <p class="hucre-alt">Kullanıcı adı değiştirilemez.</p>
          ${O.formHata()}${O.modalFooter()}
        </form>`);

      g.querySelector('#kul-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target);
        veri.aktif = veri.aktif === 'true';
        try {
          await O.api(`/auth/kullanicilar/${id}`, { method: 'PUT', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    sifreSifirla(id) {
      const k = kullanicilar.find(x => x.id === id);
      if (!k) return;
      const g = O.modalAc(`${k.kullanici_adi} — Şifre Sıfırla`, `
        <form id="sif-form" class="modal-form">
          <p class="hucre-alt" style="margin-bottom:12px">
            Yeni şifreyi kullanıcıya kendiniz iletmelisiniz; sistem bildirim göndermez.
          </p>
          <div class="form-group"><label>Yeni Şifre *</label>
            <input type="password" name="yeni_sifre" required minlength="8" />
            <span class="hucre-alt">En az 8 karakter, harf ve rakam içermeli</span></div>
          ${O.formHata()}${O.modalFooter('Sıfırla')}
        </form>`);

      g.querySelector('#sif-form').onsubmit = async e => {
        e.preventDefault();
        try {
          await O.api(`/auth/kullanicilar/${id}/sifre-sifirla`,
                      { method: 'POST', body: JSON.stringify(O.formVeri(e.target)) });
          O.modalKapat();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async pasifeAl(id) {
      const k = kullanicilar.find(x => x.id === id);
      if (!confirm(`"${k ? k.kullanici_adi : 'Kullanıcı'}" pasife alınsın mı? Giriş yapamaz hale gelir.`)) return;
      try {
        await O.api(`/auth/kullanicilar/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },
  };
})();


// ─── Şifre değiştirme — her kullanıcı kendi hesabı için ────────────
function sifreDegistirAc() {
  const O = Ortak;
  const g = O.modalAc('Şifre Değiştir', `
    <form id="sd-form" class="modal-form">
      <div class="form-group"><label>Mevcut Şifre *</label>
        <input type="password" name="mevcut_sifre" required /></div>
      <div class="form-group"><label>Yeni Şifre *</label>
        <input type="password" name="yeni_sifre" required minlength="8" />
        <span class="hucre-alt">En az 8 karakter, harf ve rakam içermeli</span></div>
      ${O.formHata()}${O.modalFooter('Değiştir')}
    </form>`);

  g.querySelector('#sd-form').onsubmit = async e => {
    e.preventDefault();
    try {
      const s = await O.api('/auth/sifre-degistir', { method: 'POST', body: JSON.stringify(O.formVeri(e.target)) });
      O.modalKapat();
      alert(s.mesaj || 'Şifreniz değiştirildi');
    } catch (err) { O.hataGoster(err.message); }
  };
}
