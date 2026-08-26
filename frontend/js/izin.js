// ─── İzin Yönetimi Modülü ──────────────────────────────────────────
const IzinModul = (() => {
  let personeller = [];
  let filtreDurum = '';
  let filtreTur = '';

  // ─── Demo verisi ───────────────────────────────────────────────────
  const bugun = new Date();
  const yil = bugun.getFullYear();
  const DEMO_TALEPLER = [
    { id:1, personel_id:1, personel_ad:'Ayşe Kaya', personel_departman:'Yazılım', tur:'yillik', baslangic_tarihi:`${yil}-06-10`, bitis_tarihi:`${yil}-06-14`, gun_sayisi:5, aciklama:'Yaz tatili', durum:'onaylandi', onaylayan:'Sistem Yöneticisi', onay_tarihi:`${yil}-05-20`, onay_notu:'Onaylandı.' },
    { id:2, personel_id:2, personel_ad:'Mehmet Demir', personel_departman:'Yazılım', tur:'mazeret', baslangic_tarihi:`${yil}-07-01`, bitis_tarihi:`${yil}-07-01`, gun_sayisi:1, aciklama:'Aile ziyareti', durum:'beklemede', onaylayan:null, onay_tarihi:null, onay_notu:null },
    { id:3, personel_id:3, personel_ad:'Zeynep Arslan', personel_departman:'İnsan Kaynakları', tur:'hastalik', baslangic_tarihi:`${yil}-05-03`, bitis_tarihi:`${yil}-05-05`, gun_sayisi:3, aciklama:'Grip', durum:'onaylandi', onaylayan:'Sistem Yöneticisi', onay_tarihi:`${yil}-05-02`, onay_notu:null },
    { id:4, personel_id:4, personel_ad:'Ali Yıldız', personel_departman:'Muhasebe', tur:'yillik', baslangic_tarihi:`${yil}-08-18`, bitis_tarihi:`${yil}-08-29`, gun_sayisi:10, aciklama:'Yaz tatili', durum:'beklemede', onaylayan:null, onay_tarihi:null, onay_notu:null },
    { id:5, personel_id:2, personel_ad:'Mehmet Demir', personel_departman:'Yazılım', tur:'yillik', baslangic_tarihi:`${yil}-03-15`, bitis_tarihi:`${yil}-03-19`, gun_sayisi:5, aciklama:'Kısa tatil', durum:'reddedildi', onaylayan:'Sistem Yöneticisi', onay_tarihi:`${yil}-03-10`, onay_notu:'Proje kritik dönemde.' },
  ];
  const DEMO_BAKIYE = { yil, hak:14, kullanilan:5, kalan:9 };
  const DEMO_PERSONEL = [
    { id:1, ad:'Ayşe', soyad:'Kaya' }, { id:2, ad:'Mehmet', soyad:'Demir' },
    { id:3, ad:'Zeynep', soyad:'Arslan' }, { id:4, ad:'Ali', soyad:'Yıldız' },
    { id:5, ad:'Fatma', soyad:'Çelik' },
  ];

  const TUR_ETIKET = { yillik:'Yıllık İzin', mazeret:'Mazeret', hastalik:'Hastalık', ucretsiz:'Ücretsiz', dogum:'Doğum', olum:'Ölüm', diger:'Diğer' };
  const TUR_RENK   = { yillik:'#4F6EF7', mazeret:'#F59E0B', hastalik:'#EF4444', ucretsiz:'#6B7280', dogum:'#EC4899', olum:'#374151', diger:'#8B5CF6' };
  const DURUM_ETIKET = { beklemede:'Beklemede', onaylandi:'Onaylandı', reddedildi:'Reddedildi', iptal:'İptal' };
  const DURUM_RENK   = { beklemede:'#F59E0B', onaylandi:'#22C55E', reddedildi:'#EF4444', iptal:'#9CA3AF' };

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
      <div class="izin-stat-kart" style="border-left:3px solid #8B5CF6; grid-column: span 1;">
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
    const talepler = data ? data.veriler : DEMO_TALEPLER;
    const bakiye  = await apiFetch('/izin/bakiye/1') || DEMO_BAKIYE;
    listeRender(talepler, bakiye);
  }

  function personelOptions() {
    const list = personeller.length ? personeller : DEMO_PERSONEL;
    return list.map(p => `<option value="${p.id}">${p.ad} ${p.soyad}</option>`).join('');
  }

  return {
    async yukle() {
      const data = await apiFetch('/personel?limit=100');
      personeller = data ? data.veriler : DEMO_PERSONEL;
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
          const res = await apiFetch('/izin', { method:'POST', body: JSON.stringify(veri) });
          if (!res) {
            const list = DEMO_PERSONEL.find(p=>p.id===veri.personel_id);
            DEMO_TALEPLER.unshift({ id: Date.now(), ...veri,
              personel_ad: list ? `${list.ad} ${list.soyad}` : '', personel_departman:'',
              gun_sayisi: gunHesapla(veri.baslangic_tarihi, veri.bitis_tarihi),
              durum:'beklemede', onaylayan:null, onay_tarihi:null, onay_notu:null });
          }
          this.modalKapat();
          yukleVeRender();
        } catch(err) { hata.textContent = err.message; hata.classList.remove('gizli'); }
      });

      document.getElementById('izin-modal').classList.remove('gizli');
    },

    async onayla(id) {
      const notu = prompt('Onay notu (isteğe bağlı):') ?? '';
      try {
        const res = await apiFetch(`/izin/${id}/onay`, { method:'PUT', body: JSON.stringify({ durum:'onaylandi', onay_notu: notu||null }) });
        const t = DEMO_TALEPLER.find(x=>x.id===id);
        if (t) { t.durum='onaylandi'; t.onaylayan='Sistem Yöneticisi'; t.onay_notu=notu||null; }
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async reddet(id) {
      const notu = prompt('Ret sebebi:');
      if (notu === null) return;
      try {
        const res = await apiFetch(`/izin/${id}/onay`, { method:'PUT', body: JSON.stringify({ durum:'reddedildi', onay_notu: notu||null }) });
        const t = DEMO_TALEPLER.find(x=>x.id===id);
        if (t) { t.durum='reddedildi'; t.onaylayan='Sistem Yöneticisi'; t.onay_notu=notu||null; }
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async iptal(id) {
      if (!confirm('Bu talebi iptal etmek istediğinizden emin misiniz?')) return;
      try {
        await apiFetch(`/izin/${id}`, { method:'DELETE' });
        const t = DEMO_TALEPLER.find(x=>x.id===id);
        if (t) t.durum = 'iptal';
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
