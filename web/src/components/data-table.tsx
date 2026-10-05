import { isValidElement, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { visibleRowIndexes } from "@/table-data";

interface DataTableProps {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
  searchPlaceholder?: string;
  filterColumn?: number;
  filterLabel?: string;
}

export function DataTable({
  headers,
  rows,
  empty,
  searchPlaceholder = "Search rows…",
  filterColumn,
  filterLabel,
}: DataTableProps) {
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sort, setSort] = useState<{
    column: number;
    direction: "asc" | "desc";
  } | null>(null);
  const searchableRows = useMemo(
    () => rows.map((row) => row.map(cellText)),
    [rows],
  );
  const filterOptions = useMemo(() => {
    if (filterColumn === undefined) return [];
    return [...new Set(searchableRows.map((row) => row[filterColumn] ?? ""))]
      .filter(Boolean)
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      );
  }, [filterColumn, searchableRows]);
  const visible = visibleRowIndexes(searchableRows, {
    query,
    ...(filterColumn === undefined ? {} : { filterColumn }),
    ...(filterValue === "all" ? {} : { filterValue }),
    ...(sort ? { sortColumn: sort.column, sortDirection: sort.direction } : {}),
  });

  function toggleSort(column: number) {
    setSort((current) =>
      current?.column === column
        ? {
            column,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { column, direction: "asc" },
    );
  }

  return (
    <div>
      <div className="border-border flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {filterColumn !== undefined && filterOptions.length > 1 ? (
          <Select
            value={filterValue}
            onValueChange={(value) => setFilterValue(value ?? "all")}
          >
            <SelectTrigger
              className="w-full sm:w-48"
              aria-label={filterLabel ?? "Filter rows"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">
                All {filterLabel ?? headers[filterColumn]}
              </SelectItem>
              {filterOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {visible.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, column) => (
                <TableHead key={`${header}-${column}`} className="px-3">
                  {header ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 text-[10px] tracking-wider uppercase"
                      onClick={() => toggleSort(column)}
                    >
                      {header}
                      {sort?.column === column ? (
                        sort.direction === "asc" ? (
                          <ArrowUp />
                        ) : (
                          <ArrowDown />
                        )
                      ) : (
                        <ChevronsUpDown />
                      )}
                    </Button>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((rowIndex) => (
              <TableRow key={rowIndex}>
                {rows[rowIndex]!.map((value, column) => (
                  <TableCell
                    key={`${rowIndex}-${column}`}
                    className="px-3 py-3 text-xs"
                  >
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-muted-foreground p-8 text-sm">
          {rows.length ? "No rows match your search or filter." : empty}
        </div>
      )}
      {rows.length ? (
        <div className="text-muted-foreground border-border border-t px-4 py-3 text-xs">
          Showing {visible.length} of {rows.length} rows
        </div>
      ) : null}
    </div>
  );
}

function cellText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(cellText).join(" ");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return cellText(value.props.children);
  }
  return "";
}
