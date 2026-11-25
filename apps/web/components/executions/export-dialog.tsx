'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildReportOptions,
  chartFilterLabel,
  describeFilters,
  isDashboardFiltered,
  type ExecutionFilters,
  type ExecutionReportOptions,
  type RunTableState,
} from '@railgun-qa/reporting';
import { Download } from 'lucide-react';
import { shortDate } from '../charts/chart-format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Shown when the requested report fails (specs/executions-screen). */
export const REPORT_FAILED_TEXT = "The report couldn't be generated.";

export interface ExportDialogProps {
  filters: ExecutionFilters;
  runTable: RunTableState;
  ranges: ExecutionReportOptions['ranges'];
  timeZone: string;
  executionCount: number;
  tagName: (id: string) => string;
  /** Requests the Executions dashboard report with the options the dialog built. */
  onDownload: (options: ExecutionReportOptions) => void;
  /** The requested report's progress, from useReportDownload. */
  downloadState: 'idle' | 'generating' | 'failed';
}

/**
 * The Executions dashboard's export (PRD §6.3.6, Export): the button, the two switches,
 * the filters notice, and Download PDF, which requests the report with the options built
 * here, reads "Generating…" until the file is ready, and offers Try again on failure.
 */
export function ExportDialog({ filters, runTable, ranges, timeZone, executionCount, tagName, onDownload, downloadState }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [includeExecutions, setIncludeExecutions] = useState(true);
  const [includeRuns, setIncludeRuns] = useState(false);
  const filtered = isDashboardFiltered(filters, runTable);
  const runsLabel = runTable.tab === 'needsAttention' ? 'Needs Attention' : 'Runs';
  const notice = [
    ...describeFilters(filters, tagName),
    ...(runTable.tab === 'needsAttention' ? ['Runs: Needs Attention'] : []),
    ...(chartFilterLabel(runTable, shortDate) ? [`Runs filter: ${chartFilterLabel(runTable, shortDate)}`] : []),
    ...(runTable.name.trim() ? [`Runs name: ${runTable.name.trim()}`] : []),
  ];
  const nothingSelected = !includeExecutions && !includeRuns;
  const generating = downloadState === 'generating';
  // The dialog closes once a requested report has downloaded (generating → idle).
  const previous = useRef(downloadState);
  useEffect(() => {
    if (previous.current === 'generating' && downloadState === 'idle') setOpen(false);
    previous.current = downloadState;
  }, [downloadState]);
  // ExecutionReportOptions, the contract the report job reads (executions-dashboard-report).
  const options = buildReportOptions({
    tz: timeZone,
    filters,
    runTable,
    ranges,
    include: { executions: includeExecutions, runs: includeRuns },
  });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="size-4" />
        {filtered ? 'Download filtered report' : 'Download report'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download report</DialogTitle>
            <DialogDescription>Choose what the PDF includes. It uses the chart ranges shown on screen.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="export-executions">
                Test Executions <span className="text-muted-foreground">({executionCount} {executionCount === 1 ? 'execution' : 'executions'})</span>
              </Label>
              <Switch id="export-executions" checked={includeExecutions} onCheckedChange={setIncludeExecutions} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="export-runs">{runsLabel}</Label>
              <Switch id="export-runs" checked={includeRuns} onCheckedChange={setIncludeRuns} />
            </div>
            {notice.length > 0 && (
              <div role="note" aria-label="Active filters" className="rounded-md bg-muted px-3 py-2 text-xs">
                <p className="font-medium">The report follows these filters:</p>
                <ul className="list-disc pl-4">
                  {notice.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}
            {downloadState === 'failed' && (
              <p role="alert" className="flex items-center gap-2 text-xs text-fail">
                {REPORT_FAILED_TEXT}
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => onDownload(options)}>
                  Try again
                </Button>
              </p>
            )}
            <Button type="button" disabled={nothingSelected || generating} onClick={() => onDownload(options)}>
              {generating ? 'Generating…' : 'Download PDF'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
