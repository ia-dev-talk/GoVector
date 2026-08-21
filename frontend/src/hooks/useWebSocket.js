import { useCallback } from 'react';
import {
  useRealtimeDashboard,
  useWebSocket as useCoreWebSocket,
} from './useWebSocketCore';
import { shouldForwardInterventionRealtimeEvent } from '../lib/interventionRealtimeScope';


function invoke(handler, ...args) {
  if (typeof handler === 'function') {
    handler(...args);
  }
}


/**
 * Public realtime hook.
 *
 * The transport/reconnect implementation lives in useWebSocketCore. This
 * boundary only protects Interventions' dispatch callbacks from leaking live
 * events into a historical or simulated workspace scope.
 */
export function useWebSocket(
  room = null,
  options = {},
) {
  const {
    onJobEvent,
    onTechEvent,
    ...coreOptions
  } = options;

  const handleJobEvent = useCallback(
    (eventType, data) => {
      if (
        !shouldForwardInterventionRealtimeEvent(
          room,
        )
      ) {
        return;
      }

      invoke(
        onJobEvent,
        eventType,
        data,
      );
    },
    [onJobEvent, room],
  );

  const handleTechEvent = useCallback(
    (eventType, data) => {
      if (
        !shouldForwardInterventionRealtimeEvent(
          room,
        )
      ) {
        return;
      }

      invoke(
        onTechEvent,
        eventType,
        data,
      );
    },
    [onTechEvent, room],
  );

  return useCoreWebSocket(
    room,
    {
      ...coreOptions,
      onJobEvent: handleJobEvent,
      onTechEvent: handleTechEvent,
    },
  );
}


export { useRealtimeDashboard };
