// ─── Demirbaş & Zimmet Modülü ─────────────────────────────────────
const DemirbasModul = (() => {
  const O = Ortak;
  let sekme = 'demirbaslar';
  let demirbaslar = [], zimmetler = [], ozet = null, demo = false;
  let arama = '', filtreDurum = '', filtreKategori = '';

  const DURUM = { depoda: 'Depoda', zimmetli: 'Zimmetli', bakimda: 'Bakımda', hurda: 'Hurda', kayip: 'Kayıp' };
  const DURUM_RENK = { depoda: '#6B7280', zimmetli: '#4F6EF7', bakimda: '#F59E0B', hurda: '#9CA3AF', kayip: '#EF4444' };

  const DEMO_DEMIRBAS = [
    { id:1, kod:'DMB-0001', ad:'MacBook Pro 14"', kategori:'Bilgisayar', marka:'Apple', model:'M3 Pro', seri_no:'C02XY1234', alis_tarihi:'2026-01-20', alis_bedeli:95000, garanti_bitis:'2028-01-20', garanti_aktif:true, durum:'zimmetli', lokasyon:'Merkez Ofis', zimmet_id:1, zimmetli_personel_id:1, zimmetli_personel:'Kemal Yılmaz', zimmet_tarihi:'2026-02-05' },
    { id:2, kod:'DMB-0002', ad:'iPhone 15', kategori:'Telefon', marka:'Apple', model:'15 128GB', seri_no:'F9XK5566', alis_tarihi:'2026-02-10', alis_bedeli:52000, garanti_bitis:'2027-02-10', garanti_aktif:true, durum:'zimmetli', lokasyon:'Merkez Ofis', zimmet_id:2, zimmetli_personel_id:2, zimmetli_personel:'Hatice Şahin', zimmet_tarihi:'2026-02-12' },
    { id:3, kod:'DMB-0003', ad:'Çalışma Masası', kategori:'Mobilya', marka:'Bürosit', model:'160x80', seri_no:null, alis_tarihi:'2025-11-05', alis_bedeli:8500, garanti_bitis:null, garanti_aktif:false, durum:'depoda', lokasyon:'Depo', zimmet_id:null, zimmetli_personel:null },
    { id:4, kod:'DMB-0004', ad:'Lazer Metre', kategori:'Saha Ekipmanı', marka:'Bosch', model:'GLM 50', seri_no:'BS-99120', alis_tarihi:'2026-03-01', alis_bedeli:4200, garanti_bitis:'2028-03-01', garanti_aktif:true, durum:'bakimda', lokasyon:'Şantiye', zimmet_id:null, zimmetli_personel:null },
  ];
  const DEMO_ZIMMET = [
    { id:1, demirbas_id:1, demirbas_kod:'DMB-0001', demirbas_ad:'MacBook Pro 14"', kategori:'Bilgisayar', personel_id:1, personel_ad:'Kemal Yılmaz', departman:'İdari İşler', veris_tarihi:'2026-02-05', iade_tarihi:null, gun_sayisi:198, aktif:true },
    { id:2, demirbas_id:2, demirbas_kod:'DMB-0002', demirbas_ad:'iPhone 15', kategori:'Telefon', personel_id:2, personel_ad:'Hatice Şahin', departman:'İdari İşler', veris_tarihi:'2026-02-12', iade_tarihi:null, gun_sayisi:191, aktif:true },
  ];

  function demoOzet() {
    const s = {};
    demirbaslar.forEach(d => { s[d.durum] = (s[d.durum] || 0) + 1; });
    return {
      toplam: demirbaslar.length,
      zimmetli: s.zimmetli || 0, depoda: s.depoda || 0, bakimda: s.bakimda || 0,
      hurda: s.hurda || 0, kayip: s.kayip || 0,
      toplam_deger: demirbaslar.reduce((t, d) => t + Number(d.alis_bedeli || 0), 0),
      durum_dagilim: s,
    };
  }

  async function veriYukle() {
    const [dd, zd, od] = await Promise.all([
      O.api('/demirbas'), O.api('/demirbas/zimmet/liste?sadece_aktif=false'), O.api('/demirbas/ozet'),
    ]);
    demo = !dd;
    if (demo) {
      if (!demirbaslar.length) { demirbaslar = [...DEMO_DEMIRBAS]; zimmetler = [...DEMO_ZIMMET]; }
      ozet = demoOzet();
    } else { demirbaslar = dd.veriler; zimmetler = zd.veriler; ozet = od; }
  }

  function render() {
    const y = O.yonetici();
    O.icerik(`
      ${O.demoUyari(demo)}
      ${O.statGrid([
        { label: 'Toplam Demirbaş', deger: ozet.toplam, alt: O.tl(ozet.toplam_deger) + ' değerinde' },
        { label: 'Zimmetli', deger: ozet.zimmetli, alt: 'personelde', renk: '#4F6EF7' },
        { label: 'Depoda', deger: ozet.depoda, alt: 'zimmete hazır', renk: '#6B7280' },
        { label: 'Bakım / Kayıp', deger: ozet.bakimda + ozet.kayip, alt: `${ozet.bakimda} bakımda · ${ozet.kayip} kayıp`, renk: (ozet.bakimda + ozet.kayip) ? '#F59E0B' : '#22C55E' },
      ])}
      ${O.sekmeler('dmb-tabs', [
        { key: 'demirbaslar', ad: 'Demirbaş Envanteri', rozet: demirbaslar.length },
        { key: 'zimmetler', ad: 'Zimmetler', rozet: zimmetler.filter(z => z.aktif).length },
      ], sekme)}
      <div id="dmb-govde"></div>`);
    document.querySelectorAll('#dmb-tabs .idari-tab').forEach(b => { b.onclick = () => { sekme = b.dataset.tab; render(); }; });
    (sekme === 'demirbaslar' ? envanterGovde : zimmetGovde)(y);
  }

  function envanterGovde(y) {
    const kategoriler = [...new Set(demirbaslar.map(d => d.kategori).filter(Boolean))];
    const liste = demirbaslar.filter(d =>
      (!arama || `${d.ad} ${d.kod} ${d.marka || ''} ${d.model || ''} ${d.seri_no || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreDurum || d.durum === filtreDurum) && (!filtreKategori || d.kategori === filtreKategori));

    document.getElementById('dmb-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="dmb-arama" placeholder="Ad, kod, marka, seri no ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="dmb-kategori" class="filtre-select"><option value="">Tüm Kategoriler</option>
            ${kategoriler.map(k => `<option value="${O.kacir(k)}" ${filtreKategori === k ? 'selected' : ''}>${O.kacir(k)}</option>`).join('')}</select>
          <select id="dmb-durum" class="filtre-select"><option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}</select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} kayıt</span>
          ${y ? `<button class="btn-yeni" onclick="DemirbasModul.yeniDemirbas()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Demirbaş Ekle</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Demirbaş</th><th>Kategori</th><th>Marka / Model</th><th>Bedel</th><th>Zimmetli</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(d => `
            <tr>
              <td><strong>${O.kacir(d.ad)}</strong><span class="hucre-alt">${O.kacir(d.kod)}${d.seri_no ? ' · ' + O.kacir(d.seri_no) : ''}</span></td>
              <td><span class="departman-chip">${O.kacir(d.kategori || '—')}</span></td>
              <td>${O.kacir(d.marka || '—')}<span class="hucre-alt">${O.kacir(d.model || '')}</span></td>
              <td>${O.tl(d.alis_bedeli)}${d.garanti_aktif ? '<span class="hucre-alt" style="color:#16A34A">garantili</span>' : ''}</td>
              <td>${d.zimmetli_personel ? `<strong>${O.kacir(d.zimmetli_personel)}</strong><span class="hucre-alt">${O.tarih(d.zimmet_tarihi)}</span>` : '<span style="color:var(--gray-400)">—</span>'}</td>
              <td>${O.rozet(DURUM[d.durum] || d.durum, DURUM_RENK[d.durum] || '#6B7280')}</td>
              <td class="islem-td">
                <button class="btn-ikon" title="Detay" onclick="DemirbasModul.detay(${d.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg></button>
                ${y ? (d.zimmet_id
                  ? `<button class="btn-mini" onclick="DemirbasModul.iadeAl(${d.zimmet_id})">İade Al</button>`
                  : (['depoda'].includes(d.durum) ? `<button class="btn-mini onay" onclick="DemirbasModul.zimmetVer(${d.id})">Zimmetle</button>` : '')) : ''}
                ${y ? `<button class="btn-ikon" title="Düzenle" onclick="DemirbasModul.yeniDemirbas(${d.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Demirbaş kaydı yok', 7)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('dmb-arama').oninput = e => { arama = e.target.value; envanterGovde(y); };
    document.getElementById('dmb-kategori').onchange = e => { filtreKategori = e.target.value; envanterGovde(y); };
    document.getElementById('dmb-durum').onchange = e => { filtreDurum = e.target.value; envanterGovde(y); };
  }

  function zimmetGovde(y) {
    // Personel bazında grupla — kimde ne var, tek bakışta
    const gruplar = {};
    zimmetler.filter(z => z.aktif).forEach(z => {
      (gruplar[z.personel_id] = gruplar[z.personel_id] || { ad: z.personel_ad, departman: z.departman, kayitlar: [] }).kayitlar.push(z);
    });
    const gecmis = zimmetler.filter(z => !z.aktif);

    document.getElementById('dmb-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup"><span style="font-size:13px;color:var(--gray-500)">
          ${Object.keys(gruplar).length} personelde ${zimmetler.filter(z => z.aktif).length} demirbaş
        </span></div>
        <div class="toolbar-sagda">${y ? `<button class="btn-yeni" onclick="DemirbasModul.zimmetVer()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Zimmet Ver</button>` : ''}</div>
      </div>
      ${Object.keys(gruplar).length ? Object.entries(gruplar).map(([pid, g]) => `
        <div class="panel" style="margin-bottom:12px;overflow:hidden">
          <div class="panel-header">${O.kacir(g.ad)} <span style="font-weight:400;color:var(--gray-400)">· ${O.kacir(g.departman || '—')} · ${g.kayitlar.length} demirbaş</span></div>
          <table class="personel-tablo idari-tablo"><tbody>
            ${g.kayitlar.map(z => `<tr>
              <td><strong>${O.kacir(z.demirbas_ad)}</strong><span class="hucre-alt">${O.kacir(z.demirbas_kod)}</span></td>
              <td><span class="departman-chip">${O.kacir(z.kategori || '—')}</span></td>
              <td>${O.tarih(z.veris_tarihi)} tarihinden beri</td>
              <td>${z.gun_sayisi} gün</td>
              <td class="islem-td">${y ? `<button class="btn-mini" onclick="DemirbasModul.iadeAl(${z.id})">İade Al</button>` : ''}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>`).join('') : `<div class="panel"><table class="personel-tablo idari-tablo"><tbody>${O.bosSatir('Aktif zimmet yok', 5)}</tbody></table></div>`}

      ${gecmis.length ? `<div class="panel" style="overflow-x:auto">
        <div class="panel-header">İade Geçmişi (${gecmis.length})</div>
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Demirbaş</th><th>Personel</th><th>Veriliş</th><th>İade</th><th>Süre</th></tr></thead>
          <tbody>${gecmis.map(z => `<tr style="opacity:.6">
            <td><strong>${O.kacir(z.demirbas_ad)}</strong><span class="hucre-alt">${O.kacir(z.demirbas_kod)}</span></td>
            <td>${O.kacir(z.personel_ad)}</td><td>${O.tarih(z.veris_tarihi)}</td>
            <td>${O.tarih(z.iade_tarihi)}</td><td>${z.gun_sayisi} gün</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}`;
  }

  async function yenile() { await veriYukle(); render(); }

  return {
    async yukle() { arama = ''; filtreDurum = ''; filtreKategori = ''; await veriYukle(); render(); },

    yeniDemirbas(id) {
      const d = id ? demirbaslar.find(x => x.id === id) || {} : {};
      const g = O.modalAc(id ? 'Demirbaş Düzenle' : 'Demirbaş Ekle', `
        <form id="dmb-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Ad *</label><input name="ad" required value="${O.kacir(d.ad || '')}" placeholder="MacBook Pro 14" /></div>
            <div class="form-group"><label>Kategori</label><input name="kategori" value="${O.kacir(d.kategori || '')}" placeholder="Bilgisayar" list="dmb-kat-list" />
              <datalist id="dmb-kat-list">${[...new Set(demirbaslar.map(x => x.kategori).filter(Boolean))].map(k => `<option value="${O.kacir(k)}">`).join('')}</datalist></div>
            <div class="form-group"><label>Marka</label><input name="marka" value="${O.kacir(d.marka || '')}" /></div>
            <div class="form-group"><label>Model</label><input name="model" value="${O.kacir(d.model || '')}" /></div>
            <div class="form-group"><label>Seri No</label><input name="seri_no" value="${O.kacir(d.seri_no || '')}" /></div>
            <div class="form-group"><label>Lokasyon</label><input name="lokasyon" value="${O.kacir(d.lokasyon || '')}" placeholder="Merkez Ofis" /></div>
            <div class="form-group"><label>Alış Tarihi</label><input type="date" name="alis_tarihi" value="${d.alis_tarihi || ''}" /></div>
            <div class="form-group"><label>Alış Bedeli (₺)</label><input type="number" step="0.01" name="alis_bedeli" value="${d.alis_bedeli || ''}" /></div>
            <div class="form-group"><label>Garanti Bitiş</label><input type="date" name="garanti_bitis" value="${d.garanti_bitis || ''}" /></div>
            ${id ? `<div class="form-group"><label>Durum</label><select name="durum">${O.enumSecenek(DURUM, d.durum)}</select></div>` : ''}
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2">${O.kacir(d.notlar || '')}</textarea></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`, true);

      g.querySelector('#dmb-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['alis_bedeli']);
        try {
          const s = id ? await O.api(`/demirbas/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
                       : await O.api('/demirbas', { method: 'POST', body: JSON.stringify(veri) });
          if (!s) {
            if (id) Object.assign(demirbaslar.find(x => x.id === id), veri);
            else demirbaslar.push({ id: Date.now(), kod: `DMB-${String(demirbaslar.length + 1).padStart(4, '0')}`, durum: 'depoda', garanti_aktif: !!veri.garanti_bitis, zimmet_id: null, zimmetli_personel: null, ...veri });
            ozet = demoOzet();
          } else await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async zimmetVer(demirbasId) {
      const pers = await O.personeller();
      const uygun = demirbaslar.filter(d => !d.zimmet_id && ['depoda', 'bakimda'].includes(d.durum));
      const g = O.modalAc('Zimmet Ver', `
        <form id="dmb-zimmet-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Demirbaş *</label><select name="demirbas_id" required>
              <option value="">Seçiniz</option>
              ${uygun.map(d => `<option value="${d.id}" ${d.id === demirbasId ? 'selected' : ''}>${O.kacir(d.kod)} — ${O.kacir(d.ad)}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Personel *</label><select name="personel_id" required>
              <option value="">Seçiniz</option>${O.secenekler(pers, '', 'id', 'adSoyad')}</select></div>
            <div class="form-group"><label>Veriliş Tarihi *</label><input type="date" name="veris_tarihi" required value="${O.bugun()}" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2" placeholder="Teslim edilen aksesuarlar, durum tespiti..."></textarea></div>
          ${uygun.length ? '' : '<div class="hata-mesaji" style="margin-top:0">Zimmetlenebilir demirbaş yok.</div>'}
          ${O.formHata()}${O.modalFooter('Zimmetle')}
        </form>`);

      g.querySelector('#dmb-zimmet-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['demirbas_id', 'personel_id']);
        try {
          const s = await O.api('/demirbas/zimmet', { method: 'POST', body: JSON.stringify(veri) });
          if (!s) {
            const d = demirbaslar.find(x => x.id === veri.demirbas_id);
            const p = pers.find(x => x.id === veri.personel_id);
            const zid = Date.now();
            zimmetler.unshift({ id: zid, demirbas_id: d.id, demirbas_kod: d.kod, demirbas_ad: d.ad, kategori: d.kategori, personel_id: p.id, personel_ad: p.adSoyad, departman: p.departman_ad, veris_tarihi: veri.veris_tarihi, iade_tarihi: null, gun_sayisi: 0, aktif: true });
            Object.assign(d, { durum: 'zimmetli', zimmet_id: zid, zimmetli_personel_id: p.id, zimmetli_personel: p.adSoyad, zimmet_tarihi: veri.veris_tarihi });
            ozet = demoOzet();
          } else await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async iadeAl(zimmetId) {
      const z = zimmetler.find(x => x.id === zimmetId);
      const g = O.modalAc('İade Al', `
        <form id="dmb-iade-form" class="modal-form">
          <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px">
            <strong>${O.kacir(z ? z.demirbas_ad : '')}</strong> — ${O.kacir(z ? z.personel_ad : '')}
          </p>
          <div class="form-grid-2">
            <div class="form-group"><label>İade Tarihi *</label><input type="date" name="iade_tarihi" required value="${O.bugun()}" /></div>
            <div class="form-group"><label>İade Sonrası Durum</label><select name="durum">
              ${O.enumSecenek({ depoda: 'Depoda', bakimda: 'Bakımda', hurda: 'Hurda', kayip: 'Kayıp' }, 'depoda')}</select></div>
          </div>
          <div class="form-group"><label>İade Notu</label><textarea name="notlar" rows="2" placeholder="Cihazın durumu, eksik aksesuar..."></textarea></div>
          ${O.formHata()}${O.modalFooter('İade Al')}
        </form>`);

      g.querySelector('#dmb-iade-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target);
        try {
          const s = await O.api(`/demirbas/zimmet/${zimmetId}/iade`, { method: 'POST', body: JSON.stringify(veri) });
          if (!s) {
            z.aktif = false; z.iade_tarihi = veri.iade_tarihi;
            const d = demirbaslar.find(x => x.id === z.demirbas_id);
            if (d) Object.assign(d, { durum: veri.durum, zimmet_id: null, zimmetli_personel: null, zimmetli_personel_id: null, zimmet_tarihi: null });
            ozet = demoOzet();
          } else await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async detay(id) {
      const d = await O.api(`/demirbas/${id}`) || (() => {
        const x = demirbaslar.find(k => k.id === id);
        return { ...x, gecmis: zimmetler.filter(z => z.demirbas_id === id) };
      })();
      O.modalAc(`${d.kod} — ${d.ad}`, `
        <div class="detay-grid">
          <div class="detay-satir"><span>Kategori</span><strong>${O.kacir(d.kategori || '—')}</strong></div>
          <div class="detay-satir"><span>Durum</span>${O.rozet(DURUM[d.durum] || d.durum, DURUM_RENK[d.durum] || '#6B7280')}</div>
          <div class="detay-satir"><span>Marka</span><strong>${O.kacir(d.marka || '—')}</strong></div>
          <div class="detay-satir"><span>Model</span><strong>${O.kacir(d.model || '—')}</strong></div>
          <div class="detay-satir"><span>Seri No</span><strong>${O.kacir(d.seri_no || '—')}</strong></div>
          <div class="detay-satir"><span>Lokasyon</span><strong>${O.kacir(d.lokasyon || '—')}</strong></div>
          <div class="detay-satir"><span>Alış Tarihi</span><strong>${O.tarih(d.alis_tarihi)}</strong></div>
          <div class="detay-satir"><span>Alış Bedeli</span><strong>${O.tl(d.alis_bedeli)}</strong></div>
          <div class="detay-satir"><span>Garanti Bitiş</span><strong>${O.tarih(d.garanti_bitis)} ${d.garanti_aktif ? '<span style="color:#16A34A">(aktif)</span>' : ''}</strong></div>
          <div class="detay-satir"><span>Şu an</span><strong>${d.zimmetli_personel ? O.kacir(d.zimmetli_personel) : 'Zimmetli değil'}</strong></div>
          ${d.notlar ? `<div class="detay-satir detay-tam"><span>Notlar</span><strong>${O.kacir(d.notlar)}</strong></div>` : ''}
        </div>
        <div class="panel-header" style="margin-top:16px">Zimmet Geçmişi</div>
        <table class="personel-tablo idari-tablo"><tbody>
          ${(d.gecmis || []).length ? d.gecmis.map(z => `<tr>
            <td><strong>${O.kacir(z.personel_ad)}</strong><span class="hucre-alt">${O.kacir(z.departman || '')}</span></td>
            <td>${O.tarih(z.veris_tarihi)} → ${z.iade_tarihi ? O.tarih(z.iade_tarihi) : 'devam ediyor'}</td>
            <td>${z.gun_sayisi} gün</td>
          </tr>`).join('') : O.bosSatir('Zimmet geçmişi yok', 3)}
        </tbody></table>
        <div class="modal-footer"><button class="btn-iptal" onclick="Ortak.modalKapat()">Kapat</button></div>`, true);
    },
  };
})();
