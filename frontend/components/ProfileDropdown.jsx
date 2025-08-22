import React, { useState, useRef } from "react";
import { useAuth } from "./AuthContext";

export default function ProfileDropdown() {
  const { agent, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!agent) return null;

  return (
    <div className="relative ml-2" ref={ref}>
      <button
        className="flex items-center px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
      >
        <span className="bi bi-person-circle text-xl mr-1" />
        <span className="hidden sm:inline font-medium max-w-[100px] truncate">{agent.name || agent.email}</span>
        <span className="ml-1 bi bi-caret-down-fill text-xs" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
          <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 border-b dark:border-gray-700">
            <div className="font-semibold">{agent.name || agent.email}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{agent.role}</div>
          </div>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-gray-800"
            onClick={logout}
          >
            <span className="bi bi-box-arrow-right mr-2" />Sign out
          </button>
        </div>
      )}
    </div>
  );
}
