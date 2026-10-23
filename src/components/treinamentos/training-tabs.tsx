import { Link } from "@tanstack/react-router";
import { BookOpenCheck, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Abas do módulo único "Treinamentos": registro da Matriz + validades/reciclagem. */
export function TrainingTabs({ current }: { current: "registro" | "validades" }) {
  const tabs = [
    {
      key: "registro",
      to: "/treinamentos" as const,
      label: "Registro de treinamentos",
      icon: BookOpenCheck,
    },
    {
      key: "validades",
      to: "/validades" as const,
      label: "Validades e reciclagem",
      icon: CalendarClock,
    },
  ];
  return (
    <nav
      aria-label="Seções de Treinamentos"
      className="flex gap-1 border-b border-border px-4 md:px-6"
    >
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            to={t.to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              on
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
