/* Tiled dashboard rendering
 *
 * Copyright 2017-2018  Ben de Graaff <ben@nx3d.org>
 * MIT license.
 */

/* Evaluate user scripts with some helper functions
 */
var $scriptEval = (function() {
    function parseDate(date) {
        // MUST be YYYY-MM-DD
        return new Date(String(date));
    }

    function replace(key, table) {
        const value = table[key];
        if (value === undefined)
            return key;
        return value;
    };

    // TODO:
    // - Percentage computation for brightness, color temperature

    return function(script, config, vars) {
        eval(script);
    };
})();

/* Render a user template with some
 */
var $renderTemplate = (function() {
    // Simple if/else logic
    Handlebars.registerHelper('equals', function(a, b, options) {
        if (a == b) {
            return options.fn(this);
        }
        return options.inverse(this);
    });

    // Must be YYYY-MM-DD format
    // TODO: remove
    Handlebars.registerHelper('date', function(date, format) {
        var m = String(date).match(/^(\d\d\d\d)-(\d\d)-(\d\d)$/);
        if (m === null) {
            console.error("Cannot parse", JSON.stringify(date));
            return date;
        }
        return format.replace(/%[a-zA-Z]/g, function(z) {
            switch (z) {
                case '%d': return +m[3];
                case '%D': return m[3];
                case '%m': return +m[2];
                case '%M': return m[2];
                case '%y':
                case '%Y': return m[1];
            }
        });
    });

    // Render a picture, to be used with `attributes.entity_picture`
    Handlebars.registerHelper('pic', function(path) {
        if (!path)
            return '';
        var url = Handlebars.escapeExpression($ha.url + path);
        return new Handlebars.SafeString('<img src="' + url + '">');
    });

    return function(config, elem, view, template, script) {
        script = (config.script || '') + script;
        try {
            $scriptEval(script, config, view);
            if (template instanceof Function)
                elem.innerHTML = template(view);
            else if (template !== undefined)
                elem.innerHTML = template;
        } catch (e) {
            console.error(e);
            elem.textContent = e;
        }
    };
})();

/* Render a template based on an entity and its state/attributes
 */
function $entityTemplateRender(config, req, elem, display) {
        var eid = req.entity;
        var renderFunc = function(eid, val) {
            var view = {};
            for (var k in val)
                view[k] = val[k];
            // Attribute `data-foo-bar` is turned into `fooBar`
            for (let k in elem.dataset) {
                let name = k.replace(/[A-Z]/g, (m) => '_' + m[0].toLowerCase());
                view[name] = elem.dataset[k];
            }
            if (req.vars) {
                for (var k in req.vars)
                    view[k] = req.vars[k];
            }
            elem.dataset.state = val.state;
            elem.title = eid.replace(/.+\./, '') + ': ' + val.state;
            $renderTemplate(config, display, view, req.display, req.script);
        };
        $ha.addEvent(eid, renderFunc);
        if ($ha.entities[eid] !== undefined && $ha.entities[eid].state !== undefined) {
            renderFunc(eid, $ha.entities[eid]);
        }
}

/* Parse an HTML panel
 */
var $parseTemplate = function(container, text) {
    var config = {};

    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'text/html');
    // These elements are added to <head> and should be removed
    var removeMe = [];

    var docHead = document.querySelector('head');
    var head = doc.querySelector('head');
    config.script = extractScripts(head);
    while (head.children.length > 0) {
        let c = head.children[0];
        c.remove();
        removeMe.push(c);
        docHead.appendChild(c);
    }

    function extractScripts(e) {
        let scripts = e.querySelectorAll('script');
        let script = '';
        for (let s of scripts) {
            script += s.innerHTML;
            s.remove();
        }
        return script;
    }

    function extractAttributes(elem) {
        let attr = {};
        for (let i = 0; i < elem.attributes.length; i++) {
            let a = elem.attributes[i];
            attr[a.name] = a.value;
        }
        return attr;
    }

    let templates = {};
    for (let t of doc.querySelectorAll('dash-template')) {
        t.remove();
        let script = extractScripts(t);
        let attr = extractAttributes(t);
        templates[t.getAttribute('dash-template-id')] = {
            display: t.innerHTML,
            script: script,
            attributes: attr
        };
    }

    // TODO: complain about unexpected stuff in head
    // TODO: test how this breaks if you add an entity to an entity

    // TODO: for now body should not have attributes, in the future copy them
    // to their container
    var body = doc.querySelector('body');
    body.remove();
    var entities = body.querySelectorAll('[dash-entity]');
    for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        const script = extractScripts(e);
        const template = templates[e.getAttribute('dash-template')] || {};

        // TODO: we may want to merge certain attributes, such as class; for
        // now we only set them if they weren't set already
        const attr = template.attributes || {};
        for (let k in attr) {
            if (e.getAttribute(k) === null) {
                e.setAttribute(k, attr[k]);
            }
        }

        // Trickery...
        const display = e.innerHTML + (template.display || '');
        const req = {
            entity: e.getAttribute('dash-entity'),
            _display: display,
            display: Handlebars.compile(display),
            script: (template.script || '') + script
        };

        e.innerHTML = '';
        $entityTemplateRender(config, req, e, e);
        $entityClicked(req.entity, e);
    }

    // TODO: Remove and warn about remaining incorrectly placed scripts

    for (let p of body.querySelectorAll('[dash-panel]')) {
        let panel = p.getAttribute('dash-panel');
        p.addEventListener('click', function() {
            $loadPanel(panel);
        });
    }

    while (body.children.length > 0) {
        let c = body.children[0];
        c.remove();
        container.appendChild(c);
    }

    return removeMe;
};

