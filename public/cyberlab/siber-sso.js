/**
 * SiberLisans SSO Entegrasyonu v2.2
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
        // URL'den tokenı temizle (yönlendirme döngüsünü engellemek için önemli)
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        console.log("[SSO] URL temizlendi, doğrulama devam ediyor...");
    }

    const token = localStorage.getItem('cyberlab_sso_token');

    // Eğer sso.tsx üzerinden geldiysek ve hala sso sayfasındaysak (siberlisans tarafı)
    if (window.location.pathname.includes('/cyberlab/sso')) {
        return;
    }

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
        // CSS ile önceden gizlemeyi garantile
        const style = document.createElement('style');
        style.id = 'sso-force-style';
        style.innerHTML = `
            #login-screen, .login-wrapper, #boot-screen { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -1 !important; }
            #linux-desktop { display: block !important; opacity: 1 !important; visibility: visible !important; z-index: 100 !important; }
        `;
        document.head.appendChild(style);
        
        // /api/public/cyberlab/verify adresine istek at
        fetch('/api/public/cyberlab/verify?token=' + encodeURIComponent(token))
            .then(res => {
                if (!res.ok) throw new Error("Backend error: " + res.status);
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    console.log("[SSO] Giriş başarılı:", data.user.name);
                    localStorage.setItem('cyberlab_user', JSON.stringify(data.user));
                    
                    const applyUI = () => {
                        console.log("[SSO] Arayüz uygulanıyor...");
                        document.body.classList.add('sso-authenticated');
                        document.body.classList.remove('sso-ready');
                        
                        // Arayüzü güncelle
                        const userElements = document.querySelectorAll('.user-name, #profile-name, .kali-panel-user, #kali-user-name, #kali-user-avatar');
                        userElements.forEach(el => {
                            if (el.id === 'kali-user-avatar') {
                                el.textContent = data.user.name.charAt(0).toUpperCase();
                            } else {
                                el.textContent = data.user.name;
                            }
                        });
                        
                        if (document.getElementById('kali-user-role')) {
                            document.getElementById('kali-user-role').textContent = data.user.email;
                        }

                        // CyberLab'in kendi yükleme mantığını zorla kapat
                        const forceVisibility = () => {
                            const desktop = document.getElementById('linux-desktop');
                            const loginScreen = document.getElementById('login-screen');
                            const bootScreen = document.getElementById('boot-screen');
                            
                            if (desktop) {
                                desktop.style.setProperty('display', 'block', 'important');
                                desktop.style.setProperty('opacity', '1', 'important');
                                desktop.style.setProperty('visibility', 'visible', 'important');
                            }
                            if (loginScreen) {
                                loginScreen.style.setProperty('display', 'none', 'important');
                                loginScreen.classList.remove('active');
                            }
                            if (bootScreen) {
                                bootScreen.style.setProperty('display', 'none', 'important');
                            }
                        };

                        forceVisibility();

                        // Periyodik kontrol (CyberLab app.js yüklenince bazı elementleri ezebiliyor)
                        let checks = 0;
                        const finalForce = setInterval(() => {
                            forceVisibility();
                            // Uygulama tamamen yüklenmişse veya 10 saniye geçmişse dur
                            if (++checks > 50) clearInterval(finalForce);
                        }, 200);
                    };

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', applyUI);
                    } else {
                        applyUI();
                        // Sayfa tam yüklenince tekrar çalıştır (scriptlerin çakışmasını engellemek için)
                        window.addEventListener('load', applyUI);
                    }
                } else {
                    console.error("[SSO] Geçersiz token:", data.error);
                    const forceStyle = document.getElementById('sso-force-style');
                    if (forceStyle) forceStyle.remove();
                    handleAuthFailure();
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
                const forceStyle = document.getElementById('sso-force-style');
                if (forceStyle) forceStyle.remove();
                document.body.classList.add('sso-ready');
            });
    } else {
        console.log("[SSO] Token bulunamadı.");
        if (isProtectedPath()) {
            console.log("[SSO] Korumalı alan, giriş sayfasına yönlendiriliyor...");
            window.location.href = '/cyberlab';
        } else {
            document.body.classList.add('sso-ready');
        }
    }

    function handleAuthFailure() {
        localStorage.removeItem('cyberlab_sso_token');
        localStorage.removeItem('cyberlab_user');
        if (isProtectedPath()) {
            window.location.href = '/cyberlab';
        } else {
            document.body.classList.add('sso-ready');
        }
    }

    function isProtectedPath() {
        const path = window.location.pathname;
        const protectedFiles = [
            'academy.html', 
            'courses.html', 
            'tools.html', 
            'ranks.html', 
            'profile.html',
            'admin.html',
            'index.html'
        ];
        
        // Ana sayfa veya korumalı html dosyaları
        return protectedFiles.some(file => path.includes(file)) || path === '/cyberlab' || path === '/cyberlab/';
    }
})();
