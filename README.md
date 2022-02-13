# Baahn!

This small package contains the implementation of a trick which allows saving money when booking a trip
on [bahn.de](https://bahn.de).

It uses [`hafas-client`](https://github.com/public-transport/hafas-client)
for fetching information about journeys.

## Installation
Switch the registry to `https://npm.pkg.github.com` by adding these
lines to your `.npmrc`. Currently, you will need an access token to install this package. 
```
@roehrt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your token>
```
Install the package with:
```shell
npm i @roehrt/baahn
```
That's it.

## API
Only the method `findJourneys` is exported and can be used.

```javascript
const { findJourneys } = require('@roehrt/baahn');
findJourneys('8011160', '8010224').then((data) => {
  console.log(require('util').inspect(data, {depth: null, colors: true}))
});
```

## Known Bugs
There are some complications with the recognition of improved journeys
which is caused by nearby stations, e.g. `Berlin Hbf` and `Berlin Hbf (tief)`.
Those stations have a different station id.

## See Also

[`baahn-cli`](https://github.com/roehrt/baahn-cli) - a simple cli wrapper for this module.
