"const ALL_MODULES = [
  // ══════ KABLOSUZ AĞ GÜVENLİĞİ ══════
  {
    cat: 'wireless', tag: 'WIFI', tool: 'aircrack-ng',
    name: 'WPA/WPA2 Parola Kırma',
    desc: 'Yakalanan handshake veya PMKID dosyaları üzerinden çevrimdışı sözlük saldırısı yapar.',
    cmd: 'python3 siberphp.py --aircrack {hedef.cap} {wordlist}',
    param: 'Yakalanan pcap dosyası ve kelime listesi',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'airmon-ng',
    name: 'Monitor Mod Yöneticisi',
    desc: 'Kablosuz ağ adaptörünü monitor moduna alır veya moddan çıkarır.',
    cmd: 'python3 siberphp.py --airmon {interface}',
    param: 'Ağ arayüzü (örn: wlan0)',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'aireplay-ng',
    name: 'Deauth & Paket Enjeksiyonu',
    desc: 'Hedef ağdaki istemcilere deauth paketleri göndererek ağdan düşmelerini sağlar.',
    cmd: 'python3 siberphp.py --deauth {bssid} {client}',
    param: 'Hedef BSSID ve İstemci MAC',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'hcxdumptool',
    name: 'PMKID Yakalama Aracı',
    desc: 'WPA2/WPA3 ağlardan istemcisiz PMKID hash\'lerini yakalamak için kullanılır.',
    cmd: 'python3 siberphp.py --pmkid {interface}',
    param: 'Monitor modundaki arayüz',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'wifite',
    name: 'Otomatik Kablosuz Denetim',
    desc: 'WEP, WPA ve WPS ağlara karşı otomatik saldırı vektörlerini sırayla dener.',
    cmd: 'python3 siberphp.py --wifite {bssid}',
    param: 'Hedef BSSID',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'wifiphisher',
    name: 'Evil Twin & Captive Portal',
    desc: 'Hedef ağın sahte ikizini oluşturur ve kullanıcıları sahte doğrulama sayfasına yönlendirir.',
    cmd: 'python3 siberphp.py --wifiphisher {ssid}',
    param: 'Taklit edilecek SSID',
  },
  {
    cat: 'wireless', tag: 'WIFI', tool: 'reaver',
    name: 'WPS Pixie-Dust Analizi',
    desc: 'WPS destekli erişim noktalarına Pix
<truncated 9172 bytes>