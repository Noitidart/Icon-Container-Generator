/*start - chrome stuff*/
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);
Cu.import('resource://gre/modules/devtools/Console.jsm');
Cu.import('resource://gre/modules/osfile.jsm');
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
		console.log('in loadImg');
		
		var deferredMain_loadImg = new Deferred();
		
		imgPathData[aImgPath] = {};
		
		imgPathData[aImgPath].Image = new content.Image();
		
		imgPathData[aImgPath].Image.onload = function() {
			// imgPathData[aImgPath].Canvas = content.document.createElementNS(NS_HTML, 'canvas')
			// imgPathData[aImgPath].Ctx = imgPathData[aImgPath].Canvas.getContext('2d');
			imgPathData[aImgPath].w = this.naturalWidth;
			imgPathData[aImgPath].h = this.naturalHeight;
			imgPathData[aImgPath].status = 'img-ok';
			deferredMain_loadImg.resolve([{
				status: 'img-ok',
				w: imgPathData[aImgPath].w,
				h: imgPathData[aImgPath].h
			}]);
		};
		
		imgPathData[aImgPath].Image.onabort = function() {
			imgPathData[aImgPath].status = 'img-abort';
			deferredMain_loadImg.resolve([{
				status: 'img-abort'
			}]);
		};
		
		imgPathData[aImgPath].Image.onerror = function() {
			imgPathData[aImgPath].status = 'img-error';
			deferredMain_loadImg.resolve([{
				status: 'img-error'
			}]);
		};
		
		imgPathData[aImgPath].Image.src = aImgPath;
		
		return deferredMain_loadImg.promise;
	},
	drawScaled: function(aImgPath, aDrawAtSize) {
		// aImgPath is one of keys in imgPathData
		// must be square obiouvsly, i am assuming it is
		// aDrawAtSize is what the width and height will be set to
		// a canvas is created, and and saved in this object
		console.error('in drawScaled, arguments:', aImgPath, aDrawAtSize);
		var deferredMain_drawScaled = new Deferred();
		
		if (!('scaleds' in imgPathData[aImgPath])) {
			imgPathData[aImgPath].scaleds = {};
		}
		
		if (!(aDrawAtSize in imgPathData[aImgPath].scaleds)) {
			imgPathData[aImgPath].scaleds[aDrawAtSize] = {};
			imgPathData[aImgPath].scaleds[aDrawAtSize].Can = content.document.createElement('canvas');
			var Ctx = imgPathData[aImgPath].scaleds[aDrawAtSize].Can.getContext('2d');
			
			imgPathData[aImgPath].scaleds[aDrawAtSize].Can.width = aDrawAtSize;
			imgPathData[aImgPath].scaleds[aDrawAtSize].Can.height = aDrawAtSize;
			
			if (aDrawAtSize == imgPathData[aImgPath].w) {
				Ctx.drawImage(mgPathData[aImgPath].Image, 0, 0)
			} else {
				Ctx.drawImage(imgPathData[aImgPath].Image, 0, 0, aDrawAtSize, aDrawAtSize);
			}
		}
		
		(imgPathData[aImgPath].scaleds[aDrawAtSize].Can.toBlobHD || imgPathData[aImgPath].scaleds[aDrawAtSize].Can.toBlob).call(imgPathData[aImgPath].scaleds[aDrawAtSize].Can, function(blob) {
			var reader = Cc['@mozilla.org/files/filereader;1'].createInstance(Ci.nsIDOMFileReader); //new FileReader();
			reader.onloadend = function() {
				// reader.result contains the ArrayBuffer.
				deferredMain_drawScaled.resolve([{
					status: 'ok',
					arrbuf: reader.result
				}]);
			};
			reader.onabort = function() {
				deferredMain_drawScaled.resolve([{
					status: 'fail',
					reason: 'Abortion on nsIDOMFileReader, failed reading blob of provided path: "' + aImgPath + '"'
				}]);
			};
			reader.onerror = function() {
				deferredMain_drawScaled.resolve([{
					status: 'fail',
					reason: 'Error on nsIDOMFileReader, failed reading blob of provided path: "' + aImgPath + '"'
				}]);
			};
			reader.readAsArrayBuffer(blob);
		}, 'image/png');
		
		return deferredMain_drawScaled.promise;
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

function Deferred() {
	try {
		/* A method to resolve the associated Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} value : This value is used to resolve the promise
		 * If the value is a Promise then the associated promise assumes the state
		 * of Promise passed as value.
		 */
		this.resolve = null;

		/* A method to reject the assocaited Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} reason: The reason for the rejection of the Promise.
		 * Generally its an Error object. If however a Promise is passed, then the Promise
		 * itself will be the reason for rejection no matter the state of the Promise.
		 */
		this.reject = null;

		/* A newly created Pomise object.
		 * Initially in pending state.
		 */
		this.promise = new Promise(function(resolve, reject) {
			this.resolve = resolve;
			this.reject = reject;
		}.bind(this));
		Object.freeze(this);
	} catch (ex) {
		console.log('Promise not available!', ex);
		throw new Error('Promise not available!');
	}
}

// end - common helper functions

// start - comm layer with server
const SAM_CB_PREFIX = '_sam_gen_cb_';
var sam_last_cb_id = -1;
function sendAsyncMessageWithCallback(aMessageManager, aGroupId, aMessageArr, aCallbackScope, aCallback) {
	sam_last_cb_id++;
	var thisCallbackId = SAM_CB_PREFIX + sam_last_cb_id;
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
		console.log('framescript getting aMsgEvent, unevaled:', uneval(aMsgEventData));
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
							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, ['promise_rejected', aCatch]]);
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
	console.log('fsReturnIconset.js framworker unloading');
	contentMMFromContentWindow_Method2(content).removeMessageListener(core.addon.id, bootstrapMsgListener); // framescript comm

}
function onPageReady(aEvent) {
	var aContentWindow = aEvent.target.defaultView;
	console.info('domcontentloaded time:', (new Date().getTime() - timeStart1.getTime()));
	console.log('fsReturnIconset.js page ready, content.location:', content.location.href, 'aContentWindow.location:', aContentWindow.location.href);
	contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, ['frameworkerReady']);
}

addEventListener('unload', fsUnloaded, false);
var timeStart1 = new Date();
addEventListener('DOMContentLoaded', onPageReady, false);
console.log('added DOMContentLoaded event, current location is:', content.location.href);
// end - load unload stuff