import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LineChart } from './line-chart';
import { DonutChart } from './donut-chart';
import { StackedBarChart } from './stacked-bar-chart';
import { WordCloud } from './word-cloud';
import { useState } from 'react';
import type { Range } from './range-select';
import { shortDate } from './chart-format';
import { TooltipProvider } from '@/components/ui/tooltip';

/** 90 days ending 2026-11-24. */
const DATES = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 10, 24 - 89 + i)).toISOString().slice(0, 10));

const renderChart = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

const bugSeries = () => [
  { key: 'reported', label: 'Reported', color: 'red', values: DATES.map((_, i) => (i === 89 ? 3 : i % 7 === 0 ? 1 : 0)) },
  { key: 'resolved', label: 'Resolved', color: 'green', values: DATES.map((_, i) => (i === 89 ? 1 : 0)) },
];

describe('LineChart', () => {
  it('defaults to 30 days, and its range changes only that chart', () => {
    renderChart(
      <>
        <LineChart title="Pass Rate" dates={DATES} kind="percent" series={[{ key: 'p', label: 'Pass rate', color: 'green', values: DATES.map(() => 70) }]} />
        <LineChart title="Bug Velocity" dates={DATES} kind="count" series={bugSeries()} />
      </>,
    );
    const pass = screen.getByRole('figure', { name: 'Pass Rate' });
    const bugs = screen.getByRole('figure', { name: 'Bug Velocity' });
    expect(within(pass).getByRole('radio', { name: '30d' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(pass).getByRole('radio', { name: '7d' }));

    expect(within(pass).getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    expect(within(bugs).getByRole('radio', { name: '30d' }).getAttribute('aria-checked')).toBe('true');
    expect(pass.querySelector('figcaption')!.textContent).toBe('Pass Rate over the last 7 days; 70% today');
  });

  it('reads each day with the arrow keys, showing the date and values', () => {
    renderChart(<LineChart title="Bug Velocity" dates={DATES} kind="count" series={bugSeries()} />);
    const svg = within(screen.getByRole('figure', { name: 'Bug Velocity' })).getByLabelText(/use the arrow keys/);

    fireEvent.keyDown(svg, { key: 'End' });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain(shortDate('2026-11-24'));
    expect(status.textContent).toContain('Reported 3');
    expect(status.textContent).toContain('Resolved 1');

    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toContain(shortDate('2026-11-23'));
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(screen.getByRole('status').textContent).toContain(shortDate(DATES[60]));
  });

  it('draws a day with no data as 0, one point per day', () => {
    renderChart(<LineChart title="Pass Rate" dates={DATES} kind="percent" series={[{ key: 'p', label: 'Pass rate', color: 'green', values: DATES.map((_, i) => (i === 80 ? 0 : 50)) }]} />);
    const path = screen.getByRole('figure', { name: 'Pass Rate' }).querySelector('[data-series="p"] path')!;
    expect(path.getAttribute('d')!.match(/[ML]/g)).toHaveLength(30);
  });

  it('hides a series from its legend, marking it, and from the values shown', () => {
    renderChart(<LineChart title="Bug Velocity" dates={DATES} kind="count" series={bugSeries()} />);
    const figure = screen.getByRole('figure', { name: 'Bug Velocity' });
    const reported = within(figure).getByRole('button', { name: 'Reported' });
    expect(reported.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(reported);

    expect(reported.getAttribute('aria-pressed')).toBe('false');
    expect(figure.querySelector('[data-series="reported"]')).toBeNull();
    expect(figure.querySelector('[data-series="resolved"]')).not.toBeNull();
    fireEvent.keyDown(within(figure).getByLabelText(/use the arrow keys/), { key: 'End' });
    expect(screen.getByRole('status').textContent).not.toContain('Reported');
    expect(figure.querySelector('figcaption')!.textContent).toBe('Bug Velocity over the last 30 days: Resolved 1');
  });

  it('shows its empty line when every value in range is null', () => {
    renderChart(<LineChart title="Health Score" dates={DATES} kind="percent" emptyText="No data yet." series={[{ key: 'h', label: 'Health', color: 'blue', values: DATES.map(() => null) }]} />);
    expect(screen.getByText('No data yet.')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Health Score' }).querySelector('svg')).toBeNull();
  });
});

describe('DonutChart', () => {
  const parts = [
    { key: 'pass', label: 'Pass', color: 'green', count: 30 },
    { key: 'fail', label: 'Fail', color: 'red', count: 6 },
    { key: 'review', label: 'Needs Review', color: 'amber', count: 4 },
    { key: 'none', label: 'Unused', color: 'grey', count: 0 },
  ];

  it('shows the total, each part with its percentage, and hides zero parts', () => {
    render(<DonutChart title="Run Outcomes" parts={parts} emptyText="No completed runs yet." />);
    const figure = screen.getByRole('figure', { name: 'Run Outcomes' });

    expect(within(figure).getByTestId('donut-total').textContent).toBe('40');
    const legend = within(figure).getByRole('list', { name: 'Run Outcomes legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Pass30 (75%)', 'Fail6 (15%)', 'Needs Review4 (10%)']);
    expect(figure.querySelectorAll('svg path')).toHaveLength(3);
    expect(figure.querySelector('figcaption')!.textContent).toBe('Run Outcomes: 40 in total; Pass 30 (75%), Fail 6 (15%), Needs Review 4 (10%)');
  });

  it('shows its empty line at a total of 0', () => {
    render(<DonutChart title="Run Outcomes" parts={parts.map((p) => ({ ...p, count: 0 }))} emptyText="No completed runs yet." />);
    expect(screen.getByText('No completed runs yet.')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Run Outcomes' }).querySelector('svg')).toBeNull();
  });
});

describe('LineChart range control', () => {
  it('follows a controlled range and reports changes', () => {
    function Controlled() {
      const [range, setRange] = useState<Range>(15);
      return (
        <>
          <LineChart title="Executions" dates={DATES} kind="count" series={[{ key: 'e', label: 'Completed', color: 'blue', values: DATES.map(() => 1) }]} range={range} onRangeChange={setRange} />
          <output data-testid="range">{range}</output>
        </>
      );
    }
    renderChart(<Controlled />);
    const chart = screen.getByRole('figure', { name: 'Executions' });
    expect(within(chart).getByRole('radio', { name: '15d' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(chart).getByRole('radio', { name: '90d' }));
    expect(screen.getByTestId('range').textContent).toBe('90');
    expect(within(chart).getByRole('radio', { name: '90d' }).getAttribute('aria-checked')).toBe('true');
  });
});

/** Runs Over Time: 4 Mar is DATES' last day here only by index; values sit on the last day. */
const runSeries = () => [
  { key: 'Pass', label: 'Passed', color: 'green', values: DATES.map((_, i) => (i === 89 ? 3 : 0)) },
  { key: 'Fail', label: 'Failed', color: 'red', values: DATES.map((_, i) => (i === 89 ? 1 : i === 88 ? 2 : 0)) },
  { key: 'NeedsReview', label: 'Needs Review', color: 'amber', values: DATES.map((_, i) => (i === 89 ? 2 : 0)) },
];
const LAST = DATES[89];

describe('StackedBarChart', () => {
  it('stacks one day of counts, bottom to top in series order', () => {
    renderChart(<StackedBarChart title="Runs Over Time" dates={DATES} series={runSeries()} />);
    const day = screen.getByRole('figure', { name: 'Runs Over Time' }).querySelector(`[data-date="${LAST}"]`)!;
    const segments = [...day.querySelectorAll('rect')].map((r) => r.getAttribute('data-segment'));
    expect(segments).toEqual([`${LAST}:Pass`, `${LAST}:Fail`, `${LAST}:NeedsReview`]);
    const ys = [...day.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y')));
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
  });

  it('hides a series from its legend and summary', () => {
    renderChart(<StackedBarChart title="Runs Over Time" dates={DATES} series={runSeries()} />);
    const chart = screen.getByRole('figure', { name: 'Runs Over Time' });
    expect(chart.querySelector('figcaption')!.textContent).toBe('Runs Over Time over the last 30 days: Passed 3, Failed 3, Needs Review 2');
    fireEvent.click(within(chart).getByRole('button', { name: 'Passed' }));
    expect(within(chart).getByRole('button', { name: 'Passed' }).getAttribute('aria-pressed')).toBe('false');
    expect(chart.querySelector(`[data-segment="${LAST}:Pass"]`)).toBeNull();
    expect(chart.querySelector('figcaption')!.textContent).toBe('Runs Over Time over the last 30 days: Failed 3, Needs Review 2');
  });

  it('reads a day with the keyboard, showing each visible count', () => {
    renderChart(<StackedBarChart title="Runs Over Time" dates={DATES} series={runSeries()} />);
    const svg = within(screen.getByRole('figure', { name: 'Runs Over Time' })).getByLabelText(/use the arrow keys/);
    fireEvent.keyDown(svg, { key: 'End' });
    const readout = screen.getByRole('group', { name: `${shortDate(LAST)} counts` });
    expect(readout.textContent).toContain('Passed 3');
    expect(readout.textContent).toContain('Failed 1');
    expect(readout.textContent).toContain('Needs Review 2');
  });

  it('selects a segment through the readout, and by pointer', () => {
    const picks: string[] = [];
    function Selectable() {
      const [selected, setSelected] = useState<{ date: string; key: string } | null>(null);
      return (
        <StackedBarChart
          title="Runs Over Time"
          dates={DATES}
          series={runSeries()}
          selected={selected}
          onSelect={(s) => {
            picks.push(`${s.date}:${s.key}`);
            setSelected((cur) => (cur && cur.date === s.date && cur.key === s.key ? null : s));
          }}
        />
      );
    }
    renderChart(<Selectable />);
    const chart = screen.getByRole('figure', { name: 'Runs Over Time' });
    fireEvent.keyDown(within(chart).getByLabelText(/use the arrow keys/), { key: 'End' });
    fireEvent.click(within(chart).getByRole('button', { name: /Failed 1/ }));
    expect(picks).toEqual([`${LAST}:Fail`]);
    expect(within(chart).getByRole('button', { name: /Failed 1/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chart.querySelector(`[data-segment="${DATES[88]}:Fail"]`)!);
    expect(picks.at(-1)).toBe(`${DATES[88]}:Fail`);
  });

  it('shows its empty line with no counts in range', () => {
    renderChart(<StackedBarChart title="Runs Over Time" dates={DATES} series={[{ key: 'Pass', label: 'Passed', color: 'green', values: DATES.map(() => 0) }]} emptyText="No completed runs yet." />);
    expect(screen.getByText('No completed runs yet.')).toBeTruthy();
  });
});

describe('DonutChart selection and order', () => {
  const statusParts = [
    { key: 'Draft', label: 'Draft', color: 'grey', count: 1 },
    { key: 'InProgress', label: 'In Progress', color: 'blue', count: 2 },
    { key: 'Done', label: 'Done', color: 'grey', count: 4 },
  ];

  it('orders parts by count, largest first', () => {
    renderChart(<DonutChart title="Execution Status" parts={statusParts} emptyText="—" sortByCount />);
    const legend = screen.getByRole('list', { name: 'Execution Status legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Done4 (57%)', 'In Progress2 (29%)', 'Draft1 (14%)']);
  });

  it('selects a part from the legend, marks it, and clears it when selected again', () => {
    function Selectable() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <DonutChart
          title="Run Outcomes"
          parts={[
            { key: 'Pass', label: 'Pass', color: 'green', count: 3 },
            { key: 'Fail', label: 'Fail', color: 'red', count: 1 },
          ]}
          emptyText="—"
          selectedKey={selected}
          onSelect={(key) => setSelected((cur) => (cur === key ? null : key))}
        />
      );
    }
    renderChart(<Selectable />);
    const fail = () => screen.getByRole('button', { name: /^Fail/ });
    fireEvent.click(fail());
    expect(fail().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('figure', { name: 'Run Outcomes' }).querySelector('[data-part="Pass"]')!.getAttribute('opacity')).toBe('0.35');
    fireEvent.click(fail());
    expect(fail().getAttribute('aria-pressed')).toBe('false');
  });

  it('selects a part by clicking its arc', () => {
    const picked: string[] = [];
    renderChart(<DonutChart title="Run Outcomes" parts={statusParts} emptyText="—" onSelect={(k) => picked.push(k)} />);
    fireEvent.click(screen.getByRole('figure', { name: 'Run Outcomes' }).querySelector('[data-part="Done"]')!);
    expect(picked).toEqual(['Done']);
  });
});

describe('DonutChart description', () => {
  it('shows an info tooltip next to its title', () => {
    renderChart(
      <DonutChart
        title="Backlog Age"
        description="Open bugs by time since reported: under 7 days, 7–30 days, over 30 days."
        parts={[{ key: 'Fresh', label: 'Fresh', color: 'green', count: 2 }]}
        emptyText="No open bugs."
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Backlog Age' });
    expect(within(figure).getByRole('button', { name: /under 7 days/ })).toBeTruthy();
  });
});

describe('WordCloud', () => {
  const words = [
    { key: 't1', label: 'checkout', count: 4, color: 'var(--tag-red)' },
    { key: 't2', label: 'ui', count: 1, color: 'var(--tag-blue)' },
  ];

  it('draws each word in its colour, larger for larger counts, with a summary', () => {
    render(<WordCloud title="Bugs by Tag" words={words} emptyText="No tagged bugs yet." />);
    const figure = screen.getByRole('figure', { name: 'Bugs by Tag' });
    const checkout = figure.querySelector('[data-word="t1"]')!;
    const ui = figure.querySelector('[data-word="t2"]')!;
    expect(checkout.getAttribute('fill')).toBe('var(--tag-red)');
    expect(Number(checkout.getAttribute('font-size'))).toBeGreaterThan(Number(ui.getAttribute('font-size')));
    expect(figure.querySelector('figcaption')!.textContent).toBe('Bugs by Tag: checkout 4, ui 1');
  });

  it('reads a word on hover and on focus', () => {
    render(<WordCloud title="Bugs by Tag" words={words} emptyText="No tagged bugs yet." />);
    const figure = screen.getByRole('figure', { name: 'Bugs by Tag' });
    const readout = within(figure).getByTestId('word-cloud-readout');

    fireEvent.pointerEnter(figure.querySelector('[data-word="t1"]')!);
    expect(readout.textContent).toBe('checkout: 4');

    fireEvent.focus(figure.querySelector('[data-word="t2"]')!);
    expect(readout.textContent).toBe('ui: 1');
  });

  it('shows its empty line with no words', () => {
    render(<WordCloud title="Bugs by Tag" words={[]} emptyText="No tagged bugs yet." />);
    expect(screen.getByText('No tagged bugs yet.')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Bugs by Tag' }).querySelector('svg')).toBeNull();
  });
});

describe('date axis labels (chart-writer-fixes)', () => {
  const dateLabels = (figure: HTMLElement) => {
    const days = new Set(DATES.map(shortDate));
    return [...figure.querySelectorAll('svg text')].filter((t) => days.has(t.textContent ?? ''));
  };

  it('ends the last label of a line chart and of stacked bars at the right edge, centring the rest', () => {
    renderChart(
      <>
        <LineChart title="Bug Velocity" dates={DATES} kind="count" series={bugSeries()} />
        <StackedBarChart title="Runs Over Time" dates={DATES} series={bugSeries().map((s) => ({ ...s, values: s.values.map((v) => v ?? 0) }))} />
      </>,
    );
    for (const name of ['Bug Velocity', 'Runs Over Time']) {
      const labels = dateLabels(screen.getByRole('figure', { name }));
      expect(labels.length).toBeGreaterThan(2);
      expect(labels.at(-1)!.textContent).toBe(shortDate(DATES[89]));
      expect(labels.at(-1)!.getAttribute('text-anchor')).toBe('end');
      expect(labels.slice(0, -1).every((t) => t.getAttribute('text-anchor') === 'middle')).toBe(true);
    }
  });
});
