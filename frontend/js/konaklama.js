// ─── Konaklama & Kiralık Evler Modülü ─────────────────────────────
const KonaklamaModul = (() => {
  const O = Ortak;
  let sekme = 'konutlar';
  let konutlar = [], kayitlar = [], giderler = [], ozet = null;
  let arama = '', filtreTur = '', filtreDurum = '', filtreOdeme = '', filtreKaynak = '';

  const TUR = {
    kiralik_daire: 'Kiralık Daire', lojman: 'Lojman', misafirhane: 'Misafirhane',
    santiye_barakasi: 'Şantiye Barakası', otel: 'Otel', kamp: 'Kamp',
  };
  // Kamp bedelini işveren karşıladığında şirkete gider yükü doğmaz
  const ODEME = { bykara: 'Bykara ödemeli', isveren: 'İşveren ödemeli' };
  const ODEME_RENK = { bykara: '#855900', isveren: '#00802F' };
  const DURUM = { aktif: 'Aktif', bos: 'Boş', pasif: 'Pasif' };
  const DURUM_RENK = { aktif: '#00802F', bos: '#656871', pasif: '#8C8C94' };
  const GIDER_TUR = {
    kira: 'Kira', elektrik: 'Elektrik', su: 'Su', dogalgaz: 'Doğalgaz',
    internet: 'İnternet', aidat: 'Aidat', tamir: 'Tamir', temizlik: 'Temizlik', diger: 'Diğer',
  };


  let otelOzeti = null;

  async function veriYukle() {
    const [kd, yd, gd, od] = await Promise.all([
      O.api('/konaklama/konutlar'), O.api('/konaklama/kayitlar?sadece_aktif=false'),
      O.api('/konaklama/giderler'), O.api('/konaklama/ozet'),
    ]);
    otelOzeti = await O.api('/konaklama/otel-ozeti').catch(() => null);
    konutlar = kd.veriler; kayitlar = yd.veriler; giderler = gd.veriler; ozet = od;
  }

  // Faturası gelmemiş otel konaklamalarının tahmini yükü
  function otelBekleyen() { return otelOzeti ? otelOzeti.bekleyen_tutar : 0; }

  // ---- Render ----
  function render() {
    const y = O.yonetici();
    const uyarilar = ozet.sozlesme_uyarilari || [];
    O.icerik(`
      ${O.statGrid([
        { label: 'Konut', deger: ozet.konut_sayisi, alt: `${ozet.toplam_kapasite} yatak kapasitesi` },
        { label: 'Doluluk', deger: `%${ozet.doluluk_yuzde}`, alt: `${ozet.dolu_yatak} dolu / ${ozet.bos_yatak} boş`, renk: ozet.doluluk_yuzde >= 90 ? '#DB0000' : '#00802F' },
        { label: 'Aylık Kira', deger: O.tl(ozet.aylik_kira_toplam), alt: 'toplam yükümlülük', renk: '#006CE0' },
        { label: 'Ödenmemiş Gider', deger: O.tl(ozet.odenmemis_gider_tutar + otelBekleyen()), alt: `konut ${O.tl(ozet.odenmemis_gider_tutar)} · otel ${O.tl(otelBekleyen())}`, renk: (ozet.odenmemis_gider_sayisi || otelBekleyen()) ? '#855900' : '#00802F' },
      ])}

      ${uyarilar.length ? `<div class="panel uyari-panel">
        <div class="panel-header">Sözleşme Bitiş Uyarıları</div>
        ${uyarilar.map(u => `<div class="uyari-satir">
          <span class="uyari-ad">${O.kacir(u.ad)}</span>
          <span style="color:var(--gray-400);font-size:12px">${O.kacir(u.kod)}</span>
          <span class="uyari-alt">${O.tarih(u.bitis)} · ${O.kalanRozet(u.kalan_gun)}</span>
        </div>`).join('')}
      </div>` : ''}

      ${O.sekmeler('knk-tabs', [
        { key: 'konutlar', ad: 'Kiralık Evler', rozet: konutlar.filter(k => !k.kamp_mi && !k.otel_mi).length },
        { key: 'kamplar', ad: 'Kamplar', rozet: konutlar.filter(k => k.kamp_mi).length },
        { key: 'oteller', ad: 'Otel', rozet: konutlar.filter(k => k.otel_mi).length },
        { key: 'sakinler', ad: 'Yerleşim', rozet: kayitlar.filter(k => k.aktif).length },
        { key: 'giderler', ad: 'Giderler', rozet: giderler.length + (otelOzeti ? otelOzeti.toplam_kayit : 0) },
      ], sekme)}

      <div id="knk-govde"></div>
    `);
    document.querySelectorAll('#knk-tabs .idari-tab').forEach(b => {
      b.onclick = () => { sekme = b.dataset.tab; render(); };
    });
    ({ konutlar: konutlarGovde, kamplar: kamplarGovde, oteller: otellerGovde, sakinler: sakinlerGovde, giderler: giderlerGovde })[sekme](y);
  }

  function konutlarGovde(y) {
    // Kamplar ayrı sekmede listelenir
    const liste = konutlar.filter(k => !k.kamp_mi && !k.otel_mi).filter(k =>
      (!arama || `${k.ad} ${k.kod} ${k.adres || ''} ${k.ev_sahibi_ad || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreTur || k.tur === filtreTur) && (!filtreDurum || k.durum === filtreDurum));

    document.getElementById('knk-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="knk-arama" placeholder="Konut, adres, ev sahibi ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="knk-tur" class="filtre-select"><option value="">Tüm Türler</option>${O.enumSecenek(TUR, filtreTur)}</select>
          <select id="knk-durum" class="filtre-select"><option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}</select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--gray-500)">${liste.length} konut</span>
          ${y ? `<button class="btn-yeni" onclick="KonaklamaModul.yeniKonut()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Konut Ekle</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Konut</th><th>Tür</th><th class="opsiyonel">Konum</th><th>Doluluk</th><th>Aylık Kira</th><th>Sözleşme</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(k => `
            <tr>
              <td><strong>${O.kacir(k.ad)}</strong><span class="hucre-alt">${O.kacir(k.kod)}${k.oda_sayisi ? ' · ' + O.kacir(k.oda_sayisi) : ''}</span></td>
              <td>${TUR[k.tur] || k.tur}</td>
              <td>${O.kacir(k.il || '—')}<span class="hucre-alt">${O.kacir(k.ilce || '')}</span></td>
              <td>${O.doluluk(k.doluluk_yuzde)} <span style="font-size:12px;color:var(--gray-600);margin-left:6px">${k.dolu}/${k.kapasite}</span></td>
              <td><strong>${O.tl(k.aylik_kira)}</strong></td>
              <td>${k.sozlesme_bitis ? O.kalanRozet(k.kalan_gun) : '<span style="color:var(--gray-400)">—</span>'}</td>
              <td class="islem-td">
                <button class="btn-ikon" title="Detay" onclick="KonaklamaModul.detay(${k.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg></button>
                ${y ? `<button class="btn-ikon" title="Düzenle" onclick="KonaklamaModul.yeniKonut(${k.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>
                <button class="btn-ikon btn-sil" title="Pasife al" onclick="KonaklamaModul.konutSil(${k.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Konut kaydı yok', 7)}
          </tbody>
        </table>
      </div>`;

    document.getElementById('knk-arama').oninput = e => { arama = e.target.value; konutlarGovde(y); };
    document.getElementById('knk-tur').onchange = e => { filtreTur = e.target.value; konutlarGovde(y); };
    document.getElementById('knk-durum').onchange = e => { filtreDurum = e.target.value; konutlarGovde(y); };
  }

  // Kamplar mavi yaka konaklamasıdır; kiralık evlerden farklı olarak
  // bir kısmının bedelini işveren karşılar, kira takibi yapılmaz.
  function kamplarGovde(y) {
    const liste = konutlar.filter(k => k.kamp_mi).filter(k =>
      (!arama || `${k.ad} ${k.kod} ${k.adres || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreOdeme || k.odeme_sorumlusu === filtreOdeme) &&
      (!filtreDurum || k.durum === filtreDurum));

    const kapasite = liste.reduce((t, k) => t + (k.kapasite || 0), 0);
    const dolu = liste.reduce((t, k) => t + (k.dolu || 0), 0);
    const bykara = liste.filter(k => k.odeme_sorumlusu === 'bykara');
    const isveren = liste.filter(k => k.odeme_sorumlusu === 'isveren');

    document.getElementById('knk-govde').innerHTML = `
      ${O.statGrid([
        { label: 'Kamp', deger: liste.length, alt: `${kapasite} yatak kapasitesi` },
        { label: 'Doluluk', deger: `%${kapasite ? Math.round(dolu / kapasite * 100) : 0}`,
          alt: `${dolu} dolu / ${Math.max(kapasite - dolu, 0)} boş`, renk: '#006CE0' },
        { label: 'İşveren ödemeli', deger: isveren.length,
          alt: `${isveren.reduce((t, k) => t + (k.kapasite || 0), 0)} yatak`, renk: '#00802F' },
        { label: 'Bykara ödemeli', deger: bykara.length,
          alt: `${bykara.reduce((t, k) => t + (k.kapasite || 0), 0)} yatak`, renk: '#855900' },
      ])}

      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="kmp-arama" placeholder="Kamp adı, kod, adres ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="kmp-odeme" class="filtre-select">
            <option value="">Tüm Ödemeler</option>${O.enumSecenek(ODEME, filtreOdeme)}
          </select>
          <select id="kmp-durum" class="filtre-select">
            <option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}
          </select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--text-3)">${liste.length} kamp</span>
          ${y ? `<button class="btn-yeni" onclick="KonaklamaModul.yeniKonut(null, 'kamp')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Kamp Ekle</button>` : ''}
        </div>
      </div>

      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Kamp</th><th>Ödeme</th><th class="opsiyonel">Konum</th><th>Doluluk</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(k => `
            <tr>
              <td><strong>${O.kacir(k.ad)}</strong><span class="hucre-alt">${O.kacir(k.kod)}</span></td>
              <td>${O.rozet(ODEME[k.odeme_sorumlusu] || '—', ODEME_RENK[k.odeme_sorumlusu] || '#656871')}</td>
              <td>${O.kacir(k.il || '—')}<span class="hucre-alt">${O.kacir(k.ilce || '')}</span></td>
              <td>${O.doluluk(k.doluluk_yuzde)} <span style="font-size:12px;color:var(--text-2);margin-left:6px">${k.dolu}/${k.kapasite}</span></td>
              <td>${O.rozet(DURUM[k.durum] || k.durum, DURUM_RENK[k.durum] || '#656871')}</td>
              <td class="islem-td">
                ${y ? `<button class="btn-mini" onclick="KonaklamaModul.yeniKonut(${k.id})">Düzenle</button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Kamp bulunamadı', 6)}
          </tbody>
        </table>
      </div>`;

    const ara = document.getElementById('kmp-arama');
    ara.oninput = e => { arama = e.target.value; kamplarGovde(y); ara.focus(); };
    document.getElementById('kmp-odeme').onchange = e => { filtreOdeme = e.target.value; kamplarGovde(y); };
    document.getElementById('kmp-durum').onchange = e => { filtreDurum = e.target.value; kamplarGovde(y); };
  }

  // Otel konaklaması geçicidir: işe giriş sürecinde ve kiralık ev
  // bulunana kadar kullanılır. Kira yerine gecelik ücret takip edilir.
  function otellerGovde(y) {
    const liste = konutlar.filter(k => k.otel_mi).filter(k =>
      (!arama || `${k.ad} ${k.kod} ${k.adres || ''}`.toLowerCase().includes(arama.toLowerCase())) &&
      (!filtreDurum || k.durum === filtreDurum));

    const kapasite = liste.reduce((t, k) => t + (k.kapasite || 0), 0);
    const dolu = liste.reduce((t, k) => t + (k.dolu || 0), 0);
    const gunlukMaliyet = liste.reduce((t, k) => t + (k.gecelik_ucret || 0) * (k.dolu || 0), 0);

    document.getElementById('knk-govde').innerHTML = `
      ${O.statGrid([
        { label: 'Otel', deger: liste.length, alt: `${kapasite} yatak kapasitesi` },
        { label: 'Kalan Kişi', deger: dolu, alt: 'şu an otelde', renk: '#006CE0' },
        { label: 'Günlük Maliyet', deger: O.tl(gunlukMaliyet), alt: 'konaklayanlar için', renk: '#855900' },
        { label: 'Aylık Tahmini', deger: O.tl(gunlukMaliyet * 30), alt: '30 gün üzerinden', renk: '#855900' },
      ])}

      <div class="pano-bilgi-serit">
        Otel konaklaması geçicidir — işe giriş sürecinde ve kiralık ev bulunana kadar sağlanır.
        Uzun süre otelde kalan personel için kalıcı konaklama planlanmalıdır.
      </div>

      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="otl-arama" placeholder="Otel adı, kod, adres ara..." value="${O.kacir(arama)}" />
          </div>
          <select id="otl-durum" class="filtre-select">
            <option value="">Tüm Durumlar</option>${O.enumSecenek(DURUM, filtreDurum)}
          </select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:13px;color:var(--text-3)">${liste.length} otel</span>
          ${y ? `<button class="btn-yeni" onclick="KonaklamaModul.yeniKonut(null, 'otel')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Otel Ekle</button>` : ''}
        </div>
      </div>

      <div class="panel" style="overflow-x:auto;margin-bottom:var(--sp-m)">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Otel</th><th class="opsiyonel">Konum</th><th>Doluluk</th><th>Gecelik</th><th>Günlük Maliyet</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(k => `
            <tr>
              <td><strong>${O.kacir(k.ad)}</strong><span class="hucre-alt">${O.kacir(k.kod)}</span></td>
              <td>${O.kacir(k.il || '—')}<span class="hucre-alt">${O.kacir(k.ilce || '')}</span></td>
              <td>${O.doluluk(k.doluluk_yuzde)} <span style="font-size:12px;color:var(--text-2);margin-left:6px">${k.dolu}/${k.kapasite}</span></td>
              <td>${O.tl(k.gecelik_ucret)}</td>
              <td><strong>${O.tl((k.gecelik_ucret || 0) * (k.dolu || 0))}</strong></td>
              <td>${O.rozet(DURUM[k.durum] || k.durum, DURUM_RENK[k.durum] || '#656871')}</td>
              <td class="islem-td">
                ${y ? `<button class="btn-mini" onclick="KonaklamaModul.yeniKonut(${k.id})">Düzenle</button>` : ''}
              </td>
            </tr>`).join('') : O.bosSatir('Otel kaydı yok', 7)}
          </tbody>
        </table>
      </div>

      ${otelDokumu(y)}`;

    const ara = document.getElementById('otl-arama');
    ara.oninput = e => { arama = e.target.value; otellerGovde(y); ara.focus(); };
    document.getElementById('otl-durum').onchange = e => { filtreDurum = e.target.value; otellerGovde(y); };
  }

  // Kişi bazlı konaklama dökümü: kim, hangi oda, kaç gece, ne kadar.
  // Fatura kesilmemiş kayıtlarda gecelik ücretten tahmin gösterilir.
  const UZUN_KONAKLAMA = 30;   // bu geceden fazlası kalıcı konaklama gerektirir

  function otelDokumu(y) {
    if (!otelOzeti || !otelOzeti.veriler.length) return '';
    const o = otelOzeti;

    return `
      <div class="panel otel-dokum">
        <div class="pano-container-bas">
          <h3>Konaklama Dökümü</h3>
          <p>${o.toplam_kayit} kayıt · ${o.toplam_gece} gece ·
             faturalanan ${O.tl(o.faturalanan_tutar)} ·
             bekleyen ${O.tl(o.bekleyen_tutar)}</p>
        </div>
        <div style="overflow-x:auto">
          <table class="personel-tablo idari-tablo dokum-tablo">
            <thead><tr>
              <th>Personel</th>
              <th>Konaklama</th>
              <th class="sayi">Gece</th>
              <th class="sayi">Gecelik</th>
              <th class="sayi">Tutar</th>
              <th>Fatura</th>
              <th class="islem">İşlem</th>
            </tr></thead>
            <tbody>${o.veriler.map(k => dokumSatiri(k, y)).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  function dokumSatiri(k, y) {
    const uzun = k.gece_sayisi > UZUN_KONAKLAMA;
    const devam = !k.cikis_tarihi;

    // Otel, oda ve pansiyon tek satırda; tarih aralığı altına iner.
    // Pansiyon kişiye değil konaklamaya ait olduğu için ad sütununda durmuyor.
    const yer = [
      O.kacir(k.konut_ad || '—'),
      k.oda_no ? `Oda ${O.kacir(k.oda_no)}` : '',
      k.pansiyon ? O.kacir(k.pansiyon) : ''
    ].filter(Boolean).join(' · ');
    const aralik = devam
      ? `${O.tarih(k.giris_tarihi)} — devam ediyor`
      : `${O.tarih(k.giris_tarihi)} — ${O.tarih(k.cikis_tarihi)}`;

    return `
      <tr>
        <td>
          <strong>${O.kacir(k.personel_ad || '—')}</strong>
        </td>
        <td>
          ${yer}
          <span class="hucre-alt">${aralik}</span>
        </td>
        <td class="sayi">
          <strong${uzun ? ' class="uyari-sayi"' : ''}>${k.gece_sayisi}</strong>
        </td>
        <td class="sayi">${O.tl(k.gecelik_ucret)}</td>
        <td class="sayi" title="Net ${O.tl(k.net_tutar)} · KDV ${O.tl(k.kdv)} · Konaklama vergisi ${O.tl(k.konaklama_vergisi)}">
          <strong>${O.tl(k.tutar)}</strong>
        </td>
        <td>
          ${k.faturalandi
            ? `<span class="fatura-no">${O.kacir(k.fatura_no)}</span>
               <span class="hucre-alt">${O.tarih(k.fatura_tarihi)}</span>`
            : O.rozet('bekliyor', '#855900')}
        </td>
        <td class="islem">
          ${y && !k.faturalandi
            ? `<button class="btn-mini" onclick="KonaklamaModul.faturaAc(${k.id})">Fatura işle</button>`
            : ''}
        </td>
      </tr>`;
  }

  function sakinlerGovde(y) {
    const aktifler = kayitlar.filter(k => k.aktif);
    const gecmis = kayitlar.filter(k => !k.aktif);
    document.getElementById('knk-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup"><span style="font-size:13px;color:var(--gray-500)">${aktifler.length} aktif yerleşim · ${gecmis.length} geçmiş kayıt</span></div>
        <div class="toolbar-sagda">
          ${y ? `<button class="btn-yeni" onclick="KonaklamaModul.yeniKayit()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Yerleşim Ekle</button>` : ''}
        </div>
      </div>
      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo">
          <thead><tr><th>Personel</th><th>Konut</th><th>Oda</th><th>Giriş</th><th>Süre</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${kayitlar.length ? kayitlar.map(k => `
            <tr style="${k.aktif ? '' : 'opacity:.55'}">
              <td><strong>${O.kacir(k.personel_ad || '—')}</strong><span class="hucre-alt">${O.kacir(k.departman || '')}</span></td>
              <td>${O.kacir(k.konut_ad || '—')}<span class="hucre-alt">${O.kacir(k.konut_kod || '')}</span></td>
              <td>${O.kacir(k.oda_no || '—')}</td>
              <td>${O.tarih(k.giris_tarihi)}</td>
              <td>${k.gun_sayisi} gün</td>
              <td>${k.aktif ? O.rozet('Kalıyor', '#00802F') : O.rozet('Çıkış: ' + O.tarih(k.cikis_tarihi), '#8C8C94')}</td>
              <td class="islem-td">${y && k.aktif ? `<button class="btn-mini" onclick="KonaklamaModul.cikisYap(${k.id})">Çıkış Ver</button>` : ''}</td>
            </tr>`).join('') : O.bosSatir('Yerleşim kaydı yok', 7)}
          </tbody>
        </table>
      </div>`;
  }

  // Otel konaklamaları da şirketin gider yükü; tek listede birleşiyorlar.
  // Konut gideri ay bazlı bir kayıt, otel gideri kişi bazlı bir konaklama —
  // ortak alanlara (yer / tür / dönem / tutar / durum) indirgeniyorlar.
  function otelGiderleri() {
    if (!otelOzeti) return [];
    return otelOzeti.veriler.map(k => ({
      kaynak: 'otel',
      id: k.id,
      yer: k.konut_ad || '—',
      alt: [k.personel_ad, k.oda_no ? `Oda ${k.oda_no}` : ''].filter(Boolean).join(' · '),
      tur: `Otel · ${k.gece_sayisi} gece`,
      donem: donemAraligi(k.giris_tarihi, k.cikis_tarihi),
      sira: k.giris_tarihi || '',
      tutar: k.tutar,
      odendi: k.faturalandi,
      durum: k.faturalandi
        ? O.rozet('Faturalandı', '#00802F')
        : O.rozet('Tahmini', '#006CE0'),
    }));
  }

  function konutGiderleri() {
    return giderler.map(g => ({
      kaynak: 'konut',
      id: g.id,
      yer: g.konut_ad || '—',
      alt: [g.konut_kod, g.aciklama].filter(Boolean).join(' · '),
      tur: GIDER_TUR[g.tur] || g.tur,
      donem: `${String(g.ay).padStart(2, '0')}/${g.yil}`,
      sira: `${g.yil}-${String(g.ay).padStart(2, '0')}-01`,
      tutar: g.tutar,
      odendi: g.odendi,
      durum: g.odendi
        ? O.rozet('Ödendi ' + O.tarih(g.odeme_tarihi), '#00802F')
        : O.rozet('Bekliyor', '#855900'),
    }));
  }

  // Otel konaklaması iki aya taşabildiği için dönem tek ay olmayabilir
  function donemAraligi(giris, cikis) {
    const ay = t => t ? `${t.slice(5, 7)}/${t.slice(0, 4)}` : '';
    const b = ay(giris);
    const e = cikis ? ay(cikis) : '';
    if (!e) return `${b} —`;
    return b === e ? b : `${b} — ${e}`;
  }

  function giderlerGovde(y) {
    const hepsi = [...konutGiderleri(), ...otelGiderleri()]
      .sort((a, b) => b.sira.localeCompare(a.sira));
    const liste = filtreKaynak ? hepsi.filter(g => g.kaynak === filtreKaynak) : hepsi;

    const topla = (dizi, kosul = () => true) =>
      dizi.filter(kosul).reduce((t, g) => t + Number(g.tutar), 0);
    const konutT = topla(hepsi, g => g.kaynak === 'konut');
    const otelT = topla(hepsi, g => g.kaynak === 'otel');
    const bekleyen = topla(hepsi, g => !g.odendi);

    document.getElementById('knk-govde').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <select id="knk-gider-kaynak" class="filtre-select">
            <option value="">Tüm Giderler (${hepsi.length})</option>
            <option value="konut" ${filtreKaynak === 'konut' ? 'selected' : ''}>Konut Giderleri (${hepsi.filter(g => g.kaynak === 'konut').length})</option>
            <option value="otel" ${filtreKaynak === 'otel' ? 'selected' : ''}>Otel Konaklama (${hepsi.filter(g => g.kaynak === 'otel').length})</option>
          </select>
        </div>
        <div class="toolbar-sagda">
          ${y ? `<button class="btn-yeni" onclick="KonaklamaModul.yeniGider()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Gider Ekle</button>` : ''}
        </div>
      </div>

      <div class="gider-ozet">
        <span>Konut gideri <strong>${O.tl(konutT)}</strong></span>
        <span>Otel konaklama <strong>${O.tl(otelT)}</strong></span>
        <span class="gider-ozet-toplam">Toplam <strong>${O.tl(konutT + otelT)}</strong></span>
        <span>Ödenmemiş / faturasız <strong class="uyari-sayi">${O.tl(bekleyen)}</strong></span>
      </div>

      <div class="panel" style="overflow-x:auto">
        <table class="personel-tablo idari-tablo gider-tablo">
          <thead><tr><th>Yer</th><th>Gider Türü</th><th>Dönem</th><th class="sayi">Tutar</th><th>Durum</th><th class="islem">İşlemler</th></tr></thead>
          <tbody>${liste.length ? liste.map(g => `
            <tr>
              <td>
                <strong>${O.kacir(g.yer)}</strong>
                ${g.alt ? `<span class="hucre-alt">${O.kacir(g.alt)}</span>` : ''}
              </td>
              <td>${O.kacir(g.tur)}</td>
              <td>${g.donem}</td>
              <td class="sayi"><strong>${O.tlTam(g.tutar)}</strong></td>
              <td>${g.durum}</td>
              <td class="islem">
                <div class="islem-grup">${giderIslem(g, y)}</div>
              </td>
            </tr>`).join('') : O.bosSatir('Gider kaydı yok', 6)}
          </tbody>
        </table>
      </div>`;

    const sec = document.getElementById('knk-gider-kaynak');
    if (sec) sec.onchange = () => { filtreKaynak = sec.value; giderlerGovde(y); };
  }

  function giderIslem(g, y) {
    if (!y) return '';
    if (g.kaynak === 'otel') {
      return g.odendi ? '' : `<button class="btn-mini" onclick="KonaklamaModul.faturaAc(${g.id})">Fatura işle</button>`;
    }
    return `
      ${!g.odendi ? `<button class="btn-mini onay" onclick="KonaklamaModul.giderOde(${g.id})">Ödendi İşaretle</button>` : ''}
      <button class="btn-ikon btn-sil" title="Sil" onclick="KonaklamaModul.giderSil(${g.id})"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></button>`;
  }

  async function yenile() { await veriYukle(); render(); }

  return {
    async yukle() { arama = ''; filtreTur = ''; filtreDurum = ''; await veriYukle(); render(); },

    // varsayilanTur: kamplar sekmesinden açılınca tür önceden seçili gelir
    yeniKonut(id, varsayilanTur) {
      const k = id ? konutlar.find(x => x.id === id) || {} : {};
      const tur = k.tur || (typeof id === 'string' ? id : varsayilanTur) || 'kiralik_daire';
      const kampMi = tur === 'kamp';
      const otelMi = tur === 'otel';
      const alan = (ad, etiket, tip = 'text', deger = '') =>
        `<div class="form-group"><label>${etiket}</label><input name="${ad}" type="${tip}" value="${O.kacir(deger ?? '')}" ${tip === 'number' ? 'step="0.01"' : ''} /></div>`;
      const tip = kampMi ? 'Kamp' : otelMi ? 'Otel' : 'Konut';
      const baslik = `${tip} ${id ? 'Düzenle' : 'Ekle'}`;
      const g = O.modalAc(baslik, `
        <form id="knk-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>${tip} Adı *</label>
              <input name="ad" required value="${O.kacir(k.ad || '')}"
                     placeholder="${kampMi ? 'Wesna Kamp' : otelMi ? 'Şehir Otel' : 'Merkez Lojman A Blok'}" /></div>
            <div class="form-group"><label>Tür</label>
              <select name="tur" id="knk-tur-sec">${O.enumSecenek(TUR, tur)}</select></div>
            <div class="form-group" id="knk-odeme-grup"><label>Ödemeyi kim yapıyor</label>
              <select name="odeme_sorumlusu">${O.enumSecenek(ODEME, k.odeme_sorumlusu || 'bykara')}</select>
              <span class="hucre-alt">İşveren ödemeli kamplarda şirkete gider yükü doğmaz.</span></div>
            ${alan('il', 'İl', 'text', k.il)}
            ${alan('ilce', 'İlçe', 'text', k.ilce)}
            ${alan('kapasite', 'Yatak Kapasitesi', 'number', k.kapasite ?? 1)}
            <div class="form-group" id="knk-gecelik-grup"><label>Gecelik Ücret (₺)</label>
              <input name="gecelik_ucret" type="number" step="0.01" value="${O.kacir(k.gecelik_ucret ?? 0)}" />
              <span class="hucre-alt">Otel konaklamasında kişi başı gecelik tutar.</span></div>
            <div id="knk-kira-alanlari" class="form-grid-2" style="display:contents">
              ${alan('oda_sayisi', 'Oda Sayısı', 'text', k.oda_sayisi)}
              ${alan('aylik_kira', 'Aylık Kira (₺)', 'number', k.aylik_kira)}
              ${alan('depozito', 'Depozito (₺)', 'number', k.depozito)}
              ${alan('aidat', 'Aidat (₺)', 'number', k.aidat)}
              ${alan('ev_sahibi_ad', 'Ev Sahibi', 'text', k.ev_sahibi_ad)}
              ${alan('ev_sahibi_telefon', 'Ev Sahibi Telefon', 'text', k.ev_sahibi_telefon)}
              ${alan('ev_sahibi_iban', 'IBAN', 'text', k.ev_sahibi_iban)}
            </div>
            ${alan('sozlesme_baslangic', 'Sözleşme Başlangıç', 'date', k.sozlesme_baslangic)}
            ${alan('sozlesme_bitis', 'Sözleşme Bitiş', 'date', k.sozlesme_bitis)}
            ${id ? `<div class="form-group"><label>Durum</label><select name="durum">${O.enumSecenek(DURUM, k.durum)}</select></div>` : ''}
          </div>
          <div class="form-group"><label>Adres</label><textarea name="adres" rows="2">${O.kacir(k.adres || '')}</textarea></div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2">${O.kacir(k.notlar || '')}</textarea></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`, true);

      // Kamplarda kira, depozito ve ev sahibi bilgisi tutulmaz
      const turSec = g.querySelector('#knk-tur-sec');
      const kiraAlanlari = g.querySelector('#knk-kira-alanlari');
      const odemeGrup = g.querySelector('#knk-odeme-grup');
      const gecelikGrup = g.querySelector('#knk-gecelik-grup');
      const alanlariAyarla = () => {
        const kamp = turSec.value === 'kamp';
        const otel = turSec.value === 'otel';
        // Kamplarda ve otellerde kira/ev sahibi bilgisi tutulmaz
        kiraAlanlari.style.display = (kamp || otel) ? 'none' : 'contents';
        odemeGrup.style.display = kamp ? '' : 'none';
        gecelikGrup.style.display = otel ? '' : 'none';
      };
      turSec.addEventListener('change', alanlariAyarla);
      alanlariAyarla();

      g.querySelector('#knk-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['kapasite', 'aylik_kira', 'depozito', 'aidat']);
        try {
          const sonuc = id
            ? await O.api(`/konaklama/konutlar/${id}`, { method: 'PUT', body: JSON.stringify(veri) })
            : await O.api('/konaklama/konutlar', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async detay(id) {
      const d = await O.api(`/konaklama/konutlar/${id}`) || (() => {
        const k = konutlar.find(x => x.id === id);
        return { ...k, sakinler: kayitlar.filter(y => y.konut_id === id && y.aktif), giderler: giderler.filter(g => g.konut_id === id) };
      })();
      O.modalAc(d.ad, `
        <div class="detay-grid">
          <div class="detay-satir"><span>Kod</span><strong>${O.kacir(d.kod)}</strong></div>
          <div class="detay-satir"><span>Tür</span><strong>${TUR[d.tur] || d.tur}</strong></div>
          <div class="detay-satir"><span>Konum</span><strong>${O.kacir(d.il || '—')} / ${O.kacir(d.ilce || '—')}</strong></div>
          <div class="detay-satir"><span>Oda</span><strong>${O.kacir(d.oda_sayisi || '—')}</strong></div>
          <div class="detay-satir"><span>Doluluk</span><strong>${d.dolu}/${d.kapasite} yatak (%${d.doluluk_yuzde})</strong></div>
          <div class="detay-satir"><span>Aylık Kira</span><strong>${O.tl(d.aylik_kira)}</strong></div>
          <div class="detay-satir"><span>Depozito</span><strong>${O.tl(d.depozito)}</strong></div>
          <div class="detay-satir"><span>Aidat</span><strong>${O.tl(d.aidat)}</strong></div>
          <div class="detay-satir"><span>Ev Sahibi</span><strong>${O.kacir(d.ev_sahibi_ad || '—')}</strong></div>
          <div class="detay-satir"><span>Telefon</span><strong>${O.kacir(d.ev_sahibi_telefon || '—')}</strong></div>
          <div class="detay-satir detay-tam"><span>IBAN</span><strong>${O.kacir(d.ev_sahibi_iban || '—')}</strong></div>
          <div class="detay-satir"><span>Sözleşme</span><strong>${O.tarih(d.sozlesme_baslangic)} → ${O.tarih(d.sozlesme_bitis)}</strong></div>
          <div class="detay-satir"><span>Kalan</span><strong>${d.kalan_gun !== null && d.kalan_gun !== undefined ? d.kalan_gun + ' gün' : '—'}</strong></div>
          ${d.adres ? `<div class="detay-satir detay-tam"><span>Adres</span><strong>${O.kacir(d.adres)}</strong></div>` : ''}
        </div>
        <div class="panel-header" style="margin-top:16px">Kalanlar (${(d.sakinler || []).length})</div>
        <table class="personel-tablo idari-tablo"><tbody>
          ${(d.sakinler || []).length ? d.sakinler.map(s => `<tr>
            <td><strong>${O.kacir(s.personel_ad)}</strong><span class="hucre-alt">${O.kacir(s.departman || '')}</span></td>
            <td>Oda ${O.kacir(s.oda_no || '—')}</td><td>${O.tarih(s.giris_tarihi)}</td><td>${s.gun_sayisi} gün</td>
          </tr>`).join('') : O.bosSatir('Boş', 4)}
        </tbody></table>
        <div class="modal-footer"><button class="btn-iptal" onclick="Ortak.modalKapat()">Kapat</button></div>`, true);
    },

    async konutSil(id) {
      const k = konutlar.find(x => x.id === id);
      if (!confirm(`"${k.ad}" pasife alınsın mı?`)) return;
      try {
        const s = await O.api(`/konaklama/konutlar/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async yeniKayit() {
      const [pers] = await Promise.all([O.personeller()]);
      const uygun = konutlar.filter(k => k.durum !== 'pasif' && k.bos_yatak > 0);
      const g = O.modalAc('Yerleşim Ekle', `
        <form id="knk-kayit-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Konut *</label><select name="konut_id" required>
              <option value="">Seçiniz</option>
              ${uygun.map(k => `<option value="${k.id}">${O.kacir(k.ad)} — ${k.bos_yatak} boş yatak</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Personel *</label><select name="personel_id" required>
              <option value="">Seçiniz</option>${O.secenekler(pers, '', 'id', 'adSoyad')}
            </select></div>
            <div class="form-group"><label>Giriş Tarihi *</label><input type="date" name="giris_tarihi" required value="${O.bugun()}" /></div>
            <div class="form-group"><label>Oda No</label><input name="oda_no" placeholder="1 / A-3" /></div>
          </div>
          <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2"></textarea></div>
          ${uygun.length ? '' : '<div class="hata-mesaji" style="margin-top:0">Boş yatağı olan konut yok.</div>'}
          ${O.formHata()}${O.modalFooter('Yerleştir')}
        </form>`);

      g.querySelector('#knk-kayit-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['konut_id', 'personel_id']);
        try {
          const s = await O.api('/konaklama/kayitlar', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
          // Yerleştirme yaka tipiyle uyuşmuyorsa kayıt yapılır ama uyarılır
          if (s && s.uyari) alert('Kayıt oluşturuldu.\n\nDikkat: ' + s.uyari);
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    // Otelden fatura geldiğinde gerçek tutarı işler; tahminle
    // arasındaki fark bildirilir.
    faturaAc(id) {
      const k = (otelOzeti && otelOzeti.veriler.find(x => x.id === id)) || null;
      if (!k) return;
      const g = O.modalAc(`Fatura İşle — ${k.personel_ad}`, `
        <form id="fat-form" class="modal-form">
          <div class="fatura-ozet">
            <div><span>Otel</span><strong>${O.kacir(k.konut_ad)}${k.oda_no ? ' · Oda ' + O.kacir(k.oda_no) : ''}</strong></div>
            <div><span>Konaklama</span><strong>${O.tarih(k.giris_tarihi)} – ${k.cikis_tarihi ? O.tarih(k.cikis_tarihi) : 'devam ediyor'}</strong></div>
            <div><span>Gece</span><strong>${k.gece_sayisi} gece × ${O.tl(k.gecelik_ucret)}</strong></div>
            <div><span>Tahmini tutar</span><strong style="color:var(--primary)">${O.tl(k.tahmini_tutar)}</strong></div>
          </div>
          <div class="form-grid-2">
            <div class="form-group"><label>Fatura No *</label>
              <input name="fatura_no" required placeholder="LDE2026000000215" /></div>
            <div class="form-group"><label>Fatura Tarihi *</label>
              <input type="date" name="fatura_tarihi" required value="${O.bugun()}" /></div>
          </div>
          <div class="form-group"><label>Fatura Tutarı (vergiler dahil) *</label>
            <input type="number" name="fatura_tutari" step="0.01" required value="${k.tahmini_tutar}" />
            <span class="hucre-alt">Faturadaki "Ödenecek Tutar" — KDV %10 ve konaklama vergisi %1 dahil.</span></div>
          ${O.formHata()}${O.modalFooter('Faturayı İşle')}
        </form>`);

      g.querySelector('#fat-form').onsubmit = async e => {
        e.preventDefault();
        try {
          const s = await O.api(`/konaklama/kayitlar/${id}/fatura`, {
            method: 'POST', body: JSON.stringify(O.formVeri(e.target, ['fatura_tutari'])),
          });
          await veriYukle();
          O.modalKapat(); render();
          const fark = s.tahminden_fark;
          alert(`Fatura işlendi: ${O.tl(s.tutar)}`
            + (fark ? `\n\nTahminden fark: ${fark > 0 ? '+' : ''}${O.tl(fark)}` : '\n\nTahmin tuttu.'));
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async cikisYap(id) {
      const kayit = kayitlar.find(x => x.id === id);
      if (!confirm(`${kayit.personel_ad} için çıkış kaydı oluşturulsun mu?`)) return;
      try {
        const s = await O.api(`/konaklama/kayitlar/${id}/cikis`, { method: 'POST', body: JSON.stringify({ cikis_tarihi: O.bugun() }) });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    yeniGider() {
      const simdi = new Date();
      const g = O.modalAc('Gider Ekle', `
        <form id="knk-gider-form" class="modal-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Konut *</label><select name="konut_id" required>
              <option value="">Seçiniz</option>${O.secenekler(konutlar.filter(k => k.durum !== 'pasif'), '', 'id', 'ad')}
            </select></div>
            <div class="form-group"><label>Gider Türü</label><select name="tur">${O.enumSecenek(GIDER_TUR, 'kira')}</select></div>
            <div class="form-group"><label>Yıl *</label><input type="number" name="yil" required value="${simdi.getFullYear()}" /></div>
            <div class="form-group"><label>Ay *</label><input type="number" name="ay" required min="1" max="12" value="${simdi.getMonth() + 1}" /></div>
            <div class="form-group"><label>Tutar (₺) *</label><input type="number" name="tutar" required step="0.01" /></div>
            <div class="form-group" style="display:flex;align-items:flex-end;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="odendi" style="width:auto" /> Ödendi</label>
            </div>
          </div>
          <div class="form-group"><label>Açıklama</label><input name="aciklama" /></div>
          ${O.formHata()}${O.modalFooter()}
        </form>`);

      g.querySelector('#knk-gider-form').onsubmit = async e => {
        e.preventDefault();
        const veri = O.formVeri(e.target, ['konut_id', 'yil', 'ay', 'tutar']);
        if (veri.odendi) veri.odeme_tarihi = O.bugun();
        try {
          const s = await O.api('/konaklama/giderler', { method: 'POST', body: JSON.stringify(veri) });
          await veriYukle();
          O.modalKapat(); render();
        } catch (err) { O.hataGoster(err.message); }
      };
    },

    async giderOde(id) {
      try {
        const s = await O.api(`/konaklama/giderler/${id}/ode`, { method: 'POST' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },

    async giderSil(id) {
      if (!confirm('Gider kaydı silinsin mi?')) return;
      try {
        await O.api(`/konaklama/giderler/${id}`, { method: 'DELETE' });
        await veriYukle();
        render();
      } catch (err) { alert(err.message); }
    },
  };
})();
