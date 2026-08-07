/**
 * SiberLisans SSO Entegrasyonu
 * Bu dosya CyberLab'in siberlisans.com ile oturum paylaşmasını sağlar.
 */

(function() {
    console.log("[SSO] Entegrasyon başlatıldı");

    // SSO tokenını kontrol et
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || localStorage.getItem('cyberlab_sso_token');

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
        // SiberLisans API'sine doğrulat (CORS gerekebilir, siberlisans.com altında olduğu için sorun olmamalı)
        fetch('/api/public/cyberlab/verify?token=' + encodeURIComponent(token))
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    console.log("[SSO] Giriş başarılı:", data.claims.name);
                    localStorage.setItem('cyberlab_user', JSON.stringify(data.claims));
                    localStorage.setItem('cyberlab_sso_token', token);
                    
                    // URL'den tokenı temizle
                    if (window.location.search.includes('token=')) {
                        const newUrl = window.location.origin + window.location.pathname;
                        window.history.replaceState({}, document.title, newUrl);
                    }
                    
                    // Arayüzü güncelle (Kullanıcı adı vb.)
                    const userElement = document.querySelector('.user-name');
                    if (userElement) userElement.textContent = data.claims.name;
                } else {
                    console.error("[SSO] Geçersiz token");
                    // window.location.href = '/cyberlab';
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
            });
    } else {
        console.log("[SSO] Token bulunamadı.");
        // Eğer index.html'deysek ve token yoksa korumalı sayfalardan atabiliriz
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/cyberlab/') {
            // Opsiyonel: Giriş sayfasına yönlendir
        }
    }
})();
