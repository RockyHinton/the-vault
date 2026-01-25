import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FormattedNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
}

export function FormattedNumberInput({ value, onChange, className, ...props }: FormattedNumberInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Update display value when prop value changes externally, 
  // but only if we're not currently editing (to avoid cursor jumping or reformatting while typing)
  // Actually, standard practice for formatted inputs is to keep them in sync but careful with cursor.
  // For simplicity: update display value on blur or if value changes significantly from outside.
  
  useEffect(() => {
    // Initial load or external update
    if (value === 0 && displayValue === '') {
      setDisplayValue(''); // Keep empty for placeholder visibility if 0 is treated as empty
    } else {
      setDisplayValue(value.toLocaleString('en-US'));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty string to clear input
    if (inputValue === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    // Remove commas to get raw number
    const rawValue = inputValue.replace(/,/g, '');
    
    // Check if valid number
    if (!/^\d*\.?\d*$/.test(rawValue)) {
      return; // Ignore invalid chars
    }

    const numberValue = parseFloat(rawValue);
    
    // Update parent with raw number
    onChange(isNaN(numberValue) ? 0 : numberValue);
    
    // Update local display with formatted string (comma separated)
    // We only format the integer part as they type to allow decimals if needed, 
    // but here we mostly deal with integers.
    // If we format on every keystroke, "1000" -> "1,000". 
    if (rawValue.endsWith('.')) {
       setDisplayValue(Number(rawValue.slice(0, -1)).toLocaleString('en-US') + '.');
    } else {
       setDisplayValue(Number(rawValue).toLocaleString('en-US'));
    }
  };

  const handleBlur = () => {
    if (value !== 0) {
      setDisplayValue(value.toLocaleString('en-US'));
    } else {
      setDisplayValue(''); // Clean up on blur if 0
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={cn("font-mono", className)}
      {...props}
    />
  );
}
