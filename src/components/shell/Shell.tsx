"use client";

import type { ReactNode } from "react";
import type { NavGroup } from "@/lib/auth";
import type { Notification, User } from "@/lib/domain";
import type { SearchIndex, SidebarCourse } from "@/lib/shell";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface ShellProps {
  nav: NavGroup[];
  counts: Record<string, number>;
  users: User[];
  sidebarCourses: SidebarCourse[];
  searchIndex: SearchIndex;
  notifications: Notification[];
  children: ReactNode;
}

export function Shell({
  nav,
  counts,
  users,
  sidebarCourses,
  searchIndex,
  notifications,
  children,
}: ShellProps) {
  return (
    <div className="app">
      <Sidebar nav={nav} counts={counts} courses={sidebarCourses} users={users} />
      <main style={{ minWidth: 0 }}>
        <Topbar nav={nav} searchIndex={searchIndex} notifications={notifications} />
        {children}
      </main>
    </div>
  );
}
