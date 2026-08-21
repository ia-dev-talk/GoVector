import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const MAX_RECONNECT_DELAY_MS = 30000;
const DEFAULT_RECONNECT_DELAY_MS = 5000;
const MIN_RECONNECT_DELAY_MS = 250;

const SESSION_EXPIRED_EVENT =
  'bluevector:session-expired';

const REALTIME_WS_PATH =
  '/api/v1/ws';

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

function normalizeRoom(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeReconnectInterval(value) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_RECONNECT_DELAY_MS
  ) {
    return DEFAULT_RECONNECT_DELAY_MS;
  }

  return parsed;
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

function buildWebSocketUrl(token, room) {
  const defaultProtocol =
    window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';

  const fallbackBase =
    `${defaultProtocol}//${window.location.host}`;

  const configuredBase = normalizeText(
    import.meta.env.VITE_WS_URL,
  );

  let url;

  try {
    url = new URL(
      configuredBase || fallbackBase,
      window.location.origin,
    );
  } catch {
    url = new URL(fallbackBase);
  }

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  if (
    url.protocol !== 'ws:' &&
    url.protocol !== 'wss:'
  ) {
    url = new URL(fallbackBase);
  }

  let basePath = url.pathname
    .replace(/\/+$/, '');

  if (
    basePath.endsWith(REALTIME_WS_PATH)
  ) {
    // L’URL configurée contient déjà l’endpoint complet.
  } else if (
    basePath.endsWith('/api/v1')
  ) {
    basePath = `${basePath}/ws`;
  } else {
    basePath =
      `${basePath}${REALTIME_WS_PATH}`;
  }

  url.pathname = basePath || REALTIME_WS_PATH;
  url.search = '';
  url.hash = '';

  url.searchParams.set('token', token);

  if (room) {
    url.searchParams.set('room', room);
  }

  return url.toString();
}

async function readMessageData(rawData) {
  if (typeof rawData === 'string') {
    return rawData;
  }

  if (
    typeof Blob !== 'undefined' &&
    rawData instanceof Blob
  ) {
    return rawData.text();
  }

  if (
    typeof ArrayBuffer !== 'undefined' &&
    rawData instanceof ArrayBuffer
  ) {
    return new TextDecoder().decode(rawData);
  }

  return '';
}

async function parseWebSocketMessage(rawData) {
  const text = await readMessageData(rawData);

  if (!text) {
    return null;
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const eventType = normalizeText(
    parsed.event,
  );

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    data: parsed.data,
  };
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
      // Le navigateur a peut-être déjà fermé la connexion.
    }
  }
}

function invokeHandler(
  handler,
  handlerName,
  ...args
) {
  if (typeof handler !== 'function') {
    return;
  }

  try {
    handler(...args);
  } catch (error) {
    console.error(
      `Erreur dans le gestionnaire WebSocket « ${handlerName} » :`,
      error,
    );
  }
}

/**
 * Connexion aux événements temps réel BlueVector.
 *
 * @param {string|null} room
 * @param {Object} options
 * @param {function} options.onEvent
 * @param {function} options.onDashboardUpdate
 * @param {function} options.onJobEvent
 * @param {function} options.onTechEvent
 * @param {function} options.onNotification
 * @param {boolean} options.autoReconnect
 * @param {number} options.reconnectInterval
 */
