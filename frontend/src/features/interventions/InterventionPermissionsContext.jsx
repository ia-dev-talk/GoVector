import {
  useEffect,
  useMemo,
} from 'react';
import { apiClient } from '../../api/client';
import {
  getInterventionPermissions,
  isInterventionDeleteRequest,
} from './interventionPermissions';
import { InterventionPermissionsContext } from './interventionPermissionsContext';

export function InterventionPermissionsProvider({
  userRole,
  children,
}) {
  const permissions = useMemo(
    () => getInterventionPermissions(userRole),
    [userRole],
  );

  useEffect(() => {
    const interceptorId = apiClient.interceptors.request.use(
      (config) => {
        if (
          !permissions.canDeleteIntervention &&
          isInterventionDeleteRequest(config)
        ) {
          const error = new Error(
            'Action non autorisée pour ce rôle.',
          );
          error.code = 'BLUEVECTOR_INTERVENTION_DELETE_FORBIDDEN';
          return Promise.reject(error);
        }

        return config;
      },
    );

    return () => {
      apiClient.interceptors.request.eject(interceptorId);
    };
  }, [permissions]);

  return (
    <InterventionPermissionsContext.Provider value={permissions}>
      {children}
    </InterventionPermissionsContext.Provider>
  );
}
