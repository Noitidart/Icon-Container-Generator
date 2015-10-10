'use strict';

// Imports
importScripts('resource://gre/modules/osfile.jsm');
importScripts('resource://gre/modules/workers/require.js');
// var child_process = require('sdk/system/child_process');
// console.log('child_process:', child_process);

// Globals
var dummy = 0;
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
const SIC_TRANS_WORD = '_a_gen_trans_';
var sic_last_cb_id = -1;
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
						if (aVal.length >= 2 && aVal[aVal.length-1] == SIC_TRANS_WORD && Array.isArray(aVal[aVal.length-2])) {
							// to transfer in callback, set last element in arr to SIC_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to
							aVal.pop();
							self.postMessage([callbackPendingId, aVal], aVal.pop());
						} else {
							self.postMessage([callbackPendingId, aVal]);
						}
					},
					function(aReason) {
						console.error('aReject:', aReason);
						self.postMessage([callbackPendingId, ['promise_rejected', aReason]]);
					}
				).catch(
					function(aCatch) {
						console.error('aCatch:', aCatch);
						self.postMessage([callbackPendingId, ['promise_rejected', aCatch]]);
					}
				);
			} else {
				// assume array
				if (rez_worker_call.length > 2 && rez_worker_call[rez_worker_call.length-1] == SIC_TRANS_WORD && Array.isArray(rez_worker_call[rez_worker_call.length-2])) {
					// to transfer in callback, set last element in arr to SIC_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to
					rez_worker_call.pop();
					self.postMessage([callbackPendingId, rez_worker_call], rez_worker_call.pop());
				} else {
					self.postMessage([callbackPendingId, rez_worker_call]);
				}
				
			}
		}
	}
	else { console.warn('funcName', funcName, 'not in scope of WORKER') } // else is intentionally on same line with console. so on finde replace all console. lines on release it will take this out

};

