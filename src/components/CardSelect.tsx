"use client";

export type CardSelectionProps = {
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
};

// Checkbox in a card's corner. Shown on hover, on touch screens, and on every
// card once anything is selected.
export function CardCheckbox({
  selected,
  selecting,
  onToggle,
  label,
}: CardSelectionProps & { label: string }) {
  return (
    <label
      className={`absolute top-2 left-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-md border bg-white/90 shadow-sm transition ${
        selected || selecting
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
      } ${selected ? "border-indigo-400" : "border-zinc-300"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="size-4 cursor-pointer accent-indigo-600"
        aria-label={`Select ${label}`}
      />
    </label>
  );
}

// While selecting, clicking a card toggles it instead of opening it.
export function selectOnClick({ selecting, onToggle }: CardSelectionProps) {
  return (e: React.MouseEvent) => {
    if (!selecting || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    onToggle();
  };
}

export function cardRing(selected: boolean) {
  return selected
    ? "border-indigo-400 ring-2 ring-indigo-300"
    : "border-zinc-200";
}
