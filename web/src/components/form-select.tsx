import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  label: string;
  value: string;
}

interface FormSelectProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function FormSelect({
  name,
  value,
  defaultValue = "",
  onValueChange,
  options,
  placeholder = "Select an option",
  disabled,
  required,
  ariaLabel,
  className,
}: FormSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;

  function change(next: string | null) {
    const resolved = next ?? "";
    if (value === undefined) setInternalValue(resolved);
    onValueChange?.(resolved);
  }

  return (
    <div className="relative">
      <Select
        name={name}
        required={required}
        value={selected || null}
        onValueChange={change}
        disabled={disabled}
      >
        <SelectTrigger
          className={`h-10 w-full ${className ?? ""}`}
          aria-label={ariaLabel}
          aria-required={required}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
