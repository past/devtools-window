/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

const EXPORTED_SYMBOLS = [ "Hosts" ];

let Hosts = {
  "bottom": BottomHost,
  "right": RightHost,
  "window": WindowHost
}

/**
 * Host object for the dock on the bottom of the browser
 */
function BottomHost(hostTab) {
  this.hostTab = hostTab;
}

BottomHost.prototype = {
  /**
   * Create a box at the bottom of the host tab and call a callback with
   * The iframe to populate the toolbox in.
   *
   * @param {function} callback
   *        Callback called when the UI has been created, the iframe
   *        is the first argument to the callback.
   */
  createUI: function BH_create(callback) {
    let gBrowser = this.hostTab.ownerDocument.defaultView.gBrowser;
    let ownerDocument = gBrowser.ownerDocument;

    this._splitter = ownerDocument.createElement("splitter");
    this._splitter.setAttribute("class", "devtools-horizontal-splitter");

    this.frame = ownerDocument.createElement("iframe");
    this.frame.height = "200px";

    this._nbox = gBrowser.getNotificationBox(this.hostTab.linkedBrowser);
    this._nbox.appendChild(this._splitter);
    this._nbox.appendChild(this.frame);

    let boundLoad = function() {
      this.frame.removeEventListener("DOMContentLoaded", boundLoad, true)
      callback(this.frame);
    }.bind(this);

    this.frame.addEventListener("DOMContentLoaded", boundLoad, true);
    this.frame.setAttribute("src", "about:blank");

    focusTab(this.hostTab);
  },

  /**
   * Destroy the bottom dock
   */
  destroyUI: function BH_destroy() {
    this._nbox.removeChild(this._splitter);
    this._nbox.removeChild(this.frame);
  }
}


/**
 * Host object for the sidebar on the right of the browser
 */
function RightHost(hostTab) {
  this.hostTab = hostTab;
}

RightHost.prototype = {
  /**
   * Create a box at the right side of the host tab and call a callback with
   * The iframe to populate the toolbox in.
   *
   * @param {function} callback
   *        Callback called when the UI has been created, the iframe
   *        is the first argument to the callback.
   */
  createUI: function RH_create(callback) {
    let gBrowser = this.hostTab.ownerDocument.defaultView.gBrowser;
    let ownerDocument = gBrowser.ownerDocument;

    this._splitter = ownerDocument.createElement("splitter");
    this._splitter.setAttribute("class", "devtools-vertical-splitter");

    this.frame = ownerDocument.createElement("iframe");
    this.frame.height = "200px";

    this._sidebar = gBrowser.getSidebarContainer(this.hostTab.linkedBrowser);
    this._sidebar.appendChild(this._splitter);
    this._sidebar.appendChild(this.frame);

    let boundLoad = function() {
      this.frame.removeEventListener("DOMContentLoaded", boundLoad, true)
      callback(this.frame);
    }.bind(this);

    this.frame.addEventListener("DOMContentLoaded", boundLoad, true);
    this.frame.setAttribute("src", "about:blank");

    focusTab(this.hostTab);
  },

  /**
   * Destroy the sidebar
   */
  destroyUI: function RH_destroy() {
    this._sidebar.removeChild(this._splitter);
    this._sidebar.removeChild(this.frame);
  }
}

/**
 * Host object for the toolbox in a separate window
 */
function WindowHost() {

}

WindowHost.prototype = {
  WINDOW_URL: "chrome://browser/content/devtools/framework/toolbox-window.xul",

  /**
   * Create a new xul window and call a callback with the iframe to
   * populate the toolbox in.
   *
   * @param {function} callback
   *        Callback called when the UI has been created, the iframe
   *        is the first argument to the callback.
   */
  createUI: function(callback) {
    let flags = "chrome,centerscreen,resizable,dialog=no";
    let win = Services.ww.openWindow(null, this.WINDOW_URL, "_blank",
                                     flags, null);

    win.addEventListener("load", function onLoad() {
      win.removeEventListener("load", onLoad, true);
      this.frame = win.document.getElementById("toolbox-iframe");
      callback(this.frame);
    }
    .bind(this), true);

    win.focus();

    this._window = win;
  },


  /**
   * Destroy the window
   */
  destroyUI: function() {
    this._window.close();
  }
}


/**
 *  Switch to the given tab in a browser and focus the browser window
 */
function focusTab(tab) {
  let browserWindow = tab.ownerDocument.defaultView;
  browserWindow.focus();
  browserWindow.gBrowser.selectedTab = tab;
}
