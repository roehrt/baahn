/**
 * This small package contains the implementation
 * of a trick which allows to save money when
 * booking a trip on {@link https://bahn.de|bahn.de}.
 *
 * @projectname baahn
 * @version 1.0.6
 * @copyright 2020
 *
 * Finds cheaper journeys.
 * @module baahn
 */

const { journeys } = require('hafas-client')(require('hafas-client/p/db'), 'baahn');
const loyaltyCards = require('hafas-client/p/db/loyalty-cards').data;

const adjacencyList = require('./static/adjacencyList.json');

/**
 * Possible products for a journey.
 *
 * @typedef {object} BaahnProducts
 * @property {boolean} [suburban=true]
 * @property {boolean} [subway=true]
 * @property {boolean} [tram=true]
 * @property {boolean} [bus=true]
 * @property {boolean} [ferry=true]
 * @property {boolean} [express=true]
 * @property {boolean} [regional=true]
 */

/**
 * Specifies options to restrict HAFAS search.
 *
 * @typedef {object} BaahnOptions
 * @property {?Date} [departure=new Date()] - Start time of the journey. Cannot be used with `arrival`.
 * @property {?Date} [arrival=null] - End time of the journey. Cannot be used with `departure`.
 * @property {?number} [results=null] - Number of journeys – `null` means "whatever HAFAS returns"
 * @property {boolean} [stopovers=false] - Return stations on the way?
 * @property {number} [transfers=-1] - Maximum number of transfers. Default: Let HAFAS decide.
 * @property {number} [transferTime=0] - Minimum time for a single transfer in minutes.
 * @property {('none'|'partial'|'complete')} [accessibility='none'] - Only journeys with specified accessibility.
 * @property {boolean} [bike=false] - Only bike-friendly journeys?
 * @property {('slow'|'normal'|'fast')} [walkingSpeed='normal'] - Walking speed HAFAS should use for calculations.
 * @property {boolean} [startWithWalking=true] - Consider walking to nearby stations at the beginning of a journey?
 * @property {BaahnProducts} [products={}] - Products HAFAS is allowed to use.
 * @property {boolean} [tickets=false] - Return tickets?
 * @property {boolean} [polylines=false] - Return a shape for each leg?
 * @property {boolean} [subStops=true] - Parse & expose sub-stops of stations?
 * @property {boolean} [entrances=true] - Parse & expose entrances of stops/stations?
 * @property {boolean} [remarks=true] - Parse & expose hints & warnings?
 * @property {boolean} [scheduledDays=false] - Parse which days each journey is valid on.
 * @property {string} [language='en'] - Language to get results in.
 * @property {?number} [loyaltyCard=null] - BahnCard discount in percent.
 * @property {boolean} [firstClass=false] - Travel with first class?
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|hafas-client} for general
 * HAFAS documentation
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/p/db/readme.md|db-hafas} for DB-specific
 * documentation
 */

/**
 * A string containing the eva code of a station.
 *
 * @typedef {string} BaahnStation
 */

/**
 * A string representing a specific journey through time and stops.
 *
 * @typedef {string} BaahnJourneyString
 */

/**
 * A HashMap of journeys.
 *
 * @typedef {Object.<BaahnJourneyString, object>} BaahnJourneyMap
 */

/**
 * Creates identifiable string from leg of a journey.
 *
 * @param {object} leg - leg of journey
 * @returns {BaahnJourneyString} hash
 */
function hashLeg(leg) {
  return `${leg.origin.id}@${leg.plannedDeparture ?? leg.departure}>`
    + `${leg.destination.id}@${leg.plannedArrival ?? leg.arrival}`;
}

/**
 * Creates identifiable string from legs of a journey.
 *
 * @param {object[]} legs - legs of journey
 * @returns {BaahnJourneyString} hash
 */
function hashLegs(legs) {
  return legs.map(hashLeg).join(':');
}

