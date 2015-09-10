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
var gConvert; // unixToolbox

// Imports that use stuff defined in chrome
// I don't import ostypes_*.jsm yet as I want to init core first, as they use core stuff like core.os.isWinXP etc
// imported scripts have access to global vars on MainWorker.js
importScripts(core.addon.path.content + 'modules/cutils.jsm');
importScripts(core.addon.path.content + 'modules/ctypes_math.jsm');
importScripts(core.addon.path.content + 'modules/unixToolbox/interface.js');

// Setup SICWorker
// instructions on using SICWorker
	// to call a function in the main thread function scope (which was determiend on SICWorker call from mainthread) from worker, so self.postMessage with array, with first element being the name of the function to call in mainthread, and the reamining being the arguments
	// the return value of the functions here, will be sent to the callback, IF, worker did worker.postWithCallback
const SIC_CB_PREFIX = '_a_gen_cb_';
self.onmessage = function(aMsgEvent) {
	// note:all msgs from bootstrap must be postMessage([nameOfFuncInWorker, arg1, ...])
	var aMsgEventData = aMsgEvent.data;
	
	console.log('worker receiving msg:', aMsgEvent);
	var callbackPendingId;
	if (typeof aMsgEventData[aMsgEventData.length-1] == 'String' && aMsgEventData[aMsgEventData.length-1].indexOf(SIC_CB_PREFIX) == 0) {
		callbackPendingId = aMsgEventData.pop();
	}
	
	var rez_worker_call = WORKER[aMsgEventData.shift()].apply(null, aMsgEventData);
	
	if (callbackPendingId) {
		self.postMessage([callbackPendingId, rez_worker_call]);
	}
};

////// end of imports and definitions

self.onclose = function(event) {
	console.error('got msg to terminate worker - going to terminate gConvert worker');
	gConvert.worker.terminate();
	console.error('ok terminated gConvert worker');
}

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
	
	console.log('first part of init worker - done');
	
	// set up unixToolbox
	unixToolboxInit(WORKER);
	gConvert = new Interface(core.addon.path.content + 'modules/unixToolbox/convert-worker.js');
	gConvert.on_stdout = function(txt) { console.log(txt); };
	gConvert.on_stderr = function(txt) { console.log(txt); };


	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/magic.xml',   '/usr/local/etc/ImageMagick/', true);
	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/coder.xml',   '/usr/local/etc/ImageMagick/');
	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/policy.xml',  '/usr/local/etc/ImageMagick/');
	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/english.xml', '/usr/local/etc/ImageMagick/');
	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/locale.xml',  '/usr/local/etc/ImageMagick/');
	gConvert.addUrl(core.addon.path.content + 'modules/unixToolbox/config/delegates.xml',  '/usr/local/etc/ImageMagick/');

	gConvert.allDone().then(function() {
		console.log('gConvert complete');
		self.postMessage(['init']);
	});
}

// Start - Addon Functionality

