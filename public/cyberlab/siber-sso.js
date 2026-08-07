/**
 * SiberLisans SSO Entegrasyonu
 * Bu dosya CyberLab'in siberlisans.com ile oturum paylaşmasını sağlar.
 */

(function() {
    console.log("[SSO] Entegrasyon başlatıldı");

    // SSO tokenını kontrol et
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    
    if (tokenFromUrl) {
        localStorage.setItem('cyberlab_sso_token', tokenFromUrl);
        // URL'den tokenı temizle
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    const token = localStorage.getItem('cyberlab_sso_token');

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
        fetch('/api/public/cyberlab/verify?token=' + encodeURIComponent(token))
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    console.log("[SSO] Giriş başarılı:", data.user.name);
                    localStorage.setItem('cyberlab_user', JSON.stringify(data.user));
                    
                    // Arayüzü güncelle (Kullanıcı adı vb.)
                    const userElements = document.querySelectorAll('.user-name, #profile-name, .kali-panel-user');
                    userElements.forEach(el => {
                        el.textContent = data.user.name;
                    });
                } else {
                    console.error("[SSO] Geçersiz token:", data.error);
                    localStorage.removeItem('cyberlab_sso_token');
                    window.location.href = '/cyberlab';
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
            });
    } else {
        console.log("[SSO] Token bulunamadı.");
        // Eğer index.html'deysek ve token yoksa ana sayfaya yönlendir
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/cyberlab/' || window.location.pathname === '/cyberlab') {
            alert("CyberLab erişimi için siberlisans.com üzerinden giriş yapmalısınız.");
            window.location.href = '/cyberlab';
        }
    }
})();
