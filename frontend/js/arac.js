// ─── Araç / Filo Yönetimi Modülü ──────────────────────────────────
const AracModul = (() => {
  const O = Ortak;
  let sekme = 'araclar';
  let araclar = [], giderler = [], ozet = null;
  let arama = '', filtreDurum = '', filtreGiderTur = '';

  const DURUM = { aktif: 'Aktif', bakimda: 'Bakımda', satildi: 'Satıldı', pasif: 'Pasif' };
  const DURUM_RENK = { aktif: '#52C41A', bakimda: '#FAAD14', satildi: '#BFBFBF', pasif: '#BFBFBF' };
  const YAKIT = { benzin: 'Benzin', dizel: 'Dizel', lpg: 'LPG', elektrik: 'Elektrik', hibrit: 'Hibrit' };
  const GIDER_TUR = {
    yakit: 'Yakıt', bakim: 'Bakım', lastik: 'Lastik', sigorta: 'Sigorta',
    kasko: 'Kasko', muayene: 'Muayene', ceza: 'Trafik Cezası', hgs: 'HGS/OGS', diger: 'Diğer',
  };


  async function veriYukle() {
    const [ad, gd, od] = await Promise.all([O.api('/arac'), O.api('/arac/gider/liste'), O.api('/arac/ozet')]);
    araclar = ad.veriler; giderler = gd.veriler; ozet = od;
  }

  function render() {
    const y = O.yonetici();
    const uyarilar = ozet.uyarilar || [];
    O.icerik(`
      ${O.statGrid([
        { label: 'Araç', deger: ozet.arac_sayisi, alt: `${ozet.atanan} atanmış · ${ozet.bosta} boşta` },
        { label: 'Bakımda', deger: ozet.bakimda, alt: 'serviste', renk: ozet.bakimda ? '#FAAD14' : '#52C41A' },
        { label: 'Yıllık Gider', deger: O.tl(ozet.yillik_gider), alt: 'yakıt, bakım, ceza dahil', renk: '#722ED1' },
        { label: 'Evrak Uyarısı', deger: uyarilar.length, alt: '30 gün içinde dolan', renk: uyarilar.length ? '#FF4D4F' : '#52C41A' },
      ])}

      ${uyarilar.length ? `<div class="panel uyari-panel">
        <div class="panel-header">Muayene / Sigorta / Kasko Uyarıları</div>
        ${uyarilar.map(u => `<div class="uyari-satir">
          <span class="uyari-ad">${O.kacir(u.plaka)}</span>
          <span style="color:var(--gray-600)">${O.kacir(u.tip)}</span>
          <span class="uyari-alt">${O.tarih(u.tarih)} · ${O.kalanRozet(u.kalan_gun)}</span>
        </div>`).join('')}
      </div>` : ''}

      ${O.sekmeler('arc-tabs', [
        { key: 'araclar', ad: 'Filo', rozet: araclar.length },
        { key: 'giderler', ad: 'Giderler', rozet: giderler.length },
      ], sekme)}
      <div id="arc-govde"></div>`);
    document.querySelectorAll('#arc-tabs .idari-tab').forEach(b => { b.onclick = () => { sekme = b.dataset.tab; render(); }; });
    (sekme === 'araclar' ? filoGovde : giderGovde)(y);
  }

  function filoGovde(y) {
    const liste = araclar.filter(a =>
      (!arama || `${a.plaka} ${a.marka || ''} ${a.model || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreDurum || a.durum === filtreDurum));

    document.getElementById('arc-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="arc-arama" placeholder="Plaka, marka, model ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="arc-durum" class="filtre-select"><option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}</select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} araç</span>
          ${y ? `<button class="btn-yeni" onclick="AracModul.yeniArac()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Araç Ekle</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Plaka</th><th>Araç</th><th>KM</th><th>Sürücü</th><th>Muayene</th><th>Sigorta</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(a => `
            <tr>
              <td><strong style="letter-spacing:.03em">${O.kacir(a.plaka)}</strong><span class="hucre-alt">${YAKIT[a.yakit_tur] || ''}</span></td>
              <td>${O.kacir(a.marka || '—')} ${O.kacir(a.model || '')}<span class="hucre-alt">${a.yil || ''} ${O.kacir(a.tip || '')}</span></td>
              <td>${O.sayi(a.km)} km</td>
              <td>${a.surucu ? `<strong>${O.kacir(a.surucu)}</strong>` : '<span style="color:var(--gray-400)">Boşta</span>'}</td>
              <td>${a.muayene_tarihi ? O.kalanRozet(a.muayene_kalan) : '<span style="color:var(--gray-400)">—</span>'}</td>
              <td>${a.sigorta_bitis ? O.kalanRozet(a.sigorta_kalan) : '<span style="color:var(--gray-400)">—</span>'}</td>
              <td>${O.rozet(DURUM[a.durum] || a.durum, DURUM_RENK[a.durum] || '#8C8C8C')}</td>
              <td class="islem-td">
                <button class="btn-ikon" title="Detay" onclick="AracModul.detay(${a.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg></button>
                ${y ? (a.atama_id
                  ? `<button class="btn-mini" onclick="AracModul.atamaBitir(${a.atama_id})">Atamayı Bitir</button>`
                  : `<button class="btn-mini onay" onclick="AracModul.atamaYap(${a.id})">Ata</button>`) : ''}
                ${y ? `<button class="btn-ikon" title="Düzenle" onclick="AracModul.yeniArac(${a.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Araç kaydı yok', 8)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('arc-arama').oninput = e => { arama = e.target.value; filoGovde(y); };
    document.getElementById('arc-durum').onchange = e => { filtreDurum = e.target.value; filoGovde(y); };
  }

  function giderGovde(y) {
    const liste = giderler.filter(g => !filtreGiderTur || g.tur === filtreGiderTur);
    const toplam = liste.reduce((t, g) => t + Number(g.tutar), 0);
    const dagilim = ozet.gider_dagilim || {};

    document.getElementById('arc-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <select id="arc-gider-tur" class="filtre-select"><option value="">Tüm Gider Türleri</option>${O.enumSecenek(GIDER_TUR, filtreGiderTur)}</select>
          <span style="font-size:13px;color:var(--gray-500)">Toplam <strong style="color:var(--gray-800)">${O.tl(toplam)}</strong></span>
        </div>
        <div class="toolbar-sagda">${y ? `<button class="btn-yeni" onclick="AracModul.yeniGider()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Gider Ekle</button>` : ''}</div>
      </div>

      ${Object.keys(dagilim).length ? `<div class="panel uyari-panel">
        <div class="panel-header">Gider Türü Dağılımı (bu yıl)</div>
        ${Object.entries(dagilim).sort((a, b) => b[1] - a[1]).map(([t, tutar]) => `<div class="uyari-satir">
          <span class="uyari-ad">${GIDER_TUR[t] || t}</span>
          <span class="uyari-alt"><strong>${O.tl(tutar)}</strong></span>
        </div>`).join('')}
      </div>` : ''}

      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Tarih</th><th>Araç</th><th>Tür</th><th>Tutar</th><th>KM / Litre</th><th>Açıklama</th><th></th></tr></thead>
          <tbody>${liste.length ? liste.map(g => `
            <tr>
              <td>${O.tarih(g.tarih)}</td>
              <td><strong>${O.kacir(g.plaka || '—')}</strong></td>
              <td>${GIDER_TUR[g.tur] || g.tur}</td>
              <td><strong>${O.tlTam(g.tutar)}</strong></td>
              <td>${g.km ? O.sayi(g.km) + ' km' : '—'}${g.litre ? `<span class="hucre-alt">${O.sayi(g.litre)} lt</span>` : ''}</td>
              <td style="color:var(--gray-500)">${O.kacir(g.aciklama || '—')}</td>
              <td class="islem-td">${y ? `<button class="btn-ikon btn-sil" title="Sil" onclick="AracModul.giderSil(${g.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}</td>
            </tr>`).join('') : O.bosSatir('Gider kaydı yok', 7)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('arc-gider-tur').onchange = e => { filtreGiderTur = e.target.value; giderGovde(y); };
  }

  return {
    async yukle() { arama = ''; filtreDurum = ''; filtreGiderTur = ''; await veriYukle(); render(); },

    yeniArac(id) {
      const a = id ? araclar.find(x => x.id === id) || {} : {};
      const g = O.modalAc(id ? 'Araç Düzenle' : 'Araç Ekle', `
        <form id="arc-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Plaka *</label><input name="plaka" required value="${O.kacir(a.plaka || '')}" placeholder="34 ABC 123" style="text-transform:uppercase" /></div>
            <div class="form-group"><label>Tip</label><input name="tip" value="${O.kacir(a.tip || '')}" placeholder="Binek / Kamyonet / İş Makinesi" /></div>
            <div class="form-group"><label>Marka</label><input name="marka" value="${O.kacir(a.marka || '')}" /></div>
            <div class="form-group"><label>Model</label><input name="model" value="${O.kacir(a.model || '')}" /></div>
            <div class="form-group"><label>Model Yılı</label><input type="number" name="yil" value="${a.yil || ''}" /></div>
            <div class="form-group"><label>Yakıt</label><select name="yakit_tur">${O.enumSecenek(YAKIT, a.yakit_tur || 'dizel')}</select></div>
            <div class="form-group"><label>Güncel KM</label><input type="number" name="km" value="${a.km || 0}" /></div>
            ${id ? `<div class="form-group"><label>Durum</label><select name="durum">${O.enumSecenek(DURUM, a.durum)}</select></div>` : ''}
            <div class="form-group"><label>Muayene Tarihi</label><input type="date" name="muayene_tarihi" value="${a.muayene_tarihi || ''}" /></div>
            <div class="form-group"><label>Sigorta Bitiş</label><input type="date" name="sigorta_bitis" value="${a.sigorta_bitis || ''}" /></div>
            <div class="form-group"><label>Kasko Bitiş</label><input type="date" name="kasko_bitis" value="${a.kasko_bitis || ''}" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2">${O.kacir(a.notlar || '')}</textarea></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`, true);

      g.querySelector('#arc-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['yil', 'km']);
        try {
          const s = id ? await O.api(`/arac/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
                       : await O.api('/arac', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async atamaYap(aracId) {
      const pers = await O.personeller();
      const g = O.modalAc('Araç Ata', `
        <form id="arc-atama-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Araç *</label><select name="arac_id" required>
              ${araclar.filter(a => !a.atama_id && a.durum !== 'satildi').map(a => `<option value="${a.id}" ${a.id === aracId ? 'selected' : ''}>${O.kacir(a.plaka)} — ${O.kacir(a.marka || '')} ${O.kacir(a.model || '')}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Sürücü *</label><select name="personel_id" required>
              <option value="">Seçiniz</option>${O.secenekler(pers, '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Başlangıç *</label><input type="date" name="baslangic_tarihi" required value="${O.bugun()}" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2"></textarea></div>
          ${O.formHata()}${O.modalFooter('Ata')}
        </form>`);

      g.querySelector('#arc-atama-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['arac_id', 'personel_id']);
        try {
          const s = await O.api('/arac/atama', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async atamaBitir(atamaId) {
      const a = araclar.find(x => x.atama_id === atamaId);
      if (!confirm(`${a ? a.plaka : 'Araç'} ataması sonlandırılsın mı?`)) return;
      try {
        const s = await O.api(`/arac/atama/${atamaId}/bitir`, { method: 'POST', body: JSON.stringify({ bitis_tarihi: O.bugun() }) });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    yeniGider() {
      const g = O.modalAc('Araç Gideri Ekle', `
        <form id="arc-gider-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Araç *</label><select name="arac_id" required>
              <option value="">Seçiniz</option>${O.secenekler(araclar, '', 'id', 'plaka')}</select></div>
            <div class="form-group"><label>Gider Türü</label><select name="tur">${O.enumSecenek(GIDER_TUR, 'yakit')}</select></div>
            <div class="form-group"><label>Tarih *</label><input type="date" name="tarih" required value="${O.bugun()}" /></div>
            <div class="form-group"><label>Tutar (₺) *</label><input type="number" name="tutar" required step="0.01" /></div>
            <div class="form-group"><label>KM (yakıt/bakım)</label><input type="number" name="km" placeholder="Sayaç değeri" /></div>
            <div class="form-group"><label>Litre (yakıt)</label><input type="number" name="litre" step="0.01" /></div>
          </div>
          <div class="form-group"><label>Açıklama</label><input name="aciklama" placeholder="Periyodik bakım, hız cezası..." /></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`);

      g.querySelector('#arc-gider-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['arac_id', 'tutar', 'km', 'litre']);
        try {
          const s = await O.api('/arac/gider', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async giderSil(id) {
      if (!confirm('Gider kaydı silinsin mi?')) return;
      try {
        const s = await O.api(`/arac/gider/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async detay(id) {
      const d = await O.api(`/arac/${id}`) || (() => {
        const a = araclar.find(x => x.id === id);
        const gl = giderler.filter(g => g.arac_id === id);
        return { ...a, giderler: gl, atama_gecmisi: [], toplam_gider: gl.reduce((t, g) => t + Number(g.tutar), 0) };
      })();
      O.modalAc(`${d.plaka} — ${d.marka || ''} ${d.model || ''}`, `
        <div class="detay-grid">
          <div class="detay-satir"><span>Tip</span><strong>${O.kacir(d.tip || '—')}</strong></div>
          <div class="detay-satir"><span>Model Yılı</span><strong>${d.yil || '—'}</strong></div>
          <div class="detay-satir"><span>Yakıt</span><strong>${YAKIT[d.yakit_tur] || '—'}</strong></div>
          <div class="detay-satir"><span>KM</span><strong>${O.sayi(d.km)} km</strong></div>
          <div class="detay-satir"><span>Sürücü</span><strong>${O.kacir(d.surucu || 'Boşta')}</strong></div>
          <div class="detay-satir"><span>Durum</span>${O.rozet(DURUM[d.durum] || d.durum, DURUM_RENK[d.durum] || '#8C8C8C')}</div>
          <div class="detay-satir"><span>Muayene</span><strong>${O.tarih(d.muayene_tarihi)}</strong></div>
          <div class="detay-satir"><span>Sigorta</span><strong>${O.tarih(d.sigorta_bitis)}</strong></div>
          <div class="detay-satir"><span>Kasko</span><strong>${O.tarih(d.kasko_bitis)}</strong></div>
          <div class="detay-satir"><span>Toplam Gider</span><strong>${O.tl(d.toplam_gider)}</strong></div>
        </div>
        <div class="panel-header" style="margin-top:16px">Son Giderler</div>
        <table class="personel-tablo idari-tablo"><tbody>
          ${(d.giderler || []).length ? d.giderler.slice(0, 10).map(g => `<tr>
            <td>${O.tarih(g.tarih)}</td><td>${GIDER_TUR[g.tur] || g.tur}</td>
            <td><strong>${O.tlTam(g.tutar)}</strong></td>
            <td style="color:var(--gray-500)">${O.kacir(g.aciklama || '')}</td>
          </tr>`).join('') : O.bosSatir('Gider kaydı yok', 4)}
        </tbody></table>
        <div class="modal-footer"><button class="btn-iptal" onclick="Ortak.modalKapat()">Kapat</button></div>`, true);
    },
  };
})();
