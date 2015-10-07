// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);
Cu.import('resource://gre/modules/devtools/Console.jsm');
const {TextDecoder, TextEncoder, OS} = Cu.import('resource://gre/modules/osfile.jsm', {});
Cu.import('resource://gre/modules/Promise.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
const core = {
	addon: {
		name: 'Icon Container Generator',
		id: 'Icon-Container-Generator@jetpack',
		path: {
			name: 'icon-container-generator',
			content: 'chrome://icon-container-generator/content/',
			images: 'chrome://icon-container-generator/content/resources/images/',
			locale: 'chrome://icon-container-generator/locale/',
			modules: 'chrome://icon-container-generator/content/modules/',
			resources: 'chrome://icon-container-generator/content/resources/',
			scripts: 'chrome://icon-container-generator/content/resources/scripts/',
			styles: 'chrome://icon-container-generator/content/resources/styles/',
			workers: 'chrome://icon-container-generator/content/modules/workers/'
		},
		cache_key: Math.random() // set to version on release
	},
	os: {
		name: OS.Constants.Sys.Name.toLowerCase(),
		toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
		xpcomabi: Services.appinfo.XPCOMABI
	},
	firefox: {
		pid: Services.appinfo.processID,
		version: Services.appinfo.version
	}
};

const JETPACK_DIR_BASENAME = 'jetpack';
const OSPath_simpleStorage = OS.Path.join(OS.Constants.Path.profileDir, JETPACK_DIR_BASENAME, core.addon.id, 'simple-storage');
const myPrefBranch = 'extensions.' + core.addon.id + '.';

var bootstrap = this; // needed for SIPWorker and SICWorker

// Lazy Imports
const myServices = {};
XPCOMUtils.defineLazyGetter(myServices, 'hph', function () { return Cc['@mozilla.org/network/protocol;1?name=http'].getService(Ci.nsIHttpProtocolHandler); });
XPCOMUtils.defineLazyGetter(myServices, 'sb', function () { return Services.strings.createBundle(core.addon.path.locale + 'bootstrap.properties?' + core.addon.cache_key) }); // Randomize URI to work around bug 719376

function extendCore() {
	// adds some properties i use to core based on the current operating system, it needs a switch, thats why i couldnt put it into the core obj at top
	switch (core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			core.os.version = parseFloat(Services.sysinfo.getProperty('version'));
			// http://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions
			if (core.os.version == 6.0) {
				core.os.version_name = 'vista';
			}
			if (core.os.version >= 6.1) {
				core.os.version_name = '7+';
			}
			if (core.os.version == 5.1 || core.os.version == 5.2) { // 5.2 is 64bit xp
				core.os.version_name = 'xp';
			}
			break;
			
		case 'darwin':
			var userAgent = myServices.hph.userAgent;

			var version_osx = userAgent.match(/Mac OS X 10\.([\d\.]+)/);

			
			if (!version_osx) {
				throw new Error('Could not identify Mac OS X version.');
			} else {
				var version_osx_str = version_osx[1];
				var ints_split = version_osx[1].split('.');
				if (ints_split.length == 1) {
					core.os.version = parseInt(ints_split[0]);
				} else if (ints_split.length >= 2) {
					core.os.version = ints_split[0] + '.' + ints_split[1];
					if (ints_split.length > 2) {
						core.os.version += ints_split.slice(2).join('');
					}
					core.os.version = parseFloat(core.os.version);
				}
				// this makes it so that 10.10.0 becomes 10.100
				// 10.10.1 => 10.101
				// so can compare numerically, as 10.100 is less then 10.101
				
				//core.os.version = 6.9; // note: debug: temporarily forcing mac to be 10.6 so we can test kqueue
			}
			break;
		default:
			// nothing special
	}
	

}

// START - Addon Functionalities

// start - about module
var aboutFactory_iconcontainergenerator;
function AboutIconContainerGenerator() {}
AboutIconContainerGenerator.prototype = Object.freeze({
	classDescription: 'Icon Container Generator Application', //myServices.sb.GetStringFromName('about-page_desc'),
	contractID: '@mozilla.org/network/protocol/about;1?what=icon-container-generator',
	classID: Components.ID('{65cc2b40-55bc-11e5-a837-0800200c9a66}'),
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

	getURIFlags: function(aURI) {
		return Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.URI_MUST_LOAD_IN_CHILD;
	},

	newChannel: function(aURI, aSecurity) {

		var channel = Services.io.newChannel(core.addon.path.content + 'app.xhtml', null, null);
		channel.originalURI = aURI;
		return channel;
	}
});

function AboutFactory(component) {
	this.createInstance = function(outer, iid) {
		if (outer) {
			throw Cr.NS_ERROR_NO_AGGREGATION;
		}
		return new component();
	};
	this.register = function() {
		Cm.registerFactory(component.prototype.classID, component.prototype.classDescription, component.prototype.contractID, this);
	};
	this.unregister = function() {
		Cm.unregisterFactory(component.prototype.classID, this);
	};
	Object.freeze(this);
	this.register();
}
// end - about module

var ICGenWorkerFuncs = { // functions for worker to call in main thread
	loadImagePathsAndSendBackBytedata: function(aImagePathArr, aWorkerCallbackFulfill, aWorkerCallbackReject) {
		// aImagePathArr is an arrya of os paths to the images to load
		// this will load the images, then draw to canvas, then get get image data, then get array buffer/Bytedata for each image, and transfer object back it to the worker
	},
	testMT: function() {
		console.log('in testMT on mainthread arguments:', arguments);
		// start return sync test
		// return ['arg1', 'and arg2'];
		// start returning promise test
		var mainDeferred_testMT = new Deferred();
		
		var aTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
		aTimer.initWithCallback({
			notify: function() {
				console.log('timer up will resolve deferred');
				mainDeferred_testMT.resolve(['resolved arg1', 'and resolved arg2'])
			}
		}, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
		
		return mainDeferred_testMT.promise;
	},
	fwInstances: {}, // frameworker instances, obj with id is aId which is arg of setupFrameworker
	setupFrameworker: function(aId) {
		// aId is the id to create frameworker with
		console.log('mainthread: setupFrameworker, aId:', aId);

		var deferredMain_setupFrameworker = new Deferred();
		
		var aWindow = Services.wm.getMostRecentWindow('navigator:browser');
		var aDocument = aWindow.document;
		
		var doAfterAppShellDomWinReady = function() {
			var aBrowser = aDocument.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'browser');
			aBrowser.setAttribute('data-icon-container-generator-id', aId);
			aBrowser.setAttribute('remote', 'true');
			aBrowser.setAttribute('type', 'content');
			aBrowser.setAttribute('style', 'height:100px;border:10px solid steelblue;');
			aBrowser.setAttribute('src', 'data:text/html,back to content');
			
			ICGenWorkerFuncs.fwInstances[aId] = {
				browser: aBrowser,
				callbacks: {
					frameworkerReady: function() {
						deferredMain_setupFrameworker.resolve(['ok send me imgs now baby']);
					}
				},
				listener: { // framescript msg listener
					receiveMessage: function(aMsgEvent) {
						var aMsgEventData = aMsgEvent.data;
						console.log('ICGenWorkerFuncs.fwInstances[aId] getting aMsgEventData:', aMsgEventData);
						// aMsgEvent.data should be an array, with first item being the unfction name in bootstrapCallbacks
						aMsgEventData.push(aMsgEvent);
						var funcName = aMsgEventData.shift();
						if (funcName in ICGenWorkerFuncs.fwInstances[aId].callbacks) {
							ICGenWorkerFuncs.fwInstances[aId].callbacks[funcName].apply(null, aMsgEventData);
						}
					}
				}
			};
			
			aDocument.documentElement.appendChild(aBrowser);
			console.error('aBrowser.messageManager:', aBrowser.messageManager);
			aBrowser.messageManager.loadFrameScript(core.addon.path.scripts + 'fsReturnIconset.js', false);
			
			Services.mm.addMessageListener(core.addon.id, ICGenWorkerFuncs.fwInstances[aId].listener);
		};
		
		
		if (aDocument.readyState == 'complete') {
			doAfterAppShellDomWinReady();
		} else {
			aWindow.addEventListener('load', function() {
				aWindow.removeEventListener('load', arguments.callee, false);
				doAfterAppShellDomWinReady();
			}, false);
		}
		
		return deferredMain_setupFrameworker.promise;
	},
	destroyFrameworker: function(aId) {
		
		var aTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
		aTimer.initWithCallback({
			notify: function() {
					console.error('will now destory remote browser, i hope this will trigger the framescript unload event, because that removes the listener, otherwise i think that the attached message listener from that framescript stays alive somehow');
					ICGenWorkerFuncs.fwInstances[aId].browser.parentNode.removeChild(ICGenWorkerFuncs.fwInstances[aId].browser); // im hoping this triggers the unload event on framescript
					Services.mm.removeMessageListener(core.addon.id, ICGenWorkerFuncs.fwInstances[aId].listener);
					delete ICGenWorkerFuncs.fwInstances[aId];
			}
		}, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
		

	}
	tellFrameworkerLoadImg: function(aImgPath) {
		var deferredMain_tellFrameworkerLoadImg = new Deferred();
		sendAsyncMessageWithCallback(ICGenWorkerFuncs.fwInstances[aId].browser.messageManager, core.addon.id, ['loadImg', aImgPath], ICGenWorkerFuncs.fwInstances[aId].callbacks, function(aImgDataObj) {
			deferredMain_tellFrameworkerLoadImg.resolve(aImgDataObj);
		});
		return deferredMain_tellFrameworkerLoadImg.promise;
	}
	/*
	loadImgGetImgData: function(aImgPath) {
		// aImgPath must be http or file uri NOT os path
		var deferredMain_loadImgGetImgData = new Deferred();
		
		var img = new Services.appShell.hiddenDOMWindow.Image();
		
		img.onload = function() {
			var can = Services.appShell.hiddenDOMWindow.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
			var ctx = 
		};
		img.onabort = handleImgAbort function() {
			
		};
		img.onerror = handleImgError function() {
			
		};
		
		return deferredMain_loadImgGetImgData.promise;
	}
	*/
};

var fsMsgListener = { // framescript msg listener
	receiveMessage: function(aMsgEvent) {
		var aMsgEventData = aMsgEvent.data;
		console.log('bootstrap getting aMsgEventData:', aMsgEventData);
		// aMsgEvent.data should be an array, with first item being the unfction name in bootstrapCallbacks
		aMsgEventData.push(aMsgEvent);
		var funcName = aMsgEvent.data.shift();
		if (funcName in bootstrap) {
			bootstrap[funcName].apply(null, aMsgEventData);
		}
	}
};

function appFunc_generateFiles(argsForWorkerReturnIconset, aFrameScriptMessageEvent) {
	console.log('in appFunc_generateFiles, arguments:', arguments);
	argsForWorkerReturnIconset.splice(0, 0, 'returnIconset'); // add in func name for my style of postMessage
	ICGenWorker.postMessageWithCallback(argsForWorkerReturnIconset, function(aStatusObj) {
		console.log('returnIconset completed, aStatusObj:', aStatusObj);
		aFrameScriptMessageEvent.target.messageManager.sendAsyncMessage(core.addon.id, ['generateFiles_response', aStatusObj]);
	});
}
// END - Addon Functionalities

function install() {}

function uninstall(aData, aReason) {
	if (aReason == ADDON_UNINSTALL) {
		// delete prefs
	}
}

function startup(aData, aReason) {
	// core.addon.aData = aData;
	extendCore();
	
	// startup worker
	var promise_getICGenWorker = SICWorker('ICGenWorker', core.addon.path.workers + 'ICGenWorker.js', ICGenWorkerFuncs);
	promise_getICGenWorker.then(
		function(aVal) {
			console.log('Fullfilled - promise_getICGenWorker - ', aVal);
			// start - do stuff here - promise_getICGenWorker
			ICGenWorker.postMessageWithCallback(['testWK'], function() {
				console.log('in mt callback with arguments:', arguments);
			})
			// end - do stuff here - promise_getICGenWorker
		},
		function(aReason) {
			var rejObj = {
				name: 'promise_getICGenWorker',
				aReason: aReason
			};
			console.warn('Rejected - promise_getICGenWorker - ', rejObj);
		}
	).catch(
		function(aCaught) {
			var rejObj = {
				name: 'promise_getICGenWorker',
				aCaught: aCaught
			};
			console.error('Caught - promise_getICGenWorker - ', rejObj);
		}
	);
	
	// register about page
	aboutFactory_iconcontainergenerator = new AboutFactory(AboutIconContainerGenerator);

	// register framescript listener
	Services.mm.addMessageListener(core.addon.id, fsMsgListener);
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }
	
	if (ICGenWorker) {
		ICGenWorker.terminate();
		delete bootstrap.ICGenWorker;
		console.error('terminated');
	}
	
	console.error('should have terminated');
	// an issue with this unload is that framescripts are left over, i want to destory them eventually
	aboutFactory_iconcontainergenerator.unregister();
	
	// unregister framescript listener
	Services.mm.removeMessageListener(core.addon.id, fsMsgListener);
}

// start - common helper functions
function Deferred() {
	if (Promise && Promise.defer) {
		//need import of Promise.jsm for example: Cu.import('resource:/gree/modules/Promise.jsm');
		return Promise.defer();
	} else if (PromiseUtils && PromiseUtils.defer) {
		//need import of PromiseUtils.jsm for example: Cu.import('resource:/gree/modules/PromiseUtils.jsm');
		return PromiseUtils.defer();
	} else if (Promise) {
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
			console.error('Promise not available!', ex);
			throw new Error('Promise not available!');
		}
	} else {
		throw new Error('Promise not available!');
	}
}

