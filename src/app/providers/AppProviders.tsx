import type { PropsWithChildren, ReactElement } from 'react';
import { AuthProvider } from './AuthProvider';

export function AppProviders({ children }: PropsWithChildren): ReactElement {
  return <AuthProvider>{children}</AuthProvider>;
}
