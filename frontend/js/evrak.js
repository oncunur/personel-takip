// ─── Evrak & Sözleşme Takibi Modülü ───────────────────────────────
const EvrakModul = (() => {
  const O = Ortak;
  let sekme = 'evraklar';
  let evraklar = [], sozlesmeler = [], ozet = null;
  let arama = '', filtreYon = '', filtreKategori = '', sozArama = '', filtreSozTur = '';

  const YON = { gelen: 'Gelen', giden: 'Giden' };
  const SOZ_TUR = { kira: 'Kira', hizmet: 'Hizmet', tedarik: 'Tedarik', taseron: 'Taşeron', sigorta: 'Sigorta', diger: 'Diğer' };
  const SOZ_DURUM = { aktif: 'Aktif', suresi_doldu: 'Süresi Doldu', feshedildi: 'Feshedildi' };
  const SOZ_RENK = { aktif: '#00802F', suresi_doldu: '#8C8C94', feshedildi: '#DB0000' };


  async function veriYukle() {
    const [ed, sd, od] = await Promise.all([O.api('/evrak'), O.api('/evrak/sozlesmeler'), O.api('/evrak/ozet')]);
    evraklar = ed.veriler; sozlesmeler = sd.veriler; ozet = od;
  }

  function render() {
    const y = O.yonetici();
    const uyarilar = ozet.sozlesme_uyarilari || [];
    O.icerik(`
      ${O.statGrid([
        { label: 'Gelen Evrak', deger: ozet.gelen, alt: 'bu yıl' },
        { label: 'Giden Evrak', deger: ozet.giden, alt: 'bu yıl', renk: '#006CE0' },
        { label: 'Aktif Sözleşme', deger: ozet.aktif_sozlesme, alt: O.tl(ozet.sozlesme_bedel_toplam) + ' toplam bedel', renk: '#00802F' },
      ])}

      ${uyarilar.length ? `<div class="panel uyari-panel">
        <div class="panel-header">Süresi Yaklaşan Sözleşmeler</div>
        ${uyarilar.map(u => `<div class="uyari-satir">
          <span class="uyari-ad">${O.kacir(u.baslik)}</span>
          <span style="color:var(--gray-500)">${O.kacir(u.karsi_taraf || '')}</span>
          <span class="uyari-alt">${O.tarih(u.bitis)} · ${O.kalanRozet(u.kalan_gun)}</span>
        </div>`).join('')}
      </div>` : ''}

      ${O.sekmeler('evr-tabs', [
        { key: 'evraklar', ad: 'Evrak Defteri', rozet: evraklar.length },
        { key: 'sozlesmeler', ad: 'Sözleşmeler', rozet: sozlesmeler.length },
      ], sekme)}
      <div id="evr-govde"></div>`);
    document.querySelectorAll('#evr-tabs .idari-tab').forEach(b => { b.onclick = () => { sekme = b.dataset.tab; render(); }; });
    (sekme === 'evraklar' ? evrakGovde : sozlesmeGovde)(y);
  }

  function evrakGovde(y) {
    const kategoriler = [...new Set(evraklar.map(e => e.kategori).filter(Boolean))];
    const liste = evraklar.filter(e =>
      (!arama || `${e.konu} ${e.evrak_no} ${e.gonderen || ''} ${e.alici || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreYon || e.yon === filtreYon) && (!filtreKategori || e.kategori === filtreKategori));

    document.getElementById('evr-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="evr-arama" placeholder="Konu, evrak no, kurum ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="evr-yon" class="filtre-select"><option value="">Gelen + Giden</option>${O.enumSecenek(YON, filtreYon)}</select>
          <select id="evr-kat" class="filtre-select"><option value="">Tüm Kategoriler</option>
            ${kategoriler.map(k => `<option value="${O.kacir(k)}" ${filtreKategori === k ? 'selected' : ''}>${O.kacir(k)}</option>`).join('')}</select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} evrak</span>
          ${y ? `<button class="btn-yeni" onclick="EvrakModul.yeniEvrak()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Evrak Kaydet</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Evrak No</th><th>Yön</th><th>Tarih</th><th>Konu</th><th>Kurum / Kişi</th><th class="opsiyonel">Kategori</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(e => `
            <tr>
              <td><strong style="font-variant-numeric:tabular-nums">${O.kacir(e.evrak_no)}</strong></td>
              <td>${O.rozet(YON[e.yon], e.yon === 'gelen' ? '#006CE0' : '#006CE0')}</td>
              <td>${O.tarih(e.tarih)}</td>
              <td><strong>${O.kacir(e.konu)}</strong>${e.ilgili_personel ? `<span class="hucre-alt">İlgili: ${O.kacir(e.ilgili_personel)}</span>` : ''}</td>
              <td>${O.kacir(e.yon === 'gelen' ? (e.gonderen || '—') : (e.alici || '—'))}</td>
              <td><span class="departman-chip">${O.kacir(e.kategori || '—')}</span></td>
              <td class="islem-td">${y ? `
                <button class="btn-ikon" title="Düzenle" onclick="EvrakModul.yeniEvrak(${e.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>
                <button class="btn-ikon btn-sil" title="Sil" onclick="EvrakModul.evrakSil(${e.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Evrak kaydı yok', 7)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('evr-arama').oninput = e => { arama = e.target.value; evrakGovde(y); };
    document.getElementById('evr-yon').onchange = e => { filtreYon = e.target.value; evrakGovde(y); };
    document.getElementById('evr-kat').onchange = e => { filtreKategori = e.target.value; evrakGovde(y); };
  }

  function sozlesmeGovde(y) {
    const liste = sozlesmeler.filter(s =>
      (!sozArama || `${s.baslik} ${s.karsi_taraf || ''}`.toLowerCase().includes(sozArama.toLowerCase())) &&
      (!filtreSozTur || s.tur === filtreSozTur));
    const toplam = liste.reduce((t, s) => t + Number(s.bedel || 0), 0);

    document.getElementById('evr-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="soz-arama" placeholder="Sözleşme, karşı taraf ara..." value="${O.kacir(sozArama)}" />
          </div>
          <select id="soz-tur" class="filtre-select"><option value="">Tüm Türler</option>${O.enumSecenek(SOZ_TUR, filtreSozTur)}</select>
          <span style="font-size:13px;color:var(--gray-500)">Toplam <strong style="color:var(--gray-800)">${O.tl(toplam)}</strong></span>
        </div>
        <div class="toolbar-sagda">${y ? `<button class="btn-yeni" onclick="EvrakModul.yeniSozlesme()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Sözleşme Ekle</button>` : ''}</div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Sözleşme</th><th>Tür</th><th>Dönem</th><th>Kalan</th><th>Bedel</th><th class="opsiyonel">Sorumlu</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(s => `
            <tr ${s.uyari && s.durum === 'aktif' ? 'style="background:#FFFEF0"' : ''}>
              <td><strong>${O.kacir(s.baslik)}</strong><span class="hucre-alt">${O.kacir(s.karsi_taraf || '')}</span></td>
              <td><span class="departman-chip">${SOZ_TUR[s.tur] || s.tur}</span></td>
              <td>${O.tarih(s.baslangic_tarihi)}<span class="hucre-alt">→ ${O.tarih(s.bitis_tarihi)}</span></td>
              <td>${s.bitis_tarihi ? O.kalanRozet(s.kalan_gun) : '<span style="color:var(--gray-400)">süresiz</span>'}</td>
              <td><strong>${O.tl(s.bedel)}</strong></td>
              <td>${O.kacir(s.sorumlu || '—')}</td>
              <td>${O.rozet(SOZ_DURUM[s.durum] || s.durum, SOZ_RENK[s.durum] || '#656871')}</td>
              <td class="islem-td">${y ? `
                <button class="btn-ikon" title="Düzenle" onclick="EvrakModul.yeniSozlesme(${s.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>
                <button class="btn-ikon btn-sil" title="Sil" onclick="EvrakModul.sozlesmeSil(${s.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Sözleşme kaydı yok', 8)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('soz-arama').oninput = e => { sozArama = e.target.value; sozlesmeGovde(y); };
    document.getElementById('soz-tur').onchange = e => { filtreSozTur = e.target.value; sozlesmeGovde(y); };
  }

  return {
    async yukle() { arama = ''; filtreYon = ''; filtreKategori = ''; sozArama = ''; filtreSozTur = ''; await veriYukle(); render(); },

    async yeniEvrak(id) {
      const e0 = id ? evraklar.find(x => x.id === id) || {} : {};
      const pers = await O.personeller();
      const g = O.modalAc(id ? 'Evrak Düzenle' : 'Evrak Kaydet', `
        <form id="evr-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Yön *</label><select name="yon">${O.enumSecenek(YON, e0.yon || 'gelen')}</select></div>
            <div class="form-group"><label>Tarih *</label><input type="date" name="tarih" required value="${e0.tarih || O.bugun()}" /></div>
            <div class="form-group"><label>Gönderen</label><input name="gonderen" value="${O.kacir(e0.gonderen || '')}" placeholder="Kurum / kişi" /></div>
            <div class="form-group"><label>Alıcı</label><input name="alici" value="${O.kacir(e0.alici || '')}" placeholder="Kurum / kişi" /></div>
            <div class="form-group"><label>Kategori</label><input name="kategori" value="${O.kacir(e0.kategori || '')}" placeholder="Resmi Yazı / Tebligat / Fatura" list="evr-kat-list" />
              <datalist id="evr-kat-list">${[...new Set(evraklar.map(x => x.kategori).filter(Boolean))].map(k => `<option value="${O.kacir(k)}">`).join('')}</datalist></div>
            <div class="form-group"><label>İlgili Personel</label><select name="ilgili_personel_id">
              <option value="">Yok</option>${O.secenekler(pers, e0.ilgili_personel_id, 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Evrak No</label><input name="evrak_no" value="${O.kacir(e0.evrak_no || '')}" placeholder="Boş bırakılırsa otomatik" /></div>
            <div class="form-group"><label>Dosya Yolu / Arşiv No</label><input name="dosya_yolu" value="${O.kacir(e0.dosya_yolu || '')}" placeholder="Klasör-2026/07" /></div>
          </div>
          <div class="form-group"><label>Konu *</label><input name="konu" required value="${O.kacir(e0.konu || '')}" placeholder="Evrak konusu" /></div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2">${O.kacir(e0.notlar || '')}</textarea></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`, true);

      g.querySelector('#evr-form').onsubmit = async ev => {
        ev.preventDefault();
        const veri = O.formVeri(ev.target, ['ilgili_personel_id']);
        try {
          const s = id ? await O.api(`/evrak/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
                       : await O.api('/evrak', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async evrakSil(id) {
      if (!confirm('Evrak kaydı silinsin mi?')) return;
      try {
        const s = await O.api(`/evrak/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async yeniSozlesme(id) {
      const s0 = id ? sozlesmeler.find(x => x.id === id) || {} : {};
      const pers = await O.personeller();
      const g = O.modalAc(id ? 'Sözleşme Düzenle' : 'Sözleşme Ekle', `
        <form id="soz-form" class="modal-form">
          <div class="form-group"><label>Başlık *</label><input name="baslik" required value="${O.kacir(s0.baslik || '')}" placeholder="Temizlik hizmet sözleşmesi" /></div>
          <div class="form-grid-2">
            <div class="form-group"><label>Karşı Taraf</label><input name="karsi_taraf" value="${O.kacir(s0.karsi_taraf || '')}" /></div>
            <div class="form-group"><label>Tür</label><select name="tur">${O.enumSecenek(SOZ_TUR, s0.tur || 'hizmet')}</select></div>
            <div class="form-group"><label>Başlangıç *</label><input type="date" name="baslangic_tarihi" required value="${s0.baslangic_tarihi || O.bugun()}" /></div>
            <div class="form-group"><label>Bitiş</label><input type="date" name="bitis_tarihi" value="${s0.bitis_tarihi || ''}" /></div>
            <div class="form-group"><label>Bedel</label><input type="number" step="0.01" name="bedel" value="${s0.bedel || ''}" /></div>
            <div class="form-group"><label>Para Birimi</label><select name="para_birimi">
              ${O.enumSecenek({ TRY: 'TRY (₺)', USD: 'USD ($)', EUR: 'EUR (€)' }, s0.para_birimi || 'TRY')}</select></div>
            <div class="form-group"><label>Kaç Gün Önce Uyar</label><input type="number" name="uyari_gun" value="${s0.uyari_gun ?? 30}" /></div>
            <div class="form-group"><label>Sorumlu</label><select name="sorumlu_personel_id">
              <option value="">Yok</option>${O.secenekler(pers, s0.sorumlu_personel_id, 'id', 'adSoyad')}</select></div>
            ${id ? `<div class="form-group"><label>Durum</label><select name="durum">${O.enumSecenek(SOZ_DURUM, s0.durum)}</select></div>` : ''}
            <div class="form-group"><label>Dosya Yolu / Arşiv No</label><input name="dosya_yolu" value="${O.kacir(s0.dosya_yolu || '')}" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2">${O.kacir(s0.notlar || '')}</textarea></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`, true);

      g.querySelector('#soz-form').onsubmit = async ev => {
        ev.preventDefault();
        const veri = O.formVeri(ev.target, ['bedel', 'uyari_gun', 'sorumlu_personel_id']);
        try {
          const s = id ? await O.api(`/evrak/sozlesmeler/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
                       : await O.api('/evrak/sozlesmeler', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async sozlesmeSil(id) {
      if (!confirm('Sözleşme silinsin mi?')) return;
      try {
        const s = await O.api(`/evrak/sozlesmeler/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },
  };
})();
