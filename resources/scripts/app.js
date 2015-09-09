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
		path: {
			name: 'icon-container-generator',
			locale: 'chrome://icon-container-generator/locale/'
		},
		cache_key: Math.random() // set to version on release
	}
};
var gAngScope;
// var gAngInjector;
const clientId = new Date().getTime();

// Lazy Imports
const myServices = {};
XPCOMUtils.defineLazyGetter(myServices, 'sb', function () { return Services.strings.createBundle(core.addon.path.locale + 'app.properties?' + core.addon.cache_key) }); // Randomize URI to work around bug 719376

function testLoadImage(aImgOsPath, baseOrBadge) {
	var img = new Image();
	img.onload = function() {
		if (img.width != img.height) {
			alert('ERROR: Image is not a square shape so will not be used.\n\nFile Name: "' + OS.Path.basename(aImgOsPath) + '"\nPath: "' + aImgOsPath + '"');
			return;
		}
		if (baseOrBadge == 'base') {
			// start copy block link9873651 - because for some reason i cant pass around angular vars that are arrays by reference, it causes some issues
			for (var i=0; i<gAngScope.BC.aBaseSrcImgPathArr.length; i++) {
				if (gAngScope.BC.aBaseSrcImgPathArr[i].toLowerCase() == img.src.toLowerCase()) {
					alert('ERROR: This image was already found in the list so will not be added again.\n\nFile Name: "' + OS.Path.basename(aImgOsPath) + '"\nPath: "' + aImgOsPath + '"');
					return;
				}
			}
			gAngScope.BC.aBaseSrcImgPathArr.push(img.src);
			// end block link9873651
		} else {
			// its _badge			
			// start copy block link9873651 - because for some reason i cant pass around angular vars that are arrays by reference, it causes some issues // i tried the method var aArrPush = gAngScope.BC.aBadgeSrcImgPathArr;
			for (var i=0; i<gAngScope.BC.aBadgeSrcImgPathArr.length; i++) {
				if (gAngScope.BC.aBadgeSrcImgPathArr[i].toLowerCase() == img.src.toLowerCase()) {
					alert('ERROR: This image was already found in the list so will not be added again.\n\nFile Name: "' + OS.Path.basename(aImgOsPath) + '"\nPath: "' + aImgOsPath + '"');
					return;
				}
			}
			gAngScope.BC.aBadgeSrcImgPathArr.push(img.src);
			// end block link9873651
		}
		gAngScope.BC.imgPathSizes[img.src] = img.height;
		gAngScope.$digest();
	};
	img.onabort = function() {
		alert('WARNING: You maybe hit stop or escape key, as loading of image was aborted.\n\nFile Name: "' + OS.Path.basename(aImgOsPath) + '"\nPath: "' + aImgOsPath + '"');
	};
	img.onerror = function() {
		alert('ERROR: File is not an image so will not be used.\n\nFile Name: "' + OS.Path.basename(aImgOsPath) + '"\nPath: "' + aImgOsPath + '"');
	};
	img.src = aImgOsPath.toLowerCase().substr(0, 9) == 'chrome://' ? aImgOsPath : OS.Path.toFileURI(aImgOsPath);
}

function handleDrop(baseOrBadge, e) {
	e.stopPropagation(); // Stops some browsers from redirecting.
	e.preventDefault();

	console.error('baseOrBadge == ', baseOrBadge);
	
	var files = e.dataTransfer.files;
	for (var i = 0, f; f = files[i]; i++) {
		// Read the File objects in this FileList.
		console.log(i, 'f:', f);
		testLoadImage(f.mozFullPath, baseOrBadge);
	}
}

function handleDragOver(e) {
	if (e.preventDefault) {
		e.preventDefault(); // Necessary. Allows us to drop.
	}

	e.dataTransfer.dropEffect = 'copy';  // See the section on the DataTransfer object.

	return false;
}

function handleDocElDragOver(e) {
	if (e.preventDefault) {
		e.preventDefault(); // Necessary. Allows us to drop.
	}

	e.dataTransfer.dropEffect = 'none';  // See the section on the DataTransfer object.

	return false;
}

function onPageReady() {
	
	document.documentElement.addEventListener('dragover', handleDocElDragOver, true);
	
	// message bootstrap, tell him im open, and that he should startup ICGenWorker if its not yet ready
	document.getElementById('dropTarget_base').addEventListener('drop', handleDrop.bind(null, 'base'), true);
	document.getElementById('dropTarget_base').addEventListener('dragover', handleDragOver, true);

	
	document.getElementById('dropTarget_badge').addEventListener('drop', handleDrop.bind(null, 'badge'), true);
	document.getElementById('dropTarget_badge').addEventListener('dragover', handleDragOver, true);
	
}

function onPageUnload() {
	// message bootstrap that im going, and there are no other clients open, then terminate ICGenWorker
}

