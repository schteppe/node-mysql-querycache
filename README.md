node-mysql-querycache
======================
Simple, in-app query result caching to relax your MySQL database.

Built upon [node-mysql](https://github.com/felixge/node-mysql).

### Sample usage
```js
var QueryCache = require('mysql-querycache').QueryCache;
var cache = new QueryCache({
  timeout: 10 * 1000, // 10s
  max:10, // Max cached results, if query changes over time
});
cache.query(conn,"SELECT * FROM t WHERE id=?",[1],function(err,result,isCached){
    // Do something with the result
});
```

### QueryCache class options
Syntax:
```
new QueryCache(options)
```

##### timeout
Age (in milliseconds) of an "old" cache that can be discareded.

##### max
The maximum number of cached results.

##### connection
If you run cache.query() without the first connection parameter, it will use this connection object instead.

### .query([connection,] query [,values] , callback)
Run a cached mysql query.

The first time the query is done, it will make a database request. Second time, it will reuse the result from the first query, if the following conditions hold:

* The cached result is not older than ```options.timeout``` milliseconds
* The cached result has not beed removed due to exceeded max cache (see ```options.max```).

### Race conditions

If a race condition occurs, where an identical second query is requested before the first one has finished, QueryCache will make sure that the second query waits for the first result to become cached.

##### Example
```js
cache.query("SELECT * FROM hugeTable",function(err,result,isCached){
    console.log("first",isCached);
});
cache.query("SELECT * FROM hugeTable",function(err,result,isCached){
    console.log("second",isCached);
});
```
Output:
```
first false
second true
```
The important thing to note here is that the second query will wait for the first to finish and return the same result.
