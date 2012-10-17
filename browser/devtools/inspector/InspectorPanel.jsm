/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Cu = Components.utils;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["InspectorPanel"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/devtools/MarkupView.jsm");
Cu.import("resource:///modules/devtools/EventEmitter.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/devtools/gDevTools.jsm");
Cu.import("resource:///modules/devtools/Selection.jsm");
Cu.import("resource:///modules/devtools/Breadcrumbs.jsm");
Cu.import("resource:///modules/devtools/Highlighter.jsm");

/**
 * Represents an open instance of the Inspector for a tab.
 * This is the object handed out to sidebars and other API consumers.
 */
function InspectorPanel(iframeWindow, toolbox) {
  this.target = toolbox.target;

  if (this.target.type == DevTools.TargetType.REMOTE) {
    throw "Unsupported target";
  }

  this.tabTarget = (this.target.type == DevTools.TargetType.TAB);
  this.chromeTarget = (this.target.type == DevTools.TargetType.CHROME);

  new EventEmitter(this);

  this.panelDoc = iframeWindow.document;
  this.panelWin = iframeWindow;
  this.panelWin.inspector = this;

  // Create an empty selection
  this._selection = new Selection();
  this.onNewSelection = this.onNewSelection.bind(this);
  this.selection.on("new-node", this.onNewSelection);

  this.breadcrumbs = new HTMLBreadcrumbs(this.selection, this.panelWin, this.panelDoc);

  if (this.tabTarget) {
    this.buildButtonsTooltip();
    this.highlighter = new Highlighter(this.selection, this.target.value, this.panelDoc);
    let button = this.panelDoc.getElementById("inspector-inspect-toolbutton");
    button.hidden = false;
    this.updateInspectorButton = function() {
      if (this.highlighter.locked) {
        button.removeAttribute("checked");
      } else {
        button.setAttribute("checked", "true");
      }
    }.bind(this);
    this.highlighter.on("locked", this.updateInspectorButton);
    this.highlighter.on("unlocked", this.updateInspectorButton);
  }

  this._initMarkup();
  this.isReady = false;

  this.once("markuploaded", function() {
    this.isReady = true;

    // All the components are initialized. Let's select a node.
    if (this.tabTarget) {
      let browser = this.target.value.linkedBrowser;
      let root = browser.contentDocument.documentElement;
      this._selection.setNode(root);
    }
    if (this.chromeTarget) {
      let root = this.target.value.document.documentElement;
      this._selection.setNode(root);
    }

    if (this.highlighter) {
      this.highlighter.unlock();
    }

    this.emit("ready");
  }.bind(this));
}

InspectorPanel.prototype = {
  /**
   * Selected (super)node (read only)
   */
  get selection() {
    return this._selection;
  },

  /**
   * Indicate that a tool has modified the state of the page.  Used to
   * decide whether to show the "are you sure you want to navigate"
   * notification.
   */
  markDirty: function InspectorPanel_markDirty() {
    this.isDirty = true;
  },

  /**
   * When a new node is selected.
   */
  onNewSelection: function InspectorPanel_onNewSelection() {
    // Nothing yet.
  },

  /**
   * Returns true if a given sidebar panel is currently visible.
   * @param string aPanelName
   *        The panel name as registered with registerSidebar
   */
  isSidePanelVisible: function InspectorPanel_isPanelVisible(aPanelName) {
    return this.sidebar.visible &&
           this.sidebar.activePanel === aPanelName;
  },

  /**
   * Called by the InspectorUI when the inspector is being destroyed.
   */
  destroy: function InspectorPanel__destroy() {
    if (this.highlighter) {
      this.highlighter.off("locked", this.updateInspectorButton);
      this.highlighter.off("unlocked", this.updateInspectorButton);
      this.highlighter.destroy();
    }
    this.breadcrumbs.destroy();
    this.selection.off("new-node", this.onNewSelection);
    this._destroyMarkup();
    this._selection.destroy();
    this._selection = null;
    this.panelWin.inspector = null;
    this.target = null;
    this.panelDoc = null;
    this.panelWin = null;
    this.breadcrumbs = null;
    this.highlighter = null;
  },

  _initMarkup: function InspectorPanel_initMarkupPane() {
    let doc = this.panelDoc;

    this._markupBox = doc.getElementById("markup-box");

    // create tool iframe
    this._markupFrame = doc.createElement("iframe");
    this._markupFrame.setAttribute("flex", "1");
    this._markupFrame.setAttribute("tooltip", "aHTMLTooltip");
    this._markupFrame.setAttribute("context", "inspector-node-popup"); // FIXME: this won't work

    // This is needed to enable tooltips inside the iframe document.
    this._boundMarkupFrameLoad = function InspectorPanel_initMarkupPanel_onload() {
      this._markupFrame.contentWindow.focus();
      this._onMarkupFrameLoad();
    }.bind(this);
    this._markupFrame.addEventListener("load", this._boundMarkupFrameLoad, true);

    this._markupBox.setAttribute("hidden", true);
    this._markupBox.appendChild(this._markupFrame);
    this._markupFrame.setAttribute("src", "chrome://browser/content/devtools/markup-view.xhtml");
  },

  _onMarkupFrameLoad: function InspectorPanel__onMarkupFrameLoad() {
    this._markupFrame.removeEventListener("load", this._boundMarkupFrameLoad, true);
    delete this._boundMarkupFrameLoad;

    this._markupBox.removeAttribute("hidden");

    let controllerWindow; // FIXME: that probably doesn't work
    if (this.tabTarget) {
      controllerWindow = this.target.value.ownerDocument.defaultView;
    } else if (this.chromeTarget) {
      controllerWindow = this.target.value;
    }
    this.markup = new MarkupView(this, this._markupFrame, controllerWindow);

    this.emit("markuploaded");
  },

  _destroyMarkup: function InspectorPanel__destroyMarkup() {
    if (this._boundMarkupFrameLoad) {
      this._markupFrame.removeEventListener("load", this._boundMarkupFrameLoad, true);
      delete this._boundMarkupFrameLoad;
    }

    if (this.markup) {
      this.markup.destroy();
      delete this.markup;
    }

    if (this._markupFrame) {
      delete this._markupFrame;
    }
  },

  /**
   * Called by InspectorUI after a tab switch, when the
   * inspector is no longer the active tab.
   */
  _freeze: function InspectorPanel__freeze() {
    this._frozen = true;
    this.emit("frozen");
  },

  /**
   * Called by InspectorUI after a tab switch when the
   * inspector is back to being the active tab.
   */
  _thaw: function InspectorPanel__thaw() {
    if (!this._frozen) {
      return;
    }
    delete this._frozen;
    this.emit("thaw");
  },

  /**
   * Add a tooltip to the Inspect button.
   * The tooltips include the related keyboard shortcut.
   */
  buildButtonsTooltip: function InspectorPanel_buildButtonsTooltip() {
    let keysbundle = Services.strings.createBundle("chrome://global-platform/locale/platformKeys.properties");
    let separator = keysbundle.GetStringFromName("MODIFIER_SEPARATOR");

    let button, tooltip;

    // Inspect Button - the shortcut string is built from the <key> element

    let key = null;// FIXME: this.chromeDoc.getElementById("key_inspect");

    if (key) {
      let modifiersAttr = key.getAttribute("modifiers");

      let combo = [];

      if (modifiersAttr.match("accel"))
/* FIXME:
#ifdef XP_MACOSX
        combo.push(keysbundle.GetStringFromName("VK_META"));
#else
        combo.push(keysbundle.GetStringFromName("VK_CONTROL"));
#endif
*/
      if (modifiersAttr.match("shift"))
        combo.push(keysbundle.GetStringFromName("VK_SHIFT"));
      if (modifiersAttr.match("alt"))
        combo.push(keysbundle.GetStringFromName("VK_ALT"));
      if (modifiersAttr.match("ctrl"))
        combo.push(keysbundle.GetStringFromName("VK_CONTROL"));
      if (modifiersAttr.match("meta"))
        combo.push(keysbundle.GetStringFromName("VK_META"));

      combo.push(key.getAttribute("key"));

      tooltip = this.strings.formatStringFromName("inspectButtonWithShortcutKey.tooltip",
        [combo.join(separator)], 1);
    } else {
      tooltip = this.strings.GetStringFromName("inspectButton.tooltip");
    }

    button = this.panelDoc.getElementById("inspector-inspect-toolbutton");
    button.setAttribute("tooltiptext", tooltip);
  },

  todo: function() {
    this.breadcrumbs = new HTMLBreadcrumbs(this);
    this.chromeWin.addEventListener("keypress", this, false);
    this.highlighter = new Highlighter(this.chromeWin);

    // Fade out the highlighter when needed
    let deck = this.chromeDoc.getElementById("devtools-sidebar-deck");
    deck.addEventListener("mouseenter", this, true); // FIXME: removeEventListener
    deck.addEventListener("mouseleave", this, true);

    // Create UI for any sidebars registered with
    // InspectorUI.registerSidebar()
    for each (let tool in InspectorUI._registeredSidebars) {
      this._sidebar.addTool(tool);
    }

    this.setupNavigationKeys();

    // Focus the first focusable element in the toolbar
    this.chromeDoc.commandDispatcher.advanceFocusIntoSubtree(this.toolbar);

    // If nothing is focused in the toolbar, it means that the focus manager
    // is limited to some specific elements and has moved the focus somewhere else.
    // So in this case, we want to focus the content window.
    // See: https://developer.mozilla.org/en/XUL_Tutorial/Focus_and_Selection#Platform_Specific_Behaviors
    if (!this.toolbar.querySelector(":-moz-focusring")) {
      this.win.focus();
    }


      inspector._htmlPanelOpen =
        Services.prefs.getBoolPref("devtools.inspector.htmlPanelOpen");

      inspector._sidebarOpen =
        Services.prefs.getBoolPref("devtools.inspector.sidebarOpen");

      inspector._activeSidebar =
        Services.prefs.getCharPref("devtools.inspector.activeSidebar");
  },

  /* FIXME:
  select: function IUI_select(aNode, forceUpdate, aScroll, aFrom)
  {
    [...]

    if (forceUpdate || aNode != this.selection) {
      if (aFrom != "breadcrumbs") {
        this.clearPseudoClassLocks();
      }
    }
  },
  */

  /**
   * FIXME: ensure this will happen
   */
  ____nodeChanged: function IUI_nodeChanged(aUpdater)
  {
    this._currentInspector.emit("change", aUpdater);
  },

  ____highlighterReady: function IUI_highlighterReady()
  {
    this.highlighter.addListener("locked", function() {
      self.stopInspecting();
    });
    this.highlighter.addListener("unlocked", function() {
      self.startInspecting();
    });
    this.highlighter.addListener("pseudoclasstoggled", function(aPseudo) {
      self.togglePseudoClassLock(aPseudo);
    });
  },

  // FIXME: mouseleave/enter to hide/show highlighter

  /**
   * FIXME: go to super node?
   * Inspector:CopyInner command.
   */
  ____copyInnerHTML: function IUI_copyInnerHTML()
  {
    let selection = this._contextSelection();
    clipboardHelper.copyString(selection.innerHTML, selection.ownerDocument);
  },

  /**
   * Copy the outerHTML of the selected Node to the clipboard. Called via the
   * Inspector:CopyOuter command.
   */
  ____copyOuterHTML: function IUI_copyOuterHTML()
  {
    let selection = this._contextSelection();
    clipboardHelper.copyString(selection.outerHTML, selection.ownerDocument);
  },

  /**
   * Delete the selected node. Called via the Inspector:DeleteNode command.
   */
  ____deleteNode: function IUI_deleteNode() {
    if (!this.selection.isNode() ||
        this.selection.isRoot()) {
      return;
    }

    let parent = selection.node.parentNode;

    // If the markup panel is active, use the markup panel to delete
    // the node, making this an undoable action.
    let markup = this.currentInspector.markup;
    if (markup) {
      markup.deleteNode(selection.node);
    } else {
      // remove the node from content
      parent.removeChild(selection.node);
    }

    this.selection.setNode(parent, "inspector")
  },
}

/////////////////////////////////////////////////////////////////////////
//// Initializers

XPCOMUtils.defineLazyGetter(InspectorPanel.prototype, "strings",
  function () {
    return Services.strings.createBundle(
            "chrome://browser/locale/devtools/inspector.properties");
  });

XPCOMUtils.defineLazyGetter(this, "clipboardHelper", function() {
  return Cc["@mozilla.org/widget/clipboardhelper;1"].
    getService(Ci.nsIClipboardHelper);
});
