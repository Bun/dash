/* Home Assistant connection management & data tracking
 *
 * Copyright 2017-2018  Ben de Graaff <ben@nx3d.org>
 * MIT license.
 */

var $ha = (function() {
    // User must be authenticated via the main interface
    var cred = localStorage.getItem('authToken');
    if (cred === null) {
        location.href = '/';
        // We could also prompt here, but esp. mobile devices won't play along.
        // TODO.
        //cred = prompt('HA password?');
        //if (cred !== null && cred.length > 0)
        //    localStorage.setItem('authToken', cred);
        return;
    }

    var secure = location.protocol === 'https:';
    var wsurl = (secure ? 'wss://' : 'ws://') + location.host + '/api/websocket';
    var haurl = location.protocol + '//' + location.host;

    // Stores cached entity state and callbacks for user-code
    var entities = {};

    // HA tracks requests/responses with an identifier, although we don't
    // really use them beyond the initial subscribe
    var id = 0;
    var send = function(data) {
        id += 1;
        data.id = id;
        s.send(data);
        return id;
    }

    // Deal with state changes
    var track = function(eid, val) {
        if (entities[eid] === undefined)
            entities[eid] = {};
        entities[eid].state = val.state;
        if (val.attributes !== undefined) {
            entities[eid].attributes = val.attributes;
        }
        if (entities[eid].notify) {
            entities[eid].notify.forEach(function(f) {
                try {
                    f(eid, val);
                } catch (e) {
                    console.warn(eid, e);
                }
            });
        }
    };

    var trackEvent = function(evt) {
        if (evt.event_type !== 'state_changed') {
            console.log('Received unknown event type from HA:',
                evt.event_type);
            return;
        }
        track(evt.data.entity_id, evt.data.new_state);
    };

    var state = 0;
    var process = function(m) {
        switch (m.type) {
            case 'auth_required':
                s.send({type: 'auth', api_password: cred});
                break;

            case 'auth_invalid':
                console.log('<<', JSON.stringify(m));
                //localStorage.removeItem('authToken');
                s.disconnect();
                location.href = '/';
                break;

            case 'auth_ok':
                send({type: 'subscribe_events', event_type: 'state_changed'});
                state = send({type: 'get_states'});
                break;

            case 'result':
                if (m.id === state) {
                    m.result.forEach(function(e) {
                        track(e.entity_id, e);
                    });
                } else
                    console.log('<<', JSON.stringify(m));
                break;
            case 'event':
                trackEvent(m.event);
                break;
            default:
                console.log('<<', JSON.stringify(m));
        }
    };

    var s = JSONStream(wsurl,
        {onopen: function() { document.body.classList.add('ha-connected'); },
            onclose: function() { document.body.classList.remove('ha-connected'); },
            onmessage: process}, 1000, true);

    return {
        url: haurl,
        entities: entities,
        connect: s.connect,
        send: send,
        setState: function(e, state, data) {
            var d = {entity_id: e};
            if (data !== undefined) {
                for (var k in data) {
                    d[k] = data[k];
                }
            }
            send({type: 'call_service',
                domain: 'homeassistant',
                service: 'turn_' + state,
                service_data: d});
        },
        debugSetState: function(eid, state) {
            track(eid, {state: state});
        },
        debugSetSun: function(eid, v) {
            var a = entities[eid];
            a.attributes.azimuth = v;
            track(eid, a);
        },
        getAttribute: function(eid, attr) {
            return entities[eid].attributes[attr];
        },
        setAttributes: function(eid, attrs) {
            let eids;
            // Not ready?
            console.log(eid, entities[eid].attributes);
            if (entities[eid].attributes === undefined)
                return;
            if (eid.startsWith('group.')) {
                eids = entities[eid].attributes.entity_id;
                if (eids === undefined)
                    return;
            } else {
                eids = [eid];
            }

            var all = entities[eid].state == 'off';
            eids.forEach(function(eid) {
                // TODO: you can't actually propose a state on a light that is
                // turned off
                if (!all && entities[eid].state !== 'on')
                    return;
                var blurb = {entity_id: eid};
                for (var k in attrs)
                    blurb[k] = attrs[k];
                send({domain: 'homeassistant',
                    type: 'call_service',
                    service: 'turn_on',
                    service_data: blurb});
            });
        },
        addEvent: function(eid, func) {
            if (entities[eid] === undefined)
                entities[eid] = {};

            if (entities[eid].notify === undefined) {
                entities[eid].notify = [func];
            } else {
                for (let f in entities[eid].notify) {
                    if (f === func)
                        return;
                }
                entities[eid].notify.push(func);
            }
        },
        clearEvents: function() {
            for (let eid in entities) {
                entities[eid].notify = [];
            }
        }
    };
})();
