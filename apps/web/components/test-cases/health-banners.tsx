import { Activity, CircleSlash, Hourglass, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';
import type { HealthFlag, TestCaseHealth } from '../../lib/test-cases-api';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;

/** Whole days between the last completed run and the moment health was evaluated. */
export function daysSinceLastRun(health: TestCaseHealth): number | null {
  if (!health.lastCompletedAt) return null;
  return Math.floor((Date.parse(health.asOf) - Date.parse(health.lastCompletedAt)) / DAY_MS);
}

interface Banner {
  title: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  tone: 'fail' | 'review' | 'pass' | 'muted';
}

/** The banner for one flag (PRD §6.2.3); No Script has none, as the detail already says "Manual". */
function bannerFor(flag: HealthFlag, health: TestCaseHealth): Banner | null {
  const trend = health.trend;
  switch (flag) {
    case 'Orphan':
      return { title: 'Orphan', text: 'This test case has never been added to any execution.', icon: CircleSlash, tone: 'review' };
    case 'NeverRun':
      return { title: 'Never run', text: 'It has been added to an execution but never actually run.', icon: Hourglass, tone: 'review' };
    case 'Dormant': {
      const days = daysSinceLastRun(health);
      return { title: 'Dormant', text: `Its last run was ${days} days ago.`, icon: Activity, tone: 'review' };
    }
    case 'Degrading':
      return {
        title: 'Degrading',
        text: `Its pass rate fell from ${trend?.previousPassPct}% to ${trend?.recentPassPct}% over its last 5 runs.`,
        icon: TrendingDown,
        tone: 'fail',
      };
    case 'Improving':
      return {
        title: 'Improving',
        text: `Its pass rate rose from ${trend?.previousPassPct}% to ${trend?.recentPassPct}% over its last 5 runs.`,
        icon: TrendingUp,
        tone: 'pass',
      };
    case 'TrendReset':
      return {
        title: 'Trend reset',
        text: 'The Gherkin script was edited recently. Runs before the edit are left out of the trend until 10 runs complete after it.',
        icon: RotateCcw,
        tone: 'muted',
      };
    default:
      return null;
  }
}

const TONES: Record<Banner['tone'], string> = {
  fail: 'border-fail/40 bg-fail/10 text-fail',
  review: 'border-review/40 bg-review/10',
  pass: 'border-pass/40 bg-pass/10',
  muted: 'bg-muted/40',
};

/** The test case's health banners (specs/test-cases-screen), one per flag. */
export function HealthBanners({ health }: { health: TestCaseHealth | undefined }) {
  const banners = (health?.flags ?? []).map((flag) => bannerFor(flag, health!)).filter((b): b is Banner => b !== null);
  if (banners.length === 0) return null;
  return (
    <ul aria-label="Health" className="flex flex-col gap-2">
      {banners.map(({ title, text, icon: Icon, tone }) => (
        <li key={title} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', TONES[tone])}>
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{title}:</span> <span className="text-foreground/90">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
