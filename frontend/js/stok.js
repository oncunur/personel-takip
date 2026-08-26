// ─── Ofis Malzeme / Sarf Stok Modülü ──────────────────────────────
const StokModul = (() => {
  const O = Ortak;
  let sekme = 'urunler';
  let urunler = [], hareketler = [], ozet = null;
  let arama = '', filtreKategori = '', sadeceKritik = false, filtreHareketTur = '';

  const HAREKET = { giris: 'Giriş', cikis: 'Çıkış', sayim: 'Sayım', fire: 'Fire' };
  const HAREKET_RENK = { giris: '#22C55E', cikis: '#4F6EF7', sayim: '#8B5CF6', fire: '#EF4444' };


  async function veriYukle() {
    const [ud, hd, od] = await Promise.all([O.api('/stok'), O.api('/stok/hareketler'), O.api('/stok/ozet')]);
    urunler = ud.veriler; hareketler = hd.veriler; ozet = od;
  }

  function render() {
    const y = O.yonetici();
    const kritikler = ozet.kritik_urunler || [];
    O.icerik(`
      ${O.statGrid([
        { label: 'Ürün Çeşidi', deger: ozet.urun_sayisi, alt: 'aktif kalem' },
        { label: 'Kritik Seviye', deger: ozet.kritik_sayisi, alt: 'sipariş gerekiyor', renk: ozet.kritik_sayisi ? '#EF4444' : '#22C55E' },
        { label: 'Stok Değeri', deger: O.tl(ozet.toplam_deger), alt: 'depodaki toplam', renk: '#8B5CF6' },
        { label: 'Bu Ay Hareket', deger: `${O.sayi(ozet.ay_giris)} / ${O.sayi(ozet.ay_cikis)}`, alt: 'giriş / çıkış', renk: '#4F6EF7' },
      ])}

      ${kritikler.length ? `<div class="panel uyari-panel">
        <div class="panel-header">Kritik Seviyedeki Ürünler</div>
        ${kritikler.map(u => `<div class="uyari-satir">
          <span class="uyari-ad">${O.kacir(u.ad)}</span>
          <span style="color:var(--gray-400);font-size:12px">${O.kacir(u.kod)}</span>
          <span class="uyari-alt">${O.rozet(`${O.sayi(u.mevcut_miktar)} ${u.birim} kaldı`, '#EF4444')} <span style="color:var(--gray-400);margin-left:8px">kritik: ${O.sayi(u.kritik_seviye)}</span></span>
        </div>`).join('')}
      </div>` : ''}

      ${O.sekmeler('stk-tabs', [
        { key: 'urunler', ad: 'Stok Kartları', rozet: urunler.length },
        { key: 'hareketler', ad: 'Hareketler', rozet: hareketler.length },
      ], sekme)}
      <div id="stk-govde"></div>`);
    document.querySelectorAll('#stk-tabs .idari-tab').forEach(b => { b.onclick = () => { sekme = b.dataset.tab; render(); }; });
    (sekme === 'urunler' ? urunGovde : hareketGovde)(y);
  }

  function urunGovde(y) {
    const kategoriler = [...new Set(urunler.map(u => u.kategori).filter(Boolean))];
    const liste = urunler.filter(u =>
      (!arama || `${u.ad} ${u.kod}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreKategori || u.kategori === filtreKategori) && (!sadeceKritik || u.kritik_mi));

    document.getElementById('stk-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="stk-arama" placeholder="Ürün adı, kod ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="stk-kat" class="filtre-select"><option value="">Tüm Kategoriler</option>
            ${kategoriler.map(k => `<option value="${O.kacir(k)}" ${filtreKategori === k ? 'selected' : ''}>${O.kacir(k)}</option>`).join('')}</select>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--gray-600);cursor:pointer">
            <input type="checkbox" id="stk-kritik" ${sadeceKritik ? 'checked' : ''} /> Sadece kritik</label>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} ürün</span>
          ${y ? `<button class="btn-yeni" onclick="StokModul.yeniUrun()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Ürün Ekle</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Ürün</th><th>Kategori</th><th>Mevcut</th><th>Kritik</th><th>Birim Fiyat</th><th>Değer</th><th>Raf</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(u => `
            <tr ${u.kritik_mi ? 'style="background:#FEF2F2"' : ''}>
              <td><strong>${O.kacir(u.ad)}</strong><span class="hucre-alt">${O.kacir(u.kod)}</span></td>
              <td><span class="departman-chip">${O.kacir(u.kategori || '—')}</span></td>
              <td><strong style="${u.kritik_mi ? 'color:#DC2626' : ''}">${O.sayi(u.mevcut_miktar)}</strong> <span style="color:var(--gray-400)">${O.kacir(u.birim)}</span></td>
              <td style="color:var(--gray-500)">${O.sayi(u.kritik_seviye)}</td>
              <td>${O.tlTam(u.birim_fiyat)}</td>
              <td><strong>${O.tl(u.toplam_deger)}</strong></td>
              <td style="color:var(--gray-500)">${O.kacir(u.raf || '—')}</td>
              <td class="islem-td">
                ${y ? `<button class="btn-mini onay" onclick="StokModul.hareket(${u.id},'giris')">Giriş</button>
                <button class="btn-mini" onclick="StokModul.hareket(${u.id},'cikis')">Çıkış</button>` : ''}
                <button class="btn-ikon" title="Detay" onclick="StokModul.detay(${u.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg></button>
                ${y ? `<button class="btn-ikon" title="Düzenle" onclick="StokModul.yeniUrun(${u.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Ürün kaydı yok', 8)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('stk-arama').oninput = e => { arama = e.target.value; urunGovde(y); };
    document.getElementById('stk-kat').onchange = e => { filtreKategori = e.target.value; urunGovde(y); };
    document.getElementById('stk-kritik').onchange = e => { sadeceKritik = e.target.checked; urunGovde(y); };
  }

  function hareketGovde(y) {
    const liste = hareketler.filter(h => !filtreHareketTur || h.tur === filtreHareketTur);
    document.getElementById('stk-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <select id="stk-hrk-tur" class="filtre-select"><option value="">Tüm Hareketler</option>${O.enumSecenek(HAREKET, filtreHareketTur)}</select>
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} kayıt</span>
        </div>
        <div class="toolbar-sagda">${y ? `<button class="btn-yeni" onclick="StokModul.hareket()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Hareket Ekle</button>` : ''}</div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Tarih</th><th>Ürün</th><th>Hareket</th><th>Miktar</th><th>Kime / Belge</th><th>Açıklama</th></tr></thead>
          <tbody>${liste.length ? liste.map(h => `
            <tr>
              <td>${O.tarih(h.tarih)}</td>
              <td><strong>${O.kacir(h.urun_ad || '—')}</strong><span class="hucre-alt">${O.kacir(h.urun_kod || '')}</span></td>
              <td>${O.rozet(HAREKET[h.tur] || h.tur, HAREKET_RENK[h.tur] || '#6B7280')}</td>
              <td><strong>${h.tur === 'cikis' || h.tur === 'fire' ? '−' : '+'}${O.sayi(h.miktar)}</strong> <span style="color:var(--gray-400)">${O.kacir(h.birim || '')}</span></td>
              <td>${O.kacir(h.personel_ad || h.belge_no || '—')}</td>
              <td style="color:var(--gray-500)">${O.kacir(h.aciklama || '—')}</td>
            </tr>`).join('') : O.bosSatir('Hareket kaydı yok', 6)}
          </tbody>
        </table>
      </div>`;
    document.getElementById('stk-hrk-tur').onchange = e => { filtreHareketTur = e.target.value; hareketGovde(y); };
  }

  return {
    async yukle() { arama = ''; filtreKategori = ''; sadeceKritik = false; filtreHareketTur = ''; await veriYukle(); render(); },

    yeniUrun(id) {
      const u = id ? urunler.find(x => x.id === id) || {} : {};
      const g = O.modalAc(id ? 'Stok Kartı Düzenle' : 'Stok Kartı Ekle', `
        <form id="stk-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ürün Adı *</label><input name="ad" required value="${O.kacir(u.ad || '')}" placeholder="A4 Fotokopi Kağıdı" /></div>
            <div class="form-group"><label>Kategori</label><input name="kategori" value="${O.kacir(u.kategori || '')}" placeholder="Kırtasiye" list="stk-kat-list" />
              <datalist id="stk-kat-list">${[...new Set(urunler.map(x => x.kategori).filter(Boolean))].map(k => `<option value="${O.kacir(k)}">`).join('')}</datalist></div>
            <div class="form-group"><label>Birim</label><input name="birim" value="${O.kacir(u.birim || 'adet')}" placeholder="adet / paket / kg" /></div>
            <div class="form-group"><label>Raf / Konum</label><input name="raf" value="${O.kacir(u.raf || '')}" /></div>
            ${id ? '' : `<div class="form-group"><label>Açılış Stoğu</label><input type="number" step="0.01" name="mevcut_miktar" value="0" /></div>`}
            <div class="form-group"><label>Kritik Seviye</label><input type="number" step="0.01" name="kritik_seviye" value="${u.kritik_seviye ?? 0}" /></div>
            <div class="form-group"><label>Birim Fiyat (₺)</label><input type="number" step="0.01" name="birim_fiyat" value="${u.birim_fiyat || ''}" /></div>
          </div>
          ${O.formHata()}${O.modalFooter()}
        </form>`);

      g.querySelector('#stk-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['mevcut_miktar', 'kritik_seviye', 'birim_fiyat']);
        try {
          const s = id ? await O.api(`/stok/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
                       : await O.api('/stok', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async hareket(urunId, tur) {
      const pers = await O.personeller();
      const g = O.modalAc('Stok Hareketi', `
        <form id="stk-hrk-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ürün *</label><select name="urun_id" required>
              <option value="">Seçiniz</option>
              ${urunler.map(u => `<option value="${u.id}" ${u.id === urunId ? 'selected' : ''}>${O.kacir(u.kod)} — ${O.kacir(u.ad)} (${O.sayi(u.mevcut_miktar)} ${O.kacir(u.birim)})</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Hareket Türü *</label><select name="tur">${O.enumSecenek(HAREKET, tur || 'giris')}</select></div>
            <div class="form-group"><label>Miktar *</label><input type="number" step="0.01" min="0.01" name="miktar" required /></div>
            <div class="form-group"><label>Tarih *</label><input type="date" name="tarih" required value="${O.bugun()}" /></div>
            <div class="form-group"><label>Kime Verildi (çıkış)</label><select name="personel_id">
              <option value="">Yok</option>${O.secenekler(pers, '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Belge No</label><input name="belge_no" placeholder="Fatura / irsaliye no" /></div>
          </div>
          <div class="form-group"><label>Açıklama</label><input name="aciklama" /></div>
          <p style="font-size:12px;color:var(--gray-500);margin-top:-4px">Sayım hareketinde mevcut miktar girilen değere eşitlenir.</p>
          ${O.formHata()}${O.modalFooter('Kaydet')}
        </form>`);

      g.querySelector('#stk-hrk-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['urun_id', 'miktar', 'personel_id']);
        try {
          const s = await O.api('/stok/hareketler', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async detay(id) {
      const u = await O.api(`/stok/${id}`) || (() => {
        const x = urunler.find(k => k.id === id);
        return { ...x, hareketler: hareketler.filter(h => h.urun_id === id) };
      })();
      O.modalAc(`${u.kod} — ${u.ad}`, `
        <div class="detay-grid">
          <div class="detay-satir"><span>Kategori</span><strong>${O.kacir(u.kategori || '—')}</strong></div>
          <div class="detay-satir"><span>Raf</span><strong>${O.kacir(u.raf || '—')}</strong></div>
          <div class="detay-satir"><span>Mevcut</span><strong>${O.sayi(u.mevcut_miktar)} ${O.kacir(u.birim)}</strong></div>
          <div class="detay-satir"><span>Kritik Seviye</span><strong>${O.sayi(u.kritik_seviye)} ${O.kacir(u.birim)}</strong></div>
          <div class="detay-satir"><span>Birim Fiyat</span><strong>${O.tlTam(u.birim_fiyat)}</strong></div>
          <div class="detay-satir"><span>Toplam Değer</span><strong>${O.tl(u.toplam_deger)}</strong></div>
        </div>
        <div class="panel-header" style="margin-top:16px">Son Hareketler</div>
        <table class="personel-tablo idari-tablo"><tbody>
          ${(u.hareketler || []).length ? u.hareketler.map(h => `<tr>
            <td>${O.tarih(h.tarih)}</td>
            <td>${O.rozet(HAREKET[h.tur] || h.tur, HAREKET_RENK[h.tur])}</td>
            <td><strong>${h.tur === 'cikis' || h.tur === 'fire' ? '−' : '+'}${O.sayi(h.miktar)}</strong></td>
            <td style="color:var(--gray-500)">${O.kacir(h.personel_ad || h.aciklama || '')}</td>
          </tr>`).join('') : O.bosSatir('Hareket yok', 4)}
        </tbody></table>
        <div class="modal-footer"><button class="btn-iptal" onclick="Ortak.modalKapat()">Kapat</button></div>`, true);
    },
  };
})();
