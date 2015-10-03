'use strict';

// Imports
importScripts('resource://gre/modules/osfile.jsm');
importScripts('resource://gre/modules/workers/require.js');

// Globals
var core = { // have to set up the main keys that you want when aCore is merged from mainthread in init
	addon: {
		path: {
			content: 'chrome://icon-container-generator/content/',
		}
	},
	os: {
		name: OS.Constants.Sys.Name.toLowerCase()
	}
};
var WORKER = this;
var OSStuff = {}; // global vars populated by init, based on OS

// Imports that use stuff defined in chrome
// I don't import ostypes_*.jsm yet as I want to init core first, as they use core stuff like core.os.isWinXP etc
// imported scripts have access to global vars on MainWorker.js
importScripts(core.addon.path.content + 'modules/cutils.jsm');
importScripts(core.addon.path.content + 'modules/ctypes_math.jsm');

// Setup SICWorker - 10/3/15
// instructions on using SICWorker
	// to call a function in the main thread function scope (which was determiend on SICWorker call from mainthread) from worker, so self.postMessage with array, with first element being the name of the function to call in mainthread, and the reamining being the arguments
	// the return value of the functions here, will be sent to the callback, IF, worker did worker.postWithCallback
const SIC_CB_PREFIX = '_a_gen_cb_';
self.onmessage = function(aMsgEvent) {
	// note:all msgs from bootstrap must be postMessage([nameOfFuncInWorker, arg1, ...])
	var aMsgEventData = aMsgEvent.data;
	
	console.log('worker receiving msg:', aMsgEventData);
	
	var callbackPendingId;
	if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SIC_CB_PREFIX) == 0) {
		callbackPendingId = aMsgEventData.pop();
	}
	
	if (callbackPendingId) {
		var rez_worker_call = WORKER[aMsgEventData.shift()](aMsgEventData);
		self.postMessage([callbackPendingId, rez_worker_call]);
	} else {
		WORKER[aMsgEventData.shift()].apply(null, aMsgEventData);
	}
};

// set up postMessageWithCallback so chromeworker can send msg to mainthread to do something then return here
self.postMessageWithCallback = function(aPostMessageArr, aCB, aPostMessageTransferList) {
	var aFuncExecScope = WORKER;
	
	var thisCallbackId = SIC_CB_PREFIX + new Date().getTime();
	aFuncExecScope[thisCallbackId] = function(dataSent) {
		delete aFuncExecScope[thisCallbackId];
		aCB(dataSent);
	};
	aPostMessageArr.push(thisCallbackId);
	self.postMessage(aPostMessageArr, aPostMessageTransferList);
};

////// end of imports and definitions
function init(objCore) {
	//console.log('in worker init');
	
	// merge objCore into core
	// core and objCore is object with main keys, the sub props
	
	core = objCore;
	
	// I import ostypes_*.jsm in init as they may use things like core.os.isWinXp etc
	switch (core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			importScripts(core.addon.path.content + 'modules/ostypes_win.jsm');
			break
		case 'gtk':
			importScripts(core.addon.path.content + 'modules/ostypes_x11.jsm');
			break;
		case 'darwin':
			importScripts(core.addon.path.content + 'modules/ostypes_mac.jsm');
			break;
		default:
			throw new Error({
				name: 'addon-error',
				message: 'Operating system, "' + OS.Constants.Sys.Name + '" is not supported'
			});
	}
	
	// OS Specific Init
	switch (core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name) {
		default:
			// do nothing special
	}
	
	console.log('init worker done');
	
	self.postMessage(['init']);
	
	// setTimeout(function() {
		// self.postMessageWithCallback(['testMT'], function(aDataGot) {
			// console.log('back in worker cb with aDataGot:', aDataGot);
		// });
	// }, 5000);
}

// Start - Addon Functionality

function returnIconset(aCreateType, aCreateName, aCreatePathDir, aOutputSizesArr, aOptions={}) {
	// creates iconset
	console.log('in worker returnIconset, arguments:', JSON.stringify(arguments));
	
	var aOptionsDefaults = {
		
	};
	
	// make sure no unknown/unsupported options were specified by devuser
	for (var aOpt in aOptions) {
		if (!(aOpt in aOptionsDefaults)) {
			throw new Error('option name of ' + aOpt + ' was found in devuser aOptions object, this is an unsupported option');
		}
	}
	
	// set the undeclared options in aOptions to the default
	for (var aOpt in aOptionsDefaults) {
		if (!(aOpt in aOptions)) {
			aOptions[aOpt] = aOptionsDefaults[aOpt];
		}
	}
	
	return '~~made iconset~~';
}
// End - Addon Functionality


// Start - Common Functions


// End - Common Functions