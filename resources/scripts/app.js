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
var gAngScope;
// var gAngInjector;
const clientId = new Date().getTime();
var gCFMM;

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
			gAngScope.BC.imgPathSizesBase[img.src] = img.height; // assuming square
			gAngScope.BC.imgPathImagesBase[img.src] = img;
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
			gAngScope.BC.imgPathSizesBadge[img.src] = img.height; // assuming square
			gAngScope.BC.imgPathImagesBadge[img.src] = img;
			gAngScope.BC.aBadgeSrcImgPathArr.push(img.src);
			// end block link9873651
		}
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

// framescript comm
var bootstrapMsgListener = {
	receiveMessage: function(aMsgEvent) {
		var aMsgEventData = aMsgEvent.data;
		console.log('framescript getting aMsgEvent:', aMsgEventData);
		// aMsgEvent.data should be an array, with first item being the unfction name in bootstrapCallbacks
		bootstrapCallbacks[aMsgEventData.shift()].apply(null, aMsgEventData);
	}
};

var bootstrapCallbacks = {
	generateFiles_response: function(aReturnObj) {
		// bootstrap calls this after it runs the chromeworker returnIconset function
		console.log('ok back in app.js after returnIconset complete, aReturnObj:', aReturnObj);
		if (aReturnObj.status == 'fail') {
			alert('Icon container process failed with message: "' + aReturnObj.reason + '"')
		} else {
			if (aReturnObj.reason) {
				alert('Succesfully completed proccessing with pmessage: "' + aReturnObj.reason + '"');
			} else {
				alert('Succesfully completed proccessing');
			}
		}
	}
};
// end - framescript comm

function doOnBeforeUnload() {

	contentMMFromContentWindow_Method2(window).removeMessageListener(core.addon.id, bootstrapMsgListener); // framescript comm

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
		
		MODULE.aScalingAlgo = '0';
		MODULE.aBadgeSizePerOutputSize = {};
		
		MODULE.aOutputSizes_custStrToArr = function() {
			if (MODULE.aOutputSizesCustomStr.trim() == '') {
				MODULE.aOutputSizesArr = [];
				reflectOutputSizes_into_aBadgeSizePerOutputSize();
				return;
			}
			try {
				var split = MODULE.aOutputSizesCustomStr.split(',');
				if (split.length == 0) {
					MODULE.aOutputSizesArr = [];
					reflectOutputSizes_into_aBadgeSizePerOutputSize();
					return;
				}
				for (var i=0; i<split.length; i++) {
					if (!split[i] || split[i] == '' || isNaN(split[i])) {
						return;
					}
					split[i] = parseInt(split[i]);
					if (split[i] == 0) {
						return;
					}
				}
				MODULE.aOutputSizesArr = split;
				reflectOutputSizes_into_aBadgeSizePerOutputSize();
			} catch(ignore) {}
		};
		
		MODULE.imgPathSizesBase = {};
		MODULE.imgPathImagesBase = {};
		MODULE.imgPathSizesBadge = {};
		MODULE.imgPathImagesBadge = {};
		
		function reflectOutputSizes_into_aBadgeSizePerOutputSize() {
			for (var i=0; i<MODULE.aOutputSizesArr.length; i++) {
				if (!(MODULE.aOutputSizesArr[i] in MODULE.aBadgeSizePerOutputSize)) {
					console.log('seting:', MODULE.aOutputSizesArr[i]);
					if (MODULE.aOutputSizesArr[i] == 16) {
						MODULE.aBadgeSizePerOutputSize[MODULE.aOutputSizesArr[i]] = 10;
					} else {
						MODULE.aBadgeSizePerOutputSize[MODULE.aOutputSizesArr[i]] = 0.5;
					}
				}
			}
			
			for (var p in MODULE.aBadgeSizePerOutputSize) {
				if (MODULE.aOutputSizesArr.indexOf(parseInt(p)) == -1) {
					delete MODULE.aBadgeSizePerOutputSize[p];
				}
			}
		};
		
		MODULE.ifThereAreAnyFactors = function() {
			for (var p in MODULE.aBadgeSizePerOutputSize) {
				if (MODULE.aBadgeSizePerOutputSize[p] && MODULE.aBadgeSizePerOutputSize[p] < 1) {
					return true;
				}
			}
			return false;
		};
		
		MODULE.isAFactor = function(aNumber) {
			if (aNumber < 1) {
				return true;
			}
		};
		
		MODULE.calcFactoredRounded = function(aFactor, aOf) {
			return Math.round(parseFloat(aOf) * parseFloat(aFactor));
		};
		
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
			reflectOutputSizes_into_aBadgeSizePerOutputSize();
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
		
		MODULE.generateFiles = function() {
			// send message to bootstrap with image paths
			var aCreateType = MODULE.aCreateType;
			var aCreateName = MODULE.aCreateName;
			var aCreatePathDir = MODULE.aCreatePathDir;
			var aBaseSrcImgPathArr = MODULE.aBaseSrcImgPathArr;
			var aOutputSizesArr = MODULE.aOutputSizesArr;
			
			var aOptions = {};
			/* defaults of aOptions
			var aOptions = {
				aBadge: 0,
				aBadgeSrcImgPathArr: null,
				aBadgeSizePerOutputSize: null,
				saveScaledBadgeDir: null,
				saveScaledBaseDir: null,
				saveScaledIconDir: null,
				dontMakeIconContainer: false
			};
			*/
			aOptions.aScalingAlgo = parseInt(MODULE.aScalingAlgo);
			
			aOptions.aBadge = parseInt(MODULE.aOptions_aBadge);
			if (aOptions.aBadge > 0) {
				aOptions.aBadgeSrcImgPathArr = MODULE.aBadgeSrcImgPathArr;
				aOptions.aBadgeSizePerOutputSize = MODULE.aBadgeSizePerOutputSize;
				
				if (MODULE.aOptions_saveScaledBadgeDir && MODULE.aOptions_saveScaledBadgeDir != '') {
					aOptions.saveScaledBadgeDir = MODULE.aOptions_saveScaledBadgeDir;
				}
				
				// as if user has set aBadge to 0, and they just want to save the base images, then they should just set saveScaledIconDir as base == icon as there is no badge
				if (MODULE.aOptions_saveScaledBaseDir && MODULE.aOptions_saveScaledBaseDir != '') {
					aOptions.saveScaledBaseDir = MODULE.aOptions_saveScaledBaseDir;
				}
			}

			if (MODULE.aOptions_saveScaledIconDir && MODULE.aOptions_saveScaledIconDir != '') {
				aOptions.saveScaledIconDir = MODULE.aOptions_saveScaledIconDir;
			}

			aOptions.dontMakeIconContainer = MODULE.aOptions_dontMakeIconContainer;
			
			contentMMFromContentWindow_Method2(window).sendAsyncMessage(core.addon.id, ['appFunc_generateFiles', [aCreateType, aCreateName, aCreatePathDir, aBaseSrcImgPathArr, aOutputSizesArr, aOptions]]);
		}
	}]);
	
