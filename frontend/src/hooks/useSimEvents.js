import {
  useEffect,
  useRef,
} from 'react';

import { api } from '../api/client';

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const SESSION_EXPIRED_EVENT =
  'bluevector:session-expired';
const SIMULATION_WS_PATH =
  '/api/v1/simulation/ws';

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function readToken() {
  try {
    return normalizeText(
      window.localStorage.getItem('token'),
    );
  } catch {
    return '';
  }
}

function getResponseStatus(error) {
  const parsed = Number(
    error?.response?.status,
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function buildSimulationWebSocketUrl(token) {
  const protocol =
    window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';

  const fallbackBase =
    `${protocol}//${window.location.host}`;

  const configuredBase = normalizeText(
    import.meta.env.VITE_WS_URL,
  );

  let baseUrl;

  try {
    baseUrl = new URL(
      configuredBase || fallbackBase,
      window.location.origin,
    );
  } catch {
    baseUrl = new URL(fallbackBase);
  }

  if (baseUrl.protocol === 'http:') {
    baseUrl.protocol = 'ws:';
  } else if (
    baseUrl.protocol === 'https:'
  ) {
    baseUrl.protocol = 'wss:';
  }

  if (
    baseUrl.protocol !== 'ws:' &&
    baseUrl.protocol !== 'wss:'
  ) {
    baseUrl = new URL(fallbackBase);
  }

  const basePath =
    baseUrl.pathname === '/'
      ? ''
      : baseUrl.pathname.replace(/\/+$/, '');

  baseUrl.pathname =
    `${basePath}${SIMULATION_WS_PATH}`;

  baseUrl.search = '';
  baseUrl.hash = '';
  baseUrl.searchParams.set('token', token);

  return baseUrl.toString();
}

function parseDispatchEvents(rawData) {
  if (typeof rawData !== 'string') {
    return [];
  }

  let parsed;

  try {
    parsed = JSON.parse(rawData);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (event) =>
      isRecord(event) &&
      normalizeText(event.event_type),
  );
}

function closeSocket(socket) {
  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;

  if (
    socket.readyState ===
      WebSocket.CONNECTING ||
    socket.readyState ===
      WebSocket.OPEN
  ) {
    try {
      socket.close(1000);
    } catch {
      // Le navigateur peut déjà avoir fermé le socket.
    }
  }
}

/**
 * Écoute les DispatchEvent de la simulation.
 *
 * Le callback reçoit un événement sérialisé par le backend :
 * { event_type, timestamp, job_id, tech_id, details, ... }.
 *
 * La connexion est automatiquement rétablie avec un délai
 * exponentiel, sauf si le mode démo est indisponible ou si
 * l'authentification est refusée.
 */
export function useSimEvents(onEvent) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let socket = null;
    let reconnectTimerId = null;
    let reconnectAttempt = 0;
    let connectionGeneration = 0;
    let statusRequestGeneration = 0;
    let statusRequestPending = false;
    let stopped = false;
    let authBlocked = false;
    let demoUnavailable = false;
    let activeToken = '';

    const clearReconnectTimer = () => {
      if (reconnectTimerId === null) {
        return;
      }

      window.clearTimeout(
        reconnectTimerId,
      );

      reconnectTimerId = null;
    };

    const detachCurrentSocket = () => {
      const currentSocket = socket;

      socket = null;

      closeSocket(currentSocket);
    };

    const canConnect = () =>
      !stopped &&
      !authBlocked &&
      !demoUnavailable &&
      Boolean(activeToken) &&
      navigator.onLine !== false;

    const scheduleReconnect = () => {
      if (
        !canConnect() ||
        reconnectTimerId !== null ||
        statusRequestPending ||
        socket?.readyState ===
          WebSocket.CONNECTING ||
        socket?.readyState ===
          WebSocket.OPEN
      ) {
        return;
      }

      const exponentialDelay = Math.min(
        INITIAL_RECONNECT_DELAY_MS *
          2 ** reconnectAttempt,
        MAX_RECONNECT_DELAY_MS,
      );

      reconnectAttempt = Math.min(
        reconnectAttempt + 1,
        30,
      );

      reconnectTimerId =
        window.setTimeout(() => {
          reconnectTimerId = null;
          connect();
        }, exponentialDelay);
    };

    const verifySimulationAvailability =
      async (generation) => {
        if (
          stopped ||
          generation !==
            connectionGeneration ||
          statusRequestPending
        ) {
          return 'stale';
        }

        statusRequestPending = true;

        const requestGeneration =
          statusRequestGeneration + 1;

        statusRequestGeneration =
          requestGeneration;

        try {
          const response =
            await api.simStatus();

          if (
            stopped ||
            generation !==
              connectionGeneration ||
            requestGeneration !==
              statusRequestGeneration
          ) {
            return 'stale';
          }

          if (!isRecord(response?.data)) {
            return 'retry';
          }

          if (
            response.data.is_demo === true
          ) {
            return 'available';
          }

          if (
            response.data.is_demo === false
          ) {
            demoUnavailable = true;
            clearReconnectTimer();

            return 'unavailable';
          }

          return 'retry';
        } catch (error) {
          if (
            stopped ||
            generation !==
              connectionGeneration ||
            requestGeneration !==
              statusRequestGeneration
          ) {
            return 'stale';
          }

          const responseStatus =
            getResponseStatus(error);

          if (responseStatus === 404) {
            demoUnavailable = true;
            clearReconnectTimer();

            return 'unavailable';
          }

          if (
            responseStatus === 401 ||
            responseStatus === 403
          ) {
            authBlocked = true;
            clearReconnectTimer();

            return 'auth-blocked';
          }

          return 'retry';
        } finally {
          if (
            requestGeneration ===
            statusRequestGeneration
          ) {
            statusRequestPending = false;
          }
        }
      };

    const dispatchMessage = (messageEvent) => {
      const events = parseDispatchEvents(
        messageEvent.data,
      );

      const callback =
        onEventRef.current;

      if (
        events.length === 0 ||
        typeof callback !== 'function'
      ) {
        return;
      }

      events.forEach((event) => {
        try {
          callback(event);
        } catch (error) {
          console.error(
            'Erreur du gestionnaire d’événement de simulation :',
            error,
          );
        }
      });
    };

    const attachSocketHandlers = (
      nextSocket,
      generation,
      token,
    ) => {
      nextSocket.onopen = () => {
        if (
          stopped ||
          socket !== nextSocket ||
          generation !==
            connectionGeneration ||
          token !== activeToken
        ) {
          closeSocket(nextSocket);
          return;
        }

        reconnectAttempt = 0;
        authBlocked = false;
        clearReconnectTimer();
      };

      nextSocket.onmessage = (
        messageEvent,
      ) => {
        if (
          stopped ||
          socket !== nextSocket ||
          generation !==
            connectionGeneration ||
          token !== activeToken
        ) {
          return;
        }

        dispatchMessage(messageEvent);
      };

      nextSocket.onerror = () => {
        if (
          socket !== nextSocket ||
          stopped
        ) {
          return;
        }

        try {
          nextSocket.close();
        } catch {
          if (socket === nextSocket) {
            socket = null;
            scheduleReconnect();
          }
        }
      };

      nextSocket.onclose = (
        closeEvent,
      ) => {
        if (socket === nextSocket) {
          socket = null;
        }

        if (
          stopped ||
          generation !==
            connectionGeneration ||
          token !== activeToken
        ) {
          return;
        }

        if (closeEvent.code === 1008) {
          authBlocked = true;
          clearReconnectTimer();
          return;
        }

        scheduleReconnect();
      };
    };

    async function connect() {
      if (
        !canConnect() ||
        statusRequestPending ||
        socket?.readyState ===
          WebSocket.CONNECTING ||
        socket?.readyState ===
          WebSocket.OPEN
      ) {
        return;
      }

      clearReconnectTimer();

      const generation =
        connectionGeneration;

      const token = activeToken;

      const availability =
        await verifySimulationAvailability(
          generation,
        );

      if (
        stopped ||
        generation !==
          connectionGeneration ||
        token !== activeToken
      ) {
        return;
      }

      if (availability !== 'available') {
        if (availability === 'retry') {
          scheduleReconnect();
        }

        return;
      }

      if (!canConnect()) {
        return;
      }

      let nextSocket;

      try {
        const url =
          buildSimulationWebSocketUrl(
            token,
          );

        nextSocket = new WebSocket(url);
      } catch (error) {
        console.error(
          'Impossible d’ouvrir le WebSocket de simulation :',
          error,
        );

        scheduleReconnect();
        return;
      }

      if (
        stopped ||
        generation !==
          connectionGeneration ||
        token !== activeToken
      ) {
        closeSocket(nextSocket);
        return;
      }

      detachCurrentSocket();

      socket = nextSocket;

      attachSocketHandlers(
        nextSocket,
        generation,
        token,
      );
    }

    const synchronizeToken = ({
      forceReconnect = false,
    } = {}) => {
      const nextToken = readToken();

      const tokenChanged =
        nextToken !== activeToken;

      if (
        !tokenChanged &&
        !forceReconnect
      ) {
        return;
      }

      connectionGeneration += 1;
      statusRequestGeneration += 1;
      statusRequestPending = false;

      clearReconnectTimer();
      detachCurrentSocket();

      activeToken = nextToken;
      reconnectAttempt = 0;

      if (!activeToken) {
        authBlocked = true;
        return;
      }

      authBlocked = false;
      demoUnavailable = false;

      connect();
    };

    const reconnectIfNeeded = () => {
      const currentToken = readToken();

      if (currentToken !== activeToken) {
        synchronizeToken();
        return;
      }

      if (
        !activeToken ||
        authBlocked ||
        demoUnavailable ||
        navigator.onLine === false ||
        statusRequestPending ||
        reconnectTimerId !== null ||
        socket?.readyState ===
          WebSocket.CONNECTING ||
        socket?.readyState ===
          WebSocket.OPEN
      ) {
        return;
      }

      connect();
    };

    const handleStorage = (event) => {
      if (
        event.key !== 'token' &&
        event.key !== null
      ) {
        return;
      }

      synchronizeToken();
    };

    const handleSessionExpired = () => {
      synchronizeToken({
        forceReconnect: true,
      });
    };

    const handleOnline = () => {
      reconnectIfNeeded();
    };

    const handleFocus = () => {
      reconnectIfNeeded();
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        reconnectIfNeeded();
      }
    };

    window.addEventListener(
      'storage',
      handleStorage,
    );

    window.addEventListener(
      SESSION_EXPIRED_EVENT,
      handleSessionExpired,
    );

    window.addEventListener(
      'online',
      handleOnline,
    );

    window.addEventListener(
      'focus',
      handleFocus,
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    synchronizeToken({
      forceReconnect: true,
    });

    return () => {
      stopped = true;
      connectionGeneration += 1;
      statusRequestGeneration += 1;
      statusRequestPending = false;

      clearReconnectTimer();
      detachCurrentSocket();

      window.removeEventListener(
        'storage',
        handleStorage,
      );

      window.removeEventListener(
        SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );

      window.removeEventListener(
        'online',
        handleOnline,
      );

      window.removeEventListener(
        'focus',
        handleFocus,
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, []);
}