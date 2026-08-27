// Yalnızca yöneticilerin erişebildiği sayfalar. Backend bu uçları 403 ile
// koruyor; menüden gizlemek kullanıcıya boş/hatalı ekran göstermeyi önler.
const YONETICI_SAYFALARI = ['bordro', 'ozet', 'raporlar'];
// Kullanıcı yönetimi yalnızca admin rolüne açık.
const ADMIN_SAYFALARI = ['kullanicilar'];

function menuyuRoleGoreAyarla(kullanici) {
  const yonetici = ['admin', 'yonetici'].includes(kullanici.rol);
  const admin = kullanici.rol === 'admin';
  document.querySelectorAll('.nav-item').forEach(item => {
    const sayfa = item.dataset.page;
    const gizle = (!yonetici && YONETICI_SAYFALARI.includes(sayfa))
               || (!admin && ADMIN_SAYFALARI.includes(sayfa));
    if (gizle) item.classList.add('gizli');
  });
}

function rolBadge(rol) {
  return `<span class="rol-badge rol-${rol}">${rol.charAt(0).toUpperCase() + rol.slice(1)}</span>`;
}

function dashboardYukle(kullanici) {
  // Sidebar kullanıcı bilgisi
  document.getElementById('sidebar-kullanici').innerHTML = `
    <strong>${kullanici.ad} ${kullanici.soyad}</strong>
    ${rolBadge(kullanici.rol)}
  `;
  document.getElementById('header-kullanici').innerHTML = `
    <span style="color:var(--gray-500)">Hoş geldiniz,</span>
    <strong style="color:var(--gray-800)">${kullanici.ad}</strong>
    ${rolBadge(kullanici.rol)}
  `;

  menuyuRoleGoreAyarla(kullanici);
  anasayfaIcerigi(kullanici);

  // Nav tıklamaları
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const sayfa = item.dataset.page;
      document.getElementById('sayfa-baslik').textContent = item.querySelector('span').textContent;
      sayfaIcerigi(sayfa, kullanici);
    });
  });
}

// Sidebar'daki bir modüle programatik geçiş (anasayfadaki uyarı kartlarından)
function sayfayaGit(sayfa) {
  const item = document.querySelector(`.nav-item[data-page="${sayfa}"]`);
  if (item) item.click();
}

// ─── Anasayfa panosu ──────────────────────────────────────────────
// Cloudscape'in "Service dashboard" deseni: sayfa başlığı, tek
// container içinde dikey ayraçla bölünmüş büyük KPI değerleri,
// ardından başlıklı ve açıklamalı grafik container'ları.

let anasayfaGrafikleri = [];

// Cloudscape kategorik grafik paleti (design-tokens paketinden)
const PANO_RENK = ['#688ae8', '#c33d69', '#2ea597', '#8456ce', '#e07941', '#3759ce'];
const PANO_IZGARA = '#dedee3';

function anasayfaGrafikleriTemizle() {
  anasayfaGrafikleri.forEach(g => g && g.destroy());
  anasayfaGrafikleri = [];
}

// Cloudscape KPI: küçük kalın etiket, altında büyük mavi değer.
// Değer tıklanabilir olduğunda ilgili modüle götürür.
function panoKpi(etiket, deger, alt, sayfa) {
  const govde = sayfa
    ? `<a href="#" class="pano-kpi-deger pano-kpi-link" onclick="sayfayaGit('${sayfa}');return false">${deger}</a>`
    : `<span class="pano-kpi-deger">${deger}</span>`;
  return `<div class="pano-kpi">
    <span class="pano-kpi-etiket">${Ortak.kacir(etiket)}</span>
    ${govde}
    ${alt ? `<span class="pano-kpi-alt">${Ortak.kacir(alt)}</span>` : ''}
  </div>`;
}

function panoContainer(baslik, aciklama, icerik, ekSinif = '') {
  return `<div class="panel pano-container ${ekSinif}">
    <div class="pano-container-bas">
      <h3>${Ortak.kacir(baslik)}</h3>
      ${aciklama ? `<p>${Ortak.kacir(aciklama)}</p>` : ''}
    </div>
    ${icerik}
  </div>`;
}

