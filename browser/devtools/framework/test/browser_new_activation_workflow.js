/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests devtools API

const Cu = Components.utils;

function test() {
  addTab("about:blank", function(aBrowser, aTab) {
    runTests(aTab);
  });
}

function runTests(aTab) {
  ok(gDevTools, "gDevTools exists");

  finishUp();
}

function finishUp() {
  let toolBoxes = gDevTools.getToolBoxes(gBrowser.selectedTab);
  let toolbox = toolBoxes.get(gBrowser.selectedTab);

  toolbox.destroy();
  toolbox = null;
  gBrowser.removeCurrentTab();
  finish();
}
