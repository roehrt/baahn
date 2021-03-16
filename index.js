/**
 * This small package contains the implementation
 * of a trick which allows to save money when
 * booking a trip on {@link https://bahn.de|bahn.de}
 *
 * @projectname baahn
 * @version 1.0
 * @copyright 2020
 *
 */


const adjacencyList = require('./static/adjacencyList.json');
const journeys = require('db-hafas')('baahn').journeys;

/**
 * Possible products for a journey
 * @typedef {object} Products
 * @property {boolean} [suburban=true]
 * @property {boolean} [subway=true]
 * @property {boolean} [tram=true]
 * @property {boolean} [bus=true]
 * @property {boolean} [ferry=true]
 * @property {boolean} [express=true]
 * @property {boolean} [regional=true]
 */

/**
 * @typedef {object} Options
 * @property {Date} [departure=new Date()]
 * @property {Date} [arrival=null]
 * @property {number} [results=null] - number of journeys – `null` means "whatever HAFAS returns"
 * @property {number} [stopovers=false] - return stations on the way?
 * @property {number} [transfers=-1] - Maximum nr of transfers. Default: Let HAFAS decide.
 * @property {number} [transferTime=0] - minimum time for a single transfer in minutes
 * @property {('none'|'partial'|'complete')} [accessibility='none']
 * @property {boolean} [bike=false] - only bike-friendly journeys
 * @property {('slow'|'normal'|'fast')} [walkingSpeed='normal']
 * @property {boolean} [startWithWalking=true] - Consider walking to nearby stations at the beginning of a journey?
 * @property {Products} [products]
 * @property {boolean} [tickets=false] - return tickets? only available with some profiles
 * @property {boolean} [polylines=false] - return a shape for each leg?
 * @property {boolean} [subStops=true] - parse & expose sub-stops of stations?
 * @property {boolean} [entrances=true] - parse & expose entrances of stops/stations?
 * @property {boolean} [remarks=true] - parse & expose hints & warnings?
 * @property {boolean} [scheduledDays=false] - parse which days each journey is valid on
 * @property {string} [language='en'] - language to get results in
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|hafas-client}
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/p/db/readme.md|db-hafas}
}
 */

/**
 * A string containing the eva code of a station
 * @typedef {string} Station
 */

/**
 * A string representing a specific journey through time and stops
 * @typedef {string} JourneyString
 */

/**
 * A string representing a specific journey through time and stops
 * @typedef {string} JourneyString
 */

/**
 * A HashMap of journeys
 * @typedef {Object.<JourneyString, object>} JourneyMap
 */

/**
 * Creates identifiable string from legs of a journey
 * @param {object[]} legs - legs of journey
 * @returns {JourneyString} hash
 */
function createHash(legs) {
	return legs.map(hashLeg).join(':');
}

/**
 * Creates identifiable string from leg of a journey
 * @param {object} leg - leg of journey
 * @returns {JourneyString} hash
 */
function hashLeg(leg) {
	return `${leg.origin.id}@${leg.plannedDeparture ?? leg.departure}>` +
		`${leg.destination.id}@${leg.plannedArrival ?? leg.arrival}`;
}

/**
 * Returns adjacent stations in the German long-distance network
 * @param {Station} station - eva code of a station
 * @returns {Station[]} adjacent stations
 */
function nextStops(station) {
	return adjacencyList[station];
}

/**
 * Updates hashMap if cheaper price was found
 * @param {JourneyMap} hashMap
 * @param {object} journey
 * @param {Station} from
 * @param {Station} to
 */
function updateHashMap(hashMap, journey, from, to) {
	if (journey.price === null) return;

	const legs = journey.legs;

	// Remove the extensions of the journey
	const prepend = [];
	while (legs.length && legs[0].origin.id !== from) {
		prepend.push(legs.shift());
	}

	const append = [];
	while (legs.length && legs[legs.length - 1].destination.id !== to) {
		append.push(legs.pop());
	}

	if (legs.length === 0) return; // something unexpected happen

	// Fetch old journey
	const hash = createHash(legs);
	const oldJourney = hashMap[hash];

	// No improvement or not assignable
	if (!oldJourney || !oldJourney.price.amount || oldJourney.price.amount <= journey.price.amount) return;

	journey.trick = {
		prepend,
		append,
		oldPrice: oldJourney.price.amount,
	};
	hashMap[hash] = journey;
}

/**
 * Finds cheaper prices for given journey.
 * For params see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|db-hafas}.
 * @param {Station} from - origin of journey
 * @param {Station} to - destination of journey
 * @param {Options} [opt={}] - journey options
 * @returns {Promise<object[]>}
 * @see {@link https://github.com/public-transport/hafas-client/blob/5/docs/journeys.md|db-hafas}
 */
module.exports = async function findJourneys(from, to, opt = {}) {
	opt.via = null;

	const requests = [];
	requests.push(journeys(from, to, opt));

	// Extend the start of the journey
	opt.via = from;
	for (const stop of nextStops(from)) {
		from = stop;
		requests.push(journeys(from, to, opt));
	}
	from = opt.via;

	// Extend the end of the journey
	opt.via = to;
	for (const stop of nextStops(to)) {
		to = stop;
		requests.push(journeys(from, to, opt));
	}
	to = opt.via;

	// Await all results
	const results = await Promise.allSettled(requests);

	// Original journeys
	const originalResult = results.shift();
	if (originalResult.status === 'rejected') {
		throw Error('No journey found');
	}

	// Index journeys by hash
	const hashMap = {};
	for (const journey of originalResult.value.journeys) {
		if (!journey.price || !journey.price.amount) continue;
		const hash = createHash(journey.legs);
		hashMap[hash] = journey;
	}

	// Check if longer journeys are cheaper
	for (const result of results) {
		if (result.status === 'fulfilled') {
			for (const journey of result.value.journeys) {
				updateHashMap(hashMap, journey, from, to);
			}
		}
	}

	return Object.values(hashMap);
};
