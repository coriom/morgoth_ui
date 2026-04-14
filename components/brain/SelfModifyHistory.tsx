"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SelfModification } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function SelfModifyHistory({
  items,
  isLoading,
}: {
  items: SelfModification[];
  isLoading: boolean;
}) {
  const [resultFilter, setResultFilter] = useState("ALL");
  const [filePath, setFilePath] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const resultMatch =
        resultFilter === "ALL" ||
        (resultFilter === "PASS" ? item.test_result.passed : !item.test_result.passed);
      const fileMatch = item.file_path.toLowerCase().includes(filePath.toLowerCase());
      return resultMatch && fileMatch;
    });
  }, [filePath, items, resultFilter]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-surface2" />;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="Filter by file path..." />
        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Test result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All results</SelectItem>
            <SelectItem value="PASS">PASS</SelectItem>
            <SelectItem value="FAIL">FAIL</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
          No self-modification history matches the current filters.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Test</TableHead>
              <TableHead>Approved By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item) => (
              <TableRow key={item.mod_id}>
                <TableCell className="font-mono">{formatTimestamp(item.timestamp)}</TableCell>
                <TableCell className="font-mono">{item.file_path}</TableCell>
                <TableCell>{item.reason}</TableCell>
                <TableCell>
                  <span className={cn("rounded-full px-2 py-1 font-mono text-xs", item.test_result.passed ? "bg-result/20 text-result" : "bg-error/20 text-error")}>
                    {item.test_result.passed ? "PASS" : "FAIL"}
                  </span>
                </TableCell>
                <TableCell>{item.approved_by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {filteredItems.map((item) => (
        <details key={`${item.mod_id}-diff`} className="rounded-lg border border-border bg-surface2/20 p-4">
          <summary className="cursor-pointer font-mono text-xs text-textSecondary">{item.file_path} diff</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-textPrimary">
            {item.diff.split("\n").map((line, index) => (
              <div
                key={`${item.mod_id}-${index}`}
                className={cn(
                  line.startsWith("+") && "text-result",
                  line.startsWith("-") && "text-error",
                )}
              >
                {line}
              </div>
            ))}
          </pre>
        </details>
      ))}
    </div>
  );
}
