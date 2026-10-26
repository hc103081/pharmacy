'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn, variants } from '@/app/query/design-system';

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
  disabled?: boolean;
  icon?: React.ReactNode;
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
  const reduceMotion = useReducedMotion() ?? false;
  
  const contextValue = React.useMemo(() => ({
    activeIndex,
    setActiveIndex: (index: number) => {
      setActiveIndex(index);
      onChange?.(index);
    },
    reduceMotion,
  }), [activeIndex, onChange, reduceMotion]);
  
  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  );
}

const TabsContext = React.createContext<{
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  reduceMotion: boolean;
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
  const { activeIndex, setActiveIndex, reduceMotion } = useTabsContext();
  
  return (
    <div 
      role="tablist" 
      className={cn(
        variants.segmentedControl.container,
        className
      )}
      aria-label="主要分頁"
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { 
          index,
          isActive: index === activeIndex,
          onSelect: () => setActiveIndex(index),
        });
      })}
    </div>
  );
}

function Tab({ 
  children, 
  className, 
  index, 
  isActive = false, 
  onSelect,
  disabled = false,
  icon 
}: TabProps & { index?: number; isActive?: boolean; onSelect?: () => void }) {
  const { reduceMotion } = useTabsContext();
  
  if (index === undefined) return null;
  
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        isActive ? variants.segmentedControl.itemSelected : variants.segmentedControl.item,
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

function TabPanels({ children, className }: TabPanelsProps) {
  const { activeIndex, reduceMotion } = useTabsContext();
  
  return (
    <div className={cn('relative', className)}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { 
          isActive: index === activeIndex,
          reduceMotion,
        });
      })}
    </div>
  );
}

function TabPanel({ 
  children, 
  className, 
  isActive = false,
  reduceMotion = false 
}: TabPanelProps & { isActive?: boolean; reduceMotion?: boolean }) {
  if (!isActive) return null;
  
  const contentRef = React.useRef<HTMLDivElement>(null);
  
  if (reduceMotion) {
    return (
      <div 
        ref={contentRef}
        role="tabpanel" 
        tabIndex={0} 
        className={cn('overflow-y-auto', className)}
      >
        {children}
      </div>
    );
  }
  
  return (
    <motion.div
      ref={contentRef}
      role="tabpanel"
      tabIndex={0}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ 
        duration: 0.2, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={cn('overflow-y-auto', className)}
    >
      {children}
    </motion.div>
  );
}

export default Tabs;