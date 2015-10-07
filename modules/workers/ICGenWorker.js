'use strict';

// Imports
importScripts('resource://gre/modules/osfile.jsm');
importScripts('resource://gre/modules/workers/require.js');
// var child_process = require('sdk/system/child_process');
// console.error('child_process:', child_process);

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

// Setup SICWorker - rev6
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
	
	var funcName = aMsgEventData.shift();
	
	if (funcName in WORKER) {
		var rez_worker_call = WORKER[funcName].apply(null, aMsgEventData);
		
		if (callbackPendingId) {
			if (rez_worker_call.constructor.name == 'Promise') {
				rez_worker_call.then(
					function(aVal) {
						// aVal must be array
						self.postMessage([callbackPendingId, aVal]);
					},
					function(aReason) {
						self.postMessage([callbackPendingId, ['promise_rejected', aReason]]);
					}
				).catch(
					function(aCatch) {
						self.postMessage([callbackPendingId, ['promise_rejected', aReason]]);
					}
				);
			} else {
				// assume array
				self.postMessage([callbackPendingId, rez_worker_call]);
			}
		}
	}
	else { console.warn('funcName', funcName, 'not in scope of WORKER') } // else is intentionally on same line with console. so on finde replace all console. lines on release it will take this out

};

// set up postMessageWithCallback so chromeworker can send msg to mainthread to do something then return here. must return an array, thta array is arguments applied to callback
self.postMessageWithCallback = function(aPostMessageArr, aCB, aPostMessageTransferList) {
	var aFuncExecScope = WORKER;
	
	var thisCallbackId = SIC_CB_PREFIX + new Date().getTime();
	aFuncExecScope[thisCallbackId] = function() {
		delete aFuncExecScope[thisCallbackId];
		console.log('in worker callback trigger wrap, will apply aCB with these arguments:', arguments);
		aCB.apply(null, arguments[0]);
	};
	aPostMessageArr.push(thisCallbackId);
	self.postMessage(aPostMessageArr, aPostMessageTransferList);
};

function testWK() {
	console.log('in testWK');
	// start return sync test
	// return ['arg1', 'arg2'];
	// start returning promise test
	var mainDeferred_testWK = new Deferred();
	
	setTimeout(function() {
		console.log('timer up will resolve deferred');
		mainDeferred_testWK.resolve(['resd arg1', 'resd arg2']);
	}, 1000);
	
	return mainDeferred_testWK.promise;
}

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
	
	setTimeout(function() {
		self.postMessageWithCallback(['testMT'], function() {
			console.log('back in worker cb with arguments:', JSON.stringify(arguments));
		});
	}, 5000);
}

// Start - Addon Functionality

