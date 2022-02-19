import createClient, {
  Journey, Journeys, JourneysOptions, Leg,
} from 'hafas-client';
// @ts-ignore
import dbProfile from 'hafas-client/p/db';

import stationGraph from '../static/stationGraph.json';

const { journeys } = createClient(dbProfile, 'baahn');

/**
 * A journey with an extra attribute `trick`
 * which stores how the price saving was achieved
 */
export interface BaahnJourney extends Journey {
  trick?: {
    prepend: Leg[],
    append: Leg[],
    oldPrice: number,
  }
}

/**
 * A string containing the eva code of a station.
 */
export type BaahnStation = string;

/**
 * An identifier representing a specific journey based on it's stops (and the time of the stops).
 */
type BaahnJourneyHash = string;

/**
 * A lookup table for journeys.
 */
type BaahnJourneyMap = { [key: string]: BaahnJourney };

/**
 * An adjacency list representing the German long-distance
 * train network.
 */
type StationGraph = { [key: string]: BaahnStation[] };

/**
 * Creates identifiable string from leg of a journey.
 *
 * @param {Leg} leg - leg of journey
 * @returns {BaahnJourneyHash} hash
 */
function hashLeg(leg: Leg): BaahnJourneyHash {
  return `${leg.origin?.id}@${leg.plannedDeparture ?? leg.departure}>`
        + `${leg.destination?.id}@${leg.plannedArrival ?? leg.arrival}`;
}

/**
 * Creates a hash from the legs of a journey.
 *
 * @param {Leg[]} legs - legs of journey
 * @returns {BaahnJourneyHash} hash
 */
function hashLegs(legs: readonly Leg[]): BaahnJourneyHash {
  return legs.map(hashLeg).join(':');
}

/**
 * Returns adjacent stations in the German long-distance network.
 *
 * @param {BaahnStation} station - eva code of a station
 * @returns {BaahnStation[]} adjacent stations
 */
function adjacentStations(station: BaahnStation): BaahnStation[] {
  return (stationGraph as StationGraph)[station] || [];
}

/**
 * Updates the journey map if journey contains a cheaper price.
 *
 * @param {BaahnJourneyMap} journeyMap
 * @param {BaahnJourney} journey
 * @param {BaahnStation} from
 * @param {BaahnStation} to
 */
function update(journeyMap: BaahnJourneyMap, journey: BaahnJourney, from: BaahnStation, to: BaahnStation) {
  if (journey.price === null) return;

  const { legs } = journey;

  // Remove the extension from the journey
  const prepend = [];
  while (legs.length && legs[0].origin?.id !== from) {
    // @ts-ignore
    prepend.push(legs.shift());
  }

  const append = [];
  while (legs.length && legs[legs.length - 1].destination?.id !== to) {
    // @ts-ignore
    append.unshift(legs.pop());
  }

  // Journey didn't contain the original connection
  if (legs.length === 0) return;

  // Fetch current best journey
  const hash = hashLegs(legs);
  const oldJourney = journeyMap[hash];

  // Journey not found
  // TODO: maybe insert the journey into the map even if it's not originally there?!
  if (!oldJourney || !oldJourney.price?.amount) return;

  // No price improvement
  if (oldJourney.price.amount <= (journey.price?.amount ?? Infinity)) return;

  // Save how the money saving was achieved
  journey.trick = {
    prepend,
    append,
    oldPrice: oldJourney.trick?.oldPrice ?? oldJourney.price.amount,
  };

  journeyMap[hash] = journey;
}

/**
 * Queries the original connection and possible longer/cheaper ones.
 *
 * @param {BaahnStation} from - origin of journey
 * @param {BaahnStation} to - destination of journey
 * @param {JourneysOptions} [opt] - journey options
 * @returns {Promise<Journeys>[]}
 */
function buildRequests(from: BaahnStation, to: BaahnStation, opt: JourneysOptions = {}): Promise<Journeys>[] {
  const requests = [];
  requests.push(journeys(from, to, opt));

  // Extend the start of the journey
  opt.via = from;
  for (const newOrigin of adjacentStations(from)) {
    from = newOrigin;
    requests.push(journeys(from, to, opt));
  }
  from = opt.via;

  // Extend the end of the journey
  opt.via = to;
  for (const newDestination of adjacentStations(to)) {
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
 * @param {JourneysOptions} [opt] - journey options
 * @returns {Promise<BaahnJourney[]>}
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|hafas-client}
 */
// eslint-disable-next-line import/prefer-default-export
export async function findJourneys(
  from: BaahnStation,
  to: BaahnStation,
  opt: JourneysOptions = {},
): Promise<BaahnJourney[]> {
  if (opt.via) {
    // eslint-disable-next-line no-console
    console.warn(`The 'via' option cannot be used. ${opt.via} was passed.`);
  }

  // "via" option cannot be used
  opt.via = undefined;

  const requests = buildRequests(from, to, opt);
  const connections = await Promise.allSettled(requests);

  if (connections.length === 0) return [];
  const originalConnection = connections.shift();
  if (!originalConnection?.status || originalConnection?.status === 'rejected') {
    // There is no journey available
    return [];
  }

  // Hash the journeys found so that we can later compare
  // the extended connections with them more quickly.
  const cheapestJourneys: BaahnJourneyMap = {};
  for (const journey of originalConnection.value?.journeys ?? []) {
    if (!journey.price || !journey.price.amount) continue;
    const hash = hashLegs(journey.legs);
    cheapestJourneys[hash] = journey;
  }

  // Check if the extended journeys are cheaper
  for (const extendedConnections of connections) {
    if (extendedConnections.status === 'fulfilled') {
      for (const journey of extendedConnections.value?.journeys ?? []) {
        update(cheapestJourneys, journey, from, to);
      }
    }
  }

  return Object.values(cheapestJourneys);
}