export function useWebSocket(
  room = null,
  options = {},
) {
  const {
    onEvent,
    onDashboardUpdate,
    onJobEvent,
    onTechEvent,
    onNotification,
    autoReconnect = true,
    reconnectInterval =
      DEFAULT_RECONNECT_DELAY_MS,
  } = options;

  const [connected, setConnected] =
    useState(false);

  const [lastEvent, setLastEvent] =
    useState(null);

  const socketRef = useRef(null);
  const connectRef = useRef(null);

  const reconnectTimerRef =
    useRef(null);

  const reconnectAttemptRef =
    useRef(0);

  const generationRef = useRef(0);
  const mountedRef = useRef(false);

  const roomRef = useRef(
    normalizeRoom(room),
  );

  const lastRoomPropRef = useRef(
    normalizeRoom(room),
  );

  const activeTokenRef = useRef('');

  const manualDisconnectRef =
    useRef(false);

  const authBlockedRef =
    useRef(false);

  const handlersRef = useRef({
    onEvent,
    onDashboardUpdate,
    onJobEvent,
    onTechEvent,
    onNotification,
  });

  const configRef = useRef({
    autoReconnect:
      autoReconnect !== false,
    reconnectInterval:
      normalizeReconnectInterval(
        reconnectInterval,
      ),
  });

  useEffect(() => {
    handlersRef.current = {
      onEvent,
      onDashboardUpdate,
      onJobEvent,
      onTechEvent,
      onNotification,
    };
  }, [
    onDashboardUpdate,
    onEvent,
    onJobEvent,
    onNotification,
    onTechEvent,
  ]);

  const clearReconnectTimer =
    useCallback(() => {
      if (
        reconnectTimerRef.current ===
        null
      ) {
        return;
      }

      window.clearTimeout(
        reconnectTimerRef.current,
      );

      reconnectTimerRef.current =
        null;
    }, []);

  const markDisconnected =
    useCallback(() => {
      if (mountedRef.current) {
        setConnected(false);
      }
    }, []);

  const detachCurrentSocket =
    useCallback(() => {
      const currentSocket =
        socketRef.current;

      socketRef.current = null;

      closeSocket(currentSocket);
    }, []);

  const scheduleReconnect =
    useCallback(() => {
      const config =
        configRef.current;

      if (
        !mountedRef.current ||
        !config.autoReconnect ||
        manualDisconnectRef.current ||
        authBlockedRef.current ||
        navigator.onLine === false ||
        reconnectTimerRef.current !==
          null ||
        socketRef.current?.readyState ===
          WebSocket.CONNECTING ||
        socketRef.current?.readyState ===
          WebSocket.OPEN
      ) {
        return;
      }

      const delay = Math.min(
        config.reconnectInterval *
          2 **
            reconnectAttemptRef.current,
        MAX_RECONNECT_DELAY_MS,
      );

      reconnectAttemptRef.current =
        Math.min(
          reconnectAttemptRef.current + 1,
          30,
        );

      reconnectTimerRef.current =
        window.setTimeout(() => {
          reconnectTimerRef.current =
            null;

          connectRef.current?.();
        }, delay);
    }, []);

  const dispatchMessage =
    useCallback(
      async (
        socket,
        generation,
        messageEvent,
      ) => {
        const message =
          await parseWebSocketMessage(
            messageEvent.data,
          );

        if (
          !message ||
          !mountedRef.current ||
          socketRef.current !== socket ||
          generationRef.current !==
            generation
        ) {
          return;
        }

        const {
          eventType,
          data,
        } = message;

        setLastEvent({
          event: eventType,
          data,
          timestamp: Date.now(),
        });

        const handlers =
          handlersRef.current;

        invokeHandler(
          handlers.onEvent,
          'onEvent',
          eventType,
          data,
        );

        if (
          eventType.startsWith(
            'dashboard:',
          )
        ) {
          invokeHandler(
            handlers.onDashboardUpdate,
            'onDashboardUpdate',
            data,
          );
        }

        if (
          eventType.startsWith('job:')
        ) {
          invokeHandler(
            handlers.onJobEvent,
            'onJobEvent',
            eventType,
            data,
          );
        }

        if (
          eventType.startsWith('tech:')
        ) {
          invokeHandler(
            handlers.onTechEvent,
            'onTechEvent',
            eventType,
            data,
          );
        }

        if (
          eventType ===
          'notification:new'
        ) {
          invokeHandler(
            handlers.onNotification,
            'onNotification',
            data,
          );
        }
      },
      [],
    );

  const connect = useCallback(() => {
    if (
      !mountedRef.current ||
      manualDisconnectRef.current ||
      navigator.onLine === false
    ) {
      return false;
    }

    const existingSocket =
      socketRef.current;

    if (
      existingSocket?.readyState ===
        WebSocket.CONNECTING ||
      existingSocket?.readyState ===
        WebSocket.OPEN
    ) {
      return false;
    }

    clearReconnectTimer();
    detachCurrentSocket();

    const token = readToken();

    if (!token) {
      activeTokenRef.current = '';
      authBlockedRef.current = true;

      markDisconnected();

      return false;
    }

    activeTokenRef.current = token;
    authBlockedRef.current = false;

    const generation =
      generationRef.current;

    const currentRoom =
      roomRef.current;

    let socket;

    try {
      const url = buildWebSocketUrl(
        token,
        currentRoom,
      );

      socket = new WebSocket(url);
    } catch (error) {
      console.error(
        'Impossible d’ouvrir la connexion WebSocket :',
        error,
      );

      scheduleReconnect();

      return false;
    }

    socketRef.current = socket;

    socket.onopen = () => {
      if (
        !mountedRef.current ||
        socketRef.current !== socket ||
        generationRef.current !==
          generation ||
        activeTokenRef.current !== token
      ) {
        closeSocket(socket);
        return;
      }

      reconnectAttemptRef.current = 0;
      authBlockedRef.current = false;

      clearReconnectTimer();
      setConnected(true);
    };

    socket.onmessage = (
      messageEvent,
    ) => {
      if (
        !mountedRef.current ||
        socketRef.current !== socket ||
        generationRef.current !==
          generation ||
        activeTokenRef.current !== token
      ) {
        return;
      }

      dispatchMessage(
        socket,
        generation,
        messageEvent,
      );
    };

    socket.onerror = (error) => {
      if (
        !mountedRef.current ||
        socketRef.current !== socket
      ) {
        return;
      }

      console.error(
        'Erreur WebSocket :',
        error,
      );

      try {
        socket.close();
      } catch {
        if (
          socketRef.current === socket
        ) {
          socketRef.current = null;
          markDisconnected();
          scheduleReconnect();
        }
      }
    };

    socket.onclose = (
      closeEvent,
    ) => {
      if (
        socketRef.current === socket
      ) {
        socketRef.current = null;
      }

      if (
        !mountedRef.current ||
        generationRef.current !==
          generation ||
        activeTokenRef.current !== token
      ) {
        return;
      }

      markDisconnected();

      if (closeEvent.code === 1008) {
        authBlockedRef.current = true;
        clearReconnectTimer();

        return;
      }

      scheduleReconnect();
    };

    return true;
  }, [
    clearReconnectTimer,
    detachCurrentSocket,
    dispatchMessage,
    markDisconnected,
    scheduleReconnect,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const stopConnection =
    useCallback(
      ({
        manual = false,
        blockAuthentication = false,
      } = {}) => {
        generationRef.current += 1;

        manualDisconnectRef.current =
          manual;

        authBlockedRef.current =
          blockAuthentication;

        clearReconnectTimer();
        detachCurrentSocket();
        markDisconnected();
      },
      [
        clearReconnectTimer,
        detachCurrentSocket,
        markDisconnected,
      ],
    );

  const restartConnection =
    useCallback(() => {
      generationRef.current += 1;

      manualDisconnectRef.current =
        false;

      authBlockedRef.current = false;

      reconnectAttemptRef.current = 0;

      clearReconnectTimer();
      detachCurrentSocket();
      markDisconnected();

      connectRef.current?.();
    }, [
      clearReconnectTimer,
      detachCurrentSocket,
      markDisconnected,
    ]);

  const disconnect = useCallback(() => {
    stopConnection({
      manual: true,
    });
  }, [stopConnection]);

  const reconnect = useCallback(() => {
    restartConnection();
  }, [restartConnection]);

  const send = useCallback(
    (action, payload = {}) => {
      const normalizedAction =
        normalizeText(action);

      const socket =
        socketRef.current;

      if (
        !normalizedAction ||
        socket?.readyState !==
          WebSocket.OPEN
      ) {
        return false;
      }

      const safePayload =
        isRecord(payload)
          ? payload
          : {};

      try {
        socket.send(
          JSON.stringify({
            action: normalizedAction,
            ...safePayload,
          }),
        );

        return true;
      } catch (error) {
        console.error(
          'Impossible d’envoyer le message WebSocket :',
          error,
        );

        try {
          socket.close();
        } catch {
          // La reconnexion sera gérée lors du prochain contrôle.
        }

        return false;
      }
    },
    [],
  );

  const subscribe = useCallback(
    (newRoom) => {
      const normalizedRoom =
        normalizeRoom(newRoom);

      roomRef.current =
        normalizedRoom;

      if (
        manualDisconnectRef.current
      ) {
        return true;
      }

      if (
        normalizedRoom &&
        socketRef.current?.readyState ===
          WebSocket.OPEN
      ) {
        const sent = send(
          'subscribe',
          {
            room: normalizedRoom,
          },
        );

        if (sent) {
          return true;
        }
      }

      restartConnection();

      return true;
    },
    [restartConnection, send],
  );

  useEffect(() => {
    const previousAutoReconnect =
      configRef.current.autoReconnect;

    configRef.current = {
      autoReconnect:
        autoReconnect !== false,
      reconnectInterval:
        normalizeReconnectInterval(
          reconnectInterval,
        ),
    };

    if (
      previousAutoReconnect &&
      autoReconnect === false
    ) {
      clearReconnectTimer();
      return;
    }

    if (
      !previousAutoReconnect &&
      autoReconnect !== false &&
      mountedRef.current &&
      !manualDisconnectRef.current &&
      !authBlockedRef.current &&
      socketRef.current === null
    ) {
      connectRef.current?.();
    }
  }, [
    autoReconnect,
    clearReconnectTimer,
    reconnectInterval,
  ]);

  useEffect(() => {
    const nextRoom =
      normalizeRoom(room);

    if (
      nextRoom ===
      lastRoomPropRef.current
    ) {
      return;
    }

    lastRoomPropRef.current =
      nextRoom;

    roomRef.current = nextRoom;

    if (
      mountedRef.current &&
      !manualDisconnectRef.current
    ) {
      const frameId = window.requestAnimationFrame(() => restartConnection());
      return () => window.cancelAnimationFrame(frameId);
    }
    return undefined;
  }, [restartConnection, room]);

  useEffect(() => {
    mountedRef.current = true;

    manualDisconnectRef.current =
      false;

    authBlockedRef.current = false;

    activeTokenRef.current =
      readToken();

    const reconnectIfNeeded = () => {
      if (
        !mountedRef.current ||
        manualDisconnectRef.current ||
        navigator.onLine === false
      ) {
        return;
      }

      const currentToken =
        readToken();

      if (!currentToken) {
        activeTokenRef.current = '';

        stopConnection({
          blockAuthentication: true,
        });

        return;
      }

      if (
        currentToken !==
        activeTokenRef.current
      ) {
        activeTokenRef.current =
          currentToken;

        restartConnection();

        return;
      }

      if (
        authBlockedRef.current ||
        reconnectTimerRef.current !==
          null ||
        socketRef.current?.readyState ===
          WebSocket.CONNECTING ||
        socketRef.current?.readyState ===
          WebSocket.OPEN
      ) {
        return;
      }

      connectRef.current?.();
    };

    const handleStorage = (event) => {
      if (
        event.key !== 'token' &&
        event.key !== null
      ) {
        return;
      }

      const currentToken =
        readToken();

      if (!currentToken) {
        activeTokenRef.current = '';

        stopConnection({
          blockAuthentication: true,
        });

        return;
      }

      activeTokenRef.current =
        currentToken;

      restartConnection();
    };

    const handleSessionExpired = () => {
      activeTokenRef.current = '';

      stopConnection({
        blockAuthentication: true,
      });
    };

    const handleOffline = () => {
      generationRef.current += 1;

      clearReconnectTimer();
      detachCurrentSocket();
      markDisconnected();
    };

    const handleOnline = () => {
      reconnectIfNeeded();
    };

    const handleFocus = () => {
      reconnectIfNeeded();
    };

    const handleVisibilityChange =
      () => {
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
      'offline',
      handleOffline,
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

    connectRef.current?.();

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;

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
        'offline',
        handleOffline,
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
  }, [
    clearReconnectTimer,
    detachCurrentSocket,
    markDisconnected,
    restartConnection,
    stopConnection,
  ]);

  return {
    connected,
    lastEvent,
    send,
    subscribe,
    disconnect,
    reconnect,
  };
}

/**
 * Hook spécialisé pour les mises à jour du cockpit.
 */
export function useRealtimeDashboard({
  onUpdate,
} = {}) {
  const [
    dashboardData,
    setDashboardData,
  ] = useState(null);

  const handleDashboardUpdate =
    useCallback(
      (data) => {
        setDashboardData(data);

        if (
          typeof onUpdate === 'function'
        ) {
          onUpdate(data);
        }
      },
      [onUpdate],
    );

  const handleTechStatusChanged =
    useCallback(
      (data) => {
        if (
          typeof onUpdate !== 'function' ||
          !data
        ) {
          return;
        }

        onUpdate({
          _tech_status_changed: true,
          tech_status: data,
        });
      },
      [onUpdate],
    );

  const handleTechEvent =
    useCallback(
      (eventType, data) => {
        if (
          eventType ===
          'tech:status_changed'
        ) {
          handleTechStatusChanged(data);
        }
      },
      [handleTechStatusChanged],
    );

  const websocket = useWebSocket(
    'dashboard',
    {
      onDashboardUpdate:
        handleDashboardUpdate,
      onTechEvent: handleTechEvent,
    },
  );

  return {
    ...websocket,
    dashboardData,
    isLive: websocket.connected,
  };
}
