"use client";

import {
  DECORATION_OPTIONS,
  DECORATION_COLOR_OPTIONS,
  LEATHER_BASE_OPTIONS,
  FACE_RIGHT_OPTIONS,
  FACE_LEFT_OPTIONS,
  MIXING_OPTIONS,
  FACE_OPTIONS,
  MODEL_OPTIONS,
  SOLE_OPTIONS,
  SOLE_COLOR_OPTIONS,
  ADDITIONS_OPTIONS,
  SIZE_OPTIONS,
} from "@/features/orders/paper/paper-options";

export function FormDatalists() {
  return (
    <div className="sr-only" aria-hidden="true">
      <datalist id="dl-decoration">
        {DECORATION_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-decoration-color">
        {DECORATION_COLOR_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-leather-base">
        {LEATHER_BASE_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-face-right">
        {FACE_RIGHT_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-face-left">
        {FACE_LEFT_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-mixing">
        {MIXING_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-face">
        {FACE_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-model">
        {MODEL_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-sole">
        {SOLE_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-sole-color">
        {SOLE_COLOR_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-additions">
        {ADDITIONS_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="dl-size">
        {SIZE_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </div>
  );
}
