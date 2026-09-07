'use client';
import { LandingPageBuilderView } from './landing-builder/landing-builder-view';
import { useLandingPageBuilder } from './landing-builder/use-landing-builder';
export function LandingPageBuilder(...args: Parameters<typeof useLandingPageBuilder>) {
  const model = useLandingPageBuilder(...args);
  if (model.view === null) return model.fallback;
  return <LandingPageBuilderView {...model.view} />;
}
