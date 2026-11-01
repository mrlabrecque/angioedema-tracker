"use client";

import { useState } from "react";
import { inputCls } from "@/components/ui";
import type { CatalogItem } from "@/lib/types";

const CUSTOM = "__custom__";

/**
 * Trigger/exposure category: pick from the saved list or add your own.
 * `value` is always the effective category name ("" until chosen). A custom
 * name is saved to the list automatically when the exposure is saved.
 */
export default function CategoryPicker({
  catalog,
  value,
  onChange,
  placeholder,
}: {
  catalog: CatalogItem[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [custom, setCustom] = useState(false);
  // A value that isn't in the saved list (e.g. when editing an existing custom entry) shows as custom.
  const showCustom = custom || (value !== "" && !catalog.some((c) => c.name === value));
  return (
    <div className="space-y-3">
      <select
        value={showCustom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={inputCls}
        aria-label="Exposure category"
      >
        <option value="">{placeholder}</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value={CUSTOM}>+ Add custom trigger…</option>
      </select>
      {showCustom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Name your trigger (e.g. Grass cutting)"
          maxLength={80}
          autoFocus
          className={inputCls}
          aria-label="Custom trigger name"
        />
      )}
    </div>
  );
}
