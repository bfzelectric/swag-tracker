'use client';
import { Button } from '@/components/ui/button';
import {
  Archive,
  Check,
  Moon,
  Package,
  Search,
  Shirt,
  Sun,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { Employee } from './types';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom accessible combobox popup. */
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-logo" aria-hidden="true">
        SWG
      </span>
      <strong>BFZ SWAG TRACKER</strong>
    </div>
  );
}
export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('bfz-swag-theme', next);
    } catch {
      /* applies for this visit */
    }
  }
  return (
    <Button
      variant="outline"
      size="icon"
      className="theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={toggleTheme}
    >
      <span className="show-in-dark">
        <Sun />
      </span>
      <span className="show-in-light">
        <Moon />
      </span>
    </Button>
  );
}
export function CategoryIcon({ category }: { category: string }) {
  return category === 'Lifestyle' ? (
    <Package />
  ) : category === 'Hats' ? (
    <Archive />
  ) : (
    <Shirt />
  );
}
export function EmployeeCombobox({
  id,
  employees,
  value,
  onChange,
}: {
  id: string;
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
}) {
  const selectedName =
    employees.find((employee) => employee.id === value)?.employee_name ?? '';
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = employees.filter(
    (employee) =>
      !normalizedQuery ||
      employee.employee_name.toLowerCase().includes(normalizedQuery),
  );
  const selectEmployee = (employee: Employee) => {
    setQuery(employee.employee_name);
    onChange(employee.id);
    setOpen(false);
  };

  return (
    <div
      className="employee-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Search className="employee-search-icon" aria-hidden="true" />
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && filteredEmployees[activeIndex]
            ? `${id}-option-${filteredEmployees[activeIndex].id}`
            : undefined
        }
        autoComplete="off"
        placeholder={
          employees.length ? 'Search employees…' : 'Loading employees…'
        }
        value={query}
        onFocus={(event) => {
          event.currentTarget.select();
          setOpen(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(0);
          if (value && next !== selectedName) onChange('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              Math.max(0, Math.min(current + 1, filteredEmployees.length - 1)),
            );
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          } else if (
            event.key === 'Enter' &&
            open &&
            filteredEmployees[activeIndex]
          ) {
            event.preventDefault();
            selectEmployee(filteredEmployees[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {query && (
        <button
          type="button"
          className="employee-clear"
          aria-label="Clear employee"
          onClick={() => {
            onChange('');
            setQuery('');
            setActiveIndex(0);
            setOpen(true);
          }}
        >
          <X />
        </button>
      )}
      {open && (
        <div
          id={`${id}-options`}
          className="employee-options"
          role="listbox"
          aria-label="Employee suggestions"
        >
          {filteredEmployees.length ? (
            filteredEmployees.map((employee, index) => (
              <button
                type="button"
                id={`${id}-option-${employee.id}`}
                role="option"
                aria-selected={employee.id === value}
                className={index === activeIndex ? 'active' : ''}
                key={employee.id}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectEmployee(employee)}
              >
                <span>{employee.employee_name}</span>
                {employee.id === value && <Check aria-hidden="true" />}
              </button>
            ))
          ) : (
            <p className="employee-no-results">No employees match “{query}”</p>
          )}
        </div>
      )}
    </div>
  );
}
