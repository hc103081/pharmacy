'use client';

import { Suspense } from 'react';
import ScanContent from './ScanContent';
import ScanLoading from './loading';

export default function ScanPage() {
  return (
    <Suspense fallback={<ScanLoading />}>
      <ScanContent />
    </Suspense>
  );
}
