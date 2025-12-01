import { GeneratedImage, StylePreset } from '../types';
import { DEFAULT_PRESETS } from '../constants';

const DB_NAME = 'GigaPeachDB';
const DB_VERSION = 2; // Upgraded to support index
const STORE_GALLERY = 'gallery';
const STORE_PRESETS = 'presets';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_GALLERY)) {
        const galleryStore = db.createObjectStore(STORE_GALLERY, { keyPath: 'id' });
        galleryStore.createIndex('timestamp', 'timestamp', { unique: false });
      } else {
        // Upgrade existing store
        const tx = (event.target as IDBOpenDBRequest).transaction;
        const galleryStore = tx!.objectStore(STORE_GALLERY);
        if (!galleryStore.indexNames.contains('timestamp')) {
            galleryStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORE_PRESETS)) {
        db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
      }
    };
  });
};

export const saveImage = async (image: GeneratedImage): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    const store = tx.objectStore(STORE_GALLERY);
    const request = store.put(image);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteImage = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    const store = tx.objectStore(STORE_GALLERY);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Clear all images but keep presets
export const clearGallery = async (): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_GALLERY, 'readwrite');
        const store = tx.objectStore(STORE_GALLERY);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getGallery = async (): Promise<GeneratedImage[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GALLERY, 'readonly');
    const store = tx.objectStore(STORE_GALLERY);
    // Prefer using the index if available
    const index = store.index('timestamp');
    const request = index.getAll(); 
    
    request.onsuccess = () => {
      // Index is ascending by default, reverse for newest first
      const results = request.result as GeneratedImage[];
      resolve(results.reverse());
    };
    request.onerror = () => reject(request.error);
  });
};

// Paginated fetch for optimization
export const getPaginatedGallery = async (limit: number, lastTimestamp?: number): Promise<GeneratedImage[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_GALLERY, 'readonly');
        const store = tx.objectStore(STORE_GALLERY);
        const index = store.index('timestamp');
        
        let range: IDBKeyRange | null = null;
        if (lastTimestamp) {
            // Fetch items OLDER than lastTimestamp (descending order)
            // upperOpen ensures we don't fetch the same item again
            range = IDBKeyRange.upperBound(lastTimestamp, true);
        }

        const request = index.openCursor(range, 'prev'); // 'prev' = descending order
        const results: GeneratedImage[] = [];

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor && results.length < limit) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
};

export const savePreset = async (preset: StylePreset): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRESETS, 'readwrite');
      const store = tx.objectStore(STORE_PRESETS);
      const request = store.put(preset);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
};

export const getAllPresets = async (): Promise<StylePreset[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRESETS, 'readwrite');
      const store = tx.objectStore(STORE_PRESETS);
      
      const countRequest = store.count();

      countRequest.onsuccess = () => {
          if (countRequest.result === 0) {
              // Seed defaults if empty
              DEFAULT_PRESETS.forEach(p => store.put(p));
              // Return defaults immediately
              resolve(DEFAULT_PRESETS);
          } else {
              // Fetch existing
              const request = store.getAll();
              request.onsuccess = () => resolve(request.result as StylePreset[]);
              request.onerror = () => reject(request.error);
          }
      };
      
      countRequest.onerror = () => reject(countRequest.error);
    });
};

export const deletePreset = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRESETS, 'readwrite');
      const store = tx.objectStore(STORE_PRESETS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
};