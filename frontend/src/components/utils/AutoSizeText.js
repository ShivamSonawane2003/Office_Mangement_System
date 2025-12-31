import React, { useState, useEffect, useCallback } from 'react';

const DEFAULT_BREAKPOINT = 1440;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function calculateFontSize(min, max) {
  if (typeof window === 'undefined') {
    return max;
  }
  const width = window.innerWidth || DEFAULT_BREAKPOINT;
  const scale = width / DEFAULT_BREAKPOINT;
  return clamp(Math.round(max * scale), min, max);
}

function AutoSizeText({
  as: Component = 'span',
  min = 12,
  max = 22,
  className = '',
  style = {},
  children,
  ...rest
}) {
  const [fontSize, setFontSize] = useState(() => calculateFontSize(min, max));

  const handleResize = useCallback(() => {
    setFontSize(calculateFontSize(min, max));
  }, [min, max]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return (
    <Component
      className={`auto-size-text ${className}`.trim()}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: 1.4,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default AutoSizeText;

