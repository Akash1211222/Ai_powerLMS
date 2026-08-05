import { BrandLoader } from '@/components/brand-loader';

/** Route-level suspense fallback while Next.js streams authenticated pages. */
export default function AppLoading() {
  return <BrandLoader message="Opening this module…" />;
}
