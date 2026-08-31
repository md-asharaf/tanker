import React from 'react';

interface OverlayModalProps {
  title: string;
  titleType?: 'gold' | 'correct' | 'wrong' | 'miss';
  subtitle?: string | React.ReactNode;
  animationClass?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function OverlayModal({
  title,
  titleType = 'gold',
  subtitle,
  animationClass = 'anim-fade-in',
  children,
  footer,
}: OverlayModalProps) {
  return (
    <div className="overlay overlay--dim">
      <div className={`overlay-card ${animationClass}`}>
        <div className={`overlay-title overlay-title--${titleType}`}>{title}</div>
        {subtitle && <div className="overlay-subtitle">{subtitle}</div>}
        {children}
        {footer && <div className="btn-row">{footer}</div>}
      </div>
    </div>
  );
}
