/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ----- BEGIN LICENSE BLOCK -----
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of
 * the License at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * rights and limitations under the License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is Netscape Communications Corporation.
 * Portions created by Netscape Communications Corporation are
 * Copyright (C) 2000 Netscape Communications Corporation. All
 * Rights Reserved.
 *
 * Contributor(s):
 *  Frank Yung-Fong Tang <ftang@netscape.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the LGPL or the GPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ----- END LICENSE BLOCK ----- */

#include "nsFontPackageService.h"
#include "nsFontPackageHandler.h"


NS_IMPL_THREADSAFE_ISUPPORTS2(nsFontPackageService, 
   nsIFontPackageService,
   nsIFontPackageProxy);

/* from nsIFontPackageSercice.h */
nsFontPackageService::nsFontPackageService() : mHandler(nsnull)
{
  NS_INIT_REFCNT();
  /* member initializers and constructor code */
}

nsFontPackageService::~nsFontPackageService()
{
  /* destructor code */
}

/* void SetHandler (in nsIFontPackageHandler aHandler); */
NS_IMETHODIMP nsFontPackageService::SetHandler(nsIFontPackageHandler *aHandler)
{
    mHandler = aHandler;
    return NS_OK;
}

/* void FontPackageHandled (in boolean aSuccess, in boolean aReloadPages, in string aFontPackID); */
NS_IMETHODIMP nsFontPackageService::FontPackageHandled(PRBool aSuccess, PRBool aReloadPages, const char *aFontPackID)
{
    // add implementation later
    return NS_OK;
}

/* from nsIFontPackageProxy.h */

/* void NeedFontPackage (in string aFontPackID); */
NS_IMETHODIMP nsFontPackageService::NeedFontPackage(const char *aFontPackID)
{
  if (!mHandler) {
    // create default handler
    mHandler = new nsFontPackageHandler;
    if (!mHandler) 
      return NS_ERROR_OUT_OF_MEMORY;
  }
  return mHandler->NeedFontPackage(aFontPackID);
}
