/**
 * Zones FTTH de Casablanca et environs.
 *
 * Contrats publics :
 * - ZONES est une liste itérable compatible avec ZONES.map(...).
 * - L'accès historique ZONES.CASA_CENTRE reste disponible.
 * - ZONES_BY_KEY fournit un index explicite par clé technique.
 * - getNearestZone(latitude, longitude) renvoie le libellé métier.
 */

const EARTH_RADIUS_KM = 6371.0088;

const ZONE_DEFINITIONS = [
  {
    key: 'CASA_CENTRE',
    label: 'Casablanca Centre',
    latitude: 33.589886,
    longitude: -7.603869,
  },
  {
    key: 'MAARIF',
    label: 'Maarif',
    latitude: 33.5795,
    longitude: -7.633,
  },
  {
    key: 'ANFA',
    label: 'Anfa',
    latitude: 33.592,
    longitude: -7.674,
  },
  {
    key: 'AIN_DIAB',
    label: 'Aïn Diab',
    latitude: 33.601,
    longitude: -7.69,
  },
  {
    key: 'BOURGOGNE',
    label: 'Bourgogne',
    latitude: 33.5925,
    longitude: -7.646,
  },
  {
    key: 'SIDI_BELYOUT',
    label: 'Sidi Belyout',
    latitude: 33.5955,
    longitude: -7.617,
  },
  {
    key: 'HAY_MOHAMMADI',
    label: 'Hay Mohammadi',
    latitude: 33.604,
    longitude: -7.566,
  },
  {
    key: 'AIN_SEBAA',
    label: 'Aïn Sebaâ',
    latitude: 33.612,
    longitude: -7.505,
  },
  {
    key: 'SIDI_MOUMEN',
    label: 'Sidi Moumen',
    latitude: 33.621,
    longitude: -7.535,
  },
  {
    key: 'BEN_MSIK',
    label: "Ben M'Sik",
    latitude: 33.553,
    longitude: -7.565,
  },
  {
    key: 'SBATA',
    label: 'Sbata',
    latitude: 33.563,
    longitude: -7.574,
  },
  {
    key: 'OULFA',
    label: 'Oulfa',
    latitude: 33.553,
    longitude: -7.669,
  },
  {
    key: 'HAY_HASSANI',
    label: 'Hay Hassani',
    latitude: 33.553,
    longitude: -7.676,
  },
  {
    key: 'CALIFORNIE',
    label: 'Californie',
    latitude: 33.543,
    longitude: -7.615,
  },
  {
    key: 'SIDI_MAAROUF',
    label: 'Sidi Maârouf',
    latitude: 33.531,
    longitude: -7.641,
  },
  {
    key: 'LISSASFA',
    label: 'Lissasfa',
    latitude: 33.504,
    longitude: -7.66,
  },
  {
    key: 'ERRAHMA',
    label: 'Errahma',
    latitude: 33.5,
    longitude: -7.73,
  },
  {
    key: 'DAR_BOUAZZA',
    label: 'Dar Bouazza',
    latitude: 33.533,
    longitude: -7.846,
  },
  {
    key: 'BOUSKOURA',
    label: 'Bouskoura',
    latitude: 33.449,
    longitude: -7.652,
  },
  {
    key: 'NOUACEUR',
    label: 'Nouaceur',
    latitude: 33.367,
    longitude: -7.573,
  },
  {
    key: 'MEDIOUNA',
    label: 'Médiouna',
    latitude: 33.456,
    longitude: -7.518,
  },
  {
    key: 'TIT_MELLIL',
    label: 'Tit Mellil',
    latitude: 33.559,
    longitude: -7.483,
  },
  {
    key: 'LAHRAOUYINE',
    label: 'Lahraouyine',
    latitude: 33.585,
    longitude: -7.52,
  },
  {
    key: 'MOHAMMEDIA',
    label: 'Mohammedia',
    latitude: 33.6861,
    longitude: -7.383,
  },
  {
    key: 'MANSOURIA',
    label: 'Mansouria',
    latitude: 33.734,
    longitude: -7.32,
  },
  {
    key: 'BOUZNIKA',
    label: 'Bouznika',
    latitude: 33.789,
    longitude: -7.16,
  },
  {
    key: 'BERRECHID',
    label: 'Berrechid',
    latitude: 33.2655,
    longitude: -7.5875,
  },
  {
    key: 'DEROUA',
    label: 'Deroua',
    latitude: 33.405,
    longitude: -7.533,
  },
  {
    key: 'HAD_SOUALEM',
    label: 'Had Soualem',
    latitude: 33.412,
    longitude: -7.847,
  },
];

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('fr')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toCoordinate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function isValidLatitude(value) {
  return (
    value !== null &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(value) {
  return (
    value !== null &&
    value >= -180 &&
    value <= 180
  );
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function createZone(definition) {
  return Object.freeze({
    key: definition.key,
    code: definition.key,
    name: definition.label,
    label: definition.label,
    latitude: definition.latitude,
    longitude: definition.longitude,
    lat: definition.latitude,
    lng: definition.longitude,
  });
}

const zoneList = ZONE_DEFINITIONS.map(createZone);

export const ZONES_BY_KEY = Object.freeze(
  Object.fromEntries(
    zoneList.map((zone) => [
      zone.key,
      zone,
    ]),
  ),
);

/*
 * Compatibilité :
 * - ZONES.map(...) fonctionne ;
 * - ZONES.CASA_CENTRE fonctionne ;
 * - les propriétés par clé ne polluent pas les itérations de la liste.
 */
zoneList.forEach((zone) => {
  Object.defineProperty(
    zoneList,
    zone.key,
    {
      value: zone,
      enumerable: false,
      configurable: false,
      writable: false,
    },
  );
});

export const ZONES = Object.freeze(
  zoneList,
);

export const ZONE_KEYS = Object.freeze(
  ZONES.map((zone) => zone.key),
);

export const ZONE_LABELS = Object.freeze(
  ZONES.map((zone) => zone.label),
);

/**
 * Résout une zone depuis sa clé, son code ou son libellé.
 *
 * @param {string|object|null|undefined} value
 * @returns {object|null}
 */
export function getZone(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === 'object' &&
    value.key &&
    ZONES_BY_KEY[value.key]
  ) {
    return ZONES_BY_KEY[value.key];
  }

  const normalized =
    normalizeComparableText(value);

  if (!normalized) {
    return null;
  }

  return (
    ZONES_BY_KEY[normalized] ||
    ZONES.find(
      (zone) =>
        normalizeComparableText(
          zone.label,
        ) === normalized ||
        normalizeComparableText(
          zone.name,
        ) === normalized,
    ) ||
    null
  );
}

/**
 * Renvoie la clé technique d'une zone connue.
 *
 * @param {string|object|null|undefined} value
 * @returns {string}
 */
export function getZoneKey(value) {
  return getZone(value)?.key || '';
}

/**
 * Renvoie le libellé métier d'une zone connue.
 *
 * @param {string|object|null|undefined} value
 * @returns {string}
 */
export function getZoneLabel(value) {
  return getZone(value)?.label || '';
}

/**
 * Calcule la distance géographique entre deux points GPS
 * avec la formule de Haversine.
 *
 * @param {number|string} firstLatitude
 * @param {number|string} firstLongitude
 * @param {number|string} secondLatitude
 * @param {number|string} secondLongitude
 * @returns {number|null} Distance en kilomètres.
 */
export function getDistanceKm(
  firstLatitude,
  firstLongitude,
  secondLatitude,
  secondLongitude,
) {
  const lat1 =
    toCoordinate(firstLatitude);
  const lng1 =
    toCoordinate(firstLongitude);
  const lat2 =
    toCoordinate(secondLatitude);
  const lng2 =
    toCoordinate(secondLongitude);

  if (
    !isValidLatitude(lat1) ||
    !isValidLongitude(lng1) ||
    !isValidLatitude(lat2) ||
    !isValidLongitude(lng2)
  ) {
    return null;
  }

  const latitudeDelta =
    toRadians(lat2 - lat1);
  const longitudeDelta =
    toRadians(lng2 - lng1);

  const firstLatitudeRadians =
    toRadians(lat1);
  const secondLatitudeRadians =
    toRadians(lat2);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(
        secondLatitudeRadians,
      ) *
      Math.sin(
        longitudeDelta / 2,
      ) ** 2;

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(
        Math.max(0, 1 - haversine),
      ),
    );

  return (
    EARTH_RADIUS_KM *
    angularDistance
  );
}

/**
 * Retourne la zone la plus proche avec sa distance.
 *
 * Aucune limite métier n'est imposée par défaut.
 * `maxDistanceKm` peut être fournie par l'appelant lorsqu'une
 * règle de couverture explicite existe.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {{maxDistanceKm?: number|string}} [options]
 * @returns {{zone: object, key: string, label: string, distanceKm: number}|null}
 */
export function getNearestZoneDetails(
  latitude,
  longitude,
  options = {},
) {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);

  if (
    !isValidLatitude(lat) ||
    !isValidLongitude(lng)
  ) {
    return null;
  }

  const requestedMaximum =
    toCoordinate(
      options?.maxDistanceKm,
    );

  const maxDistanceKm =
    requestedMaximum !== null &&
    requestedMaximum >= 0
      ? requestedMaximum
      : null;

  let nearestZone = null;
  let nearestDistance =
    Number.POSITIVE_INFINITY;

  ZONES.forEach((zone) => {
    const distance = getDistanceKm(
      lat,
      lng,
      zone.latitude,
      zone.longitude,
    );

    if (
      distance !== null &&
      distance < nearestDistance
    ) {
      nearestZone = zone;
      nearestDistance = distance;
    }
  });

  if (
    !nearestZone ||
    (
      maxDistanceKm !== null &&
      nearestDistance >
        maxDistanceKm
    )
  ) {
    return null;
  }

  return Object.freeze({
    zone: nearestZone,
    key: nearestZone.key,
    label: nearestZone.label,
    distanceKm: nearestDistance,
  });
}

/**
 * Trouve le libellé métier de la zone la plus proche.
 *
 * Ce retour correspond à la valeur attendue par
 * `route_criteria` dans JobWizard.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {{maxDistanceKm?: number|string}} [options]
 * @returns {string}
 */
export function getNearestZone(
  latitude,
  longitude,
  options,
) {
  return (
    getNearestZoneDetails(
      latitude,
      longitude,
      options,
    )?.label || ''
  );
}

/**
 * Variante destinée aux intégrations qui ont besoin
 * de la clé technique historique.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {{maxDistanceKm?: number|string}} [options]
 * @returns {string}
 */
export function getNearestZoneKey(
  latitude,
  longitude,
  options,
) {
  return (
    getNearestZoneDetails(
      latitude,
      longitude,
      options,
    )?.key || ''
  );
}
