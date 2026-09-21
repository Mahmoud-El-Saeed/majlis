import type { Enrollment } from "./enrollments";
import type { Course } from "./courses";

export interface DashboardItem {
  course: Course;
  enrollment_status: string;
  enrollment: Enrollment | null;
  lesson_count: number;
  ready_count: number;
}

export interface Dashboard {
  items: DashboardItem[];
}

/** Statuses whose rows expose lesson content (cards). Everything else
 *  (pending/rejected/blocked) renders the waiting state instead. */
const VISIBLE_STATUSES = ["approved", "owner", "admin"];

export function isContentVisible(status: string): boolean {
  return VISIBLE_STATUSES.includes(status);
}

// Local dev: "" (vite proxies /api to localhost:8000).
// Cloudflare Pages prod: set VITE_API_BASE=https://api.yourdomain.com
const BASE = import.meta.env.VITE_API_BASE ?? "";

export const dashboardApi = {
  get: async (token: string): Promise<Dashboard> => {
    const r = await fetch(`${BASE}/api/v1/dashboard`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { detail?: string }).detail ?? "Unexpected error");
    return data as Dashboard;
  },
};
