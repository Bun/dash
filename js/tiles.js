/* Tiled dashboard rendering
 *
 * Copyright 2017-2018  Ben de Graaff <ben@nx3d.org>
 * MIT license.
 */

var R_TEMPLATE = /{{/;

var $scriptEval = (function() {
    // Helpers
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

    return function(script, config, vars) {
        eval(script);
    };
})();

function buildConfig(config) {
    function setDefault(key, value) {
        if (config[key] === undefined)
            config[key] = value;
    }
    setDefault('style', 'css/theme-white.css');
    setDefault('defaultElement', 'button');
    setDefault('defaultTemplate', '{{attributes.friendly_name}} {{state}}');
    setDefault('templates', {});
    return config;
}

function renderTileScreen(rendered, config, docs) {
    "use strict";

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

    function setupButtonClicker(req, elem) {
        var cval, ival, called, incr, attr;
        var once = function() {
            called = true;
            cval += incr;
            var attrs = {};
            attrs[attr] = cval;
            $ha.setAttributes(req.entity, attrs);
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
            console.log('Clicked attribute', req.entity, attr);
            called = false;
            incr = +e.target.dataset.incr;
            cval = $ha.getAttribute(req.entity, attr);
            ival = setInterval(once, 400);
            activeHold = release;
        }
        function buttonClick(e) {
            var state = $ha.entities[req.entity].state;
            console.log('Clicked', req.entity,
                'current state:', state, 'cancel:', cancelClick);
            if (cancelClick)
                return;
            if (state === 'on') {
                $ha.setState(req.entity, 'off');
            } else if (state === 'off') {
                $ha.setState(req.entity, 'on');
            }
        }
        elem.addEventListener('click', buttonClick);
        elem.addEventListener('mousedown', attributeClick);
    }

    function setupPanelSwitch(panel, elem) {
        elem.addEventListener('click', function() {
            loadConfig(panel);
        });
    }

    function smartControls(eid, elem) {
        return;
        if (eid.startsWith('light.')) {
            elem.classList.add('smart-light');
            console.log('Auto-setup light', eid);
            let minus = document.createElement('button');
            minus.className = 'attr-btn';
            minus.textContent = '-';
            attributeButton(minus, eid, 'brightness', -10, -25);
            let plus = document.createElement('button');
            plus.className = 'attr-btn';
            plus.textContent = '+';
            attributeButton(plus, eid, 'brightness', 10, 25);
            elem.insertBefore(plus, elem.firstChild);
            elem.appendChild(minus);
            return function(val) {
                if (val.state !== 'on') {
                    //
                } else {
                    //let pct = ((100 * val.attributes.brightness) / 255) | 0;
                    //value.textContent = pct + '%';
                }
            };
        }
    }

    Handlebars.registerHelper('equals', function(a, b, options) {
        if (a == b) {
            return options.fn(this);
        }
        return options.inverse(this);
    });

    // Must be YYYY-MM-DD format
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

    Handlebars.registerHelper('pic', function(path) {
        if (!path)
            return '';
        var url = Handlebars.escapeExpression($ha.url + path);
        return new Handlebars.SafeString('<img src="' + url + '">');
    });

    function renderTemplate(elem, view, template, script) {
        try {
            if (config.script) {
                $scriptEval(config.script, config, view);
            }
            if (script) {
                $scriptEval(script, config, view);
            }
            if (template instanceof Function)
                elem.innerHTML = template(view);
            else if (template !== undefined)
                elem.innerHTML = template;
        } catch (e) {
            console.error(e);
            elem.textContent = e;
        }
    }

    function setupEntityRender(req, elem, display, template) {
        var eid = req.entity;
        var renderFunc = function(eid, val) {
            var view = {};
            for (var k in val)
                view[k] = val[k];
            if (req.vars) {
                for (var k in req.vars)
                    view[k] = req.vars[k];
            }
            elem.dataset.state = val.state;
            elem.title = eid.replace(/.+\./, '') + ': ' + val.state;
            renderTemplate(display, view, template, req.script);
        };
        $ha.addEvent(eid, renderFunc);
        if ($ha.entities[eid] !== undefined && $ha.entities[eid].state !== undefined) {
            renderFunc(eid, $ha.entities[eid]);
        }
    }

    // TODO: allow properties to be merged (template and entity), and
    // scriptable
    function setProperties(elem, props) {
        var propnames = ['class', 'style', 'title'];
        for (let name of propnames) {
            if (props[name] !== undefined) {
                elem.setAttribute(name, props[name]);
            }
        }
        if (props.dataset !== undefined) {
            for (let k in props.dataset) {
                elem.dataset[k] = props.dataset[k]
            }
        }
    }

    function recursiveRender(root, elements) {
        for (let req of elements) {
            let tagName = req.element !== undefined ? req.element : config.defaultElement;
            let elem = document.createElement(tagName);
            let displayElem;
            let template = config.templates[req.template] || {};

            if (!template instanceof Object)
                template = {display: template};

            let display = req.display || template.display;
            if (req.entity !== undefined && display === undefined) {
                display = config.defaultTemplate;
            }

            let script = req.script || template.script;
            const hasTemplate = display && display.match(R_TEMPLATE);

            if (req.children && hasTemplate) {
                // Dumping the display text into its own element is the easiest
                // way of dealing with re-rendering.  Not likely to happen
                // anyway.
                displayElem = document.createElement('display');
                elem.appendChild(displayElem);
            } else {
                displayElem = elem;
            }

            setProperties(elem, template);
            setProperties(elem, req);
            if (hasTemplate)
                display = Handlebars.compile(display);

            if (req.entity === undefined || !hasTemplate)
                renderTemplate(displayElem, {}, display, req.script);

            if (req.entity !== undefined) {
                var patched = {entity: req.entity};
                patched.script = (template.script || '') + (req.script || '');
                patched.vars = req.vars || template.vars; // TODO: merge
                elem.dataset.entity = req.entity;
                setupButtonClicker(req, elem);
                setupEntityRender(patched, elem, displayElem, display);
            }

            if (req.panel !== undefined) {
                // Panel switcher
                setupPanelSwitch(req.panel, elem);
            }

            if (req.children !== undefined) {
                recursiveRender(elem, req.children);
            }

            if (req.on !== undefined && req.on.click !== undefined) {
                // Fun times
                elem.setAttribute('onclick', req.on.click);
            }
            root.appendChild(elem);
        }
    }

    $ha.clearEvents();
    for (let doc of docs) {
        recursiveRender(rendered, doc);
    }
}

var loadConfig = (function() {
    var pending = null,
        page = null,
        success = false;
    var rendered = null;
    var styler = document.getElementById('hadash-theme');
    if (!styler) {
        console.warn('Theming disabled because there is no stylesheet' +
            ' element with ID hadash-theme');
    }

    function loaded() {
        if (pending.readyState !== 4)
            return
        if (pending.status !== 200) {
            // TODO: show error
            console.log('Requesting config failed with code', pending.status);
            return;
        }
        /* Render the current panel
         */
        success = true;
        if (rendered !== null) {
            rendered.remove();
        }
        rendered = document.createElement('div');
        rendered.className = 'dash-container';
        document.body.appendChild(rendered);
        try {
            var docs = jsyaml.safeLoadAll(this.responseText);
            var config = buildConfig(docs.length > 1 ? docs.shift() : {});
            if (styler && config.style) {
                styler.href = config.style;
            }
            renderTileScreen(rendered, config, docs);
        } catch (e) {
            var error = document.createElement('p');
            error.style.background = '#cc0000';
            error.style.color = 'white';
            error.style.padding = '10px 15px';
            error.style.margin = '10px 15px';
            error.textContent = 'Error loading ' + page + ': ' + e;
            rendered.appendChild(error);
            throw e;
        }
        pending = null;
        if (!success && page !== 'main') {
            loadConfig('main');
        }
    }

    return function loadConfig(panel) {
        let fname = 'conf/' + panel + '.yaml';
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
        pending.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        pending.setRequestHeader('cache-control', 'max-age=0');
        pending.setRequestHeader('expires', '0');
        pending.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        pending.setRequestHeader('pragma', 'no-cache');
        pending.send();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    if (location.hash !== '') {
        loadConfig(location.hash.replace(/^#/, ''));
    } else {
        loadConfig('main');
    }
    $ha.connect();
});