// set up postMessageWithCallback so chromeworker can send msg to mainthread to do something then return here. must return an array, thta array is arguments applied to callback
self.postMessageWithCallback = function(aPostMessageArr, aCB, aPostMessageTransferList) {
	var aFuncExecScope = WORKER;
	
	sic_last_cb_id++;
	var thisCallbackId = SIC_CB_PREFIX + sic_last_cb_id;
	aFuncExecScope[thisCallbackId] = function() {
		delete aFuncExecScope[thisCallbackId];
		console.log('in worker callback trigger wrap, will apply aCB with these arguments:', uneval(arguments));
		aCB.apply(null, arguments[0]);
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
	// aBaseSrcImgPathArr check, ensure to duplicates maybe? if i do, then i should also do with aOptions.aBadgeSrcImgPathArr
	
	// aOutputSizesArr check, need at least one
	if (!aOutputSizesArr || !Array.isArray(aOutputSizesArr) || aOutputSizesArr.length == 0) {
		// throw new Error('must provide at least one OUTPUT SIZE');
		return [{
			status: 'fail',
			reason: 'must provide at least one OUTPUT SIZE'
		}];
	}
	
	// :todo: ensure no dupliates in aOutputSizesArr
	
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
		/* - its ok to have extras - besides theres a bug in here i think, i fixed arr to be [aOutputSizesArr.indexOf(parseInt(aOutputSize))] but havent verified it
		// ensure there are no extras in aOptions.aBadgeSizePerOutputSize
		// also ensures that the values are parseFloat'ed
		for (var aOutputSize in aOptions.aBadgeSizePerOutputSize) {
			if (aOutputSizesArr.indexOf(parseInt(aOutputSize)) == -1) {
				return [{
					status: 'fail',
					reason: 'aOptions.aBadgeSizePerOutputSize contains an icon size of "' + aOutputSize + '" HOWEVER this size was not found in your aOutputSizesArr, you must either include this size in aOutputSizesArr or exclude it from aOptions.aBadgeSizePerOutputSize'
				}];
			}
			aOutputSizesArr[aOutputSizesArr.indexOf(parseInt(aOutputSize))] = parseFloat(aOutputSizesArr[aOutputSizesArr.indexOf(parseInt(aOutputSize))]);
		}
		*/
		
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
	var imgPathData = {}; //keys are image path, and value is object holding data, this is for all, badge and base combined
	var imgPathData_base = {}; //keys are image path, and value is reference to entry in imgPathData
	var imgPathData_badge = {}; //keys are image path, and value is reference to entry in imgPathData
	var objOutputSizes = {}; // holds key of output size, and value is object holding what base to use and what badge to use and what size to draw it on, on the canvas
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
		// self.postMessage(['destroyFrameworker', fwId]);
		// deferredMain_returnIconset.resolve([{
			// status: 'ok',
			// reason: 'temporary resolve for now'
		// }]);
		// return; // :debug;
		
		// send message to mainthread for each image path, mainthread should load it into an <img> and then send back arraybuffer, with height and width. or if onabort or onerror of image load it should tell us why. but leave the checking for square and etc to chromeworker after it receives it
			// mainthread will create <img> then after load create canvas, then getImageData, then transfer back arrbuf with height and width
			// this step1 will check if error or abort on image load, and if so it aborts the process
				// else it puts it into imgPathData
		var promiseAllArr_loadImgAndGetImgDatas = [];
		
		var tellFrameworkerLoadImgCallback = function(aProvidedPath, aDeferred_loadImage, aImgInfoObj) {
			console.info('in callback of tellFrameworkerLoadImgCallback in worker, the arguments are:', uneval(arguments));
			if (aImgInfoObj.status == 'img-ok') {
				imgPathData[aProvidedPath].w = aImgInfoObj.w;
				imgPathData[aProvidedPath].h = aImgInfoObj.h;
				aDeferred_loadImage.resolve();
			} else {
				if (aImgInfoObj.status == 'img-abort') {
					aDeferred_loadImage.reject('<img> load was aborted on provided path "' + aProvidedPath + '"');
				} else if (aImgInfoObj.status == 'img-error') {
					aDeferred_loadImage.reject('Error on loading <img>, it may not be a real image file, for provided path "' + aProvidedPath + '"');
				} else {
					aDeferred_loadImage.reject('Failed to load <img> for unknown reason for provided path "' + aProvidedPath + '"');
				}
			}
		};
		
		for (var i=0; i<aBaseSrcImgPathArr.length; i++) {
			if ((aBaseSrcImgPathArr[i] in imgPathData)) { continue }
			
			imgPathData[aBaseSrcImgPathArr[i]] = {};
			imgPathData[aBaseSrcImgPathArr[i]].img_src = aBaseSrcImgPathArr[i].indexOf('://') > -1 ? aBaseSrcImgPathArr[i] : OS.Path.toFileURI(aBaseSrcImgPathArr[i]); // if path is a os path, convert it to file uri // :todo: add verification if not file uri and if not then convert. must be chrome:// resource:// http(s):// or file:// // so here i am guessing if it has no `://` then it is os path, so i convert it
			var deferred_loadImage = new Deferred();
			promiseAllArr_loadImgAndGetImgDatas.push(deferred_loadImage.promise);
			self.postMessageWithCallback(['tellFrameworkerLoadImg', imgPathData[aBaseSrcImgPathArr].img_src, fwId], tellFrameworkerLoadImgCallback.bind(null, aBaseSrcImgPathArr[i], deferred_loadImage));
		}
		
		if (aOptions.aBadge) {
			for (var i=0; i<aOptions.aBadgeSrcImgPathArr.length; i++) {
				if ((aOptions.aBadgeSrcImgPathArr[i] in imgPathData)) { continue }
				
				imgPathData[aOptions.aBadgeSrcImgPathArr[i]] = {};
				imgPathData[aOptions.aBadgeSrcImgPathArr[i]].img_src = aOptions.aBadgeSrcImgPathArr[i].indexOf('://') > -1 ? aOptions.aBadgeSrcImgPathArr[i] : OS.Path.toFileURI(aOptions.aBadgeSrcImgPathArr[i]); // if path is a os path, convert it to file uri // :todo: add verification if not file uri and if not then convert. must be chrome:// resource:// http(s):// or file:// // so here i am guessing if it has no `://` then it is os path, so i convert it
				var deferred_loadImage = new Deferred();
				promiseAllArr_loadImgAndGetImgDatas.push(deferred_loadImage.promise);
				self.postMessageWithCallback(['tellFrameworkerLoadImg', imgPathData[aOptions.aBadgeSrcImgPathArr[i]].img_src, fwId], tellFrameworkerLoadImgCallback.bind(null, aOptions.aBadgeSrcImgPathArr[i], deferred_loadImage));
			}
		}
		
		var promiseAll_loadImgAndGetImgDatas = Promise.all(promiseAllArr_loadImgAndGetImgDatas);
		promiseAll_loadImgAndGetImgDatas.then(
			function(aVal) {
				console.log('Fullfilled - promiseAll_loadImgAndGetImgDatas - ', aVal);
				// start - do stuff here - promiseAll_loadImgAndGetImgDatas
				step2();
				// end - do stuff here - promiseAll_loadImgAndGetImgDatas
			},
			function(aReason) {
				var rejObj = {name:'promiseAll_loadImgAndGetImgDatas', aReason:aReason};
				console.warn('Rejected - promiseAll_loadImgAndGetImgDatas - ', rejObj);
				self.postMessage(['destroyFrameworker', fwId]);
				deferredMain_returnIconset.resolve([{
					status: 'fail',
					reason: aReason, // its a string message, lets show it to the user
					rejObj: rejObj
				}]);
			}
		).catch(
			function(aCaught) {
				var rejObj = {name:'promiseAll_loadImgAndGetImgDatas', aCaught:aCaught};
				console.log('Caught - promiseAll_loadImgAndGetImgDatas - ', rejObj);
				self.postMessage(['destroyFrameworker', fwId]);
				deferredMain_returnIconset.resolve([{
					status: 'fail',
					reason: 'promise caught',
					rejObj: rejObj
				}]);
			}
		);
	};
	
	var step2 = function() {
		// on receive of arrbuf, height, width, error (arrbuf should be transfered back)
			// check if square
			// all tests pass then put base datas into base object. and badge datas into badge object, with key being size
		
		// check if all are sqaure
		for (var p in imgPathData) {
			if (imgPathData[p].w != imgPathData[p].h) {
				self.postMessage(['destroyFrameworker', fwId]);
				deferredMain_returnIconset.resolve([{
					status: 'fail',
					reason: 'Image at provided path of "' + p + '" is not square (width and height are not equal). You must supply only square images'
				}]);
				return;
			}
		}
	
		// ok all tests passed
		// push to imgPathData_base and imgPathData_badge
		for (var i=0; i<aBaseSrcImgPathArr.length; i++) {
			imgPathData_base[aBaseSrcImgPathArr[i]] = imgPathData[aBaseSrcImgPathArr[i]];
		}

		if (aOptions.aBadgeSrcImgPathArr) {
			for (var i=0; i<aOptions.aBadgeSrcImgPathArr.length; i++) {
				imgPathData_badge[aOptions.aBadgeSrcImgPathArr[i]] = imgPathData[aOptions.aBadgeSrcImgPathArr[i]];
			}
		}
		
		step3();
	};
	
	var step3 = function() {
		// figures out of the proivided paths, what to use for each output size, puts this info into objOutputSizes
			// if aOptions.saveScaledBadgeDir, it will tell frameworker to draw each badge to canvas, then send back arrbuf
			
		/*
		var objOutputSizes = {
			'key is output size': {
				base: {
					useKey: 'element from image to use from aBaseSrcImgPathArr', // named use key, because this will be the key value in imgPathData, // get this with whichNameToScaleFromToReachGoal
					drawAtSize: 'same as key of objOutputSizes'
				},
				badge: {
					useKey: 'elem from aOptions.aBadgeSrcImgPathArr',
					drawAtSize: '', // the number passed as aGoalSize to whichNameToScaleFromToReachGoal
					positionToDrawAt: '' // respects aBadge position
				}
			}
		};
		*/
		
		for (var i=0; i<aOutputSizesArr.length; i++) {
			objOutputSizes[aOutputSizesArr[i]] = {};
			
			objOutputSizes[aOutputSizesArr[i]].base = {};
			objOutputSizes[aOutputSizesArr[i]].base.useKey = whichNameToScaleFromToReachGoal(imgPathData_base, aOutputSizesArr[i], aOptions.aScalingAlgo);
			objOutputSizes[aOutputSizesArr[i]].base.drawAtSize = aOutputSizesArr[i];
			
			if (aOptions.aBadge) {
				var badgeSizeNeeded = aOptions.aBadgeSizePerOutputSize[aOutputSizesArr[i]];
				if (badgeSizeNeeded < 1) {
					badgeSizeNeeded = Math.round(aOutputSizesArr[i] * badgeSizeNeeded);
				}
				// console.log('badgeSizeNeeded:', badgeSizeNeeded, aOptions.aBadgeSizePerOutputSize[aOutputSizesArr[i]])
				if (badgeSizeNeeded > 0) {
					objOutputSizes[aOutputSizesArr[i]].badge = {};
					objOutputSizes[aOutputSizesArr[i]].badge.useKey = whichNameToScaleFromToReachGoal(imgPathData_badge, badgeSizeNeeded, aOptions.aScalingAlgo);
					objOutputSizes[aOutputSizesArr[i]].badge.drawAtSize = badgeSizeNeeded;

					
					var badgeX;
					var badgeY;
					switch (aOptions.aBadge) {
						case 1:
								
								// top left
								badgeX = 0;
								badgeY = 0;
								
							break;
						case 2:
								
								// top right
								badgeX = aOutputSizesArr[i] - badgeSizeNeeded; // assuming square badge
								badgeY = 0;
							
							break;
						case 3:
								
								// bottom left
								badgeX = 0
								badgeY = aOutputSizesArr[i] - badgeSizeNeeded; // assuming square badge
							
							break;
						case 4:
								
								// bottom right
								badgeX = aOutputSizesArr[i] - badgeSizeNeeded; // assuming square badge // not assuming sqaure can though, just for future in case i support non square
								badgeY = aOutputSizesArr[i] - badgeSizeNeeded; // assuming square badge // not assuming square can though, just for future in case in case i support non square
							
							break;
						default:
							// this will never happen
							console.log('this will never happen because i ensured this in the validation section at start of this function');
					}
					
					objOutputSizes[aOutputSizesArr[i]].badge.x = badgeX;
					objOutputSizes[aOutputSizesArr[i]].badge.y = badgeY;
				}
			}
		}
		
		console.log('objOutputSizes:', objOutputSizes);
		
		step4();

	};
	
	var step4 = function() {
		
		// if aOptions.saveScaledBadgeDir then send message for each badge to framworker, to send back arrbuf for it. and framworker should keep that canvas saved, as it can use that overlap the base.
		// reason i have a whole step for this, is because i promise.all on badge. as framworker will save the badge canvas. so it can just overlap it for the output canvas when step5 sends message to create output canvas
		if (aOptions.saveScaledBadgeDir) {
			var promiseAllArr_drawScaledBadges = [];
			
			for (var p in objOutputSizes) {
				// send message to frameworker to draw badge to canvas, and get back arr buf
				// on promise.all then go to step5
				var deferred_scaleBadge = new Deferred();
				self.postMessageWithCallback(['tellFrameworkerDrawScaled', objOutputSizes[p].badge.useKey, objOutputSizes[p].badge.drawAtSize, fwId], tellFrameWorkerDrawScaledCb.bind(null, objOutputSizes, p, deferred_scaleBadge));
				promiseAllArr_drawScaledBadges.push(deferred_scaleBadge.promise);
			}
			
			var promiseAll_drawScaledBadges = Promise.all(promiseAllArr_drawScaledBadges);
			promiseAll_drawScaledBadges.then(
				function(aVal) {
					console.log('Fullfilled - promiseAll_drawScaledBadges - ', aVal);
					// start - do stuff here - promiseAll_drawScaledBadges
					setTimeout(function() {
						// :todo: ensure that aOptions.saveScaledBadgeDir exists, else make it
						// :todo: iterate through each objOutputSizes and write the badge arrbuf to file code here, as obviously i only ge there if aOptions.saveScaledBadgeDir was true
						for (var p in objOutputSizes) {
							// console.log('objOutputSizes[p].badge.arrbuf:', objOutputSizes[p].badge.arrbuf);
							OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'badge_' + objOutputSizes[p].badge.drawAtSize + '.png'), new Uint8Array(objOutputSizes[p].badge.arrbuf), {tmpPath:OS.Path.join(OS.Constants.Path.desktopDir, 'badge_' + objOutputSizes[p].badge.drawAtSize + '.png.tmp')});
						}
					}, 0);
					step5();
					// end - do stuff here - promiseAll_drawScaledBadges
				},
				function(aReason) {
					var rejObj = {name:'promiseAll_drawScaledBadges', aReason:aReason};
					console.error('Rejected - promiseAll_drawScaledBadges - ', rejObj);
					self.postMessage(['destroyFrameworker', fwId]);
					deferredMain_returnIconset.resolve([{
						status: 'fail',
						reason: aReason, // its a string message, lets show it to the user
						rejObj: rejObj
					}]);
				}
			).catch(
				function(aCaught) {
					var rejObj = {name:'promiseAll_drawScaledBadges', aCaught:aCaught};
					console.errpr('Caught - promiseAll_drawScaledBadges - ', rejObj);
					self.postMessage(['destroyFrameworker', fwId]);
					deferredMain_returnIconset.resolve([{
						status: 'fail',
						reason: 'promise caught',
						rejObj: rejObj
					}]);
				}
			);
		} else {
			step5();
		}
		
	};
	
	var step5 = function() {
		// if aOptions.saveScaledBadgeDir, then get write all the arrBuf's for badges from step4 to file. do this while frameworker is drawing bases to canvas and creating ouput canvases
		
		// tell frameworker to draw each base on a canvas.
		// this is frameworker logic:
			// if (!aOptions.aBadge)
				// get arrbuf, set key as output // use same method as i did for badge above
			// else
				// if aOptions.saveScaledBaseDir, then get arrbuf of each base canvas, and save to key as base
				// overlap badge (of course if was getting arrbuf in previous line, then wait for that to finish)
				// get arrbuf again and save to key as output
			// resolve promise to return back to worker RETURN POINT
			
		// back to worker logic: after receive all arrbufs, then go to step6
		
		console.log('in step5');
		var promiseAllArr_scaleOutput = [];
		for (var p in objOutputSizes) {
			// send message to frameworker to draw badge to canvas, and get back arr buf
			// on promise.all then go to step5
			var deferred_scaleOutput = new Deferred();
			var getOptBuf = false;
			var overlapObj = null;
			if (aOptions.aBadge && objOutputSizes[p].badge.drawAtSize) { // cuz if its 0 then we dont want no overlap
				getOptBuf = aOptions.saveScaledBaseDir; // if this is true, then set getOptBuf true here. we want this false if we arent passing an overlapObj
				overlapObj = {
					aImgPath: objOutputSizes[p].badge.useKey,
					aDrawAtX: objOutputSizes[p].badge.x,
					aDrawAtY: objOutputSizes[p].badge.y,
					aDrawAtSize: objOutputSizes[p].badge.drawAtSize
				}
			}
			self.postMessageWithCallback(['tellFrameworker_dSoBoOOSb', objOutputSizes[p].base.useKey, objOutputSizes[p].base.drawAtSize, getOptBuf, overlapObj, fwId], tellFrameworker_dSoBoOOSbCb.bind(null, objOutputSizes, p, deferred_scaleOutput));
			promiseAllArr_scaleOutput.push(deferred_scaleOutput.promise);
		}
		
		var promiseAll_scaleOutput = Promise.all(promiseAllArr_scaleOutput);
		promiseAll_scaleOutput.then(
			function(aVal) {
				console.log('Fullfilled - promiseAll_scaleOutput - ', aVal);
				// start - do stuff here - promiseAll_scaleOutput
				step6();
				// end - do stuff here - promiseAll_scaleOutput
			},
			function(aReason) {
				var rejObj = {name:'promiseAll_scaleOutput', aReason:aReason};
				console.warn('Rejected - promiseAll_scaleOutput - ', rejObj);
				self.postMessage(['destroyFrameworker', fwId]);
				deferredMain_returnIconset.resolve([{
					status: 'fail',
					reason: aReason, // its a string message, lets show it to the user
					rejObj: rejObj
				}]);
			}
		).catch(
			function(aCaught) {
				var rejObj = {name:'promiseAll_scaleOutput', aCaught:aCaught};
				console.log('Caught - promiseAll_scaleOutput - ', rejObj);
				self.postMessage(['destroyFrameworker', fwId]);
				deferredMain_returnIconset.resolve([{
					status: 'fail',
					reason: 'promise caught',
					rejObj: rejObj
				}]);
			}
		);
		
	};
	
	var step6 = function() {
		// if aOptions.saveScaledBaseDir then
			// if base keys, then save those to disk
			// else no base keys, that means output == base. so duplicate output, and save them
		// if aOptions.saveScaledIconDir then duplicate arrbuf, and save them. duplicate it because the arrbuf is needed for processing per aCreateType later on
		
		// set to step7 which does the makeIconContainer per aCreateType
		
		console.error('step6');
		
		for (var p in objOutputSizes) {
			OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'output_' + p + '.png'), new Uint8Array(objOutputSizes[p].arrbuf), {tmpPath:OS.Path.join(OS.Constants.Path.desktopDir, 'output_' + p + '.png.tmp')});
			if (aOptions.saveScaledBaseDir) {
				OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'base_' + p + '.png'), new Uint8Array(objOutputSizes[p].base.arrbuf), {tmpPath:OS.Path.join(OS.Constants.Path.desktopDir, 'base_' + p + '.png.tmp')});
			}
		}

		self.postMessage(['destroyFrameworker', fwId]);
		deferredMain_returnIconset.resolve([{
			status: 'ok',
			reason: 'temp resolve'
		}]);
	};
	
	var step7 = function() {
		// if aOptions.dontMakeIconContainer is true, then quit with message success
		// else if aOptions.dontMakeIconContainer is false then initiate make icon container per aCreateType
			// meaning do ICNS, ICO, Linux, etc specific stuff
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


function tellFrameWorkerDrawScaledCb(objOutputSizes, aP, aDeferred_scaledBadge, aImgScaledResult) {
	console.info('in callback of tellFrameworkerDrawScaled in worker, the arguments are:', uneval(arguments));
	if (aImgScaledResult.status == 'ok') {
		objOutputSizes[aP].badge.arrbuf = aImgScaledResult.arrbuf;
		aDeferred_scaledBadge.resolve();
	} else {
		if (aImgScaledResult.reason) {
			aDeferred_scaledBadge.reject(aImgScaledResult.reason + ' FOR ' + aP);
		} else {
			aDeferred_scaledBadge.reject('Unknown reason FOR ' + aP);
		}
	}
}

function tellFrameworker_dSoBoOOSbCb(objOutputSizes, aP, aDeferred_scaledBadge, aImgScaledResult) {
	console.info('in callback of tellFrameworkerDrawScaled in worker, the arguments are:', uneval(arguments));
	if (aImgScaledResult.status == 'ok') {
		if (aImgScaledResult.optBuf) {
			objOutputSizes[aP].base.arrbuf = aImgScaledResult.optBuf;
		}
		objOutputSizes[aP].arrbuf = aImgScaledResult.finalBuf;
		aDeferred_scaledBadge.resolve();
	} else {
		if (aImgScaledResult.reason) {
			aDeferred_scaledBadge.reject(aImgScaledResult.reason + ' FOR ' + aP);
		} else {
			aDeferred_scaledBadge.reject('Unknown reason FOR ' + aP);
		}
	}
}

function whichNameToScaleFromToReachGoal(aSourcesNameSizeObj, aGoalSize, aScalingAlgo) {
	// updated 10/9/2015 - this one is latest
	// returns key from aSourcesNameSizeObj
	// note: assumes that all sources are that of square dimensions
	// aSourcesNameSizeObj is a key value pair, where keys are names (full paths for example), and value is (an obj containing key "size"/"width"/"height" with value number OR not an obj and just number which should be square size of img, if img is not square it should not be there)
	// aGoalSize is number
	// aScalingAlgo - it first searches for perfect match, if no perfect found then:
		// 0 - jagged first then blurry - finds the immediate larger in aSourcesNameSizeObj and will scale down, this will give the jagged look. if no larger found, then it will find the immeidate smaller then scale up, giving the blurry look.
		// 1 - blurry first then jagged - finds the immediate smaller in aSourcesNameSizeObj and will scale up, this will give the blurry look. if no smaller found, then it will find the immeidate larger then scale down, giving the jagged look.
	
	
	console.log('aSourcesNameSizeObj;', aSourcesNameSizeObj);
	var aSourcesNameSizeArr = []; // elemen is [keyName in aSourcesNameSizeObj, square size]
	for (var p in aSourcesNameSizeObj) {
		aSourcesNameSizeArr.push([
			p,
			typeof(aSourcesNameSizeObj[p]) == 'number'
				?
				aSourcesNameSizeObj[p]
				:
				(aSourcesNameSizeObj[p].size || aSourcesNameSizeObj[p].width || aSourcesNameSizeObj[p].height || aSourcesNameSizeObj[p].w || aSourcesNameSizeObj[p].h)
		]);
	}
	
	if (aSourcesNameSizeArr.length == 0) {
		throw new Error('must have at least one source in aSourcesNameSizeObj');
	}
	
	// sort aSourcesNameSizeArr in asc order of size asc
	aSourcesNameSizeArr.sort(function(a, b) {
		return a[1] > b[1];
	});
	
	var nameOfSmaller; // holds key that is found in aSourcesNameSizeObj that is the immediate smaller then goal size
	var nameOfLarger; // holds key that is found in aSourcesNameSizeObj that is the immediate larger then goal size
	for (var i=0; i<aSourcesNameSizeArr.length; i++) {
		if (aSourcesNameSizeArr[i][1] == aGoalSize) {
			console.info('for goal size of', aGoalSize, 'returning exact match at name:', aSourcesNameSizeArr[i][0]);
			return aSourcesNameSizeArr[i][0]; // return name
		} else if (aSourcesNameSizeArr[i][1] < aGoalSize) {
			nameOfSmaller = aSourcesNameSizeArr[i][0];
		} else if (aSourcesNameSizeArr[i][1] > aGoalSize) {
			nameOfLarger = aSourcesNameSizeArr[i][0];
			break; // as otherwise it will set nameOfLarger to the largest and not the immediate larger
		}
	}
				
	switch (aScalingAlgo) {
		case 0:
				
				// jagged
				if (nameOfLarger) {
					console.info('for goal size of', aGoalSize, 'returning jagged first because it was found. so match at name:', aSourcesNameSizeArr, 'nameOfLarger:', nameOfLarger);
				} else {
					console.info('for goal size of', aGoalSize, 'returning blurry second because it no larger was found. so match at name:', aSourcesNameSizeArr, 'nameOfSmaller:', nameOfSmaller);
				}
				// console.log('nameOfLarger:', nameOfLarger, 'nameOfSmaller:', nameOfSmaller);
				return nameOfLarger || nameOfSmaller; // returns immediate larger if found, else returns the immeidate smaller
			
			break;
			
		case 1:
				
				// blurry
				if (nameOfSmaller) {
					console.info('for goal size of', aGoalSize, 'returning blurry first because it was found. so match at name:', aSourcesNameSizeArr, 'nameOfSmaller:', nameOfSmaller);
				} else {
					console.info('for goal size of', aGoalSize, 'returning jagged second because it no smaller was found. so match at name:', aSourcesNameSizeArr, 'nameOfLarger:', nameOfLarger);
				}
				return nameOfSmaller || nameOfLarger; // returns immediate smaller if found, else returns the immeidate larger
			
			break;
		
		default:
			throw new Error('Unrecognized aScalingAlgo: ' + aScalingAlgo);
	}
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
		console.log('Promise not available!', ex);
		throw new Error('Promise not available!');
	}
}

// End - Common Functions