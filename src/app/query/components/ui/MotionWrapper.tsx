'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/app/query/design-system';
import { useReducedMotion } from 'framer-motion';

// Helper type to extract only standard HTML div props
type HTMLDivProps = React.ComponentPropsWithoutRef<'div'>;

// Motion-specific prop keys to exclude from fallback
const MOTION_PROP_KEYS = new Set([
  'initial', 'animate', 'exit', 'variants', 'transition', 'whileHover', 'whileTap', 'whileFocus', 'whileInView',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate', 'onDrag', 'onDragStart', 'onDragEnd', 'onDragTransitionEnd',
  'onPan', 'onPanStart', 'onPanEnd', 'onPanSessionStart', 'onHoverStart', 'onHoverEnd',
  'layout', 'layoutId', 'layoutDependency', 'transformTemplate', 'style', 'x', 'y', 'z', 'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'scale', 'scaleX', 'scaleY', 'originX', 'originY', 'perspective', 'transformPerspective',
]);

function filterMotionProps(props: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {};
  for (const key in props) {
    // Exclude motion-specific props AND style (which needs casting)
    if (!MOTION_PROP_KEYS.has(key) && key !== 'style') {
      filtered[key] = props[key];
    }
  }
  return filtered;
}

export interface FadeInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
}

export function FadeIn({ 
  children, 
  delay = 0, 
  duration = 0.4, 
  y = 20,
  className,
  style,
  ...props 
}: FadeInProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration, 
        delay, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerContainerProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  staggerDelay?: number;
  delayChildren?: number;
}

export function StaggerContainer({ 
  children, 
  staggerDelay = 0.06, 
  delayChildren = 0,
  className,
  style,
  ...props 
}: StaggerContainerProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerItemProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className, style, ...props }: StaggerItemProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { 
          opacity: 1, 
          y: 0,
          transition: { 
            duration: 0.4, 
            ease: [0.16, 1, 0.3, 1] 
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface SlideInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  duration?: number;
}

export function SlideIn({ 
  children, 
  direction = 'right', 
  delay = 0, 
  duration = 0.3,
  className,
  style,
  ...props 
}: SlideInProps) {
  const reduceMotion = useReducedMotion();
  
  const getInitial = () => {
    switch (direction) {
      case 'left': return { x: -100, opacity: 0 };
      case 'right': return { x: 100, opacity: 0 };
      case 'up': return { y: 100, opacity: 0 };
      case 'down': return { y: -100, opacity: 0 };
    }
  };

  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      initial={getInitial()}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ 
        duration, 
        delay, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface ScaleInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}

export function ScaleIn({ 
  children, 
  delay = 0, 
  duration = 0.2,
  className,
  style,
  ...props 
}: ScaleInProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ 
        duration, 
        delay, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface RevealOnScrollProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  once?: boolean;
  amount?: number;
  rootMargin?: string;
}

export function RevealOnScroll({ 
  children, 
  once = true, 
  amount = 0.3,
  rootMargin = '0px',
  className,
  style,
  ...props 
}: RevealOnScrollProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <div className={className} style={safeStyle} {...safeProps}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: rootMargin }}
      transition={{ 
        duration: 0.6, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface ListRevealProps extends HTMLMotionProps<'ul'> {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}

export function ListReveal({ 
  children, 
  staggerDelay = 0.06,
  className,
  style,
  ...props 
}: ListRevealProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <ul className={cn('grid gap-4', className)} style={safeStyle} {...safeProps}>{children}</ul>;
  }

  return (
    <motion.ul
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={cn('grid gap-4', className)}
      {...props}
    >
      {children}
    </motion.ul>
  );
}

export interface ListItemRevealProps extends HTMLMotionProps<'li'> {
  children: React.ReactNode;
  className?: string;
}

export function ListItemReveal({ children, className, style, ...props }: ListItemRevealProps) {
  const reduceMotion = useReducedMotion();
  
  if (reduceMotion) {
    const safeProps = filterMotionProps(props);
    const safeStyle = style as React.CSSProperties | undefined;
    return <li className={className} style={safeStyle} {...safeProps}>{children}</li>;
  }

  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { 
          opacity: 1, 
          y: 0,
          transition: { 
            duration: 0.4, 
            ease: [0.16, 1, 0.3, 1] 
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.li>
  );
}

export default FadeIn;