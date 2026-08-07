/* =============================================
   CYBERLAB — app.js v3 (Gerçek Backend)
   SiberPhp — 108 Modül / WebSocket Terminal
   ============================================= */

// ─── Backend Bağlantısı ──────────────────────
const BACKEND = window.location.origin;
let socket = null;
let backendOnline = false;
let socketOnline = false;

function connectSocket() {
  try {
    if (socket) return;
    socket = io(BACKEND, { transports: ["polling"], withCredentials: true, reconnection: false, timeout: 2500 });
    socket.on("connect", () => {
      socketOnline = true;
      backendOnline = true;
      updateStatusBadge(true);
      console.log("[WS] Bağlandı → " + BACKEND);
      // Install listeners — bir kez bağla
      if (!socket._installListenersAdded) {
        initInstallListeners();
        socket._installListenersAdded = true;
      }
    });
    socket.on("disconnect", () => {
      socketOnline = false;
      checkBackendAvailability();
    });
    socket.on("output", (data) => {
      if (data.text === "__CLEAR__") {
        document.getElementById("terminal-body").innerHTML = "";
        return;
      }
      addLine(data.text, data.type || "");
    });
    socket.on("connect_error", () => {
      socketOnline = false;
      checkBackendAvailability();
    });
  } catch (e) {
    socketOnline = false;
    checkBackendAvailability();
  }
}

async function checkBackendAvailability() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    backendOnline = response.ok;
  } catch (_) {
    backendOnline = false;
  }
  updateStatusBadge(backendOnline);
  return backendOnline;
}

function updateStatusBadge(online) {
  const badge = document.querySelector(".status-badge");
  if (!badge) return;
  if (online) {
    badge.className = "status-badge online";
    badge.innerHTML = `<span class="status-dot"></span>${socketOnline ? 'Backend Aktif' : 'Backend HTTP Aktif'}`;
  } else {
    badge.className = "status-badge offline";
    badge.innerHTML = '<span class="status-dot"></span>Offline Mod';
  }
}

// ─── Kimlik doğrulama ────────────────────────
let authCsrfToken = null;
let authMode = 'login';

async function authRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authCsrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) {
    headers['X-CSRF-Token'] = authCsrfToken;
  }
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'İşlem tamamlanamadı.');
  return payload;
}

