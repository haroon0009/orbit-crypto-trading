import { useState } from "react";
import { CalendarIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  name: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  required?: boolean;
}

export function DatePicker({
  name,
  defaultValue = "",
  min,
  max,
  placeholder = "Pick a date",
  required,
}: DatePickerProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const minimum = parseDate(min);
  const maximum = parseDate(max);
  const disabled =
    minimum && maximum
      ? [{ before: minimum }, { after: maximum }]
      : minimum
        ? { before: minimum }
        : maximum
          ? { after: maximum }
          : undefined;

  return (
    <>
      <Popover open={open} onOpenChange={(next) => setOpen(next)}>
        <PopoverTrigger
          type="button"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 w-full justify-start px-3 text-left font-normal",
            !selected && "text-muted-foreground",
          )}
          aria-label={placeholder}
          aria-required={required}
        >
          <CalendarIcon />
          {selected ? selected.toLocaleDateString() : placeholder}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              setValue(formatDate(date));
              setOpen(false);
            }}
            disabled={disabled}
            defaultMonth={selected ?? minimum}
            startMonth={minimum}
            endMonth={maximum}
          />
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={value} />
    </>
  );
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
