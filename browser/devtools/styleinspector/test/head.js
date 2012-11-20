/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let tempScope = {};
Cu.import("resource:///modules/devtools/CssLogic.jsm", tempScope);
Cu.import("resource:///modules/devtools/CssHtmlTree.jsm", tempScope);
Cu.import("resource:///modules/devtools/gDevTools.jsm", tempScope);
let ConsoleUtils = tempScope.ConsoleUtils;
let CssLogic = tempScope.CssLogic;
let CssHtmlTree = tempScope.CssHtmlTree;
let gDevTools = tempScope.gDevTools;

function log(aMsg)
{
  dump("*** WebConsoleTest: " + aMsg + "\n");
}

let tab, browser, hudId, hud, hudBox, filterBox, outputNode, cs;

function addTab(aURL)
{
  gBrowser.selectedTab = gBrowser.addTab();
  content.location = aURL;
  tab = gBrowser.selectedTab;
  browser = gBrowser.getBrowserForTab(tab);
}

function openInspector(callback)
{
  let tab = gBrowser.selectedTab;
  let inspector = gDevTools.getPanelForTarget("inspector", tab);
  if (inspector && inspector.isReady) {
    callback(inspector);
  } else {
    let toolbox = gDevTools.openToolboxForTab(tab, "inspector");
    toolbox.once("inspector-ready", function(event, panel) {
      let inspector = gDevTools.getPanelForTarget("inspector", tab);
      callback(inspector);
    });
  }
}

function addStyle(aDocument, aString)
{
  let node = aDocument.createElement('style');
  node.setAttribute("type", "text/css");
  node.textContent = aString;
  aDocument.getElementsByTagName("head")[0].appendChild(node);
  return node;
}

function finishTest()
{
  finish();
}

function tearDown()
{
  try {
    gDevTools.closeToolbox(gBrowser.selectedTab);
  }
  catch (ex) {
    log(ex);
  }
  while (gBrowser.tabs.length > 1) {
    gBrowser.removeCurrentTab();
  }
  tab = browser = hudId = hud = filterBox = outputNode = cs = null;
}

function getComputedView(inspector) {
  return inspector.sidebar.getWindowForTab("computedview").computedview.view;
}

function ruleView()
{
  return inspector.sidebar.getWindowForTab("ruleview").ruleview.view;
}

function waitForEditorFocus(aParent, aCallback)
{
  aParent.addEventListener("focus", function onFocus(evt) {
    if (inplaceEditor(evt.target) && evt.target.tagName == "input") {
      aParent.removeEventListener("focus", onFocus, true);
      let editor = inplaceEditor(evt.target);
      executeSoon(function() {
        aCallback(editor);
      });
    }
  }, true);
}

function waitForEditorBlur(aEditor, aCallback)
{
  let input = aEditor.input;
  input.addEventListener("blur", function onBlur() {
    input.removeEventListener("blur", onBlur, false);
    executeSoon(function() {
      aCallback();
    });
  }, false);
}

registerCleanupFunction(tearDown);

waitForExplicitFinish();

