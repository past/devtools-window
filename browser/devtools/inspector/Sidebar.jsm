/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// FIXME: some comments maybe?

const Cc = Components.classes;
const Cu = Components.utils;
const Ci = Components.interfaces;

let EXPORTED_SYMBOLS = ["InToolSidebarManager"];

Cu.import("resource:///modules/devtools/EventEmitter.jsm");

function InToolSidebarManager(tabbox, panel) {
  this.tabbox = tabbox;
  this.panelDoc = this.tabbox.ownerDocument;
  this.panel = panel;
}

InToolSidebarManager.prototype = {
  addView: function(url) {
    let tab = this.panelDoc.createElement("tab");
    this.tabbox.tabs.appendChild(tab);

    let iframe = this.panelDoc.createElement("iframe");
    iframe.setAttribute("flex", "1");
    iframe.setAttribute("src", url);

    let onIFrameLoaded = function() {
      tab.setAttribute("label", iframe.contentDocument.title);
      iframe.removeEventListener("DOMContentLoaded", onIFrameLoaded, true);
      iframe.contentWindow.setPanel(this.panel, iframe);
    }.bind(this);
    iframe.addEventListener("DOMContentLoaded", onIFrameLoaded, true);

    let tabpanel = this.panelDoc.createElement("tabpanel");
    tabpanel.appendChild(iframe);
    this.tabbox.tabpanels.appendChild(tabpanel);
  },

  toggle: function() {
    if (this.tabbox.hasAttribute("hidden")) {
      this.show();
    } else {
      this.hide();
    }
  },

  show: function() {
    this.tabbox.removeAttribute("hidden");
  },

  hide: function() {
    this.tabbox.setAttribute("hidden", "true");
  },

  destroy: function() {
    this.tabbox = null;
    this.panelDoc = null;
    this.panel = null;
  },
}