var lastFrameworkerId = -1;
function returnIconset(aCreateType, aCreateName, aCreatePathDir, aBaseSrcImgPathArr, aOutputSizesArr, aOptions={}) {
	console.log('in worker returnIconset, arguments:', JSON.stringify(arguments));
	
	// aCreateType - string. future plan to support things like tiff. in future maybe make this an arr, so can make multiple types in one shot.
		// ico - can be done on any os
		// linux - installation part is linux dependent
		// icns - requires mac, as i use iconutils
	// aCreateName - same across all os, name to create icon container with
	// aCreatePathDir
		// win and mac - os path to directory you want icon written to, it will writeAtomic
		// linux - array of theme names, if null, it will default to ['hicolor']. if themes provided, 'hicolor' is not pushed in, so include it if you want it.
	// aBaseSrcImgPathArr
		// same across all os - os paths of images to be used as sources for bases, the sizes will be auto determined, if any of them are not square it will throw
	// aOutputSizesArr - sizes wanted in iconset
		// win and linux - array of sizes wanted. so if just 1, will iconset will only include 1
			// win recommendation: [16, 32, 48, 64, 256] // only vista uses 64, so can ommit that
			// linux recommendation: [16, 24, 48, 96]
		// mac - leave null. as default has to be used of [16, 32, 64, 128, 256, 512, 1024] no choices about it
	// aOptions.aBadge (if >0 then must provide aBadgeSrcImgPathArr and aBageSizePerIconSize)
		// 0 - default - no badge`
		// 1 - badge it topleft
		// 2 - topright
		// 3 - bottomleft
		// 4 - bottomright
	// aOptions.aBadgeSrcImgPathArr
		// same across all os - os paths of images to be used as sources for badges, the sizes will be auto determined, if any of them are not square it will throw
	// aOptions.aBadgeSizePerOutputSize
		// same across all os - obj key value pair. key is base size, value is badge size. the size the badge should be scaled to for the output icon size
	// aOptions.saveScaledBadgeDir
		// same across all os - set to a os path if you want the scaled badges to be saved, will be pngs
	// aOptions.saveScaledBaseDir
		// same across all os - set to a os path if you want the scaled bases to be saved, will be pngs
	// aOptions.saveScaledIconDir
		// same across all os - set to a os path if you want the final before making ico or icns to be saved, if saveScaledBadgeDir is not set, then this is same as saveScaledBaseDir
	// aOptions.dontMakeIconContainer - bool
		// linux - wont install to shared dirs
		// ico - wont make ico
		// mac - wont make icns
		// this is if just want to saved the Scaled images to a dir and dont want to make the icon right away
	// aOptions.aScalingAlgo
		// 0 - jagged first - default
		// 1 - blurry first
		
	// return value - [aStatusObj, BLAH]
		// BLAH is:
			// on linux it installs the pngs to the appropriate folders, a string name to use, which will be same as aCreateName
			// on windows it ico path
			// on mac it an icns path
	
	// this function does what:
		// windows: creates ico named aOptions.create_Name at given aOptions.create_OSPath
		// mac: creates icns at given target path
		// linux: creates png in each of the root(user) hicolor(or theme name provided) folders named aOptions.create_Name
			// if go root will need to provide sudo password
			// aOptions.linuxLevel - bit flags
				// 0 - default - user only
				// 1 - root only
				// 2 - user and root
			// aOptions.linuxSudoPassword - needed if you want to write to root
			// aOptions.themes - array of theme names to install to
				// if null will install just to hicolor theme, if pass array, make sure to pass in hicolor, as it wont default push in hicolor
	
	// pass in paths of images for base
	// pass in paths of images for badge optional
	// if badge paths passed, tell what location you want it badged 0=topleft 1=topright 2=bottomleft 3=bottomright
	// if want badged, tell for each base size, what size of badge you want, if > 1 it will use that absolution size, if <= 1 it will calc badge size based on base size. so 1/3 would make it be .333 * base size
	
	var aOptionsDefaults = {
		aBadge: 0,
		aBadgeSrcImgPathArr: null,
		aBadgeSizePerOutputSize: null,
		saveScaledBadgeDir: null,
		saveScaledBaseDir: null,
		saveScaledIconDir: null,
		dontMakeIconContainer: false,
		aScalingAlgo: 0
	};
	
	// make sure no unknown/unsupported options were specified by devuser
	for (var aOpt in aOptions) {
		if (!(aOpt in aOptionsDefaults)) {
			// throw new Error('option name of ' + aOpt + ' was found in devuser aOptions object, this is an unsupported option');
			return {status:'fail', reason:'option name of ' + aOpt + ' was found in devuser aOptions object, this is an unsupported option'}
		}
	}
	
	// set the undeclared options in aOptions to the default
	for (var aOpt in aOptionsDefaults) {
		if (!(aOpt in aOptions)) {
			aOptions[aOpt] = aOptionsDefaults[aOpt];
		}
	}
	
	// start - validation of args
	// check aCreateType is supported
	const createTypeIcns = 'ICNS';
	const createTypeIco = 'ICO';
	const createTypeLinux = 'Linux';
	
	// ensure aCreateType is one that i support, and ensure the platform supports processing of this type
	switch (aCreateType) {
		case createTypeIcns:
			
				if (core.os.name != 'darwin') {
					return [{
						status: 'fail',
						reason: 'icns can only be created on mac operating system, and you are not on a mac',
						reasonShort: 'wrong platform'
					}];
				}
				
			break;
		case createTypeIco:
			
				// supported on all operating systems
				
			break;
		case createTypeLinux:
			
				if (core.os.name != 'linux') {
					return [{
						status: 'fail',
						reason: 'linux icon install can only be done on linux operating system, and you are not on a linux',
						reasonShort: 'wrong platform'
					}];
				}
				
			break;
		default:
			// throw new Error('unrecognized aCreateType:' + aCreateType);
			return [{
				status: 'fail',
				reason: 'unrecognized aCreateType: ' + aCreateType
			}];
	}
	
	// ensure aCreateName is not blank, this function will handle making it os safe
	if (!aCreateName || aCreateName == '') {
			// throw new Error('aCreateName is blank');
			return [{
				status: 'fail',
				reason: 'aCreateName is blank'
			}];
	}
	
	// aBaseSrcImgPathArr check, need at least one
	if (!aBaseSrcImgPathArr || !Array.isArray(aBaseSrcImgPathArr) || aBaseSrcImgPathArr.length == 0) {
		// throw new Error('must provide at least one BASE image');
		return [{
			status: 'fail',
			reason: 'must provide at least one BASE image'
		}];
	}
	
	// aOutputSizesArr check, need at least one
	if (!aOutputSizesArr || !Array.isArray(aOutputSizesArr) || aOutputSizesArr.length == 0) {
		// throw new Error('must provide at least one OUTPUT SIZE');
		return [{
			status: 'fail',
			reason: 'must provide at least one OUTPUT SIZE'
		}];
	}
	
	// validate aCreatePathDir
	if (aCreateType == createTypeLinux) {
		if (aCreatePathDir) {
			return [{
				status: 'fail',
				reason: 'for "Linux Intall" you cannot specify aCreatePathDir as the directories are automatically discovered'
			}];
		}
		aCreatePathDir = {};
		// just platform check here, as this is validation section, i dont fill in the directories here for linux, but i did make aCreatePathDir an object
		if (core.os.toolkit.indexOf('gtk') == 0) {
			
		} else {
			// its QT
			throw new Error('qt linux not yet supported, only support gtk systems as of now')
			return [{
				status: 'fail',
				reason: 'qt linux not yet supported, only support gtk systems as of now',
				reasonShort: 'unsupported platform'
			}];
		}
	} else {
		if (!aCreatePathDir || aCreatePathDir == '') {
			return [{
				status: 'fail',
				reason: 'must provide a directory in which to output the icon container'
			}];
		}
	}
	
	// validate dontMakeIconContainer
	if (aOptions.dontMakeIconContainer) {
		if (!aOptions.saveScaledBadgeDir && !aOptions.saveScaledBaseDir && !aOptions.saveScaledIconDir) {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'devuser specified not to create icon container, SO then MUST specify o save the scaled as pngs to a directory, otherwise its pointless calling this function'
			}];
		}
	}
	
	// ensure the output sizes are parseInt'ed
	for (var i=0; i<aOutputSizesArr.length; i++) {
		aOutputSizesArr[i] = parseInt(aOutputSizesArr[i]);
	}
	
	// with respect to badge now
	if (aOptions.aBadge != 0) {
		// make sure aBadge is right
		if (aOptions.aBadge < 0 || aOptions.aBadge > 4) {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'aOptions.aBadge must be 0, 1, 2, 3, or 4'
			}];
		}
		
		// aBadgeSrcImgPathArr check, need at least one
		if (!aOptions.aBadgeSrcImgPathArr || !Array.isArray(aOptions.aBadgeSrcImgPathArr) || aOptions.aBadgeSrcImgPathArr.length == 0) {
			// throw new Error('must provide at least one Badge image');
			return [{
				status: 'fail',
				reason: 'must provide at least one BADGE image as devuser specified aBadge not to be 0, meaning he wants a badge'
			}];
		}
		
		// ensure aBadgeSizePerOutputSize is an object, and all sizes from aOutputSizesArr are found in here as keys
		if (!aOptions.aBadgeSizePerOutputSize || typeof aOptions.aBadgeSizePerOutputSize !== 'object') {
			return [{
				status: 'fail',
				reason: 'as devuser wants a badge, you must specify aOptions.aBadgeSizePerOutputSize as a key value pair, with keys being all the sizes found in aOutputSizesArr'
			}];
		}
		// ensure all sizes in aOutputSizesArr are in aOptions.aBadgeSizePerOutputSize
		for (var i=0; i<aOutputSizesArr.length; i++) {
			if (!(aOutputSizesArr[i] in aOptions.aBadgeSizePerOutputSize)) {
				return [{
					status: 'fail',
					reason: 'aOutputSizesArr contains an icon size of "' + aOutputSizesArr[i] + '" HOWEVER this size was not found in your aOptions.aBadgeSizePerOutputSize, you must include it! and make sure to give it a decimal (ratio) between > 0 and <1 or a px size > 1'
				}];
			}
		}
		// ensure there are no extras in aOptions.aBadgeSizePerOutputSize
		// also ensures that the values are parseFloat'ed
		for (var aOutputSize in aOptions.aBadgeSizePerOutputSize) {
			if (aOutputSizesArr.indexOf(parseInt(aOutputSize)) == -1) {
				return [{
					status: 'fail',
					reason: 'aOptions.aBadgeSizePerOutputSize contains an icon size of "' + aOutputSize + '" HOWEVER this size was not found in your aOutputSizesArr, you must either include this size in aOutputSizesArr or exclude it from aOptions.aBadgeSizePerOutputSize'
				}];
			}
			aOutputSizesArr[aOutputSize] = parseFloat(aOutputSizesArr[aOutputSize]);
		}
		
		// make sure saveScaledBaseDir is not blank if its set
		if (aOptions.saveScaledBaseDir === '') {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'aOptions.saveScaledBaseDir cannot be a blank string'
			}];
		}
		
		// make sure saveScaledBadgeDir is not blank if its set
		if (aOptions.saveScaledBadgeDir === '') {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'aOptions.saveScaledBadgeDir cannot be a blank string'
			}];
		}
	} else {
		// aBadge is 0
		
		// will not do any scaling of badges so cannot
		if (aOptions.saveScaledBadgeDir) {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'aOptions.aBadge is 0, but devuser is asking to save scaled badges, this is not possible, devuser is an idiot'
			}];
		}
		
		// base == icon, devuser should do saveScaledIconDir instead of doing saveScaledBaseDir
		if (aOptions.saveScaledBaseDir) {
			// throw new Error();
			return [{
				status: 'fail',
				reason: 'aOptions.aBadge is 0, so there is no badge just a base, and devuser is asking to save scaled bases, just mark saveScaledIconDir, as icon==base, not so ridiculous but im making that clear to you now'
			}];
		}
	}
	
	// make sure saveScaledIconDir is not blank if its set
	if (aOptions.saveScaledIconDir === '') {
		// throw new Error();
		return [{
			status: 'fail',
			reason: 'aOptions.saveScaledIconDir cannot be a blank string'
		}];
	}
	
	// end - validation of args // ok so in validation things that should have been numbers have been parseInt'ed and floats parseFloat'ed lets now start processing
	
	// start processing - this strategy will use callbacks on worker to get mainthread to do canvas stuff, but this strategy is designed with a future of workers having canvas
	var deferredMain_returnIconset = new Deferred();
	
	// start - globals for steps
	var fwId;
	var destroyFrameworker; // step0 sets this to a function i call to clean up
	var imgPathData = {}; //keys are image path, and value is object holding data
	// end - globals for steps
	
	var step0 = function() {
		console.log('worker: step0');
		// setup frameworker
		lastFrameworkerId++;
		fwId = lastFrameworkerId;
		self.postMessageWithCallback(['setupFrameworker', fwId], step1);
	};
	
	var step1 = function(msgFrom_fsReturnIconset_onPageReady) {
		console.log('worker: step1');
		console.log('msgFrom_fsReturnIconset_onPageReady:', msgFrom_fsReturnIconset_onPageReady);
		self.postMessage(['destroyFrameworker', fwId]);
		deferredMain_returnIconset.resolve([{
			status: 'ok',
			reason: 'temporary resolve for now'
		}]);
		return; // :debug;
		// send message to mainthread for each image path, mainthread should load it into an <img> and then send back arraybuffer, with height and width. or if onabort or onerror of image load it should tell us why. but leave the checking for square and etc to chromeworker after it receives it
			// mainthread will create <img> then after load create canvas, then getImageData, then transfer back arrbuf with height and width
		var promiseAllArr_loadImgAndGetImgDatas = [];
		
		
		
		var promiseAll_loadImgAndGetImgDatas = Promise.all(promiseAllArr_loadImgAndGetImgDatas);
		promiseAll_loadImgAndGetImgDatas.then(
			function(aVal) {
				console.log('Fullfilled - promiseAll_loadImgAndGetImgDatas - ', aVal);
				// start - do stuff here - promiseAll_loadImgAndGetImgDatas
				// check image dimensions and push to obj
				deferredMain_returnIconset.resolve([{
					status: 'ok',
					reason: 'temporary resolve for now'
				}])
				// end - do stuff here - promiseAll_loadImgAndGetImgDatas
			},
			function(aReason) {
				var rejObj = {name:'promiseAll_loadImgAndGetImgDatas', aReason:aReason};
				console.warn('Rejected - promiseAll_loadImgAndGetImgDatas - ', rejObj);
				deferredMain_returnIconset.reject(rejObj);
			}
		).catch(
			function(aCaught) {
				var rejObj = {name:'promiseAll_loadImgAndGetImgDatas', aCaught:aCaught};
				console.error('Caught - promiseAll_loadImgAndGetImgDatas - ', rejObj);
				deferredMain_returnIconset.reject(rejObj);
			}
		);
	};
	
	var step2 = function() {
		// on receive of arrbuf, height, width, error (arrbuf should be transfered back)
			// if error cancel whole process
			// check if square
			// all tests pass then put base datas into base object. and badge datas into badge object, with key being size
	};
	
	var step3 = function() {
		// go through all base arrbufs and badge arrbufs, check if we have the size needed for final output, if not, then for each that we need, send message to mainthread with the arrbuf, and width and height needed (i should calc here the width and height needed based on aOptions.aScalingAlgo) ---- mainthread will make an imagedata out of it, it will make a canvas, then it will draw to it, then send back the arrbuf - and it will clean up everything on mainthread side memorywise
	};
	
	var step4 = function() {
		// check if aOptions.saveScaledBadgeDir and aOptions.saveScaledBaseDir are set, if they are then save them to directories
	};
	
	var step5 = function() {
		// if badge is needed, the base and badges were already sized so just pick the one needed and send to mainthread, tell it where to place the badge on base ----- mainthread will badge it, then send back arrbuf
	};
	
	var step6 = function() {
		// if aOptions.saveScaledIconDir then save them
	};
	
	var step7 = function() {
		// if aOptions.dontMakeIconContainer is true, then quit with message success
		// else if aOptions.dontMakeIconContainer is false then
			// do ICNS, ICO, Linux specific stuff
	};
	
	var step8 = function() {
		// do ICNS, ICO, Linux specific stuff
		if (aCreateType == createTypeLinux) {
			// :todo: turn aCreatePathDir into an object with key being size (square of course) of final output icons, and paths to the respective system folder to output the png's/svg to
			// :todo; offer aOption.sudoPassword if they do that then i should write to root/share/icons. but for now and default is to write to user_home/share/icons FOR NON-QT so meaning for gtk
			// aCreatePathDir = {}; // already made into an object in validation section above
			if (core.os.toolkit.indexOf('gtk') == 0) {
				// populate aCreatePathDir, which is now an object, with key of icon size, and value of path to write it in
			} else {
				// its QT
				// not yet supported, validation section above will throw
			}
		}
	};
	
	step0();
	
	return deferredMain_returnIconset.promise; // return [{status:'ok', reason:'~~made iconset~~'}];
}
// End - Addon Functionality


// Start - Common Functions
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
		console.error('Promise not available!', ex);
		throw new Error('Promise not available!');
	}
}

// End - Common Functions