// ─── Tüm Modüller ─────────────────────────────
const ALL_MODULES = [

  // ══════ KEŞIF & RECON ══════
  {
    cat: 'recon', tag: 'RECON', tool: 'searchsploit',
    name: 'Exploit Tarama Otomasyonu',
    desc: 'Searchsploit kullanarak hedef yazılım veya versiyona ait exploit taraması gerçekleştirir.',
    cmd: 'python3 siberphp.py --searchsploit {hedef/versiyon}',
    param: 'Yazılım adı veya versiyon (örn: apache 2.4.49)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'nmap',
    name: 'Port Tarama Aracı',
    desc: 'NMAP otomasyonunu gelişmiş biçimde sağlar. Hızlı, tam, açık, servis, versiyon ve OS tarama seçenekleri sunar.',
    cmd: 'python3 siberphp.py --nmap {hedef}',
    param: 'IP adresi veya domain (örn: 192.168.1.1)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'wafw00f',
    name: 'Güvenlik Duvarı Tespit Aracı',
    desc: 'wafw00f ile hedef site üzerindeki WAF (Web Application Firewall) güvenlik duvarını tespit eder.',
    cmd: 'python3 siberphp.py --wafw00f {hedef}',
    param: 'Hedef URL (örn: https://example.com)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'nikto',
    name: 'Zaafiyet Analiz Aracı (Nikto)',
    desc: 'Nikto ile web sunucusuna yönelik kapsamlı zaafiyet analizi yapar.',
    cmd: 'python3 siberphp.py --nikto {hedef}',
    param: 'Hedef URL veya IP',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'lynis',
    name: 'Zaafiyet Analiz Aracı 2 (Lynis)',
    desc: 'Lynis ile sistem genelinde derinlemesine güvenlik ve zaafiyet analizi yapar.',
    cmd: 'python3 siberphp.py --lynis',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'ike-scan',
    name: 'Hedef IP VPN Kontrol',
    desc: 'ike-scan kullanarak hedef IP adresinde VPN/IPSec hizmetini kontrol eder.',
    cmd: 'python3 siberphp.py --ike {hedef-ip}',
    param: 'Hedef IP adresi',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'whois',
    name: 'WhoIs Sorgulama',
    desc: 'Belirtilen domain adresinin WhoIs sorgu sonucunu getirir ve gösterir.',
    cmd: 'python3 siberphp.py --whois {domain}',
    param: 'Domain adı (örn: example.com)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'dns',
    name: 'DNS Bilgi Toplama',
    desc: 'Belirtilen domain adresinin DNS kayıtlarını (A, MX, NS, TXT vb.) getirir.',
    cmd: 'python3 siberphp.py --dns {domain}',
    param: 'Domain adı',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'ssl',
    name: 'SSL Analizi',
    desc: 'Belirtilen sitenin SSL sertifika bilgilerini, geçerlilik tarihini ve zayıflıklarını gösterir.',
    cmd: 'python3 siberphp.py --ssl {domain}',
    param: 'Domain adı',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'site-ip',
    name: 'Site IP Bulma',
    desc: 'Belirtilen sitenin IP adresini bulur.',
    cmd: 'python3 siberphp.py --siteip {domain}',
    param: 'Domain adı',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'subdomain',
    name: 'Subdomain Listeleyici',
    desc: 'Wordlist kullanarak belirtilen domain üzerindeki alt domainleri dinamik olarak bulmaya çalışır.',
    cmd: 'python3 siberphp.py --subdomain {domain}',
    param: 'Domain adı',
  },

  // ══════ AĞ SALDIRISI ══════
  {
    cat: 'network', tag: 'NETWORK', tool: 'python3',
    name: 'Anormal DNS Tespit Edici',
    desc: 'Ağ üzerinde belirlediğiniz istek sınırını aşan kullanıcıları listeler.',
    cmd: 'python3 siberphp.py --dns-detect {limit}',
    param: 'İstek sınırı (örn: 100)',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'python3',
    name: 'DNS Yönlendirici',
    desc: 'Belirlediğiniz IP adresine DNS yönlendirme saldırısı yapar. Ağı dinleyebilirsiniz.',
    cmd: 'python3 siberphp.py --dns-spoof {hedef-ip}',
    param: 'Hedef IP adresi',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'scapy',
    name: 'Wifi Dinleyicisi 1',
    desc: 'Ağ üzerinde devamlı dinleme işlemi uygulayarak paket yönlendirmelerini listeler.',
    cmd: 'python3 siberphp.py --sniff1 {interface}',
    param: 'Ağ arayüzü (örn: wlan0)',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'scapy',
    name: 'Wifi Dinleyicisi 2',
    desc: 'İlk seçenekten farklı bir paket yakalama ve dinleme yöntemi uygular.',
    cmd: 'python3 siberphp.py --sniff2 {interface}',
    param: 'Ağ arayüzü (örn: eth0)',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'python3',
    name: 'Network Reaper (Dinleyici)',
    desc: 'Ağdaki paketlerin tümünü veya filtrelenmiş kısmını dinleyip dosyaya kaydeder. HTTP siteleri ve resimleri çözümlenir.',
    cmd: 'python3 siberphp.py --network-reaper {interface}',
    param: 'Ağ arayüzü',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'nmap',
    name: 'Wifi Port Tarayıcı',
    desc: 'WiFi ağı üzerindeki cihazlara port taraması yapar.',
    cmd: 'python3 siberphp.py --wifi-portscan {subnet}',
    param: 'Subnet (örn: 192.168.1.0/24)',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'ip-api',
    name: 'IP Adresinden Bilgi Toplama',
    desc: 'Belirtilen IP adresine bağlı konum, ISP ve detaylı bilgileri gösterir.',
    cmd: 'python3 siberphp.py --ipinfo {ip}',
    param: 'IP adresi',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'shodan-api',
    name: 'IP Adresi Zafiyet Analizi',
    desc: 'API kullanarak IP adresi üzerinden açık port ve zafiyet analizi gerçekleştirir.',
    cmd: 'python3 siberphp.py --ipvuln {ip}',
    param: 'IP adresi',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'mac-changer',
    name: 'MAC Adresi Değiştirme',
    desc: 'mac-changer ile 3 farklı MAC değiştirme seçeneğine erişir: rastgele, belirli ve orijinal.',
    cmd: 'python3 siberphp.py --macchanger {interface}',
    param: 'Ağ arayüzü (örn: eth0)',
  },
  {
    cat: 'network', tag: 'NETWORK', tool: 'traceroute',
    name: 'Traceroute',
    desc: 'Bir paketin kaynaktan hedefe giden yolunu gösterir. Python ile yazılmış gelişmiş versiyon.',
    cmd: 'python3 siberphp.py --traceroute {hedef}',
    param: 'Hedef IP veya domain',
  },

  // ══════ KABLOSUZ ══════
  {
    cat: 'wireless', tag: 'WIRELESS', tool: 'aircrack-ng',
    name: 'Handshake Decrypter',
    desc: 'aircrack-ng ile belirtilen wordlist ve handshake dosyalarını kullanarak WiFi şifresini bulmaya çalışır.',
    cmd: 'python3 siberphp.py --handshake {handshake-file} {wordlist}',
    param: 'Handshake dosyası yolu',
  },
  {
    cat: 'wireless', tag: 'WIRELESS', tool: 'bluetooth',
    name: 'Blue-Cough (Bluetooth)',
    desc: 'Bluetooth cihazların port adreslerini tarar. İstenen cihazın sinyalini kesme ve gelişmiş Bluetooth saldırı seçenekleri sunar.',
    cmd: 'python3 siberphp.py --bluecough',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'wireless', tag: 'WIRELESS', tool: 'esp32/esp8266',
    name: 'SiberPhp Twin (Evil Twin)',
    desc: 'ESP32 veya ESP8266 kullanarak ağın ikizini oluşturur. Kullanıcılar oturum açmaya yönlendirilir ve veriler toplanır.',
    cmd: 'python3 siberphp.py --twin {ssid}',
    param: 'Hedef SSID adı',
  },
  {
    cat: 'wireless', tag: 'WIRELESS', tool: 'raspberry-pico',
    name: 'Raspberry Pi Pico Hack',
    desc: 'Pi Pico\'yu siber güvenlik aracına dönüştürür. WiFi şifre çekme, dosya indirtme, antivirüs kapatma, URL açma, cihaz kapatma payload\'ları.',
    cmd: 'python3 siberphp.py --pico {payload-no}',
    param: 'Payload numarası (1-5)',
  },

  // ══════ WEB GÜVENLİĞİ ══════
  {
    cat: 'web', tag: 'WEB', tool: 'sqlmap',
    name: 'Veritabanı Çalma Aracı',
    desc: 'SQLMap otomasyonu ile veritabanı çalma işlemi gerçekleştirir. Tablo ve sütun keşfi yapar.',
    cmd: 'python3 siberphp.py --sqlmap {url}',
    param: 'Hedef URL (form veya parametre içeren)',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Admin Panel Tara (Statik)',
    desc: 'Girilen sitenin admin panelinin sahip olabileceği yüzlerce linki listeler ve test eder.',
    cmd: 'python3 siberphp.py --admin-static {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Admin Panel Bulucu (Dinamik)',
    desc: 'Belirtilen sitenin admin panelini, en çok tercih edilen yolları deneyerek dinamik biçimde bulmaya çalışır.',
    cmd: 'python3 siberphp.py --admin-dynamic {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Directory Fuzzer',
    desc: 'Belirtilen wordlist içerisindeki yolların, hedef site üzerinde olup olmadığını deneyerek kontrol eder.',
    cmd: 'python3 siberphp.py --dirfuzz {url} {wordlist}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Dizin Listeleyici',
    desc: 'Wordlist kullanarak belirtilen sitedeki olası dizinleri tarar ve bulunanları detaylarıyla gösterir.',
    cmd: 'python3 siberphp.py --dirlist {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Site Fuzzing Aracı (Rastgele)',
    desc: 'Belirtilen siteye farklı rastgele parametreler göndererek nasıl yanıt verdiğini kontrol eder.',
    cmd: 'python3 siberphp.py --sitefuzz {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'beautifulsoup',
    name: 'Sitedeki Linkleri Çekme',
    desc: 'Belirtilen site üzerindeki tüm bağlantıları listeler.',
    cmd: 'python3 siberphp.py --links {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'beautifulsoup',
    name: 'Sitedeki Yazıları Çekme',
    desc: 'Belirtilen site üzerindeki paragrafları ve metin içeriklerini listeler.',
    cmd: 'python3 siberphp.py --text {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'beautifulsoup',
    name: 'Sitedeki Resim Yollarını Çekme',
    desc: 'Belirtilen site üzerindeki tüm resim URL ve yollarını listeler.',
    cmd: 'python3 siberphp.py --images {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'beautifulsoup',
    name: 'Gelişmiş Web Scraper',
    desc: 'Etiket filtreleme, etiket gösterme, sayfa içeriği kaydetme gibi gelişmiş özelliklerle web scraping yapar.',
    cmd: 'python3 siberphp.py --scraper {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'python3',
    name: 'Site Kaynak Kodu Çekme',
    desc: 'Belirtilen sitenin kaynak kodunu çekip kaydeder.',
    cmd: 'python3 siberphp.py --source {url}',
    param: 'Hedef URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'firebase',
    name: 'Firebase Reaper',
    desc: 'Belirtilen Firebase sunucusundan JSON türünde veri çeker ve kaydeder.',
    cmd: 'python3 siberphp.py --firebase {firebase-url}',
    param: 'Firebase URL',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'index-builder',
    name: 'Index Oluşturucu',
    desc: 'Kullanıcının yönergelerine göre web sayfası oluşturur.',
    cmd: 'python3 siberphp.py --index-build',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'web', tag: 'WEB', tool: 'is.gd/tinyurl',
    name: 'Link Kısaltma Servisleri',
    desc: 'is.gd veya TinyURL ile istenen linki kısaltır.',
    cmd: 'python3 siberphp.py --shortlink {url}',
    param: 'Kısaltılacak URL',
  },

  // ══════ OSINT ══════
  {
    cat: 'osint', tag: 'OSINT', tool: 'api',
    name: 'Telefon Numarasından Şehir Bulma',
    desc: 'Yurt dışı telefon numaralarının bağlı olduğu şehri ve ülkeyi gösterir.',
    cmd: 'python3 siberphp.py --phoneinfo {numara}',
    param: 'Telefon numarası (ülke koduyla)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'api',
    name: 'Rastgele İnsan Verisi Üret',
    desc: 'API kullanarak rastgele kişi verisi (isim, adres, email vb.) üretir.',
    cmd: 'python3 siberphp.py --randomhuman',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'api',
    name: 'Rastgele İnsan Gönderisi Üret',
    desc: 'API kullanarak rastgele sosyal medya gönderisi oluşturur.',
    cmd: 'python3 siberphp.py --randompost',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'api',
    name: 'Mailin Geçerliliğini Kontrol',
    desc: 'API kullanarak belirtilen mail adresini dinler ve geçerliliğini kontrol eder.',
    cmd: 'python3 siberphp.py --mailcheck {email}',
    param: 'E-posta adresi',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'sherlock',
    name: 'Kullanıcı Adı ile Hesap Bulma (Statik)',
    desc: 'Statik olarak kullanıcı adından sosyal medya hesabı taraması yapar.',
    cmd: 'python3 siberphp.py --userfind-static {kullanici}',
    param: 'Kullanıcı adı',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'sherlock',
    name: 'Bilinen Kullanıcı Adını SM\'de Arama (Dinamik)',
    desc: 'Dinamik olarak hangi sitelerde belirtilen kullanıcı adıyla hesap açıldığını kontrol eder.',
    cmd: 'python3 siberphp.py --userfind-dynamic {kullanici}',
    param: 'Kullanıcı adı',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'openlibrary',
    name: 'ISBN Numarasından Bilgi (OpenLibrary)',
    desc: 'ISBN numarası üzerinden OpenLibrary servisi aracılığıyla kitap bilgisi toplar.',
    cmd: 'python3 siberphp.py --isbn-open {isbn}',
    param: 'ISBN numarası',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'google-books',
    name: 'ISBN Numarasından Bilgi (Google)',
    desc: 'Google Kitap API\'si kullanarak ISBN numarasından detaylı kitap bilgisi toplar.',
    cmd: 'python3 siberphp.py --isbn-google {isbn}',
    param: 'ISBN numarası',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'circl-api',
    name: 'CVE Numarasından Bilgi Toplama',
    desc: 'Circl servisinin API anahtarını kullanarak CVE numarasından bilgi toplar ve okunaklı gösterir.',
    cmd: 'python3 siberphp.py --cve {cve-no}',
    param: 'CVE numarası (örn: CVE-2021-44228)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'recon-ng',
    name: 'Recon-ng Web Recon',
    desc: 'Tam donanımlı web keşif (reconnaissance) çerçevesi. Veri toplama ve OSINT için kullanılır.',
    cmd: 'python3 siberphp.py --recon-ng {hedef}',
    param: 'Alan adı (örn: example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'h8mail',
    name: 'h8mail Sızıntı Tarayıcı',
    desc: 'Şifre sızıntıları (breach) ve OSINT veritabanları üzerinden e-posta taraması yapar.',
    cmd: 'python3 siberphp.py --h8mail {hedef_email}',
    param: 'E-posta adresi (örn: admin@example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'pwnedornot',
    name: 'pwnedOrNot Şifre Keşfi',
    desc: 'E-posta adresinin HaveIBeenPwned üzerinde sızdırılıp sızdırılmadığını kontrol eder ve sızdırılmışsa şifreleri bulur.',
    cmd: 'python3 siberphp.py --pwnedornot {hedef_email}',
    param: 'E-posta adresi (örn: admin@example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'email-analyzer',
    name: 'Email Header Analyzer',
    desc: 'Dışa aktarılan email başlıklarını daha okunaklı hale getirir ve ek bilgileri açığa çıkarır.',
    cmd: 'python3 siberphp.py --emailheader {header-dosyasi}',
    param: 'Email header dosyası yolu',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'exiftool',
    name: 'Exif İşlem Aracı',
    desc: 'Görsel dosyaların Exif verilerini görüntüler, düzenler ve siler.',
    cmd: 'python3 siberphp.py --exif {dosya}',
    param: 'Görsel dosya yolu',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'pdf-parser',
    name: 'PDF Dosyasından Bilgi Topla',
    desc: 'Seçilen PDF dosyasının metadata verilerini ve sayfalardaki tüm yazıları çıkarır. Metadata düzenleme destekler.',
    cmd: 'python3 siberphp.py --pdfinfo {dosya.pdf}',
    param: 'PDF dosyası yolu',
  },

  {
    cat: 'osint', tag: 'OSINT', tool: 'xposedornot-api',
    name: 'XposedOrNot — Sızdırılmış E-posta Kontrolü',
    desc: 'XposedOrNot API kullanarak bir e-posta adresinin veri ihlallerinde sızdırılıp sızdırılmadığını ücretsiz olarak kontrol eder.',
    cmd: 'python3 siberphp.py --xposedornot {email}',
    param: 'E-posta adresi (örn: user@example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'ghunt',
    name: 'GHunt — Google Hesap OSINT',
    desc: 'Google hesapları üzerinde açık kaynak istihbaratı (OSINT) yapan araç. Gmail, Google Maps, Calendar gibi servislerden bilgi toplar.',
    cmd: 'python3 siberphp.py --ghunt {gmail_adresi}',
    param: 'Gmail adresi (örn: user@gmail.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'holehe',
    name: 'Holehe — E-posta OSINT',
    desc: 'Bir e-posta adresinin Instagram, Twitter, Twitch, vb. 120+ sitede kayıtlı olup olmadığını tespit eder.',
    cmd: 'python3 siberphp.py --holehe {email_adresi}',
    param: 'E-posta adresi (örn: user@example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'maigret',
    name: 'Maigret — Sosyal Medya OSINT',
    desc: 'Bir kullanıcı adını 3000+ popüler site ve sosyal medya platformunda arayarak tüm profillerini bulur.',
    cmd: 'python3 siberphp.py --maigret {kullanici_adi}',
    param: 'Kullanıcı adı (örn: username)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'email2phonenumber',
    name: 'Email2PhoneNumber',
    desc: 'Bir e-posta adresiyle ilişkili telefon numarasını bulmaya çalışan gelişmiş bir OSINT aracı.',
    cmd: 'python3 siberphp.py --email2phonenumber {email_adresi}',
    param: 'E-posta adresi (örn: user@example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'chiasmodon',
    name: 'Chiasmodon',
    desc: 'Etki alanıyla ilgili verileri, e-postaları ve alt alan adlarını arayan OSINT aracı.',
    cmd: 'python3 siberphp.py --chiasmodon {domain}',
    param: 'Hedef Domain (örn: example.com)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'tookie-osint',
    name: 'Tookie-osint',
    desc: 'Gelişmiş OSINT sosyal medya hesabı bulma aracı.',
    cmd: 'python3 siberphp.py --tookie-osint {kullanici_adi}',
    param: 'Kullanıcı Adı (örn: username)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'spiderfoot',
    name: 'SpiderFoot',
    desc: 'Kapsamlı otomatik OSINT bilgi toplama aracı.',
    cmd: 'python3 siberphp.py --spiderfoot {hedef}',
    param: 'IP, Domain veya E-posta',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'snoop',
    name: 'Snoop',
    desc: '4000+ sitede kullanıcı adı araması yapan OSINT aracı.',
    cmd: 'python3 siberphp.py --snoop {kullanici_adi}',
    param: 'Kullanıcı Adı (örn: username)',
  },
  {
    cat: 'osint', tag: 'OSINT', tool: 'blackbird',
    name: 'Blackbird',
    desc: 'Sosyal ağlarda kullanıcı adıyla hesap arayan OSINT aracı.',
    cmd: 'python3 siberphp.py --blackbird {kullanici_adi}',
    param: 'Kullanıcı Adı (örn: username)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'amass',
    name: 'Amass',
    desc: 'Kapsamlı saldırı yüzeyi haritalama ve asset keşif aracı.',
    cmd: 'python3 siberphp.py --amass {domain}',
    param: 'Hedef Domain',
  },
  {
    cat: 'web', tag: 'SECURITY', tool: 'trufflehog',
    name: 'TruffleHog',
    desc: 'Git depolarında, dosya sistemlerinde ve S3 kovalarında şifre, gizli anahtar (secret) tarayan güçlü güvenlik aracı.',
    cmd: 'python3 siberphp.py --trufflehog git {hedef_repo_url}',
    param: 'Git Repo URL veya Local Yol',
  },
  {
    cat: 'recon', tag: 'SECURITY', tool: 'git-dumper',
    name: 'Git-Dumper',
    desc: 'Açık unutulmuş .git klasörlerini tespit edip tüm kaynak kodları indiren araç.',
    cmd: 'python3 siberphp.py --git-dumper {url} {hedef_klasor}',
    param: 'Hedef URL ve İndirilecek Klasör',
  },
  {
    cat: 'recon', tag: 'SECURITY', tool: 'gitminer',
    name: 'GitMiner',
    desc: 'GitHub üzerindeki açık kod depolarında gelişmiş siber güvenlik taraması ve veri madenciliği yapar.',
    cmd: 'python3 siberphp.py --gitminer -q {kelime}',
    param: 'Aranacak kelime veya sorgu',
  },
  {
    cat: 'utilities', tag: 'RESOURCES', tool: 'payloads',
    name: 'PayloadsAllTheThings',
    desc: 'XSS, SQLi, LFI gibi siber güvenlik payload\'larını içeren devasa depo.',
    cmd: 'python3 siberphp.py --payloads {kelime}',
    param: 'Aranacak kelime (örn: xss)',
  },

  // ══════ SOSYAL MÜHENDİSLİK ══════
  {
    cat: 'social', tag: 'SOCIAL', tool: 'setoolkit/ngrok',
    name: 'Oltalama Araçları (3 Seçenek)',
    desc: '3 farklı phishing seçeneği sunar ve ngrok ile bir oltalama laboratuvarı oluşturur.',
    cmd: 'python3 siberphp.py --phishing {1/2/3}',
    param: 'Seçenek numarası (1-3)',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'ngrok',
    name: 'INDEX.PHP — Form Sayfası',
    desc: 'Basit özelleştirilebilir form sayfası. Dışarıdan girilen bilgileri iletir.',
    cmd: 'python3 siberphp.py --phishing 1',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'ngrok',
    name: 'INDEX2.PHP — IP/UserAgent Toplayıcı',
    desc: 'İstenen siteye yönlendirme yapan bağlantı oluşturur. Tıklayan kişilerin IP ve UserAgent bilgilerini iletir.',
    cmd: 'python3 siberphp.py --phishing 2',
    param: 'Yönlendirilecek URL',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'ngrok',
    name: 'INDEX3.PHP — Kamera Yayını',
    desc: 'SAYSNEEZE sayfası oluşturur. Kamera izni veren kullanıcılardan saniyede 2 fotoğraf çeker ve depolar.',
    cmd: 'python3 siberphp.py --phishing 3',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'sms-api',
    name: 'Anonim SMS Gönderme',
    desc: 'Belirlenen mesajı belirtilen numaraya anonim olarak gönderir (Türkiye dışı).',
    cmd: 'python3 siberphp.py --anonSMS {numara} {mesaj}',
    param: 'Numara ve mesaj',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'sms-api',
    name: 'SMS Bomb',
    desc: 'Belirlenen numaraya farklı SMS servislerinden art arda mesaj gönderir.',
    cmd: 'python3 siberphp.py --smsbomb {numara} {adet}',
    param: 'Numara (örn: +901234567890)',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'pyautogui',
    name: 'Spambot',
    desc: 'Belirlenen kelimeyi, belirlenen sayı kadar yazar. İstenen kişiye art arda mesaj göndermek için kullanılabilir.',
    cmd: 'python3 siberphp.py --spambot {metin} {adet}',
    param: 'Metin ve tekrar sayısı',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'python3',
    name: 'Panelsiz Mail (Statik)',
    desc: 'Rastgele, yönetim paneli olmayan geçici mail adresi oluşturur.',
    cmd: 'python3 siberphp.py --tempmail',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'instaloader',
    name: 'Instagram Bot',
    desc: 'Hesaplar dosyasındaki hesaplar üzerinden toplu takip et/takibi bırak işlemi yapar.',
    cmd: 'python3 siberphp.py --instabot {hedef-kullanici}',
    param: 'Hedef kullanıcı adı',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'telethon',
    name: 'Crawler-x11 (Telegram)',
    desc: 'Telegram üzerinde hedef kullanıcının sizinle olan ve ortak gruptaki mesajlarını otomatik kaydeder.',
    cmd: 'python3 siberphp.py --crawlerx11 {kullanici}',
    param: 'Telegram kullanıcı adı veya ID',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'telethon/ai',
    name: 'Imitator-x11 (Kopyalama)',
    desc: 'Belirtilen kişinin mesajlarını öğrenerek o kişinin bir kopyasını oluşturur.',
    cmd: 'python3 siberphp.py --imitatorx11 {kullanici}',
    param: 'Telegram kullanıcı adı',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'telethon',
    name: 'Telegram Kullanıcı Araçları',
    desc: 'Telegram ID öğrenme, ID\'den hesap tarihi görme ve bahsetme denetleyicisi özellikleri.',
    cmd: 'python3 siberphp.py --telegramtools',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'requests',
    name: 'UltraBot (Görüntüleme Hilesi)',
    desc: 'Belirlenen siteye art arda giriş yaparak izlenme/indirme sayısını artırır.',
    cmd: 'python3 siberphp.py --ultrabot {url} {adet}',
    param: 'Hedef URL ve istek sayısı',
  },
  {
    cat: 'social', tag: 'SOCIAL', tool: 'discord-api',
    name: 'Etkinleştirme Kodu Oluşturucuları',
    desc: 'Discord, PUBG, Google Play için etkinleştirme kodları oluşturmaya çalışır.',
    cmd: 'python3 siberphp.py --actcode {discord/pubg/google}',
    param: 'Platform seçin',
  },

  // ══════ EXPLOIT & PAYLOAD ══════
  {
    cat: 'exploit', tag: 'EXPLOIT', tool: 'searchsploit',
    name: 'Exploit Arama (SearchSploit)',
    desc: 'Searchsploit ile exploit-db veritabanından exploit arar ve indirmeye hazırlar.',
    cmd: 'python3 siberphp.py --exploitsearch {yazilim}',
    param: 'Yazılım adı veya versiyon',
  },
  {
    cat: 'exploit', tag: 'EXPLOIT', tool: 'tc-algo',
    name: 'TC Son 2 Hane Bulma',
    desc: 'TC algoritmasını kullanarak matematiksel işlemlerle TC kimlik numarasının son 2 hanesini bulur.',
    cmd: 'python3 siberphp.py --tc {ilk-9-hane}',
    param: 'TC kimlik numarasının ilk 9 hanesi',
  },
  {
    cat: 'exploit', tag: 'EXPLOIT', tool: 'strings',
    name: 'Strings (Program Analizi)',
    desc: 'Bir program üzerindeki dışa aktarılabilir metinleri çıkarır. Gizli yazılar, sunucu adresleri görülür.',
    cmd: 'python3 siberphp.py --strings {dosya}',
    param: 'Analiz edilecek dosya',
  },
  {
    cat: 'exploit', tag: 'EXPLOIT', tool: 'python3',
    name: 'Uzantı Sahteleyici',
    desc: 'Reverse shell dosyasının sunucudan geçebilmesi için farklı gizleme teknikleriyle olası dosyalar oluşturur.',
    cmd: 'python3 siberphp.py --ext-fake {dosya}',
    param: 'Reverse shell dosyası yolu',
  },
  {
    cat: 'exploit', tag: 'EXPLOIT', tool: 'python3',
    name: 'Linux Bilgi Toplayıcı Dosya',
    desc: 'Hedef sisteme atılıp çalıştırılacak betik. Sistem, kullanıcı, SSH, cron, bash geçmişi ve daha fazlasını toplar.',
    cmd: 'python3 siberphp.py --linuxinfo-gen',
    param: 'Parametre gerekmez',
  },

  // ══════ KABA KUVVET ══════
  {
    cat: 'bruteforce', tag: 'BRUTE', tool: 'ncrack',
    name: 'Kaba Kuvvet Saldırısı (ncrack)',
    desc: '11 farklı bağlantı türü için ncrack ile kaba kuvvet otomasyonu. SSH, FTP, RDP, HTTP vb.',
    cmd: 'python3 siberphp.py --ncrack {hedef} {port} {wordlist}',
    param: 'Hedef IP adresi',
  },
  {
    cat: 'bruteforce', tag: 'BRUTE', tool: 'hydra',
    name: 'Kaba Kuvvet v2 (Hydra - Mail)',
    desc: 'Hydra ile Gmail ve Hotmail hesapları için kaba kuvvet saldırısı yapar.',
    cmd: 'python3 siberphp.py --hydra-mail {email} {wordlist}',
    param: 'Hedef email adresi',
  },
  {
    cat: 'bruteforce', tag: 'BRUTE', tool: 'paramiko',
    name: 'SSH Brute Force',
    desc: 'Belirtilen SSH sunucusuna sözlük saldırısı uygular.',
    cmd: 'python3 siberphp.py --ssh-brute {hedef} {kullanici} {wordlist}',
    param: 'Hedef IP:Port',
  },
  {
    cat: 'bruteforce', tag: 'BRUTE', tool: 'zip-cracker',
    name: 'Zip Şifre Kırıcı',
    desc: 'Zip dosyasının şifresini sözlük saldırısı ile kırar.',
    cmd: 'python3 siberphp.py --zipcrack {dosya.zip} {wordlist}',
    param: 'ZIP dosyası yolu',
  },

  // ══════ DDoS ══════
  {
    cat: 'ddos', tag: 'DDoS', tool: 'python3',
    name: 'DDoS Aracı (12 Saldırı Tipi)',
    desc: '12 farklı saldırı seçeneği: PING Flood, SYN Flood, UDP Flood, Slowloris ve daha fazlası. 6 tanesi farklı boyutlarda paket gönderir.',
    cmd: 'python3 siberphp.py --ddos {hedef} {port} {tip}',
    param: 'Hedef IP adresi',
  },
  {
    cat: 'ddos', tag: 'DDoS', tool: 'python3',
    name: 'Oto Tıklayıcı',
    desc: 'Belirlenen saniye aralıklarıyla otomatik tıklama gerçekleştirir.',
    cmd: 'python3 siberphp.py --autoclicker {saniye}',
    param: 'Tıklama aralığı (saniye)',
  },

  // ══════ KRİPTOGRAFİ ══════
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'hashlib',
    name: 'Şifreleme Aracı (md5, sha...)',
    desc: 'Metni md5, sha1, sha224, sha256, sha384, sha512 ve blake2b algoritmaları ile şifreler.',
    cmd: 'python3 siberphp.py --hash-encode {metin}',
    param: 'Şifrelenecek metin',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'hashlib/wordlist',
    name: 'Tersine Şifreleme (Hash Kır)',
    desc: 'Sözlük saldırısı ile md5, sha1, sha256, sha512 gibi hash\'leri çözmeye çalışır.',
    cmd: 'python3 siberphp.py --hash-crack {hash} {wordlist}',
    param: 'Hash değeri',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'python3',
    name: 'Hash Analizi',
    desc: 'Girilen hash karmasını analiz eder ve hangi algoritmaya ait olduğunu gösterir.',
    cmd: 'python3 siberphp.py --hash-identify {hash}',
    param: 'Hash değeri',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'stncrypt',
    name: 'Gelişmiş Şifreleme 1 (StnCrypt Pre 1)',
    desc: 'Metni veya dosyayı stncrypt pre 1 algoritması ile şifreler/çözer. SiberPhp\'a özel.',
    cmd: 'python3 siberphp.py --stncrypt1 {metin/dosya}',
    param: 'Metin veya dosya yolu',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'stncrypt',
    name: 'Gelişmiş Şifreleme 2 (StnCrypt Pre 2)',
    desc: 'Her karakter için rastgele şifreleme ve benzersiz anahtar oluşturur. Anahtarsız çözülemez.',
    cmd: 'python3 siberphp.py --stncrypt2 {metin/dosya}',
    param: 'Metin veya dosya yolu',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'python3',
    name: 'StnCrypt (Temel Şifreleme)',
    desc: 'Python veya HTML için değiştirme mantığıyla basit şifreleme yapar.',
    cmd: 'python3 siberphp.py --stncrypt {metin}',
    param: 'Şifrelenecek metin',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'python3',
    name: 'Encode-Decode',
    desc: 'URL, HTML, Base64, Base58, ASCII, HEX, OCTAL, BINARY türlerinde encoding ve decoding işlemleri yapar.',
    cmd: 'python3 siberphp.py --encode {tip} {veri}',
    param: 'Tip: base64/hex/url/ascii...',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'base64',
    name: 'Base64 ↔ Resim Dönüşümleri',
    desc: 'Base64 formatındaki metni resme veya resmi Base64 formatına dönüştürür.',
    cmd: 'python3 siberphp.py --img-convert {dosya/metin}',
    param: 'Dosya yolu veya Base64 metni',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'sklearn/ai',
    name: 'Yapay Zeka Şifre Analizi',
    desc: 'Wordlist ile özel AI modeli oluşturur. Girilen şifreleri önceki zayıf şifrelerle kıyaslayarak güç skorlar.',
    cmd: 'python3 siberphp.py --ai-password {wordlist}',
    param: 'Wordlist dosyası yolu',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'python3',
    name: 'Şifre Oluşturucu',
    desc: 'Belirlenen uzunlukta, istenen karakter seti kullanılarak güçlü şifreler oluşturur.',
    cmd: 'python3 siberphp.py --passgen {uzunluk}',
    param: 'Uzunluk (örn: 16)',
  },
  {
    cat: 'crypto', tag: 'CRYPTO', tool: 'python3',
    name: 'Şifre Oluşturucu v2',
    desc: 'Belirlenen uzunlukta otomatik olarak güçlü şifreler oluşturur.',
    cmd: 'python3 siberphp.py --passgen2 {uzunluk}',
    param: 'Uzunluk (örn: 20)',
  },

  // ══════ STEGANOGRAFİ ══════
  {
    cat: 'steganography', tag: 'STEGO', tool: 'PIL',
    name: 'Steganografi (Resme Veri Gizle)',
    desc: 'PNG görsellerinizin içine birçok dosyayı görünümü değiştirmeden gizler. İsteğe bağlı şifre koyulabilir.',
    cmd: 'python3 siberphp.py --stego-hide {resim} {dosya}',
    param: 'PNG dosyası yolu',
  },
  {
    cat: 'steganography', tag: 'STEGO', tool: 'PIL',
    name: 'Steganografi (Veriyi Çıkar)',
    desc: 'Steganografiyle gizlenmiş PNG dosyasındaki veriyi çıkarır.',
    cmd: 'python3 siberphp.py --stego-extract {resim}',
    param: 'PNG dosyası yolu',
  },
  {
    cat: 'steganography', tag: 'STEGO', tool: 'PIL',
    name: 'FotoDit (Fotoğraf Düzenleme)',
    desc: 'Terminal üzerinde renk değiştirme, arkaplan silme, iyileştirme ve daha fazla görüntü düzenleme özelliği.',
    cmd: 'python3 siberphp.py --fotodOit {resim}',
    param: 'Görsel dosya yolu',
  },

  // ══════ YARDIMCI ARAÇLAR ══════
  {
    cat: 'utilities', tag: 'UTILS', tool: 'crunch',
    name: 'Wordlist Oluşturma (crunch)',
    desc: 'crunch ile özelleştirilmiş wordlist oluşturur. Gerekli bilgileri alır ve uygun dosyayı verir.',
    cmd: 'python3 siberphp.py --crunch {min} {max} {karakterler}',
    param: 'Min ve max uzunluk',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'Wordlist Oluşturucu (Özel Algo)',
    desc: 'SiberPhp\'un kendi wordlist oluşturma algoritması. Hedef bilgilerini alarak kişiselleştirilmiş liste üretir.',
    cmd: 'python3 siberphp.py --wordlist-gen',
    param: 'Hedef hakkında bilgi girin',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'Derleme Aracı',
    desc: 'Belirtilen Python dosyasını derleyerek kaynak koduna başkalarının erişmesini engeller.',
    cmd: 'python3 siberphp.py --compile {dosya.py}',
    param: 'Python dosyası yolu',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'py-to-exe',
    name: 'İş Görür Araçlar',
    desc: 'Video-müzik dönüştürme, müzik/video indirme, .py→.exe dönüştürme, terminal müzik çalma.',
    cmd: 'python3 siberphp.py --tools',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'Linux Asistanı',
    desc: 'Linux üzerinde temel işlemleri otomatize eder. Yeni başlayanlar için idealdir.',
    cmd: 'python3 siberphp.py --linux-assist',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'Xsnot (Not Alma)',
    desc: 'SiberPhp üzerinde not alma, not silme ve not listeleme işlemleri yapar.',
    cmd: 'python3 siberphp.py --xsnot',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'LikeGrep (Veri Ayıklama)',
    desc: 'Bir dosyanın belirli satırlarını, kelimelerini ayıklamak için grep benzeri işlev sunar.',
    cmd: 'python3 siberphp.py --likegrep {dosya} {kelime}',
    param: 'Dosya yolu ve aranacak kelime',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'Dosya İçerisinde Arama (Linux)',
    desc: 'Dosya içerisinde belirlenen kelime/cümle ve bağlı metinleri listeler.',
    cmd: 'python3 siberphp.py --file-search {dosya} {kelime}',
    param: 'Dosya yolu ve kelime',
  },
  {
    cat: 'utilities', tag: 'UTILS', tool: 'python3',
    name: 'SiberPhpya Bağlan',
    desc: 'SiberPhp için kurulum, paket yükleme, denetleme, güncelleme, silme, yeniden yükleme ve iletişim seçenekleri sunar.',
    cmd: 'python3 siberphp.py --setup',
    param: 'Parametre gerekmez',
  },

  // ══════ DOSYA ARAÇLARI ══════
  {
    cat: 'file-tools', tag: 'FILE', tool: 'chkrootkit',
    name: 'Rootkit Tarama Aracı',
    desc: 'chkrootkit ile sistemde rootkit varlığını tespit etmek için kapsamlı tarama başlatır.',
    cmd: 'python3 siberphp.py --rootkit',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'file-tools', tag: 'FILE', tool: 'python3',
    name: 'Dosyalar Arası Veri Karşılaştırma',
    desc: 'Belirtilen iki dosyanın birbiriyle tamamen aynı olup olmadığını kontrol eder.',
    cmd: 'python3 siberphp.py --filecompare {dosya1} {dosya2}',
    param: 'İki dosya yolu',
  },
  {
    cat: 'file-tools', tag: 'FILE', tool: 'python3',
    name: 'Dosya Analizi',
    desc: 'Dosyanın hash değerlerini, oluşturulma detaylarını, izinlerini ve gerçek uzantısını gösterir.',
    cmd: 'python3 siberphp.py --fileanalyze {dosya}',
    param: 'Dosya yolu',
  },
  {
    cat: 'file-tools', tag: 'FILE', tool: 'python3',
    name: 'Dosya Hash Adresi Bulma',
    desc: 'Belirtilen dosyanın md5, sha1 ve sha256 hash adreslerini gösterir.',
    cmd: 'python3 siberphp.py --filehash {dosya}',
    param: 'Dosya yolu',
  },
  {
    cat: 'file-tools', tag: 'FILE', tool: 'python3',
    name: 'Dosya İzleme Monitörü',
    desc: 'Belirtilen dizindeki dosya değişikliklerini anlık olarak izler.',
    cmd: 'python3 siberphp.py --filemonitor {dizin}',
    param: 'İzlenecek dizin yolu',
  },
  {
    cat: 'file-tools', tag: 'FILE', tool: 'python3',
    name: 'Dosya Zaman Manipülasyonu',
    desc: 'Belirtilen dosyanın oluşturulma tarihini istenen tarihe değiştirir.',
    cmd: 'python3 siberphp.py --timestamp {dosya} {tarih}',
    param: 'Dosya ve hedef tarih',
  },

  // ══════ ZARARLIYAZILIM ══════
  {
    cat: 'malware', tag: 'MALWARE', tool: 'msfvenom',
    name: 'Trojan Oluşturma Aracı',
    desc: '6 farklı payload seçeneği ile msfvenom otomasyonu sağlar (Windows, Android, Linux hedefler).',
    cmd: 'python3 siberphp.py --msfvenom {hedef-os} {lhost} {lport}',
    param: 'Hedef işletim sistemi ve IP',
  },
  {
    cat: 'malware', tag: 'MALWARE', tool: 'python3',
    name: 'Virüs Oluştur',
    desc: '4 farklı virüs oluşturma seçeneği sunar. Siber güvenlik eğitim amaçlıdır.',
    cmd: 'python3 siberphp.py --virusmake {tip}',
    param: 'Virüs tipi (1-4)',
  },
];

