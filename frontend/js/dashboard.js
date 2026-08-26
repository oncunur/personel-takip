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

function anasayfaIcerigi(kullanici) {
  document.getElementById('content-area').innerHTML = `
    <div class="hosgeldin-banner">
      <h3>Merhaba, ${kullanici.ad}! 👋</h3>
      <p>Personel ve İdari İşler Sistemi'ne hoş geldiniz. Sol menüden modüllere erişebilirsiniz.</p>
    </div>
    <div id="anasayfa-ozet">
      <div class="idari-stat-grid">
        ${Array(4).fill('<div class="idari-stat"><span class="idari-stat-label">Yükleniyor</span><strong class="idari-stat-deger">—</strong></div>').join('')}
      </div>
    </div>
  `;
  anasayfaOzetYukle(kullanici).catch(err => {
    const hedef = document.getElementById('anasayfa-ozet');
    if (hedef) {
      hedef.innerHTML = `<div class="panel"><div class="panel-header">Özet yüklenemedi</div>
        <div style="padding:20px;font-size:13px;color:var(--gray-500)">${Ortak.kacir(err.message || 'Bilinmeyen hata')}</div></div>`;
    }
  });
}

// Personel + idari modüllerin özetlerini tek ekranda toplar.
// Backend erişilemezse api katmanı hata fırlatır; hata çağıran tarafa iletilir.
async function anasayfaOzetYukle(kullanici) {
  const O = Ortak;

  const [genel, konak, dmb, arc, evr, sat, stk] = await Promise.all([
    O.api('/rapor/genel'), O.api('/konaklama/ozet'), O.api('/demirbas/ozet'),
    O.api('/arac/ozet'), O.api('/evrak/ozet'), O.api('/satinalma/ozet'), O.api('/stok/ozet'),
  ]);

  const hedef = document.getElementById('anasayfa-ozet');
  if (!hedef) return;

  // Aksiyon gerektiren her şey tek listede toplanır
  const isler = [];
  if (genel.bekleyen_izin) isler.push({ sayfa: 'izin', ad: 'Onay bekleyen izin talebi', sayi: genel.bekleyen_izin });
  if (sat && sat.beklemede) isler.push({ sayfa: 'satinalma', ad: 'Onay bekleyen satın alma talebi', sayi: sat.beklemede });
  if (stk && stk.kritik_sayisi) isler.push({ sayfa: 'stok', ad: 'Kritik seviyedeki stok kalemi', sayi: stk.kritik_sayisi });
  if (arc && arc.uyarilar && arc.uyarilar.length) isler.push({ sayfa: 'arac', ad: 'Muayene / sigorta süresi dolan araç', sayi: arc.uyarilar.length });
  if (evr && evr.sozlesme_uyarilari && evr.sozlesme_uyarilari.length) isler.push({ sayfa: 'evrak', ad: 'Süresi yaklaşan sözleşme', sayi: evr.sozlesme_uyarilari.length });
  if (konak && konak.sozlesme_uyarilari && konak.sozlesme_uyarilari.length) isler.push({ sayfa: 'konaklama', ad: 'Süresi yaklaşan kira sözleşmesi', sayi: konak.sozlesme_uyarilari.length });
  if (konak && konak.odenmemis_gider_sayisi) isler.push({ sayfa: 'konaklama', ad: 'Ödenmemiş konut gideri', sayi: konak.odenmemis_gider_sayisi });

  hedef.innerHTML = `
    ${isler.length ? `<div class="panel uyari-panel">
      <div class="panel-header">Bekleyen İşler</div>
      ${isler.map(i => `<div class="uyari-satir" style="cursor:pointer" onclick="sayfayaGit('${i.sayfa}')">
        <span class="uyari-ad">${i.ad}</span>
        <span class="uyari-alt">${O.rozet(i.sayi + ' adet', i.sayi > 3 ? '#FF4D4F' : '#FAAD14')}</span>
      </div>`).join('')}
    </div>` : `<div class="panel uyari-panel"><div class="uyari-satir">
        <span style="color:var(--gray-500)">Bekleyen iş yok — her şey güncel.</span></div></div>`}

    <div class="panel-header" style="background:none;padding-left:0;margin-bottom:8px">Personel</div>
    ${O.statGrid([
      { label: 'Toplam Personel', deger: genel.toplam_personel, alt: `${genel.toplam_departman} departman` },
      { label: 'Aktif', deger: genel.aktif_personel, alt: `${genel.izinli_personel} izinli`, renk: '#52C41A' },
      { label: 'Bekleyen İzin', deger: genel.bekleyen_izin, alt: 'onay bekliyor', renk: genel.bekleyen_izin ? '#FAAD14' : '#52C41A' },
      { label: 'Bu Ay İzin', deger: genel.bu_ay_izin, alt: 'onaylanmış', renk: '#722ED1' },
    ])}

    <div class="panel-header" style="background:none;padding-left:0;margin:16px 0 8px">İdari İşler</div>
    ${O.statGrid([
      { label: 'Konaklama', deger: `${konak ? konak.dolu_yatak : 0}/${konak ? konak.toplam_kapasite : 0}`, alt: `${konak ? konak.konut_sayisi : 0} konut · ${O.tl(konak ? konak.aylik_kira_toplam : 0)} kira` },
      { label: 'Demirbaş', deger: dmb ? dmb.toplam : 0, alt: `${dmb ? dmb.zimmetli : 0} zimmetli · ${O.tl(dmb ? dmb.toplam_deger : 0)}`, renk: '#1677FF' },
      { label: 'Araç', deger: arc ? arc.arac_sayisi : 0, alt: `${arc ? arc.atanan : 0} atanmış · ${O.tl(arc ? arc.yillik_gider : 0)} gider`, renk: '#722ED1' },
      { label: 'Stok Değeri', deger: O.tl(stk ? stk.toplam_deger : 0), alt: `${stk ? stk.urun_sayisi : 0} kalem`, renk: '#52C41A' },
    ])}

    <div class="panel" style="margin-top:16px">
      <div class="panel-header">Hesap Bilgisi</div>
      <div style="padding:20px;font-size:13px;color:var(--gray-500);line-height:2">
        <div>Rol: ${rolBadge(kullanici.rol)}</div>
        <div style="margin-top:8px">E-posta: <strong style="color:var(--gray-700)">${kullanici.email}</strong></div>
        <div>Kullanıcı Adı: <strong style="color:var(--gray-700)">${kullanici.kullanici_adi}</strong></div>
      </div>
    </div>`;
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

function sayfaIcerigi(sayfa, kullanici) {
  if (sayfa === 'anasayfa') { anasayfaIcerigi(kullanici); return; }
  const yukleyici = SAYFALAR[sayfa];
  if (yukleyici) {
    Promise.resolve()
      .then(yukleyici)
      .catch(err => sayfaHatasiGoster(sayfa, err));
    return;
  }
  document.getElementById('content-area').innerHTML = `
    <div class="sayfa-placeholder">
      <h3>${sayfa}</h3>
      <p>Bu modül yakında eklenecek.</p>
    </div>`;
}
