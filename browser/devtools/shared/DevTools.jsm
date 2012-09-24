/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/devtools/EventEmitter.jsm");

const EXPORTED_SYMBOLS = [ "gDevTools" ];

/**
 * gDevTools is a singleton that controls Firefox Developer Tools.
 *
 * It is an instance of a DevTools class that holds a set of tools. This lets us
 * have alternative sets of tools, for example to allow a Firebug type
 * alternative. It has the same lifetime as the browser.
 */
function DevTools() {
  this._tools = new Map();
  this._toolboxes = new Map();

  new EventEmitter(this);
}

DevTools.prototype = {
  /**
   * A Toolbox target is an object with this shape:
   * {
   *   type: TargetType.[TAB|REMOTE|CHROME],
   *   value: ...
   * }
   *
   * When type = TAB, then 'value' contains a XUL Tab
   * When type = REMOTE, then 'value' contains an object with host and port
   *   properties, for example:
   *   { type: TargetType.TAB, value: { host: 'localhost', port: 4325 } }
   * When type = CHROME, then 'value' contains a XUL window
   */
  TargetType: {
    TAB: "tab",
    REMOTE: "remote",
    CHROME: "chrome"
  },

  /**
   * The developer tools can be 'hosted' either embedded in a browser window, or
   * in a separate tab. Other hosts may be possible here, like a separate XUL
   * window. A Toolbox host is an object with this shape:
   * {
   *   type: HostType.[IN_BROWSER|TAB],
   *   element: ...
   * }
   *
   * Definition of the 'element' property is left as an exercise to the
   * implementor.
   */
  HostType: {
    IN_BROWSER: "browser",
    TAB: "tab"
  },

  ToolEvent: {
    TOOLREADY: "devtools-tool-ready",
    TOOLHIDE: "devtools-tool-hide",
    TOOLSHOW: "devtools-tool-show",
    TOOLCLOSED: "devtools-tool-closed",
    TOOLBOXREADY: "devtools-toolbox-ready",
    TOOLBOXCLOSED: "devtools-toolbox-closed",
  },

  /**
   * Register a new developer tool.
   *
   * A definition is a light object that holds different information about a
   * developer tool. This object is not supposed to have any operational code.
   * See it as a "manifest".
   * The only actual code lives in the build() function, which will be used to
   * start an instance of this tool.
   *
   * Each toolDefinition has the following properties:
   * - id: Unique identifier for this tool (string|required)
   * - killswitch: Property name to allow us to turn this tool on/off globally
   *               (string|required) (TODO: default to devtools.{id}.enabled?)
   * - icon: URL pointing to a graphic which will be used as the src for an
   *         16x16 img tag (string|required)
   * - url: URL pointing to a XUL/XHTML document containing the user interface
   *        (string|required)
   * - label: Localized name for the tool to be displayed to the user
   *          (string|required)
   * - build: Function that takes a single parameter, a frame, which has been
   *          populated with the markup from |url|. And returns an instance of
   *          ToolInstance (function|required)
   */
  registerTool: function DT_registerTool(aToolDefinition) {
    let toolId = aToolDefinition.id;

    aToolDefinition.killswitch = aToolDefinition.killswitch ||
      "devtools." + toolId + ".enabled";
    this._tools.set(toolId, aToolDefinition);

    for (let [key, toolbox] of this._toolboxes) {
      toolbox.emit("tool-registered", toolId);
    }
  },

  /**
   * Removes all tools that match the given |aToolId|
   * Needed so that add-ons can remove themselves when they are deactivated
   */
  unregisterTool: function DT_unregisterTool(aToolId) {
    this._tools.delete(aToolId);

    for (let [key, toolbox] of this._toolboxes) {
      toolbox.emit("tool-unregistered", aToolId);
    }
  },

  /**
   * Allow ToolBoxes to get at the list of tools that they should populate
   * themselves with
   */
  getToolDefinitions: function DT_getToolDefinitions() {
    let tools = new Map();

    for (let [key, value] of this._tools) {
      let enabled;

      try {
        enabled = Services.prefs.getBoolPref(value.killswitch);
      } catch(e) {
        enabled = true;
      }

      if (enabled) {
        tools.set(key, value);
      }
    }
    return tools;
  },

  /**
   * Create a toolbox to debug aTarget using a window displayed in aHostType
   * (optionally with aDefaultToolId opened)
   */
  openToolbox: function DT_openToolbox(aTarget, aHost, aDefaultToolId) {
    if (this._toolboxes.has(aTarget.value)) {
      // only allow one toolbox per target
      return null;
    }

    let tb = new Toolbox(aTarget, aHost, aDefaultToolId);
    this._toolboxes.set(aTarget, tb);
    tb.open();

    return tb;
  },

  /**
   * Return a map(DevToolsTarget, DevToolBox) of all the Toolboxes
   * map is a copy, not reference (can't be altered)
   */
  getToolBoxes: function DT_getToolBoxes(x) {
    let toolboxes = new Map();

    for (let [key, value] of this._toolboxes) {
      toolboxes.set(key, value);
    }
    return toolboxes;
  },

  destroy: function DT_destroy() {
    delete this._tools;
    delete this._toolboxes;
  },
};