function generatePreviews() {
	// generate aBaseSourcesNameSizeObj
	var aBaseSourcesNameSizeObj = {};
	for (var i=0; i<gAngScope.BC.aBaseSrcImgPathArr.length; i++) {
		aBaseSourcesNameSizeObj[gAngScope.BC.aBaseSrcImgPathArr[i]] = gAngScope.BC.imgPathSizesBase[gAngScope.BC.aBaseSrcImgPathArr[i]];
	}
	
	// generate aBaseSourcesNameSizeObj
	if (parseInt(gAngScope.BC.aOptions_aBadge) > 0) {
		var aBadgeSourcesNameSizeObj = {};
		for (var i=0; i<gAngScope.BC.aBadgeSrcImgPathArr.length; i++) {
			aBadgeSourcesNameSizeObj[gAngScope.BC.aBadgeSrcImgPathArr[i]] = gAngScope.BC.imgPathSizesBadge[gAngScope.BC.aBadgeSrcImgPathArr[i]];
		}
	}
		
	for (var i=0; i<gAngScope.BC.aOutputSizesArr.length; i++) {
		var can = document.getElementById('previews').querySelectorAll('canvas')[i];
		var ctx = can.getContext('2d');
		
		ctx.clearRect(0, 0, can.width, can.height); // not assuming sqaure can though, just for future in case i support non square
		
		var targetIconOutputSize = gAngScope.BC.aOutputSizesArr[i];
		
		// draw base
		var whichNameForBase = whichNameToScaleFromToReachGoal(aBaseSourcesNameSizeObj, targetIconOutputSize, parseInt(gAngScope.BC.aScalingAlgo));
		var baseDrawImageArgs = [
			gAngScope.BC.imgPathImagesBase[whichNameForBase],
			0,
			0
		];
		if (gAngScope.BC.imgPathSizesBase[whichNameForBase] != can.width) { // assuming square image square can
			baseDrawImageArgs.push(can.width); // scale to width
			baseDrawImageArgs.push(can.width); // scale to height
		}
		ctx.drawImage.apply(ctx, baseDrawImageArgs);

		if (gAngScope.BC.imgPathSizesBase[whichNameForBase] == can.width) {
			can.parentNode.setAttribute('data-base-scale-word', '=)');
			can.parentNode.removeAttribute('data-base-scale-from');
		} else if (gAngScope.BC.imgPathSizesBase[whichNameForBase] < can.width) {
			can.parentNode.setAttribute('data-base-scale-word', 'up');
			can.parentNode.setAttribute('data-base-scale-from', gAngScope.BC.imgPathSizesBase[whichNameForBase]);
		} else { // if (gAngScope.BC.imgPathSizesBase[whichNameForBase] > can.width) {
			can.parentNode.setAttribute('data-base-scale-word', 'dn');
			can.parentNode.setAttribute('data-base-scale-from', gAngScope.BC.imgPathSizesBase[whichNameForBase]);
		}
		
		// draw badge if they wanted one
		if (parseInt(gAngScope.BC.aOptions_aBadge) > 0) {
			var targetBadgeSizeScaleOrFactor = gAngScope.BC.aBadgeSizePerOutputSize[targetIconOutputSize];
			if (!targetBadgeSizeScaleOrFactor) {
				// because its null, undefined, or 0, so they dont want a badge on this icon size
				can.parentNode.removeAttribute('data-badge-scale-word');
				can.parentNode.removeAttribute('data-badge-scale-from');
				continue;
			} else if (targetBadgeSizeScaleOrFactor < 1) {
				var targetBadgeSize = Math.round(targetBadgeSizeScaleOrFactor * targetIconOutputSize);
			} else {
				var targetBadgeSize = targetBadgeSizeScaleOrFactor;
			}
			var whichNameForBadge = whichNameToScaleFromToReachGoal(aBadgeSourcesNameSizeObj, targetBadgeSize, parseInt(gAngScope.BC.aScalingAlgo));

			// determine badge x and y
			var badgeX;
			var badgeY;
			switch (parseInt(gAngScope.BC.aOptions_aBadge)) {
				case 1:
						
						// top left
						badgeX = 0;
						badgeY = 0;
						
					break;
				case 2:
						
						// top right
						badgeX = can.width - targetBadgeSize; // assuming square badge
						badgeY = 0;
					
					break;
				case 3:
						
						// bottom left
						badgeX = 0
						badgeY = can.height - targetBadgeSize; // assuming square badge
					
					break;
				case 4:
						
						// bottom right
						badgeX = can.width - targetBadgeSize; // assuming square badge // not assuming sqaure can though, just for future in case i support non square
						badgeY = can.height - targetBadgeSize; // assuming square badge // not assuming square can though, just for future in case in case i support non square
					
					break;
				default:
					throw new Error('unrecognized aOptions_aBadge');
			}
			/* 
			alert([
				parseInt(gAngScope.BC.aOptions_aBadge),
				can.width,
				badgeX,
				badgeY
			].join('\n\n'));
			*/
			var badgeDrawImageArgs = [
				gAngScope.BC.imgPathImagesBadge[whichNameForBadge],
				badgeX,
				badgeY
			];
			if (gAngScope.BC.imgPathSizesBadge[whichNameForBadge] != targetBadgeSize) { // assuming square image square can
				badgeDrawImageArgs.push(targetBadgeSize); // scale to width
				badgeDrawImageArgs.push(targetBadgeSize); // scale to height
			}
			ctx.drawImage.apply(ctx, badgeDrawImageArgs);
			
			if (gAngScope.BC.imgPathSizesBadge[whichNameForBadge] == targetBadgeSize) {
				can.parentNode.setAttribute('data-badge-scale-word', '=)');
				can.parentNode.removeAttribute('data-badge-scale-from');
			} else if (gAngScope.BC.imgPathSizesBadge[whichNameForBadge] < targetBadgeSize) {
				can.parentNode.setAttribute('data-badge-scale-word', 'up');
				can.parentNode.setAttribute('data-badge-scale-from', gAngScope.BC.imgPathSizesBadge[whichNameForBadge]);
			} else { // if (gAngScope.BC.imgPathSizesBadge[whichNameForBadge] > targetBadgeSize) {
				can.parentNode.setAttribute('data-badge-scale-word', 'dn');
				can.parentNode.setAttribute('data-badge-scale-from', gAngScope.BC.imgPathSizesBadge[whichNameForBadge]);
			}
			
		} else {
			can.parentNode.removeAttribute('data-badge-scale-word');
			can.parentNode.removeAttribute('data-badge-scale-from');
		}
	}
}

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