function makeIconContainer(aCreateType, aCreateName, aCreatePathDir, aBaseSrcImgPathArr, aOutputSizesArr, aOptions={}) {
	// aCreateType - string. future plan to support things like tiff. in future maybe make this an arr, so can make multiple types in one shot.
		// ICO - can be done on any os
		// Linux - installation part is linux dependent
		// ICNS - requires mac, as i use iconutils
	// aCreateName - same across all os, name to create icon container with (no dot ext included duhhh, esp on linux it wont be getting ext or will auto get png or svg)
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
	// aOptions
		// BADGE OPTIONS
			// aBadge (if >0 then must provide aBadgeSrcImgPathArr and aBageSizePerIconSize)
				// 0 - default - no badge`
				// 1 - badge it topleft
				// 2 - topright
				// 3 - bottomleft
				// 4 - bottomright
			// aBadgeSrcImgPathArr
				// if aBadge != 0 THEN
					// same across all os - os paths of images to be used as sources for badges, the sizes will be auto determined, if any of them are not square it will throw
			// aBageSizePerOutputSize
				// if aBadge != 0 THEN
					// same across all os - obj key value pair. key is base size, value is badge size. the size the badge should be scaled to for the output icon size
			// saveScaledBadgeDir
				// if aBadge != 0 THEN
					// same across all os - set to a os path if you want the scaled badges to be saved, will be pngs
			// saveScaledBaseDir
				// if aBadge != 0 THEN
					// same across all os - set to a os path if you want the scaled bases to be saved, will be pngs
		// NON BADGE OPTIONS
			// saveScaledIconDir
				// same across all os - set to a os path if you want the final before making ico or icns to be saved, if saveScaledBadgeDir is not set, then this is same as saveScaledBaseDir
		// aOptions.dontMakeIconContainer - bool
			// if saveScaledIconDir || saveScaledBaseDir || saveScaledBadgeDir
				// linux - wont install to shared dirs
				// ico - wont make ico
				// mac - wont make icns
				// this is if just want to saved the Scaled images to a dir and dont want to make the icon right away
	
	/*
	switch (core.os.toolkit.indexOf('gtk') == 0 ? 'gtk' : core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			
				
			
			break
		case 'gtk':
			
				
			
			break;
		case 'darwin':
			
				
			
			break;
		default:
			throw new Error({
				name: 'addon-error',
				message: 'Operating system, "' + OS.Constants.Sys.Name + '" is not supported'
			});
	}
	*/
	
	switch (aCreateType) {
		case 'ICO':
		case 'Linux':
		case 'ICNS':

				// ok

			break;
		default:
			throw new Error({
				name: 'devuser-error',
				message: 'aCreateType, "' + aCreateType + '" is not supported'
			});
	}
	
	// load all images
	// go through aBaseSrcImgPathArr and aBadgeSrcImgPathArr
	// :todo: check if paths are duplicates
	for (var i=0; i<aBaseSrcImgPathArr.length; i++) {
		var dotExt = ''; //aBaseSrcImgPathArr[i].substr(aBaseSrcImgPathArr[i].lastIndexOf('.'));
		console.log('adding url:', aBaseSrcImgPathArr[i].toLowerCase().substr(0, 9) == 'chrome://' ? aBaseSrcImgPathArr[i] : OS.Path.toFileURI(aBaseSrcImgPathArr[i]), '/base' + i + dotExt);
		gConvert.addUrl(aBaseSrcImgPathArr[i].toLowerCase().substr(0, 9) == 'chrome://' ? aBaseSrcImgPathArr[i] : OS.Path.toFileURI(aBaseSrcImgPathArr[i]), '/base' + i + dotExt); // note: assuming either chrome:// or file:// uri, does not handle http:// etc
	}
	if (aOptions.aBadge) {
		for (var i=0; i<aOptions.aBadgeSrcImgPathArr.length; i++) {
			var dotExt = ''; //aBaseSrcImgPathArr[i].substr(aBaseSrcImgPathArr[i].lastIndexOf('.'));
			gConvert.addUrl(aOptions.aBadgeSrcImgPathArr[i].toLowerCase().substr(0, 9) == 'chrome://' ? aOptions.aBadgeSrcImgPathArr[i] : OS.Path.toFileURI(aBaseSrcImgPathArr[i]), '/badge' + i + dotExt);
		}
	}

	gConvert.allDone().then(function() {
		/*
		gConvert.run('-rotate', '90', '/Image-Box-64.png', '/Image-Box-64-rot90.png').then(function() {
			gConvert.getFile('Image-Box-64-rot90.png').then(function(real_contents) {
				console.log('real_contents:', real_contents);
				OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'Image-Box-64-TAT.png'), new Uint8Array(real_contents.buf), { tmpPath: OS.Path.join(OS.Constants.Path.desktopDir, 'Image-Box-64-rot-jpeg.txt.tmp') });
			});
		});
		*/
			gConvert.getFileArrBuf('base0').then(function(real_contents) {
				console.log('real_contents:', real_contents);
				OS.File.writeAtomic(OS.Path.join(OS.Constants.Path.desktopDir, 'base0.png'), new Uint8Array(real_contents.buf), { tmpPath: OS.Path.join(OS.Constants.Path.desktopDir, 'base0.png.tmp') });
			});
	});
}
// End - Addon Functionality


// Start - Common Functions


// End - Common Functions