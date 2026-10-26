/**
 * PhamaCount Query System - Shared UI Components
 * 統一導出所有共用 UI 元件
 */

// Design System
export * from '@/app/query/design-system';

// Core Components
export { Button, type ButtonProps } from './Button';
export { Input, Textarea, type InputProps, type TextareaProps } from './Input';
export { Badge, StatusBadge, DiscrepancyBadge, type BadgeProps, type StatusBadgeProps, type DiscrepancyBadgeProps } from './Badge';
export { Card, CardHeader, CardContent, CardFooter, type CardProps, type CardHeaderProps, type CardContentProps, type CardFooterProps } from './Card';
export { Table, TableContainer, type TableProps, type Column, type TableContainerProps } from './Table';
export { Panel, PanelHeader, PanelContent, PanelFooter, Section, type PanelProps, type PanelHeaderProps, type PanelContentProps, type PanelFooterProps, type SectionProps } from './Panel';
export { Skeleton, SkeletonCard, SkeletonTable, SkeletonList, type SkeletonProps } from './Skeleton';
export { EmptyState, EmptyStateCard, LoadingState, ErrorState, type EmptyStateProps, type EmptyStateCardProps } from './EmptyState';

// Motion Components
export { 
  FadeIn, 
  StaggerContainer, 
  StaggerItem, 
  SlideIn, 
  ScaleIn, 
  RevealOnScroll,
  ListReveal,
  ListItemReveal,
  type FadeInProps,
  type StaggerContainerProps,
  type StaggerItemProps,
  type SlideInProps,
  type ScaleInProps,
  type RevealOnScrollProps,
  type ListRevealProps,
  type ListItemRevealProps,
} from './MotionWrapper';

// Re-export commonly used types
export type { HTMLMotionProps } from 'framer-motion';