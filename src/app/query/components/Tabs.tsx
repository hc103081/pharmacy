'use client';

import * as React from 'react';

interface TabsProps {
  children: React.ReactNode;
  className?: string;
}

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabProps {
  children: React.ReactNode;
  className?: string;
}

interface TabPanelsProps {
  children: React.ReactNode;
  className?: string;
}

interface TabPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ children, className }: TabsProps) {
  return <div className={className}>{children}</div>;
}

Tabs.TabList = TabList;
Tabs.Tab = Tab;
Tabs.TabPanels = TabPanels;
Tabs.TabPanel = TabPanel;

function TabList({ children, className }: TabListProps) {
  return (
    <div role="tablist" className={className}>
      {children}
    </div>
  );
}

function Tab({ children, className }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={false}
      tabIndex={-1}
      className={`
        flex-1 px-4 py-3 text-sm font-medium text-slate-400
        hover:text-slate-200 hover:bg-slate-800/50
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]
        ${className}
      `}
    >
      {children}
    </button>
  );
}

function TabPanels({ children, className }: TabPanelsProps) {
  return <div className={className}>{children}</div>;
}

function TabPanel({ children, className }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden tabIndex={0} className={className}>
      {children}
    </div>
  );
}