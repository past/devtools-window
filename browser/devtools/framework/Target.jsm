/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [ "Target" ];

Components.utils.import("resource:///modules/devtools/EventEmitter.jsm");

/**
 * A Target represents something that we can debug. Targets are generally
 * read-only. Any changes that you wish to make to a target should be done via
 * a Tool that attaches to the target. i.e. a Target is just a pointer saying
 * "the thing to debug is over there".
 *
 * Providing a generalized abstraction of a web-page or web-browser (available
 * either locally or remotely) is beyond the scope of this class (and maybe
 * also beyond the scope of this universe) However Target does attempt to
 * abstract some common events and read-only properties common to many Tools.
 *
 * Supported read-only properties:
 * - name, isRemote, isChrome, url
 *
 * Target extends EventEmitter and provides support for the following events:
 * - close: The target window has been closed. All tools attached to this
 *     target should close. This event is not currently cancelable.
 * - navigate: The target window has navigated to a different URL
 *     FIXME: What happens with HTML5 navigation events?
 * - reload: The target window has been refreshed via F5 or a similar mechanism
 * - change: One of the read-only
 *
 * Target also supports 2 functions to help allow 2 different versions of
 * Firefox debug each other. The 'version' property is the equivalent of
 * browser detection - simple and easy to implement but gets fragile when things
 * are not quite what they seem. The 'supports' property is the equivalent of
 * feature detection - harder to setup, but more robust long-term.
 *
 * Comparing Targets: 2 instances of a Target object can point at the same
 * thing, so t1 !== t2 and t1 != t2 even when they represent the same object.
 * To compare to targets use 't1.equals(t2)'.
 */
function Target() {
  throw new Error('Use Target.newXXX or Target.getXXX to create a Target');
}

/**
 * Construct a Target from a local XUL tab
 */
Target.newFromTab = function(tab) {
  let target = Object.create(Target.prototype);
  new EventEmitter(target);

  target.tab = tab;

  target.isRemote = false;
  target.isChrome = false;

  let document = target.tab.linkedBrowser.contentWindow.document;
  target.name = document.title;
  target.url = document.location.href;

  return target;
};

/**
 * The listing counterpart to Target.newFromTab which gets an array of Targets
 * for all available local web pages.
 */
Target.getLocalWebPages = function() {
  let tabs = FixmeLocalThing.getTabs();
  return tabs.map(function(tab) {
    return Target.newFromTab(tab);
  });
};

/**
 * Construct a Target from a local chrome Window
 */
Target.newFromChromeWindow = function(chromeWindow) {
  let target = Object.create(Target.prototype);
  new EventEmitter(target);

  target.chromeWindow = chromeWindow;

  target.isRemote = false;
  target.isChrome = true;

  let document = chromeWindow.content.ownerDocument;
  target.name = document.title;
  target.url = document.location.href;

  return target;
};

/**
 * The listing counterpart to Target.newFromChromeWindow which gets an array of
 * Targets for all available local chrome windows.
 */
Target.getLocalChromeWindows = function() {
  let chromeWindows = [];
  let wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  let en = wm.getXULWindowEnumerator(null);
  while (en.hasMoreElements()) {
    chromeWindows.push(en.getNext());
  }

  return chromeWindows.map(function(chromeWindow) {
    return Target.newFromChromeWindow(chromeWindow);
  });
};

/**
 * Construct a Target from a remote chrome window
 */
Target.newFromRemoteWebPage = function(connection, webPageName) {
  let target = Object.create(Target.prototype);
  new EventEmitter(target);

  target.connection = connection;
  target.webPageName = webPageName;

  target.isRemote = true;
  target.isChrome = false;

  // FIXME: implement
  target.name = '...';
  target.url = '...';

  return target;
};

/**
 * The listing counterpart to Target.newFromRemoteWebPage which gets an array of
 * Targets for all available remote web pages.
 */
Target.getRemoteWebPages = function(connectionOrHost, port) {
  var connection;
  if (typeof connection == "string") {
    connection = FixmeRemoteThing.connect(connectionOrHost, port);
  }
  else {
    connection = connectionOrHost
  }

  let webPageNames = FixmeRemoteThing.getWebPageNames(connection);
  return webPageNames.map(function(webPageName) {
    return Target.newFromRemoteWebPage(connection, webPageName);
  });
};

/**
 * Construct a Target from a remote chrome window
 */
Target.newFromRemoteChromeWindow = function(connection, windowName) {
  let target = Object.create(Target.prototype);
  new EventEmitter(target);

  target.connection = connection;
  target.windowName = windowName;

  target.isRemote = true;
  target.isChrome = true;

  // FIXME: implement
  target.name = '...';
  target.url = '...';

  return target;
};

/**
 * The listing counterpart to Target.newFromRemoteChromeWindow which gets an
 * array of Targets for all available remote chrome windows.
 */
Target.getRemoteChromeWindows = function(connectionOrHost, port) {
  var connection;
  if (typeof connection == "string") {
    connection = FixmeRemoteThing.connect(connectionOrHost, port);
  }
  else {
    connection = connectionOrHost
  }

  let windowNames = FixmeRemoteThing.getChromeWindowNames(connection);
  return windowNames.map(function(windowName) {
    return Target.newFromRemoteChromeWindow(connection, windowName);
  });
};

/**
 * The 'version' property allows the developer tools equivalent of browser
 * detection. Browser detection is evil, however while we don't know what we
 * will need to detect in the future, it is an easy way to postpone work.
 * We should be looking to use 'supports()' in place of version where
 * possible.
 */
Object.defineProperty(Target.prototype, 'version', {
  get: function() {
    // FIXME: return something better
    return 20;
  },
  enumerable: true
});

/**
 * A better way to support feature detection, but we're not yet at a place
 * where we have the features well enough defined for this to make lots of
 * sense.
 */
Target.prototype.supports = function(feature) {
  return false;
};
