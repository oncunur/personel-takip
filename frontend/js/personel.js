// ─── Personel Modülü ───────────────────────────────────────────────
const PersonelModul = (() => {
  let departmanlar = [];
  let mevcutSayfa = 1;
  let aramaTxt = '';
  let filtreDepartman = '';
  let filtreDurum = '';
  let duzenleId = null;


  const durumRenk = { aktif:'#52C41A', pasif:'#BFBFBF', izinli:'#FAAD14' };
  const durumEtiket = { aktif:'Aktif', pasif:'Pasif', izinli:'İzinli' };
  const cinsiyetEtiket = { erkek:'Erkek', kadin:'Kadın', belirtilmemis:'—' };

  async function apiFetch(url, opts = {}) {
    const token = Auth.getToken();
    const base = 'http://localhost:8000';
    try {
      const res = await fetch(base + url, {
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
    } catch(e) {
      // Ağ/zaman aşımı hatası: sahte veriye düşmek yerine açıkça bildir.
      if (e.name === 'TimeoutError' || e.name === 'TypeError' || e.name === 'AbortError') {
        throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
      }
      throw e;
    }
  }

  async function departmanlariYukle() {
    const data = await apiFetch('/personel/departmanlar');
    departmanlar = data;
  }

  async function listeyiYukle() {
    const params = new URLSearchParams({ sayfa: mevcutSayfa, limit: 20 });
    if (aramaTxt) params.set('arama', aramaTxt);
    if (filtreDepartman) params.set('departman_id', filtreDepartman);
    if (filtreDurum) params.set('durum', filtreDurum);

    const data = await apiFetch(`/personel?${params}`);
    const liste = data.veriler;
    const toplam = data.toplam;
    listeRender(liste, toplam);
  }

  function listeRender(liste, toplam) {
    const tbody = document.getElementById('personel-tbody');
    if (!tbody) return;
    if (!liste.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray-400)">Personel bulunamadı</td></tr>`;
      document.getElementById('personel-toplam').textContent = '0 personel';
      return;
    }
    document.getElementById('personel-toplam').textContent = `${toplam} personel`;
    tbody.innerHTML = liste.map(p => `
      <tr class="personel-satir" data-id="${p.id}">
        <td>
          <div class="personel-avatar-ad">
            <div class="avatar">${p.ad[0]}${p.soyad[0]}</div>
            <div>
              <strong>${p.ad} ${p.soyad}</strong>
              <span class="alt-bilgi">${p.email}</span>
            </div>
          </div>
        </td>
        <td><span style="color:var(--gray-700)">${p.pozisyon || '—'}</span></td>
        <td><span class="departman-chip">${p.departman_ad || '—'}</span></td>
        <td>${p.telefon || '—'}</td>
        <td>
          <span class="durum-badge" style="background:${durumRenk[p.durum]}22;color:${durumRenk[p.durum]}">
            ${durumEtiket[p.durum]}
          </span>
        </td>
        <td class="islem-td">
          <button class="btn-ikon" onclick="PersonelModul.detayAc(${p.id})" title="Detay">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
          </button>
          <button class="btn-ikon" onclick="PersonelModul.duzenleAc(${p.id})" title="Düzenle">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          <button class="btn-ikon btn-sil" onclick="PersonelModul.sil(${p.id}, '${p.ad} ${p.soyad}')" title="Sil">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function sayfaRender() {
    const kullanici = Auth.getKullanici();
    const yonetici = kullanici && ['admin','yonetici'].includes(kullanici.rol);

    document.getElementById('content-area').innerHTML = `
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="arama-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input type="text" id="personel-arama" placeholder="İsim, e-posta, pozisyon ara..." value="${aramaTxt}" />
          </div>
          <select id="filtre-departman" class="filtre-select">
            <option value="">Tüm Departmanlar</option>
            ${departmanlar.map(d => `<option value="${d.id}" ${filtreDepartman==d.id?'selected':''}>${d.ad}</option>`).join('')}
          </select>
          <select id="filtre-durum" class="filtre-select">
            <option value="">Tüm Durumlar</option>
            <option value="aktif" ${filtreDurum==='aktif'?'selected':''}>Aktif</option>
            <option value="izinli" ${filtreDurum==='izinli'?'selected':''}>İzinli</option>
            <option value="pasif" ${filtreDurum==='pasif'?'selected':''}>Pasif</option>
          </select>
        </div>
        <div class="toolbar-sagda">
          <span id="personel-toplam" style="font-size:13px;color:var(--gray-500)"></span>
          ${yonetici ? `<button class="btn-yeni" onclick="PersonelModul.yeniAc()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Personel Ekle
          </button>` : ''}
        </div>
      </div>

      <div class="panel" style="overflow:hidden">
        <table class="personel-tablo">
          <thead>
            <tr>
              <th>Personel</th><th>Pozisyon</th><th>Departman</th><th>Telefon</th><th>Durum</th><th>İşlemler</th>
            </tr>
          </thead>
          <tbody id="personel-tbody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray-400)">Yükleniyor...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      <div id="personel-modal" class="modal-overlay gizli">
        <div class="modal-kart">
          <div class="modal-header">
            <h3 id="modal-baslik">Personel Ekle</h3>
            <button class="modal-kapat" onclick="PersonelModul.modalKapat()">×</button>
          </div>
          <div id="modal-icerik"></div>
        </div>
      </div>
    `;

    document.getElementById('personel-arama').addEventListener('input', e => {
      aramaTxt = e.target.value;
      mevcutSayfa = 1;
      listeyiYukle();
    });
    document.getElementById('filtre-departman').addEventListener('change', e => {
      filtreDepartman = e.target.value;
      mevcutSayfa = 1;
      listeyiYukle();
    });
    document.getElementById('filtre-durum').addEventListener('change', e => {
      filtreDurum = e.target.value;
      mevcutSayfa = 1;
      listeyiYukle();
    });

    listeyiYukle();
  }

  function formHtml(p = {}) {
    const depOptions = departmanlar.map(d =>
      `<option value="${d.id}" ${p.departman_id==d.id?'selected':''}>${d.ad}</option>`
    ).join('');
    return `
      <form id="personel-form" class="modal-form">
        <div class="form-grid-2">
          <div class="form-group"><label>Ad *</label><input name="ad" required value="${p.ad||''}" placeholder="Ad" /></div>
          <div class="form-group"><label>Soyad *</label><input name="soyad" required value="${p.soyad||''}" placeholder="Soyad" /></div>
          <div class="form-group"><label>E-posta *</label><input name="email" type="email" required value="${p.email||''}" placeholder="ornek@sirket.com" /></div>
          <div class="form-group"><label>Telefon</label><input name="telefon" value="${p.telefon||''}" placeholder="0532 000 00 00" /></div>
          <div class="form-group"><label>TC Kimlik</label><input name="tc_kimlik" maxlength="11" value="${p.tc_kimlik||''}" placeholder="11 haneli TC kimlik" /></div>
          <div class="form-group"><label>Departman</label>
            <select name="departman_id"><option value="">Seçiniz</option>${depOptions}</select>
          </div>
          <div class="form-group"><label>Pozisyon</label><input name="pozisyon" value="${p.pozisyon||''}" placeholder="Yazılım Geliştirici" /></div>
          <div class="form-group"><label>Cinsiyet</label>
            <select name="cinsiyet">
              <option value="belirtilmemis" ${(!p.cinsiyet||p.cinsiyet==='belirtilmemis')?'selected':''}>Belirtilmemiş</option>
              <option value="erkek" ${p.cinsiyet==='erkek'?'selected':''}>Erkek</option>
              <option value="kadin" ${p.cinsiyet==='kadin'?'selected':''}>Kadın</option>
            </select>
          </div>
          <div class="form-group"><label>İşe Başlama</label><input type="date" name="ise_baslama_tarihi" value="${p.ise_baslama_tarihi||''}" /></div>
          <div class="form-group"><label>Doğum Tarihi</label><input type="date" name="dogum_tarihi" value="${p.dogum_tarihi||''}" /></div>
          <div class="form-group"><label>Maaş (₺)</label><input type="number" name="maas" value="${p.maas||''}" placeholder="0.00" step="0.01" /></div>
          ${p.id ? `<div class="form-group"><label>Durum</label>
            <select name="durum">
              <option value="aktif" ${p.durum==='aktif'?'selected':''}>Aktif</option>
              <option value="izinli" ${p.durum==='izinli'?'selected':''}>İzinli</option>
              <option value="pasif" ${p.durum==='pasif'?'selected':''}>Pasif</option>
            </select>
          </div>` : ''}
        </div>
        <div class="form-group"><label>Adres</label><textarea name="adres" rows="2" placeholder="Adres...">${p.adres||''}</textarea></div>
        <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2" placeholder="Ek notlar...">${p.notlar||''}</textarea></div>
        <div id="form-hata" class="hata-mesaji gizli" style="margin-top:0"></div>
        <div class="modal-footer">
          <button type="button" class="btn-iptal" onclick="PersonelModul.modalKapat()">İptal</button>
          <button type="submit" class="btn-kaydet">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formDegerlerAl(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => { if (v !== '') obj[k] = v; });
    if (obj.maas) obj.maas = parseFloat(obj.maas);
    if (!obj.departman_id) delete obj.departman_id;
    return obj;
  }

  return {
    async yukle() {
      await departmanlariYukle();
      sayfaRender();
    },

    yeniAc() {
      duzenleId = null;
      document.getElementById('modal-baslik').textContent = 'Personel Ekle';
      document.getElementById('modal-icerik').innerHTML = formHtml();
      document.getElementById('personel-modal').classList.remove('gizli');
      document.getElementById('personel-form').addEventListener('submit', async e => {
        e.preventDefault();
        const veri = formDegerlerAl(e.target);
        const hata = document.getElementById('form-hata');
        try {
          await apiFetch('/personel', { method:'POST', body: JSON.stringify(veri) });
          this.modalKapat();
          listeyiYukle();
        } catch(err) {
          hata.textContent = err.message;
          hata.classList.remove('gizli');
        }
      });
    },

    async duzenleAc(id) {
      duzenleId = id;
      const p = await apiFetch(`/personel/${id}`);
      document.getElementById('modal-baslik').textContent = 'Personel Düzenle';
      document.getElementById('modal-icerik').innerHTML = formHtml(p);
      document.getElementById('personel-modal').classList.remove('gizli');
      document.getElementById('personel-form').addEventListener('submit', async e => {
        e.preventDefault();
        const veri = formDegerlerAl(e.target);
        const hata = document.getElementById('form-hata');
        try {
          await apiFetch(`/personel/${id}`, { method:'PUT', body: JSON.stringify(veri) });
          this.modalKapat();
          listeyiYukle();
        } catch(err) {
          hata.textContent = err.message;
          hata.classList.remove('gizli');
        }
      });
    },

    async detayAc(id) {
      const p = await apiFetch(`/personel/${id}`);
      document.getElementById('modal-baslik').textContent = `${p.ad} ${p.soyad}`;
      document.getElementById('modal-icerik').innerHTML = `
        <div class="detay-grid">
          <div class="detay-satir"><span>E-posta</span><strong>${p.email||'—'}</strong></div>
          <div class="detay-satir"><span>Telefon</span><strong>${p.telefon||'—'}</strong></div>
          <div class="detay-satir"><span>TC Kimlik</span><strong>${p.tc_kimlik||'—'}</strong></div>
          <div class="detay-satir"><span>Departman</span><strong>${p.departman_ad||'—'}</strong></div>
          <div class="detay-satir"><span>Pozisyon</span><strong>${p.pozisyon||'—'}</strong></div>
          <div class="detay-satir"><span>Durum</span><span class="durum-badge" style="background:${durumRenk[p.durum]}22;color:${durumRenk[p.durum]}">${durumEtiket[p.durum]}</span></div>
          <div class="detay-satir"><span>Cinsiyet</span><strong>${cinsiyetEtiket[p.cinsiyet]||'—'}</strong></div>
          <div class="detay-satir"><span>İşe Başlama</span><strong>${p.ise_baslama_tarihi||'—'}</strong></div>
          <div class="detay-satir"><span>Doğum Tarihi</span><strong>${p.dogum_tarihi||'—'}</strong></div>
          <div class="detay-satir"><span>Maaş</span><strong>${p.maas ? '₺'+Number(p.maas).toLocaleString('tr-TR') : '—'}</strong></div>
          ${p.adres ? `<div class="detay-satir detay-tam"><span>Adres</span><strong>${p.adres}</strong></div>` : ''}
          ${p.notlar ? `<div class="detay-satir detay-tam"><span>Notlar</span><strong>${p.notlar}</strong></div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn-iptal" onclick="PersonelModul.modalKapat()">Kapat</button>
        </div>
      `;
      document.getElementById('personel-modal').classList.remove('gizli');
    },

    async sil(id, ad) {
      if (!confirm(`"${ad}" adlı personeli pasife almak istediğinizden emin misiniz?`)) return;
      try {
        await apiFetch(`/personel/${id}`, { method:'DELETE' });
        listeyiYukle();
      } catch(err) { alert(err.message); }
    },

    modalKapat() {
      document.getElementById('personel-modal').classList.add('gizli');
      duzenleId = null;
    },
  };
})();
