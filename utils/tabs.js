"use strict";

/* global utils log */

utils["tabs"] = class tabutils
{
    static getTargetID(e)
    {
        // This returns the tabID of a tab, which is always the last element in a HTML ID tag
        return parseInt(this.getIDFromHTMLID(e.target.id), 10);
    }

    static getIDFromHTMLID(target)
    {
        let targetArray = target.split("-");
        return parseInt(targetArray[targetArray.length - 1], 10);
    }

    static getIndexFrom(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        return parseInt(window.document.getElementById("tab-" + tabID).getAttribute("data-index"), 10);
    }

    static updateTabIndexes()
    {
        let index = 0;
        for(let tab of window.document.querySelectorAll(".tabbrowser-tab"))
        {
            tab.setAttribute("data-index", index);
            // window.document.getElementById("tab-title-" + utils.tabs.getIDFromHTMLID(tab.id)).innerHTML = index;
            index++;
        }
    }

    static close(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.remove(tabID);
    }

    static reload(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.reload(tabID);
    }

    // Toggles pinning status
    static pin(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.get(tabID).then((tabInfo) =>
        {
            browser.tabs.update(tabID, {"pinned": !tabInfo.pinned});
        });
    }

    // Duplicates a tab
    static duplicate(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.duplicate(tabID);
    }

    // Toggles muting status
    static mute(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.get(tabID).then((tabInfo) =>
        {
            log.debug("muted: " + !tabInfo.mutedInfo.muted);
            browser.tabs.update(tabID, {"muted": !tabInfo.mutedInfo.muted});
        });
    }

    // Discard a single tab
    static discard(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.discard(tabID);
    }

    static moveToNewWindow(tabID)
    {
        tabID = this._convertIDtoInt(tabID);

        browser.tabs.update(tabID, {active: true}).then(() =>
        {
            browser.windows.create({"tabId": tabID});
        });
    }

    static setIndex(tabID, newIndex)
    {
        tabID = this._convertIDtoInt(tabID);

        if(typeof newIndex == "string")
        {
            newIndex = parseInt(newIndex, 10);
        }

        browser.tabs.move(tabID, {index: newIndex});
    }

    static async isPinned(tabID)
    {
        return await this._isTabSomething(tabID, "pinned");
    }

    static async isMuted(tabID)
    {
        return await this._isTabSomething(tabID, "mutedInfo.muted");
    }

    static reloadAllVisibleTabs()
    {
        browser.windows.getCurrent({"windowTypes": ["normal"], "populate": true}).then((windowInfo) =>
        {
            for(let tab of windowInfo.tabs)
            {
                if(tab.hidden == true) { continue; }

                browser.tabs.reload(tab.id);
            }
        });
    }

    static bookmarkAllVisibleTabs(e, name)
    {
        if(name == null)
        {
            name = "tabs";
        }

        utils.options.get_setting("menu.context.bookmarks.create.place").then((bookmarkCreatePlace) =>
        {
            browser.bookmarks.create({"title": name, "type": "folder", "parentId": bookmarkCreatePlace}).then((bookmarkTreeNode) =>
            {
                browser.windows.getCurrent({"windowTypes": ["normal"], "populate": true}).then((windowInfo) =>
                {
                    let index = 0;
                    for(let tab of windowInfo.tabs.reverse())
                    {
                        if(tab.hidden == true) { return; }
                        browser.bookmarks.create({"title": tab.title, "url": tab.url, "index": index, "type": "bookmark", "parentId": bookmarkTreeNode.id});
                        index++;
                    }
                });
            });
        });
    }

    static selectNextToActiveTab(windowID, direction)
    {
        browser.tabs.query({"windowId": windowID, "active": true}).then((tabs) =>
        {
            if(tabs.length == 0) { return; }

            let newActiveIndex;

            if(direction == "down")
            {
                newActiveIndex = tabs[0].index + 1;
            }
            else if(direction == "up")
            {
                newActiveIndex = tabs[0].index - 1;
            }

            let foundNextVisibleTab = false;
            while(foundNextVisibleTab == false)
            {
                browser.tabs.query({"windowId": windowID, "index": newActiveIndex}).then((tabs) =>
                {
                    if(tabs.length == 0) { return; }

                    if(tabs[0].hidden == false) { foundNextVisibleTab = true; }

                    browser.tabs.update(tabs[0].id, {active: true});
                });
            }
        });
    }

    static closeTabsRelativeTo(tabID, relativeTyp)
    {
        let tabIndex = this.getIndexFrom(tabID);
        log.debug("Close tabs " + relativeTyp + " from  tab index " + tabIndex);

        let closeTheseTabs = [];
        for(let tab of window.document.querySelectorAll(".tabbrowser-tab"))
        {
            let currentTabID = this.getIDFromHTMLID(tab.id);
            let pinned = tab.getAttribute("pinned");

            if(tab.style.display == "none"
               || pinned == "true")
            {
                continue;
            }

            let currentTabIndex = this.getIndexFrom(currentTabID);

            if((relativeTyp == "below" && currentTabIndex > tabIndex)
            || (relativeTyp == "above" && currentTabIndex < tabIndex)
            || (relativeTyp == "others" && currentTabID != tabID))
            {
                closeTheseTabs.push(currentTabID);
            }
        }

        this.updateTabIndexes();
        log.debug(closeTheseTabs);
        this.close(closeTheseTabs);
    }

    static async restoreLastClosedTab()
    {
        let lastSession = await browser.sessions.getRecentlyClosed({maxResults: 1});
        if(typeof lastSession[0].tab != "undefined")
        {
            browser.sessions.restore(lastSession[0].tab.sessionId);
        }
    }

    static async isActive(tabID)
    {
        return await this._isTabSomething(tabID, "active");
    }

    static async isDiscarded(tabID)
    {
        return await this._isTabSomething(tabID, "discarded");
    }

    static isTabElement(HTMLElement)
    {
        if(HTMLElement == null || typeof HTMLElement.classList == "undefined")
        {
            return false;
        }

        if(HTMLElement.classList.contains("tabbrowser-tab"))
        {
            return true;
        }

        return false;
    }

    static async _isTabSomething(tabID, key)
    {
        tabID = this._convertIDtoInt(tabID);

        let somethingInfo;

        await browser.tabs.get(tabID).then((tabInfo) =>
        {
            if(!key.includes("."))
            {
                somethingInfo = tabInfo[key];
            }
            else
            {
                for(let singleKey of key.split("."))
                {
                    if(somethingInfo == null)
                    {
                        somethingInfo = tabInfo[singleKey];
                    }
                    else
                    {
                        somethingInfo = somethingInfo[singleKey];
                    }
                }
            }
        });

        return somethingInfo;
    }

    static _convertIDtoInt(tabID)
    {
        if(typeof tabID == "string")
        {
            tabID = parseInt(tabID, 10);
        }

        return tabID;
    }

    static removeClassAll(className)
    {
        const elements = document.querySelectorAll(`.tabbrowser-tab.${className}`);
        Array.from(elements).forEach(element => element.classList.remove(className));
    }
};
