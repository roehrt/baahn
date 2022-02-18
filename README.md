# Baahn! 🚂

`baahn` lets you find special connections saving money
when travelling with [Deutsche Bahn (DB)](https://bahn.de).
It's using [`hafas-client`] (huge thanks!) under the hood for
fetching information about the journeys.

Suppose you want to travel from `Berlin Hbf` to `Magdeburg Hbf`.
This package finds a longer journey that contains the actual journey
but is actually cheaper (yep, the DB price system is weeeird).

The output of the `baahn` web app:

![baahn web app in action](https://github.com/roehrt/baahn/blob/main/cheaper_journey.png?raw=true)

## Installation

```shell
npm i @roehrt/baahn
```

## Example

```javascript
const { findJourneys } = require('@roehrt/baahn');
findJourneys('8011160', '8010224').then((data) => {
  console.log(require('util').inspect(data, {depth: null, colors: true}))
});
```
For finding the station ids [`hafas-client`] is recommended.
For everyday use consider using the [`baahn-cli`] package.

More information on how to use `findJourneys` can be found in the [`hafas-client`] docs:
[`journeys`](https://github.com/public-transport/hafas-client/blob/master/docs/journeys.md)
and `findJourneys` have the same signature and nearly the same return type and can therefore
be used interchangeably. The only additional property that `findJourneys` return is an optional
property `trick` of a journey storing how the price saving was achieved.
```typescript
interface BaahnJourney extends Journey {
  trick?: {
    prepend: Leg[],
    append: Leg[],
    oldPrice: number,
  }
}
```
- `oldPrice` stores the unoptimized price.
- `prepend` stores all legs that need to be **prepended** to the original journey.
- `append` stores all legs that need to be **appended** to the original journey.

## Known Bugs
There are some complications with the recognition of cheaper journeys
caused by nearby/identical stations with different name, e.g. `Berlin Hbf`
and `Berlin Hbf (tief)` and non-long-distance train stations. For further information visit the rather
spartan [FAQ](https://baahn.vercel.app/faq) (German).

## See Also

[`baahn-cli`] - a simple cli wrapper for this module.

[`hafas-client`]: https://github.com/public-transport/hafas-client
[`baahn-cli`]: https://github.com/roehrt/baahn-cli
