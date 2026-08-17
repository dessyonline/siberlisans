import { get, set, del, keys } from 'idb-keyval';

export type StorageKey = 'products' | 'user_profile' | 'orders' | 'cart' | 'wallet';

export const storage = {
  async getItem<T>(key: StorageKey): Promise<T | null> {
    try {
      const data = await get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) : null;
    }
  },
  
  async setItem<T>(key: StorageKey, value: T): Promise<void> {
    const stringified = JSON.stringify(value);
    try {
      await set(key, stringified);
    } catch (e) {
      localStorage.setItem(key, stringified);
    }
  },

  async clear(): Promise<void> {
    try {
      const allKeys = await keys();
      await Promise.all(allKeys.map((k) => del(k)));
      localStorage.clear();
    } catch (e) {
      localStorage.clear();
    }
  }
};

export const seedLocalData = async () => {
  const existing = await storage.getItem('products');
  if (existing) return;

  const demoProducts = [
    {
      id: 'local-1',
      name: 'Windows 11 Pro Retail',
      slug: 'windows-11-pro',
      description: 'Orijinal Windows 11 Pro lisans anahtarı. Ömürlük kullanım.',
      price_try: 149.99,
      category: 'Windows',
      active: true,
      featured: true,
      stock_hint: 50,
      unlimited_stock: false,
      tier: 'epic'
    },
    {
      id: 'local-2',
      name: 'Office 2021 Professional Plus',
      slug: 'office-2021-pro',
      description: 'Tam sürüm Microsoft Office 2021 paketi.',
      price_try: 199.99,
      category: 'Microsoft Office',
      active: true,
      featured: true,
      stock_hint: 25,
      unlimited_stock: false,
      tier: 'rare'
    }
  ];

  await storage.setItem('products', demoProducts);
};