const SIC_CB_PREFIX = '_a_gen_cb_'; // rev6
function SICWorker(workerScopeName, aPath, aFuncExecScope=bootstrap, aCore=core) {
	// creates a global variable in bootstrap named workerScopeName which will hold worker, do not set up a global for it like var Blah; as then this will think something exists there
	// aScope is the scope in which the functions are to be executed
	// ChromeWorker must listen to a message of 'init' and on success of it, it should sendMessage back saying aMsgEvent.data == {aTopic:'init', aReturn:true}
	// "Start and Initialize ChromeWorker" // based on SIPWorker
	// returns promise
		// resolve value: jsBool true
	// aCore is what you want aCore to be populated with
	// aPath is something like `core.addon.path.content + 'modules/workers/blah-blah.js'`	
	var deferredMain_SICWorker = new Deferred();

	if (!(workerScopeName in bootstrap)) {
		bootstrap[workerScopeName] = new ChromeWorker(aPath);
		
		if ('addon' in aCore && 'aData' in aCore.addon) {
			delete aCore.addon.aData; // we delete this because it has nsIFile and other crap it, but maybe in future if I need this I can try JSON.stringify'ing it
		}
		
		var afterInitListener = function(aMsgEvent) {
			// note:all msgs from bootstrap must be postMessage([nameOfFuncInWorker, arg1, ...])
			var aMsgEventData = aMsgEvent.data;
			console.log('mainthread receiving message:', aMsgEventData);
			
			// postMessageWithCallback from worker to mt. so worker can setup callbacks after having mt do some work
			var callbackPendingId;
			if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SIC_CB_PREFIX) == 0) {
				callbackPendingId = aMsgEventData.pop();
			}
			
			var rez_mainthread_call = aFuncExecScope[aMsgEventData.shift()].apply(null, aMsgEventData);
			
			if (callbackPendingId) {
				if (rez_mainthread_call.constructor.name == 'Promise') {
					rez_mainthread_call.then(
						function(aVal) {
							bootstrap[workerScopeName].postMessage([callbackPendingId, aVal]);
						},
						function(aReason) {
							bootstrap[workerScopeName].postMessage([callbackPendingId, ['promise_rejected', aReason]]);
						}
					).catch(
						function(aCatch) {
							bootstrap[workerScopeName].postMessage([callbackPendingId, ['promise_rejected', aReason]]);
						}
					);
				} else {
					// assume array
					bootstrap[workerScopeName].postMessage([callbackPendingId, rez_mainthread_call]);
				}
			}
		};
		
		var beforeInitListener = function(aMsgEvent) {
			// note:all msgs from bootstrap must be postMessage([nameOfFuncInWorker, arg1, ...])
			var aMsgEventData = aMsgEvent.data;
			if (aMsgEventData[0] == 'init') {
				bootstrap[workerScopeName].removeEventListener('message', beforeInitListener);
				bootstrap[workerScopeName].addEventListener('message', afterInitListener);
				deferredMain_SICWorker.resolve(true);
				if ('init' in aFuncExecScope) {
					aFuncExecScope[aMsgEventData.shift()].apply(null, aMsgEventData);
				}
			}
		};
		
		// var lastCallbackId = -1; // dont do this, in case multi SICWorker's are sharing the same aFuncExecScope so now using new Date().getTime() in its place // link8888881
		bootstrap[workerScopeName].postMessageWithCallback = function(aPostMessageArr, aCB, aPostMessageTransferList) {
			// lastCallbackId++; // link8888881
			var thisCallbackId = SIC_CB_PREFIX + new Date().getTime(); // + lastCallbackId; // link8888881
			aFuncExecScope[thisCallbackId] = function() {
				delete aFuncExecScope[thisCallbackId];
				// console.log('in mainthread callback trigger wrap, will apply aCB with these arguments:', arguments, 'turned into array:', Array.prototype.slice.call(arguments));
				aCB.apply(null, arguments[0]);
			};
			aPostMessageArr.push(thisCallbackId);
			// console.log('aPostMessageArr:', aPostMessageArr);
			bootstrap[workerScopeName].postMessage(aPostMessageArr, aPostMessageTransferList);
		};
		
		bootstrap[workerScopeName].addEventListener('message', beforeInitListener);
		bootstrap[workerScopeName].postMessage(['init', aCore]);
		
	} else {
		deferredMain_SICWorker.reject('Something is loaded into bootstrap[workerScopeName] already');
	}
	
	return deferredMain_SICWorker.promise;
	
}

const SAM_CB_PREFIX = '_sam_gen_cb_';
function sendAsyncMessageWithCallback(aMessageManager, aGroupId, aMessageArr, aCallbackScope, aCallback) {
	var thisCallbackId = SIC_CB_PREFIX + new Date().getTime();
	aCallbackScope = aCallbackScope ? aCallbackScope : bootstrap;
	aCallbackScope[thisCallbackId] = function(aMessageArr) {
		delete aCallbackScope[thisCallbackId];
		aCallback.apply(null, aMessageArr);
	}
	aMessageArr.push(thisCallbackId);
	aMessageManager.sendAsyncMessage(aGroupId, aMessageArr);
}