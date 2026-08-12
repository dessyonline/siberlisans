/**
 * SiberLisans SSO Entegrasyonu v2.3
 * Bu dosya CyberLab'in siberlisans.com ile oturum paylaşmasını sağlar.
 */

(function() {
    console.log("[SSO] Entegrasyon başlatıldı");

    // SSO tokenını kontrol et (hem Query hem de Hash üzerinden)
    const params = new URLSearchParams(window.location.search);
    let tokenFromUrl = params.get('token');
    
    // Eğer query'de yoksa hash'e bak (bazı routerlar hash kullanabiliyor)
    if (!tokenFromUrl && window.location.hash.includes('token=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        tokenFromUrl = hashParams.get('token');
    }
    
    if (tokenFromUrl) {
        console.log("[SSO] URL'den token alındı:", tokenFromUrl.substring(0, 10) + "...");
        localStorage.setItem('cyberlab_sso_token', tokenFromUrl);
        // URL'den tokenı temizle (loopları önlemek için önemli)
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log("[SSO] URL temizlendi, doğrulama başlıyor.");
    }

    const token = localStorage.getItem('cyberlab_sso_token');

    // Eğer sso.tsx üzerinden geldiysek ve hala sso sayfasındaysak (siberlisans tarafı)
    if (window.location.pathname.includes('/cyberlab/sso')) {
        return;
    }

    // CSS ile önceden gizlemeyi garantile (token olsa da olmasa da boot screen'i kontrol etmeliyiz)
    const style = document.createElement('style');
    style.id = 'sso-force-style';
    style.innerHTML = `
        #login-screen, .login-wrapper, #boot-screen { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -1 !important; }
        #linux-desktop { display: none; }
        body.sso-authenticated #linux-desktop { display: block !important; opacity: 1 !important; visibility: visible !important; z-index: 100 !important; }
        body.sso-ready #login-screen { display: flex !important; opacity: 1 !important; visibility: visible !important; z-index: 100 !important; }
        body.sso-ready #boot-screen { display: none !important; }
    `;
    document.head.appendChild(style);

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
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
                            // Eğer bir modal veya overlay çıkarsa onu da kapat
                            const overlays = document.querySelectorAll('.modal-backdrop, .loading-overlay');
                            overlays.forEach(o => o.remove());
                            if (++checks > 50) clearInterval(finalForce);
                        }, 200);
                    };

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', applyUI);
                    } else {
                        applyUI();
                        window.addEventListener('load', applyUI);
                    }
                } else {
                    console.error("[SSO] Geçersiz token:", data.error);
                    handleAuthFailure();
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
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
        
        return protectedFiles.some(file => path.includes(file)) || path === '/cyberlab' || path === '/cyberlab/';
    }
})();

