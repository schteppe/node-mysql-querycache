var mysql = require('node-mysql')
,   _ = require('underscore')
,   EventEmitter = require('events').EventEmitter

module.exports = QueryCache;

/**
 * Manages cache for queries.
 * @class QueryCache
 * @constructor
 * @param {Options} [options]
 * @extends {EventEmitter}
 */
function QueryCache(options){
    options = options || {};
    this.cache = [];
    this.lastFinished = null;
    this.settings = {
        timeout : 10 * 1000,
        max :     100,
        connection : false,
    };
    _.extend(this.settings, options);
}
QueryCache.prototype.__proto__ = EventEmitter.prototype;

/**
 * Get current time
 * @static
 * @method time
 * @return {Number}
 */
QueryCache.time = function(){
    return new Date().getTime();
};

/**
 * Check if a cache object is old.
 * @method isInvalid
 * @param  {Object} cached
 * @return {Boolean}
 */
QueryCache.prototype.isInvalid = function(cached){
    var s = this.settings;
    return QueryCache.time() - cached.time > s.timeout;
};

/**
 * Make a cached query.
 * @method query
 * @param  {Connection}     [conn]      MySQL connection object.
 * @param  {String}         query       The SQL query
 * @param  {Array|Object}   [values]    The values to pass to conn.query
 * @param  {Function}       callback
 */
QueryCache.prototype.query = function(conn,query,values,callback){
    var c = this.getCached(query,values),
        that = this;

    if(typeof(conn) == "string"){
        // "conn" argument was skipped
        if(!this.settings.connection)
            throw new Error("Cannot execute query, Connection not given.");
        // Shift args
        callback = values;
        values = query;
        query = conn;
        conn = this.settings.connection;
    }

    if(typeof(values)=="function"){
        // "values" arg was skipped
        callback = values;
    }

    if(c && !c.finished){
        // Someone else already did this query, but it didn't finish!
        // Wait for the other query to be finished.
        var done = function(){
            var lf = that.lastFinished;
            if(lf != null && lf.query == query && _.isEqual(lf.values,values)){
                that.removeListener('resultFinish', done);
                callback(lf.err,lf.result,true);
            }
        };
        this.on('resultFinish',done);
    } else {

        // If the query is old, remove it
        if(c && this.isInvalid(c)){
            this.removeCached(c);
            c = false;
        }

        if(!c){
            // Make a new, fresh query
            // Insert the cached query
            c = this.insertCached(query,values);
            conn.query(query,values,function(err,result){

                // Set the result for the cached query
                that.setCachedResult(c,err,result);
                callback(err,result,false);
            });
        } else {

            // Use cached result
            callback(c.err,c.result,true);
        }
    }
};

/**
 * Get a cached result given query and values
 * @method getCached
 * @param  {String}         query
 * @param  {Array|Object}   values
 * @return {Object|Boolean} Returns the cached object if it was found, otherwise boolean false.
 */
QueryCache.prototype.getCached = function(query,values){
    var cache = this.cache;
    for(var i=0; i<cache.length; i++){
        var c = cache[i];
        if(c.query == query && _.isEqual(c.values,values)){
            return c;
        }
    }
    return false;
};

/**
 * Remove a cached result
 * @method removeCached
 * @param  {Object} cached
 */
QueryCache.prototype.removeCached = function(cached){
    var cache = this.cache;
    var i = cache.indexOf(cached);
    if(i != -1)
        cache.splice(i,1);
};

/**
 * Insert a cached query
 * @method insertCached
 * @param  {String} query
 * @param  {Array|Object} values
 * @return {Object}        The inserted cache object
 */
QueryCache.prototype.insertCached = function(query,values){
    var cache = this.cache;
    var c = {
        query : query,
        values : values,
        err : null,
        result : null,
        time : QueryCache.time(),
        finished : false,
    };

    this.cache.push(c);

    // Remove exceeding finished queries
    for(var i=cache.length-1; i>=0 && cache.length>this.settings.max; --i){
        var C = cache[i];
        if(C.finished){
            cache.splice(i,1);
        }
    }

    return c;
};

/**
 * Set the result for a cached query. Will fire the "resultFinish" event.
 * @method setCachedResult
 * @param  {Object}     cached  The cache object
 * @param  {Error|null} err     The query error, if any
 * @param  {Object}     result  Result object from query, if any
 */
QueryCache.prototype.setCachedResult = function(cached,err,result){
    cached.finished = true;
    cached.err = err;
    cached.result = result;
    this.lastFinished = cached;
    this.emit('resultFinish');
};
