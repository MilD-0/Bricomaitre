import {getRequestConfig} from 'next-intl/server';
import { cookies } from 'next/headers';
import { getUserLocale } from './locale';

export default getRequestConfig(async () => {

  const locale = await getUserLocale();

  return {
    locale: locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});