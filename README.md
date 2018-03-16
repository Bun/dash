# HADash

A customizable Home Assistant dashboard.
Work in progress.

![Screenshot](https://raw.githubusercontent.com/Bun/dash/assets/screenshots/simple-theme.png)

Features:

* Clickable tile-buttons
* Tile contents with support for templating

TODO:

* Multimedia buttons
* Some cool graph stuff
* Group entity rendering
* Support "element: button.tile"


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

TODO: add support for other setups (not very difficult!)


## Configuration

A dashboard panel consists of a YAML-based configuration file located in the
`conf` directory. The default file is called `main.yaml`.
The panel is defined as a tree of elements that closely reflects the HTML
that will be produced.

Three types of elements can be defined:

* `entity`: Elements that are linked to a single entity. Every time the state
  of the entity changes, its template is rendered and its dataset properties
  are updated.

* `panel`: Provides a button which can be used to load another panel.

* `element`: generic elements, used to build the structure of the document.
  These elements do not have an entity associated with them and will never be
  updated.
  Note that defining the `element` property for a panel or entity element
  overrides their default element type.

Every element can also include any of the following properties:

* `element`: controls the element tag name
* `display`: defines the template for how the text of the element itself is
  rendered
* `template`: select a template (alternative to `display`)
* `vars`: additional static variables to be used in a script or template
* `children`: a list of elements rendered as children of this element
* `class`: sets the class attribute
* `style`: sets the style attribute
* `title`: sets the title attribute
* `dataset`: each key-value pair defined under dataset will be defined as
  dataset attribute



### Templates

The following variables provided by Home Assistant can be used:

* `entity_id`
* `state`
* `attributes`

Template render helpers:

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



### Global options

You can include panel configuration options at the start of the YAML file.
The configuration options consists of arbitrary key-value pairs, which you can
also use in your own script snippets.

Annotated example:

    # Panel configuration

    # Controls which element is used by default for e.g. entity tiles.
    defaultElement: tile

    # A script snippet that is executed before a template is rendered.
    script: |
        console.log("The following vars are available to me:", vars);
        vars.demo = "Hello world!";

    template:
        mytemplate: |
            <p>The thing is currently {{state}}!


### Scripts

Script snippets allow you to arbitrarily modify the values provided by Home
Assistant. This can be used to e.g. translate state or attribute values, parse
dates, and so on.
All the variables that can be used in templates can be accessed by script
snippets as well.
Variables stored in the `vars` object can then be referenced in the template
used in the display.

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

* The configuration is written in YAML, which requires
  [js-yaml](https://github.com/nodeca/js-yaml)

* Templates are written using [handlebars](https://handlebarsjs.com/)

* Icons from [FontAwesome](https://fontawesome.com/)
