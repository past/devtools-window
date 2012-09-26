/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [ "defaultTools" ];

let defaultTools = [
{
  id: "test",
  label: "Tool 1",
  url: "chrome://browser/content/devtools/toolbox/test.html",
  build: function(iframe) {
    dump("build called for test tool\n");
    return {};
  }
},
{
  id: "test2",
  label: "Tool 2",
  url: "chrome://browser/content/devtools/toolbox/test2.html",
  build: function(iframe) {
    dump("build called for test tool\n");
    return {};
  }
},
{
  id: "debugger",
  label: "Debugger",
  url: "chrome://browser/content/debugger.xul",
  build: function(iframe) {
    dump("build called for test tool\n");
    return {};
  }
},
{
  id: "styleeditor",
  label: "Style Editor",
  url: "chrome://browser/content/styleeditor.xul",
  build: function(aIFrameWindow, aTarget) {
    aIFrameWindow.init(aTarget.value.linkedBrowser.contentWindow);
    return aIFrameWindow;
  }
},
];
