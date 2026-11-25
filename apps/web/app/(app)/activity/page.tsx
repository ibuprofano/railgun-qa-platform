import { Suspense } from 'react';
import { ActivityScreen } from '../../../components/activity/activity-screen';

// ActivityScreen reads its filter from useSearchParams, which needs a Suspense
// boundary so the rest of the route can still be prerendered (Next 16 docs).
export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityScreen />
    </Suspense>
  );
}
