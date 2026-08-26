// ─── Satın Alma Talepleri Modülü ──────────────────────────────────
const SatinAlmaModul = (() => {
  const O = Ortak;
  let talepler = [], ozet = null;
  let arama = '', filtreDurum = '', filtreOncelik = '';
  let kalemSayac = 0;

  const DURUM = {
    beklemede: 'Beklemede', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi',
    siparis_verildi: 'Sipariş Verildi', teslim_alindi: 'Teslim Alındı', iptal: 'İptal',
  };
  const DURUM_RENK = {
    beklemede: '#FAAD14', onaylandi: '#1677FF', reddedildi: '#FF4D4F',
    siparis_verildi: '#722ED1', teslim_alindi: '#52C41A', iptal: '#BFBFBF',
  };
  const ONCELIK = { dusuk: 'Düşük', normal: 'Normal', yuksek: 'Yüksek', acil: 'Acil' };
  const ONCELIK_RENK = { dusuk: '#BFBFBF', normal: '#8C8C8C', yuksek: '#FAAD14', acil: '#FF4D4F' };


  async function veriYukle() {
    const [td, od] = await Promise.all([O.api('/satinalma'), O.api('/satinalma/ozet')]);
    talepler = td.veriler; ozet = od;
  }

  function render() {
    const y = O.yonetici();
    const liste = talepler.filter(t =>
      (!arama || `${t.talep_no} ${t.aciklama || ''} ${t.talep_eden || ''} ${t.tedarikci || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreDurum || t.durum === filtreDurum) && (!filtreOncelik || t.oncelik === filtreOncelik));

    O.icerik(`
      ${O.statGrid([
        { label: 'Bekleyen', deger: ozet.beklemede, alt: 'onay bekliyor', renk: ozet.beklemede ? '#FAAD14' : '#52C41A' },
        { label: 'Onaylı / Siparişte', deger: ozet.onaylandi + ozet.siparis_verildi, alt: 'işlemde', renk: '#1677FF' },
        { label: 'Teslim Alınan', deger: ozet.teslim_alindi, alt: 'bu yıl', renk: '#52C41A' },
        { label: 'Onaylanan Tutar', deger: O.tl(ozet.onaylanan_tutar), alt: 'bu yıl', renk: '#722ED1' },
      ])}

      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="sat-arama" placeholder="Talep no, açıklama, tedarikçi ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="sat-durum" class="filtre-select"><option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}</select>
          <select id="sat-oncelik" class="filtre-select"><option value="">Tüm Öncelikler</option>${O.enumSecenek(ONCELIK, filtreOncelik)}</select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} talep</span>
          <button class="btn-yeni" onclick="SatinAlmaModul.yeniTalep()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Talep Oluştur</button>
        </div>
      </div>

      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Talep No</th><th>Talep Eden</th><th>Konu</th><th>Öncelik</th><th>Tutar</th><th>İhtiyaç</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(t => `
            <tr>
              <td><strong style="font-variant-numeric:tabular-nums">${O.kacir(t.talep_no)}</strong><span class="hucre-alt">${O.tarih(t.tarih)}</span></td>
              <td><strong>${O.kacir(t.talep_eden || '—')}</strong><span class="hucre-alt">${O.kacir(t.departman || '')}</span></td>
              <td>${O.kacir(t.aciklama || '—')}<span class="hucre-alt">${t.kalem_sayisi} kalem</span></td>
              <td>${O.rozet(ONCELIK[t.oncelik] || t.oncelik, ONCELIK_RENK[t.oncelik] || '#8C8C8C')}</td>
              <td><strong>${O.tl(t.tahmini_tutar)}</strong></td>
              <td>${t.ihtiyac_tarihi ? O.tarih(t.ihtiyac_tarihi) : '—'}</td>
              <td>${O.rozet(DURUM[t.durum] || t.durum, DURUM_RENK[t.durum] || '#8C8C8C')}</td>
              <td class="islem-td">
                <button class="btn-ikon" title="Detay" onclick="SatinAlmaModul.detay(${t.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg></button>
                ${y ? aksiyonlar(t) : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Talep kaydı yok', 8)}
          </tbody>
        </table>
      </div>`);

    document.getElementById('sat-arama').oninput = e => { arama = e.target.value; render(); };
    document.getElementById('sat-durum').onchange = e => { filtreDurum = e.target.value; render(); };
    document.getElementById('sat-oncelik').onchange = e => { filtreOncelik = e.target.value; render(); };
  }

  // Talebin bulunduğu aşamaya göre bir sonraki adımın butonu
  function aksiyonlar(t) {
    if (t.durum === 'beklemede') return `
      <button class="btn-mini onay" onclick="SatinAlmaModul.karar(${t.id},'onayla')">Onayla</button>
      <button class="btn-mini ret" onclick="SatinAlmaModul.karar(${t.id},'reddet')">Reddet</button>`;
    if (t.durum === 'onaylandi') return `<button class="btn-mini" onclick="SatinAlmaModul.siparis(${t.id})">Sipariş Ver</button>`;
    if (t.durum === 'siparis_verildi') return `<button class="btn-mini onay" onclick="SatinAlmaModul.teslim(${t.id})">Teslim Al</button>`;
    return '';
  }

  function kalemSatiri(k = {}) {
    const id = ++kalemSayac;
    return `<tr data-kalem="${id}">
      <td><input name="urun_ad" required placeholder="Ürün / hizmet" value="${O.kacir(k.urun_ad || '')}" /></td>
      <td style="width:80px"><input name="miktar" type="number" step="0.01" min="0" value="${k.miktar || 1}" oninput="SatinAlmaModul.toplamHesapla()" /></td>
      <td style="width:80px"><input name="birim" value="${O.kacir(k.birim || 'adet')}" /></td>
      <td style="width:110px"><input name="birim_fiyat" type="number" step="0.01" min="0" value="${k.birim_fiyat || ''}" oninput="SatinAlmaModul.toplamHesapla()" /></td>
      <td style="width:36px"><button type="button" class="btn-kalem-sil" onclick="SatinAlmaModul.kalemSil(${id})">&times;</button></td>
    </tr>`;
  }

  return {
    async yukle() { arama = ''; filtreDurum = ''; filtreOncelik = ''; await veriYukle(); render(); },

    async yeniTalep() {
      const pers = await O.personeller();
      const dep = await O.api('/personel/departmanlar') || [];
      const ben = Auth.getKullanici();
      const varsayilan = pers.find(p => ben && p.adSoyad === `${ben.ad} ${ben.soyad}`);

      const g = O.modalAc('Satın Alma Talebi', `
        <form id="sat-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Talep Eden *</label><select name="talep_eden_id" required>
              <option value="">Seçiniz</option>${O.secenekler(pers, varsayilan ? varsayilan.id : '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Departman</label><select name="departman_id">
              <option value="">Seçiniz</option>${O.secenekler(dep, '', 'id', 'ad')}</select></div>
            <div class="form-group"><label>Talep Tarihi *</label><input type="date" name="tarih" required value="${O.bugun()}" /></div>
            <div class="form-group"><label>İhtiyaç Tarihi</label><input type="date" name="ihtiyac_tarihi" /></div>
            <div class="form-group"><label>Öncelik</label><select name="oncelik">${O.enumSecenek(ONCELIK, 'normal')}</select></div>
          </div>
          <div class="form-group"><label>Açıklama</label><input name="aciklama" placeholder="Neden ihtiyaç duyuluyor?" /></div>

          <label style="font-size:12px;font-weight:600;color:var(--gray-600);display:block;margin:10px 0 6px">Kalemler</label>
          <table class="kalem-tablo">
            <thead><tr><th>Ürün / Hizmet</th><th>Miktar</th><th>Birim</th><th>Birim Fiyat</th><th></th></tr></thead>
            <tbody id="sat-kalemler">${kalemSatiri()}</tbody>
            <tfoot><tr><td colspan="3" style="text-align:right">Tahmini Toplam</td><td id="sat-toplam">₺0</td><td></td></tr></tfoot>
          </table>
          <button type="button" class="btn-kalem-ekle" onclick="SatinAlmaModul.kalemEkle()">+ Kalem Ekle</button>
          ${O.formHata()}${O.modalFooter('Talebi Oluştur')}
        </form>`, true);

      g.querySelector('#sat-form').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        const kalemler = [...f.querySelectorAll('#sat-kalemler tr')].map(tr => ({
          urun_ad: tr.querySelector('[name=urun_ad]').value,
          miktar: Number(tr.querySelector('[name=miktar]').value || 0),
          birim: tr.querySelector('[name=birim]').value || 'adet',
          birim_fiyat: Number(tr.querySelector('[name=birim_fiyat]').value || 0),
        })).filter(k => k.urun_ad);
        if (!kalemler.length) return O.hataGoster('En az bir kalem girilmeli');

        const veri = {
          talep_eden_id: Number(f.talep_eden_id.value),
          departman_id: f.departman_id.value ? Number(f.departman_id.value) : null,
          tarih: f.tarih.value,
          ihtiyac_tarihi: f.ihtiyac_tarihi.value || null,
          aciklama: f.aciklama.value || null,
          oncelik: f.oncelik.value,
          kalemler,
        };
        try {
          const s = await O.api('/satinalma', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    kalemEkle() {
      document.getElementById('sat-kalemler').insertAdjacentHTML('beforeend', kalemSatiri());
    },
    kalemSil(id) {
      const tbody = document.getElementById('sat-kalemler');
      if (tbody.rows.length <= 1) return;
      tbody.querySelector(`[data-kalem="${id}"]`)?.remove();
      this.toplamHesapla();
    },
    toplamHesapla() {
      const toplam = [...document.querySelectorAll('#sat-kalemler tr')].reduce((t, tr) =>
        t + Number(tr.querySelector('[name=miktar]').value || 0) * Number(tr.querySelector('[name=birim_fiyat]').value || 0), 0);
      const el = document.getElementById('sat-toplam');
      if (el) el.textContent = O.tl(toplam);
    },

    async karar(id, tip) {
      const t = talepler.find(x => x.id === id);
      const not = prompt(tip === 'onayla' ? 'Onay notu (opsiyonel):' : 'Ret gerekçesi:', '');
      if (not === null) return;
      try {
        const s = await O.api(`/satinalma/${id}/${tip}`, { method: 'POST', body: JSON.stringify({ onay_notu: not || null }) });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async siparis(id) {
      const t = talepler.find(x => x.id === id);
      const g = O.modalAc('Sipariş Ver', `
        <form id="sat-sip-form" class="modal-form">
          <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px"><strong>${O.kacir(t.talep_no)}</strong> — ${O.kacir(t.aciklama || '')}</p>
          <div class="form-grid-2">
            <div class="form-group"><label>Tedarikçi *</label><input name="tedarikci" required placeholder="Firma adı" /></div>
            <div class="form-group"><label>Sipariş Tarihi *</label><input type="date" name="siparis_tarihi" required value="${O.bugun()}" /></div>
          </div>
          ${O.formHata()}${O.modalFooter('Sipariş Ver')}
        </form>`);
      g.querySelector('#sat-sip-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target);
        try {
          const s = await O.api(`/satinalma/${id}/siparis`, { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async teslim(id) {
      const t = talepler.find(x => x.id === id);
      if (!confirm(`${t.talep_no} teslim alındı olarak işaretlensin mi?`)) return;
      try {
        const s = await O.api(`/satinalma/${id}/teslim`, { method: 'POST', body: JSON.stringify({ teslim_tarihi: O.bugun() }) });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async detay(id) {
      const t = await O.api(`/satinalma/${id}`) || talepler.find(x => x.id === id);
      const toplam = (t.kalemler || []).reduce((s, k) => s + (k.tutar ?? k.miktar * k.birim_fiyat), 0);
      O.modalAc(`${t.talep_no}`, `
        <div class="detay-grid">
          <div class="detay-satir"><span>Talep Eden</span><strong>${O.kacir(t.talep_eden || '—')}</strong></div>
          <div class="detay-satir"><span>Departman</span><strong>${O.kacir(t.departman || '—')}</strong></div>
          <div class="detay-satir"><span>Talep Tarihi</span><strong>${O.tarih(t.tarih)}</strong></div>
          <div class="detay-satir"><span>İhtiyaç Tarihi</span><strong>${O.tarih(t.ihtiyac_tarihi)}</strong></div>
          <div class="detay-satir"><span>Öncelik</span>${O.rozet(ONCELIK[t.oncelik] || t.oncelik, ONCELIK_RENK[t.oncelik])}</div>
          <div class="detay-satir"><span>Durum</span>${O.rozet(DURUM[t.durum] || t.durum, DURUM_RENK[t.durum])}</div>
          <div class="detay-satir"><span>Onaylayan</span><strong>${O.kacir(t.onaylayan || '—')}</strong></div>
          <div class="detay-satir"><span>Onay Tarihi</span><strong>${t.onay_tarihi ? O.saatli(t.onay_tarihi) : '—'}</strong></div>
          <div class="detay-satir"><span>Tedarikçi</span><strong>${O.kacir(t.tedarikci || '—')}</strong></div>
          <div class="detay-satir"><span>Teslim</span><strong>${O.tarih(t.teslim_tarihi)}</strong></div>
          ${t.aciklama ? `<div class="detay-satir detay-tam"><span>Açıklama</span><strong>${O.kacir(t.aciklama)}</strong></div>` : ''}
          ${t.onay_notu ? `<div class="detay-satir detay-tam"><span>Onay Notu</span><strong>${O.kacir(t.onay_notu)}</strong></div>` : ''}
        </div>
        <div class="panel-header" style="margin-top:16px">Kalemler</div>
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Ürün / Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead>
          <tbody>
            ${(t.kalemler || []).map(k => `<tr>
              <td><strong>${O.kacir(k.urun_ad)}</strong></td>
              <td>${O.sayi(k.miktar)} ${O.kacir(k.birim || '')}</td>
              <td>${O.tlTam(k.birim_fiyat)}</td>
              <td><strong>${O.tlTam(k.tutar ?? k.miktar * k.birim_fiyat)}</strong></td>
            </tr>`).join('')}
            <tr><td colspan="3" style="text-align:right;font-weight:700">Toplam</td><td style="font-weight:700">${O.tlTam(toplam)}</td></tr>
          </tbody>
        </table>
        <div class="modal-footer"><button class="btn-iptal" onclick="Ortak.modalKapat()">Kapat</button></div>`, true);
    },
  };
})();
