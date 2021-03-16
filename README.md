# Baahn!

This small package contains the implementation of a trick which allows saving money when booking a trip
on [bahn.de](https://bahn.de).

It uses [`hafas-client`](https://github.com/public-transport/hafas-client)
for fetching information about journeys. Be sure to have a permission for
using this module.

## Installation
```shell
npm i git+ssh://git@github.com/roehrt/baaahn.git
```
That's it.

## API
Only the method `findJourneys` is exported and can be used.

```javascript
const findJourneys = require('baahn');
findJourneys('8011160', '8010224').then((data) => {
  console.log(require('util').inspect(data, {depth: null, colors: true}))
});
```

## Known Bugs
There are some complications with the recognition of improved journeys
which is caused by nearby stations, e.g. `Berlin Hbf` and `Berlin Hbf (tief)`.
Those stations have a different station id.

## See Also

`baahn-cli` - a simple cli wrapper for this module.
