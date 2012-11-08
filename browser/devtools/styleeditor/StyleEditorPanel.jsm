/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cu = Components.utils;

this.EXPORTED_SYMBOLS = ["StyleEditorPanel"];

Cu.import("resource:///modules/devtools/EventEmitter.jsm");
Cu.import("resource:///modules/devtools/StyleEditorChrome.jsm");

this.StyleEditorPanel = function StyleEditorPanel(panelWin, toolbox) {
  new EventEmitter(this);

  this.panelWin = panelWin;
  this.panelDoc = panelWin.document;

  let contentWin = toolbox.target.tab.linkedBrowser.contentWindow;
  this.setPage(contentWin);

  this.emit("ready");
}

StyleEditorPanel.prototype = {
  /**
   * Target getter.
   */
  get target() {
    return this._target;
  },

  /**
   * Set the page to target.
   */
  setPage: function StyleEditor_setPage(contentWindow) {
    let chromeRoot = this.panelDoc.getElementById("style-editor-chrome");
    let chrome = new StyleEditorChrome(chromeRoot, contentWindow);
    this.panelWin.styleEditorChrome = chrome;
  },

  /**
   * Select a stylesheet.
   */
  selectStyleSheet: function StyleEditor_selectStyleSheet(stylesheet, line, col) {
    // FIXME
  },

  /**
   * Destroy StyleEditor
   */
  destroy: function StyleEditor_destroy() {
    this.panelWin = null;
    thhis.panelDoc = null;
  },
}

