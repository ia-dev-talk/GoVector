import {
  createContext,
  useContext,
} from 'react';
import { getInterventionPermissions } from './interventionPermissions';

export const InterventionPermissionsContext =
  createContext(null);

export function useInterventionPermissions() {
  return (
    useContext(InterventionPermissionsContext) ??
    getInterventionPermissions(null)
  );
}
