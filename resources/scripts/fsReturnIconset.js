/*start - chrome stuff*/
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);
Cu.import('resource://gre/modules/devtools/Console.jsm');
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/Promise.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
const core = {
	addon: {
		id: 'Icon-Container-Generator@jetpack',
		path: {
			name: 'icon-container-generator',
			locale: 'chrome://icon-container-generator/locale/'
		},
		cache_key: Math.random() // set to version on release
	}
};
var gCFMM;

// start - functionalities

// end - functionalities

// start - common helper functions
function contentMMFromContentWindow_Method2(aContentWindow) {
	if (!gCFMM) {
		gCFMM = aContentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIDocShell)
							  .QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIContentFrameMessageManager);
	}
	return gCFMM;

}
// end - common helper functions

// start - comm layer with server
var bootstrapCallbacks = {
	
};
var bootstrapMsgListener = {
	receiveMessage: function(aMsgEvent) {
		var aMsgEventData = aMsgEvent.data;
		console.log('framescript getting aMsgEvent:', aMsgEventData);
		// aMsgEvent.data should be an array, with first item being the unfction name in bootstrapCallbacks
		bootstrapCallbacks[aMsgEventData.shift()].apply(null, aMsgEventData);
	}
};
contentMMFromContentWindow_Method2(content).addMessageListener(core.addon.id, bootstrapMsgListener);
// end - comm layer with server

// start - load unload stuff
function fsUnloaded() {
	// framescript on unload
	console.error('fsReturnIconset.js framworker unloading');
	contentMMFromContentWindow_Method2(content).removeMessageListener(core.addon.id, bootstrapMsgListener); // framescript comm

}
function onPageReady(aEvent) {
	var aContentWindow = aEvent.target.defaultView;
	console.error('fsReturnIconset.js page ready, content.location:', content.location, 'aContentWindow.location:', aContentWindow.location);
	contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, ['frameworkerReady']);
}

addEventListener('unload', fsUnloaded, false);
addEventListener('DOMContentLoaded', onPageReady, false);
console.error('added DOMContentLoaded event, current location is:', content.location);
// end - load unload stuff