// ─── Kategori Tanımları ───────────────────────
const CAT_META = {
  recon: { label: 'Keşif & Recon', emoji: '🔍', page: 'recon', tagClass: 'tag-recon' },
  network: { label: 'Ağ Saldırıları', emoji: '🌐', page: 'network', tagClass: 'tag-network' },
  wireless: { label: 'Kablosuz Saldırı', emoji: '📡', page: 'wireless', tagClass: 'tag-wireless' },
  web: { label: 'Web Güvenliği', emoji: '🕸️', page: 'web', tagClass: 'tag-web' },
  osint: { label: 'OSINT', emoji: '👁️', page: 'osint', tagClass: 'tag-osint' },
  social: { label: 'Sosyal Müh.', emoji: '🎭', page: 'social', tagClass: 'tag-social' },
  exploit: { label: 'Exploit & Payload', emoji: '⚡', page: 'exploit', tagClass: 'tag-exploit' },
  malware: { label: 'Zararlı Yazılım', emoji: '🦠', page: 'malware', tagClass: 'tag-malware' },
  bruteforce: { label: 'Kaba Kuvvet', emoji: '🔓', page: 'bruteforce', tagClass: 'tag-bruteforce' },
  ddos: { label: 'DDoS Araçları', emoji: '💥', page: 'ddos', tagClass: 'tag-ddos' },
  crypto: { label: 'Kriptografi', emoji: '🔐', page: 'crypto', tagClass: 'tag-crypto' },
  steganography: { label: 'Steganografi', emoji: '🖼️', page: 'steganography', tagClass: 'tag-steganography' },
  utilities: { label: 'Yardımcı Araçlar', emoji: '⚙️', page: 'utilities', tagClass: 'tag-utilities' },
  'file-tools': { label: 'Dosya Araçları', emoji: '📁', page: 'file-tools', tagClass: 'tag-file-tools' },
};

// ─── Terminal Simülasyonları ──────────────────
const TERM_SIM = {
  'python3 siberphp.py --help': [
    '\x1b[32m╔══════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[32m║       SiBERPHP v2.4.1 — SiberPhp            ║\x1b[0m',
    '\x1b[32m║  80+ Modüllü Çok Amaçlı Siber Güvenlik Aracı   ║\x1b[0m',
    '\x1b[32m╚══════════════════════════════════════════════════╝\x1b[0m',
    '',
    '\x1b[33mKullanım:\x1b[0m  python3 siberphp.py [MODÜL] [HEDEF]',
    '\x1b[33mÖrnek:\x1b[0m     python3 siberphp.py --nmap 192.168.1.1',
    '',
    '\x1b[36mKategoriler:\x1b[0m',
    '  🔍 Keşif & Recon       --nmap, --whois, --subdomain, --nikto ...',
    '  🌐 Ağ Saldırıları      --sniff1, --macchanger, --network-reaper ...',
    '  📡 Kablosuz            --handshake, --bluecough, --twin ...',
    '  🕸️  Web Güvenliği      --sqlmap, --admin-dynamic, --dirfuzz ...',
    '  👁️  OSINT              --phoneinfo, --userfind-dynamic, --cve ...',
    '  🎭 Sosyal Müh.         --phishing, --smsbomb, --ultrabot ...',
    '  ⚡ Exploit             --exploitsearch, --strings, --tc ...',
    '  🦠 Zararlı Yazılım     --msfvenom, --virusmake ...',
    '  🔓 Kaba Kuvvet         --ncrack, --hydra-mail, --ssh-brute ...',
    '  💥 DDoS                --ddos (12 tip: SYN, UDP, Slowloris ...) ',
    '  🔐 Kriptografi         --hash-encode, --stncrypt2, --ai-password ...',
    '  🖼️  Steganografi        --stego-hide, --stego-extract, --fotodOit ...',
    '  ⚙️  Yardımcı            --crunch, --compile, --wordlist-gen ...',
    '  📁 Dosya Araçları      --rootkit, --fileanalyze, --timestamp ...',
    '',
    '\x1b[32m[!] Yalnızca yetkili ve kontrollü ortamlarda kullanın.\x1b[0m',
  ],
  'python3 siberphp.py --version': [
    'SiberPhp v2.4.1',
    'Python 3.10+ uyumlu',
    'Toplam modül: 84+',
    'Kategori: 14',
    'GitHub: github.com/SiberPhp78/SiberPhp',
    'Son güncelleme: 2026-06-01',
  ],
  'python3 siberphp.py --modules': [
    '\x1b[36m[RECON 11 modül]\x1b[0m  searchsploit, nmap, wafw00f, nikto, lynis, ike, whois, dns, ssl, siteip, subdomain',
    '\x1b[36m[NETWORK 11 modül]\x1b[0m dns-detect, dns-spoof, sniff1, sniff2, network-reaper, wifi-portscan, ipinfo, ipvuln, macchanger, traceroute, macinfo',
    '\x1b[36m[WIRELESS 4 modül]\x1b[0m handshake, bluecough, twin, pico',
    '\x1b[36m[WEB 14 modül]\x1b[0m sqlmap, admin-static, admin-dynamic, dirfuzz, dirlist, sitefuzz, links, text, images, scraper, source, firebase, index-build, shortlink',
    '\x1b[36m[OSINT 12 modül]\x1b[0m phoneinfo, randomhuman, randompost, mailcheck, userfind-static, userfind-dynamic, isbn-open, isbn-google, cve, emailheader, exif, pdfinfo',
    '\x1b[36m[SOCIAL 14 modül]\x1b[0m phishing(3 tip), anonSMS, smsbomb, spambot, tempmail, instabot, crawlerx11, imitatorx11, telegramtools, ultrabot, actcode',
    '\x1b[36m[EXPLOIT 5 modül]\x1b[0m exploitsearch, tc, strings, ext-fake, linuxinfo-gen',
    '\x1b[36m[MALWARE 2 modül]\x1b[0m msfvenom(6 payload), virusmake(4 tip)',
    '\x1b[36m[BRUTEFORCE 4 modül]\x1b[0m ncrack(11 tip), hydra-mail, ssh-brute, zipcrack',
    '\x1b[36m[DDoS 2 modül]\x1b[0m ddos(12 tip), autoclicker',
    '\x1b[36m[CRYPTO 12 modül]\x1b[0m hash-encode, hash-crack, hash-identify, stncrypt1, stncrypt2, stncrypt, encode, img-convert, ai-password, passgen, passgen2',
    '\x1b[36m[STEGO 3 modül]\x1b[0m stego-hide, stego-extract, fotodOit',
    '\x1b[36m[UTILS 9 modül]\x1b[0m crunch, wordlist-gen, compile, tools, linux-assist, xsnot, likegrep, file-search, setup',
    '\x1b[36m[FILE 6 modül]\x1b[0m rootkit, filecompare, fileanalyze, filehash, filemonitor, timestamp',
    '',
    '\x1b[32mToplam: 84+ modül, 14 kategori\x1b[0m',
  ],
  'ls -la': [
    'total 72',
    'drwxr-xr-x  12 SiberPhp SiberPhp 4096 Haz 19 12:00 .',
    'drwxr-xr-x   3 SiberPhp SiberPhp 4096 Haz 19 12:00 ..',
    '-rw-r--r--   1 SiberPhp SiberPhp 3245 Haz 19 12:00 README.md',
    '-rwxr-xr-x   1 SiberPhp SiberPhp 24576 Haz 19 12:00 siberphp.py',
    'drwxr-xr-x   4 SiberPhp SiberPhp 4096 Haz 19 12:00 modules/',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 wordlists/',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 reports/',
    '-rw-r--r--   1 SiberPhp SiberPhp  512 Haz 19 12:00 requirements.txt',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 exploits/',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 payloads/',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 phishing/',
    'drwxr-xr-x   2 SiberPhp SiberPhp 4096 Haz 19 12:00 keys/',
  ],
  'python3 siberphp.py --nmap 192.168.1.1': [
    '\x1b[32m[*] NMAP Otomasyonu başlatıldı → 192.168.1.1\x1b[0m',
    '[*] Hızlı tarama yapılıyor...',
    '',
    'Starting Nmap 7.94 ( https://nmap.org )',
    'Nmap scan report for 192.168.1.1',
    'Host is up (0.0012s latency).',
    '',
    'PORT     STATE  SERVICE   VERSION',
    '22/tcp   open   ssh       OpenSSH 8.9',
    '80/tcp   open   http      Apache 2.4.52',
    '443/tcp  open   https     OpenSSL 3.0.2',
    '3306/tcp closed mysql',
    '8080/tcp open   http-alt',
    '',
    'OS Detection: Linux 5.15 (Ubuntu 22.04)',
    '\x1b[32m[+] Tarama tamamlandı. 5 açık port bulundu.\x1b[0m',
  ],
  'python3 siberphp.py --whois example.com': [
    '\x1b[32m[*] WhoIs sorgulanıyor → example.com\x1b[0m',
    '',
    'Domain Name: EXAMPLE.COM',
    'Registrar: RESERVED-Internet Assigned Numbers Authority',
    'Created: 1995-08-14',
    'Expires: 2024-08-13',
    'Name Server: A.IANA-SERVERS.NET',
    'Name Server: B.IANA-SERVERS.NET',
    'DNSSEC: signedDelegation',
    '',
    '\x1b[32m[+] WhoIs sorgusu tamamlandı.\x1b[0m',
  ],
  'python3 siberphp.py --mailcheck kuskaya008@gmail.com': [
    '\x1b[36m                   /|_\x1b[0m',
    '\x1b[36m                  /   |_\x1b[0m',
    '\x1b[36m                 /     /     __  __      _    __\x1b[0m',
    '\x1b[36m                /      >    |  \\/  | ___| |_ / _| ___  _ __ __ _\x1b[0m',
    '\x1b[36m               (      >     | |\\/| |/ _ \\ __| |_ / _ \\| \'__/ _` |\x1b[0m',
    '\x1b[36m              /      /      | |  | |  __/ |_|  _| (_) | | | (_| |\x1b[0m',
    '\x1b[36m             /     /        |_|  |_|\\___|\\__|_|  \\___/|_|  \\__,_|\x1b[0m',
    '\x1b[36m            /      /\x1b[0m',
    '\x1b[36m         __/      \\_____   \x1b[31mYaptığınız ve yapacağınız her şeyden siz sorumlusunuz\x1b[0m',
    '\x1b[36m        /\'             |   \x1b[31mhiçbir şekilde sorumluluk kabul edilmez.\x1b[0m',
    '\x1b[36m         /     /-\\     /\x1b[0m',
    '\x1b[36m        /      /  \\--/      \x1b[33m1-) Kurulum (kök kullanıcı gerektirir)\x1b[0m',
    '\x1b[36m       /     /\x1b[0m',
    '\x1b[36m      /      /              \x1b[33m2-) İletişim\x1b[0m',
    '\x1b[36m     (      >\x1b[0m',
    '\x1b[36m    /      >                \x1b[33m3-) Aracı güncelle\x1b[0m',
    '\x1b[36m   /     _|\x1b[0m',
    '\x1b[36m  /  __/                    \x1b[33m4-) Bu dizine aracı yükle\x1b[0m',
    '\x1b[36m /_/\x1b[0m',
    '                            \x1b[33m5-) Bu dizinden aracı sil\x1b[0m',
    '',
    '                            \x1b[33m6-) Sexettintool\'a giriş yap\x1b[0m',
    '',
    '                            \x1b[33m7-) Bu araç içindekiler ne işe yarıyor?\x1b[0m',
    '',
    '                            \x1b[33m8-) Paketleri kontrol et\x1b[0m',
    '                            \x1b[31mNot: Birçok seçenek kök kullanıcı gerektirir.\x1b[0m',
    '                            \x1b[31mHata aldığınız durumlarda yönetici modunda programı tekrar çalıştırınız.\x1b[0m',
    '',
    '\x1b[32m[*] Mail Kontrol (Mailcheck) modülü başlatıldı → kuskaya008@gmail.com\x1b[0m',
    '[*] E-posta adresi analiz ediliyor...',
    '------------------------------------------------',
    'Sonuç: E-posta adresi aktif ve geçerli.',
    'Domain: gmail.com',
    'Risk Seviyesi: Düşük',
    'Sızdırılmış Veritabanı Kaydı: 0',
    '------------------------------------------------',
    '\x1b[33m[!]\x1b[0m Daha detaylı analiz için aşağıdaki komutları deneyebilirsiniz:',
    '  \x1b[36mpython3 siberphp.py --osint kuskaya008@gmail.com\x1b[0m : Tüm sosyal medya hesaplarını tarar.',
    '  \x1b[36mpython3 siberphp.py --pwned kuskaya008@gmail.com\x1b[0m : Sızdırılmış parola veritabanlarını kontrol eder.',
    '\x1b[32m[+] İşlem tamamlandı.\x1b[0m'
  ],
  'clear': ['__CLEAR__'],
};

const ACTIVITY_DATA = [
  { user: 'ogrenci_007', action: 'Nmap port taraması → 192.168.1.0/24 [23 açık port]' },
  { user: 'ogrenci_003', action: 'SQLMap çalıştırıldı → web-lab-01 [5 tablo bulundu]' },
  { user: 'ogrenci_012', action: 'WhoIs sorgusu → target.com' },
  { user: 'ogrenci_019', action: 'Admin Panel Bulucu → 192 yol test edildi' },
  { user: 'ogrenci_005', action: 'Handshake Decrypter → wifi.cap [şifre bulundu!]' },
  { user: 'ogrenci_021', action: 'Trojan oluşturuldu → android reverse_tcp' },
  { user: 'ogrenci_009', action: 'Wordlist oluşturuldu → 50.000 kayıt' },
  { user: 'ogrenci_011', action: 'Phishing sayfası kuruldu → ngrok aktif' },
  { user: 'eğitmen_01', action: 'Yeni lab oturumu → DDoS Temelleri 101' },
  { user: 'ogrenci_014', action: 'Hash kırıldı → sha256 → "password123"' },
  { user: 'ogrenci_006', action: 'Steganografi → resme 3 dosya gizlendi' },
  { user: 'ogrenci_017', action: 'SSH Brute Force → 192.168.1.50:22 [başarılı]' },
];

// ─── State ────────────────────────────────────
let currentUser = null;
let currentPage = 'home';
let sessionReports = [];
let terminalHistoryArr = [];
let historyIdx = -1;
let activeHackLabMissionId = 'web-login';
let activeHackLabTab = 'request';
let activeHackLabCommand = 0;

const HACKLAB_PROGRESS_KEY = 'cyberlab_hacklab_progress_v1';
const HACKLAB_MISSIONS = [
  {
    id: 'web-login',
    tag: 'WEB-01',
    level: 'Başlangıç',
    title: 'Login Bypass Analizi',
    summary: 'Form isteğini ve SQL hata sinyalini okuyarak kimlik doğrulama kontrolünü tespit et.',
    objective: 'Yakalanan POST isteğinde kullanıcı girdisinin sorguya güvenli bağlanmadığını kanıtla ve flag değerini gönder.',
    briefing: [
      'Hedef yalnızca lab.local alanındaki eğitim uygulamasıdır.',
      'İstek gövdesindeki username alanı doğrudan WHERE koşuluna giriyor.',
      'Hata çıktısı veritabanı motorunu ve kırılan sorgu parçasını açık ediyor.',
    ],
    artifacts: [
      ['Endpoint', 'POST https://lab.local/login'],
      ['Body', 'username=admin%27+OR+%271%27%3D%271&password=test'],
      ['Response', '302 Found -> /admin'],
      ['DB Trace', "WHERE username = 'admin' OR '1'='1' AND password = '...'"],
    ],
    console: [
      '$ intercept --request POST /login',
      "[REQ] username=admin' OR '1'='1&password=test",
      '[APP] query builder: raw string concatenation detected',
      '[RES] 302 /admin',
      '[FLAG] FLAG{AUTH_BYPASS_DETECTED}',
    ],
    hint: 'Form alanı parametreli sorgu yerine string birleştirme ile SQL sorgusuna taşınıyor.',
    answer: 'FLAG{AUTH_BYPASS_DETECTED}',
  },
  {
    id: 'idor-invoice',
    tag: 'API-02',
    level: 'Orta',
    title: 'IDOR Fatura Erişimi',
    summary: 'URL içindeki kullanıcı kimliğini değiştirerek eksik yetkilendirme kontrolünü bul.',
    objective: 'İki fatura isteğini karşılaştır, erişim kontrolünün nesne sahibini doğrulamadığını kanıtla.',
    briefing: [
      'Oturum kullanıcısı: user_id=1024.',
      'API sadece oturum var mı diye bakıyor; invoice owner kontrolü yapmıyor.',
      'Başarılı kanıt, başka kullanıcıya ait invoice_id değerinin dönmesidir.',
    ],
    artifacts: [
      ['Own invoice', 'GET /api/users/1024/invoices/7781 -> 200'],
      ['Changed id', 'GET /api/users/1025/invoices/7781 -> 200'],
      ['Leaked owner', 'owner_id=1025, total=1840 TRY'],
      ['Missing check', 'request.user.id === params.user_id doğrulaması yok'],
    ],
    console: [
      '$ replay GET /api/users/1024/invoices/7781',
      '[200] owner_id=1024 invoice_id=7781',
      '$ replay GET /api/users/1025/invoices/7781',
      '[200] owner_id=1025 invoice_id=7781',
      '[FLAG] FLAG{OBJECT_AUTHZ_MISSING}',
    ],
    hint: 'ID değiştiğinde 403 beklenir; 200 dönüyorsa nesne seviyesinde yetkilendirme eksiktir.',
    answer: 'FLAG{OBJECT_AUTHZ_MISSING}',
  },
  {
    id: 'xss-comment',
    tag: 'WEB-03',
    level: 'Orta',
    title: 'Stored XSS Kök Neden',
    summary: 'Yorum alanına kaydedilen HTML çıktısının encode edilmediğini tespit et.',
    objective: 'Payload çalıştırmadan, render edilen DOM ve sunucu yanıtından kalıcı XSS kök nedenini çıkar.',
    briefing: [
      'Yorumlar veritabanına ham metin olarak kaydediliyor.',
      'Frontend dangerouslySetInnerHTML benzeri ham HTML render ediyor.',
      'Doğru çözüm, output encoding ve izin verilen etiket listesi uygulamaktır.',
    ],
    artifacts: [
      ['Submit', 'POST /comments body=<img src=x onerror=alert(1)>'],
      ['Stored row', 'comment_body="<img src=x onerror=alert(1)>"'],
      ['Render sink', 'commentContainer.innerHTML = comment.body'],
      ['Impact', 'Admin yorum sayfası açıldığında script context tetiklenir'],
    ],
    console: [
      '$ review --sink comments.render',
      '[SRC] request.body.comment',
      '[DB] stored without canonicalization',
      '[SINK] innerHTML assignment found',
      '[FLAG] FLAG{ENCODE_OUTPUT_NOT_INPUT}',
    ],
    hint: 'Kök neden, kullanıcı girdisinin HTML bağlamında encode edilmeden sink noktasına taşınmasıdır.',
    answer: 'FLAG{ENCODE_OUTPUT_NOT_INPUT}',
  },
  {
    id: 'log-triage',
    tag: 'BLUE-04',
    level: 'Başlangıç',
    title: 'Brute Force Log Triyajı',
    summary: 'Auth loglarında aynı kaynaktan gelen başarısız denemeleri grupla ve saldırı sinyalini bul.',
    objective: 'Kısa log kesitinde saldırgan IP adresini ve kilit kanıt satırını tespit et.',
    briefing: [
      'Başarısız girişler 60 saniyelik pencerede değerlendirilir.',
      'Normal kullanıcılar 1-2 hata üretirken saldırgan aynı hesaplara seri deneme yapar.',
      'Flag, yoğun başarısız deneme üreten IP için üretilmiştir.',
    ],
    artifacts: [
      ['12:01:04', '10.10.4.8 failed login admin'],
      ['12:01:09', '10.10.4.8 failed login root'],
      ['12:01:13', '10.10.4.8 failed login backup'],
      ['12:01:16', '10.10.4.8 failed login deploy'],
      ['12:01:21', '10.10.7.2 successful login melih'],
    ],
    console: [
      '$ authlog --window 60s --group-by src_ip',
      '10.10.4.8  failed=4 success=0 users=admin,root,backup,deploy',
      '10.10.7.2  failed=0 success=1 users=melih',
      '[DETECTION] password-spray candidate: 10.10.4.8',
      '[FLAG] FLAG{SPRAY_SOURCE_10_10_4_8}',
    ],
    hint: 'Aynı IP kısa sürede çok hesap deniyor ve hiç başarılı oturum açmıyor.',
    answer: 'FLAG{SPRAY_SOURCE_10_10_4_8}',
  },
];

