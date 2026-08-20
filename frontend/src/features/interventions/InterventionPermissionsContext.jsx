import {
  createContext,
  useContext,
  useMemo,
} from 'react';
import { getInterventionPermissions } from './interventionPermissions';

const InterventionPermissionsContext =
  createContext(null);

export function InterventionPermissionsProvider({
  userRole,
  children,
}) {
  const permissions = useMemo(
    () => getInterventionPermissions(userRole),
    [userRole],
  );

  return (
    <InterventionPermissionsContext.Provider value={permissions}>
      {children}
    </InterventionPermissionsContext.Provider>
  );
}

// This module intentionally exports the provider and its paired consumer hook.
// The hook does not alter Fast Refresh component boundaries.
// eslint-disable-next-line react-refresh/only-export-components
export function useInterventionPermissions() {
  return (
    useContext(InterventionPermissionsContext) ??
    getInterventionPermissions(null)
  );
}
