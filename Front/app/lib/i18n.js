import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    lng: 'fr', // default language (untranslated text)
    fallbackLng: 'fr', // fallback language
    resources: {
      ar: {
        translation: require('../../public/locales/ar/translation.json'),
      },
    },
  });

export default i18n;