var $entityClicked = (function() {
    // Global mouse (de)press handler that can be used to abort a click event
    var activeHold = null;
    var endMouse = function(e) {
        if (activeHold) {
            console.log('cancel input', e.type);
            activeHold(e);
            activeHold = null;
        }
    };
    document.body.addEventListener('mouseup', endMouse);
    document.body.addEventListener('mouseleave', endMouse);

    return function(entity, elem) {
        var cval, ival, called, incr, attr;
        var once = function() {
            called = true;
            cval += incr;
            var attrs = {};
            attrs[attr] = cval;
            $ha.setAttributes(entity, attrs);
        };
        var release = function() {
            clearInterval(ival);
            if (!called) { incr = incr * 2.5; once(); }
        };
        var cancelClick = false;
        function attributeClick(e) {
            e.preventDefault();
            if (activeHold) return;
            if (!e.target.classList.contains('attr-btn')) {
                cancelClick = false;
                return;
            }
            cancelClick = true;
            attr = e.target.dataset.attr;
            console.log('Clicked attribute', entity, attr);
            called = false;
            incr = +e.target.dataset.incr;
            cval = $ha.getAttribute(entity, attr);
            ival = setInterval(once, 400);
            activeHold = release;
        }
        function buttonClick(e) {
            var state = $ha.entities[entity].state;
            console.log('Clicked', entity,
                'current state:', state, 'cancel:', cancelClick);
            if (cancelClick)
                return;
            if (state === 'on') {
                $ha.setState(entity, 'off');
            } else if (state === 'off') {
                $ha.setState(entity, 'on');
            }
        }
        elem.addEventListener('click', buttonClick);
        elem.addEventListener('mousedown', attributeClick);
    };
})();

/* Loads a panel configuration file
 */
var $loadPanel = (function() {
    var pending = null,
        page = null,
        toRemove = null;
    var rendered = null;

    function createContainer(remove) {
        if (rendered !== null) {
            if (!remove)
                return;
            if (toRemove) {
                for (let e of toRemove) {
                    e.remove();
                }
            }
            rendered.remove();
        }
        rendered = document.createElement('div');
        rendered.className = 'dash-container';
        document.body.appendChild(rendered);
    }

    function renderError(text) {
        createContainer(false);
        var error = document.createElement('p');
        error.style.background = '#cc0000';
        error.style.color = 'white';
        error.style.padding = '10px 15px';
        error.style.margin = '10px 15px';
        error.setAttribute('onclick', '$loadPanel("main")');
        error.textContent = text;
        rendered.appendChild(error);
    }

    function loaded() {
        if (pending.readyState !== 4)
            return
        const status = pending.status;
        pending = null;
        if (status !== 200) {
            // TODO: show error
            switch (status) {
                case 404:
                    return renderError('The panel file "conf/' + page + '.html" does not exist');
                case 403:
                    return renderError('Access to panel file "conf/' + page + '.html" was denied (check permissions)');
                default:
                    return renderError('Requesting config failed with HTTP code ' + status);
            }
        }
        if (this.responseText.replace(/\W+/g, '') === '') {
            // Just a hint to the user... if you really want an empty panel
            // file, just add a comment
            return renderError('Panel file "conf/' + page + '.html" is empty');
        }
        /* Render the current panel
         */
        createContainer(true);
        try {
            toRemove = $parseTemplate(rendered, this.responseText);
        } catch (e) {
            renderError('Error loading ' + page + ': ' + e);
            throw e;
        }
    }

    return function(panel) {
        let fname = 'conf/' + panel + '.html';
        if (panel === 'example')
            fname = 'conf/' + panel + '.html';
        console.log('Panel request:', fname);
        if (pending !== null) {
            // TODO: deffo cancel if same fname was requested too quickly
            // .abort()
            console.log('Cancelled request for', fname, 'because another request is pending');
            return;
        }

        // XXX
        let frag = panel === 'main' ? '' : ('#' + panel);
        history.replaceState('', document.title,
            location.pathname + location.search + frag);
        //location.hash = panel === 'main' ? '' : panel;

        page = panel;
        pending = new XMLHttpRequest();
        pending.addEventListener('load', loaded);
        pending.open('GET', fname);
        pending.send();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    if (location.hash !== '') {
        $loadPanel(location.hash.replace(/^#/, ''));
    } else {
        $loadPanel('main');
    }
    $ha.connect();
});
