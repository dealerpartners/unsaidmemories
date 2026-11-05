"use client";

import { Clock, CheckCircle, AlertCircle } from "lucide-react";

/**
 * §0.4 Overview — the TO-DO list with deadlines.
 * QB evidence: §B, §J1 — Home's to-do list and Tax overview's deadlines card.
 *
 * Usage:
 *   <TaskList tasks={[
 *     { id: "1", label: "Approve invoice #1042", due: "2026-11-03", priority: "high" },
 *   ]} onComplete={(id) => console.log(id)} />
 */

export type Task = {
  id: string;
  label: string;
  due?: string;
  priority?: "high" | "medium" | "low";
  href?: string;
  completed?: boolean;
};

export function TaskList({ tasks, onComplete }: { tasks: Task[]; onComplete?: (id: string) => void }) {
  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.due || !b.due) return 0;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>
          To-do ({tasks.filter((t) => !t.completed).length})
        </h3>
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {sorted.map((task) => {
          const overdue = task.due && !task.completed && new Date(task.due) < new Date();
          const Icon = task.completed ? CheckCircle : overdue ? AlertCircle : Clock;
          const iconColor = task.completed ? "var(--primary, #007c7d)" : overdue ? "#c0392b" : task.priority === "high" ? "#e67e22" : "var(--muted-foreground, #9b97a8)";

          return (
            <div
              key={task.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                borderBottom: "1px solid var(--border, #f5f5f5)", cursor: task.href ? "pointer" : "default",
                opacity: task.completed ? 0.5 : 1,
              }}
              onClick={() => task.href && (window.location.href = task.href)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onComplete?.(task.id); }}
                style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: iconColor }}
                aria-label={task.completed ? "Completed" : "Mark complete"}
              >
                <Icon size={16} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--foreground, #171717)", fontWeight: task.priority === "high" ? 600 : 400, textDecoration: task.completed ? "line-through" : "none" }}>
                  {task.label}
                </div>
                {task.due && (
                  <div style={{ fontSize: 10, color: overdue ? "#c0392b" : "var(--muted-foreground, #9b97a8)", marginTop: 2 }}>
                    {overdue ? "Overdue · " : "Due "}
                    {new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 12 }}>
            No tasks. You&rsquo;re all caught up.
          </div>
        )}
      </div>
    </div>
  );
}
