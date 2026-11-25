import type { Prisma } from '@prisma/client';

/**
 * Where report files live (ADR 0027). The API only reads; the worker writes through its own
 * adapter. Until E3 the bytes sit in `report_file`; an object-storage adapter would read
 * through a signed link instead, and nothing outside the adapters touches the table.
 */
export interface ReportStore {
  read(tx: Prisma.TransactionClient, reportId: string): Promise<Buffer | null>;
}

export const postgresReportStore: ReportStore = {
  async read(tx, reportId) {
    const rows = await tx.$queryRaw<{ content: Buffer }[]>`SELECT content FROM report_file WHERE report_id = ${reportId}::uuid`;
    return rows[0] ? Buffer.from(rows[0].content) : null;
  },
};
