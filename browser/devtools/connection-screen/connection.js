/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Cu = Components.utils;
Cu.import("resource:///modules/devtools/Target.jsm");
Cu.import("resource:///modules/devtools/Toolbox.jsm");
Cu.import("resource:///modules/devtools/gDevTools.jsm");

function submit() {
  let host = document.getElementById("host").value;
  let port = document.getElementById("port").value;

  document.body.classList.add("connecting");

  getActors(host, port, function(error, actors) {
      document.body.classList.remove("connecting");
      if (error) {
        alert(error);
        return;
      }
      document.body.classList.add("actors-mode");

      let parent = document.getElementById("actors");

      let focusSet = false;
      for (let actor of actors) {
        let a = document.createElement("a");
        a.onclick = function() {
          connect(actor);
        }

        a.textContent = actor.title;
        a.title = actor.title;
        a.href = "#";

        parent.appendChild(a);

        if (!focusSet) {
          a.focus();
          focusSet = true;
        }
      }
  });
}

function getActors(host, port, callback) {
  setTimeout(function() {
      callback(null, [
        {id: "a1", title: "tab 1 :D"},
        {id: "a2", title: "tab 2, yes!"},
        {id: "a3", title: "tab 3, booooring"},
        {id: "a4", title: "tab 4, I don't know what to write"},
        {id: "a5", title: "tab 5, BOON BBOOM"},
        {id: "a6", title: "tab 5, the last one"},
      ]);
  }, 3000);
}

function connect(actor) {
  let target = TargetFactory.forRemote(actor);
  gDevTools.openToolbox(target, Toolbox.HostType.WINDOW, "webconsole");
  window.close();
}
