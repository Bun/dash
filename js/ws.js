/* Reconnecting WebSocket client for JSON streams
 *
 * Copyright 2015-2018  Ben de Graaff <ben@nx3d.org>
 * MIT license.
 */

var JSONStream = function(url, callbacks, interval, smart_backoff) {
    var connect_called = false;
    var had_initial_connection = false;
    var keep_disconnected = false;

    var call = function(k, a, msg) {
        if (callbacks[k]) {
            var args = msg !== undefined ? [msg, callbacks] : [callbacks];
            args.push.apply(args, a);
            return callbacks[k].apply(callbacks, args);
        }
    };

    var reconnect = function() {
        if (!had_initial_connection && smart_backoff) {
            setTimeout(connect, 30000);
        } else {
            setTimeout(connect, interval);
        }
    };

    var onopen = function() {
        console.log('[ws] Established:', url);
        had_initial_connection = true;
        call('onopen', arguments);
    };

    var onclose = function() {
        console.warn('[ws] Disconnected:', url);
        if (!keep_disconnected) {
            reconnect();
        }
        try {
            call('onclose', arguments);
        } finally {
            callbacks.ws = null;
        }
    };

    var onerror = function() {
        console.warn('[ws] Error:', url, arguments);
        call('onerror', arguments);
    };

    var onmessage = function(e) {
        var msg = JSON.parse(e.data);
        call('onmessage', arguments, msg);
    };

    var connect = function() {
        var ws;
        try {
            ws = callbacks.ws = new WebSocket(url);
        } catch (e) {
            $status.debug('WebSocket error: ' + e);
            return;
        }

        ws.onopen = onopen;
        ws.onclose = onclose;
        ws.onerror = onerror;
        ws.onmessage = onmessage;
        connect_called = true;
    };

    callbacks.send = function(msg) {
        try {
            if (callbacks.ws) {
                msg = JSON.stringify(msg);
                console.log('[ws] Send:', msg);
                callbacks.ws.send(msg);
            }
        } catch (e) {
            console.error('Failed to send:', e);
        }
    };

    callbacks.connect = function() {
        keep_disconnected = false;
        if (!connect_called)
            connect();
        else
            reconnect();
    };

    callbacks.disconnect = function() {
        keep_disconnected = true;
        if (ws !== null) {
            ws.close();
        }
    };

    //connect();
    return callbacks;
};
