import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    lng: 'fr',
    fallbackLng: 'ar',
    resources: {
      ar: {
        translation: require('../../public/locales/ar/translation.json'),
      },
    },
  });

export default i18n;