/**
 * The set of tools contained in each Firefox Developer Tools window. We need to
 * create it here so that the object exports correctly.
 */
const gDevTools = new DevTools();

//------------------------------------------------------------------------------

/**
 * A "Toolbox" is the component that holds all the tools for one specific
 * target. Visually, it's a document (about:devtools) that includes the tools
 * tabs and all the iframes where the tool instances will be living in.
 */
function Toolbox(aTarget, aHost, aDefaultToolId) {
  this._target = aTarget;
  this._host = aHost;
  this._defaultToolId = aDefaultToolId;
  this._currentToolId = this._defaultToolId;
  this._toolInstances = new Map();

  this._onLoad = this._onLoad.bind(this);
  this._handleEvent = this._handleEvent.bind(this);

  new EventEmitter(this);

  this.on("tool-registered", this._handleEvent);
  this.on("tool-unregistered", this._handleEvent);

  for (let [toolId, tool] of gDevTools.getToolDefinitions()) {
    let instance = tool.build();
    this._toolInstances.set(toolId, instance);
  }
}

Toolbox.prototype = {
  URL: "chrome://browser/content/devtools/toolbox/toolbox.xul",

  _handleEvent: function TB_handleEvent(aEventId, ...args) {
    let toolId;

    switch(aEventId) {
      /**
       * Handler for the tool-registered event.
       * @param  {String} aToolId
       *         The ID of the registered tool.
       */
      case "tool-registered":
        let defs = gDevTools.getToolDefinitions();
        let tool = defs.get(toolId);

        toolId = args[0];

        // tool may not exist if the killswitch is set to false.
        if (tool) {
          let instance = tool.build();
          this._toolInstances.set(toolId, instance);
        }
        break;

      /**
       * Handler for the tool-unregistered event.
       * @param  {String} aToolId
       *         The ID of the unregistered tool.
       */
      case "tool-unregistered":
        toolId = args[0];

        if (this._toolInstances.has(toolId)) {
          this._toolInstances.delete(toolId);
        }
        break;
    }
  },

  /**
   * Returns a *copy* of the _toolInstances collection.
   */
  getToolInstances: function TB_getToolInstances() {
    let instances = new Map();

    for (let [key, value] of this._toolInstances) {
      instances.set(key, value);
    }
    return instances;
  },

  /**
   * Get/alter the target of a Toolbox so we're debugging something different.
   * See TargetType for more details.
   * TODO: Do we allow |toolbox.target = null;| ?
   */
  get target() {
    return this._target;
  },

  set target(aValue) {
    this._target = aValue;
  },

  /**
   * Get/alter the host of a Toolbox, i.e. is it in browser or in a separate
   * tab. See HostType for more details.
   */
  get host() {
    return this._host;
  },

  set host(aValue) {
    this._host = aValue;
  },

  /**
   * Get/alter the currently displayed tool.
   */
  get currentToolId() {
    return this._currentToolId;
  },

  set currentToolId(aValue) {
    this._currentToolId = aValue;
  },

  /**
   * Opens the toolbox
   */
  open: function TBOX_open() {
    if (this._host.type == gDevTools.HostType.IN_BROWSER) {
      let hostTab = this._host.element;
      let gBrowser = hostTab.ownerDocument.defaultView.window.gBrowser;
      let ownerDocument = gBrowser.ownerDocument;

      this._splitter = ownerDocument.createElement("splitter");
      this._splitter.setAttribute("class", "devtools-horizontal-splitter");

      this._frame = ownerDocument.createElement("iframe");
      this._frame.height = "200px";

      this._nbox = gBrowser.getNotificationBox(hostTab.linkedBrowser);
      this._nbox.appendChild(this._splitter);
      this._nbox.appendChild(this._frame);

      this._frame.addEventListener("DOMContentLoaded", this._onLoad, true);
      this._frame.setAttribute("src", this.URL);
    }
  },

  /**
   * Onload handler for the toolbox's iframe
   */
  _onLoad: function TBOX_onLoad() {
    this._frame.removeEventListener("DOMContentLoaded", this._onLoad, true);

    this._doc = this._frame.contentDocument;
    this._buildTabs();

    this.selectTool(this._defaultToolId);
  },

  /**
   * Add tabs to the toolbox UI for registered tools
   */
  _buildTabs: function TBOX_buildTabs() {
    let tabs = this._doc.getElementById("toolbox-tabs");
    let deck = this._doc.getElementById("toolbox-deck");

    for (let [id, definition] of gDevTools.getToolDefinitions()) {
      let radio = this._doc.createElement("radio");
      radio.setAttribute('label',definition.label);
      radio.className = "toolbox-tab"
      radio.id = "toolbox-tab-" + id;
      // todo: accessibility
      radio.addEventListener("click", function() {
        this._selectTool(id);
      })

      let vbox = this._doc.createElement("vbox");
      vbox.className = "toolbox-panel";
      vbox.id = "toolbox-panel-" + id;

      let iframe = this._doc.createElement('iframe');
      iframe.className = "toolbox-panel-iframe";
      iframe.id = "toolbox-panel-iframe-" + id;
      iframe.setAttribute("flex", 1);

      tabs.appendChild(radio);
      vbox.appendChild(iframe);
      deck.appendChild(vbox);
    }
  },

  /**
   * Switch to the tool with the given id
   */
  selectTool: function(id) {
    let tab = this._doc.getElementById("toolbox-tab-" + id);
    let tabstrip = this._doc.getElementById("toolbox-tabs");

    let index = -1;
    let tabs = tabstrip.childNodes;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i] == tab) {
        index = i;
      }
    }
    tabstrip.selectedIndex = index;

    let deck = this._doc.getElementById("toolbox-deck");
    deck.selectedIndex = index;

    let iframe = this._doc.getElementById("toolbox-panel-iframe-" + id);
    if (!iframe.toolLoaded) {
      // build the tab's content if we haven't already
      iframe.toolLoaded = true;

      let definition = gDevTools.getToolDefinitions().get(id);

      iframe.addEventListener('DOMContentLoaded', function() {
        let instance = definition.build(iframe);
        this._toolInstances.set(id, instance);
      }.bind(this), true);

      iframe.setAttribute('src', definition.url);
    }
  },

  /**
   * Remove all UI elements, detach from target and clear up
   */
  destroy: function TBOX_destroy() {
    this._nbox.removeChild(this._splitter);
    this._nbox.removeChild(this._frame);

    this._splitter = null;
    this._frame = null;
    this._nbox = null;
    this._doc = null;
  },
};

