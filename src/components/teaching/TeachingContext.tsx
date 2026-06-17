'use client';

import React, { createContext, useContext, useState } from 'react';
import { getTeachingTotalSteps } from './teaching-content-loader';

export type TeachingModuleType = 
  | 'system-overview'
  | 'barcode-scan'
  | 'import-function'
  | 'photo-capture'
  | 'anomaly-handling'
  | 'report-export'
  | null;

interface TeachingState {
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  teachingModule: TeachingModuleType;
}

interface TeachingContextType {
  state: TeachingState;
  openTeaching: (module: TeachingModuleType) => void;
  closeTeaching: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setTeachingModule: (module: TeachingModuleType) => void;
}

const TeachingContext = createContext<TeachingContextType | null>(null);

export const TeachingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TeachingState>({
    isOpen: false,
    currentStep: 0,
    totalSteps: 0,
    teachingModule: null,
  });

  const openTeaching = (module: TeachingModuleType) => {
    // 載入對應教學內容以獲取總步驟數
    const totalSteps = getTeachingTotalSteps(module);
    setState({ ...state, isOpen: true, currentStep: 0, totalSteps, teachingModule: module });
  };

  const closeTeaching = () => {
    setState({ ...state, isOpen: false, currentStep: 0, totalSteps: 0, teachingModule: null });
  };

  const nextStep = () => {
    if (state.currentStep < state.totalSteps - 1) {
      setState({ ...state, currentStep: state.currentStep + 1 });
    }
  };

  const prevStep = () => {
    if (state.currentStep > 0) {
      setState({ ...state, currentStep: state.currentStep - 1 });
    }
  };

  const setTeachingModule = (module: TeachingModuleType) => {
    const totalSteps = getTeachingTotalSteps(module);
    setState({ ...state, currentStep: 0, totalSteps, teachingModule: module });
  };

  return (
    <TeachingContext.Provider value={{
      state,
      openTeaching,
      closeTeaching,
      nextStep,
      prevStep,
      setTeachingModule,
    }}>
      {children}
    </TeachingContext.Provider>
  );
};

export const useTeaching = () => {
  const context = useContext(TeachingContext);
  if (!context) {
    throw new Error('useTeaching must be used within a TeachingProvider');
  }
  return context;
};