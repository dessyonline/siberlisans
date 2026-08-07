/**
 * SiberLisans SSO Entegrasyonu v2
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
        // URL'den tokenı temizle, ancak aynı sayfada kal (yönlendirme yapma)
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        console.log("[SSO] URL temizlendi, doğrulama devam ediyor...");
    }

    const token = localStorage.getItem('cyberlab_sso_token');

    // Eğer sso.tsx üzerinden geldiysek ve hala sso sayfasındaysak yönlendirme yapma
    if (window.location.pathname.includes('/cyberlab/sso')) {
        return;
    }

    if (token) {
        console.log("[SSO] Token bulundu, backend doğrulaması yapılıyor...");
        
        // CSS ile önceden gizlemeyi garantile (siber-sso scripti head'de olduğu için etkili olur)
        const style = document.createElement('style');
        style.innerHTML = `
            #login-screen { display: none !important; opacity: 0 !important; pointer-events: none !important; }
            #linux-desktop { display: block !important; opacity: 1 !important; visibility: visible !important; }
            #boot-screen { display: none !important; }
        `;
        document.head.appendChild(style);
        
        fetch('/api/public/cyberlab/verify?token=' + encodeURIComponent(token))
            .then(res => {
                if (!res.ok) throw new Error("Backend error: " + res.status);
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    console.log("[SSO] Giriş başarılı:", data.user.name);
                    localStorage.setItem('cyberlab_user', JSON.stringify(data.user));
                    
                    // DOM'un yüklenmesini bekle (eğer script head'deyse)
                    const applyUI = () => {
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
                        const desktop = document.getElementById('linux-desktop');
                        const loginScreen = document.getElementById('login-screen');
                        
                        if (desktop) {
                            desktop.style.setProperty('display', 'block', 'important');
                            desktop.style.setProperty('opacity', '1', 'important');
                        }
                        if (loginScreen) {
                            loginScreen.style.setProperty('display', 'none', 'important');
                            loginScreen.classList.remove('active');
                        }

                        // CyberLab global fonksiyonlarını tetikle
                        if (typeof window.showBootScreen === 'function') {
                            // Boot screen'i atla veya hemen bitir
                            console.log("[SSO] Boot screen tetikleniyor/atlanıyor");
                        }
                        
                        // CyberLab'in statik index.html içindeki "app.js" veya benzeri başlatıcılarını bekle
                        // Bazı sistemlerde login screen'i app.js tekrar açabilir, onu engellemek için periyodik kontrol
                        let checks = 0;
                        const finalForce = setInterval(() => {
                            const ls = document.getElementById('login-screen');
                            if (ls && ls.style.display !== 'none') {
                                ls.style.setProperty('display', 'none', 'important');
                                if (document.getElementById('linux-desktop')) {
                                    document.getElementById('linux-desktop').style.setProperty('display', 'block', 'important');
                                }
                            }
                            if (++checks > 20) clearInterval(finalForce);
                        }, 500);
                    };

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', applyUI);
                    } else {
                        applyUI();
                    }
                } else {
                    console.error("[SSO] Geçersiz token:", data.error);
                    style.remove(); // Hatalıysa login ekranına izin ver
                    handleAuthFailure();
                }
            })
            .catch(err => {
                console.error("[SSO] Doğrulama hatası:", err);
                style.remove();
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
            'index.html', 
            'academy.html', 
            'courses.html', 
            'tools.html', 
            'ranks.html', 
            'profile.html',
            'admin.html'
        ];
        
        const isProtectedFile = protectedFiles.some(file => path.includes(file));
        const isRoot = path === '/cyberlab/' || path === '/cyberlab' || path.endsWith('/cyberlab/index.html');
        
        return isProtectedFile || isRoot;
    }
})();