'use client';

import * as React from 'react';

interface TabsProps {
  children: React.ReactNode;
  className?: string;
  defaultIndex?: number;
  onChange?: (index: number) => void;
}

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  isActive?: boolean;
}

interface TabPanelsProps {
  children: React.ReactNode;
  className?: string;
}

interface TabPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ children, className, defaultIndex = 0, onChange }: TabsProps) {
  const [activeIndex, setActiveIndex] = React.useState(defaultIndex);
  
  const contextValue = React.useMemo(() => ({
    activeIndex,
    setActiveIndex: (index: number) => {
      setActiveIndex(index);
      onChange?.(index);
    }
  }), [activeIndex, onChange]);
  
  return (
    <TabsContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

const TabsContext = React.createContext<{
  activeIndex: number;
  setActiveIndex: (index: number) => void;
} | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs compounds must be used within Tabs');
  }
  return context;
}

Tabs.TabList = TabList;
Tabs.Tab = Tab;
Tabs.TabPanels = TabPanels;
Tabs.TabPanel = TabPanel;

function TabList({ children, className }: TabListProps) {
  return (
    <div role="tablist" className={`${className} flex overflow-x-auto scrollbar-hide -mx-4 px-4`}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { 
          index,
          isActive: false
        });
      })}
    </div>
  );
}

function Tab({ children, className, index, isActive: _isActive }: TabProps & { index?: number; isActive?: boolean }) {
  const { activeIndex, setActiveIndex } = useTabsContext();
  const isActive = index === activeIndex;
  
  return (
    <button
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => index !== undefined && setActiveIndex(index)}
      className={`
        flex-1 px-4 py-3 text-sm font-medium transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]
        ${isActive 
          ? 'text-[#00f2fe] border-b-2 border-[#00f2fe] bg-slate-800/50' 
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

function TabPanels({ children, className }: TabPanelsProps) {
  const { activeIndex } = useTabsContext();
  
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { 
          isActive: index === activeIndex 
        });
      })}
    </div>
  );
}

function TabPanel({ children, className, isActive = false }: TabPanelProps & { isActive?: boolean }) {
  if (!isActive) return null;
  
  return (
    <div role="tabpanel" tabIndex={0} className={`${className} overflow-y-auto`}>
      {children}
    </div>
  );
}