const HACKLAB_RUNTIME = {
  'web-login': {
    target: 'https://lab.local/login',
    persona: 'Siyah kutu web uygulama testi',
    surface: ['POST /login', 'Set-Cookie: cyberlab_session', 'SQLite error trace', 'Admin redirect'],
    request: [
      'POST /login HTTP/1.1',
      'Host: lab.local',
      'Content-Type: application/x-www-form-urlencoded',
      'Cookie: visitor_id=8ec1b2',
      '',
      "username=admin' OR '1'='1&password=test",
    ].join('\n'),
    response: [
      'HTTP/1.1 302 Found',
      'Location: /admin',
      'Set-Cookie: cyberlab_session=lab-admin-73a9; HttpOnly; SameSite=Lax',
      'X-Lab-Trace: SQL_CONCAT_LOGIN',
      '',
      '{"role":"admin","reason":"matched first row"}',
    ].join('\n'),
    evidence: [
      'Normal login 401 dönerken aynı endpoint üzerinde quote karakteri SQL trace üretir.',
      "Trace satırı username değerinin WHERE username = '<input>' biçiminde birleştirildiğini gösterir.",
      '302 /admin cevabı kimlik doğrulama kararının kullanıcı girdisiyle bypass edildiğini kanıtlar.',
    ],
    commands: [
      {
        label: 'baseline login',
        command: 'curl -i -X POST https://lab.local/login -d "username=admin&password=test"',
        output: ['HTTP/1.1 401 Unauthorized', 'X-Lab-Trace: LOGIN_FAILED', 'body={"error":"invalid credentials"}'],
      },
      {
        label: 'quote probe',
        command: 'curl -i -X POST https://lab.local/login -d "username=admin%27&password=test"',
        output: ['HTTP/1.1 500 Internal Server Error', "SQLITE_ERROR near \"'\": syntax error", 'sink=auth/login raw_sql_concat=true'],
      },
      {
        label: 'boolean proof',
        command: 'curl -i -X POST https://lab.local/login -d "username=admin%27%20OR%20%271%27%3D%271&password=test"',
        output: ['HTTP/1.1 302 Found', 'Location: /admin', '[FLAG] FLAG{AUTH_BYPASS_DETECTED}'],
      },
    ],
    remediation: 'Login sorgusunu parametreli prepared statement ile kur, hata detaylarını kullanıcıya döndürme ve auth kararını tekil kullanıcı kaydıyla bağla.',
  },
  'idor-invoice': {
    target: 'https://lab.local/api/users/{id}/invoices/7781',
    persona: 'Yetkili kullanıcıyla API erişim kontrol testi',
    surface: ['GET /api/users/1024/invoices/7781', 'GET /api/users/1025/invoices/7781', 'Bearer öğrenci token', 'Invoice JSON'],
    request: [
      'GET /api/users/1025/invoices/7781 HTTP/1.1',
      'Host: lab.local',
      'Authorization: Bearer user-1024-demo-token',
      'Accept: application/json',
      '',
    ].join('\n'),
    response: [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      'X-Policy-Check: session-only',
      '',
      '{"invoice_id":7781,"owner_id":1025,"email":"client1025@lab.local","total":"1840 TRY"}',
    ].join('\n'),
    evidence: [
      'Aynı bearer token ile 1024 ve 1025 user_id değerleri denenir.',
      '1025 objesi 403 yerine 200 döndürür ve owner_id=1025 alanı sızar.',
      'Policy header sadece oturum kontrolü olduğunu, object ownership kontrolü olmadığını gösterir.',
    ],
    commands: [
      {
        label: 'own object',
        command: 'lab-api GET /api/users/1024/invoices/7781 --token user-1024',
        output: ['200 OK', 'owner_id=1024 invoice_id=7781 total=920 TRY'],
      },
      {
        label: 'tamper id',
        command: 'lab-api GET /api/users/1025/invoices/7781 --token user-1024',
        output: ['200 OK', 'owner_id=1025 invoice_id=7781 total=1840 TRY', '[FLAG] FLAG{OBJECT_AUTHZ_MISSING}'],
      },
      {
        label: 'expected policy',
        command: 'policy-check invoice.read --subject user:1024 --object invoice:7781',
        output: ['expected: object.owner_id == subject.id', 'actual: session.exists == true', 'gap: object authorization missing'],
      },
    ],
    remediation: 'Controller seviyesinde params.user_id yerine oturumdaki subject id kullanılmalı ve her invoice için owner_id veya ACL kontrolü yapılmalı.',
  },
  'xss-comment': {
    target: 'https://lab.local/posts/42/comments',
    persona: 'Kod inceleme destekli web güvenliği testi',
    surface: ['POST /comments', 'comments.body database column', 'commentContainer.innerHTML sink', 'Admin moderation page'],
    request: [
      'POST /posts/42/comments HTTP/1.1',
      'Host: lab.local',
      'Content-Type: application/json',
      '',
      '{"body":"<img src=x onerror=alert(1)>"}',
    ].join('\n'),
    response: [
      'HTTP/1.1 201 Created',
      'Content-Type: application/json',
      '',
      '{"id":884,"body":"<img src=x onerror=alert(1)>","stored":true}',
    ].join('\n'),
    evidence: [
      'Kaynak: request JSON body alanı ham şekilde veritabanına kaydediliyor.',
      'Sink: render katmanı commentContainer.innerHTML = comment.body kullanıyor.',
      'HTML bağlamında output encoding olmadığı için payload kalıcı olarak DOM içine giriyor.',
    ],
    commands: [
      {
        label: 'source trace',
        command: 'trace-source comments.create body',
        output: ['source=request.body.body', 'normalization=none', 'storage=comments.body raw'],
      },
      {
        label: 'sink trace',
        command: 'trace-sink comments.render body',
        output: ['sink=Element.innerHTML', 'encoding=none', 'context=HTML attribute/event capable'],
      },
      {
        label: 'root cause',
        command: 'xss-audit --stored comments.body --sink innerHTML',
        output: ['stored_xss=true', 'fix=HTML encode on output or sanitize allowlist', '[FLAG] FLAG{ENCODE_OUTPUT_NOT_INPUT}'],
      },
    ],
    remediation: 'Kullanıcı içeriğini HTML bağlamına yazmadan önce encode et; zengin metin gerekiyorsa izin listeli sanitizer kullan ve innerHTML sinklerini azalt.',
  },
  'log-triage': {
    target: 'auth.log / 60 saniyelik pencere',
    persona: 'SOC analyst olay triyajı',
    surface: ['auth.log', 'src_ip aggregation', 'failed/success ratio', 'username spread'],
    request: [
      '12:01:04 auth failed src=10.10.4.8 user=admin',
      '12:01:09 auth failed src=10.10.4.8 user=root',
      '12:01:13 auth failed src=10.10.4.8 user=backup',
      '12:01:16 auth failed src=10.10.4.8 user=deploy',
      '12:01:21 auth success src=10.10.7.2 user=melih',
    ].join('\n'),
    response: [
      'aggregation_window=60s',
      '10.10.4.8 failed=4 success=0 distinct_users=4',
      '10.10.7.2 failed=0 success=1 distinct_users=1',
      'classification=password_spray_candidate',
    ].join('\n'),
    evidence: [
      '10.10.4.8 kısa pencerede farklı hesaplara ardışık başarısız deneme yapıyor.',
      'Başarı kaydı yok; kullanıcı çeşitliliği yüksek.',
      'Bu davranış tek kullanıcı şifre hatasından çok password spraying sinyalidir.',
    ],
    commands: [
      {
        label: 'group by ip',
        command: 'authlog --window 60s --group-by src_ip',
        output: ['10.10.4.8 failed=4 success=0 users=admin,root,backup,deploy', '10.10.7.2 failed=0 success=1 users=melih'],
      },
      {
        label: 'classify',
        command: 'detect password-spray --min-fail 4 --distinct-users 3',
        output: ['match src_ip=10.10.4.8', 'confidence=0.92', '[FLAG] FLAG{SPRAY_SOURCE_10_10_4_8}'],
      },
      {
        label: 'containment',
        command: 'soc-playbook password-spray 10.10.4.8',
        output: ['actions: rate-limit source, require MFA step-up, notify owners of targeted accounts', 'ticket=IR-2026-1048'],
      },
    ],
    remediation: 'Kaynak IP için rate limit, hedef hesaplar için MFA step-up, başarısız deneme eşiği ve alarm korelasyonu uygulanmalı.',
  },
};

// ─── Boot Animasyonu ──────────────────────────
const BOOT_MSGS = [
  'Sistem başlatılıyor...',
  'SiberPhp v2.4.1 yükleniyor...',
  '84 modül kontrol ediliyor...',
  'Güvenlik protokolleri aktif.',
  'Lab sandbox hazırlanıyor...',
  'Güvenli bağlantı kuruldu ✓',
];
let bootIdx = 0;
const bootEl = document.getElementById('boot-text');
function animateBoot() {
  if (bootIdx < BOOT_MSGS.length) {
    bootEl.textContent = BOOT_MSGS[bootIdx++];
    setTimeout(animateBoot, 600);
  }
}
animateBoot();

// ─── Sayaç Animasyonu ─────────────────────────
function animateCounter(el, target, dur = 1400) {
  let v = 0;
  const step = target / (dur / 16);
  const t = setInterval(() => {
    v += step;
    if (v >= target) { el.textContent = target; clearInterval(t); }
    else el.textContent = Math.floor(v);
  }, 16);
}

// Login ekranı istatistikleri
setTimeout(() => {
  animateCounter(document.getElementById('s1'), 84);
  animateCounter(document.getElementById('s2'), 48);
  animateCounter(document.getElementById('s3'), 312);
}, 700);

// ─── Matrix Rain Canvas ───────────────────────
(function initMatrixRain() {
  const canvas = document.getElementById('matrix-rain-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let cols, drops;
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
    cols = Math.floor(canvas.width / 14);
    drops = Array(cols).fill(0).map(() => Math.random() * -100);
  }
  resize();
  window.addEventListener('resize', resize);
  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4cc4df';
    ctx.font = '12px monospace';
    for (let i = 0; i < cols; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, i * 14, drops[i] * 14);
      if (drops[i] * 14 > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ─── Floating Threat Feed ─────────────────────
(function initThreatFeed() {
  const feed = document.getElementById('login-threat-feed');
  if (!feed) return;
  const threats = [
    { text: '[INFO] SSH brute-force tespit edildi → 192.168.1.45:22', cls: '' },
    { text: '[WARN] SQL Injection denemesi → /api/users?id=1 OR 1=1', cls: 'warn' },
    { text: '[INFO] Port taraması algılandı → 10.0.0.12 (1-1024)', cls: '' },
    { text: '[ALERT] XSS payload filtrelendi → <script>alert(1)</script>', cls: 'danger' },
    { text: '[INFO] Nmap OS detection → 172.16.0.1 (Linux 5.x)', cls: '' },
    { text: '[WARN] DDoS koruması aktif → 847 req/s', cls: 'warn' },
    { text: '[INFO] Reverse shell engellendi → 10.0.0.99:4444', cls: '' },
    { text: '[ALERT] Kimlik doğrulama başarısız → admin@192.168.1.1', cls: 'danger' },
    { text: '[INFO] WAF kuralı tetiklendi → OWASP-CRS-913100', cls: '' },
    { text: '[WARN] Privilege escalation algılandı → CVE-2024-1086', cls: 'warn' },
    { text: '[INFO] DNS exfiltration tespit → data.evil.com', cls: '' },
    { text: '[ALERT] RCE denemesi → /wp-admin/admin-ajax.php', cls: 'danger' },
  ];
  let idx = 0;
  function spawnThreat() {
    if (!document.getElementById('login-screen')?.classList.contains('active')) return;
    const item = threats[idx % threats.length];
    const el = document.createElement('div');
    el.className = 'threat-item ' + item.cls;
    el.textContent = item.text;
    el.style.top = (10 + Math.random() * 80) + '%';
    el.style.animationDuration = (10 + Math.random() * 8) + 's';
    feed.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    idx++;
    setTimeout(spawnThreat, 2500 + Math.random() * 3000);
  }
  setTimeout(spawnThreat, 1500);
})();

// ─── Password Strength Meter ──────────────────
(function initPasswordStrength() {
  const passInput = document.getElementById('password');
  const strengthEl = document.getElementById('password-strength');
  const strengthText = document.getElementById('strength-text');
  if (!passInput || !strengthEl) return;

  function getStrength(pw) {
    let score = 0;
    if (pw.length >= 10) score++;
    if (pw.length >= 14) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 20) score++;
    return Math.min(score, 4);
  }

  const labels = ['Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
  const classes = ['', 'medium', 'strong', 'very-strong'];

  passInput.addEventListener('input', () => {
    const pw = passInput.value;
    if (pw.length === 0) {
      strengthEl.hidden = true;
      return;
    }
    strengthEl.hidden = false;
    const strength = getStrength(pw);
    const bars = strengthEl.querySelectorAll('.strength-bar');
    bars.forEach((bar, i) => {
      bar.className = 'strength-bar';
      if (i < strength) {
        bar.classList.add('active');
        const c = classes[strength - 1];
        if (c) bar.classList.add(c);
      }
    });
    strengthText.textContent = labels[Math.max(0, strength - 1)] || 'Zayıf';
  });
})();

// ─── Password Toggle ─────────────────────────
(function initPasswordToggle() {
  const toggle = document.getElementById('password-toggle');
  const passInput = document.getElementById('password');
  if (!toggle || !passInput) return;
  toggle.addEventListener('click', () => {
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    toggle.querySelector('.eye-open').style.display = isPassword ? 'none' : '';
    toggle.querySelector('.eye-closed').style.display = isPassword ? '' : 'none';
  });
})();

// ─── Giriş / Kayıt Modu ──────────────────────
document.querySelectorAll('.auth-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    authMode = btn.dataset.authMode;
    const registering = authMode === 'register';
    document.querySelector('.auth-register-fields').hidden = !registering;
    document.getElementById('username-label').textContent = registering ? 'Kullanıcı Adı' : 'Kullanıcı Adı veya E-posta';
    document.getElementById('password').autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('#login-btn .btn-text').textContent = registering ? 'HESAP OLUŞTUR' : 'SİSTEME GİRİŞ';
    document.getElementById('auth-hint').textContent = registering
      ? 'Yeni hesaplar öğrenci rolüyle oluşturulur. Şifre en az 10 karakter olmalıdır.'
      : 'Kendi hesabınızla güvenli oturum açın.';
    showAuthMessage('');
  });
});

// ─── Login ────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

window.addEventListener('DOMContentLoaded', () => {
  checkBackendAvailability();
  initDesktopNavigation();
  restoreAuthenticatedSession();
});

function initDesktopNavigation() {
  const routes = {
    'academy-launcher': 'academy.html',
  };
  Object.entries(routes).forEach(([id, href]) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', () => { window.location.assign(href); });
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-local-href]');
    if (!target) return;
    event.preventDefault();
    window.location.assign(target.dataset.localHref);
  });
}

async function restoreAuthenticatedSession() {
  try {
    const saved = localStorage.getItem('cyberlab_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      document.getElementById('boot-text').style.display = 'none';
      enterDashboard();
    }
    const payload = await authRequest('/api/auth/me');
    if (!payload.authenticated || !payload.user) throw new Error('No active session');
    currentUser = normalizeUser(payload.user);
    authCsrfToken = payload.csrf_token;
    localStorage.setItem('cyberlab_user', JSON.stringify(currentUser));
    if (!saved) {
      document.getElementById('boot-text').style.display = 'none';
      enterDashboard();
    }
  } catch (_) {
    const saved = localStorage.getItem('cyberlab_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        document.getElementById('boot-text').style.display = 'none';
        enterDashboard();
        return;
      } catch (e) {}
    }
    currentUser = null;
    localStorage.removeItem('cyberlab_user');
  }
}

function normalizeUser(user) {
  return {
    ...user,
    displayName: user.display_name,
    avatar: user.avatar || (user.display_name || user.username || '?')[0].toUpperCase(),
  };
}

function renderAccountName(element, user) {
  if (!element) return;
  element.classList.remove('account-rank-founder', 'account-rank-admin', 'account-rank-instructor', 'account-rank-student');
  const rank = user.is_founder ? 'founder' : (user.role || 'student');
  element.classList.add(`account-rank-${rank}`);
  element.textContent = user.displayName;
  if (user.is_founder) {
    const badge = document.createElement('span');
    badge.className = 'cyber-founder-badge';
    badge.textContent = '✓';
    badge.title = 'CyberLab Kurucusu · Doğrulanmış Yetkili';
    element.appendChild(badge);
  }
}

function showAuthMessage(message, success = false) {
  const box = document.getElementById('auth-error');
  box.textContent = message;
  box.hidden = !message;
  box.classList.toggle('success', success);
}

async function doLogin() {
  const uname = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  showAuthMessage('');
  if (!uname || !pass) return showAuthMessage('Kullanıcı bilgilerini eksiksiz girin.');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.querySelector('.btn-text').textContent = authMode === 'register' ? 'HESAP OLUŞTURULUYOR...' : 'GİRİŞ YAPILIYOR...';
  try {
    const body = authMode === 'register'
      ? { username: uname, email: document.getElementById('email').value.trim(), display_name: document.getElementById('display-name').value.trim(), password: pass }
      : { identifier: uname, password: pass };
    const payload = await authRequest(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', body: JSON.stringify(body),
    });
    currentUser = normalizeUser(payload.user);
    authCsrfToken = payload.csrf_token;
    localStorage.setItem('cyberlab_user', JSON.stringify(currentUser));
    showAuthMessage(authMode === 'register' ? 'Hesabınız oluşturuldu.' : 'Giriş başarılı.', true);
    setTimeout(enterDashboard, 350);
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = `<span class="btn-text">${authMode === 'register' ? 'HESAP OLUŞTUR' : 'SİSTEME GİRİŞ'}</span><span class="btn-arrow">→</span><div class="btn-loading-bar"></div>`;
  }
}

function enterDashboard() {
  checkBackendAvailability();
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  renderAccountName(document.getElementById('user-name-display'), currentUser);
  document.getElementById('user-role-display').textContent = `${currentUser.username}@cyberlab`;
  document.getElementById('user-avatar').textContent = currentUser.avatar;
  document.getElementById('welcome-name').textContent = currentUser.displayName;

  setTimeout(() => {
    document.querySelectorAll('.metric-val').forEach(el => animateCounter(el, parseInt(el.dataset.target)));
  }, 300);

  renderAllModules();
  updateNavBadges();
  renderHomeCategoryCards();
  renderHackLab();
  initTerminal();
  startActivityFeed();
  renderReports();
  startClock();
  document.body.classList.add('kali-session');
  renderAccountName(document.getElementById('kali-user-name'), currentUser);
  document.getElementById('kali-user-role').textContent = `${currentUser.username}@cyberlab`;
  document.getElementById('kali-user-avatar').textContent = currentUser.avatar;
  renderKaliApplicationsMenu();
  document.getElementById('linux-window').classList.add('minimized');
  setKaliMenu(true);
}

