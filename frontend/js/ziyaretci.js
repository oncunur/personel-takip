// ─── Ziyaretçi & Toplantı Odası Modülü ────────────────────────────
const ZiyaretciModul = (() => {
  const O = Ortak;
  let sekme = 'ziyaretciler';
  let ziyaretciler = [], odalar = [], rezervasyonlar = [];
  let arama = '', sadeceIcerde = false, secilenTarih = '';


  async function veriYukle() {
    if (!secilenTarih) secilenTarih = O.bugun();
    const [zd, od, rd] = await Promise.all([
      O.api('/ziyaretci'), O.api('/ziyaretci/odalar'),
      O.api(`/ziyaretci/rezervasyonlar?tarih=${secilenTarih}`),
    ]);
    ziyaretciler = zd.veriler; odalar = od; rezervasyonlar = rd.veriler;
  }

  function gunlukRez() {
    return rezervasyonlar.filter(r => !r.iptal);
  }

  function render() {
    const y = O.yonetici();
    const icerde = ziyaretciler.filter(z => z.icerde).length;
    const bugunkuZiyaret = ziyaretciler.filter(z => (z.giris_zamani || '').slice(0, 10) === O.bugun()).length;
    O.icerik(`
      ${O.statGrid([
        { label: 'Şu An İçeride', deger: icerde, alt: 'çıkış yapmamış ziyaretçi', renk: icerde ? '#FAAD14' : '#52C41A' },
        { label: 'Bugünkü Ziyaret', deger: bugunkuZiyaret, alt: 'toplam giriş' },
        { label: 'Toplantı Odası', deger: odalar.length, alt: odalar.reduce((t, o) => t + (o.kapasite || 0), 0) + ' kişi kapasite', renk: '#722ED1' },
        { label: 'Rezervasyon', deger: gunlukRez().length, alt: O.tarih(secilenTarih), renk: '#1677FF' },
      ])}
      ${O.sekmeler('zyr-tabs', [
        { key: 'ziyaretciler', ad: 'Ziyaretçi Defteri', rozet: ziyaretciler.length },
        { key: 'odalar', ad: 'Toplantı Odaları', rozet: gunlukRez().length },
      ], sekme)}
      <div id="zyr-govde"></div>`);
    document.querySelectorAll('#zyr-tabs .idari-tab').forEach(b => { b.onclick = () => { sekme = b.dataset.tab; render(); }; });
    (sekme === 'ziyaretciler' ? ziyaretciGovde : odaGovde)(y);
  }

  function ziyaretciGovde(y) {
    const liste = ziyaretciler.filter(z =>
      (!arama || `${z.ad_soyad} ${z.firma || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!sadeceIcerde || z.icerde));

    document.getElementById('zyr-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="zyr-arama" placeholder="Ziyaretçi, firma ara..." value="${O.kacir(arama)}" />
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--gray-600);cursor:pointer">
            <input type="checkbox" id="zyr-icerde" ${sadeceIcerde ? 'checked' : ''} /> Sadece içeridekiler</label>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} kayıt</span>
          <button class="btn-yeni" onclick="ZiyaretciModul.yeniZiyaretci()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Ziyaretçi Girişi</button>
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Ziyaretçi</th><th>Firma</th><th>Ziyaret Edilen</th><th>Amaç</th><th>Giriş</th><th>Çıkış</th><th>Kart</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(z => `
            <tr ${z.icerde ? 'style="background:#FFFBE6"' : ''}>
              <td><strong>${O.kacir(z.ad_soyad)}</strong><span class="hucre-alt">${O.kacir(z.telefon || '')}</span></td>
              <td>${O.kacir(z.firma || '—')}</td>
              <td>${O.kacir(z.ziyaret_edilen || '—')}</td>
              <td style="color:var(--gray-500)">${O.kacir(z.amac || '—')}</td>
              <td>${O.saatli(z.giris_zamani)}</td>
              <td>${z.cikis_zamani ? O.saatli(z.cikis_zamani) : O.rozet('İçeride', '#FAAD14')}</td>
              <td>${O.kacir(z.kart_no || '—')}</td>
              <td class="islem-td">
                ${z.icerde ? `<button class="btn-mini onay" onclick="ZiyaretciModul.cikis(${z.id})">Çıkış Ver</button>` : ''}
                ${y ? `<button class="btn-ikon btn-sil" title="Sil" onclick="ZiyaretciModul.sil(${z.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Ziyaretçi kaydı yok', 8)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('zyr-arama').oninput = e => { arama = e.target.value; ziyaretciGovde(y); };
    document.getElementById('zyr-icerde').onchange = e => { sadeceIcerde = e.target.checked; ziyaretciGovde(y); };
  }

  function odaGovde(y) {
    const gunun = gunlukRez();
    document.getElementById('zyr-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <label style="font-size:13px;color:var(--gray-600)">Tarih</label>
          <input type="date" id="zyr-tarih" class="filtre-select" value="${secilenTarih}" />
          <span style="font-size:13px;color:var(--gray-500)">${gunun.length} rezervasyon</span>
        </div>
        <div class="toolbar-sagda">
          ${y ? `<button class="btn-mini" onclick="ZiyaretciModul.yeniOda()">Oda Ekle</button>` : ''}
          <button class="btn-yeni" onclick="ZiyaretciModul.yeniRezervasyon()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Rezervasyon Yap</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">${O.tarih(secilenTarih)} — Oda Doluluk</div>
        ${odalar.length ? odalar.map(o => {
          const rez = gunun.filter(r => r.oda_id === o.id).sort((a, b) => a.baslangic_saat.localeCompare(b.baslangic_saat));
          return `<div class="oda-satir">
            <div class="oda-baslik">
              <strong>${O.kacir(o.ad)}</strong>
              <span style="font-size:12px;color:var(--gray-500)">${O.kacir(o.konum || '')} · ${o.kapasite} kişi${o.ekipman ? ' · ' + O.kacir(o.ekipman) : ''}</span>
              ${y ? `<button class="btn-ikon btn-sil" style="margin-left:auto" title="Odayı kaldır" onclick="ZiyaretciModul.odaSil(${o.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}
            </div>
            <div class="oda-serit">
              ${rez.length ? rez.map(r => `<div class="rez-blok">
                <span class="rez-saat">${O.kacir(r.baslangic_saat)} – ${O.kacir(r.bitis_saat)}</span>
                <span class="rez-ad">${O.kacir(r.baslik)}</span>
                <span class="rez-ad" style="display:block;font-size:11px;color:var(--gray-400)">${O.kacir(r.olusturan || '')} · ${r.katilimci_sayisi} kişi
                  <button class="btn-kalem-sil" title="İptal" onclick="ZiyaretciModul.rezIptal(${r.id})">&times;</button></span>
              </div>`).join('') : '<span class="oda-bos">Bu tarihte rezervasyon yok</span>'}
            </div>
          </div>`;
        }).join('') : `<div style="padding:40px;text-align:center;color:var(--gray-400)">Kayıtlı toplantı odası yok</div>`}
      </div>`;

    document.getElementById('zyr-tarih').onchange = async e => {
      secilenTarih = e.target.value;
      const r = await O.api(`/ziyaretci/rezervasyonlar?tarih=${secilenTarih}`);
      rezervasyonlar = r.veriler;
      render();
    };
  }

  return {
    async yukle() { arama = ''; sadeceIcerde = false; secilenTarih = O.bugun(); await veriYukle(); render(); },

    async yeniZiyaretci() {
      const pers = await O.personeller();
      const g = O.modalAc('Ziyaretçi Girişi', `
        <form id="zyr-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ad Soyad *</label><input name="ad_soyad" required /></div>
            <div class="form-group"><label>Firma</label><input name="firma" /></div>
            <div class="form-group"><label>Telefon</label><input name="telefon" /></div>
            <div class="form-group"><label>Ziyaret Edilen</label><select name="ziyaret_edilen_id">
              <option value="">Seçiniz</option>${O.secenekler(pers, '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Kart No</label><input name="kart_no" placeholder="Z-01" /></div>
            <div class="form-group"><label>Ziyaret Amacı</label><input name="amac" placeholder="Teklif görüşmesi" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2"></textarea></div>
          ${O.formHata()}${O.modalFooter('Girişi Kaydet')}
        </form>`);

      g.querySelector('#zyr-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['ziyaret_edilen_id']);
        try {
          const s = await O.api('/ziyaretci', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async cikis(id) {
      try {
        const s = await O.api(`/ziyaretci/${id}/cikis`, { method: 'POST' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async sil(id) {
      if (!confirm('Ziyaretçi kaydı silinsin mi?')) return;
      try {
        const s = await O.api(`/ziyaretci/${id}`, { method: 'DELETE' });
        if (!s) ziyaretciler = ziyaretciler.filter(x => x.id !== id); else await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    yeniOda() {
      const g = O.modalAc('Toplantı Odası Ekle', `
        <form id="zyr-oda-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Oda Adı *</label><input name="ad" required placeholder="Toplantı Odası 1" /></div>
            <div class="form-group"><label>Konum</label><input name="konum" placeholder="2. Kat" /></div>
            <div class="form-group"><label>Kapasite</label><input type="number" name="kapasite" value="8" /></div>
            <div class="form-group"><label>Ekipman</label><input name="ekipman" placeholder="Projeksiyon, TV" /></div>
          </div>
          ${O.formHata()}${O.modalFooter()}
        </form>`);
      g.querySelector('#zyr-oda-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['kapasite']);
        try {
          const s = await O.api('/ziyaretci/odalar', { method: 'POST', body: JSON.stringify(veri) });
          if (!s) odalar.push({ id: Date.now(), aktif: true, bugunku_rezervasyon: 0, ...veri }); else await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async odaSil(id) {
      if (!confirm('Oda listeden kaldırılsın mı?')) return;
      try {
        const s = await O.api(`/ziyaretci/odalar/${id}`, { method: 'DELETE' });
        if (!s) odalar = odalar.filter(x => x.id !== id); else await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async yeniRezervasyon() {
      const pers = await O.personeller();
      const g = O.modalAc('Toplantı Odası Rezervasyonu', `
        <form id="zyr-rez-form" class="modal-form">
          <div class="form-group"><label>Toplantı Başlığı *</label><input name="baslik" required placeholder="Haftalık değerlendirme" /></div>
          <div class="form-grid-2">
            <div class="form-group"><label>Oda *</label><select name="oda_id" required>
              <option value="">Seçiniz</option>
              ${odalar.map(o => `<option value="${o.id}">${O.kacir(o.ad)} (${o.kapasite} kişi)</option>`).join('')}</select></div>
            <div class="form-group"><label>Tarih *</label><input type="date" name="tarih" required value="${secilenTarih}" /></div>
            <div class="form-group"><label>Başlangıç *</label><input type="time" name="baslangic_saat" required value="09:00" /></div>
            <div class="form-group"><label>Bitiş *</label><input type="time" name="bitis_saat" required value="10:00" /></div>
            <div class="form-group"><label>Düzenleyen</label><select name="olusturan_id">
              <option value="">Seçiniz</option>${O.secenekler(pers, '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Katılımcı Sayısı</label><input type="number" name="katilimci_sayisi" value="0" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2"></textarea></div>
          ${odalar.length ? '' : '<div class="hata-mesaji" style="margin-top:0">Önce toplantı odası eklemelisiniz.</div>'}
          ${O.formHata()}${O.modalFooter('Rezerve Et')}
        </form>`);

      g.querySelector('#zyr-rez-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['oda_id', 'olusturan_id', 'katilimci_sayisi']);
        try {
          const s = await O.api('/ziyaretci/rezervasyonlar', { method: 'POST', body: JSON.stringify(veri) });
          if (!s) {
            const oda = odalar.find(o => o.id === veri.oda_id);
            // Backend yokken çakışma ve kapasite kontrolünü burada yap
            if (oda.kapasite && veri.katilimci_sayisi > oda.kapasite) return O.hataGoster(`Oda kapasitesi ${oda.kapasite} kişi`);
            if (veri.bitis_saat <= veri.baslangic_saat) return O.hataGoster('Bitiş saati başlangıçtan sonra olmalı');
            const cakisan = rezervasyonlar.find(r => !r.iptal && r.oda_id === veri.oda_id && r.tarih === veri.tarih &&
              veri.baslangic_saat < r.bitis_saat && r.baslangic_saat < veri.bitis_saat);
            if (cakisan) return O.hataGoster(`Çakışma: '${cakisan.baslik}' (${cakisan.baslangic_saat}-${cakisan.bitis_saat})`);
            const p = pers.find(x => x.id === veri.olusturan_id);
            rezervasyonlar.push({ id: Date.now(), oda_ad: oda.ad, olusturan: p ? p.adSoyad : null, iptal: false, ...veri });
          } else {
            secilenTarih = veri.tarih;
            await veriYukle();
          }
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async rezIptal(id) {
      if (!confirm('Rezervasyon iptal edilsin mi?')) return;
      try {
        const s = await O.api(`/ziyaretci/rezervasyonlar/${id}`, { method: 'DELETE' });
        if (!s) rezervasyonlar = rezervasyonlar.filter(x => x.id !== id); else await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },
  };
})();
