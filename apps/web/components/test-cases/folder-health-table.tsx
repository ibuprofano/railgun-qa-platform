import type { TestCaseDashboard } from '../../lib/test-cases-api';
import { ISSUE_FLAGS } from '@railgun-qa/reporting';
import { SectionCard } from '../dashboard/section-card';
import { ISSUE_LABELS, issueBadgeClass } from './dashboard-format';
import { cn } from '@/lib/utils';

/** Folder issue emphasis (PRD §6.12.3): red at 50% or more of its test cases, otherwise amber. */
export function folderIssueClass(pct: number): string {
  return pct >= 50 ? 'text-fail' : 'text-review';
}

/** Folder Health (PRD §6.2.4): one row per folder holding test cases, worst first. */
export function FolderHealthTable({ rows }: { rows: TestCaseDashboard['folderHealth'] }) {
  return (
    <SectionCard title="Folder Health">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No folders hold test cases yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Folder Health" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Folder</th>
                <th className="py-1.5 pr-3 font-medium">Cases</th>
                <th className="py-1.5 pr-3 font-medium">Issues</th>
                <th className="py-1.5 font-medium">Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.folderId} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{row.path.join(' / ')}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.cases}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.withIssues === 0 ? (
                      <span className="text-pass">—</span>
                    ) : (
                      <span className={cn('font-semibold', folderIssueClass(row.issuePct))}>
                        {row.withIssues} ({row.issuePct}%)
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="flex flex-wrap gap-1">
                      {ISSUE_FLAGS.filter((flag) => row.breakdown[flag]).map((flag) => (
                        <span key={flag} className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', issueBadgeClass(flag))}>
                          {ISSUE_LABELS[flag]} ×{row.breakdown[flag]}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