// ─── Logout ───────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await authRequest('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
  localStorage.removeItem('cyberlab_user');
  if (socket) socket.disconnect();
  document.getElementById('dashboard-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="btn-text">SİSTEME GİRİŞ</span><span class="btn-arrow">→</span><div class="btn-loading-bar"></div>';
  btn.classList.remove('loading'); btn.style.color = ''; btn.style.borderColor = '';
  currentUser = null; bootIdx = 0; animateBoot();
  document.body.classList.remove('kali-session', 'menu-open');
  document.getElementById('kali-app-menu').classList.remove('open');
  const lw = document.getElementById('linux-window');
  lw.classList.remove('minimized', 'maximized');
  lw.style.display = 'flex';
  authCsrfToken = null;
});

// ─── Kali Linux Applications Menu ────────────
let kaliMenuCategory = 'all';

function setKaliMenu(open) {
  if (!document.body.classList.contains('kali-session')) return;
  document.getElementById('kali-app-menu').classList.toggle('open', open);
  document.getElementById('kali-applications-btn').classList.toggle('active', open);
  document.body.classList.toggle('menu-open', open);
  if (open) setTimeout(() => document.getElementById('kali-menu-search').focus(), 60);
}

function restoreCyberLab(page = null, label = null) {
  setKaliMenu(false);
  const lw = document.getElementById('linux-window');
  lw.classList.remove('minimized');
  lw.style.display = 'flex';
  if (page) gotoPage(page, label || CAT_META[page]?.label || page);
}

function renderKaliApplicationsMenu() {
  const categories = document.getElementById('kali-menu-categories');
  const query = (document.getElementById('kali-menu-search').value || '').trim().toLowerCase();
  const allCount = ALL_MODULES.length;
  const categoryEntries = [['all', { label: 'Tüm Araçlar', emoji: '★' }], ...Object.entries(CAT_META)];
  categories.innerHTML = categoryEntries.map(([cat, meta], idx) => {
    const count = cat === 'all' ? allCount : ALL_MODULES.filter(m => m.cat === cat).length;
    return `<button class="kali-menu-category ${kaliMenuCategory === cat ? 'active' : ''}" data-kali-cat="${cat}"><span class="cat-num">${cat === 'all' ? '★' : String(idx).padStart(2, '0')}</span><span>${meta.label}</span><span class="cat-count">${count}</span></button>`;
  }).join('');

  const matches = ALL_MODULES.map((m, index) => ({ m, index })).filter(({ m }) =>
    (kaliMenuCategory === 'all' || m.cat === kaliMenuCategory) &&
    (!query || `${m.name} ${m.tool} ${m.desc}`.toLowerCase().includes(query))
  );
  const tools = document.getElementById('kali-menu-tools');
  tools.innerHTML = matches.length ? matches.map(({ m, index }, i) => {
    const meta = CAT_META[m.cat] || { label: m.cat, emoji: '◈' };
    return `<button class="kali-menu-tool" data-module-index="${index}"><span class="kali-menu-tool-icon">${meta.emoji}</span><span><b>${m.name}</b><small>${meta.label} · ${m.tool || 'python3'}</small></span><span>›</span></button>`;
  }).join('') : '<p class="kali-menu-empty">Araç bulunamadı.</p>';
}

document.getElementById('kali-applications-btn').addEventListener('click', () => setKaliMenu(!document.getElementById('kali-app-menu').classList.contains('open')));
document.getElementById('kali-menu-toggle').addEventListener('click', () => setKaliMenu(!document.getElementById('kali-app-menu').classList.contains('open')));
document.getElementById('kali-menu-search').addEventListener('input', renderKaliApplicationsMenu);
document.getElementById('kali-menu-categories').addEventListener('click', event => {
  const button = event.target.closest('[data-kali-cat]');
  if (!button) return;
  kaliMenuCategory = button.dataset.kaliCat;
  renderKaliApplicationsMenu();
});
document.getElementById('kali-menu-tools').addEventListener('click', event => {
  const button = event.target.closest('[data-module-index]');
  if (!button) return;
  const module = ALL_MODULES[Number(button.dataset.moduleIndex)];
  if (!module) return;
  restoreCyberLab(module.cat, CAT_META[module.cat]?.label);
  setTimeout(() => openModal(module), 120);
});
document.getElementById('kali-menu-logout').addEventListener('click', () => document.getElementById('logout-btn').click());

document.getElementById('cyberlab-launcher').addEventListener('click', () => toggleWindow('linux-window'));
document.getElementById('panel-terminal').addEventListener('click', () => restoreCyberLab('terminal', 'Terminal'));
document.getElementById('terminal-launcher').addEventListener('click', () => restoreCyberLab('terminal', 'Terminal'));
document.querySelector('.win-btn.minimize').addEventListener('click', () => document.getElementById('linux-window').classList.add('minimized'));
document.querySelector('.win-btn.close').addEventListener('click', () => document.getElementById('linux-window').classList.add('minimized'));
document.querySelector('.win-btn.maximize').addEventListener('click', () => document.getElementById('linux-window').classList.toggle('maximized'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('kali-app-menu').classList.contains('open')) setKaliMenu(false); });

// ─── Navigasyon ───────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page, item.querySelector('span:not(.nav-badge)')?.textContent?.trim() || item.dataset.page);
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

function navigateTo(page, label) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.getElementById('page-breadcrumb').textContent = `/ ${label}`;
  // Mobile sidebar kapat
  document.getElementById('sidebar').classList.remove('open');
  // Araç kurulum sayfası init
  if (page === 'install') {
    renderInstallGrid(installStatuses);
    if (socket && !socket._installListenersAdded) {
      initInstallListeners();
      socket._installListenersAdded = true;
    }
  }
  if (page === 'playground') renderHackLab();
}

// ─── Mobile Menü ──────────────────────────────
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Tüm Modülleri Render Et ─────────────────
function renderAllModules() {
  const cats = Object.keys(CAT_META);
  cats.forEach(cat => {
    const gridId = `grid-${cat}`;
    const container = document.getElementById(gridId);
    if (!container) return;
    const mods = ALL_MODULES.filter(m => m.cat === cat);
    container.innerHTML = mods.map(m => moduleCardHTML(m)).join('');
  });
}

function moduleCardHTML(m) {
  const meta = CAT_META[m.cat];
  const tagClass = meta ? meta.tagClass : 'tag-utilities';
  return `
    <div class="module-card" onclick="openModal(${JSON.stringify(m).replace(/"/g, '&quot;')})">
      <div class="module-card-top">
        <span class="module-card-tag ${tagClass}">${m.tag}</span>
        <span class="module-card-tool">${m.tool || ''}</span>
      </div>
      <div class="module-card-name">${m.name}</div>
      <div class="module-card-desc">${m.desc}</div>
      <div class="module-card-cmd">${m.cmd}</div>
      <button class="module-card-launch" onclick="event.stopPropagation(); openModal(${JSON.stringify(m).replace(/"/g, '&quot;')})">▶ Çalıştır</button>
    </div>
  `;
}

// ─── Nav Badge Güncelle ───────────────────────
function updateNavBadges() {
  document.querySelectorAll('[data-cat]').forEach(badge => {
    const cat = badge.dataset.cat;
    const count = ALL_MODULES.filter(m => m.cat === cat).length;
    badge.textContent = count;
  });
}

// ─── Home Kategori Kartları ───────────────────
function renderHomeCategoryCards() {
  const container = document.getElementById('home-categories');
  if (!container) return;
  container.innerHTML = Object.entries(CAT_META).map(([cat, meta]) => {
    const count = ALL_MODULES.filter(m => m.cat === cat).length;
    return `
      <div class="cat-card" onclick="gotoPage('${meta.page}', '${meta.label}')">
        <div class="cat-card-icon">${meta.emoji}</div>
        <div class="cat-card-name">${meta.label}</div>
        <div class="cat-card-count">${count} modül</div>
      </div>
    `;
  }).join('');
}

function hacklabEscapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getHackLabProgress() {
  try { return JSON.parse(localStorage.getItem(HACKLAB_PROGRESS_KEY) || '{}'); }
  catch (_) { return {}; }
}

function setHackLabProgress(progress) {
  localStorage.setItem(HACKLAB_PROGRESS_KEY, JSON.stringify(progress));
}

function updateHackLabScore(progress = getHackLabProgress()) {
  const total = HACKLAB_MISSIONS.length;
  const done = HACKLAB_MISSIONS.filter(mission => progress[mission.id]).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const score = document.getElementById('hacklab-score');
  const label = document.getElementById('hacklab-score-label');
  const bar = document.getElementById('hacklab-scorebar');
  if (score) score.textContent = `${percent}%`;
  if (label) label.textContent = `${done}/${total} görev`;
  if (bar) bar.style.width = `${percent}%`;
}

function renderHackLab() {
  const list = document.getElementById('hacklab-mission-list');
  const workbench = document.getElementById('hacklab-workbench');
  if (!list || !workbench) return;
  const progress = getHackLabProgress();
  updateHackLabScore(progress);
  const activeMission = HACKLAB_MISSIONS.find(item => item.id === activeHackLabMissionId) || HACKLAB_MISSIONS[0];
  const runtime = HACKLAB_RUNTIME[activeMission.id] || {};
  activeHackLabMissionId = activeMission.id;
  if (!['request', 'response', 'evidence'].includes(activeHackLabTab)) activeHackLabTab = 'request';
  const commands = runtime.commands || [];
  if (activeHackLabCommand >= commands.length) activeHackLabCommand = 0;

  list.innerHTML = HACKLAB_MISSIONS.map(mission => {
    const done = Boolean(progress[mission.id]);
    const active = mission.id === activeMission.id;
    return `
      <button class="playground-mission ${done ? 'done' : ''} ${active ? 'active' : ''}" type="button" data-hacklab-id="${mission.id}">
        <span class="playground-mission-top">
          <span class="playground-tag">${hacklabEscapeHtml(mission.tag)}</span>
          <span class="playground-status">${done ? 'tamamlandı' : mission.level}</span>
        </span>
        <strong>${hacklabEscapeHtml(mission.title)}</strong>
        <small>${hacklabEscapeHtml(mission.summary)}</small>
      </button>`;
  }).join('');

  const artifactRows = activeMission.artifacts.map(row => `
    <tr><th>${hacklabEscapeHtml(row[0])}</th><td>${hacklabEscapeHtml(row[1])}</td></tr>`).join('');
  const briefingItems = activeMission.briefing.map(item => `<li>${hacklabEscapeHtml(item)}</li>`).join('');
  const surfaceItems = (runtime.surface || []).map(item => `<span>${hacklabEscapeHtml(item)}</span>`).join('');
  const activeCommand = commands[activeHackLabCommand] || { command: 'lab --help', output: activeMission.console };
  const proxyContent = activeHackLabTab === 'response'
    ? runtime.response
    : activeHackLabTab === 'evidence'
      ? (runtime.evidence || []).map((item, index) => `${index + 1}. ${item}`).join('\n')
      : runtime.request;
  const commandButtons = commands.map((item, index) => `
    <button class="playground-command-btn ${index === activeHackLabCommand ? 'active' : ''}" type="button" data-hacklab-command="${index}">
      <span>${String(index + 1).padStart(2, '0')}</span>${hacklabEscapeHtml(item.label)}
    </button>`).join('');
  const done = Boolean(progress[activeMission.id]);
  const savedEvidence = done ? hacklabEscapeHtml(progress[activeMission.id]?.evidence || '') : '';

  workbench.innerHTML = `
    <div class="playground-workbench-header">
      <div>
        <span class="playground-tag">${hacklabEscapeHtml(activeMission.tag)}</span>
        <h3>${hacklabEscapeHtml(activeMission.title)}</h3>
        <p>${hacklabEscapeHtml(activeMission.objective)}</p>
        <div class="playground-target-line">
          <span>Hedef</span><code>${hacklabEscapeHtml(runtime.target || 'lab.local')}</code>
          <span>Rol</span><code>${hacklabEscapeHtml(runtime.persona || 'Lab analisti')}</code>
        </div>
      </div>
      <span class="playground-level">${done ? 'TAMAMLANDI' : hacklabEscapeHtml(activeMission.level)}</span>
    </div>
    <div class="playground-surface-map">${surfaceItems}</div>
    <div class="playground-panels">
      <div class="playground-panel">
        <h4>Görev Brifingi</h4>
        <ul>${briefingItems}</ul>
      </div>
      <div class="playground-panel">
        <h4>Kanıt Tablosu</h4>
        <table class="playground-artifact-table">${artifactRows}</table>
      </div>
    </div>
    <div class="playground-analysis-grid">
      <section class="playground-proxy">
        <div class="playground-section-title">
          <h4>Proxy Trace</h4>
          <div class="playground-tabs">
            <button class="${activeHackLabTab === 'request' ? 'active' : ''}" type="button" data-hacklab-tab="request">Request</button>
            <button class="${activeHackLabTab === 'response' ? 'active' : ''}" type="button" data-hacklab-tab="response">Response</button>
            <button class="${activeHackLabTab === 'evidence' ? 'active' : ''}" type="button" data-hacklab-tab="evidence">Kanıt</button>
          </div>
        </div>
        <pre class="playground-console playground-proxy-console">${hacklabEscapeHtml(proxyContent || '')}</pre>
      </section>
      <section class="playground-lab-terminal">
        <div class="playground-section-title"><h4>Lab Terminal</h4><span>simüle</span></div>
        <div class="playground-command-list">${commandButtons}</div>
        <pre class="playground-console">$ ${hacklabEscapeHtml(activeCommand.command)}

${hacklabEscapeHtml((activeCommand.output || []).join('\n'))}</pre>
      </section>
    </div>
    <label class="playground-evidence-box">
      <span>Kanıt notu</span>
      <textarea id="hacklab-evidence" placeholder="Bulgunu teknik kanıtla yaz: hangi endpoint, hangi sinyal, beklenen/dönen sonuç farkı..." ${done ? 'readonly' : ''}>${savedEvidence}</textarea>
    </label>
    <div class="playground-input-grid">
      <input class="playground-answer" id="hacklab-answer" autocomplete="off" spellcheck="false" placeholder="FLAG{...}" value="${done ? hacklabEscapeHtml(activeMission.answer) : ''}">
      <button class="playground-action" id="hacklab-submit" type="button">Kontrol Et</button>
    </div>
    <button class="playground-secondary-action" id="hacklab-hint" type="button">İpucu Göster</button>
    <button class="playground-secondary-action" id="hacklab-copy-report" type="button">Rapor Taslağını Kopyala</button>
    <div class="playground-feedback ${done ? 'ok' : ''}" id="hacklab-feedback">${done ? 'Bu görev tamamlandı. Kanıt ve flag doğru.' : 'Flag değerini kanıt çıktısından çıkarıp gönder.'}</div>`;

  list.querySelectorAll('[data-hacklab-id]').forEach(button => {
    button.addEventListener('click', () => {
      activeHackLabMissionId = button.dataset.hacklabId;
      activeHackLabTab = 'request';
      activeHackLabCommand = 0;
      renderHackLab();
    });
  });
  workbench.querySelectorAll('[data-hacklab-tab]').forEach(button => {
    button.addEventListener('click', () => {
      activeHackLabTab = button.dataset.hacklabTab;
      renderHackLab();
    });
  });
  workbench.querySelectorAll('[data-hacklab-command]').forEach(button => {
    button.addEventListener('click', () => {
      activeHackLabCommand = Number(button.dataset.hacklabCommand);
      renderHackLab();
    });
  });
  document.getElementById('hacklab-submit')?.addEventListener('click', submitHackLabAnswer);
  document.getElementById('hacklab-answer')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') submitHackLabAnswer();
  });
  document.getElementById('hacklab-hint')?.addEventListener('click', () => {
    const feedback = document.getElementById('hacklab-feedback');
    if (!feedback) return;
    feedback.className = 'playground-feedback';
    feedback.textContent = activeMission.hint;
  });
  document.getElementById('hacklab-copy-report')?.addEventListener('click', copyHackLabReport);
  const reset = document.getElementById('hacklab-reset');
  if (reset) {
    reset.onclick = () => {
      localStorage.removeItem(HACKLAB_PROGRESS_KEY);
      renderHackLab();
    };
  }
}

function submitHackLabAnswer() {
  const mission = HACKLAB_MISSIONS.find(item => item.id === activeHackLabMissionId);
  const input = document.getElementById('hacklab-answer');
  const feedback = document.getElementById('hacklab-feedback');
  const evidenceInput = document.getElementById('hacklab-evidence');
  if (!mission || !input || !feedback) return;
  const answer = input.value.trim().toUpperCase();
  const expected = mission.answer.toUpperCase();
  const evidence = (evidenceInput?.value || '').trim();
  if (evidence.length < 24) {
    feedback.className = 'playground-feedback bad';
    feedback.textContent = 'Kanıt notu eksik. Endpoint, gözlem ve etkiyi en az bir cümleyle yaz.';
    return;
  }
  if (answer === expected) {
    const progress = getHackLabProgress();
    progress[mission.id] = { completedAt: new Date().toISOString(), flag: mission.answer, evidence };
    setHackLabProgress(progress);
    feedback.className = 'playground-feedback ok';
    feedback.textContent = 'Doğru. Görev tamamlandı ve ilerleme kaydedildi.';
    updateHackLabScore(progress);
    setTimeout(renderHackLab, 450);
  } else {
    feedback.className = 'playground-feedback bad';
    feedback.textContent = 'Flag eşleşmedi. Kanıt çıktısındaki [FLAG] satırını kontrol et.';
  }
}

async function copyHackLabReport() {
  const mission = HACKLAB_MISSIONS.find(item => item.id === activeHackLabMissionId);
  const runtime = mission ? HACKLAB_RUNTIME[mission.id] : null;
  const feedback = document.getElementById('hacklab-feedback');
  if (!mission || !runtime) return;
  const evidence = (document.getElementById('hacklab-evidence')?.value || '').trim() || (runtime.evidence || []).join(' ');
  const report = [
    `Bulgu: ${mission.title}`,
    `Hedef: ${runtime.target}`,
    `Seviye: ${mission.level}`,
    '',
    'Kanıt:',
    evidence,
    '',
    'Teknik Etki:',
    mission.objective,
    '',
    'Önerilen Düzeltme:',
    runtime.remediation,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(report);
    if (feedback) {
      feedback.className = 'playground-feedback ok';
      feedback.textContent = 'Rapor taslağı panoya kopyalandı.';
    }
  } catch (_) {
    if (feedback) {
      feedback.className = 'playground-feedback bad';
      feedback.textContent = 'Kopyalama başarısız. Rapor metnini kanıt alanından manuel seçebilirsin.';
    }
  }
}

function gotoPage(page, label) {
  navigateTo(page, label);
  document.querySelectorAll('.nav-item').forEach(i => {
    if (i.dataset.page === page) i.classList.add('active');
    else i.classList.remove('active');
  });
}

// ─── Modül Modalı ─────────────────────────────
let activeModule = null;

function openModal(m) {
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  activeModule = m;
  const meta = CAT_META[m.cat];
  const tagClass = meta ? meta.tagClass : 'tag-utilities';
  const badge = document.getElementById('modal-cat-badge');
  badge.textContent = m.tag;
  badge.className = `modal-cat-badge module-card-tag ${tagClass}`;
  document.getElementById('modal-title').textContent = m.name;
  document.getElementById('modal-desc').textContent = m.desc;
  document.getElementById('modal-param-label').textContent = m.param || 'Hedef / Parametre';
  
  // Örnek veriyi parse et veya varsayılan bir tane bul
  let exampleValue = '';
  if (m.param) {
    const match = m.param.match(/örn:\s*([^)]+)/i);
    if (match) {
      exampleValue = match[1].trim();
    } else {
      if (m.param.toLowerCase().includes('mail')) exampleValue = 'test@gmail.com';
      else if (m.param.toLowerCase().includes('ip')) exampleValue = '192.168.1.1';
      else if (m.param.toLowerCase().includes('domain') || m.param.toLowerCase().includes('site')) exampleValue = 'example.com';
      else exampleValue = 'hedef';
    }
  }

  document.getElementById('modal-target').value = exampleValue;
  document.getElementById('modal-cmd-preview').textContent = m.cmd.replace(/\{[^}]+\}/g, exampleValue || '{hedef}');
  document.getElementById('modal-overlay').classList.add('open');
  
  // Metni seçili hale getir ki kullanıcı hemen değiştirebilsin
  setTimeout(() => {
    const targetInput = document.getElementById('modal-target');
    targetInput.focus();
    targetInput.select();
  }, 100);
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

document.getElementById('modal-target').addEventListener('input', e => {
  if (!activeModule) return;
  const val = e.target.value || '{hedef}';
  document.getElementById('modal-cmd-preview').textContent =
    activeModule.cmd.replace(/\{[^}]+\}/g, val);
});