function whichNameToScaleFromToReachGoal(aSourcesNameSizeObj, aGoalSize, aScalingAlgo) {
	// returns key from aSourcesNameSizeObj
	// note: assumes that all sources are that of square dimensions
	// aSourcesNameSizeObj is a key value pair, where keys are names (full paths for example), and value is (an obj containing key "size"/"width"/"height" with value number OR number)
	// aGoalSize is number
	// aScalingAlgo - it first searches for perfect match, if no perfect found then:
		// 0 - jagged first then blurry - finds the immediate larger in aSourcesNameSizeObj and will scale down, this will give the jagged look. if no larger found, then it will find the immeidate smaller then scale up, giving the blurry look.
		// 1 - blurry first then jagged - finds the immediate smaller in aSourcesNameSizeObj and will scale up, this will give the blurry look. if no smaller found, then it will find the immeidate larger then scale down, giving the jagged look.
	
	var aSourcesNameSizeArr = []; // elemen is [keyName in aSourcesNameSizeObj, square size]
	for (var p in aSourcesNameSizeObj) {
		aSourcesNameSizeArr.push([
			p,
			typeof(aSourcesNameSizeObj[p]) == 'number'
				?
				aSourcesNameSizeObj[p]
				:
				(aSourcesNameSizeObj[p].size || aSourcesNameSizeObj[p].width || aSourcesNameSizeObj[p].height)
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
	
contentMMFromContentWindow_Method2(window).addMessageListener(core.addon.id, bootstrapMsgListener); // framescript comm
document.addEventListener('DOMContentLoaded', onPageReady, false);
document.addEventListener('unload', onPageUnload, false);
window.addEventListener('beforeunload', doOnBeforeUnload, false);