var QueryCache = require('..').QueryCache;

var conn, slowConn;

exports.setUp = function(callback){
    conn = new DummyConnection();
    callback();
};

exports.construct = function(test){
    new QueryCache();
    new QueryCache({});
    var qc = new QueryCache({ timeout : 1 });
    test.equal(qc.settings.timeout,1);
    test.done();
};

exports.query = function(test){
    var qc = new QueryCache(),
        sql = "SELECT * FROM t";

    // Do same query twice, in serial
    qc.query(conn,sql,[],function(err,result,isCached1){
        test.equal(isCached1,false,'the query should not be cached first time');
        test.equal(conn.queryCount,1,'querycount should increment');

        qc.query(conn,sql,[],function(err,result,isCached2){
            test.equal(isCached2,true,'Same query twice should trigger caching');
            test.equal(conn.queryCount,1,'querycount should not increment when returning cached results');

            test.done();
        });
    });
};

exports.raceCondition = function(test){
    var qc = new QueryCache(),
        sql = "SELECT * FROM t";

    // Add some delay in the query
    conn.delay = 100;

    // Start a slow query
    qc.query(conn,sql,[],function(err,result,isCached1){
        test.equal(isCached1,false);
        test.equal(conn.queryCount,1);
    });

    // Meanwhile, another user does the same query. The cache should wait for
    // the first to finish and then return the same for both
    qc.query(conn,sql,[],function(err,result,isCached2){
        test.equal(isCached2,true,'Same query executed twice at the same time should only need one database request');
        test.equal(conn.queryCount,1);
        test.done();
    });
};

// Same as raceCondition, but with several queries to handle
exports.manyRaceConditions = function(test){
    var qc = new QueryCache(),
        sql1 = "SELECT * FROM t1",
        sql2 = "SELECT * FROM t2";

    conn.delay = 100;

    qc.query(conn,sql1,[],function(err,result,isCached1){
        test.equal(isCached1,false);
        test.equal(result.query,sql1);
    });

    qc.query(conn,sql2,[],function(err,result,isCached1){
        test.equal(isCached1,false);
        test.equal(result.query,sql2);
    });

    qc.query(conn,sql1,[],function(err,result,isCached2){
        test.equal(isCached2,true);
        test.equal(result.query,sql1);
    });

    qc.query(conn,sql2,[],function(err,result,isCached2){
        test.equal(isCached2,true);
        test.equal(result.query,sql2);
        test.done();
    });
};

exports.timeout = function(test){
    var t = 100,
        qc = new QueryCache({
            timeout : t,
        }),
        sql = "SELECT * FROM t";

    qc.query(conn,sql,[],function(err,result,isCached1){
        test.equal(isCached1,false);

        setTimeout(function(){
            qc.query(conn,sql,[],function(err,result,isCached2){
                test.equal(isCached2,false,'The result should have timed out by now!');
                test.done();
            });
        },t*2); // To make sure we time it out
    });
};

// Test to run .query with different number of arguments
exports.skipArgs = function(test){
    var qc = new QueryCache({
            connection : conn,
        }),
        sql = "SELECT * FROM t";

    // Give all args
    qc.query(conn,sql,[],function(){

        // Skip conn
        qc.query(sql,[],function(){

            // Skip values
            qc.query(sql,function(){
                test.done();
            });
        });
    });
};


exports.exceedMax = function(test){
    var qc = new QueryCache({
            max : 1,
        }),
        sql1 = "SELECT * FROM t1",
        sql2 = "SELECT * FROM t2";

    qc.query(conn,sql1,[],function(err,result,isCached1){
        test.equal(isCached1,false,'First query should not be cached');

        qc.query(conn,sql2,[],function(err,result,isCached2){
            test.equal(isCached2,false,'First query should not be cached');

            qc.query(conn,sql2,[],function(err,result,isCached3){
                test.equal(isCached3,true,'Second time we run query it should be cached');

                qc.query(conn,sql1,[],function(err,result,isCached4){
                    test.equal(isCached4,false,'The cache should have been overwritten');

                    qc.query(conn,sql1,[],function(err,result,isCached5){
                        test.equal(isCached5,true,'Should be cached after 2 consecutive');

                        test.done();
                    });
                });
            });
        });
    });
};



// Class that mimics mysql.Connection
function DummyConnection(){
    this.queryCount = 0;
    this.delay = 0;
}
DummyConnection.prototype.query = function(query,values,callback){
    var sampleResult = { sample : 'result', query : query },
        that = this;
    if(this.delay > 0){
        setTimeout(function(){
            that.queryCount++;
            callback(null,sampleResult);
        },this.delay);
    } else {
        this.queryCount++;
        callback(null,sampleResult);
    }
};