document.getElementById('modal-run').addEventListener('click', () => {
  if (!activeModule) return;
  const target = document.getElementById('modal-target').value || 'lab-target.local';
  const cmd = activeModule.cmd.replace(/\{[^}]+\}/g, target);
  closeModal();
  switchToTerminal();

  // ── Araç bilgi kutusu ──────────────────────────────────
  const m = activeModule;
  const catLabel = (typeof CAT_META !== 'undefined' && CAT_META[m.cat])
    ? CAT_META[m.cat].label : m.cat;
  const infoLines = [
    '',
    `\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m`,
    `\x1b[36m║\x1b[0m  \x1b[1m${m.name}\x1b[0m`,
    `\x1b[36m║\x1b[0m  Kategori : \x1b[33m${catLabel}\x1b[0m   Araç: \x1b[32m${m.tool || 'python3'}\x1b[0m`,
    `\x1b[36m╠══════════════════════════════════════════════════════╣\x1b[0m`,
    ...wrapText(m.desc || '', 54).map(l => `\x1b[36m║\x1b[0m  ${l}`),
    `\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m`,
    '',
  ];
  infoLines.forEach((l, i) => setTimeout(() => addLine(l, ''), i * 18));

  // Komut bilgi satırı gecikmeyle çalıştır
  const delay = infoLines.length * 18 + 80;
  setTimeout(() => {
    runCommand(cmd);
    addReport(cmd);
  }, delay);
});

document.getElementById('modal-copy').addEventListener('click', () => {
  if (!activeModule) return;
  const target = document.getElementById('modal-target').value || '{hedef}';
  const cmd = activeModule.cmd.replace(/\{[^}]+\}/g, target);
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('modal-copy');
    btn.textContent = '✓ Kopyalandı';
    setTimeout(() => { btn.textContent = '📋 Kopyala'; }, 1500);
  });
});

function switchToTerminal() {
  navigateTo('terminal', 'Terminal');
  document.querySelectorAll('.nav-item').forEach(i => {
    if (i.dataset.page === 'terminal') i.classList.add('active');
    else i.classList.remove('active');
  });
}

// ─── Terminal ─────────────────────────────────

// Metin satır kırıcı (bilgi kutusu için)
function wrapText(text, maxLen) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
// ─── Linux Terminal Engine ────────────────────────────────
let tabCount = 2;
let activeTabIdx = 0;

function switchTab(idx) {
  document.querySelectorAll('.term-tab').forEach(t => t.classList.remove('active'));
  const tabs = document.querySelectorAll('.term-tab[data-tab]');
  if (tabs[idx]) tabs[idx].classList.add('active');
  activeTabIdx = idx;
}

function newTab() {
  const tabs = document.getElementById('term-tabs');
  const newBtn = tabs.querySelector('.new-tab-btn');
  const btn = document.createElement('button');
  btn.className = 'term-tab';
  btn.dataset.tab = tabCount;
  btn.onclick = () => switchTab(tabCount);
  btn.innerHTML = `<span class="term-tab-icon">⬡</span> bash — tab${tabCount + 1} <span class="tab-close" onclick="event.stopPropagation();this.parentElement.remove()">×</span>`;
  tabs.insertBefore(btn, newBtn);
  switchTab(tabCount);
  tabCount++;
}

function toggleFullTerm() {
  document.getElementById('linux-terminal').classList.toggle('full-term');
}

function clearTerm() {
  const b = document.getElementById('terminal-body');
  if (b) b.innerHTML = '';
}

// Status bar clock
function startTermStatusBar() {
  function tick() {
    const now = new Date();
    const el = document.getElementById('tsb-clock2');
    if (el) el.textContent = now.toLocaleTimeString('tr-TR');
    // Simulated CPU/MEM
    const cpu = document.getElementById('tsb-cpu');
    const mem = document.getElementById('tsb-mem');
    if (cpu) cpu.textContent = `CPU: ${(Math.random() * 8 + 1).toFixed(1)}%`;
    if (mem) mem.textContent = `MEM: ${(Math.random() * 200 + 300).toFixed(0)}MB`;
  }
  tick();
  setInterval(tick, 1000);
}

// ANSI escape → HTML color
function ansiToHtml(text) {
  const map = {
    '0': '', '1': '', '30': 'color:#555', '31': 'color:#ff5f57', '32': 'color:#28c840',
    '33': 'color:#febc2e', '34': 'color:#58a6ff', '35': 'color:#bc8cff',
    '36': 'color:#39c5cf', '37': 'color:#c9d1d9', '90': 'color:#555',
    '91': 'color:#ff5f57', '92': 'color:#00ff88', '93': 'color:#febc2e',
    '94': 'color:#58a6ff', '95': 'color:#bc8cff', '96': 'color:#39c5cf',
    '97': 'color:#e6edf3',
  };
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\x1b\[([0-9;]*)m/g, (_, codes) => {
    if (codes === '' || codes === '0') return '</span>';
    const style = codes.split(';').map(c => map[c] || '').filter(Boolean).join(';');
    return style ? `<span style="${style}">` : '</span>';
  });
}

function initTerminal() {
  const body = document.getElementById('terminal-body');
  const input = document.getElementById('terminal-input');
  if (!body || !input) return;

  connectSocket();
  startTermStatusBar();

  // Boot sequence
  const bootLines = [
    { t: '┌──────────────────────────────────────────────────────────┐', c: 'dim' },
    { t: '│  CyberLab Terminal — SiberPhp v2.4.1               │', c: 'info' },
    { t: '│  Powered by SiberPhp · Educational Lab Environment  │', c: 'dim' },
    { t: '└──────────────────────────────────────────────────────────┘', c: 'dim' },
    { t: '', c: '' },
    { t: 'Last login: ' + new Date().toUTCString() + ' on ttys001', c: 'dim' },
    { t: '', c: '' },
    { t: '[  OK  ] Loaded kernel modules.', c: 'success' },
    { t: '[  OK  ] Started Network Service.', c: 'success' },
    { t: '[  OK  ] CyberLab backend bağlanılıyor → ' + BACKEND, c: 'info' },
    { t: '', c: '' },
  ];

  bootLines.forEach((l, i) => {
    setTimeout(() => addLine(l.t, l.c), i * 45);
  });

  setTimeout(() => {
    if (backendOnline) {
      addLine('[✓] Backend online. Gerçek modlar aktif!', 'success');
    } else {
      addLine('[!] Backend çevrimdışı → python3 server.py', 'warn');
    }
    addLine('', '');
    addLine('Yardım için: python3 siberphp.py --help', 'dim');
    addLine('', '');
  }, bootLines.length * 45 + 500);

  // Input events
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const cmd = input.value.trim();
      if (!cmd) return;
      terminalHistoryArr.unshift(cmd);
      historyIdx = -1;
      runCommand(cmd);
      input.value = '';
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      historyIdx = Math.min(historyIdx + 1, terminalHistoryArr.length - 1);
      if (terminalHistoryArr[historyIdx] !== undefined) input.value = terminalHistoryArr[historyIdx];
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      historyIdx = Math.max(historyIdx - 1, -1);
      input.value = historyIdx >= 0 ? terminalHistoryArr[historyIdx] : '';
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      // simple tab complete from history
      const partial = input.value;
      const match = terminalHistoryArr.find(h => h.startsWith(partial) && h !== partial);
      if (match) input.value = match;
    }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clearTerm(); }
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      addPromptEcho('^C');
      addLine('', '');
      input.value = '';
    }
  });

  // Focus terminal on click
  document.getElementById('linux-terminal')?.addEventListener('click', () => input.focus());
  input.focus();
}

