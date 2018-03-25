# HADash

A customizable Home Assistant dashboard.
Work in progress, expect things to change and break.

![Screenshot](https://raw.githubusercontent.com/Bun/dash/assets/screenshots/simple-theme.png)

While the default theme features a grid of clickable tiles,
the panel markup enables you to freely create arbitrary HTML + CSS + SVG
layouts.
Assign entities to elements and automatically update them when the state of
the entity changes!


TODO:

* Allow script to change properties
* Multimedia buttons
* Some cool graph stuff
* Group entity rendering
* Support "element: button.tile"

* Properties on `<body>` are ignored. The elements in the `<body>` HTML are
  copied into a div with class `dash-container`.

* The old YAML-based markup allowed scriptable templates on elements that
  weren't tied to an entity. Restore this functionality.

* Allow scripts to be execute at start-up / panel unload.


## Installation

The easiest way to deploy this dashboard is to run it under Home Assistant's
built-in webserver.
First, create a directory called `www` in the Home Assistant configuration
directory.
Then copy this directory into the `www` directory.

E.g. if you called the directory `dash`, the dashboard will be accessible
at `https://home-assistant:8123/local/dash/index.html` -- of course, replace
the hostname and port depending on your setup.

You are now ready to modify and create your panels!
Panels must be placed in the `conf` directory.
To get started, copy `example.html` to `main.html` and edit away.

TODO: add support for other setups (not very difficult!)

Caveat: Home Assistant installs a "service worker" that enables HA to load
even when you are offline.
This service worker also implements some rather aggressive caching behavior.
If you are editing panels and styles and changes are not
immediately reflected, try refreshing again to force a reload.


## Configuration

A dashboard panel is defined as an HTML-like page located in the `conf`
directory.  The default panel is called `main.html`.
The HTML syntax has the following properties:

* Elements defined in the `<head>` section of the panel will be copied to the
  page as-is. You can use this to include custom stylesheets.

* The panel definition goes in the `<body>` section.
  Elements that have the `dash-entity` attribute will be (re)rendered every
  time Home Assistant updates the element state/attributes.

* Templates can be created by creating `<dash-template>` elements in `<head>`.
  This way you only have to define repetative code once.
  The template must have an attribute `dash-template-id` that defines its name.
  Refer to the template by setting the `dash-template` attribute on an entity
  element.

* If an element has the `dash-panel` attribute, clicking on that element will
  load the panel that was specified.

* You can use arbitrary HTML elements, with the exception of `<script>`
  elements.
  Scripts that are defined in the `<head>` section will be evaluated before
  *any* template is rendered.
  If a script is defined within an element that has the `dash-entity`
  attribute, it will be evaluated only for that template.


### Template syntax

HADash supports Handlebars templates for entity elements.
The following variables provided by Home Assistant can be used
in these templates:

* `entity_id`
* `state`
* `attributes`

In addition, all the dataset attributes (`data-*`) of the entity element
are also made available.

Some template render helpers are also defined:

* `{{pic IMG}}`: used to render entity images (using
  `attributes.entity_picture`)

* `{{#equals A B}}`: for very simple conditionals inside templates. Use a
  script snippet for more advanced control.

  Example:

        {{#equals state "playing"}}
            {{attributes.media_artist}} - {{attributes.media_title}}
        {{else}}
            Nothing's playing right now!
        {{/equals}}


### Scripts

Script snippets allow you to arbitrarily modify the values provided by Home
Assistant. This can be used to e.g. translate state or attribute values, parse
dates, and so on.
All the variables that can be used in templates can be accessed by script
snippets as well.
These variables are stored in the `vars` object and any modifications made
can then be referenced in the template used to render the final HTML.

Additionally, some helper functions are available in the script snippet:

* `replace(value, kv)`: attempt to translate `value` with the user-defined
  value in the `kv` mapping. If the value is not defined in the mapping, return
  the original value unmodified.

  Example:

        // Creates a new template variable `binary_state`
        vars.binary_state = replace(vars.state, {"on": "1", "off": "0"});

* `parseDate(date)`: parse a date in `YYY-MM-DD` format, returning a standard
  Date object.

  Example:

        // E.g. for sensor.date
        vars.year = parseDate(vars.state).getFullYear();


## Dependencies

* Templates are written using [handlebars](https://handlebarsjs.com/)

* Icons from [FontAwesome](https://fontawesome.com/)
