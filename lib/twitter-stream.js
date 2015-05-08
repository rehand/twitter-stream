var oauth   = require('oauth'),
    events  = require('events'),
    util    = require("util");

var stream_url          = 'https://stream.twitter.com/1.1/statuses/filter.json',
    request_token_url   = 'https://api.twitter.com/oauth/request_token',
    access_token_url    = 'https://api.twitter.com/oauth/access_token';

module.exports = TwitterStream;

function TwitterStream(params) {
    if (!(this instanceof TwitterStream)) {
        return new TwitterStream(params);
    }

    events.EventEmitter.call(this);

    if (!params.stream_url) {
        params.stream_url = stream_url;
    }

    this.params = params;

    this.oauth = new oauth.OAuth(
        request_token_url,
        access_token_url,
        this.params.consumer_key,
        this.params.consumer_secret,
        '1.0',
        null,
        'HMAC-SHA1',
        null,
        {
            'Accept': '*/*',
            'Connection'
                : 'close',
            'User-Agent': 'twitter-stream.js'
        }
    );
}

//inherit
util.inherits(TwitterStream, events.EventEmitter);

/**
 * Create twitter stream
 *
 * Events:
 * - data
 * - garbage
 * - close
 * - error
 * - connected
 * - heartbeat
 *
 */
TwitterStream.prototype.stream = function(params) {
    var stream = this;

    if (typeof params != 'object') {
        params = {};
    }

    //required params for lib
    params.delimited = 'length';
    params.stall_warnings = 'true';

    var request = this.oauth.post(
        this.params.stream_url,
        this.params.access_token_key,
        this.params.access_token_secret,
        params,
        null
    );

    /**
     * Destroy socket
     */
    this.destroy = function () {
        request.abort();
    };

    request.on('response', function (response) {
        // Any response code greater then 200 from steam API is an error
        if (response.statusCode > 200) {
            stream.emit('error', {type: 'response', data: {code: response.statusCode}});
        } else {
            var buffer = '',
                data_length = 0,
                end = '\n';

            //emit connected event
            stream.emit('connected');

            //set chunk encoding
            response.setEncoding('utf8');

            response.on('data', function (chunk) {
                //is heartbeat?
                if (chunk == end) {
                    stream.emit('heartbeat');
                    return;
                }

                if (buffer.length && buffer.length >= data_length) {
                    //parse json
                    try {
                        //try parse & emit
                        stream.emit('data', JSON.parse(buffer));
                    } catch (e) {
                        stream.emit('garbage', buffer);
                    }

                    //clean buffer
                    buffer = '';
                }

                //check whether new incoming data set
                if (!buffer.length) {
                    //get length of incoming data
                    var line_end_pos = chunk.indexOf(end);
                    data_length = parseInt(chunk.slice(0, line_end_pos));
                    //slice data length string from chunk
                    chunk = chunk.slice(line_end_pos + end.length);
                }

                //append to buffer
                buffer += chunk;
            });

            response.on('error', function (error) {
                stream.emit('close', error);
            });

            response.on('end', function () {
                stream.emit('close', 'socket end');
            });

            response.on('close', function () {
                request.abort();
            });
        }
    });

    request.on('error', function (error) {
        stream.emit('error', {type: 'request', data: error});
    });

    request.end();
};