// Adds a line with colored prompt echo (for command echo)
function addPromptEcho(cmd) {
  const body = document.getElementById('terminal-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'terminal-line-out';
  div.innerHTML = `<span class="term-out-user">SiberPhp</span><span class="term-out-at">@</span><span class="term-out-host">cyberlab</span><span class="term-out-colon">:</span><span class="term-out-path">~/siberphp</span><span class="term-out-dollar"> $</span> <span style="color:#e6edf3">${cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function addLine(text, type = '') {
  const body = document.getElementById('terminal-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = `terminal-line-out ${type}`;
  // Parse ANSI colors
  const html = ansiToHtml(text || '');
  div.innerHTML = html || '&nbsp;';
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

// Local Linux command simulations
const LOCAL_CMDS = {
  'whoami': () => ['SiberPhp'],
  'pwd': () => ['/home/siberphp/siberphp'],
  'uname -a': () => ['Linux cyberlab 5.15.0-kali3-amd64 #1 SMP Debian 5.15.15-2kali1 x86_64 GNU/Linux'],
  'uname': () => ['Linux'],
  'hostname': () => ['cyberlab'],
  'id': () => ['uid=1000(siberphp) gid=1000(siberphp) groups=1000(siberphp),4(adm),27(sudo),1001(wireshark)'],
  'date': () => [new Date().toString()],
  'uptime': () => [` ${new Date().toLocaleTimeString('tr-TR')} up 3:42,  1 user,  load average: 0.42, 0.58, 0.71`],
  'echo $SHELL': () => ['/bin/bash'],
  'echo $USER': () => ['SiberPhp'],
  'env | head': () => ['SHELL=/bin/bash', 'USER=SiberPhp', 'HOME=/home/siberphp', 'TERM=xterm-256color', 'LANG=tr_TR.UTF-8', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
  'ls': () => ['acilis.py  fotodit.py  icon.png  siberphp.py  README.md  requirements.txt  siberphp.py  web_panel/'],
  'ls -la': () => [
    'total 312',
    'drwxr-xr-x 12 siberphp siberphp  4096 Jun 20 14:22 \x1b[34m.\x1b[0m',
    'drwxr-xr-x  4 siberphp siberphp  4096 Jun 20 10:00 \x1b[34m..\x1b[0m',
    '-rw-r--r--  1 siberphp siberphp 68715 Jun 19 08:11 \x1b[32macilis.py\x1b[0m',
    '-rw-r--r--  1 siberphp siberphp  3360 Jun 18 15:30 \x1b[32mfotodit.py\x1b[0m',
    '-rw-r--r--  1 siberphp siberphp 51388 Jun 15 12:00 icon.png',
    '-rw-r--r--  1 siberphp siberphp 20441 Jun 20 09:55 \x1b[32msiberphp.py\x1b[0m',
    '-rw-r--r--  1 siberphp siberphp 19262 Jun 14 11:22 README.md',
    '-rw-r--r--  1 siberphp siberphp   269 Jun 10 08:00 requirements.txt',
    '-rwxr-xr-x  1 siberphp siberphp 77722 Jun 20 11:48 \x1b[32msiberphp.py\x1b[0m',
    'drwxr-xr-x  3 siberphp siberphp  4096 Jun 19 16:00 \x1b[34mweb_panel\x1b[0m',
  ],
  'ps aux': () => [
    'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
    'SiberPhp    1001  0.0  0.1   8256  3200 pts/0    Ss   10:00   0:00 /bin/bash',
    'SiberPhp    1337  0.3  0.8  42000 16800 pts/0    S    14:00   0:12 python3 server.py',
    'SiberPhp    1338  0.0  0.2  12000  5000 pts/0    S    14:00   0:01 python3 -m flask run',
    'SiberPhp    2048  0.0  0.1   8256  2100 pts/0    R+   14:22   0:00 ps aux',
  ],
  'ifconfig': () => [
    'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
    '        inet \x1b[32m192.168.1.100\x1b[0m  netmask 255.255.255.0  broadcast 192.168.1.255',
    '        ether 08:00:27:12:34:56  txqueuelen 1000  (Ethernet)',
    'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
    '        inet \x1b[32m127.0.0.1\x1b[0m  netmask 255.0.0.0',
  ],
  'ip a': () => [
    '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN',
    '    inet \x1b[32m127.0.0.1/8\x1b[0m scope host lo',
    '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP',
    '    inet \x1b[32m192.168.1.100/24\x1b[0m brd 192.168.1.255 scope global eth0',
  ],
  'netstat -tlnp': () => [
    'Proto Recv-Q Send-Q Local Address  Foreign Address State   PID/Program',
    'tcp   0      0      0.0.0.0:5001   0.0.0.0:*       LISTEN  1337/python3',
    'tcp   0      0      127.0.0.1:22  0.0.0.0:*       LISTEN  888/sshd',
  ],
  'history': () => terminalHistoryArr.slice(0, 20).map((c, i) => `  ${i + 1}  ${c}`),
  'cat /etc/passwd | head': () => ['root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'SiberPhp:x:1000:1000:,,,:/home/siberphp:/bin/bash'],
  'cat /etc/os-release': () => ['NAME="Kali GNU/Linux"', 'VERSION="2024.1"', 'ID=kali', 'PRETTY_NAME="Kali GNU/Linux Rolling"'],
  'df -h': () => [
    'Filesystem      Size  Used Avail Use% Mounted on',
    '/dev/sda1        50G   12G   36G  25% /',
    'tmpfs           2.0G  200M  1.8G  10% /dev/shm',
  ],
  'free -h': () => [
    '              total        used        free      shared  buff/cache   available',
    'Mem:            8G       3.2G       2.1G       420M       2.7G       4.1G',
    'Swap:           2G       0.0B       2.0G',
  ],
};

function runCommand(cmd) {
  const trimmed = cmd.trim();

  if (trimmed === 'clear' || trimmed === 'reset') {
    clearTerm();
    return;
  }

  switchToTerminal();
  addPromptEcho(trimmed);

  // Backend aktifse → WebSocket gerçek komut
  if (socket && socket.connected) {
    backendOnline = true;
    socket.emit('run_command', { cmd: trimmed });
    return;
  }

  // Local simulations
  const localFn = LOCAL_CMDS[trimmed];
  if (localFn) {
    const lines = localFn();
    lines.forEach((l, i) => setTimeout(() => addLine(l, 'white'), i * 30));
    setTimeout(() => addLine('', ''), lines.length * 30 + 10);
    return;
  }

  // TERM_SIM dict
  const sim = TERM_SIM[trimmed];
  if (sim) {
    sim.forEach((line, i) => setTimeout(() => addLine(line), i * 45));
    setTimeout(() => addLine('', ''), sim.length * 45 + 10);
    return;
  }

  // Dynamic Mailcheck matching
  if (trimmed.startsWith('python3 siberphp.py --mailcheck')) {
    const email = trimmed.split(' ')[3] || 'kuskaya008@gmail.com';
    const lines = [
      `\x1b[32m[*] Mail Kontrol (Mailcheck) modülü başlatıldı → ${email}\x1b[0m`,
      '[*] E-posta adresi analiz ediliyor...',
      '------------------------------------------------',
      `Sonuç: E-posta adresi aktif ve geçerli.`,
      `Domain: ${email.split('@')[1] || 'Bilinmiyor'}`,
      'Risk Seviyesi: Düşük',
      'Sızdırılmış Veritabanı Kaydı: 0',
      '------------------------------------------------',
      '\x1b[33m[!]\x1b[0m Daha detaylı analiz için aşağıdaki komutları deneyebilirsiniz:',
      `  \x1b[36mpython3 siberphp.py --osint ${email}\x1b[0m : Tüm sosyal medya hesaplarını tarar.`,
      `  \x1b[36mpython3 siberphp.py --pwned ${email}\x1b[0m : Sızdırılmış parola veritabanlarını kontrol eder.`,
      '\x1b[32m[+] İşlem tamamlandı.\x1b[0m'
    ];
    lines.forEach((line, i) => setTimeout(() => addLine(line), i * 45));
    setTimeout(() => addLine('', ''), lines.length * 45 + 10);
    return;
  }

  // Generic fallback
  addLine('[!] Backend çevrimdışı. Simülasyon modu aktif.', 'warn');
  addLine('', '');
  const mod = ALL_MODULES.find(m => { const flag = m.cmd.split(' ')[2]; return flag && trimmed.includes(flag); });
  if (mod) {
    const lines = [
      `\x1b[36m[*]\x1b[0m ${mod.name} başlatılıyor...`,
      `\x1b[33m[!]\x1b[0m Araç: ${mod.tool}`,
      `\x1b[33m[!]\x1b[0m Backend bağlantısı gerekli → python3 server.py`,
    ];
    lines.forEach((l, i) => setTimeout(() => addLine(l), i * 80));
  } else {
    addLine(`bash: ${trimmed.split(' ')[0]}: command not found`, 'error');
  }
  addLine('', '');
}


// ─── Aktivite Feed ────────────────────────────
function startActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  function add() {
    const d = ACTIVITY_DATA[Math.floor(Math.random() * ACTIVITY_DATA.length)];
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const el = document.createElement('div');
    el.className = 'activity-item';
    el.innerHTML = `<span class="activity-time">${now}</span><span class="activity-user">${d.user}</span><span class="activity-action">${d.action}</span>`;
    feed.insertBefore(el, feed.firstChild);
    while (feed.children.length > 10) feed.removeChild(feed.lastChild);
  }
  add();
  setInterval(add, 3200);
}

// ─── Raporlar ─────────────────────────────────
function addReport(cmd) {
  sessionReports.unshift({ title: cmd.substring(0, 60), time: new Date().toLocaleTimeString('tr-TR'), status: 'done' });
  renderReports();
}

function renderReports() {
  const area = document.getElementById('reports-area');
  if (!area) return;
  const base = [
    { title: 'Lab Oturumu Başlangıcı', time: '12:00:00', status: 'done' },
    { title: 'Sistem Bağlantı Testi', time: '12:00:05', status: 'done' },
  ];
  const all = [...sessionReports, ...base].slice(0, 15);
  area.innerHTML = all.map(r => `
    <div class="report-item">
      <div class="report-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="report-info">
        <div class="report-title">${r.title}</div>
        <div class="report-meta">cyberlab — ${r.time}</div>
      </div>
      <span class="report-status ${r.status}">${r.status === 'done' ? 'Tamamlandı ✓' : 'İşlemde...'}</span>
    </div>
  `).join('');
}

// ─── Saat ────────────────────────────────────
function startClock() {
  function tick() {
    document.getElementById('clock').textContent =
      new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick(); setInterval(tick, 1000);
}

// ─── Arama ───────────────────────────────────
document.getElementById('module-search')?.addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const overlay = document.getElementById('search-overlay');
  const results = document.getElementById('search-results');
  if (!q) { overlay.classList.remove('open'); return; }
  const found = ALL_MODULES.filter(m =>
    m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.tool.toLowerCase().includes(q)
  ).slice(0, 12);
  if (!found.length) { overlay.classList.remove('open'); return; }
  const meta = CAT_META;
  results.innerHTML = found.map(m => {
    const catMeta = meta[m.cat] || {};
    const tagClass = catMeta.tagClass || 'tag-utilities';
    return `
      <div class="search-result-item" onclick="searchLaunch('${m.cat}', '${m.name.replace(/'/g, '')}')">
        <span class="module-card-tag ${tagClass}" style="font-size:0.56rem;padding:1px 6px">${m.tag}</span>
        <span class="search-result-name">${m.name}</span>
        <span class="search-result-cat">${catMeta.emoji || ''} ${catMeta.label || ''}</span>
      </div>
    `;
  }).join('');
  overlay.classList.add('open');
});

function searchLaunch(cat, name) {
  document.getElementById('search-overlay').classList.remove('open');
  document.getElementById('module-search').value = '';
  const mod = ALL_MODULES.find(m => m.cat === cat && m.name === name);
  if (!mod) return;
  gotoPage(mod.cat, CAT_META[mod.cat]?.label || mod.cat);
  setTimeout(() => openModal(mod), 300);
}

document.addEventListener('click', e => {
  if (!document.getElementById('sidebar').contains(e.target)) {
    document.getElementById('search-overlay').classList.remove('open');
  }
});

// ─── Parçacık Animasyonu ─────────────────────
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  const pts = Array.from({ length: 55 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.45 + 0.08,
  }));
  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,255,136,${p.a})`; ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(0,255,136,${0.07 * (1 - d / 110)})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
  window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; });
})();

// ════════════════════════════════════════════════
// ── ARAÇ KURULUM SAYFASI ──────────────────────
// ════════════════════════════════════════════════

const INSTALL_TOOLS = {
  // OSINT Araçları
  'ghunt': { type: 'pip', desc: 'Google Hesapları üzerinde açık kaynak istihbaratı yapan araç.' },
  'holehe': { type: 'pip', desc: 'Bir e-posta adresinin 120+ web sitesinde kayıtlı olup olmadığını tarar.' },
  'maigret': { type: 'pip', desc: 'Bir kullanıcı adını 3000+ sitede tarayarak hesaplarını bulur.' },
  'email2phonenumber': { type: 'custom', cmd: 'rm -rf /tmp/email2phonenumber && git clone https://github.com/martinvigo/email2phonenumber.git /tmp/email2phonenumber && cd /tmp/email2phonenumber && pip3 install -r requirements.txt', desc: 'Bir e-posta adresinden telefon numarasını bulmak için OSINT aracı.' },
  'chiasmodon': { type: 'pip', desc: 'Etki alanıyla ilgili verileri, e-postaları ve alt alan adlarını arayan OSINT aracı.' },
  'tookie-osint': { type: 'custom', cmd: 'rm -rf /tmp/tookie-osint && git clone https://github.com/alfredredbird/tookie-osint.git /tmp/tookie-osint && cd /tmp/tookie-osint && pip3 install -r requirements.txt', desc: 'Gelişmiş OSINT sosyal medya hesabı bulma aracı.' },
  'spiderfoot': { type: 'custom', cmd: 'rm -rf /tmp/spiderfoot && git clone https://github.com/smicallef/spiderfoot.git /tmp/spiderfoot && cd /tmp/spiderfoot && pip3 install -r requirements.txt', desc: 'Kapsamlı otomatik OSINT bilgi toplama aracı.' },
  'snoop': { type: 'custom', cmd: 'rm -rf /tmp/snoop && git clone https://github.com/snooppr/snoop.git /tmp/snoop && cd /tmp/snoop && python3 -m pip install -r requirements.txt', desc: '4000+ sitede kullanıcı adı araması yapan OSINT aracı.' },
  'blackbird': { type: 'custom', cmd: 'rm -rf /tmp/blackbird && git clone https://github.com/p1ngul1n0/blackbird.git /tmp/blackbird && cd /tmp/blackbird && pip3 install -r requirements.txt', desc: 'Kullanıcı adına göre sosyal ağlarda hesap tarama OSINT aracı.' },
  'amass': { type: 'custom', cmd: 'rm -rf /tmp/amass && mkdir -p /tmp/amass && cd /tmp/amass && wget https://github.com/owasp-amass/amass/releases/download/v4.2.0/amass_linux_amd64.zip && unzip amass_linux_amd64.zip', desc: 'Kapsamlı saldırı yüzeyi haritalama ve asset keşif aracı.' },
  'trufflehog': { type: 'brew', desc: 'Git repoları ve dosya sistemlerinde şifre, gizli anahtar (secret) tarayan güvenlik aracı.' },
  'git-dumper': { type: 'custom', cmd: 'rm -rf /tmp/git-dumper && git clone https://github.com/arthaud/git-dumper.git /tmp/git-dumper && cd /tmp/git-dumper && pip3 install -r requirements.txt', desc: 'Açık unutulmuş .git klasörlerini indiren araç.' },
  'gitminer': { type: 'custom', cmd: 'rm -rf /tmp/gitminer && git clone https://github.com/UnkL4b/GitMiner.git /tmp/gitminer && cd /tmp/gitminer && pip3 install -r requirements.txt', desc: 'GitHub üzerindeki açık kod depolarında veri madenciliği yapar.' },
  'payloads': { type: 'custom', cmd: 'rm -rf /tmp/payloads && git clone https://github.com/swisskyrepo/PayloadsAllTheThings.git /tmp/payloads', desc: 'Web güvenliği modülleri için binlerce siber güvenlik payload deposu.' },
  'gitpython': { type: 'custom', cmd: 'pip3 install GitPython', desc: 'Python üzerinden doğrudan Git komutlarını çalıştırmanızı sağlayan kütüphane.' },
  'xposedornot': { type: 'pip', desc: 'E-posta sızıntılarını (data breaches) kontrol eden OSINT aracı.' },
  
  // Sistem araçları (brew)
  'nmap': { type: 'brew', desc: 'Ağ keşif ve port tarama aracı. Nmap otomasyonu için gerekli.' },
  'recon-ng': { type: 'custom', cmd: 'rm -rf /tmp/recon-ng && git clone https://github.com/lanmaster53/recon-ng.git /tmp/recon-ng && cd /tmp/recon-ng && pip3 install -r REQUIREMENTS', desc: 'Kapsamlı OSINT ve Web Recon frameworkü.' },
  'h8mail': { type: 'pip', pkg: 'h8mail', desc: 'Şifre sızıntıları (breach) OSINT tarayıcı aracı.' },
  'pwnedornot': { type: 'custom', cmd: 'rm -rf /tmp/pwnedOrNot && git clone https://github.com/thewhiteh4t/pwnedOrNot.git /tmp/pwnedOrNot && cd /tmp/pwnedOrNot && chmod +x install.sh && ./install.sh', desc: 'Sızdırılmış e-postalar için OSINT ve şifre bulma aracı.' },
  'nikto': { type: 'brew', desc: 'Web sunucu güvenlik açığı tarayıcısı.' },
  'sqlmap': { type: 'brew', desc: 'Otomatik SQL injection tespit ve exploit aracı.' },
  'aircrack-ng': { type: 'brew', desc: 'WiFi ağ güvenliği araç seti. Handshake crack, WPA/WEP.' },
  'hydra': { type: 'brew', desc: 'Hızlı ağ kimlik doğrulama kırıcı (SSH, FTP, HTTP...).' },
  'ncrack': { type: 'brew', desc: '11 protokol destekli kaba kuvvet aracı.' },
  'hashcat': { type: 'brew', desc: 'GPU destekli hash kırma aracı.' },
  'john': { type: 'brew', desc: 'John the Ripper — klasik şifre kırıcı.' },
  'crunch': { type: 'brew', desc: 'Özelleştirilmiş wordlist oluşturma aracı.' },
  'wafw00f': { type: 'brew', desc: 'Web Uygulama Güvenlik Duvarı tespit aracı.' },
  'gobuster': { type: 'brew', desc: 'Dizin ve dosya kaba kuvvet tarayıcısı.' },
  'exiftool': { type: 'brew', desc: 'Medya dosyası metadata okuma ve düzenleme.' },
  'chkrootkit': { type: 'brew', desc: 'Rootkit tespit ve analiz aracı.' },
  'masscan': { type: 'brew', desc: 'İnternet ölçeğinde port tarayıcı (hızlı).' },
  'wireshark': { type: 'brew', desc: 'Ağ paket analiz aracı (tshark CLI).' },
  'searchsploit': { type: 'brew', desc: 'Exploit-DB offline arama aracı.' },
  'binwalk': { type: 'brew', desc: 'Firmware analiz ve gömülü dosya çıkarma.' },
  'radare2': { type: 'brew', desc: 'Reverse engineering framework.' },
  'yara': { type: 'brew', desc: 'Malware tanımlama ve sınıflandırma kuralları.' },
  'wget': { type: 'brew', desc: 'Web dosya indirme aracı.' },
  'netcat': { type: 'brew', desc: 'TCP/UDP bağlantı aracı (nc).' },
  // Metasploit
  'metasploit': { type: 'cask', desc: 'Metasploit Framework — msfvenom, msfconsole dahil. Exploit ve payload üretimi.' },
  // Python kütüphaneleri
  'scapy': { type: 'pip', desc: 'Paket işleme ve ağ analiz Python kütüphanesi.' },
  'impacket': { type: 'pip', desc: 'SMB, Kerberos, NTLM ağ protokolleri Python kütüphanesi.' },
  'shodan': { type: 'pip', desc: 'Shodan API — internet cihaz arama motoru.' },
  'paramiko': { type: 'pip', desc: 'SSH protokolü Python implementasyonu.' },
  'cryptography': { type: 'pip', desc: 'Şifreleme primitifleri — AES, RSA, hashing.' },
  'pillow': { type: 'pip', desc: 'PIL — görsel işleme, steganografi için gerekli.' },
  'beautifulsoup4': { type: 'pip', desc: 'HTML/XML web scraping kütüphanesi.' },
  'python-nmap': { type: 'pip', desc: 'Python üzerinden nmap kontrol kütüphanesi.' },
  'pyOpenSSL': { type: 'pip', desc: 'Python OpenSSL bağlantısı — SSL analizi.' },
};

let installStatuses = {};  // tool → 'unknown'|'installed'|'missing'|'installing'

// Kurulum terminali çıktı
function installLog(text, type = '') {
  const body = document.getElementById('install-term-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = `terminal-line-out ${type}`;
  div.textContent = (text || '').replace(/\x1b\[[0-9;]*m/g, '');
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

// Araç kartı HTML
function installCardHTML(name, info, status) {
  const st = status || 'unknown';
  const stLabel = { installed: '✓ Kurulu', missing: '✗ Kurulu Değil', installing: '⟳ Kuruluyor...', unknown: '? Bilinmiyor' }[st];
  const btnLabel = { installed: '✓ Kurulu', missing: '▼ Kur', installing: '⟳ Kuruluyor...', unknown: '▼ Kur' }[st];
  const btnClass = { installed: 'installed', missing: '', installing: 'installing', unknown: '' }[st];
  const typeClass = `type-${info.type}`;
  const typeLabel = info.type.toUpperCase();
  return `
    <div class="install-card status-${st}" id="icard-${name}">
      <div class="install-card-top">
        <span class="install-card-name">${name}</span>
        <span class="install-type-badge ${typeClass}">${typeLabel}</span>
      </div>
      <div class="install-card-desc">${info.desc}</div>
      <div class="install-card-status">
        <span class="install-status-dot"></span>
        <span id="istatus-${name}">${stLabel}</span>
      </div>
      <button class="install-btn ${btnClass}" id="ibtn-${name}"
        onclick="installTool('${name}')"
        ${st === 'installed' || st === 'installing' ? 'disabled' : ''}>
        ${btnLabel}
      </button>
    </div>
  `;
}

function renderInstallGrid(statuses = {}) {
  const grid = document.getElementById('install-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(INSTALL_TOOLS).map(([name, info]) => {
    return installCardHTML(name, info, statuses[name] || 'unknown');
  }).join('');
}

function updateInstallCard(name, status) {
  installStatuses[name] = status;
  const card = document.getElementById(`icard-${name}`);
  const statusEl = document.getElementById(`istatus-${name}`);
  const btn = document.getElementById(`ibtn-${name}`);
  if (!card) return;
  card.className = `install-card status-${status}`;
  const stLabel = { installed: '✓ Kurulu', missing: '✗ Kurulu Değil', installing: '⟳ Kuruluyor...', unknown: '? Bilinmiyor' }[status];
  const btnLabel = { installed: '✓ Kurulu', missing: '▼ Kur', installing: '⟳ Kuruluyor...', unknown: '▼ Kur' }[status];
  if (statusEl) statusEl.textContent = stLabel;
  if (btn) {
    btn.textContent = btnLabel;
    btn.className = `install-btn ${status === 'installed' ? 'installed' : status === 'installing' ? 'installing' : ''}`;
    btn.disabled = status === 'installed' || status === 'installing';
  }
}

function installTool(name) {
  if (!socket || !socket.connected) {
    installLog('[!] Backend bağlantısı gerekli. Server çalışıyor mu?', 'error');
    return;
  }
  if (installStatuses[name] === 'installing') return;
  updateInstallCard(name, 'installing');
  installLog(`[*] ${name} kurulumu başlatıldı...`, 'info');
  socket.emit('install_tool', { tool: name });
}

// Backend'den kurulum çıktısı al
function initInstallListeners() {
  if (!socket) return;
  socket.on('install_output', (data) => {
    const typeMap = { info: 'info', success: 'success', error: 'error', warn: 'warn', cmd: 'cmd', out: '' };
    installLog(data.text, typeMap[data.type] || '');
  });
  socket.on('install_done', (data) => {
    const status = data.status === 'success' || data.status === 'already' ? 'installed' : 'missing';
    updateInstallCard(data.tool, status);
    if (data.status === 'success') installLog(`[✓] ${data.tool} başarıyla kuruldu!`, 'success');
    else if (data.status === 'already') installLog(`[✓] ${data.tool} zaten mevcut.`, 'success');
    else installLog(`[✗] ${data.tool} kurulum başarısız.`, 'error');
  });
  socket.on('tools_status', (statuses) => {
    installStatuses = {};
    Object.entries(statuses).forEach(([name, ok]) => {
      installStatuses[name] = ok ? 'installed' : 'missing';
    });
    renderInstallGrid(installStatuses);
    const missing = Object.values(installStatuses).filter(v => v === 'missing').length;
    const installed = Object.values(installStatuses).filter(v => v === 'installed').length;
    installLog(`[*] Kontrol tamamlandı: ${installed} kurulu, ${missing} eksik.`, 'info');
  });
}

// "Durumları Kontrol Et" butonu
document.getElementById('check-all-tools')?.addEventListener('click', () => {
  if (!socket || !socket.connected) {
    installLog('[!] Backend bağlantısı gerekli!', 'error');
    return;
  }
  installLog('[*] Tüm araçlar kontrol ediliyor...', 'info');
  socket.emit('check_tools', {});
});

// "Eksikleri Hepsini Kur" butonu
document.getElementById('install-all-missing')?.addEventListener('click', () => {
  if (!socket || !socket.connected) {
    installLog('[!] Backend bağlantısı gerekli!', 'error');
    return;
  }
  const missing = Object.entries(installStatuses)
    .filter(([, v]) => v === 'missing' || v === 'unknown')
    .map(([k]) => k);
  if (!missing.length) {
    installLog('[✓] Tüm araçlar zaten kurulu!', 'success');
    return;
  }
  installLog(`[*] ${missing.length} eksik araç sırayla kurulacak...`, 'info');
  // Sırayla kur (birbirini beklesin)
  let idx = 0;
  function installNext() {
    if (idx >= missing.length) {
      installLog('[✓] Toplu kurulum tamamlandı!', 'success');
      return;
    }
    const name = missing[idx++];
    updateInstallCard(name, 'installing');
    installLog(`[${idx}/${missing.length}] ${name} kuruluyor...`, 'info');
    socket.emit('install_tool', { tool: name });
    // Bir sonrakini install_done sonrası kur
    socket.once('install_done', () => setTimeout(installNext, 500));
  }
  installNext();
});


/* =============================================
   UBUNTU DESKTOP - WINDOW MANAGEMENT & ACADEMY
   ============================================= */

// Global Z-Index manager
let maxZ = 1000;

// Function to handle window dragging
function dragWindow(e, windowId) {
  const win = document.getElementById(windowId);
  if (!win) return;

  // Bring to front
  maxZ++;
  win.style.zIndex = maxZ;

  // Ignore drag if clicking on buttons
  if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('.window-controls')) {
    return;
  }

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  pos3 = e.clientX;
  pos4 = e.clientY;

  document.onmouseup = closeDragElement;
  document.onmousemove = elementDrag;

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    win.style.top = (win.offsetTop - pos2) + "px";
    win.style.left = (win.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Function to toggle window visibility
function toggleWindow(windowId) {
  const win = document.getElementById(windowId);
  if (!win) return;

  if (win.classList.contains('minimized')) {
    win.classList.remove('minimized');
    win.style.display = "flex";
    maxZ++;
    win.style.zIndex = maxZ;
  } else if (win.style.display === "none") {
    win.style.display = "flex";
    maxZ++;
    win.style.zIndex = maxZ;
  } else {
    win.classList.add('minimized');
  }
}

// Function to maximize/restore window
function maximizeWindow(windowId) {
  const win = document.getElementById(windowId);
  if (!win) return;

  if (!win.dataset.maximized || win.dataset.maximized === "false") {
    // Save previous geometry
    win.dataset.prevTop = win.style.top;
    win.dataset.prevLeft = win.style.left;
    win.dataset.prevWidth = win.style.width;
    win.dataset.prevHeight = win.style.height;

    // Maximize
    win.style.top = "0px";
    win.style.left = "0px";
    win.style.width = "100%";
    win.style.height = "100%";
    win.dataset.maximized = "true";
    maxZ++;
    win.style.zIndex = maxZ;
  } else {
    // Restore
    win.style.top = win.dataset.prevTop || "100px";
    win.style.left = win.dataset.prevLeft || "100px";
    win.style.width = win.dataset.prevWidth || "600px";
    win.style.height = win.dataset.prevHeight || "400px";
    win.dataset.maximized = "false";
  }
}

// Save text document function
function saveTextDocument() {
  const text = document.getElementById('text-editor-content').value;
  alert("Metin belgesi kaydedildi (Tarayıcı önbelleğine).\nBu alanı kendi notların için kullanabilirsin!");
  localStorage.setItem("cyberlab_text_notes", text);
}

// Load notes on startup
window.addEventListener('load', () => {
  const saved = localStorage.getItem("cyberlab_text_notes");
  if (saved) {
    document.getElementById('text-editor-content').value = saved;
  }
});

// Academy Logic Integration
const academyData = {
  "recon": {
    desc: "Keşif (Reconnaissance) araçları, hedefin yapısını, açık portlarını ve genel mimarisini öğrenmek için kullanılır. İlk adım her zaman bilgi toplamaktır.",
    tips: "Örnek olarak NMAP aracını seçersen: 'nmap -sV <hedef>' komutu ile hedefteki servislerin versiyonlarını öğrenebilirsin."
  },
  "network": {
    desc: "Ağ Saldırıları araçları yerel ağındaki (LAN) diğer cihazları tespit etmek, trafiği dinlemek veya araya girmek (MITM) için kullanılır.",
    tips: "Önce ağda kimlerin olduğunu görmek istersen arp-scan veya nmap kullanmalısın."
  },
  "web": {
    desc: "Web Güvenliği araçları, web sitelerindeki SQL Injection, XSS, LFI gibi açıkları bulmanı sağlar. En popülerleri SQLMap ve Nikto'dur.",
    tips: "SQLMap kullanırken, açık olduğundan şüphelendiğin bir URL'yi parametre olarak vermelisin: 'sqlmap -u http://hedef.com/page.php?id=1 --dbs'"
  },
  "bruteforce": {
    desc: "Kaba Kuvvet (Brute Force) araçları, bir servisin şifresini tahmin etmeye çalışır. Hydra veya Ncrack kullanarak SSH, FTP gibi servislere saldırılabilir.",
    tips: "Bunun için elinde iyi bir 'Wordlist' (kelime listesi) olması gerekir."
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const btnAcademy = document.getElementById("modal-academy");
  if (btnAcademy) {
    btnAcademy.addEventListener("click", () => {
      const moduleName = document.getElementById("modal-title").innerText;
      const category = document.getElementById("modal-cat-badge").innerText.toLowerCase();
      const desc = document.getElementById("modal-desc").innerText;
      const target = document.getElementById("modal-target").value || "[hedef]";

      let lessonText = `<h4>${moduleName} Kullanım Rehberi</h4>`;
      lessonText += `<p><strong>Araç Açıklaması:</strong> ${desc}</p>`;

      if (academyData[category]) {
        lessonText += `<div style="background:#111; padding:10px; border-left:3px solid #00ff88; margin-top:10px;">
                    <strong>📚 Kategori Bilgisi:</strong><br/>
                    ${academyData[category].desc}
                </div>`;
      }

      lessonText += `
            <div style="margin-top:15px;">
                <strong>🛠️ Nasıl Kullanılır?</strong><br/>
                Bu modülü çalıştırmak için <em>Hedef/Parametre</em> kutusuna hedefi yazmalısın. Örneğin: <code>${target}</code>.
                <br/><br/>
                Daha sonra <b>"▶ Terminalde Çalıştır"</b> butonuna basarak aracı güvenli laboratuvar ortamında çalıştırabilirsin.
            </div>`;

      document.getElementById("academy-content").innerHTML = lessonText;

      const academyWin = document.getElementById("academy-window");
      academyWin.style.display = "flex";
      maxZ++;
      academyWin.style.zIndex = maxZ;
    });
  }
});



// ---------------------------------
// ENFORCED ACADEMY AGENT
// ---------------------------------
const ACADEMY_DB = {
  "recon": {
    desc: "Keşif (Recon) araçları hedef hakkında açık portlar, servis versiyonları ve teknoloji yığını gibi pasif ve aktif bilgi toplamak için kullanılır. Saldırının ilk adımıdır.",
    tips: "NMAP kullanırken -sV parametresi servis versiyonlarını tespit eder. Hızlı tarama için -T4 kullan."
  },
  "network": {
    desc: "Ağ Saldırıları (Network Attacks) yerel ağdaki (LAN) cihazları keşfetmek, izinsiz erişim sağlamak veya veri trafiğini dinlemek (MITM) için kullanılır.",
    tips: "Yerel ağda cihaz bulmak için 'arp-scan -l' komutu çok etkilidir."
  },
  "web": {
    desc: "Web Güvenliği araçları, web sitelerinde yer alan SQL Injection, XSS, dosya dahil etme (LFI/RFI) gibi zafiyetleri tarar.",
    tips: "SQLMap ile veritabanı açıklarını test etmek için 'sqlmap -u <hedef_url> --dbs' komutunu kullanmalısın."
  },
  "bruteforce": {
    desc: "Kaba Kuvvet (Brute Force) araçları, bir giriş panelinin veya servisin parolasını milyonlarca ihtimali deneyerek bulmaya çalışır.",
    tips: "Bu işlem için elinde güçlü bir kelime listesi (Wordlist) olmalıdır. (Örn: rockyou.txt)"
  },
  "malware": {
    desc: "Zararlı Yazılım (Malware) araçları, hedef cihazları ele geçirmek veya arka kapı (backdoor) bırakmak için zararlı dosyalar üretir.",
    tips: "msfvenom ile ters bağlantı (reverse shell) payload'u oluşturmak en yaygın yöntemdir."
  },
  "exploit": {
    desc: "Exploit araçları, bir zafiyeti sömürmek (istismar etmek) için kullanılır. Bu adım hedefin ele geçirildiği adımdır.",
    tips: "searchsploit ile servisin bilinen bir açığı olup olmadığını hızlıca kontrol edebilirsin."
  },
  "crypto": {
    desc: "Kriptografi (Şifreleme) araçları verileri gizlemek veya şifrelenmiş verileri kırmak (Hash Cracking) için kullanılır.",
    tips: "Bir hash'in türünü anlamak için karakter uzunluğunu (MD5=32, SHA1=40, SHA256=64) kontrol et."
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Inject event listener for the Academy button whenever it is rendered
  document.body.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'modal-academy') {
      const moduleName = document.getElementById("modal-title").innerText || "Siber Güvenlik Aracı";

      // Try to find the category badge
      const catElem = document.getElementById("modal-cat-badge");
      let catName = catElem ? catElem.innerText.toLowerCase() : "genel";

      const desc = document.getElementById("modal-desc").innerText || "Bu araç ile hedefinize yönelik testler gerçekleştirebilirsiniz.";
      const target = document.getElementById("modal-target").value || "example.com";

      // Match category with database
      let dbEntry = ACADEMY_DB[catName];
      if (!dbEntry) {
        // Fallback fuzzy search
        for (let k in ACADEMY_DB) {
          if (catName.includes(k) || moduleName.toLowerCase().includes(k)) {
            dbEntry = ACADEMY_DB[k];
            break;
          }
        }
      }

      let html = `<h4 style="margin-top:0; color:#00ff88;">${moduleName} Kullanım Rehberi</h4>`;
      html += `<p><strong>⚙️ Araç Ne İşe Yarar?:</strong> <br/>${desc}</p>`;

      if (dbEntry) {
        html += `
                <div style="background:#111; padding:15px; border-left:4px solid #00ff88; margin-top:15px; border-radius:4px;">
                    <strong style="color:#00ff88;">📚 Akademi Eğitim Bilgisi:</strong><br/>
                    <div style="margin-top:8px;">${dbEntry.desc}</div>
                    <div style="margin-top:12px; color:#ddd; font-style:italic;">💡 <strong>Uzman İpucu:</strong> ${dbEntry.tips}</div>
                </div>`;
      } else {
        html += `
                <div style="background:#111; padding:15px; border-left:4px solid #00ff88; margin-top:15px; border-radius:4px;">
                    <strong style="color:#00ff88;">📚 Akademi Eğitim Bilgisi:</strong><br/>
                    <div style="margin-top:8px;">Bu araç belirli bir spesifik görevi yerine getirir. Terminal üzerinde komutla etkileşime girerek sonuçları analiz edebilirsiniz.</div>
                </div>`;
      }

      html += `
            <div style="margin-top:20px; background: rgba(221, 72, 20, 0.1); border: 1px solid #dd4814; padding: 15px; border-radius: 4px;">
                <strong style="color:#dd4814;">🛠️ Adım Adım Nasıl Kullanılır?</strong><br/><br/>
                <ol style="margin-left: -15px; line-height:1.6;">
                    <li>Arkadaki pencerede yer alan <strong>"Hedef / Parametre"</strong> kutusuna hedefini (Örn: <code>${target}</code>) yaz.</li>
                    <li>Parametreleri ayarladıktan sonra yeşil renkli <b>"▶ Terminalde Çalıştır"</b> butonuna bas.</li>
                    <li>Sistem alt tarafta terminal ekranını açacak ve aracı çalıştıracaktır. Çıkan sonuçları okuyarak analiz edebilirsin.</li>
                </ol>
            </div>`;

      document.getElementById("academy-content").innerHTML = html;

      const academyWin = document.getElementById("academy-window");
      if (academyWin) {
        academyWin.style.display = "flex";
        maxZ++;
        academyWin.style.zIndex = maxZ;
      }
    }
  });
});
// ---------------------------------

// ---------------------------------
// ACADEMY COURSES DISPLAY LOGIC
// ---------------------------------
const ACADEMY_PROGRESS_KEY = 'cyberlab_academy_progress_v1';

function academyEscapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function getAcademyProgress() {
  try { return JSON.parse(localStorage.getItem(ACADEMY_PROGRESS_KEY) || '{}'); }
  catch (_) { return {}; }
}

function academyLessonKey(courseId, lessonId) { return `${courseId}:${lessonId}`; }

function getAcademyStats() {
  const courses = Array.isArray(window.ACADEMY_COURSES) ? window.ACADEMY_COURSES : [];
  const total = courses.reduce((sum, course) => sum + course.lessons.length, 0);
  const progress = getAcademyProgress();
  const completed = courses.reduce((sum, course) => sum + course.lessons.filter(
    lesson => progress[academyLessonKey(course.id, lesson.id)]
  ).length, 0);
  const xp = courses.reduce((sum, course) => sum + course.lessons.reduce((lessonSum, lesson) => (
    lessonSum + (progress[academyLessonKey(course.id, lesson.id)] ? lesson.xp : 0)
  ), 0), 0);
  return { total, completed, xp, percent: total ? Math.round((completed / total) * 100) : 0 };
}

function focusAcademyWindow() {
  const academyWin = document.getElementById("academy-window");
  if (!academyWin) return null;
  academyWin.style.display = "flex";
  if (typeof maxZ !== 'undefined') {
    maxZ++;
    academyWin.style.zIndex = maxZ;
  }
  return academyWin;
}

window.openAcademyCourses = function(searchTerm = '') {
  if (!focusAcademyWindow()) return;
  const content = document.getElementById('academy-content');
  const courses = [...(window.ACADEMY_COURSES || [])].sort((a, b) => (a.pathOrder || 99) - (b.pathOrder || 99));
  const progress = getAcademyProgress();
  const stats = getAcademyStats();
  const normalizedSearch = String(searchTerm).trim().toLocaleLowerCase('tr-TR');
  const visibleCourses = courses.map(course => ({
    ...course,
    lessons: course.lessons.filter(lesson => !normalizedSearch || [
      course.module, course.category, lesson.id, lesson.title, lesson.summary, ...(lesson.outcomes || [])
    ].join(' ').toLocaleLowerCase('tr-TR').includes(normalizedSearch))
  })).filter(course => course.lessons.length);

  let html = `
    <section class="academy-hero">
      <div>
        <span class="academy-eyebrow">SIFIRDAN UZMANLIĞA ÖĞRENME YOLU</span>
        <h2>CyberLab Academy</h2>
        <p>CMD ve Linux komutlarından ağ temellerine, yetkili açık taramadan AI güvenliğine uzanan sıralı Türkçe eğitim arşivi.</p>
      </div>
      <div class="academy-progress-card">
        <strong>${stats.percent}%</strong><span>${stats.completed}/${stats.total} ders · ${stats.xp} XP</span>
        <div class="academy-progress-track"><i style="width:${stats.percent}%"></i></div>
      </div>
    </section>
    <div class="academy-toolbar">
      <label class="academy-search">⌕<input id="academy-search-input" type="search" placeholder="Ders, komut veya konu ara..." value="${academyEscapeHtml(searchTerm)}"></label>
    </div>
    <div class="academy-notice"><strong>Güvenli kullanım:</strong> Tüm aktif testler yalnızca kendi sisteminizde, laboratuvarda veya yazılı izin bulunan kapsamda uygulanmalıdır.</div>
    <div class="academy-roadmap">`;

  if (!visibleCourses.length) {
    html += '<div class="academy-empty">Aramanızla eşleşen ders bulunamadı.</div>';
  }
  visibleCourses.forEach(course => {
    const completedCount = course.lessons.filter(lesson => progress[academyLessonKey(course.id, lesson.id)]).length;
    html += `<article class="academy-course" style="--course-color:${academyEscapeHtml(course.moduleColor)}">
      <header class="academy-course-header">
        <div class="academy-step">${course.pathOrder || '•'}</div>
        <div><span class="academy-course-category">${academyEscapeHtml(course.category)} · ${academyEscapeHtml(course.level)}</span>
          <h3>${course.moduleEmoji} ${academyEscapeHtml(course.module)}</h3>
          <p>${academyEscapeHtml(course.description)}</p>
        </div>
        <span class="academy-course-count">${completedCount}/${course.lessons.length}</span>
      </header><div class="academy-lesson-list">`;
    course.lessons.forEach((lesson, index) => {
      const done = Boolean(progress[academyLessonKey(course.id, lesson.id)]);
      html += `<button class="academy-lesson-row ${done ? 'is-complete' : ''}" onclick="openAcademyLesson('${course.id}',${index})">
        <span class="academy-status-dot">${done ? '✓' : lesson.order}</span>
        <span class="academy-lesson-main"><strong>${academyEscapeHtml(lesson.title)}</strong><small>${academyEscapeHtml(lesson.summary)}</small></span>
        <span class="academy-lesson-meta">${academyEscapeHtml(lesson.duration)}<small>${lesson.xp} XP</small></span>
      </button>`;
    });
    html += '</div></article>';
  });
  html += '</div>';
  content.innerHTML = html;
  const input = document.getElementById('academy-search-input');
  if (input) input.addEventListener('input', event => openAcademyCourses(event.target.value));
};

window.openAcademyLesson = function(courseId, lessonIndex) {
  const course = (window.ACADEMY_COURSES || []).find(c => c.id === courseId);
  if (!course) return;
  const lesson = course.lessons[lessonIndex];
  if (!lesson) return;
  focusAcademyWindow();
  const done = Boolean(getAcademyProgress()[academyLessonKey(course.id, lesson.id)]);
  const sections = (lesson.sections || []).map(section => `
    <section class="academy-reader-section"><h3>${academyEscapeHtml(section.title)}</h3>${section.body}</section>`).join('');
  const outcomes = (lesson.outcomes || []).map(item => `<li>${academyEscapeHtml(item)}</li>`).join('');
  const commands = (lesson.commands || []).map((item, index) => `
    <div class="academy-command"><div><span>CMD ${String(index + 1).padStart(2, '0')}</span><code>${academyEscapeHtml(item.command)}</code></div>
    <button title="Komutu kopyala" onclick="copyAcademyCommand('${course.id}',${lessonIndex},${index},this)">Kopyala</button>
    <p>${academyEscapeHtml(item.explanation)}</p></div>`).join('');
  const previous = lessonIndex > 0 ? `<button class="academy-secondary-btn" onclick="openAcademyLesson('${course.id}',${lessonIndex - 1})">← Önceki ders</button>` : '';
  const next = lessonIndex < course.lessons.length - 1 ? `<button class="academy-secondary-btn" onclick="openAcademyLesson('${course.id}',${lessonIndex + 1})">Sonraki ders →</button>` : '';

  document.getElementById('academy-content').innerHTML = `
    <div class="academy-reader" style="--course-color:${academyEscapeHtml(course.moduleColor)}">
      <nav class="academy-reader-nav"><button class="academy-secondary-btn" onclick="openAcademyCourses()">← Müfredat</button><button class="academy-secondary-btn" onclick="printAcademyLesson()">PDF olarak kaydet / Yazdır</button></nav>
      <header class="academy-reader-header"><span>${academyEscapeHtml(course.module)} · Ders ${lesson.order}</span>
        <h2>${academyEscapeHtml(lesson.title)}</h2><p>${academyEscapeHtml(lesson.summary)}</p>
        <div class="academy-reader-meta"><b>${academyEscapeHtml(lesson.level)}</b><b>${academyEscapeHtml(lesson.duration)}</b><b>${lesson.xp} XP</b></div>
      </header>
      <section class="academy-outcomes"><h3>Bu derste kazanacakların</h3><ul>${outcomes}</ul></section>
      ${sections}
      <section class="academy-reader-section"><h3>Komut laboratuvarı</h3><p>Komutları sırayla ve yalnızca açıklanan güvenli hedefte çalıştır.</p>${commands}</section>
      <section class="academy-exercise"><h3>Uygulama görevi</h3><p>${academyEscapeHtml(lesson.exercise)}</p></section>
      <section class="academy-safety"><strong>⚠ Güvenlik notu</strong><p>${academyEscapeHtml(lesson.safety)}</p></section>
      <footer class="academy-reader-footer"><div>${previous}${next}</div><button class="academy-complete-btn ${done ? 'is-complete' : ''}" onclick="toggleAcademyLesson('${course.id}','${lesson.id}',${lessonIndex})">${done ? '✓ Ders tamamlandı' : 'Dersi tamamla +' + lesson.xp + ' XP'}</button></footer>
    </div>`;
};

window.copyAcademyCommand = async function(courseId, lessonIndex, commandIndex, button) {
  const course = (window.ACADEMY_COURSES || []).find(item => item.id === courseId);
  const command = course?.lessons?.[lessonIndex]?.commands?.[commandIndex]?.command;
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    button.textContent = 'Kopyalandı';
    setTimeout(() => { button.textContent = 'Kopyala'; }, 1200);
  } catch (_) {
    button.textContent = 'Seçip kopyala';
  }
};

window.toggleAcademyLesson = function(courseId, lessonId, lessonIndex) {
  const progress = getAcademyProgress();
  const key = academyLessonKey(courseId, lessonId);
  if (progress[key]) delete progress[key]; else progress[key] = { completedAt: new Date().toISOString() };
  localStorage.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify(progress));
  openAcademyLesson(courseId, lessonIndex);
};

window.printAcademyLesson = function() {
  document.body.classList.add('academy-printing');
  window.print();
  setTimeout(() => document.body.classList.remove('academy-printing'), 300);
};

/* ─── WALLPAPER MANAGEMENT ─── */
let currentWallpaperIdx = 1;
const totalWallpapers = 3;
const wallpaperStorageKey = 'cyberlab_wallpaper';
const wallpaperThemes = {
    kali: {
        background: "url('assets/wallpapers/wp1.png') center/cover no-repeat",
        showLogo: true,
    },
    hacker: {
        background: "url('https://c4.wallpaperflare.com/wallpaper/74/451/779/matrix-binary-code-hacker-green-wallpaper-preview.jpg') center/cover no-repeat",
    },
    dark: {
        background: '#050505',
    },
};

function getWallpaperDesktop() {
    return document.getElementById('linux-workspace');
}

function getValidWallpaperIdx(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= totalWallpapers ? parsed : 1;
}

function setWallpaperLogoVisible(isVisible) {
    const logo = document.querySelector('.kali-wallpaper-logo');
    if (logo) logo.style.display = isVisible ? 'flex' : 'none';
}

function applyNumberedWallpaper(idx, persist = true) {
    currentWallpaperIdx = getValidWallpaperIdx(idx);
    const desktop = document.getElementById('linux-workspace');
    if (desktop) {
        desktop.style.backgroundImage = `url('assets/wallpapers/wp${currentWallpaperIdx}.png')`;
        desktop.style.backgroundSize = 'cover';
        desktop.style.backgroundPosition = 'center';
        desktop.style.backgroundRepeat = 'no-repeat';
    }
    setWallpaperLogoVisible(false);
    if (persist) localStorage.setItem(wallpaperStorageKey, String(currentWallpaperIdx));
}

function applyNamedWallpaper(type, persist = true) {
    const theme = wallpaperThemes[type];
    if (!theme) {
        applyNumberedWallpaper(1, persist);
        return;
    }

    const desktop = getWallpaperDesktop();
    if (desktop) desktop.style.background = theme.background;
    setWallpaperLogoVisible(Boolean(theme.showLogo));
    if (persist) localStorage.setItem(wallpaperStorageKey, type);
}

window.changeWallpaper = function(type) {
    if (typeof type === 'string' && type.trim()) {
        applyNamedWallpaper(type.trim());
        return;
    }

    applyNumberedWallpaper(currentWallpaperIdx >= totalWallpapers ? 1 : currentWallpaperIdx + 1);
};

document.addEventListener('DOMContentLoaded', () => {
    // Restore wallpaper
    const savedWp = localStorage.getItem(wallpaperStorageKey);
    if (!savedWp) return;

    if (/^\d+$/.test(savedWp)) {
        applyNumberedWallpaper(savedWp, false);
    } else if (wallpaperThemes[savedWp]) {
        applyNamedWallpaper(savedWp, false);
    } else {
        localStorage.removeItem(wallpaperStorageKey);
        applyNumberedWallpaper(1, false);
    }
});

/* ─── DESKTOP CONTEXT MENU & WINDOW MANAGEMENT ─── */
document.addEventListener('DOMContentLoaded', () => {
    const desktop = document.getElementById('linux-workspace');
    const contextMenu = document.getElementById('desktop-context-menu');
    
    if (desktop && contextMenu) {
        desktop.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Get position
            let x = e.clientX;
            let y = e.clientY;
            
            // Adjust if menu goes out of window
            const menuWidth = contextMenu.offsetWidth || 180;
            const menuHeight = contextMenu.offsetHeight || 160;
            
            if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth;
            if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight;
            
            contextMenu.style.left = `${x}px`;
            contextMenu.style.top = `${y}px`;
            contextMenu.classList.add('active');
        });
        
        document.addEventListener('click', (e) => {
            if (contextMenu.classList.contains('active')) {
                contextMenu.classList.remove('active');
            }
        });
    }

    // Improved Window Z-Index Management
    let topZIndex = 110;
    const windows = document.querySelectorAll('.linux-window');
    windows.forEach(win => {
        win.addEventListener('mousedown', () => {
            topZIndex++;
            win.style.zIndex = topZIndex;
        });
    });
});

/* ─── DESKTOP CLOCK UPDATE ─── */
function updateLinuxClock() {
    const clockEl = document.getElementById('linux-clock');
    if (!clockEl) return;
    const now = new Date();
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    clockEl.textContent = now.toLocaleDateString('tr-TR', options).replace(',', '');
}
setInterval(updateLinuxClock, 1000);
updateLinuxClock();

// BOOT SIMULATION
document.addEventListener('DOMContentLoaded', () => {
    const bootScreen = document.getElementById('boot-screen');
    const bootLogs = document.getElementById('boot-logs');
    const desktop = document.getElementById('linux-desktop');
    
    if (bootScreen && bootLogs) {
        // Eğer kullanıcı zaten giriş yapmışsa veya bu oturumda boot edildiyse direkt masaüstüne geç
        if (localStorage.getItem('cyberlab_user') || sessionStorage.getItem('booted') === 'true') {
            bootScreen.style.display = 'none';
            desktop.style.display = 'block';
            return;
        }

        sessionStorage.setItem('booted', 'true');
        desktop.style.display = 'none'; // Masaüstünü gizle
        bootScreen.style.display = 'block';
        
        const logs = [
            "BIOS Date 06/29/26 21:00:00 Ver 08.00.15",
            "CPU: Intel(R) Core(TM) i9-13900K CPU @ 3.00GHz",
            "Memory: 65536 OK",
            "Booting from Hard Disk...",
            "Loading Linux 6.1.0-kali7-amd64...",
            "Loading initial ramdisk...",
            "[ OK ] Mounted /boot/efi.",
            "[ OK ] Reached target Local File Systems.",
            "[ OK ] Started CyberLab Kernel Modules.",
            "Starting Network Manager...",
            "[ OK ] Started Network Manager.",
            "[ OK ] Reached target Network.",
            "Starting Secure Shell Service...",
            "Starting System Logging Service...",
            "[ OK ] Started Secure Shell Service.",
            "[ OK ] Started System Logging Service.",
            "Initializing GUI environment...",
            "Starting X11 Display Manager...",
            "WELCOME TO CYBERLAB OS"
        ];
        
        let i = 0;
        function printLog() {
            if (i < logs.length) {
                const p = document.createElement('div');
                p.textContent = logs[i];
                if (logs[i].includes("OK")) p.innerHTML = logs[i].replace("[ OK ]", "[ <span style='color:var(--green)'>OK</span> ]");
                bootLogs.appendChild(p);
                i++;
                setTimeout(printLog, Math.random() * 150 + 50);
            } else {
                setTimeout(() => {
                    bootScreen.style.opacity = '0';
                    bootScreen.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => {
                        bootScreen.style.display = 'none';
                        desktop.style.display = 'block';
                    }, 500);
                }, 1000);
            }
        }
        printLog();
    }
});

function changeAccentColor(color) {
    document.documentElement.style.setProperty('--cyan', color);
    // Geri bildirimi güçlendirebiliriz
    console.log("Accent color changed to: " + color);
}
