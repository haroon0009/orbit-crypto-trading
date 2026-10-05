export interface TableViewOptions {
  query?: string;
  filterColumn?: number;
  filterValue?: string;
  sortColumn?: number;
  sortDirection?: "asc" | "desc";
}

export function visibleRowIndexes(
  rows: string[][],
  options: TableViewOptions = {},
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const indexes = rows
    .map((_, index) => index)
    .filter((index) => {
      const row = rows[index]!;
      const matchesQuery =
        !query || row.some((cell) => cell.toLocaleLowerCase().includes(query));
      const matchesFilter =
        options.filterColumn === undefined ||
        !options.filterValue ||
        row[options.filterColumn] === options.filterValue;
      return matchesQuery && matchesFilter;
    });
  if (options.sortColumn === undefined) return indexes;
  const direction = options.sortDirection === "desc" ? -1 : 1;
  return indexes.sort((left, right) => {
    const first = rows[left]?.[options.sortColumn!] ?? "";
    const second = rows[right]?.[options.sortColumn!] ?? "";
    const firstNumber = Number(first.replace(/[$,%+]/g, ""));
    const secondNumber = Number(second.replace(/[$,%+]/g, ""));
    const result =
      first !== "" &&
      second !== "" &&
      Number.isFinite(firstNumber) &&
      Number.isFinite(secondNumber)
        ? firstNumber - secondNumber
        : first.localeCompare(second, undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return result * direction || left - right;
  });
}
