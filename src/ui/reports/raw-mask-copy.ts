import { defineCopy } from '../../platform/i18n/define';

export const rawMaskCopy = defineCopy({
  en: {
    title: 'Raw mask',
    note: 'One saved layer as a PNG at the reference photo’s native pixel dimensions. Black mask, transparent outside; no photo, crop, grid, legend or layer styling. Maximum 32 million pixels.',
    surface: 'Surface',
    version: 'Version',
    current: 'Current saved assessment',
    layer: 'Layer',
    empty: 'Choose a surface and version with a saved mask layer.',
    download: 'Download raw mask PNG',
    cancel: 'Cancel download',
    working: 'Preparing mask…',
    failed: 'Could not export the mask. Check the photo dimensions and try again.',
  },
  hu: {
    title: 'Nyers maszk',
    note: 'Egy mentett réteg PNG-ként, a referenciafotó eredeti képpontméretével. Fekete maszk, körülötte átlátszó; fotó, vágás, rács, jelmagyarázat és rétegstílus nélkül. Legfeljebb 32 millió képpont.',
    surface: 'Felület',
    version: 'Verzió',
    current: 'Jelenlegi mentett felmérés',
    layer: 'Réteg',
    empty: 'Válassz mentett maszkréteget tartalmazó felületet és verziót.',
    download: 'Nyers maszk letöltése PNG-ként',
    cancel: 'Letöltés megszakítása',
    working: 'Maszk előkészítése…',
    failed: 'Nem sikerült exportálni a maszkot. Ellenőrizd a fotó méretét, majd próbáld újra.',
  },
});
