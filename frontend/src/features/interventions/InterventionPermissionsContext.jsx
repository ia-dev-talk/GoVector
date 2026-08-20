import { useMemo } from 'react';
import { getInterventionPermissions } from './interventionPermissions';
import { InterventionPermissionsContext } from './interventionPermissionsContext';

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
