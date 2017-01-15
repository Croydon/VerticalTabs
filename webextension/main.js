"use strict"

var port = browser.runtime.connect({name: "connection-to-legacy"});


//
// Handle addon settings
//
var defaultSettings = {
    right: false,
    hideInFullscreen: true,
    compact: false,
    theme: "dark",
    tabtoolbarPosition: "top",
    toggleDisplayHotkey: "control-alt-v",
    width: 250,
    debug: false
}
    
function restore_default_settings()
{
    Object.keys(defaultSettings).forEach(function(k)
    {
        save_setting(k, defaultSettings[k]);
        sdk_send_changed_setting(k);
    });
}

function save_setting(name, value)
{
    let settingsObject = {};
    settingsObject[name] = value;
    
    browser.storage.local.set(settingsObject).then(error => 
    {
        if(error)
        {
            return false;
        }
        
        return true;
    });
}

function get_setting(name)
{
    return new Promise(function (fulfill, reject) 
    {
        browser.storage.local.get(name).then(results =>
        {
            if (!results.hasOwnProperty(name)) 
            {
                debug_log("VTR WebExt setting '"+ name +"': not saved use default value.");
                if(defaultSettings.hasOwnProperty(name))
                {
                    results[name] = defaultSettings[name];
                }
                else
                {
                    debug_log("VTR WebExt setting '"+ name +"': no default value found.");
                }
            }
            
            fulfill(results[name]);
        }).catch(
            function(reason) {
                debug_log(reason);
            }
        );
    });
}


//
// Communication with the legacy part + content script
//

function sdk_send_all_settings()
{
    browser.storage.local.get().then(value => {
        sdk_sendMsg({
            type: "settings.post-all",
            value: value
        });
    });
}

sdk_send_all_settings();

// Changed addon preferences, send to SDK
function sdk_send_changed_setting(settingName)
{
    sdk_send_all_settings();
    
    if(settingName == "toggleDisplayHotkey")
    {
        sdk_sendMsg({type: "settings.toggleDisplayHotkey"}); 
    }

    get_setting(settingName).then(value => {
        sdk_sendMsg({
            type: "settings.post",
            name: settingName,
            value: value
        });
    });
}

function sdk_replyHandler(message)
{
    if(message.type == "settings.post") 
    {
        // the legacy part sent settings, save them
        save_setting(message.name, message.value);
    }
    
    if(message.type == "settings.post-to-sdk") 
    {
        // the very-very-legacy part of the add-on wants to save settings
        save_setting(message.name, message.value);
        message.type = "settings.post";
        sdk_sendMsg(message);
    }
    
    if(message.type == "settings.reset")
    {
        restore_default_settings();
    }
    
    if(message.type == "debug.log")
    {
        debug_log(message.value);
    }
}

port.onMessage.addListener(sdk_replyHandler); // legacy listener
browser.runtime.onMessage.addListener(sdk_replyHandler); // content script listener

function sdk_sendMsg(message)
{
    browser.runtime.sendMessage(message).then(reply => 
    {
        if (reply) {
            sdk_replyHandler(reply);
        }
    });
}


// Get all settings from the legacy part
setTimeout(function(){ 
    sdk_sendMsg({type: "settings.get", name: "right"});
    sdk_sendMsg({type: "settings.get", name: "hideInFullscreen"});
    sdk_sendMsg({type: "settings.get", name: "theme"});
    sdk_sendMsg({type: "settings.get", name: "tabtoolbarPosition"});
    sdk_sendMsg({type: "settings.get", name: "toggleDisplayHotkey"});
    sdk_sendMsg({type: "settings.get", name: "width"});
    sdk_sendMsg({type: "settings.get", name: "debug"});
    
    browser.storage.onChanged.addListener(sdk_send_all_settings);
}, 100);


// Utils
function debug_log(output) 
{
	get_setting("debug").then(value => {
        if(value == true)
        {
            console.log(output);
        }
	});
}