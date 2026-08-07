import type { ReactElement, ReactNode } from 'react';

export type MicroLabelProps = {
  children: ReactNode;
  /** `span` par défaut ; `div` quand le micro-libellé coiffe un bloc. */
  as?: 'span' | 'div';
  className?: string;
};

/** Plex Mono 10px, interlettrage .12em, majuscules, --ink-soft. */
export function MicroLabel({ children, as: Tag = 'span', className }: MicroLabelProps): ReactElement {
  return <Tag className={className ? `ds-microlabel ${className}` : 'ds-microlabel'}>{children}</Tag>;
}
