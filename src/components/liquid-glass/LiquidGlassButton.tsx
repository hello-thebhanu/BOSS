import React, { forwardRef } from 'react';

export type LiquidGlassButtonVariant = 'glass' | 'primary' | 'secondary' | 'ghost';
export type LiquidGlassButtonSize = 'sm' | 'md' | 'lg';

export interface LiquidGlassButtonProps {
  as?: 'button' | 'a';
  href?: string;
  variant?: LiquidGlassButtonVariant;
  size?: LiquidGlassButtonSize;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  tabIndex?: number;
  id?: string;
  role?: string;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export const LiquidGlassButton = forwardRef<HTMLElement, LiquidGlassButtonProps>(
  (
    {
      as,
      href,
      variant = 'glass',
      size = 'md',
      active = false,
      disabled = false,
      icon,
      children,
      className = '',
      style,
      type = 'button',
      title,
      tabIndex,
      id,
      role,
      'aria-label': ariaLabel,
      'aria-pressed': ariaPressed,
      'aria-current': ariaCurrent,
      onClick,
      onFocus,
      onBlur,
      onKeyDown,
      ...rest
    },
    ref
  ) => {
    const isAnchor = as === 'a' || Boolean(href);

    const baseClasses = [
      'liquid-glass-item',
      `liquid-glass-item--${variant}`,
      `liquid-glass-item--${size}`,
      active ? 'is-active' : '',
      disabled ? 'is-disabled' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const commonProps = {
      id,
      title,
      style,
      tabIndex: disabled ? -1 : tabIndex,
      'data-dock-item': true,
      'data-dock-near': 'false',
      'data-active': active ? 'true' : 'false',
      'aria-label': ariaLabel,
      onFocus,
      onBlur,
      onKeyDown,
      className: baseClasses,
      ...rest,
    };

    const innerContent = (
      <>
        {icon && <span className="liquid-glass-icon" aria-hidden="true">{icon}</span>}
        {children && <span className="liquid-glass-label">{children}</span>}
        <span className="liquid-glass-sheen" aria-hidden="true" />
      </>
    );

    if (isAnchor) {
      return (
        <a
          {...commonProps}
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={disabled ? undefined : href}
          role={role}
          aria-current={ariaCurrent ?? (active ? 'page' : undefined)}
          aria-disabled={disabled ? 'true' : undefined}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              return;
            }
            onClick?.(e);
          }}
        >
          {innerContent}
        </a>
      );
    }

    return (
      <button
        {...commonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        role={role}
        disabled={disabled}
        aria-pressed={ariaPressed ?? (active ? true : undefined)}
        onClick={onClick}
      >
        {innerContent}
      </button>
    );
  }
);

LiquidGlassButton.displayName = 'LiquidGlassButton';
