// ─── İdari İşler Ortak Katmanı ─────────────────────────────────────
// Tüm idari modüllerin paylaştığı API çağrısı, biçimlendirme ve UI parçaları.
const Ortak = (() => {
  const BASE = API_URL;   // api.js'te tanımlı; adres iki yerde tekrarlanıyordu

  async function api(url, opts = {}) {
    const token = Auth.getToken();
    try {
      const res = await fetch(BASE + url, {
        ...opts,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(hataMetni(e));
      }
      if (res.status === 204) return { _bos: true };
      return res.json();
    } catch (e) {
      // Ağ/zaman aşımı hatası: sahte veriye düşmek yerine açıkça bildir.
      if (e.name === 'TimeoutError' || e.name === 'TypeError' || e.name === 'AbortError') {
        throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
      }
      throw e;
    }
  }

  const tl = n => '₺' + Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const tlTam = n => '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sayi = n => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

  function tarih(s) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function saatli(s) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  const bugun = () => new Date().toISOString().slice(0, 10);

  // XSS ve tırnak kırılmasına karşı
  const kacir = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const yonetici = () => {
    const k = Auth.getKullanici();
    return !!k && ['admin', 'yonetici'].includes(k.rol);
  };

  function rozet(metin, renk) {
    return `<span class="durum-badge" style="background:${renk}1f;color:${renk}">${kacir(metin)}</span>`;
  }

  // Kalan güne göre renk: geçmiş kırmızı, 30 güne kadar turuncu, sonrası nötr
  function kalanRozet(gun) {
    if (gun === null || gun === undefined) return '<span style="color:var(--gray-400)">—</span>';
    if (gun < 0) return rozet(`${Math.abs(gun)} gün geçti`, '#DB0000');
    if (gun <= 30) return rozet(`${gun} gün kaldı`, '#855900');
    return `<span style="color:var(--gray-500)">${gun} gün</span>`;
  }

  // Yarım günler 0,5 sayıldığı için gün sayısı kesirli olabiliyor;
  // tam sayıysa ondalık gösterilmiyor.
  function gun(n) {
    if (n === null || n === undefined || n === '') return '—';
    const s = Number(n);
    return (Number.isInteger(s) ? s : s.toFixed(1).replace('.', ',')) + ' gün';
  }

  function statGrid(kartlar) {
    return `<div class="idari-stat-grid">${kartlar.map(k => `
      <div class="idari-stat" style="--vurgu:${k.renk || 'var(--primary)'}">
        <span class="idari-stat-label">${kacir(k.label)}</span>
        <strong class="idari-stat-deger">${k.deger}</strong>
        ${k.alt ? `<span class="idari-stat-alt">${k.alt}</span>` : ''}
      </div>`).join('')}</div>`;
  }

  function sekmeler(id, sekmeList, aktif) {
    return `<div class="idari-tabs" id="${id}">${sekmeList.map(s => `
      <button class="idari-tab ${s.key === aktif ? 'aktif' : ''}" data-tab="${s.key}">
        ${kacir(s.ad)}${s.rozet !== undefined && s.rozet !== null ? `<span class="idari-tab-rozet">${s.rozet}</span>` : ''}
      </button>`).join('')}</div>`;
  }

  function bosSatir(mesaj, kolon) {
    return `<tr><td colspan="${kolon}" style="text-align:center;padding:40px;color:var(--gray-400)">${kacir(mesaj)}</td></tr>`;
  }

  function doluluk(yuzde) {
    const renk = yuzde >= 100 ? '#DB0000' : yuzde >= 70 ? '#855900' : '#00802F';
    return `<div class="doluluk-bar" title="%${yuzde}"><span style="width:${Math.min(yuzde, 100)}%;background:${renk}"></span></div>`;
  }

  // Tek bir paylaşılan modal — her modül kendi markup'ını taşımaz
  function modalAc(baslik, icerik, genis = false) {
    let ov = document.getElementById('idari-modal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'idari-modal';
      ov.className = 'modal-overlay gizli';
      ov.innerHTML = `<div class="modal-kart"><div class="modal-header">
          <h3 id="idari-modal-baslik"></h3>
          <button class="modal-kapat" onclick="Ortak.modalKapat()">&times;</button>
        </div><div id="idari-modal-icerik"></div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) modalKapat(); });
    }
    ov.querySelector('.modal-kart').classList.toggle('modal-genis', genis);
    document.getElementById('idari-modal-baslik').textContent = baslik;
    document.getElementById('idari-modal-icerik').innerHTML = icerik;
    ov.classList.remove('gizli');
    return document.getElementById('idari-modal-icerik');
  }

  function modalKapat() {
    const ov = document.getElementById('idari-modal');
    if (ov) ov.classList.add('gizli');
  }

  // FormData → düz nesne; boş alanlar atılır, sayısal alanlar çevrilir
  function formVeri(form, sayisalAlanlar = []) {
    const obj = {};
    new FormData(form).forEach((v, k) => {
      if (v === '') return;
      obj[k] = sayisalAlanlar.includes(k) ? Number(v) : v;
    });
    form.querySelectorAll('input[type=checkbox]').forEach(c => { obj[c.name] = c.checked; });
    return obj;
  }

  function hataGoster(mesaj) {
    const el = document.getElementById('idari-form-hata');
    if (el) { el.textContent = mesaj; el.classList.remove('gizli'); }
    else alert(mesaj);
  }

  const formHata = () => `<div id="idari-form-hata" class="hata-mesaji gizli" style="margin-top:0"></div>`;

  function modalFooter(kaydetEtiket = 'Kaydet') {
    return `<div class="modal-footer">
      <button type="button" class="btn-iptal" onclick="Ortak.modalKapat()">İptal</button>
      <button type="submit" class="btn-kaydet">${kacir(kaydetEtiket)}</button>
    </div>`;
  }

  function secenekler(liste, secili, deger = 'id', etiket = 'ad') {
    return liste.map(x => `<option value="${x[deger]}" ${String(x[deger]) === String(secili) ? 'selected' : ''}>${kacir(x[etiket])}</option>`).join('');
  }

  function enumSecenek(sozluk, secili) {
    return Object.entries(sozluk).map(([k, v]) => `<option value="${k}" ${k === secili ? 'selected' : ''}>${kacir(v)}</option>`).join('');
  }

  // Personel listesi tüm idari modüllerde lazım — bir kez çekilip paylaşılır
  let _personeller = null;
  async function personeller(yenile = false) {
    if (_personeller && !yenile) return _personeller;
    const d = await api('/personel?limit=100');
    _personeller = d.veriler.map(p => ({ ...p, adSoyad: `${p.ad} ${p.soyad}` }));
    return _personeller;
  }

  function icerik(html) {
    document.getElementById('content-area').innerHTML = html;
  }

  // ── Dar ekranda gizlenecek sütunlar ────────────────────────────
  // Başlıkta .opsiyonel işaretli sütunun gövde hücrelerine de aynı
  // sınıf veriliyor; yoksa yalnızca başlık gizlenir ve sütunlar kayar.
  // Modüller tabloyu kendi içinde çizdiği için tek tek çağırmak yerine
  // içerik alanı değiştikçe merkezî olarak uygulanıyor.
  function opsiyonelSutunlariEsle(kok) {
    (kok || document).querySelectorAll('table').forEach(tablo => {
      const basliklar = [...tablo.querySelectorAll('thead tr:last-child th')];
      const gizli = basliklar
        .map((th, i) => th.classList.contains('opsiyonel') ? i : -1)
        .filter(i => i >= 0);
      if (!gizli.length) return;
      tablo.querySelectorAll('tbody tr').forEach(satir => {
        // colspan'lı boş/toplam satırları atla
        if (satir.cells.length !== basliklar.length) return;
        gizli.forEach(i => satir.cells[i].classList.add('opsiyonel'));
      });
    });
  }

  // Gövdedeki işlem hücresinin başlığını da işaretle. Modüllerin bir kısmı
  // .islem-td, bir kısmı .islem kullanıyor; başlık ikisinde de sınıfsızdı
  // ve "İşlemler" metni sütunu ikonlardan geniş tutuyordu.
  function islemBasligiEsle(kok) {
    (kok || document).querySelectorAll('table').forEach(tablo => {
      const basliklar = [...tablo.querySelectorAll('thead tr:last-child th')];
      const ornek = tablo.querySelector('tbody tr');
      if (!ornek || ornek.cells.length !== basliklar.length) return;
      [...ornek.cells].forEach((hucre, i) => {
        if (hucre.classList.contains('islem-td') || hucre.classList.contains('islem')) {
          basliklar[i].classList.add('islem');
        }
      });
    });
  }

  const govdeGozcusu = new MutationObserver(() => {
    opsiyonelSutunlariEsle();
    islemBasligiEsle();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const alan = document.getElementById('content-area');
    if (alan) govdeGozcusu.observe(alan, { childList: true, subtree: true });
  });

  return {
    api, tl, tlTam, sayi, gun, tarih, saatli, bugun, kacir, yonetici, rozet, kalanRozet,
    statGrid, sekmeler, bosSatir, doluluk, modalAc, modalKapat, formVeri, hataGoster,
    formHata, modalFooter, secenekler, enumSecenek, personeller, icerik,
    opsiyonelSutunlariEsle, islemBasligiEsle,
  };
})();