function anasayfaIcerigi(kullanici) {
  anasayfaGrafikleriTemizle();
  const yonetici = ['admin', 'yonetici'].includes(kullanici.rol);

  document.getElementById('content-area').innerHTML = `
    <div class="pano-sayfa-bas">
      <h1>Pano</h1>
      <p>Merhaba ${Ortak.kacir(kullanici.ad)} — sistemdeki güncel durum</p>
    </div>
    <div id="anasayfa-ozet">
      ${panoContainer('Genel Bakış', 'Veriler yükleniyor…',
        `<div class="pano-kpi-satir">${Array(4).fill(panoKpi('—', '—')).join('')}</div>`)}
    </div>
  `;

  anasayfaOzetYukle(kullanici, yonetici).catch(err => {
    const hedef = document.getElementById('anasayfa-ozet');
    if (hedef) {
      hedef.innerHTML = panoContainer('Pano yüklenemedi', null,
        `<div class="pano-govde" style="color:var(--text-2)">${Ortak.kacir(err.message || 'Bilinmeyen hata')}</div>`);
    }
  });
}

async function anasayfaOzetYukle(kullanici, yonetici) {
  const O = Ortak;
  const bugun = new Date();
  const yil = bugun.getFullYear(), ay = bugun.getMonth() + 1;
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const saatMetni = v => (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ','));

  // Puantaj cetveli yalnızca yöneticiye açık; personel rolünde 403
  // dönüp tüm panoyu düşürmesin diye ayrıca yakalanır.
  const [genel, izinTrend, depDagilim, konak, dmb, arc, evr, sat, stk, cetvel, belgeler] = await Promise.all([
    O.api('/rapor/genel'),
    O.api('/rapor/aylik-izin-trend'),
    O.api('/rapor/departman-dagilim'),
    O.api('/konaklama/ozet'), O.api('/demirbas/ozet'), O.api('/arac/ozet'),
    O.api('/evrak/ozet'), O.api('/satinalma/ozet'), O.api('/stok/ozet'),
    yonetici ? O.api(`/puantaj/cetvel?yil=${yil}&ay=${ay}`).catch(() => null) : Promise.resolve(null),
    yonetici ? O.api('/personel/belge-uyarilari').catch(() => null) : Promise.resolve(null),
  ]);

  const hedef = document.getElementById('anasayfa-ozet');
  if (!hedef) return;

  const saatToplam = cetvel ? cetvel.personeller.reduce((t, p) => t + (p.toplam_saat || 0), 0) : null;
  const devamsizToplam = cetvel ? cetvel.personeller.reduce((t, p) => t + (p.devamsiz || 0), 0) : null;

  // ── Genel bakış KPI'ları ──
  const kpiler = [
    panoKpi('Toplam personel', genel.toplam_personel, `${genel.aktif_personel} aktif · ${genel.toplam_departman} departman`, 'personel'),
  ];
  if (yonetici && saatToplam !== null) {
    kpiler.push(panoKpi('Çalışılan saat', saatMetni(saatToplam), `${AYLAR[ay-1]} ayı toplamı`, 'puantaj'));
    kpiler.push(panoKpi('Devamsızlık', devamsizToplam, devamsizToplam ? 'bu ay kaydedildi' : 'bu ay yok', 'puantaj'));
  } else {
    kpiler.push(panoKpi('İzinli', genel.izinli_personel, 'bugün'));
  }
  kpiler.push(panoKpi('Bekleyen izin', genel.bekleyen_izin, genel.bekleyen_izin ? 'onay bekliyor' : 'onay bekleyen yok', 'izin'));
  if (kpiler.length < 4) kpiler.push(panoKpi('Bu ay izin', genel.bu_ay_izin, 'onaylanmış', 'izin'));

  // ── Bekleyen işler ──
  const isler = [];
  // Süresi geçmiş çalışma/ikamet izni yaptırım riski taşıdığı için
  // listenin en başında ve ayrı vurguyla gösterilir.
  if (belgeler && belgeler.gecmis) {
    isler.push({ sayfa: 'personel', ad: 'Süresi GEÇMİŞ çalışma/ikamet izni', sayi: belgeler.gecmis, agir: true });
  }
  if (belgeler && belgeler.toplam - (belgeler.gecmis || 0) > 0) {
    isler.push({ sayfa: 'personel', ad: 'Süresi yaklaşan çalışma/ikamet izni', sayi: belgeler.toplam - belgeler.gecmis });
  }
  if (genel.bekleyen_izin) isler.push({ sayfa: 'izin', ad: 'Onay bekleyen izin talebi', sayi: genel.bekleyen_izin });
  if (sat && sat.beklemede) isler.push({ sayfa: 'satinalma', ad: 'Onay bekleyen satın alma talebi', sayi: sat.beklemede });
  if (stk && stk.kritik_sayisi) isler.push({ sayfa: 'stok', ad: 'Kritik seviyedeki stok kalemi', sayi: stk.kritik_sayisi });
  if (arc && arc.uyarilar && arc.uyarilar.length) isler.push({ sayfa: 'arac', ad: 'Muayene / sigorta süresi dolan araç', sayi: arc.uyarilar.length });
  if (evr && evr.sozlesme_uyarilari && evr.sozlesme_uyarilari.length) isler.push({ sayfa: 'evrak', ad: 'Süresi yaklaşan sözleşme', sayi: evr.sozlesme_uyarilari.length });
  if (konak && konak.sozlesme_uyarilari && konak.sozlesme_uyarilari.length) isler.push({ sayfa: 'konaklama', ad: 'Süresi yaklaşan kira sözleşmesi', sayi: konak.sozlesme_uyarilari.length });
  if (konak && konak.odenmemis_gider_sayisi) isler.push({ sayfa: 'konaklama', ad: 'Ödenmemiş konut gideri', sayi: konak.odenmemis_gider_sayisi });

  const islerGovde = isler.length
    ? `<div class="pano-liste">${isler.map(i => `
        <div class="pano-liste-satir${i.agir ? ' pano-liste-agir' : ''}" onclick="sayfayaGit('${i.sayfa}')">
          <span>${i.ad}</span>
          <span class="durum-badge" style="background:${(i.agir || i.sayi > 3) ? '#FFF5F5' : '#FFFEF0'};color:${(i.agir || i.sayi > 3) ? '#DB0000' : '#855900'}">${i.sayi} adet</span>
        </div>`).join('')}</div>`
    : `<div class="pano-govde pano-bos">
         <strong>Bekleyen iş yok</strong>
         <span>Onay bekleyen talep veya süresi yaklaşan kayıt bulunmuyor.</span>
       </div>`;

  hedef.innerHTML = `
    ${panoContainer('Genel Bakış', `${AYLAR[ay-1]} ${yil} · anlık veriler`,
      `<div class="pano-kpi-satir">${kpiler.join('')}</div>`)}

    <div class="pano-satir pano-satir-2-1">
      ${panoContainer('Bekleyen İşler', 'Aksiyon gerektiren kayıtlar', islerGovde)}
      ${panoContainer('İdari İşler', 'Modül özetleri', `
        <div class="pano-mini-liste">
          <div><span>Konaklama</span><strong>${konak ? konak.dolu_yatak : 0}/${konak ? konak.toplam_kapasite : 0} yatak</strong></div>
          <div><span>Aylık kira</span><strong>${O.tl(konak ? konak.aylik_kira_toplam : 0)}</strong></div>
          <div><span>Demirbaş</span><strong>${dmb ? dmb.toplam : 0} adet · ${dmb ? dmb.zimmetli : 0} zimmetli</strong></div>
          <div><span>Araç</span><strong>${arc ? arc.arac_sayisi : 0} adet · ${arc ? arc.atanan : 0} atanmış</strong></div>
          <div><span>Stok değeri</span><strong>${O.tl(stk ? stk.toplam_deger : 0)}</strong></div>
        </div>`)}
    </div>

    ${yonetici && cetvel ? panoContainer('Günlük Çalışma Saati',
      `${AYLAR[ay-1]} ayı, tüm personelin günlük toplamı`,
      '<div class="pano-tuval pano-tuval-alcak"><canvas id="pano-g-saat"></canvas></div>') : ''}

    <div class="pano-satir pano-satir-1-1">
      ${panoContainer('İzin Talebi Trendi', `${yil} yılı, aylık talep sayısı`,
        '<div class="pano-tuval"><canvas id="pano-g-izin"></canvas></div>')}
      ${panoContainer('Departman Dağılımı', 'Aktif personelin departmanlara göre dağılımı',
        '<div class="pano-tuval"><canvas id="pano-g-departman"></canvas></div>')}
    </div>`;

  panoGrafikleriCiz(izinTrend, depDagilim, cetvel, AYLAR);
}

