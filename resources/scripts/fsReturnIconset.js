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
const NS_HTML = 'http://www.w3.org/1999/xhtml';

// start - functionalities
var imgPathData = {}; //keys are image path, and value is object holding data

var bootstrapCallbacks = {
	loadImg: function(aImgPath) {
		// aImgPath must be file uri, or chrome path, or http NOT os path
		var deferredMain_loadImg = new Deferred();
		
		imgPathData[aImgPath].Image = new Image();
		
		imgPathData[aImgPath].Image.onload = function() {
			// imgPathData[aImgPath].Canvas = content.document.createElementNS(NS_HTML, 'canvas')
			// imgPathData[aImgPath].Ctx = imgPathData[aImgPath].Canvas.getContext('2d');
			imgPathData[aImgPath].w = this.naturalWidth;
			imgPathData[aImgPath].h = this.naturalHeight;
			imgPathData[aImgPath].status = 'img-ok';
			deferredMain_loadImg.resolve({
				status: 'img-ok',
				w: imgPathData[aImgPath].w,
				h: imgPathData[aImgPath].h
			})
		};
		
		imgPathData[aImgPath].Image.onabort = function() {
			imgPathData[aImgPath].status = 'img-abort';
			deferredMain_loadImg.resolve({
				status: 'img-abort'
			})
		};
		
		imgPathData[aImgPath].Image.onerror = function() {
			imgPathData[aImgPath].status = 'img-error';
			deferredMain_loadImg.resolve({
				status: 'img-error'
			})
		};
		
		return deferredMain_loadImg.promise;
	}
};
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
const SAM_CB_PREFIX = '_sam_gen_cb_';
function sendAsyncMessageWithCallback(aMessageManager, aGroupId, aMessageArr, aCallbackScope, aCallback) {
	var thisCallbackId = SAM_CB_PREFIX + new Date().getTime();
	aCallbackScope = aCallbackScope ? aCallbackScope : bootstrap; // todo: figure out how to get global scope here, as bootstrap is undefined
	aCallbackScope[thisCallbackId] = function(aMessageArr) {
		delete aCallbackScope[thisCallbackId];
		aCallback.apply(null, aMessageArr);
	}
	aMessageArr.push(thisCallbackId);
	aMessageManager.sendAsyncMessage(aGroupId, aMessageArr);
}
var bootstrapMsgListener = {
	funcScope: bootstrapCallbacks,
	receiveMessage: function(aMsgEvent) {
		var aMsgEventData = aMsgEvent.data;
		console.log('framescript getting aMsgEvent:', aMsgEventData);
		// aMsgEvent.data should be an array, with first item being the unfction name in this.funcScope
		
		var callbackPendingId;
		if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SAM_CB_PREFIX) == 0) {
			callbackPendingId = aMsgEventData.pop();
		}
		
		var funcName = aMsgEventData.shift();
		if (funcName in this.funcScope) {
			var rez_fs_call = this.funcScope[funcName].apply(null, aMsgEventData);
			
			if (callbackPendingId) {
				// rez_fs_call must be an array or promise that resolves with an array
				if (rez_fs_call.constructor.name == 'Promise') {
					rez_fs_call.then(
						function(aVal) {
							// aVal must be an array
							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, aVal]);
						},
						function(aReason) {
							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, ['promise_rejected', aReason]]);
						}
					).catch(
						function(aCatch) {
							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, ['promise_rejected', aReason]]);
						}
					);
				} else {
					// assume array
					contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, rez_fs_call]);
				}
			}
		}
		else { console.warn('funcName', funcName, 'not in scope of this.funcScope') } // else is intentionally on same line with console. so on finde replace all console. lines on release it will take this out
		
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