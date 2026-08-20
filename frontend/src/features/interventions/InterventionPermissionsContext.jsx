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

export function useInterventionPermissions() {
  return (
    useContext(InterventionPermissionsContext) ??
    getInterventionPermissions(null)
  );
}