function panoGrafikleriCiz(izinTrend, depDagilim, cetvel, AYLAR) {
  anasayfaGrafikleriTemizle();

  const izgara = { color: PANO_IZGARA, drawBorder: false };
  const ortak = { responsive: true, maintainAspectRatio: false };

  const saatTuval = document.getElementById('pano-g-saat');
  if (saatTuval && cetvel) {
    const saatler = cetvel.gunler.map(g =>
      cetvel.personeller.reduce((t, p) => t + (p.gunler[String(g.gun)].saat || 0), 0));
    anasayfaGrafikleri.push(new Chart(saatTuval, {
      type: 'bar',
      data: {
        labels: cetvel.gunler.map(g => g.gun),
        datasets: [{
          label: 'Çalışılan saat', data: saatler,
          // Hafta tatili günleri nötr renkte kalır
          backgroundColor: cetvel.gunler.map(g => g.hafta_sonu ? '#C6C6CD' : PANO_RENK[0]),
          borderRadius: 2, borderSkipped: false,
        }],
      },
      options: { ...ortak,
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.parsed.y} saat` } } },
        scales: { y: { beginAtZero: true, grid: izgara, border: { display: false } },
                  x: { grid: { display: false } } } },
    }));
  }

  const izinTuval = document.getElementById('pano-g-izin');
  if (izinTuval && izinTrend) {
    anasayfaGrafikleri.push(new Chart(izinTuval, {
      type: 'line',
      data: {
        labels: AYLAR.map(a => a.slice(0, 3)),
        datasets: [{
          label: 'Talep', data: izinTrend.map(t => t.talep_sayisi),
          borderColor: PANO_RENK[0], backgroundColor: 'rgba(104,138,232,.14)',
          borderWidth: 2, fill: true, tension: .3, pointRadius: 3, pointHoverRadius: 5,
        }],
      },
      options: { ...ortak, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: izgara, border: { display: false } },
                  x: { grid: { display: false } } } },
    }));
  }

  const depTuval = document.getElementById('pano-g-departman');
  if (depTuval && depDagilim && depDagilim.length) {
    anasayfaGrafikleri.push(new Chart(depTuval, {
      type: 'doughnut',
      data: {
        labels: depDagilim.map(d => d.departman),
        datasets: [{ data: depDagilim.map(d => d.sayi), backgroundColor: PANO_RENK,
                     borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { ...ortak, cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 12 } } } } },
    }));
  }
}

// Sayfa yükleyiciler — her modül kendi durumunu yönetir
const SAYFALAR = {
  personel:   () => PersonelModul.yukle(),
  izin:       () => IzinModul.yukle(),
  puantaj:    () => PuantajModul.yukle(),
  bordro:     () => BordroModul.yukle(),
  raporlar:   () => RaporModul.yukle(),
  ozet:       () => OzetModul.yukle(),
  konaklama:  () => KonaklamaModul.yukle(),
  demirbas:   () => DemirbasModul.yukle(),
  arac:       () => AracModul.yukle(),
  evrak:      () => EvrakModul.yukle(),
  satinalma:  () => SatinAlmaModul.yukle(),
  stok:       () => StokModul.yukle(),
  ziyaretci:  () => ZiyaretciModul.yukle(),
  kullanicilar: () => KullaniciModul.yukle(),
};

// Modül yüklenirken oluşan hatayı içerik alanında gösterir. Backend
// erişilemediğinde veya yetki yetersiz olduğunda kullanıcı sahte veri
// değil, ne olduğunu anlatan bir mesaj görür.
function sayfaHatasiGoster(sayfa, err) {
  const mesaj = (err && err.message) || 'Beklenmeyen bir hata oluştu';
  document.getElementById('content-area').innerHTML = `
    <div class="sayfa-placeholder">
      <h3>Sayfa yüklenemedi</h3>
      <p>${Ortak.kacir(mesaj)}</p>
      <button class="btn-kaydet" id="sayfa-tekrar-dene">Tekrar dene</button>
    </div>`;
  const btn = document.getElementById('sayfa-tekrar-dene');
  if (btn) btn.addEventListener('click', () => sayfaIcerigi(sayfa, Auth.getKullanici()));
}

// Sayfa yüklemeleri sıraya alınır. Modüller içerik alanını kendileri
// yazdığı için, iki yükleme aynı anda sürerse yavaş olan hızlının
// ekranını eziyordu: Bordro'ya tıklandığı halde Personel içeriği
// kalabiliyordu. Sıra + son-tıklama kontrolü bunu engeller.
let sayfaSirasi = Promise.resolve();
let istenenSayfa = 'anasayfa';

function sayfaIcerigi(sayfa, kullanici) {
  istenenSayfa = sayfa;
  sayfaSirasi = sayfaSirasi.then(() => sayfaYukle(sayfa, kullanici));
}

function sayfaYukle(sayfa, kullanici) {
  // Sıra beklerken daha yeni bir sayfaya tıklandıysa bunu atla.
  if (sayfa !== istenenSayfa) return;

  if (sayfa === 'anasayfa') { anasayfaIcerigi(kullanici); return; }

  const yukleyici = SAYFALAR[sayfa];
  if (!yukleyici) {
    document.getElementById('content-area').innerHTML = `
      <div class="sayfa-placeholder">
        <h3>${Ortak.kacir(sayfa)}</h3>
        <p>Bu modül yakında eklenecek.</p>
      </div>`;
    return;
  }

  return Promise.resolve()
    .then(yukleyici)
    .catch(err => {
      // Kullanıcı bu arada başka sayfaya geçtiyse hatayı gösterme.
      if (sayfa === istenenSayfa) sayfaHatasiGoster(sayfa, err);
    });
}
