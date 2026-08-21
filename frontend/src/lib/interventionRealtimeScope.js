let activeScopeRegistration = null;


export function registerInterventionRealtimeScope(
  isLive,
) {
  const token = Symbol(
    'intervention-realtime-scope',
  );

  activeScopeRegistration = {
    token,
    isLive: isLive === true,
  };

  return () => {
    if (
      activeScopeRegistration?.token ===
      token
    ) {
      activeScopeRegistration = null;
    }
  };
}


export function shouldForwardInterventionRealtimeEvent(
  room,
) {
  const normalizedRoom = String(
    room ?? '',
  ).trim();

  if (normalizedRoom !== 'dispatch') {
    return true;
  }

  return (
    activeScopeRegistration?.isLive !==
    false
  );
}