/**
 * Returns adjacent stations in the German long-distance network.
 *
 * @param {BaahnStation} station - eva code of a station
 * @returns {BaahnStation[]} adjacent stations
 */
function adjacentStation(station) {
  return adjacencyList[station] || [];
}

/**
 * Updates the journey map if journey contains a cheaper price.
 *
 * @param {BaahnJourneyMap} journeyMap
 * @param {object} journey
 * @param {BaahnStation} from
 * @param {BaahnStation} to
 */
function update(journeyMap, journey, from, to) {
  if (journey.price === null) return;

  const { legs } = journey;

  // Remove the extension from the journey
  const prepend = [];
  while (legs.length && legs[0].origin.id !== from) {
    prepend.push(legs.shift());
  }

  const append = [];
  while (legs.length && legs[legs.length - 1].destination.id !== to) {
    append.unshift(legs.pop());
  }

  // Journey didn't contain the original connection
  if (legs.length === 0) return;

  // Fetch current best journey
  const hash = hashLegs(legs);
  const oldJourney = journeyMap[hash];

  // Journey not found
  // TODO: maybe insert the journey into the map even if it's not originally there?!
  if (!oldJourney || !oldJourney.price.amount) return;

  // No price improvement
  if (oldJourney.price.amount <= journey.price.amount) return;

  // Save how the money saving was achieved
  journey.trick = {
    prepend,
    append,
    oldPrice: oldJourney.price.amount,
  };

  journeyMap[hash] = journey;
}

/**
 * Queries the original connection and possible longer/cheaper ones.
 *
 * @param {BaahnStation} from - origin of journey
 * @param {BaahnStation} to - destination of journey
 * @param {BaahnOptions} [opt={}] - journey options
 * @returns {Promise<object[]>[]}
 */
function buildRequests(from, to, opt) {
  const requests = [];
  requests.push(journeys(from, to, opt));

  // Extend the start of the journey
  opt.via = from;
  for (const newOrigin of adjacentStation(from)) {
    from = newOrigin;
    requests.push(journeys(from, to, opt));
  }
  from = opt.via;

  // Extend the end of the journey
  opt.via = to;
  for (const newDestination of adjacentStation(to)) {
    to = newDestination;
    requests.push(journeys(from, to, opt));
  }

  return requests;
}

/**
 * Finds cheaper prices for given journey.
 *
 * @param {BaahnStation} from - origin of journey
 * @param {BaahnStation} to - destination of journey
 * @param {BaahnOptions} [opt={}] - journey options
 * @returns {Promise<object[]>}
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|hafas-client}
 */
exports.findJourneys = async function findJourneys(from, to, opt = {}) {
  // Transform BahnCard discount for db-hafas
  if (opt.loyaltyCard) {
    opt.loyaltyCard = { type: loyaltyCards.BAHNCARD, discount: opt.loyaltyCard };
  }

  if (opt.via) {
    // eslint-disable-next-line no-console
    console.warn(`The 'via' option cannot be used. ${opt.via} was passed.`);
  }

  // "via" option cannot be used
  opt.via = null;

  const requests = buildRequests(from, to, opt);
  const connections = await Promise.allSettled(requests);

  const originalConnection = connections.shift();
  if (originalConnection.status === 'rejected') {
    // There is no journey available
    return [];
  }

  // Hash the journeys found so that we can later compare
  // the extended connections with them more quickly.
  const cheapestJourneys = {};
  for (const journey of originalConnection.value.journeys) {
    if (!journey.price || !journey.price.amount) continue;
    const hash = hashLegs(journey.legs);
    cheapestJourneys[hash] = journey;
  }

  // Check if the extended journeys are cheaper
  for (const extendedConnections of connections) {
    if (extendedConnections.status === 'fulfilled') {
      for (const journey of extendedConnections.value.journeys) {
        update(cheapestJourneys, journey, from, to);
      }
    }
  }

  return Object.values(cheapestJourneys);
};
