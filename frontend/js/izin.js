// ─── İzin Yönetimi Modülü ──────────────────────────────────────────
const IzinModul = (() => {
  let personeller = [];
  let filtreDurum = '';
  let filtreTur = '';

  const bugun = new Date();
  const yil = bugun.getFullYear();

  const TUR_ETIKET = { yillik:'Yıllık İzin', mazeret:'Mazeret', hastalik:'Hastalık', ucretsiz:'Ücretsiz', dogum:'Doğum', olum:'Ölüm', diger:'Diğer' };
  const TUR_RENK   = { yillik:'#006CE0', mazeret:'#855900', hastalik:'#DB0000', ucretsiz:'#656871', dogum:'#006CE0', olum:'#424650', diger:'#006CE0' };
  const DURUM_ETIKET = { beklemede:'Beklemede', onaylandi:'Onaylandı', reddedildi:'Reddedildi', iptal:'İptal' };
  const DURUM_RENK   = { beklemede:'#855900', onaylandi:'#00802F', reddedildi:'#DB0000', iptal:'#8C8C94' };

  async function apiFetch(url, opts = {}) {
    const token = Auth.getToken();
    try {
      const res = await fetch('http://localhost:8000' + url, {
        ...opts,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers||{}) },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail || 'Hata'); }
      if (res.status === 204) return null;
      return res.json();
    } catch(e) {
      if (e.name === 'TimeoutError' || e.name === 'TypeError') return null;
      throw e;
    }
  }

  function durumBadge(d) {
    return `<span class="durum-badge" style="background:${DURUM_RENK[d]}22;color:${DURUM_RENK[d]}">${DURUM_ETIKET[d]}</span>`;
  }
  function turBadge(t) {
    return `<span class="tur-badge" style="background:${TUR_RENK[t]}18;color:${TUR_RENK[t]}">${TUR_ETIKET[t]}</span>`;
  }

  function istatistiklerHesapla(talepler) {
    const beklemede  = talepler.filter(t=>t.durum==='beklemede').length;
    const onaylandi  = talepler.filter(t=>t.durum==='onaylandi').length;
    const reddedildi = talepler.filter(t=>t.durum==='reddedildi').length;
    const toplamGun  = talepler.filter(t=>t.durum==='onaylandi').reduce((s,t)=>s+t.gun_sayisi,0);
    return { beklemede, onaylandi, reddedildi, toplamGun };
  }

  function listeRender(talepler, bakiye) {
    const kullanici = Auth.getKullanici();
    const yonetici  = kullanici && ['admin','yonetici'].includes(kullanici.rol);
    const istat     = istatistiklerHesapla(talepler);

    const filtreli = talepler.filter(t =>
      (!filtreDurum || t.durum === filtreDurum) &&
      (!filtreTur   || t.tur   === filtreTur)
    );

    document.getElementById('izin-stats').innerHTML = `
      <div class="izin-stat-kart" style="border-left:3px solid ${DURUM_RENK.beklemede}">
        <span class="stat-sayi">${istat.beklemede}</span>
        <span class="stat-label">Beklemede</span>
      </div>
      <div class="izin-stat-kart" style="border-left:3px solid ${DURUM_RENK.onaylandi}">
        <span class="stat-sayi">${istat.onaylandi}</span>
        <span class="stat-label">Onaylanan</span>
      </div>
      <div class="izin-stat-kart" style="border-left:3px solid ${DURUM_RENK.reddedildi}">
        <span class="stat-sayi">${istat.reddedildi}</span>
        <span class="stat-label">Reddedilen</span>
      </div>
      <div class="izin-stat-kart" style="border-left:3px solid var(--primary)">
        <span class="stat-sayi">${istat.toplamGun}</span>
        <span class="stat-label">Toplam Gün (Onaylı)</span>
      </div>
      ${bakiye ? `
      <div class="izin-stat-kart" style="border-left:3px solid #006CE0; grid-column: span 1;">
        <span class="stat-sayi">${bakiye.kalan}<small style="font-size:13px;color:var(--gray-400)">/${bakiye.hak}</small></span>
        <span class="stat-label">Yıllık Bakiye (Kalan/Hak)</span>
      </div>` : ''}
    `;

    const tbody = document.getElementById('izin-tbody');
    if (!filtreli.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-400)">İzin talebi bulunamadı</td></tr>`;
      return;
    }

    tbody.innerHTML = filtreli.map(t => `
      <tr>
        <td>
          <div style="font-weight:600;color:var(--gray-900)">${t.personel_ad}</div>
          <div style="font-size:12px;color:var(--gray-400)">${t.personel_departman||''}</div>
        </td>
        <td>${turBadge(t.tur)}</td>
        <td>
          <div style="font-size:13px">${tarihFmt(t.baslangic_tarihi)} – ${tarihFmt(t.bitis_tarihi)}</div>
          <div style="font-size:12px;color:var(--gray-400)">${t.gun_sayisi} iş günü</div>
        </td>
        <td>${durumBadge(t.durum)}</td>
        <td style="font-size:13px;color:var(--gray-600);max-width:160px">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.aciklama||'—'}</div>
        </td>
        <td style="font-size:12px;color:var(--gray-500)">${t.onaylayan||'—'}</td>
        <td class="islem-td">
          ${t.durum==='beklemede' && yonetici ? `
            <button class="btn-onay" onclick="IzinModul.onayla(${t.id})" title="Onayla">✓</button>
            <button class="btn-ret"  onclick="IzinModul.reddet(${t.id})" title="Reddet">✗</button>
          ` : ''}
          ${t.durum==='beklemede' ? `
            <button class="btn-ikon btn-sil" onclick="IzinModul.iptal(${t.id})" title="İptal">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  }

  function tarihFmt(str) {
    if (!str) return '—';
    const [y,m,d] = str.split('-');
    return `${d}.${m}.${y}`;
  }

  function sayfaRender() {
    const kullanici = Auth.getKullanici();
    const yonetici  = kullanici && ['admin','yonetici'].includes(kullanici.rol);

    document.getElementById('content-area').innerHTML = `
      <div class="izin-toolbar">
        <div class="arama-grup">
          <select id="filtre-izin-durum" class="filtre-select">
            <option value="">Tüm Durumlar</option>
            <option value="beklemede">Beklemede</option>
            <option value="onaylandi">Onaylandı</option>
            <option value="reddedildi">Reddedildi</option>
            <option value="iptal">İptal</option>
          </select>
          <select id="filtre-izin-tur" class="filtre-select">
            <option value="">Tüm Türler</option>
            <option value="yillik">Yıllık İzin</option>
            <option value="mazeret">Mazeret</option>
            <option value="hastalik">Hastalık</option>
            <option value="ucretsiz">Ücretsiz</option>
            <option value="dogum">Doğum</option>
            <option value="diger">Diğer</option>
          </select>
        </div>
        <button class="btn-yeni" onclick="IzinModul.yeniAc()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          İzin Talep Et
        </button>
      </div>

      <div class="izin-stats-wrap" id="izin-stats"></div>

      <div class="panel" style="overflow:hidden;margin-top:16px">
        <table class="personel-tablo">
          <thead>
            <tr>
              <th>Personel</th><th>Tür</th><th>Tarih Aralığı</th>
              <th>Durum</th><th>Açıklama</th><th>Onaylayan</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody id="izin-tbody">
            <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-400)">Yükleniyor...</td></tr>
          </tbody>
        </table>
      </div>

      <div id="izin-modal" class="modal-overlay gizli">
        <div class="modal-kart" style="max-width:500px">
          <div class="modal-header">
            <h3 id="izin-modal-baslik">İzin Talep Et</h3>
            <button class="modal-kapat" onclick="IzinModul.modalKapat()">×</button>
          </div>
          <div id="izin-modal-icerik"></div>
        </div>
      </div>
    `;

    document.getElementById('filtre-izin-durum').addEventListener('change', e => { filtreDurum = e.target.value; yukleVeRender(); });
    document.getElementById('filtre-izin-tur').addEventListener('change',   e => { filtreTur   = e.target.value; yukleVeRender(); });

    yukleVeRender();
  }

  async function yukleVeRender() {
    const data    = await apiFetch('/izin?limit=100');
    const talepler = data.veriler;
    const bakiye  = await apiFetch('/izin/bakiyem');
    listeRender(talepler, bakiye);
  }

  function personelOptions() {
    const list = personeller;
    return list.map(p => `<option value="${p.id}">${p.ad} ${p.soyad}</option>`).join('');
  }

  return {
    async yukle() {
      const data = await apiFetch('/personel?limit=100');
      personeller = data.veriler;
      sayfaRender();
    },

    yeniAc() {
      document.getElementById('izin-modal-baslik').textContent = 'İzin Talep Et';
      document.getElementById('izin-modal-icerik').innerHTML = `
        <form id="izin-form" class="modal-form">
          <div class="form-group">
            <label>Personel *</label>
            <select name="personel_id" required><option value="">Seçiniz</option>${personelOptions()}</select>
          </div>
          <div class="form-group">
            <label>İzin Türü *</label>
            <select name="tur" required>
              <option value="">Seçiniz</option>
              <option value="yillik">Yıllık İzin</option>
              <option value="mazeret">Mazeret</option>
              <option value="hastalik">Hastalık</option>
              <option value="ucretsiz">Ücretsiz İzin</option>
              <option value="dogum">Doğum İzni</option>
              <option value="olum">Ölüm İzni</option>
              <option value="diger">Diğer</option>
            </select>
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label>Başlangıç *</label>
              <input type="date" name="baslangic_tarihi" required />
            </div>
            <div class="form-group">
              <label>Bitiş *</label>
              <input type="date" name="bitis_tarihi" required />
            </div>
          </div>
          <div id="gun-hesap" style="font-size:13px;color:var(--primary);font-weight:600;min-height:20px;margin-bottom:6px"></div>
          <div class="form-group">
            <label>Açıklama</label>
            <textarea name="aciklama" rows="3" placeholder="İzin sebebi..."></textarea>
          </div>
          <div id="izin-form-hata" class="hata-mesaji gizli"></div>
          <div class="modal-footer">
            <button type="button" class="btn-iptal" onclick="IzinModul.modalKapat()">İptal</button>
            <button type="submit" class="btn-kaydet">Talep Gönder</button>
          </div>
        </form>
      `;

      // İş günü hesaplama
      ['baslangic_tarihi','bitis_tarihi'].forEach(id => {
        document.querySelector(`[name="${id}"]`).addEventListener('change', hesaplaGun);
      });

      document.getElementById('izin-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const veri = { personel_id: parseInt(fd.get('personel_id')), tur: fd.get('tur'),
          baslangic_tarihi: fd.get('baslangic_tarihi'), bitis_tarihi: fd.get('bitis_tarihi'),
          aciklama: fd.get('aciklama') || undefined };
        const hata = document.getElementById('izin-form-hata');
        try {
          await apiFetch('/izin', { method:'POST', body: JSON.stringify(veri) });
          this.modalKapat();
          yukleVeRender();
        } catch(err) { hata.textContent = err.message; hata.classList.remove('gizli'); }
      });

      document.getElementById('izin-modal').classList.remove('gizli');
    },

    async onayla(id) {
      const notu = prompt('Onay notu (isteğe bağlı):') ?? '';
      try {
        await apiFetch(`/izin/${id}/onay`, { method:'PUT', body: JSON.stringify({ durum:'onaylandi', onay_notu: notu||null }) });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async reddet(id) {
      const notu = prompt('Ret sebebi:');
      if (notu === null) return;
      try {
        await apiFetch(`/izin/${id}/onay`, { method:'PUT', body: JSON.stringify({ durum:'reddedildi', onay_notu: notu||null }) });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async iptal(id) {
      if (!confirm('Bu talebi iptal etmek istediğinizden emin misiniz?')) return;
      try {
        await apiFetch(`/izin/${id}`, { method:'DELETE' });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    modalKapat() {
      document.getElementById('izin-modal').classList.add('gizli');
    },
  };
})();

function hesaplaGun(e) {
  const b = document.querySelector('[name="baslangic_tarihi"]')?.value;
  const s = document.querySelector('[name="bitis_tarihi"]')?.value;
  const el = document.getElementById('gun-hesap');
  if (!el) return;
  if (b && s && s >= b) {
    const gun = gunHesapla(b, s);
    el.textContent = `→ ${gun} iş günü`;
  } else { el.textContent = ''; }
}

function gunHesapla(bas, bit) {
  let toplam = 0;
  const d = new Date(bas);
  const son = new Date(bit);
  while (d <= son) { if (d.getDay() > 0 && d.getDay() < 6) toplam++; d.setDate(d.getDate()+1); }
  return toplam;
}
