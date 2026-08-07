"const ALL_MODULES = [

  // ââââââ KEÅIF & RECON ââââââ
  {
    cat: 'recon', tag: 'RECON', tool: 'searchsploit',
    name: 'Exploit Tarama Otomasyonu',
    desc: 'Searchsploit kullanarak hedef yazÄ±lÄ±m veya versiyona ait exploit taramasÄ± gerÃ§ekleÅtirir.',
    cmd: 'python3 siberphp.py --searchsploit {hedef/versiyon}',
    param: 'YazÄ±lÄ±m adÄ± veya versiyon (Ã¶rn: apache 2.4.49)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'nmap',
    name: 'Port Tarama AracÄ±',
    desc: 'NMAP otomasyonunu geliÅmiÅ biÃ§imde saÄlar. HÄ±zlÄ±, tam, aÃ§Ä±k, servis, versiyon ve OS tarama seÃ§enekleri sunar.',
    cmd: 'python3 siberphp.py --nmap {hedef}',
    param: 'IP adresi veya domain (Ã¶rn: 192.168.1.1)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'wafw00f',
    name: 'GÃ¼venlik DuvarÄ± Tespit AracÄ±',
    desc: 'wafw00f ile hedef site Ã¼zerindeki WAF (Web Application Firewall) gÃ¼venlik duvarÄ±nÄ± tespit eder.',
    cmd: 'python3 siberphp.py --wafw00f {hedef}',
    param: 'Hedef URL (Ã¶rn: https://example.com)',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'nikto',
    name: 'Zaafiyet Analiz AracÄ± (Nikto)',
    desc: 'Nikto ile web sunucusuna yÃ¶nelik kapsamlÄ± zaafiyet analizi yapar.',
    cmd: 'python3 siberphp.py --nikto {hedef}',
    param: 'Hedef URL veya IP',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'lynis',
    name: 'Zaafiyet Analiz AracÄ± 2 (Lynis)',
    desc: 'Lynis ile sistem genelinde derinlemesine gÃ¼venlik ve zaafiyet analizi yapar.',
    cmd: 'python3 siberphp.py --lynis',
    param: 'Parametre gerekmez',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'wpscan',
    name: 'WordPress Tarama AracÄ±',
    desc: 'WPScan ile WordPress eklenti, tema, yÃ¶netici ismi taramasÄ± veya hÄ±zlÄ± genel tarama gerÃ§ekleÅtirir.',
    cmd: 'python3 siberphp.py --wpscan {url}',
    param: 'WordPress site URL\'si',
  },
  {
    cat: 'recon', tag: 'RECON', tool: 'ike-scan',
    name: 'Hedef IP VPN Kontrol',
    desc: 'ike-scan kullana
<truncated 39590 bytes>