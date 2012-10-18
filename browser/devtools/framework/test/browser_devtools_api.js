/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests devtools API

const Cu = Components.utils;
const toolId = "test-tool";

let tempScope = {};
Cu.import("resource:///modules/devtools/EventEmitter.jsm", tempScope);
let EventEmitter = tempScope.EventEmitter;

function test() {
  addTab("about:blank", function(aBrowser, aTab) {
    runTests(aTab);
  });
}

function runTests(aTab) {
  let toolDefinition = {
    id: "test-tool",
    killswitch: "devtools.test-tool.enabled",
    url: "about:blank",
    label: "someLabel",
    build: function(iframeWindow, toolbox) {
      let instance = new DevToolInstance(iframeWindow, toolbox);
      instance.on("ready", continueTests);
      return instance;
    },
  };

  ok(gDevTools, "gDevTools exists");
  is(gDevTools.getToolDefinitions().has(toolId), false,
    "The tool is not registered");

  gDevTools.registerTool(toolDefinition);
  is(gDevTools.getToolDefinitions().has(toolId), true,
    "The tool is registered");

  let target = {
    type: gDevTools.TargetType.TAB,
    value: gBrowser.selectedTab
  };

  gDevTools.openToolbox(target, "bottom", toolId);

  let toolBoxes = gDevTools.getToolBoxes(gBrowser.selectedTab);

  let tb = toolBoxes.get(gBrowser.selectedTab);
  is(tb.target, target, "toolbox target is correct");
  is(tb._host.hostTab, gBrowser.selectedTab, "toolbox host is correct");
}

function continueTests() {
  let toolBoxes = gDevTools.getToolBoxes(gBrowser.selectedTab);
  let tb = toolBoxes.get(gBrowser.selectedTab);

  is(tb.currentToolId, toolId, "toolbox _currentToolId is correct");

  let toolDefinitions = gDevTools.getToolDefinitions();
  is(toolDefinitions.has(toolId), true, "The tool is in gDevTools");

  let toolDefinition = toolDefinitions.get(toolId);
  is(toolDefinition.id, toolId, "toolDefinition id is correct");

  gDevTools.unregisterTool(toolId);
  is(gDevTools.getToolDefinitions().has(toolId), false,
    "The tool is no longer registered");

  finishUp();
}

function finishUp() {
  let toolBoxes = gDevTools.getToolBoxes(gBrowser.selectedTab);
  let toolbox = toolBoxes.get(gBrowser.selectedTab);

  toolbox.destroy();
  toolbox = tempScope = null;
  gBrowser.removeCurrentTab();
  finish();
}

/**
* When a Toolbox is started it creates a DevToolInstance for each of the tools
* by calling toolDefinition.build(). The returned object should
* at least implement these functions. They will be used by the ToolBox.
*
* There may be no benefit in doing this as an abstract type, but if nothing
* else gives us a place to write documentation.
*/
function DevToolInstance(iframeWindow, toolbox) {
  new EventEmitter(this);

  this._toolbox = toolbox;

  let parentDoc = iframeWindow.document.defaultView.parent.document;
  let iframe = parentDoc.querySelector('#toolbox-panel-iframe-test-tool');
  let doc = iframe.contentDocument;
  let label = doc.createElement("label");
  let textNode = doc.createTextNode("Some Tool");

  label.appendChild(textNode);
  doc.body.appendChild(label);

  executeSoon(function() {
    this.emit("ready");
  }.bind(this));
}

DevToolInstance.prototype = {
  get target() this._toolbox.target,

  destroy: function DTI_destroy()
  {

  },
};
