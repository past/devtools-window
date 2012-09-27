/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Cu = Components.utils;
const Ci = Components.interfaces;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/devtools/EventEmitter.jsm");
Cu.import("resource:///modules/devtools/ToolsDefinitions.jsm");

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
   *   type: HostType.[BOTTOM|TAB],
   *   element: ...
   * }
   *
   * Definition of the 'element' property is left as an exercise to the
   * implementor.
   */
  HostType: {
    BOTTOM: "bottom",
    RIGHT: "right",
    WINDOW: "window",
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
  openToolbox: function DT_openToolbox(aTarget, aHostType, aDefaultToolId) {
    if (this._toolboxes.has(aTarget.value)) {
      // only allow one toolbox per target
      return null;
    }

    let tb = new Toolbox(aTarget, aHostType, aDefaultToolId);
    this._toolboxes.set(aTarget, tb);
    tb.open();

    return tb;
  },

  /**
   * Open a toolbox for the given browser tab
   */
  openForTab: function DT_openForTab(tab) {
    let target = {
      type: gDevTools.TargetType.TAB,
      value: tab
    }
    // todo: remember last used host type
    let hostType = gDevTools.HostType.BOTTOM;

    this.openToolbox(target, hostType, "debugger");
  },

  /**
   * Return a map(DevToolsTarget, DevToolBox) of all the Toolboxes
   * map is a copy, not reference (can't be altered)
   */
  getToolBoxes: function DT_getToolBoxes() {
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

/**
 * Register the set of default tools
 */
for (let definition of defaultTools) {
  gDevTools.registerTool(definition)
}

//------------------------------------------------------------------------------

XPCOMUtils.defineLazyModuleGetter(this, "gcli",
                                  "resource:///modules/devtools/gcli.jsm");
Components.utils.import("resource://gre/modules/devtools/Require.jsm");
Components.utils.import("resource://gre/modules/devtools/Console.jsm");

var Requisition = require("gcli/cli").Requisition;

XPCOMUtils.defineLazyGetter(this, "prefBranch", function() {
  var prefService = Components.classes["@mozilla.org/preferences-service;1"]
          .getService(Components.interfaces.nsIPrefService);
  return prefService.getBranch(null)
          .QueryInterface(Components.interfaces.nsIPrefBranch2);
});

/**
 * Read a toolbarSpec from preferences
 */
function getToolbarSpec() {
  var value = prefBranch.getComplexValue(this.name, Ci.nsISupportsString).data;
  return JSON.parse(value);
}

/**
 * A toolbarSpec is an array of buttonSpecs. A buttonSpec is an array of
 * strings each of which is a GCLI command (including args if needed).
 */
function createButtons(toolbarSpec, document) {
  var reply = [];
  var requisition = new Requisition();

  toolbarSpec.forEach(function(buttonSpec) {
    var button = document.createElement("toolbarbutton");
    reply.push(button);

    if (typeof buttonSpec == "string") {
      buttonSpec = { typed: buttonSpec };
    }
    // Ask GCLI to parse the typed string (doesn't execute it)
    requisition.update(buttonSpec.typed);

    // Ignore invalid commands
    var command = requisition.commandAssignment.value;
    if (command == null) {
      // TODO: Have a broken icon
      // button.icon = 'Broken';
      button.label = "Unknown";
      button.tooltip = "Unknown command: " + buttonSpec.typed;
      button.disabled = true;
    }
    else {
      button.icon = command.icon;
      button.tooltip = command.manual;

      button.oncommand = function() {
        requisition.update(buttonSpec.typed);
        if (requisition.getStatus() == Status.VALID) {
          requisition.exec();
        }
        else {
          console.error('incomplete commands not yet supported');
        }
      };
    }
  });
}

/**
 * A "Toolbox" is the component that holds all the tools for one specific
 * target. Visually, it's a document (about:devtools) that includes the tools
 * tabs and all the iframes where the tool instances will be living in.
 */
function Toolbox(aTarget, aHostType, aDefaultToolId) {
  this._target = aTarget;
  this._hostType = aHostType;
  this._defaultToolId = aDefaultToolId;
  this._toolInstances = new Map();

  this._onLoad = this._onLoad.bind(this);
  this._handleEvent = this._handleEvent.bind(this);
  this.destroy = this.destroy.bind(this);

  new EventEmitter(this);

  this.on("tool-registered", this._handleEvent);
  this.on("tool-unregistered", this._handleEvent);
}

Toolbox.prototype = {
  URL: "chrome://browser/content/devtools/framework/toolbox.xul",
  WINDOW_URL: "chrome://browser/content/devtools/framework/toolbox-window.xul",

  _handleEvent: function TB_handleEvent(aEventId, ...args) {
    let toolId;

    switch(aEventId) {
      /**
       * Handler for the tool-registered event.
       * @param  {String} aToolId
       *         The ID of the registered tool.
       */
      case "tool-registered":
        toolId = args[0];

        let defs = gDevTools.getToolDefinitions();
        let tool = defs.get(toolId);

        this._buildTabForTool(tool);
        break;

      /**
       * Handler for the tool-unregistered event.
       * @param  {String} aToolId
       *         The ID of the unregistered tool.
       */
      case "tool-unregistered":
        toolId = args[0];

        let doc = this._frame.contentWindow.document;
        let radio = doc.getElementById("toolbox-tab-" + toolId);
        let panel = doc.getElementById("toolbox-panel-" + toolId);

        if (this._currentToolId == toolId) {
          let nextToolName = null;
          if (radio.nextSibling) {
            nextToolName = radio.nextSibling.getAttribute("toolid");
          }
          if (radio.previousSibling) {
            nextToolName = radio.previousSibling.getAttribute("toolid");
          }
          if (nextToolName) {
            this.selectTool(nextToolName);
          }
        }

        if (radio) {
          radio.parentNode.removeChild(radio);
        }

        if (panel) {
          panel.parentNode.removeChild(panel);
        }

        if (this._toolInstances.has(toolId)) {
          let instance = this._toolInstances.get(toolId);
          instance.destroy();
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
  get hostType() {
    return this._hostType;
  },

  set hostType(aValue) {
    this._hostType = aValue;
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
   * Open the toolbox
   */
  open: function TBOX_open() {
    if (this._hostType == gDevTools.HostType.BOTTOM) {
      this._openBottom();
    }
    else if (this._hostType == gDevTools.HostType.RIGHT) {
      this._openSidebar();
    }
    else if (this._hostType == gDevTools.HostType.WINDOW) {
      this._openWindow();
    }
  },

  _openBottom: function TBOX_openInDock() {
    this._frame = this._createDock();
    this._loadInFrame();
  },

  /**
   * Create the toolbox in the target tab
   */
  _openSidebar: function TBOX_openInTab() {
    this._frame = this._createSidebar();
    this._loadInFrame();
  },

  /**
   * Create the toolbox in a new window
   */
  _openWindow: function TBOX_openInWindow() {
    this._createWindow(function(windowFrame) {
      this._frame = windowFrame;
      this._loadInFrame();
    }
    .bind(this));
  },

  /**
   * switch to a new host for the toolbox
   */
  _changeToHost: function TBOX_changeToHost(hostType) {
    if (hostType == gDevTools.HostType.WINDOW) {
      this._createWindow(function (iframe) {
        this._switchHosts(hostType, iframe);
      }
      .bind(this));
      return;
    }

    let iframe;
    if (hostType == gDevTools.HostType.BOTTOM) {
      iframe = this._createDock();
    }
    else if (hostType == gDevTools.HostType.RIGHT) {
      iframe = this._createSidebar();
    }
    iframe.setAttribute("src", "about:blank");

    this._switchHosts(hostType, iframe);
  },

  /**
   * Switch toolbox to a new host that's already been created
   *
   * @param gDevTools.HostType newHostType
   *        The new host type for the toolbox
   * @param iframe newFrame
   *        The new iframe to load the toolbox into
   */
  _switchHosts: function TBOX_switchHosts(newHostType, newFrame) {
    // make the host the new parent of the toolbox's document
    newFrame.QueryInterface(Components.interfaces.nsIFrameLoaderOwner);
    newFrame.swapFrameLoaders(this._frame);

    // destroy the old UI
    this.destroy();

    this._frame = newFrame;

    let doc = this._frame.contentDocument;
    let dockButton = doc.getElementById("toolbox-dock-" + this._hostType);
    dockButton.checked = false;
    let newButton = doc.getElementById("toolbox-dock-" + newHostType);
    newButton.checked = true;

    this._hostType = newHostType;
  },

  /**
   *  Create the the UI docked to the right of the target tab
   */
  _createSidebar: function TBOX_createSidebar() {
    this._switchToTarget();

    let tab = this._target.value;
    let gBrowser = tab.ownerDocument.defaultView.gBrowser;
    let ownerDocument = gBrowser.ownerDocument;

    this._vertSplitter = ownerDocument.createElement("splitter");
    this._vertSplitter.setAttribute("class", "devtools-vertical-splitter");

    let iframe = ownerDocument.createElement("iframe");
    iframe.height = "200px";

    this._sidebar = gBrowser.getSidebarContainer(tab.linkedBrowser);
    this._sidebar.appendChild(this._vertSplitter);
    this._sidebar.appendChild(iframe);

    return iframe;
  },


  /**
   * Switch to the target tab in the browser
   */
  _switchToTarget: function TBOX_switchToTarget() {
    let tab = this._target.value;
    let browserWindow = tab.ownerDocument.defaultView;
    browserWindow.focus();
    browserWindow.gBrowser.selectedTab = tab;
  },

  /**
   *  Create the docked UI in the target tab to load the toolbox into
   */
  _createDock: function TBOX_createDock() {
    this._switchToTarget();

    let tab = this._target.value;
    let gBrowser = tab.ownerDocument.defaultView.gBrowser;
    let ownerDocument = gBrowser.ownerDocument;

    this._horSplitter = ownerDocument.createElement("splitter");
    this._horSplitter.setAttribute("class", "devtools-horizontal-splitter");

    let iframe = ownerDocument.createElement("iframe");
    iframe.height = "200px";

    this._nbox = gBrowser.getNotificationBox(tab.linkedBrowser);
    this._nbox.appendChild(this._horSplitter);
    this._nbox.appendChild(iframe);

    return iframe;
  },

  /**
   * Load the toolbox into the iframe
   */
  _loadInFrame: function TBOX_loadInWindow() {
    this._frame.addEventListener("DOMContentLoaded", this._onLoad, true);
    this._frame.setAttribute("src", this.URL);
  },

  /**
   * Onload handler for the toolbox's iframe
   */
  _onLoad: function TBOX_onLoad() {
    this._frame.removeEventListener("DOMContentLoaded", this._onLoad, true);

    // add event listeners to the docking buttons
    let doc = this._frame.contentDocument;
    let dockButtons = doc.getElementsByClassName("toolbox-dock-button");
    for (let i = 0; i < dockButtons.length; i++) {
      let button = dockButtons[i];
      button.addEventListener("command", function() {
        let position = button.getAttribute("data-position");
        this._changeToHost(gDevTools.HostType[position]);
      }.bind(this), true);
    }

    let closeButton = doc.getElementById("toolbox-close");
    closeButton.addEventListener("command", this.destroy, true);

    this._buildTabs();

    this.selectTool(this._defaultToolId);
  },

  /**
   * Create a separate devtools window
   */
  _createWindow: function TBOX_createWindow(onLoad) {
    let flags = "chrome,centerscreen,resizable,dialog=no";
    this._window = Services.ww.openWindow(null, this.WINDOW_URL, "_blank",
                                              flags, null);
    let boundLoad = function() {
      this._window.removeEventListener("load", boundLoad, true);
      let frame = this._window.document.getElementById("toolbox-iframe");
      onLoad(frame);
    }
    .bind(this);

    this._window.addEventListener("load", boundLoad, true);
    this._window.focus();
  },

  /**
   * Add tabs to the toolbox UI for registered tools
   */
  _buildTabs: function TBOX_buildTabs() {
    for (let [id, definition] of gDevTools.getToolDefinitions()) {
      this._buildTabForTool(definition);
    }
  },

  _buildTabForTool: function TBOX_buildTabForTool(aToolDefinition) {
    let doc = this._frame.contentDocument;
    let tabs = doc.getElementById("toolbox-tabs");
    let deck = doc.getElementById("toolbox-deck");

    let definition = aToolDefinition;
    let id = definition.id;

    let radio = doc.createElement("radio");
    radio.setAttribute("label", definition.label);
    radio.className = "toolbox-tab devtools-tab";
    radio.id = "toolbox-tab-" + id;
    radio.setAttribute("toolid", id);
    radio.addEventListener("command", function(id) {
      this.selectTool(id);
    }.bind(this, id));

    let vbox = doc.createElement("vbox");
    vbox.className = "toolbox-panel";
    vbox.id = "toolbox-panel-" + id;

    let iframe = doc.createElement("iframe");
    iframe.className = "toolbox-panel-iframe";
    iframe.id = "toolbox-panel-iframe-" + id;
    iframe.setAttribute("toolid", id);
    iframe.setAttribute("flex", 1);

    tabs.appendChild(radio);
    vbox.appendChild(iframe);
    deck.appendChild(vbox);
  },

  /**
   * Switch to the tool with the given id
   *
   * @param string id
   *        The id of the tool to switch to
   */
  selectTool: function TBOX_selectTool(id) {
    let doc = this._frame.contentDocument;
    let tab = doc.getElementById("toolbox-tab-" + id);
    let tabstrip = doc.getElementById("toolbox-tabs");

    // select the right tab
    let index = -1;
    let tabs = tabstrip.childNodes;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i] === tab) {
        index = i;
        break;
      }
    }

    tabstrip.selectedIndex = index;

    // and select the right iframe
    let deck = doc.getElementById("toolbox-deck");
    deck.selectedIndex = index;

    let iframe = doc.getElementById("toolbox-panel-iframe-" + id);
    if (!iframe.toolLoaded) {
      // only build the tab's content if we haven't already
      iframe.toolLoaded = true;

      let definition = gDevTools.getToolDefinitions().get(id);
      let boundLoad = function() {
        iframe.removeEventListener('DOMContentLoaded', boundLoad, true);
        let instance = definition.build(iframe.contentWindow, this.target);
        this._toolInstances.set(id, instance);
      }.bind(this)

      iframe.addEventListener('DOMContentLoaded', boundLoad, true);
      iframe.setAttribute('src', definition.url);
    }

    this._currentToolId = id;
  },

  /**
   * Remove all UI elements, detach from target and clear up
   */
  destroy: function TBOX_destroy() {
    if (this.hostType == gDevTools.HostType.BOTTOM) {
      this._destroyDock();
    }
    else if (this.hostType == gDevTools.HostType.RIGHT) {
      this._destroySidebar();
    }
    else if (this.hostType == gDevTools.HostType.WINDOW) {
      this._destroyWindow();
    }
    this._frame = null;
  },

  /**
   * Clean up and remove the docked toolbox UI
   */
  _destroyDock: function TBOX_destroyWindow() {
    this._nbox.removeChild(this._horSplitter);
    this._nbox.removeChild(this._frame);

    this._horSplitter = null;
    this._nbox = null;
  },

  /**
   * Clean up and remove the docked toolbox UI
   */
  _destroySidebar: function TBOX_destroyWindow() {
    this._sidebar.removeChild(this._vertSplitter);
    this._sidebar.removeChild(this._frame);

    this._vertSplitter = null;
    this._sidebar = null;
  },

  /**
   * Clean up and close the toolbox window
   */
  _destroyWindow: function TBOX_destroyWindow() {
    this._window.close();
  }
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
