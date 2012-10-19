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

  this.nodemenu = this.panelDoc.getElementById("inspector-node-popup");
  this.lastNodemenuItem = this.nodemenu.lastChild;
  this._setupNodeMenu = this._setupNodeMenu.bind(this);
  this._resetNodeMenu = this._resetNodeMenu.bind(this);
  this.nodemenu.addEventListener("popupshowing", this._setupNodeMenu, true);
  this.nodemenu.addEventListener("popuphiding", this._resetNodeMenu, true);

  // Create an empty selection
  this._selection = new Selection();
  this.onNewSelection = this.onNewSelection.bind(this);
  this.selection.on("new-node", this.onNewSelection);

  this.breadcrumbs = new HTMLBreadcrumbs(this);

  if (this.tabTarget) {
    this.highlighter = new Highlighter(this.selection, this.target.value, this);
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

    this.nodemenu.removeEventListener("popupshowing", this._setupNodeMenu, true);
    this.nodemenu.remvoeEventListener("popuphiding", this._resetNodeMenu, true);
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
    this.lastNodemenuItem = null;
    this.nodemenu = null;
    this.highlighter = null;
  },

  /**
   * Show the node menu.
   */
  showNodeMenu: function InspectorPanel_showNodeMenu(aButton, aPosition, aExtraItems) {
    if (aExtraItems) {
      for (let item of aExtraItems) {
        this.nodemenu.appendChild(item);
      }
    }
    this.nodemenu.openPopup(aButton, aPosition, 0, 0, true, false);
  },

  hideNodeMenu: function InspectorPanel_hideNodeMenu() {
    this.nodemenu.hidePopup();
  },

  /**
   * Disable the delete item if needed. Update the pseudo classes.
   */
  _setupNodeMenu: function InspectorPanel_setupNodeMenu() {
    // Set the pseudo classes
    let hover = this.panelDoc.getElementById("node-menu-pseudo-hover");
    let focus = this.panelDoc.getElementById("node-menu-pseudo-focus");
    let active = this.panelDoc.getElementById("node-menu-pseudo-active");

    let isHover = DOMUtils.hasPseudoClassLock(this.selection.node, ":hover");
    let isFocus = DOMUtils.hasPseudoClassLock(this.selection.node, ":focus");
    let isActive = DOMUtils.hasPseudoClassLock(this.selection.node, ":active");

    hover.setAttribute("checked", isHover);
    focus.setAttribute("checked", isFocus);
    active.setAttribute("checked", isActive);

    // Disable delete item if needed
    let deleteNode = this.panelDoc.getElementById("node-menu-delete");
    if (this.selection.isRoot()) {
      deleteNode.setAttribute("disabled", "true");
    } else {
      deleteNode.removeAttribute("disabled");
    }

  },

  _resetNodeMenu: function InspectorPanel_resetNodeMenu() {
    // Remove any extra items
    while (this.lastNodemenuItem.nextSibling) {
      let toDelete = this.lastNodemenuItem.nextSibling;
      toDelete.parentNode.removeChild(toDelete);
    }
  },

  _initMarkup: function InspectorPanel_initMarkupPane() {
    let doc = this.panelDoc;

    this._markupBox = doc.getElementById("markup-box");

    // create tool iframe
    this._markupFrame = doc.createElement("iframe");
    this._markupFrame.setAttribute("flex", "1");
    this._markupFrame.setAttribute("tooltip", "aHTMLTooltip");
    this._markupFrame.setAttribute("context", "inspector-node-popup");

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

    let controllerWindow; // FIXME: that probably doesn't work when undocked
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

  // FIXME: mouseleave/enter to hide/show highlighter

  /**
   * Toggle a pseudo class.
   */
  togglePseudoClass: function togglePseudoClass(aPseudo) {
    if (this.selection.isElementNode()) {
      if (DOMUtils.hasPseudoClassLock(this.selection.node, aPseudo)) {
        this.breadcrumbs.nodeHierarchy.forEach(function(crumb) {
          DOMUtils.removePseudoClassLock(crumb.node, aPseudo);
        });
      } else {
        let hierarchical = aPseudo == ":hover" || aPseudo == ":active";
        let node = this.selection.node;
        do {
          DOMUtils.addPseudoClassLock(node, aPseudo);
          node = node.parentNode;
        } while (hierarchical && node.parentNode)
      }
    }
    this.selection.emit("pseudoclass");
  },

  /**
   * Copy the innerHTML of the selected Node to the clipboard.
   */
  copyInnerHTML: function InspectorPanel_copyInnerHTML()
  {
    if (!this.selection.isNode()) {
      return;
    }
    let toCopy = this.selection.node.innerHTML;
    if (toCopy) {
      clipboardHelper.copyString(toCopy);
    }
  },

  /**
   * Copy the outerHTML of the selected Node to the clipboard.
   */
  copyOuterHTML: function InspectorPanel_copyOuterHTML()
  {
    if (!this.selection.isNode()) {
      return;
    }
    let toCopy = this.selection.node.outerHTML;
    if (toCopy) {
      clipboardHelper.copyString(toCopy);
    }
  },

  /**
   * Delete the selected node.
   */
  deleteNode: function IUI_deleteNode() {
    if (!this.selection.isNode() ||
         this.selection.isRoot()) {
      return;
    }

    let toDelete = this.selection.node;

    let parent = this.selection.node.parentNode;
    //this.selection.setNode(parent, "inspector")

    // If the markup panel is active, use the markup panel to delete
    // the node, making this an undoable action.
    if (this.markup) {
      this.markup.deleteNode(toDelete);
    } else {
      // remove the node from content
      parent.removeChild(toDelete);
    }
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


XPCOMUtils.defineLazyGetter(this, "DOMUtils", function () {
  return Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);
});
