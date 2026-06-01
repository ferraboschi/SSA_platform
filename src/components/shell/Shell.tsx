"use client";

import { useState, type ReactNode } from "react";
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
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="app">
      <Sidebar
        nav={nav}
        counts={counts}
        courses={sidebarCourses}
        users={users}
        open={drawer}
        onNavigate={() => setDrawer(false)}
      />
      {drawer && (
        <button
          className="sidebar-backdrop"
          aria-label="Chiudi menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <main style={{ minWidth: 0 }}>
        <Topbar
          nav={nav}
          searchIndex={searchIndex}
          notifications={notifications}
          onMenu={() => setDrawer(true)}
        />
        {children}
      </main>
    </div>
  );
}
