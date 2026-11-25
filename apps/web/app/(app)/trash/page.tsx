import { Suspense } from 'react';
import { TrashScreen } from '../../../components/trash/trash-screen';

// TrashScreen reads its filter from useSearchParams, which needs a Suspense
// boundary so the rest of the route can still be prerendered (Next 16 docs).
export default function TrashPage() {
  return (
    <Suspense fallback={null}>
      <TrashScreen />
    </Suspense>
  );
}