//------------------------------------------------------------------------------

/**
 * When a Toolbox is started it creates a DevToolInstance for each of the tools
 * by calling toolDefinition.build(). The returned object should
 * at least implement these functions. They will be used by the ToolBox.
 *
 * There may be no benefit in doing this as an abstract type, but if nothing
 * else gives us a place to write documentation.
 */
function DevToolInstance(aTarget, aId) {
  this._target = aTarget;
  this._id = aId;
}

DevToolInstance.prototype = {
  /**
   * Get the target of a Tool so we're debugging something different.
   * TODO: Not sure about that. Maybe it's the ToolBox's job to destroy the tool
   * and start it again with a new target.
   * JOE: If we think that, does the same go for Toolbox? I'm leaning towards
   * Keeping these in both cases. Either way I like symmetry.
   * Certainly target should be read-only to the public or we could have
   * one tool in a toolbox having a different target to the others
   */
  get target() {
    return this._target;
  },

  set target(aValue) {
    this._target = aValue;
  },

  /**
   * Get the type of this tool.
   * TODO: If this function isn't used then it should be removed
   */
  get id() {
    return this._id;
  },

  set id(aValue) {
    this._id = value;
  },

  /**
   * The Toolbox in which this Tool was hosted has been closed, possibly due to
   * the target being closed. We should clear-up.
   */
  destroy: function DTI_destroy() {

  },
};
