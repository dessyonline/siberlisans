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
        console.log("[SSO] URL'den token alındı");
        localStorage.setItem('cyberlab_sso_token', tokenFromUrl);
        // URL'den tokenı temizle (sonsuz döngüyü engellemek için önemli)
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    const token = localStorage.getItem('cyberlab_sso_token');

    // Eğer sso.tsx üzerinden geldiysek ve hala sso sayfasındaysak yönlendirme yapma,
    // sso.tsx zaten window.location.href = "/cyberlab/index.html" yapıyor.
    if (window.location.pathname.includes('/cyberlab/sso')) {
        return;
    }

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
        // Proxy üzerinden çağrıldığında path relativite sorunu olmaması için mutlak yol
        fetch('/api/public/cyberlab/verify?token=' + encodeURIComponent(token))
            .then(res => {
                if (!res.ok) throw new Error("Backend error: " + res.status);
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    console.log("[SSO] Giriş başarılı:", data.user.name);
                    localStorage.setItem('cyberlab_user', JSON.stringify(data.user));
                    
                    // Arayüzü güncelle (Kullanıcı adı vb.)
                    const userElements = document.querySelectorAll('.user-name, #profile-name, .kali-panel-user, #kali-user-name');
                    userElements.forEach(el => {
                        el.textContent = data.user.name;
                    });
                    
                    if (document.getElementById('kali-user-role')) {
                        document.getElementById('kali-user-role').textContent = data.user.email;
                    }

                    // Başarılı girişten sonra login ekranını kapatıp masaüstünü göster
                    document.body.classList.add('sso-authenticated');
                    document.body.classList.remove('sso-ready');
                    
                    // CyberLab'in kendi yükleme animasyonlarını tetiklemesi için küçük bir gecikme
                    setTimeout(() => {
                        if (typeof window.showBootScreen === 'function') {
                            window.showBootScreen();
                        } else if (document.getElementById('login-screen')) {
                            document.getElementById('login-screen').classList.remove('active');
                            document.getElementById('linux-desktop').style.display = 'block';
                        }
                    }, 500);
                } else {
                    console.error("[SSO] Geçersiz token:", data.error);
                    localStorage.removeItem('cyberlab_sso_token');
                    localStorage.removeItem('cyberlab_user');
                    // Sadece korumalı sayfalardaysak yönlendir
                    if (isProtectedPath()) {
                        window.location.href = '/cyberlab';
                    } else {
                        document.body.classList.add('sso-ready');
                    }
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
                document.body.classList.add('sso-ready');
            });
    } else {
        console.log("[SSO] Token bulunamadı.");
        // Sadece korumalı sayfalardaysak ve token yoksa ana sayfaya yönlendir
        if (isProtectedPath()) {
            console.log("[SSO] Korumalı alan, giriş sayfasına yönlendiriliyor...");
            window.location.href = '/cyberlab';
        } else {
            document.body.classList.add('sso-ready');
        }
    }

    function isProtectedPath() {
        const path = window.location.pathname;
        const protectedFiles = [
            'index.html', 
            'academy.html', 
            'courses.html', 
            'tools.html', 
            'ranks.html', 
            'profile.html',
            'admin.html'
        ];
        
        // Eğer path korumalı dosyalardan birini içeriyorsa
        const isProtectedFile = protectedFiles.some(file => path.includes(file));
        const isRoot = path === '/cyberlab/' || path === '/cyberlab';
        
        return isProtectedFile || isRoot;
    }
})();