var	ANG_APP = angular.module('iconcontainergenerator', [])
    .config(['$compileProvider', function( $compileProvider ) {
			$compileProvider.imgSrcSanitizationWhitelist(/^\s*(filesystem:file|file):/);
		}
    ])
	.controller('BodyController', ['$scope', function($scope) {
		
		var MODULE = this;
		
		var gAngBody = angular.element(document.body);
		gAngScope = gAngBody.scope();
		// gAngInjector = gAngBody.injector();
		
		MODULE.aCreateType = 'ICNS';
		MODULE.aOptions_aBadge = '0';
		
		MODULE.aCreatePathDir = '';
		
		MODULE.aOutputSizesType = 'Custom';
		MODULE.aOutputSizesArr = [];
		
		MODULE.aBaseSrcImgPathArr = [];
		MODULE.aBadgeSrcImgPathArr = [];
		
		MODULE.aOutputSizes_custStrToArr = function() {
			if (MODULE.aOutputSizesCustomStr.trim() == '') {
				MODULE.aOutputSizesArr = [];
				return;
			}
			try {
				var split = MODULE.aOutputSizesCustomStr.split(',');
				if (split.length == 0) {
					MODULE.aOutputSizesArr = [];
					return;
				}
				for (var i=0; i<split.length; i++) {
					if (!split[i] || split[i] == '' || isNaN(split[i])) {
						return;
					}
					split[i] = parseInt(split[i]);
				}
				MODULE.aOutputSizesArr = split;
			} catch(ignore) {}
		};
		
		MODULE.imgPathSizes = {};
		MODULE.onChangeOutputSizes = function() {
			MODULE.aOutputSizesArr = [];
			MODULE.aOutputSizesCustomStr = '';
			switch (MODULE.aOutputSizesType) {
				case 'Windows':
					MODULE.aOutputSizesArr = [16, 24, 32, 48, 256];
					break;
				case 'Mac OS X':
					MODULE.aOutputSizesArr = [16, 32, 64, 128, 256, 512, 1024];
					break;
				case 'Linux':
					MODULE.aOutputSizesArr = [16, 24, 48, 96];
					break;
				default:
					// do custom
			}
		};
		MODULE.ifBadgeNoneUncheck = function() {
			if (MODULE.aOptions_aBadge == '0') {
				MODULE.ui_saveScaledBaseDir = undefined;
				MODULE.ui_saveScaledBadgeDir = undefined;
				MODULE.aOptions_saveScaledBaseDir = undefined;
				MODULE.aOptions_saveScaledBadgeDir = undefined;
			}
		};
		
		MODULE.ifNoneScaleSaved_UncheckDontMake = function() {
			if (!MODULE.ui_saveScaledBaseDir && !MODULE.ui_saveScaledBadgeDir && !MODULE.ui_saveScaledIconDir) {
				MODULE.ui_dontMakeIconContainer = false;
				MODULE.aOptions_dontMakeIconContainer = false;
			} else {
				MODULE.ui_dontMakeIconContainer = true;
			}
		};
		
		MODULE.doMake = function() {
			// send message to bootstrap with image paths
		};
		
		MODULE.BrowseSelectDir = function(aArgName) {
			var fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
			fp.init(Services.wm.getMostRecentWindow('navigator:browser'), 'Pick directory the icon container file should be saved in', Ci.nsIFilePicker.modeGetFolder);
			// fp.appendFilters(Ci.nsIFilePicker.filterAll);

			var rv = fp.show();
			if (rv == Ci.nsIFilePicker.returnOK) {
				
				MODULE[aArgName] = fp.file.path;

			}// else { // cancelled	}
		};
		
		MODULE.previewInserted = function(aSize, aIndex) {
			var can = document.getElementById('previews').querySelectorAll('canvas')[aIndex];
			console.info('can:', can);
			var ctx = can.getContext('2d');
			can.width = aSize;
			can.height = aSize;
			fitTextOnCanvas(can, ctx, aSize, 'arial');
		};
	}]);

// start - common helper functions
function fitTextOnCanvas(aCan, aCtx, text, fontface) {
	// centers text on a canvas and makes it fit the size of canvas
	
    // start with a large font size
    var fontsize = Math.max(aCan.width, aCan.height);

    // lower the font size until the text fits the canvas
	var textMeasure;
    do {
        fontsize--;
        aCtx.font = 'bold ' + fontsize + 'px ' + fontface;
		textMeasure = aCtx.measureText(text);
    } while (textMeasure.width > aCan.width)

    // draw the text
	aCtx.textBaseline = 'top';
	var heightGuess = aCtx.measureText('W').width; // this is a guess because measureText does not support height as of sep 8 2015
    aCtx.fillText(text, (aCan.width / 2) - (textMeasure.width / 2), (aCan.height / 2) - (heightGuess/2));
	
    // alert('A fontsize of ' + fontsize + 'px fits this text on the canvas');

}
// end - common helper functions
	
document.addEventListener('DOMContentLoaded', onPageReady, false);
document.addEventListener('unload', onPageUnload, false);