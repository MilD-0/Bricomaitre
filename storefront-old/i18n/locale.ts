'use server';

import {cookies} from 'next/headers';
import {Locale, defaultLocale} from './config';


const COOKIE_NAME = 'lo';
const s = typeof window !== "undefined" ? window.localStorage : null;
export async function getUserLocale() {
  return cookies().get(COOKIE_NAME)?.value || defaultLocale;
}

export async function setUserLocale(locale: Locale) {
  cookies().set(COOKIE_NAME, locale);
}